/**
 * Extensible per-stack data components.
 *
 * Item-specific state (e.g. tool damage) is currently a separate parallel array
 * in `Inventory`. This module defines typed component types identified by
 * ResourceId, a registry of those types built on the generic registry core, and
 * an immutable component map for one inventory stack. Inventory migration to this
 * model happens in 009; 008 is additive and does not touch existing storage.
 */

import { type ResourceId, createResourceId, resourceIdToString } from '../data/ResourceId';
import { Registry, RegistryError } from '../data/Registry';
import { potionContentsComponentType } from '../data/PotionItemData';

/** A component value is a primitive or a bag of primitives (no nesting). */
export type StackComponentValue =
  | number
  | string
  | boolean
  | Readonly<Record<string, number | string | boolean>>;

/** A registered component type: identity plus a value validator. */
export interface StackComponentType {
  readonly id: ResourceId;
  readonly description: string;
  /** Returns true when `value` is a legal instance of this component. */
  readonly validate: (value: unknown) => boolean;
  /** Optional canonical default used when a stack omits the component. */
  readonly defaultValue?: StackComponentValue;
}

/**
 * Registry of stack-component types, built on the 003 generic registry core.
 * Registration is finalized at construction: duplicate ids are rejected and the
 * type set is immutable thereafter.
 */
export class StackComponentRegistry {
  private readonly registry: Registry<StackComponentType>;

  constructor(types: StackComponentType[]) {
    this.registry = new Registry<StackComponentType>();
    for (const type of types) {
      this.registry.register(type.id, type);
    }
    this.registry.finalize();
  }

  /** Strict lookup of a component type by ResourceId. Throws for unknown ids. */
  get(id: ResourceId): StackComponentType {
    return this.registry.get(id);
  }

  /** Whether a component type is registered. */
  has(id: ResourceId): boolean {
    return this.registry.has(id);
  }

  /** All registered component types. */
  all(): readonly StackComponentType[] {
    return this.registry.entries().map((entry) => entry.value);
  }
}

function cloneValue(value: StackComponentValue): StackComponentValue {
  if (value === null || typeof value !== 'object') return value;
  const source = value as Record<string, number | string | boolean>;
  const out: Record<string, number | string | boolean> = {};
  for (const key of Object.keys(source)) {
    out[key] = source[key] as number | string | boolean;
  }
  return Object.freeze(out);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  for (const key of ka) {
    if (!valuesEqual(ao[key], bo[key])) return false;
  }
  return true;
}

interface StoredComponent {
  readonly id: ResourceId;
  readonly value: StackComponentValue;
}

/**
 * Immutable map of component types to their values for one inventory stack.
 * Values are validated against the registry on construction and on every `with`,
 * and stored frozen. Iteration and equality are deterministic by ResourceId.
 */
export class StackComponentMap {
  private readonly registry: StackComponentRegistry;
  private readonly values: ReadonlyMap<string, StoredComponent>;

  constructor(registry: StackComponentRegistry, entries?: Iterable<readonly [ResourceId, StackComponentValue]>) {
    this.registry = registry;
    const map = new Map<string, StoredComponent>();
    if (entries !== undefined) {
      for (const [id, value] of entries) {
        const type = registry.get(id); // throws MISSING_ID for unknown components
        if (!type.validate(value)) {
          throw new RegistryError('INVALID_ID', resourceIdToString(id), 'component value failed validation');
        }
        map.set(resourceIdToString(id), { id, value: cloneValue(value) });
      }
    }
    this.values = map;
  }

  /** Whether the stack carries the given component. */
  has(id: ResourceId): boolean {
    return this.values.has(resourceIdToString(id));
  }

  /** Typed lookup of a component value, or undefined when absent. */
  get<T = StackComponentValue>(id: ResourceId): T | undefined {
    return this.values.get(resourceIdToString(id))?.value as T | undefined;
  }

