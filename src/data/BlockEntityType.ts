/**
 * Block-entity type registry (change 018).
 *
 * A block-entity type is a ResourceId-identified, immutable data record describing one tile entity
 * kind (chest, furnace, sign, ...) with optional inventory size and a tickable flag. A
 * `BlockEntityRegistry` validates and finalizes a set of definitions on the 003 generic registry
 * core. `BlockEntityCompatibility` declares which block keys may host which block-entity type keys,
 * validated against the registry. `createDefaultBlockEntityRegistry()` and
 * `createDefaultBlockEntityCompatibility()` provide representative defaults.
 *
 * 018 is additive and behavior-free: no storage/UI/dispatch is attached and no consumer is migrated;
 * this is the typed data foundation for future block-entity systems.
 */

import { type ResourceId, createResourceId, resourceIdToString } from './ResourceId';
import { Registry } from './Registry';

/** An immutable data record describing one block-entity type. */
export interface BlockEntityTypeDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  /** Inventory slot count; finite and > 0 when present. */
  readonly inventorySize?: number;
  /** Whether the block entity ticks each game step (e.g. furnace, hopper, spawner). */
  readonly tickable?: boolean;
}

/** Failure category for block-entity validation. */
export type BlockEntityErrorReason = 'DUPLICATE_ID' | 'INVALID_VALUE' | 'INVALID_REFERENCE';

/** Thrown when a block-entity definition or compatibility declaration fails validation. */
export class BlockEntityError extends Error {
  readonly reason: BlockEntityErrorReason;
  readonly identifier: string | undefined;

  constructor(reason: BlockEntityErrorReason, identifier: string | undefined, detail: string) {
    super(`BlockEntity error (${reason}): ${detail}`);
    this.name = 'BlockEntityError';
    this.reason = reason;
    this.identifier = identifier;
  }
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function validate(def: BlockEntityTypeDefinition): void {
  if (def.inventorySize !== undefined && (!isFiniteNumber(def.inventorySize) || def.inventorySize <= 0)) {
    throw new BlockEntityError('INVALID_VALUE', def.key, 'inventorySize must be a finite number > 0');
  }
}

/**
 * Registry of block-entity-type definitions built on the 003 generic registry core.
 *
 * Construction validates every definition (unique id, finite positive inventorySize) and finalizes
 * before any lookup.
 */
export class BlockEntityRegistry {
  private readonly inner: Registry<BlockEntityTypeDefinition>;
  private readonly byKeyMap: Map<string, BlockEntityTypeDefinition> = new Map();

  constructor(definitions: BlockEntityTypeDefinition[]) {
    this.inner = new Registry<BlockEntityTypeDefinition>();
    for (const def of definitions) {
      validate(def);
      if (this.inner.has(def.id)) {
        throw new BlockEntityError('DUPLICATE_ID', resourceIdToString(def.id), 'block entity id already registered');
      }
      this.inner.register(def.id, def);
      this.byKeyMap.set(def.key, def);
    }
    this.inner.finalize();
  }

  /** Whether the registry has been finalized and can no longer accept mutations. */
  get finalized(): boolean {
    return this.inner.finalized;
  }

  /** Number of registered block-entity-type definitions. */
  get size(): number {
    return this.inner.size;
  }

  /** Strict lookup by ResourceId. */
  get(id: ResourceId): BlockEntityTypeDefinition {
    return this.inner.get(id);
  }

  /** Lookup by short key string (e.g. `'chest'`). Undefined when absent. */
  getByKey(key: string): BlockEntityTypeDefinition | undefined {
    return this.byKeyMap.get(key);
  }

  /** Whether a block-entity key is registered. */
  has(key: string): boolean {
    return this.byKeyMap.has(key);
  }

  /** All definitions in ascending registration order (deterministic). */
  entries(): readonly BlockEntityTypeDefinition[] {
    return this.inner.entries().map((entry) => entry.value);
  }
}

/** Declaration mapping block keys to the block-entity type key they may host. */
export interface BlockEntityCompatibilityDeclaration {
  readonly mappings: Readonly<Record<string, string>>;
}

/**
 * Block→block-entity compatibility, validated against a {@link BlockEntityRegistry}.
 *
 * Construction fails (atomically) if any mapped type key is absent from the registry.
 */
export class BlockEntityCompatibility {
  private readonly byBlock: Map<string, BlockEntityTypeDefinition> = new Map();

  constructor(registry: BlockEntityRegistry, declaration: BlockEntityCompatibilityDeclaration) {
    for (const [blockKey, typeKey] of Object.entries(declaration.mappings)) {
      const type = registry.getByKey(typeKey);
      if (type === undefined) {
        throw new BlockEntityError('INVALID_REFERENCE', blockKey, `block '${blockKey}' maps to unknown block-entity type '${typeKey}'`);
      }
      this.byBlock.set(blockKey, type);
    }
  }

  /** The block-entity type a block key hosts, or undefined when undeclared. */
  getBlockEntityTypeForBlock(blockKey: string): BlockEntityTypeDefinition | undefined {
    return this.byBlock.get(blockKey);
  }

  /** Whether the given block key is declared to host the given block-entity type key. */
  isCompatible(blockKey: string, typeKey: string): boolean {
    const type = this.byBlock.get(blockKey);
    return type !== undefined && type.key === typeKey;
  }
}

const rid = (path: string): ResourceId => createResourceId('minecraft', `block_entity_type/${path}`);

function def(key: string, inventorySize: number | undefined, tickable: boolean): BlockEntityTypeDefinition {
  return {
    id: rid(key),
    key,
    name: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    inventorySize,
    tickable,
  };
}

/**
 * Default block-entity registry with a representative, vanilla-like set. Chests/dispensers/droppers
 * carry inventory sizes; furnaces/hoppers/spawner are tickable. No storage/UI/dispatch is attached.
 */
export function createDefaultBlockEntityRegistry(): BlockEntityRegistry {
  return new BlockEntityRegistry([
    def('chest', 27, false),
    def('trapped_chest', 27, false),
    def('furnace', undefined, true),
    def('blast_furnace', undefined, true),
    def('smoker', undefined, true),
    def('hopper', 5, true),
    def('dispenser', 9, false),
    def('dropper', 9, false),
    def('sign', undefined, false),
    def('mob_spawner', undefined, true),
  ]);
}

/**
 * Default block→block-entity compatibility. Each block key maps to its matching type key.
 */
export function createDefaultBlockEntityCompatibility(registry: BlockEntityRegistry): BlockEntityCompatibility {
  const mappings: Record<string, string> = {};
  for (const type of registry.entries()) {
    mappings[type.key] = type.key;
  }
  // Some blocks share a type (example: oak_sign/hanging_sign both host a sign block entity).
  mappings['oak_sign'] = 'sign';
  mappings['hanging_sign'] = 'sign';
  return new BlockEntityCompatibility(registry, { mappings });
}
