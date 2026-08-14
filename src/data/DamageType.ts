/**
 * Data-driven damage-type model (change 013).
 *
 * A damage type is a ResourceId-identified, immutable record describing one source
 * of damage: its category flags and the finite parameters governing how it is
 * applied (fall scaling, periodic interval/amount, or starvation amount). A
 * `DamageTypeRegistry` validates and finalizes a set of definitions on the 003
 * generic registry core. `createDefaultDamageTypeRegistry()` encodes the current
 * fall/drown/lava/starvation numbers so `SurvivalSystem` can route through them
 * without changing observable behavior.
 */

import { type ResourceId, createResourceId, resourceIdToString } from './ResourceId';
import { Registry } from './Registry';

/** Category/behavior tag attached to a damage type. */
export type DamageTypeFlag =
  | 'BYPASS_ARMOR' // ignores future armor reduction
  | 'FIRE' // fire/lava category
  | 'DROWNING' // drowning category
  | 'FALL' // fall category
  | 'STARVATION' // hunger category
  | 'ENVIRONMENTAL'; // source is the world, not an entity

/** How a damage type is applied over time. */
export type DamageTypeKind = 'fall' | 'periodic' | 'starvation';

/** An immutable data record describing one damage source. */
export interface DamageTypeDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  readonly flags: readonly DamageTypeFlag[];
  readonly kind: DamageTypeKind;
  /** Damage per application (unused for `fall`, which scales instead). */
  readonly amount: number;
  /** Seconds between periodic ticks (`periodic` only). */
  readonly interval?: number;
  /** Safe fall distance before damage is applied (`fall` only). */
  readonly fallThreshold?: number;
  /** HP lost per block above the threshold (`fall` only). */
  readonly fallScaling?: number;
}

/** Failure category for damage-type validation. */
export type DamageTypeErrorReason =
  | 'DUPLICATE_ID'
  | 'INVALID_VALUE'
  | 'INVALID_FLAG'
  | 'INVALID_DEFINITION';

/** Thrown when a damage-type definition or registry operation fails validation. */
export class DamageTypeError extends Error {
  readonly reason: DamageTypeErrorReason;
  readonly identifier: string | undefined;

  constructor(reason: DamageTypeErrorReason, identifier: string | undefined, detail: string) {
    super(`DamageType error (${reason}): ${detail}`);
    this.name = 'DamageTypeError';
    this.reason = reason;
    this.identifier = identifier;
  }
}

const KNOWN_FLAGS: readonly DamageTypeFlag[] = [
  'BYPASS_ARMOR',
  'FIRE',
  'DROWNING',
  'FALL',
  'STARVATION',
  'ENVIRONMENTAL',
];

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function validate(def: DamageTypeDefinition): void {
  if (!isFiniteNumber(def.amount) || def.amount < 0) {
    throw new DamageTypeError('INVALID_VALUE', def.key, 'amount must be a finite non-negative number');
  }
  if (def.interval !== undefined && (!isFiniteNumber(def.interval) || def.interval <= 0)) {
    throw new DamageTypeError('INVALID_VALUE', def.key, 'interval must be a finite positive number');
  }
  if (def.fallThreshold !== undefined && !isFiniteNumber(def.fallThreshold)) {
    throw new DamageTypeError('INVALID_VALUE', def.key, 'fallThreshold must be finite');
  }
  if (def.fallScaling !== undefined && !isFiniteNumber(def.fallScaling)) {
    throw new DamageTypeError('INVALID_VALUE', def.key, 'fallScaling must be finite');
  }
  for (const flag of def.flags) {
    if (!KNOWN_FLAGS.includes(flag)) {
      throw new DamageTypeError('INVALID_FLAG', def.key, `unknown damage type flag: ${String(flag)}`);
    }
  }
  if (def.kind === 'fall') {
    if (!isFiniteNumber(def.fallThreshold) || !isFiniteNumber(def.fallScaling)) {
      throw new DamageTypeError('INVALID_DEFINITION', def.key, 'fall type requires finite fallThreshold and fallScaling');
    }
  } else if (def.kind === 'periodic') {
    if (def.interval === undefined || !isFiniteNumber(def.interval) || def.interval <= 0 || !isFiniteNumber(def.amount) || def.amount < 0) {
      throw new DamageTypeError(
        'INVALID_DEFINITION',
        def.key,
        'periodic type requires a positive interval and a non-negative amount',
      );
    }
  } else if (def.kind === 'starvation') {
    if (!isFiniteNumber(def.amount) || def.amount < 0) {
      throw new DamageTypeError('INVALID_DEFINITION', def.key, 'starvation type requires a non-negative amount');
    }
  } else {
    throw new DamageTypeError('INVALID_DEFINITION', def.key, `unknown damage type kind: ${String(def.kind)}`);
  }
}

