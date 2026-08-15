/**
 * Potion item data (change 122).
 *
 * Models what a potion *carries* as a serializable stack component and exposes pure
 * primitives that turn those contents into a consume payload or a splash payload.
 * This change is data + payload only; it does not brew, apply, or render potions
 * (those are downstream: 123 brewing, 124 consume, a later throwable-entity change).
 *
 * The component value is intentionally flat (`StackComponentValue` forbids nested
 * `ResourceId` objects), storing each effect's `typeId` as a `minecraft:effect/<key>`
 * string, mirroring the `enchantments` component's string-keyed precedent.
 */

import { type ResourceId, createResourceId, resourceIdToString } from './ResourceId';
import { RegistryError } from './Registry';
import { type StackComponentType } from '../inventory/StackDataComponents';

/** How a potion is delivered. NORMAL is the default (drinkable). */
export type PotionKind = 'NORMAL' | 'SPLASH' | 'LINGERING';

/** One effect row carried by a potion. `typeId` is a `minecraft:effect/<key>` string. */
export interface PotionEffectData {
  readonly typeId: string;
  readonly duration: number;
  readonly amplifier: number;
}

/** Serializable potion contents stored on an item stack. */
export interface PotionContents {
  readonly base?: string;
  readonly kind: PotionKind;
  readonly customEffects: readonly PotionEffectData[];
}

/** Effects to add to a target's StatusEffectManager when the potion is drunk. */
export interface PotionConsumePayload {
  readonly effects: readonly PotionEffectData[];
}

/** Effects + radius for a thrown/splash potion entity (consumed downstream). */
export interface PotionSplashPayload {
  readonly radius: number;
  readonly effects: readonly PotionEffectData[];
}

/** ResourceId of the potion contents stack component. */
export const POTION_CONTENTS_COMPONENT: ResourceId = createResourceId('minecraft', 'potion_contents');

/** Default splash/lingering radius (blocks). NORMAL potions have radius 0. */
export const POTION_SPLASH_RADIUS = 4.0;

const POTION_KINDS: readonly PotionKind[] = ['NORMAL', 'SPLASH', 'LINGERING'];

function isPotionKind(value: unknown): value is PotionKind {
  return typeof value === 'string' && (POTION_KINDS as readonly string[]).includes(value);
}

function validateEffectRaw(value: unknown, field: string): PotionEffectData {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new RegistryError('INVALID_ID', resourceIdToString(POTION_CONTENTS_COMPONENT), `potion_contents: ${field} must be an object`);
  }
  const candidate = value as Partial<PotionEffectData>;
  if (typeof candidate.typeId !== 'string' || candidate.typeId.length === 0) {
    throw new RegistryError('INVALID_ID', resourceIdToString(POTION_CONTENTS_COMPONENT), `potion_contents: ${field}.typeId must be a non-empty string`);
  }
  if (typeof candidate.duration !== 'number' || !Number.isFinite(candidate.duration) || candidate.duration < 0 || candidate.duration > Number.MAX_SAFE_INTEGER) {
    throw new RegistryError('INVALID_ID', resourceIdToString(POTION_CONTENTS_COMPONENT), `potion_contents: ${field}.duration must be a finite number >= 0`);
  }
  if (
    typeof candidate.amplifier !== 'number' ||
    !Number.isFinite(candidate.amplifier) ||
    candidate.amplifier < 0
  ) {
    throw new RegistryError('INVALID_ID', resourceIdToString(POTION_CONTENTS_COMPONENT), `potion_contents: ${field}.amplifier must be a finite number >= 0`);
  }
  return {
    typeId: candidate.typeId,
    duration: candidate.duration,
    amplifier: candidate.amplifier,
  };
}

function clampEffect(raw: PotionEffectData): PotionEffectData {
  return {
    typeId: raw.typeId,
    duration: Math.max(0, raw.duration),
    amplifier: Math.max(0, Math.floor(raw.amplifier)),
  };
}

