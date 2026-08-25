/**
 * Status-effect type registry and serializable instances (change 014).
 *
 * A status-effect *type* is a ResourceId-identified, immutable data record describing
 * one effect (category, flags, durations, amplifier bounds). A `StatusEffectInstance`
 * is a live, serializable occurrence of a type with a remaining duration and amplifier.
 *
 * 014 is additive and gameplay-free: no speed/health/damage behavior is attached. The
 * types are data placeholders for future effect-manager/attribute consumers.
 */

import {
  type ResourceId,
  createResourceId,
  parseResourceId,
  resourceIdToString,
} from './ResourceId';
import { Registry } from './Registry';

/** Whether an effect helps, hurts, or is neutral to the affected entity. */
export type StatusEffectCategory = 'BENEFICIAL' | 'HARMFUL' | 'NEUTRAL';

/** Category/behavior tag attached to an effect type. */
export type StatusEffectFlag =
  | 'BENEFICIAL'
  | 'HARMFUL'
  | 'INSTANT'
  | 'DURATION_BASED'
  | 'AMPLIFIER_SCALES';

/** An immutable data record describing one status-effect type. */
export interface StatusEffectTypeDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  readonly category: StatusEffectCategory;
  readonly flags: readonly StatusEffectFlag[];
  /** Default remaining duration in seconds for a newly applied instance. */
  readonly defaultDuration?: number;
  /** Maximum permitted duration in seconds. */
  readonly maxDuration?: number;
  /** Maximum permitted amplifier level (>= 0). */
  readonly maxAmplifier?: number;
}

/** Failure category for status-effect validation. */
export type StatusEffectErrorReason =
  | 'DUPLICATE_ID'
  | 'INVALID_VALUE'
  | 'INVALID_FLAG'
  | 'INVALID_DEFINITION'
  | 'INVALID_REFERENCE';

/** Thrown when a status-effect definition, instance, or serialization fails validation. */
export class StatusEffectError extends Error {
  readonly reason: StatusEffectErrorReason;
  readonly identifier: string | undefined;

  constructor(reason: StatusEffectErrorReason, identifier: string | undefined, detail: string) {
    super(`StatusEffect error (${reason}): ${detail}`);
    this.name = 'StatusEffectError';
    this.reason = reason;
    this.identifier = identifier;
  }
}

const KNOWN_FLAGS: readonly StatusEffectFlag[] = [
  'BENEFICIAL',
  'HARMFUL',
  'INSTANT',
  'DURATION_BASED',
  'AMPLIFIER_SCALES',
];

const KNOWN_CATEGORIES: readonly StatusEffectCategory[] = ['BENEFICIAL', 'HARMFUL', 'NEUTRAL'];

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateDuration(value: number | undefined, label: string, def: StatusEffectTypeDefinition): void {
  if (value !== undefined && (!isFiniteNumber(value) || value < 0)) {
    throw new StatusEffectError('INVALID_VALUE', def.key, `${label} must be a finite non-negative number`);
  }
}

function validate(def: StatusEffectTypeDefinition): void {
  validateDuration(def.defaultDuration, 'defaultDuration', def);
  validateDuration(def.maxDuration, 'maxDuration', def);
  if (def.maxAmplifier !== undefined && (!isFiniteNumber(def.maxAmplifier) || def.maxAmplifier < 0)) {
    throw new StatusEffectError('INVALID_VALUE', def.key, 'maxAmplifier must be a finite non-negative number');
  }
  if (!KNOWN_CATEGORIES.includes(def.category)) {
    throw new StatusEffectError('INVALID_DEFINITION', def.key, `unknown status effect category: ${def.category}`);
  }
  for (const flag of def.flags) {
    if (!KNOWN_FLAGS.includes(flag)) {
      throw new StatusEffectError('INVALID_FLAG', def.key, `unknown status effect flag: ${String(flag)}`);
    }
  }
  if (def.flags.includes('INSTANT') && def.defaultDuration !== undefined) {
    throw new StatusEffectError('INVALID_DEFINITION', def.key, 'INSTANT effects must not carry a defaultDuration');
  }
  if (def.flags.includes('DURATION_BASED') && def.defaultDuration === undefined) {
    throw new StatusEffectError(
      'INVALID_DEFINITION',
      def.key,
      'DURATION_BASED effects must declare a defaultDuration',
    );
  }
}