/**
 * Registry of damage-type definitions built on the 003 generic registry core.
 *
 * Construction validates every definition (unique id, known flags, finite
 * non-negative parameters, kind-required fields) and then finalizes, making
 * definitions immutable. A failed construction throws before any type becomes
 * resolvable.
 */
export class DamageTypeRegistry {
  private readonly inner: Registry<DamageTypeDefinition>;

  constructor(definitions: DamageTypeDefinition[]) {
    this.inner = new Registry<DamageTypeDefinition>();
    for (const def of definitions) {
      validate(def);
      if (this.inner.has(def.id)) {
        throw new DamageTypeError('DUPLICATE_ID', resourceIdToString(def.id), 'damage type id already registered');
      }
      this.inner.register(def.id, def);
    }
    this.inner.finalize();
  }

  /** Whether the registry has been finalized and can no longer accept mutations. */
  get finalized(): boolean {
    return this.inner.finalized;
  }

  /** Number of registered damage-type definitions. */
  get size(): number {
    return this.inner.size;
  }

  /** Strict lookup by ResourceId. */
  get(id: ResourceId): DamageTypeDefinition {
    return this.inner.get(id);
  }

  /** Optional lookup by ResourceId. */
  getOptional(id: ResourceId): DamageTypeDefinition | undefined {
    return this.inner.getOptional(id);
  }

  /** Whether a damage-type ResourceId is registered. */
  has(id: ResourceId): boolean {
    return this.inner.has(id);
  }

  /** All definitions in ascending registration order (deterministic). */
  entries(): readonly DamageTypeDefinition[] {
    return this.inner.entries().map((entry) => entry.value);
  }
}

const rid = (path: string): ResourceId => createResourceId('minecraft', `damage/${path}`);

/**
 * Default damage-type registry encoding the current environmental damage numbers
 * so `SurvivalSystem` reproduces existing fall/drown/lava/starvation semantics
 * exactly when routed through this data.
 */
export function createDefaultDamageTypeRegistry(): DamageTypeRegistry {
  return new DamageTypeRegistry([
    {
      id: rid('fall'),
      key: 'fall',
      name: 'Fall',
      flags: ['FALL', 'ENVIRONMENTAL'],
      kind: 'fall',
      amount: 0,
      fallThreshold: 3,
      fallScaling: 1.5,
    },
    {
      id: rid('drowning'),
      key: 'drowning',
      name: 'Drowning',
      flags: ['DROWNING', 'ENVIRONMENTAL'],
      kind: 'periodic',
      amount: 2,
      interval: 1.5,
    },
    {
      id: rid('lava'),
      key: 'lava',
      name: 'Lava',
      flags: ['FIRE', 'ENVIRONMENTAL'],
      kind: 'periodic',
      amount: 4,
      interval: 0.7,
    },
    {
      id: rid('starvation'),
      key: 'starvation',
      name: 'Starvation',
      flags: ['STARVATION', 'ENVIRONMENTAL'],
      kind: 'starvation',
      amount: 1,
    },
  ]);
}

/**
 * Resolve a damage type by its stable key, failing fast when a required default
 * type is missing so misconfigured registries surface at construction rather than
 * silently skipping damage.
 */
export function requireDamageType(registry: DamageTypeRegistry, key: string): DamageTypeDefinition {
  const found = registry.entries().find((def) => def.key === key);
  if (!found) {
    throw new DamageTypeError('INVALID_DEFINITION', key, `required default damage type missing: ${key}`);
  }
  return found;
}