/**
 * Strict factory for potion contents. Validates and clamps inputs, throwing a
 * `RegistryError` on any violation. A potion MUST carry at least one effect and MUST
 * NOT carry duplicate effect typeIds. `kind` defaults to NORMAL.
 *
 * Inputs that are merely out of the clamped range (e.g. negative duration,
 * fractional amplifier) are normalized rather than rejected; only non-numeric,
 * non-finite, or structurally invalid inputs throw.
 */
export function createPotionContents(input: {
  base?: string;
  kind?: PotionKind;
  customEffects: readonly PotionEffectData[];
}): PotionContents {
  if (input.base !== undefined && typeof input.base !== 'string') {
    throw new RegistryError('INVALID_ID', resourceIdToString(POTION_CONTENTS_COMPONENT), 'potion_contents: base must be a string when present');
  }
  if (input.kind !== undefined && !isPotionKind(input.kind)) {
    throw new RegistryError('INVALID_ID', resourceIdToString(POTION_CONTENTS_COMPONENT), `potion_contents: unknown kind '${String(input.kind)}'`);
  }
  if (!Array.isArray(input.customEffects) || input.customEffects.length === 0) {
    throw new RegistryError('INVALID_ID', resourceIdToString(POTION_CONTENTS_COMPONENT), 'potion_contents: customEffects must be a non-empty array');
  }

  const seen = new Set<string>();
  const effects: PotionEffectData[] = [];
  for (let i = 0; i < input.customEffects.length; i++) {
    const raw = validateEffectRaw(input.customEffects[i], `customEffects[${i}]`);
    if (seen.has(raw.typeId)) {
      throw new RegistryError('INVALID_ID', resourceIdToString(POTION_CONTENTS_COMPONENT), `potion_contents: duplicate effect typeId '${raw.typeId}'`);
    }
    seen.add(raw.typeId);
    effects.push(clampEffect(raw));
  }

  return {
    base: input.base,
    kind: input.kind ?? 'NORMAL',
    customEffects: Object.freeze(effects),
  };
}

/** Lenient read-path guard used by `StackComponentMap` validation. */
export const potionContentsComponentType: StackComponentType = {
  id: POTION_CONTENTS_COMPONENT,
  description: 'Effects carried by a potion item stack',
  validate: (value: unknown): boolean => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as Partial<PotionContents>;
    if (!isPotionKind(candidate.kind)) return false;
    if (candidate.base !== undefined && typeof candidate.base !== 'string') return false;
    if (!Array.isArray(candidate.customEffects) || candidate.customEffects.length === 0) return false;
    const seen = new Set<string>();
    for (const raw of candidate.customEffects) {
      if (raw === null || typeof raw !== 'object') return false;
      const effect = raw as Partial<PotionEffectData>;
      if (typeof effect.typeId !== 'string' || effect.typeId.length === 0) return false;
      if (typeof effect.duration !== 'number' || !Number.isFinite(effect.duration) || effect.duration < 0) return false;
      if (typeof effect.amplifier !== 'number' || !Number.isFinite(effect.amplifier) || effect.amplifier < 0 || !Number.isInteger(effect.amplifier)) return false;
      if (seen.has(effect.typeId)) return false;
      seen.add(effect.typeId);
    }
    return true;
  },
};

/** The effective effect list for a potion (customEffects; base is not synthesized here). */
export function getEffectiveEffects(contents: PotionContents): readonly PotionEffectData[] {
  return contents.customEffects;
}

/** Build the effects a drink adds to a target's StatusEffectManager. */
export function buildConsumePayload(contents: PotionContents): PotionConsumePayload {
  return { effects: getEffectiveEffects(contents) };
}

/** Build the radius + effects for a thrown/splash potion entity. */
export function buildSplashPayload(contents: PotionContents): PotionSplashPayload {
  const radius = contents.kind === 'NORMAL' ? 0 : POTION_SPLASH_RADIUS;
  return { radius, effects: getEffectiveEffects(contents) };
}
