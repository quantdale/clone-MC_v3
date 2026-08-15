/**
 * Deterministic loot-table primitives (change 011).
 *
 * A loot table is immutable ResourceId-identified data evaluated against a typed
 * context and an injected random source. Evaluation returns zero or more stack
 * outputs without directly mutating inventory/world/entity state. Randomness
 * comes only from the caller-provided source, so evaluation is deterministic
 * given identical table/context and source sequence.
 *
 * This change routes every current block-removal output through a loot table
 * while preserving current behavior exactly (one stack per breakable block, plus
 * the deterministic apple drop from leaves).
 */

import { type ResourceId, createResourceId, resourceIdToString } from '../data/ResourceId';
import { Registry } from '../data/Registry';
import { type ItemTypeRegistry, ItemId } from './ItemRegistry';
import type { BlockTypeRegistry } from '../world/BlockRegistry';
import type { StackComponentMap } from './StackDataComponents';

/** Bounds enforced at table validation time. */
export const MAX_ROLLS = 16;
/** Maximum theoretical output (per-table, summed across pools) allowed to finalize. */
export const MAX_TABLE_OUTPUT = 64;

/** A caller-injected source of uniform [0, 1) values. The only randomness allowed. */
export type RandomSource = () => number;

/** Pure predicate over the evaluated context; must not mutate the context. */
export type LootCondition = (ctx: LootContext) => boolean;

/** Typed evaluation context supplied to conditions and entry resolution. */
export interface LootContext {
  /** Legacy numeric id of the block being broken. */
  readonly blockId: number;
  /** Legacy numeric id of the tool in the selected slot, or undefined when empty. */
  readonly toolItemId: number | undefined;
  /** Item registry used to resolve entry resource ids to legacy numeric ids. */
  readonly itemRegistry: ItemTypeRegistry;
  /**
   * Canonical text values of the broken block's state properties (e.g.
   * `{ age: '7' }` for a mature crop), or undefined when the block has no
   * state. Optional and additive (125); absent for legacy/plain blocks.
   */
  readonly properties?: Readonly<Record<string, string>>;
}

/** A single evaluated output to be inserted into the inventory by the caller. */
export interface LootStack {
  /** Legacy numeric item id, suitable for `selector.addItem`. */
  readonly item: number;
  /** Positive integer count. */
  readonly count: number;
  /** Optional validated component data carried on the stack. */
  readonly components?: StackComponentMap;
}

/** A single weighted item output possibility within a pool. */
export interface LootEntry {
  /** Registered item resource id. */
  readonly item: ResourceId;
  /** Finite positive integer selection weight. */
  readonly weight: number;
  /** Positive integer minimum quantity (inclusive). */
  readonly min: number;
  /** Positive integer maximum quantity (inclusive); min === max yields a fixed qty. */
  readonly max: number;
  /** Optional validated component data attached to the dropped stack. */
  readonly components?: StackComponentMap;
  /** Optional pure predicates; the entry is ineligible when any returns false. */
  readonly conditions?: LootCondition[];
}

/** A bounded set of rolls producing entries from a weighted pool. */
export interface LootPool {
  /** Finite positive integer roll count, capped at MAX_ROLLS. */
  readonly rolls: number;
  /** Eligible entries; at least one is required. */
  readonly entries: readonly LootEntry[];
  /** Optional pure predicates; the whole pool is skipped when any returns false. */
  readonly conditions?: LootCondition[];
}

/** An immutable loot table identified by a unique ResourceId. */
export interface LootTable {
  readonly id: ResourceId;
  readonly pools: readonly LootPool[];
}

/** Failure category for loot-table definition validation. */
export type LootTableErrorReason =
  | 'DUPLICATE_ID'
  | 'MISSING_ITEM'
  | 'MISSING_TABLE'
  | 'INVALID_WEIGHT'
  | 'INVALID_ROLLS'
  | 'INVALID_RANGE'
  | 'INVALID_OUTPUT';

/** Thrown when a loot table fails validation before finalization. */
export class LootTableError extends Error {
  readonly reason: LootTableErrorReason;
  readonly identifier: string | undefined;

  constructor(reason: LootTableErrorReason, identifier: string | undefined, detail: string) {
    super(`Loot table error (${reason}): ${detail}`);
    this.name = 'LootTableError';
    this.reason = reason;
    this.identifier = identifier;
  }
}