/**
 * Registry of status-effect type definitions built on the 003 generic registry core.
 *
 * Construction validates every definition (unique id, known flags/category, finite
 * non-negative durations, valid amplifier bound) and finalizes before any lookup.
 */
export class StatusEffectTypeRegistry {
  private readonly inner: Registry<StatusEffectTypeDefinition>;

  constructor(definitions: StatusEffectTypeDefinition[]) {
    this.inner = new Registry<StatusEffectTypeDefinition>();
    for (const def of definitions) {
      validate(def);
      if (this.inner.has(def.id)) {
        throw new StatusEffectError('DUPLICATE_ID', resourceIdToString(def.id), 'status effect id already registered');
      }
      this.inner.register(def.id, def);
    }
    this.inner.finalize();
  }

  /** Whether the registry has been finalized and can no longer accept mutations. */
  get finalized(): boolean {
    return this.inner.finalized;
  }

  /** Number of registered status-effect type definitions. */
  get size(): number {
    return this.inner.size;
  }

  /** Strict lookup by ResourceId. */
  get(id: ResourceId): StatusEffectTypeDefinition {
    return this.inner.get(id);
  }

  /** Optional lookup by ResourceId. */
  getOptional(id: ResourceId): StatusEffectTypeDefinition | undefined {
    return this.inner.getOptional(id);
  }

  /** Whether a status-effect ResourceId is registered. */
  has(id: ResourceId): boolean {
    return this.inner.has(id);
  }

  /** All definitions in ascending registration order (deterministic). */
  entries(): readonly StatusEffectTypeDefinition[] {
    return this.inner.entries().map((entry) => entry.value);
  }
}

/** Plain, serializable form of an active status-effect instance. */
export interface StatusEffectInstanceData {
  /** ResourceId string of the effect type. */
  typeId: string;
  /** Remaining duration in seconds. */
  duration: number;
  /** Effect amplifier/level. */
  amplifier: number;
}

/**
 * A live, serializable occurrence of a status-effect type. Duration counts down via
 * `tick`; `serialize`/`deserialize` round-trip through plain data resolved against a
 * registry.
 */
export class StatusEffectInstance {
  private remaining: number;
  private readonly level: number;

  constructor(
    private readonly definition: StatusEffectTypeDefinition,
    duration?: number,
    amplifier?: number,
  ) {
    const isInstant = definition.flags.includes('INSTANT');
    const baseDuration = isInstant ? 0 : duration ?? definition.defaultDuration ?? 0;
    if (!isFiniteNumber(baseDuration) || baseDuration < 0) {
      throw new StatusEffectError('INVALID_VALUE', definition.key, 'duration must be a finite non-negative number');
    }
    const maxAmp = definition.maxAmplifier ?? 0;
    const requested = amplifier ?? 0;
    if (!isFiniteNumber(requested) || requested < 0) {
      throw new StatusEffectError('INVALID_VALUE', definition.key, 'amplifier must be a finite non-negative number');
    }
    this.remaining = baseDuration;
    this.level = Math.min(Math.max(0, requested), maxAmp);
  }

  /** The effect type this instance is bound to. */
  get type(): StatusEffectTypeDefinition {
    return this.definition;
  }

  /** Remaining duration in seconds (>= 0). */
  get duration(): number {
    return this.remaining;
  }

  /** Effect amplifier/level, clamped to the type's max. */
  get amplifier(): number {
    return this.level;
  }

  /** True once the duration has reached zero (or the type is instant). */
  get expired(): boolean {
    return this.remaining <= 0;
  }

  /** Advance the effect by `dt` seconds, reducing the remaining duration (clamped at 0). */
  tick(dt: number): void {
    if (!isFiniteNumber(dt) || dt < 0) return;
    this.remaining = Math.max(0, this.remaining - dt);
  }

  /** Plain serializable representation. */
  serialize(): StatusEffectInstanceData {
    return { typeId: resourceIdToString(this.definition.id), duration: this.remaining, amplifier: this.level };
  }

