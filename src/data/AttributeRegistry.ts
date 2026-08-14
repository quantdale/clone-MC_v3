/**
 * Deterministic attribute model (change 012).
 *
 * An attribute type defines a numeric domain with finite minimum/default/maximum
 * values. A per-instance `AttributeInstance` stores one finite base value plus a
 * set of uniquely identified immutable modifiers and computes the effective value
 * deterministically. Modifiers use one of three explicit operations; evaluation
 * is order-independent for commutative stages and deterministic (by modifier id)
 * for the multiplicative stage. The final effective value is clamped to the
 * attribute range.
 *
 * 012 is additive: it defines the model and registry only. No gameplay consumer
 * (player/entity/equipment/effect) is migrated to it yet.
 */

import { type ResourceId, createResourceId, resourceIdToString } from './ResourceId';
import { Registry } from './Registry';

/** One of the three supported modifier operations. */
export type AttributeOperation = 'ADD_VALUE' | 'ADD_BASE_FRACTION' | 'MULTIPLY_TOTAL';

/** A registered attribute type: a numeric domain keyed by ResourceId. */
export interface AttributeDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  /** Finite lower bound of the effective value. */
  readonly min: number;
  /** Finite default base value; min <= default <= max. */
  readonly default: number;
  /** Finite upper bound of the effective value. */
  readonly max: number;
}

/** An immutable modifier identified by a unique ResourceId within one instance. */
export interface Modifier {
  readonly id: ResourceId;
  readonly operation: AttributeOperation;
  /** Finite amount applied per the operation's rule. */
  readonly amount: number;
}

/** Failure category for attribute definition/instance validation. */
export type AttributeErrorReason =
  | 'DUPLICATE_ID'
  | 'DUPLICATE_MODIFIER'
  | 'MISSING_ID'
  | 'INVALID_RANGE'
  | 'INVALID_VALUE'
  | 'INVALID_OPERATION';

/** Thrown when an attribute definition or instance operation fails validation. */
export class AttributeError extends Error {
  readonly reason: AttributeErrorReason;
  readonly identifier: string | undefined;

  constructor(reason: AttributeErrorReason, identifier: string | undefined, detail: string) {
    super(`Attribute error (${reason}): ${detail}`);
    this.name = 'AttributeError';
    this.reason = reason;
    this.identifier = identifier;
  }
}

