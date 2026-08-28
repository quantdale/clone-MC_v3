/**
 * Dispenser behavior (168): the third and final item-moving redstone consumer, and the first place a
 * *behavior table* (item -> action) is needed. A dispenser looks like a dropper for ordinary items
 * (pushing into a faced container via 167's `ejectFromDropper`, or dropping into the world), but for
 * a special class of items it performs an *action* instead — firing an arrow, throwing a snowball,
 * hatching an egg — rather than emitting the raw item.
 *
 * The special-item set is **data-driven**: `DISPENSER_ITEM_BEHAVIORS` maps an item resource id to a
 * `DispenserItemBehavior`, so adding a new dispenser action is a table row, not a code branch. The
 * actual spawn/fire is a future wiring change; this module only decides *what* the dispenser does and
 * consumes one item, returning a `DispenserAction` descriptor (the plain-item paths reuse 167's
 * core, so a dispenser with a non-special item is behaviorally identical to a dropper).
 *
 * `dispenserOutputPosition` reuses 154's `offsetInDirection` (a `DispenserFacing` is the same
 * five-way subset 166/167 use — no `'up'`). `dispenseFromDispenser` is position-agnostic.
 */
import { offsetInDirection } from './RedstoneSignal';
import type { ScheduledTick, ScheduledTickQueue } from './ScheduledTickQueue';
import type { MenuSlot } from '../inventory/MenuTransaction';
import { ejectFromDropper, type DroppedItem } from './DropperEject';

/** A dispenser's facing: five-way, since `'up'` is never a legal output direction. */
export type DispenserFacing = 'down' | 'north' | 'south' | 'east' | 'west';

/** Ticks between dispense attempts (mirrors 166/167's cadence for the 047 bridge). */
export const DISPENSER_EJECT_COOLDOWN_TICKS = 8;

/** What a dispenser does with a special item instead of dropping/pushing it. */
export type DispenserBehaviorKind = 'shoot_projectile' | 'spawn_entity' | 'place_block';

/** A data-driven behavior entry for one special item. */
export interface DispenserItemBehavior {
  readonly item: string;
  readonly behavior: DispenserBehaviorKind;
  /** For `shoot_projectile`: the projectile kind fired (e.g. `'arrow'`). */
  readonly projectile?: string;
  /** For `spawn_entity`: the entity kind spawned (e.g. `'chicken'`). */
  readonly entity?: string;
  /** For `place_block`: the block placed (e.g. `'fire'`). */
  readonly block?: string;
}

/**
 * The "initial items" dispenser behavior table (data-driven and extensible). Plain items not
 * present here fall through to the dropper-style push/drop behavior. This is the initial vanilla
 * set; more rows can be appended without touching `dispenseFromDispenser`.
 */
export const DISPENSER_ITEM_BEHAVIORS: readonly DispenserItemBehavior[] = [
  { item: 'minecraft:arrow', behavior: 'shoot_projectile', projectile: 'arrow' },
  { item: 'minecraft:snowball', behavior: 'shoot_projectile', projectile: 'snowball' },
  { item: 'minecraft:egg', behavior: 'spawn_entity', entity: 'chicken' },
  { item: 'minecraft:fire_charge', behavior: 'shoot_projectile', projectile: 'fireball' },
  { item: 'minecraft:fireball', behavior: 'shoot_projectile', projectile: 'fireball' },
  { item: 'minecraft:experience_bottle', behavior: 'spawn_entity', entity: 'xp_orb' },
  { item: 'minecraft:flint_and_steel', behavior: 'place_block', block: 'fire' },
];

/** Look up the dispenser behavior for an item, or `null` if it is a plain (dropper-style) item. */
export function getDispenserBehavior(item: string | null): DispenserItemBehavior | null {
  if ( notString(item)) return null;
  for (const entry of DISPENSER_ITEM_BEHAVIORS) {
    if (entry.item === item) return entry;
  }
  return null;
}

function notString(v: unknown): v is null {
  return typeof v !== 'string';
}

/** The outcome of one dispenser activation. */
export type DispenserAction =
  | { kind: 'behavior'; behavior: DispenserItemBehavior; source: MenuSlot[] }
  | { kind: 'container'; moved: true; source: MenuSlot[]; destination: MenuSlot[] }
  | { kind: 'drop'; moved: true; source: MenuSlot[]; drop: DroppedItem }
  | { kind: 'none'; moved: false; source: MenuSlot[] };

/**
 * Activate a dispenser from `source`:
 * - a **special** item (in `DISPENSER_ITEM_BEHAVIORS`) → `kind: 'behavior'` (consume one, carry the
 *   behavior descriptor); the facing direction / destination are irrelevant to the action itself;
 * - a **plain** item → delegate to 167's `ejectFromDropper` (`container` / `drop` / `none`);
 * - an empty `source` → `kind: 'none'`.
 */
export function dispenseFromDispenser(
  source: readonly MenuSlot[],
  destinationContainer: readonly MenuSlot[] | null,
  dropPosition: readonly [number, number, number],
): DispenserAction {
  const sourceSlots = source.map((s) => ({ ...s }));

  const sourceIndex = sourceSlots.findIndex((s) => s.item !== null && s.count > 0);
  if (sourceIndex === -1) {
    return { kind: 'none', moved: false, source: sourceSlots };
  }
  const sourceSlot = sourceSlots[sourceIndex]!;
  const item = sourceSlot.item!;

  const behavior = getDispenserBehavior(item);
  if (behavior !== null) {
    // Special item: perform the behavior and consume exactly one.
    sourceSlot.count -= 1;
    if (sourceSlot.count === 0) {
      sourceSlot.item = null;
    }
    return { kind: 'behavior', behavior, source: sourceSlots };
  }

  // Plain item: identical to a dropper.
  return ejectFromDropper(sourceSlots, destinationContainer, dropPosition) as DispenserAction;
}

/** Whether a dispenser activates right now: exactly the inverse of `powered` (same lockout as 166/167). */
export function dispenserShouldTransfer(powered: boolean): boolean {
  return !powered;
}

/** The position a dispenser ejects/acts into: one block in its `facing` direction. */
export function dispenserOutputPosition(
  x: number,
  y: number,
  z: number,
  facing: DispenserFacing,
): [number, number, number] {
  return offsetInDirection(x, y, z, facing);
}

/** Schedule the next dispense attempt `DISPENSER_EJECT_COOLDOWN_TICKS` after `currentTick`. */
export function scheduleDispenserEject(
  queue: ScheduledTickQueue,
  x: number,
  y: number,
  z: number,
  currentTick: number,
): void {
  const due = Number.isFinite(currentTick) ? currentTick : 0;
  queue.schedule(x, y, z, due + DISPENSER_EJECT_COOLDOWN_TICKS);
}

/** Pop every dispenser ejection due at or before `nowTick`, in 047's deterministic order. */
export function dueDispenserEjects(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[] {
  return queue.tick(nowTick);
}

/** Project a dispenser's full state into the property record `DISPENSER_SCHEMA` enumerates. */
export function dispenserStateProperties(
  facing: DispenserFacing,
  enabled: boolean,
): Record<string, boolean | string> {
  return { facing, enabled };
}
