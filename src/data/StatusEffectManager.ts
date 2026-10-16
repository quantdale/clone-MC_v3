/**
 * Status-effect runtime (change 121).
 *
 * A `StatusEffectManager` owns the set of active status effects for one entity and
 * reflects them in a per-entity set of 012 `AttributeInstance`s via an effect -> attribute
 * hook table. It applies duration ticking, duration/amplifier stacking, and atomic
 * serialization, without wiring any gameplay consumer (movement/damage/rendering are
 * downstream changes).
 *
 * The 012 attribute model and the 014 status-effect type/instance model are consumed
 * unchanged; the hook table is new data owned by this module.
 */

import { type ResourceId, createResourceId, resourceIdToString } from './ResourceId';
import {
  StatusEffectInstance,
  StatusEffectTypeRegistry,
  type StatusEffectInstanceData,
} from './StatusEffect';
import {
  AttributeInstance,
  AttributeRegistry,
  type AttributeOperation,
  type Modifier,
} from './AttributeRegistry';

/** Maps one effect type to a single attribute modifier applied while it is active. */
export interface EffectAttributeHook {
  readonly attribute: ResourceId;
  readonly operation: AttributeOperation;
  /** Finite amount as a function of the active amplifier (>= 0). */
  readonly amount: (amplifier: number) => number;
}

const rid = (path: string): ResourceId => createResourceId('minecraft', path);

/**
 * Default effect -> attribute hook table. Only effects that map cleanly onto an
 * existing 012 attribute are hooked here; the rest are still managed, ticked, stacked,
 * and persisted, but do not modify an attribute until a later change integrates their
 * concrete behavior.
 */
export const DEFAULT_EFFECT_ATTRIBUTE_HOOKS: Readonly<Record<string, EffectAttributeHook>> = {
  [resourceIdToString(rid('effect/speed'))]: {
    attribute: rid('generic/movement_speed'),
    operation: 'MULTIPLY_TOTAL',
    amount: (a) => 0.2 * a,
  },
  [resourceIdToString(rid('effect/slowness'))]: {
    attribute: rid('generic/movement_speed'),
    operation: 'MULTIPLY_TOTAL',
    amount: (a) => -0.15 * a,
  },
  [resourceIdToString(rid('effect/strength'))]: {
    attribute: rid('generic/attack_damage'),
    operation: 'ADD_VALUE',
    amount: (a) => 3 * a,
  },
  [resourceIdToString(rid('effect/weakness'))]: {
    attribute: rid('generic/attack_damage'),
    operation: 'ADD_VALUE',
    amount: (a) => -4 * a,
  },
  [resourceIdToString(rid('effect/health_boost'))]: {
    attribute: rid('generic/max_health'),
    operation: 'ADD_VALUE',
    amount: (a) => 4 * a,
  },
  [resourceIdToString(rid('effect/haste'))]: {
    attribute: rid('generic/attack_speed'),
    operation: 'MULTIPLY_TOTAL',
    amount: (a) => 0.1 * a,
  },
  [resourceIdToString(rid('effect/mining_fatigue'))]: {
    attribute: rid('generic/attack_speed'),
    operation: 'MULTIPLY_TOTAL',
    amount: (a) => -0.1 * a,
  },
};

function clampNonNeg(value: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > max) return max;
  return value;
}

function clampNonNegInt(value: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  const v = Math.floor(value);
  if (v > max) return max;
  return v;
}

/**
 * Owns the active status effects and derived attribute modifiers for one entity.
 *
 * Construction requires finalized 012/014 registries. The manager holds no randomness;
 * all behavior is deterministic given the inputs.
 */
export class StatusEffectManager {
  private readonly effectRegistry: StatusEffectTypeRegistry;
  private readonly hooks = new Map<string, EffectAttributeHook>();
  private readonly effects = new Map<string, StatusEffectInstance>();
  private readonly attributeMap = new Map<string, AttributeInstance>();

  constructor(
    effectRegistry: StatusEffectTypeRegistry,
    attributeRegistry: AttributeRegistry,
    hooks?: Readonly<Record<string, EffectAttributeHook>>,
  ) {
    this.effectRegistry = effectRegistry;
    for (const [key, hook] of Object.entries(DEFAULT_EFFECT_ATTRIBUTE_HOOKS)) {
      this.hooks.set(key, hook);
    }
    if (hooks) {
      for (const [key, hook] of Object.entries(hooks)) {
        this.hooks.set(key, hook);
      }
    }
    for (const def of attributeRegistry.entries()) {
      this.attributeMap.set(resourceIdToString(def.id), new AttributeInstance(def));
    }
  }

  /** Active instance for a type, or undefined when not present. */
  get(typeId: ResourceId): StatusEffectInstance | undefined {
    return this.effects.get(resourceIdToString(typeId));
  }