function isPositiveInteger(value: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function conditionsPass(conditions: LootCondition[] | undefined, ctx: LootContext): boolean {
  if (conditions === undefined) return true;
  for (const condition of conditions) {
    if (!condition(ctx)) return false;
  }
  return true;
}

/**
 * Resolve one entry from eligible entries using weighted selection over the
 * injected random source. A single eligible entry is emitted directly without
 * consuming the source.
 */
function pickEntry(entries: readonly LootEntry[], rng: RandomSource): LootEntry {
  if (entries.length === 1) return entries[0]!;
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1]!;
}

/** Resolve the integer quantity for a chosen entry, sampling the inclusive range. */
function resolveQuantity(entry: LootEntry, rng: RandomSource): number {
  if (entry.min === entry.max) return entry.min;
  return entry.min + Math.floor(rng() * (entry.max - entry.min + 1));
}

/**
 * Evaluate a loot table against a context and injected random source.
 *
 * Evaluation is pure: it returns stack outputs and never mutates the provided
 * inventory/world/context. A pool is skipped when its conditions fail or no entry
 * is eligible for the roll; this yields no output for that roll rather than
 * throwing. Output order follows pool order, and within a pool each roll is
 * resolved independently.
 */
export function evaluate(
  table: LootTable,
  ctx: LootContext,
  rng: RandomSource,
  itemRegistry: ItemTypeRegistry,
): LootStack[] {
  const out: LootStack[] = [];
  for (const pool of table.pools) {
    if (!conditionsPass(pool.conditions, ctx)) continue;
    for (let roll = 0; roll < pool.rolls; roll++) {
      const eligible = pool.entries.filter((entry) => conditionsPass(entry.conditions, ctx));
      if (eligible.length === 0) continue;
      const chosen = pickEntry(eligible, rng);
      const count = resolveQuantity(chosen, rng);
      out.push({
        item: itemRegistry.getByResourceId(chosen.item).id,
        count,
        components: chosen.components,
      });
    }
  }
  return out;
}

/** ResourceId of the loot table backing a block with the given key. */
export function lootTableResourceId(blockKey: string): ResourceId {
  return createResourceId('minecraft', `loot/${blockKey}`);
}

/**
 * Registry of immutable loot tables built on the 003 generic registry core.
 *
 * Construction validates every table (unique id, resolvable item entries, finite
 * positive weights/rolls within bounds, valid inclusive quantity ranges within
 * item stack limits, and a finite maximum output bound) and then finalizes,
 * making tables immutable. A failed construction throws before any table becomes
 * evaluable.
 */
export class LootTableRegistry {
  private readonly inner: Registry<LootTable>;
  private readonly items: ItemTypeRegistry;

  constructor(tables: readonly LootTable[], items: ItemTypeRegistry) {
    this.items = items;
    this.inner = new Registry<LootTable>();
    for (const table of tables) {
      this.validate(table);
      if (this.inner.has(table.id)) {
        throw new LootTableError('DUPLICATE_ID', resourceIdToString(table.id), 'loot table id already registered');
      }
      this.inner.register(table.id, table);
    }
    this.inner.finalize();
  }

  /** Item registry used for entry reference resolution. */
  get itemRegistry(): ItemTypeRegistry {
    return this.items;
  }

  /** Whether the registry has been finalized and can no longer accept mutations. */
  get finalized(): boolean {
    return this.inner.finalized;
  }

  /** Number of registered loot tables. */
  get size(): number {
    return this.inner.size;
  }

  /** Strict lookup by ResourceId. */
  get(id: ResourceId): LootTable {
    return this.inner.get(id);
  }

  /** Optional lookup by ResourceId. */
  getOptional(id: ResourceId): LootTable | undefined {
    return this.inner.getOptional(id);
  }

  /** Whether a loot table ResourceId is registered. */
  has(id: ResourceId): boolean {
    return this.inner.has(id);
  }

  /** All tables in ascending registration order (deterministic). */
  entries(): readonly LootTable[] {
    return this.inner.entries().map((entry) => entry.value);
  }