function isFiniteNumber(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidOperation(op: string): op is AttributeOperation {
  return op === 'ADD_VALUE' || op === 'ADD_BASE_FRACTION' || op === 'MULTIPLY_TOTAL';
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Registry of attribute definitions built on the 003 generic registry core.
 *
 * Construction validates every definition (unique id, finite ordered range) and
 * then finalizes, making definitions immutable. A failed construction throws
 * before any attribute becomes resolvable.
 */
export class AttributeRegistry {
  private readonly inner: Registry<AttributeDefinition>;

  constructor(definitions: AttributeDefinition[]) {
    this.inner = new Registry<AttributeDefinition>();
    for (const def of definitions) {
      this.validate(def);
      if (this.inner.has(def.id)) {
        throw new AttributeError('DUPLICATE_ID', resourceIdToString(def.id), 'attribute id already registered');
      }
      this.inner.register(def.id, def);
    }
    this.inner.finalize();
  }

  /** Whether the registry has been finalized and can no longer accept mutations. */
  get finalized(): boolean {
    return this.inner.finalized;
  }

  /** Number of registered attribute definitions. */
  get size(): number {
    return this.inner.size;
  }

  /** Strict lookup by ResourceId. */
  get(id: ResourceId): AttributeDefinition {
    return this.inner.get(id);
  }

  /** Optional lookup by ResourceId. */
  getOptional(id: ResourceId): AttributeDefinition | undefined {
    return this.inner.getOptional(id);
  }

  /** Whether an attribute ResourceId is registered. */
  has(id: ResourceId): boolean {
    return this.inner.has(id);
  }

  /** All definitions in ascending registration order (deterministic). */
  entries(): readonly AttributeDefinition[] {
    return this.inner.entries().map((entry) => entry.value);
  }

  private validate(def: AttributeDefinition): void {
    if (!isFiniteNumber(def.min) || !isFiniteNumber(def.default) || !isFiniteNumber(def.max)) {
      throw new AttributeError('INVALID_RANGE', resourceIdToString(def.id), 'attribute bounds must be finite');
    }
    if (def.min > def.default || def.default > def.max) {
      throw new AttributeError(
        'INVALID_RANGE',
        resourceIdToString(def.id),
        `attribute bounds must satisfy min <= default <= max (got ${def.min} <= ${def.default} <= ${def.max})`,
      );
    }
  }
}

/**
 * A single mutable attribute instance: one finite base value plus a set of
 * uniquely identified modifiers. The effective value is computed deterministically
 * and clamped to the attribute domain. Computed values are cached and invalidated
 * on any base/modifier change.
 */
export class AttributeInstance {
  private readonly definition: AttributeDefinition;
  private base: number;
  private readonly modifiers = new Map<string, Modifier>();
  private cachedValue: number | undefined;
  private dirty = true;

  constructor(definition: AttributeDefinition, base?: number) {
    this.definition = definition;
    const initial = base ?? definition.default;
    // A non-finite base (including a non-finite default) is a value error, checked
    // before the defensive definition-bounds guard below.
    if (!isFiniteNumber(initial)) {
      throw new AttributeError('INVALID_VALUE', resourceIdToString(definition.id), 'base value must be finite');
    }
    if (!isFiniteNumber(definition.min) || !isFiniteNumber(definition.default) || !isFiniteNumber(definition.max)) {
      throw new AttributeError('INVALID_RANGE', resourceIdToString(definition.id), 'attribute bounds must be finite');
    }
    this.base = initial;
  }

  /** The attribute definition this instance is bound to. */
  get attribute(): AttributeDefinition {
    return this.definition;
  }

  /** Current finite base value (not clamped; only the effective value is clamped). */
  get baseValue(): number {
    return this.base;
  }

  /** The modifiers currently applied to this instance, in no guaranteed order. */
  get modifiersList(): readonly Modifier[] {
    return [...this.modifiers.values()];
  }

  /** Number of modifiers applied. */
  get modifierCount(): number {
    return this.modifiers.size;
  }

  /**
   * Set the base value. Only finite values are accepted; the value is retained
   * unclamped (clamping happens at effective-value calculation).
   */
  setBase(value: number): void {
    if (!isFiniteNumber(value)) {
      throw new AttributeError('INVALID_VALUE', resourceIdToString(this.definition.id), 'base value must be finite');
    }
    if (value === this.base) return;
    this.base = value;
    this.dirty = true;
  }

  /**
   * Add a modifier. A duplicate modifier id fails atomically without replacing the
   * existing modifier or disturbing other modifiers.
   */
  addModifier(modifier: Modifier): void {
    if (!isFiniteNumber(modifier.amount)) {
      throw new AttributeError('INVALID_VALUE', resourceIdToString(modifier.id), 'modifier amount must be finite');
    }
    if (!isValidOperation(modifier.operation)) {
      throw new AttributeError('INVALID_OPERATION', resourceIdToString(modifier.id), `unknown operation: ${modifier.operation}`);
    }
    const key = resourceIdToString(modifier.id);
    if (this.modifiers.has(key)) {
      throw new AttributeError('DUPLICATE_MODIFIER', key, 'modifier id already present on this instance');
    }
    this.modifiers.set(key, { id: modifier.id, operation: modifier.operation, amount: modifier.amount });
    this.dirty = true;
  }

  /** Remove a modifier by id. Returns false when the id is not present. */
  removeModifier(id: ResourceId): boolean {
    const key = resourceIdToString(id);
    if (!this.modifiers.has(key)) return false;
    this.modifiers.delete(key);
    this.dirty = true;
    return true;
  }

  /** Remove all modifiers from the instance. */
  clearModifiers(): void {
    if (this.modifiers.size === 0) return;
    this.modifiers.clear();
    this.dirty = true;
  }

  /**
   * The deterministically computed, range-clamped effective value. Cached until
   * the next base/modifier mutation.
   */
  get value(): number {
    if (this.dirty || this.cachedValue === undefined) {
      this.cachedValue = this.compute();
      this.dirty = false;
    }
    return this.cachedValue;
  }

  /** Recompute the effective value per the documented formula. */
  private compute(): number {
    const { min, max } = this.definition;
    let value = this.base;
    let addValue = 0;
    let baseFraction = 0;
    const multiplies: Modifier[] = [];
    for (const modifier of this.modifiers.values()) {
      if (modifier.operation === 'ADD_VALUE') {
        addValue += modifier.amount;
      } else if (modifier.operation === 'ADD_BASE_FRACTION') {
        baseFraction += modifier.amount;
      } else {
        multiplies.push(modifier);
      }
    }
    // ADD_VALUE and ADD_BASE_FRACTION contributions are order-independent (summation).
    value += addValue;
    value += this.base * baseFraction;
    // MULTIPLY_TOTAL is applied in deterministic modifier-id order.
    multiplies.sort((a, b) => resourceIdToString(a.id).localeCompare(resourceIdToString(b.id)));
    for (const modifier of multiplies) {
      value *= 1 + modifier.amount;
    }
    return clamp(value, min, max);
  }
}

const rid = (path: string): ResourceId => createResourceId('minecraft', path);

/**
 * Default generic attribute registry. These are standard Minecraft generic
 * attribute domains expressed as plain data; no gameplay consumer is wired to them
 * in 012. Domains are intentionally generous so current/expected values fit.
 */
export function createDefaultAttributeRegistry(): AttributeRegistry {
  const defs: AttributeDefinition[] = [
    { id: rid('generic/max_health'), key: 'max_health', name: 'Max Health', min: 0, default: 20, max: 1024 },
    { id: rid('generic/movement_speed'), key: 'movement_speed', name: 'Movement Speed', min: 0, default: 0.1, max: 1024 },
    { id: rid('generic/attack_damage'), key: 'attack_damage', name: 'Attack Damage', min: 0, default: 1, max: 1024 },
    { id: rid('generic/armor'), key: 'armor', name: 'Armor', min: 0, default: 0, max: 30 },
    { id: rid('generic/luck'), key: 'luck', name: 'Luck', min: -1024, default: 0, max: 1024 },
    { id: rid('generic/attack_speed'), key: 'attack_speed', name: 'Attack Speed', min: 0, default: 4, max: 1024 },
  ];
  return new AttributeRegistry(defs);
}