  /** All active instances in deterministic (first-add) order. */
  getAll(): readonly StatusEffectInstance[] {
    return [...this.effects.values()];
  }

  /** Per-entity attribute instance for `id`, or undefined if not registered. */
  getAttribute(id: ResourceId): AttributeInstance | undefined {
    return this.attributeMap.get(resourceIdToString(id));
  }

  /** All per-entity attribute instances (read-only snapshot). */
  get attributes(): readonly AttributeInstance[] {
    return [...this.attributeMap.values()];
  }

  /**
   * Add (or stack onto) an effect. Resolves the type strictly (an unregistered id
   * throws), clamps incoming duration/amplifier, merges with any existing instance
   * per the stacking rule, then applies/refreshes the attribute hook.
   */
  add(typeId: ResourceId, duration?: number, amplifier?: number): StatusEffectInstance {
    const type = this.effectRegistry.get(typeId);
    const key = resourceIdToString(typeId);
    const maxDuration = type.maxDuration ?? Number.POSITIVE_INFINITY;

    const incomingDuration = clampNonNeg(duration ?? type.defaultDuration ?? 0, maxDuration);
    const incomingAmplifier = clampNonNegInt(amplifier ?? 0, type.maxAmplifier ?? 0);

    const existing = this.effects.get(key);
    let finalDuration = incomingDuration;
    let finalAmplifier = incomingAmplifier;
    if (existing) {
      const curDuration = existing.duration;
      const curAmplifier = existing.amplifier;
      finalAmplifier = Math.max(curAmplifier, incomingAmplifier);
      if (incomingAmplifier > curAmplifier) {
        finalDuration = incomingDuration;
      } else {
        finalDuration = Math.max(curDuration, incomingDuration);
      }
    }
    finalDuration = clampNonNeg(finalDuration, maxDuration);
    finalAmplifier = clampNonNegInt(finalAmplifier, type.maxAmplifier ?? 0);

    if (existing) {
      this.removeHook(typeId);
    }
    const instance = new StatusEffectInstance(type, finalDuration, finalAmplifier);
    this.effects.set(key, instance);
    this.applyHook(typeId, instance);
    return instance;
  }

  /** Remove an active effect and its hook. Returns false when not present. */
  remove(typeId: ResourceId): boolean {
    const key = resourceIdToString(typeId);
    if (!this.effects.has(key)) return false;
    this.removeHook(typeId);
    this.effects.delete(key);
    return true;
  }

  /** Remove every active effect and hook. */
  clear(): void {
    for (const inst of this.effects.values()) {
      this.removeHook(inst.type.id);
    }
    this.effects.clear();
  }

  /**
   * Advance every effect by `dt` seconds. Non-finite/negative `dt` is a no-op. Expired
   * effects are removed (and unhooked); the expired instances are returned so a consumer
   * can apply one-shot (INSTANT) behavior.
   */
  tick(dt: number): readonly StatusEffectInstance[] {
    if (!Number.isFinite(dt) || dt < 0) return [];
    const expired: StatusEffectInstance[] = [];
    for (const inst of this.effects.values()) {
      inst.tick(dt);
      if (inst.expired) expired.push(inst);
    }
    for (const inst of expired) {
      this.remove(inst.type.id);
    }
    return expired;
  }

  /** Plain serializable form of every active effect. */
  serialize(): StatusEffectInstanceData[] {
    return this.getAll().map((inst) => inst.serialize());
  }

  /**
   * Restore from serialized data, re-applying hooks. Atomic: a malformed or unregistered
   * entry throws before any mutation, leaving the prior state intact.
   */
  deserialize(data: readonly StatusEffectInstanceData[]): void {
    const resolved: { typeId: ResourceId; duration: number; amplifier: number }[] = [];
    for (const entry of data) {
      const inst = StatusEffectInstance.deserialize(entry, this.effectRegistry);
      resolved.push({ typeId: inst.type.id, duration: inst.duration, amplifier: inst.amplifier });
    }
    this.clear();
    for (const r of resolved) {
      this.add(r.typeId, r.duration, r.amplifier);
    }
  }

  private applyHook(typeId: ResourceId, instance: StatusEffectInstance): void {
    const hook = this.hooks.get(resourceIdToString(typeId));
    if (!hook) return;
    const attr = this.attributeMap.get(resourceIdToString(hook.attribute));
    if (!attr) return;
    const modifier: Modifier = {
      id: typeId,
      operation: hook.operation,
      amount: hook.amount(instance.amplifier),
    };
    attr.addModifier(modifier);
  }

  private removeHook(typeId: ResourceId): void {
    const hook = this.hooks.get(resourceIdToString(typeId));
    if (!hook) return;
    const attr = this.attributeMap.get(resourceIdToString(hook.attribute));
    if (!attr) return;
    attr.removeModifier(typeId);
  }
}