  private validate(table: LootTable): void {
    let maxOutput = 0;
    for (const pool of table.pools) {
      if (!Number.isInteger(pool.rolls) || pool.rolls <= 0 || pool.rolls > MAX_ROLLS || !Number.isFinite(pool.rolls)) {
        throw new LootTableError(
          'INVALID_ROLLS',
          resourceIdToString(table.id),
          `pool rolls must be an integer in [1, ${MAX_ROLLS}]`,
        );
      }
      if (pool.entries.length === 0) {
        throw new LootTableError('INVALID_OUTPUT', resourceIdToString(table.id), 'pool must declare at least one entry');
      }
      let poolMax = 0;
      for (const entry of pool.entries) {
        if (!this.items.hasByResourceId(entry.item)) {
          throw new LootTableError('MISSING_ITEM', resourceIdToString(entry.item), 'entry references a missing item');
        }
        if (!isPositiveInteger(entry.weight) || !Number.isFinite(entry.weight)) {
          throw new LootTableError('INVALID_WEIGHT', resourceIdToString(table.id), 'entry weight must be a positive integer');
        }
        if (!isPositiveInteger(entry.min) || !Number.isFinite(entry.min)) {
          throw new LootTableError('INVALID_RANGE', resourceIdToString(table.id), 'entry min must be a positive integer');
        }
        if (!isPositiveInteger(entry.max) || !Number.isFinite(entry.max)) {
          throw new LootTableError('INVALID_RANGE', resourceIdToString(table.id), 'entry max must be a positive integer');
        }
        if (entry.min > entry.max) {
          throw new LootTableError('INVALID_RANGE', resourceIdToString(table.id), 'entry min must not exceed max');
        }
        const itemDef = this.items.getByResourceId(entry.item);
        if (entry.max > itemDef.stackSize) {
          throw new LootTableError(
            'INVALID_OUTPUT',
            resourceIdToString(table.id),
            `entry max ${entry.max} exceeds stack size ${itemDef.stackSize}`,
          );
        }
        poolMax = Math.max(poolMax, entry.max);
      }
      maxOutput += pool.rolls * poolMax;
    }
    if (maxOutput > MAX_TABLE_OUTPUT) {
      throw new LootTableError(
        'INVALID_OUTPUT',
        resourceIdToString(table.id),
        `theoretical max output ${maxOutput} exceeds safety bound ${MAX_TABLE_OUTPUT}`,
      );
    }
  }
}

/**
 * Build one loot table per current breakable block, reproducing current output
 * exactly. Each breakable block yields a single fixed-quantity drop of its
 * `dropItem`; leaves additionally drop one apple, matching the current special
 * case. Tables are keyed by the block's resource id (`loot/<blockKey>`) so the
 * interaction system can resolve them from a block definition.
 */
export function buildCurrentLootTables(
  blockRegistry: BlockTypeRegistry,
  itemRegistry: ItemTypeRegistry,
): LootTable[] {
  const appleRid = itemRegistry.getByLegacyId(ItemId.Apple)!.resourceId;
  const wheatRid = itemRegistry.getByLegacyId(ItemId.Wheat)!.resourceId;
  const wheatSeedsRid = itemRegistry.getByLegacyId(ItemId.WheatSeeds)!.resourceId;
  const tables: LootTable[] = [];
  for (const def of blockRegistry.all()) {
    if (!def.breakable || def.dropItem === undefined) continue;
    const pools: LootPool[] = [
      {
        rolls: 1,
        entries: [{ item: def.dropItem, weight: 1, min: 1, max: 1 }],
      },
    ];
    if (def.key === 'leaves') {
      pools.push({
        rolls: 1,
        entries: [{ item: appleRid, weight: 1, min: 1, max: 1 }],
      });
    } else if (def.key === 'wheat') {
      // Crop drops (125): seeds always; wheat only when the broken plant is
      // mature (age 7). Read from the additive `properties` context field so the
      // existing harvest wiring (finishBreak → evaluate) works unchanged.
      pools.length = 0;
      pools.push({
        rolls: 1,
        entries: [{ item: wheatSeedsRid, weight: 1, min: 1, max: 1 }],
      });
      pools.push({
        rolls: 1,
        entries: [
          {
            item: wheatRid,
            weight: 1,
            min: 1,
            max: 1,
            conditions: [(ctx) => ctx.properties?.age === '7'],
          },
        ],
      });
    }
    tables.push({ id: lootTableResourceId(def.key), pools });
  }
  return tables;
}
