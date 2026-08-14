/**
 * Entity-type registry (change 017).
 *
 * An entity type is a ResourceId-identified, immutable data record describing one entity kind with
 * a category and optional descriptive metadata (health/attack bounds, summonable/persistent flags).
 * An `EntityRegistry` validates and finalizes a set of definitions on the 003 generic registry core
 * and assigns dense deterministic runtime ids. `createDefaultEntityRegistry()` provides a
 * representative set of vanilla-like entities.
 *
 * 017 is additive and behavior-free: no AI/behavior is attached and no consumer is migrated; this
 * is the typed data foundation for future spawning and serialization.
 */

import { type ResourceId, createResourceId, resourceIdToString } from './ResourceId';
import { Registry } from './Registry';

/** High-level grouping of an entity kind. */
export type EntityCategory =
  | 'MONSTER'
  | 'CREATURE'
  | 'AMBIENT'
  | 'WATER_CREATURE'
  | 'WATER_AMBIENT'
  | 'PROJECTILE'
  | 'OTHER';

/** An immutable data record describing one entity type. */
export interface EntityTypeDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  readonly category: EntityCategory;
  /** Max health in half-hearts; finite and > 0 when present. */
  readonly health?: number;
  /** Melee attack damage in half-hearts; finite and >= 0 when present. */
  readonly attackDamage?: number;
  /** Whether the entity can be summoned via commands/spawns (default false). */
  readonly isSummonable?: boolean;
  /** Whether the entity persists across reloads (default false). */
  readonly isPersistent?: boolean;
}

/** Failure category for entity-type validation. */
export type EntityErrorReason = 'DUPLICATE_ID' | 'INVALID_VALUE' | 'INVALID_FLAG';

/** Thrown when an entity-type definition or registry operation fails validation. */
export class EntityError extends Error {
  readonly reason: EntityErrorReason;
  readonly identifier: string | undefined;

  constructor(reason: EntityErrorReason, identifier: string | undefined, detail: string) {
    super(`Entity error (${reason}): ${detail}`);
    this.name = 'EntityError';
    this.reason = reason;
    this.identifier = identifier;
  }
}

const KNOWN_CATEGORIES: readonly EntityCategory[] = [
  'MONSTER', 'CREATURE', 'AMBIENT', 'WATER_CREATURE', 'WATER_AMBIENT', 'PROJECTILE', 'OTHER',
];

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function validate(def: EntityTypeDefinition): void {
  if (!KNOWN_CATEGORIES.includes(def.category)) {
    throw new EntityError('INVALID_FLAG', def.key, `unknown entity category: ${def.category}`);
  }
  if (def.health !== undefined && (!isFiniteNumber(def.health) || def.health <= 0)) {
    throw new EntityError('INVALID_VALUE', def.key, 'health must be a finite number > 0');
  }
  if (def.attackDamage !== undefined && (!isFiniteNumber(def.attackDamage) || def.attackDamage < 0)) {
    throw new EntityError('INVALID_VALUE', def.key, 'attackDamage must be a finite number >= 0');
  }
}

/**
 * Registry of entity-type definitions built on the 003 generic registry core.
 *
 * Construction validates every definition (unique id, known category, finite bounded
 * health/attackDamage), assigns dense deterministic runtime ids by registration order, and
 * finalizes before any lookup.
 */
export class EntityRegistry {
  private readonly inner: Registry<EntityTypeDefinition>;
  private readonly byKeyMap: Map<string, EntityTypeDefinition> = new Map();

  constructor(definitions: EntityTypeDefinition[]) {
    this.inner = new Registry<EntityTypeDefinition>();
    for (const def of definitions) {
      validate(def);
      if (this.inner.has(def.id)) {
        throw new EntityError('DUPLICATE_ID', resourceIdToString(def.id), 'entity id already registered');
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

  /** Number of registered entity-type definitions. */
  get size(): number {
    return this.inner.size;
  }

  /** Strict lookup by ResourceId. */
  get(id: ResourceId): EntityTypeDefinition {
    return this.inner.get(id);
  }

  /** Optional lookup by ResourceId. */
  getOptional(id: ResourceId): EntityTypeDefinition | undefined {
    return this.inner.getOptional(id);
  }

  /** Whether an entity ResourceId is registered. */
  has(id: ResourceId): boolean {
    return this.inner.has(id);
  }

  /** Lookup by short key string (e.g. `'zombie'`). Undefined when absent. */
  getByKey(key: string): EntityTypeDefinition | undefined {
    return this.byKeyMap.get(key);
  }

  /** Strict lookup by dense runtime id assigned at construction. */
  getByRuntimeId(runtimeId: number): EntityTypeDefinition {
    return this.inner.getByRuntimeId(runtimeId);
  }

  /** Resolve the runtime id assigned to a registered ResourceId. Throws when absent. */
  getRuntimeId(id: ResourceId): number {
    return this.inner.getRuntimeId(id);
  }

  /** All definitions in ascending registration order (deterministic). */
  entries(): readonly EntityTypeDefinition[] {
    return this.inner.entries().map((entry) => entry.value);
  }
}

const rid = (path: string): ResourceId => createResourceId('minecraft', `entity_type/${path}`);

function def(
  key: string,
  category: EntityCategory,
  health: number | undefined,
  attackDamage: number | undefined,
  isSummonable = true,
  isPersistent = false,
): EntityTypeDefinition {
  return {
    id: rid(key),
    key,
    name: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    category,
    health,
    attackDamage,
    isSummonable,
    isPersistent,
  };
}

/**
 * Default entity registry with a representative, vanilla-like set. Monsters carry health/attack
 * metadata; passive creatures carry health only; `item` is a non-living OTHER placeholder. No
 * AI/behavior is attached.
 */
export function createDefaultEntityRegistry(): EntityRegistry {
  return new EntityRegistry([
    def('zombie', 'MONSTER', 20, 3, true, true),
    def('skeleton', 'MONSTER', 20, 2, true, true),
    def('creeper', 'MONSTER', 20, 0, true, true),
    def('spider', 'MONSTER', 16, 2, true, true),
    def('pig', 'CREATURE', 10, 0, true, true),
    def('cow', 'CREATURE', 10, 0, true, true),
    def('chicken', 'CREATURE', 4, 0, true, true),
    def('sheep', 'CREATURE', 8, 0, true, true),
    def('squid', 'WATER_CREATURE', 10, 0, true, true),
    def('bat', 'AMBIENT', 6, 0, true, false),
    def('item', 'OTHER', undefined, undefined, false, false),
  ]);
}