  /** Reconstruct an instance from serialized data, resolving the type via `registry`. */
  static deserialize(data: StatusEffectInstanceData, registry: StatusEffectTypeRegistry): StatusEffectInstance {
    if (
      typeof data !== 'object' ||
      data === null ||
      typeof data.typeId !== 'string' ||
      !isFiniteNumber(data.duration) ||
      !isFiniteNumber(data.amplifier)
    ) {
      throw new StatusEffectError('INVALID_REFERENCE', undefined, 'malformed status effect instance data');
    }
    let id: ResourceId;
    try {
      id = parseResourceId(data.typeId);
    } catch {
      throw new StatusEffectError('INVALID_REFERENCE', data.typeId, 'malformed status effect type id');
    }
    const def = registry.getOptional(id);
    if (!def) {
      throw new StatusEffectError('INVALID_REFERENCE', data.typeId, 'status effect type not registered');
    }
    return new StatusEffectInstance(def, data.duration, data.amplifier);
  }
}

const rid = (path: string): ResourceId => createResourceId('minecraft', `effect/${path}`);

/**
 * Default status-effect type registry. These are data placeholders for future
 * gameplay consumers; no effect is applied in 014.
 */
export function createDefaultStatusEffectRegistry(): StatusEffectTypeRegistry {
  const types: StatusEffectTypeDefinition[] = [
    { id: rid('speed'), key: 'speed', name: 'Speed', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 2 },
    { id: rid('slowness'), key: 'slowness', name: 'Slowness', category: 'HARMFUL', flags: ['HARMFUL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 4 },
    { id: rid('haste'), key: 'haste', name: 'Haste', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 2 },
    { id: rid('mining_fatigue'), key: 'mining_fatigue', name: 'Mining Fatigue', category: 'HARMFUL', flags: ['HARMFUL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 4 },
    { id: rid('strength'), key: 'strength', name: 'Strength', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 2 },
    { id: rid('weakness'), key: 'weakness', name: 'Weakness', category: 'HARMFUL', flags: ['HARMFUL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 4 },
    { id: rid('poison'), key: 'poison', name: 'Poison', category: 'HARMFUL', flags: ['HARMFUL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 4 },
    { id: rid('regeneration'), key: 'regeneration', name: 'Regeneration', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 4 },
    { id: rid('fire_resistance'), key: 'fire_resistance', name: 'Fire Resistance', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 0 },
    { id: rid('water_breathing'), key: 'water_breathing', name: 'Water Breathing', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 0 },
    { id: rid('invisibility'), key: 'invisibility', name: 'Invisibility', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 0 },
    { id: rid('night_vision'), key: 'night_vision', name: 'Night Vision', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 0 },
    { id: rid('health_boost'), key: 'health_boost', name: 'Health Boost', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 4 },
    { id: rid('absorption'), key: 'absorption', name: 'Absorption', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 4 },
    { id: rid('resistance'), key: 'resistance', name: 'Resistance', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 4 },
    { id: rid('saturation'), key: 'saturation', name: 'Saturation', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 7, maxDuration: 96000, maxAmplifier: 4 },
    { id: rid('glowing'), key: 'glowing', name: 'Glowing', category: 'NEUTRAL', flags: ['DURATION_BASED'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 0 },
    { id: rid('levitation'), key: 'levitation', name: 'Levitation', category: 'HARMFUL', flags: ['HARMFUL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 4 },
    { id: rid('luck'), key: 'luck', name: 'Luck', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 300, maxDuration: 96000, maxAmplifier: 1 },
    { id: rid('unluck'), key: 'unluck', name: 'Unluck', category: 'HARMFUL', flags: ['HARMFUL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 300, maxDuration: 96000, maxAmplifier: 1 },
    { id: rid('bad_omen'), key: 'bad_omen', name: 'Bad Omen', category: 'HARMFUL', flags: ['HARMFUL', 'DURATION_BASED'], defaultDuration: 100, maxDuration: 100, maxAmplifier: 0 },
    { id: rid('hero_of_the_village'), key: 'hero_of_the_village', name: 'Hero of the Village', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED'], defaultDuration: 100, maxDuration: 100, maxAmplifier: 0 },
    { id: rid('conduit_power'), key: 'conduit_power', name: 'Conduit Power', category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 2 },
    { id: rid('dolphins_grace'), key: 'dolphins_grace', name: "Dolphin's Grace", category: 'BENEFICIAL', flags: ['BENEFICIAL', 'DURATION_BASED'], defaultDuration: 180, maxDuration: 96000, maxAmplifier: 0 },
    { id: rid('wither'), key: 'wither', name: 'Wither', category: 'HARMFUL', flags: ['HARMFUL', 'DURATION_BASED', 'AMPLIFIER_SCALES'], defaultDuration: 10, maxDuration: 96000, maxAmplifier: 4 },
  ];
  return new StatusEffectTypeRegistry(types);
}