  /** Deterministic ordered entries keyed by ResourceId string. */
  entries(): readonly (readonly [ResourceId, StackComponentValue])[] {
    return [...this.values.values()]
      .sort((a, b) => resourceIdToString(a.id).localeCompare(resourceIdToString(b.id)))
      .map((stored) => [stored.id, stored.value] as const);
  }

  /** Return a new map with the component set/replaced; validates the value. */
  with(id: ResourceId, value: StackComponentValue): StackComponentMap {
    const type = this.registry.get(id);
    if (!type.validate(value)) {
      throw new RegistryError('INVALID_ID', resourceIdToString(id), 'component value failed validation');
    }
    const next = new Map(this.values);
    next.set(resourceIdToString(id), { id, value: cloneValue(value) });
    return new StackComponentMap(this.registry, [...next.values()].map((s) => [s.id, s.value] as const));
  }

  /** Return a new map without the given component. */
  without(id: ResourceId): StackComponentMap {
    const next = new Map(this.values);
    next.delete(resourceIdToString(id));
    return new StackComponentMap(this.registry, [...next.values()].map((s) => [s.id, s.value] as const));
  }

  /** Deep-equal comparison against another map (deterministic). */
  equals(other: StackComponentMap): boolean {
    if (this.values.size !== other.values.size) return false;
    for (const [key, stored] of this.values) {
      const otherStored = other.values.get(key);
      if (otherStored === undefined) return false;
      if (!valuesEqual(stored.value, otherStored.value)) return false;
    }
    return true;
  }

  /** An independent immutable copy. */
  copy(): StackComponentMap {
    return new StackComponentMap(this.registry, this.entries());
  }
}

// --- Base component types ---

/** ResourceId of the tool damage/wear component. */
export const DAMAGE_COMPONENT: ResourceId = createResourceId('minecraft', 'damage');

/** Damage/wear value: non-negative accumulated damage for a tool. */
export interface DamageComponentValue {
  readonly damage: number;
}

/** Component type for current tool damage/wear, validated as a non-negative number. */
export const damageComponentType: StackComponentType = {
  id: DAMAGE_COMPONENT,
  description: 'Accumulated damage on a tool item',
  validate: (value: unknown): boolean => {
    if (value === null || typeof value !== 'object') return false;
    const candidate = value as Partial<DamageComponentValue>;
    return (
      typeof candidate.damage === 'number' &&
      Number.isFinite(candidate.damage) &&
      Number.isInteger(candidate.damage) &&
      candidate.damage >= 0
    );
  },
  defaultValue: { damage: 0 },
};

/** ResourceId of the enchantment component. */
export const ENCHANTMENTS_COMPONENT: ResourceId = createResourceId('minecraft', 'enchantments');

/**
 * Enchantment component value: a flat map of enchantment resource-id string to
 * level. Values MUST be finite integers `>= 1` (validated by the component type).
 */
export type EnchantmentsComponentValue = Readonly<Record<string, number>>;

/** Component type for item enchantments, validated as a non-null object whose
 * every value is a finite integer `>= 1`. */
export const enchantmentsComponentType: StackComponentType = {
  id: ENCHANTMENTS_COMPONENT,
  description: 'Enchantments applied to an item stack',
  validate: (value: unknown): boolean => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    for (const key of Object.keys(candidate)) {
      const level = candidate[key];
      if (typeof level !== 'number' || !Number.isFinite(level) || !Number.isInteger(level) || level < 1) {
        return false;
      }
    }
    return true;
  },
};

/** Default component registry with the base component types for current tools. */
export function createDefaultStackComponentRegistry(): StackComponentRegistry {
  return new StackComponentRegistry([damageComponentType, enchantmentsComponentType, potionContentsComponentType]);
}

/** Convenience: an empty component map for a stack using the default registry. */
export function emptyStackComponents(): StackComponentMap {
  return new StackComponentMap(createDefaultStackComponentRegistry());
}
