/**
 * Current-release delta (221): the isolated release overlay declaration — which expanded
 * content a release enables and which behaviors it overrides. Pure and headless-safe: the
 * baseline architecture is NEVER touched by this module; the runtime overlays the delta.
 *
 * Determinism rules:
 * - `release` is a non-empty string; `content` maps the ten documented kinds (from 215-220) to
 *   non-empty string lists (absent kinds read as empty); `behavior` is a list of overrides with
 *   non-empty target/field and boolean/finite-number/string values.
 * - Unknown kinds throw; the whole payload validates before anything is accepted.
 * - Queries are total and registration-ordered.
 */
export const RELEASE_CONTENT_KINDS = [
  'blocks',
  'items',
  'biomes',
  'mobs',
  'structures',
  'enchantments',
  'effects',
  'potions',
  'recipes',
  'loot',
] as const;

export type ReleaseContentKind = (typeof RELEASE_CONTENT_KINDS)[number];

/** A behavior override on a content id (the runtime applies it). */
export interface BehaviorOverride {
  readonly target: string;
  readonly field: string;
  readonly value: boolean | number | string;
}

/** The release overlay declaration. */
export interface ReleaseDelta {
  readonly release: string;
  readonly content: Readonly<Record<ReleaseContentKind, readonly string[]>>;
  readonly behavior: readonly BehaviorOverride[];
}

function isReleaseContentKind(value: unknown): value is ReleaseContentKind {
  return typeof value === 'string' && (RELEASE_CONTENT_KINDS as readonly string[]).includes(value);
}

function validateIdList(value: unknown, kind: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`ReleaseDelta: ${kind} must be non-empty strings`);
  }
  for (const id of value) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error(`ReleaseDelta: ${kind} must be non-empty strings`);
    }
  }
  return [...value];
}

function validateOverride(value: unknown, index: number): BehaviorOverride {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`ReleaseDelta: behavior ${index} must be an object`);
  }
  const o = value as Record<string, unknown>;
  if (typeof o.target !== 'string' || o.target.length === 0) {
    throw new Error(`ReleaseDelta: behavior ${index}.target must be a non-empty string`);
  }
  if (typeof o.field !== 'string' || o.field.length === 0) {
    throw new Error(`ReleaseDelta: behavior ${index}.field must be a non-empty string`);
  }
  const v = o.value;
  const valid =
    typeof v === 'boolean' ||
    (typeof v === 'number' && Number.isFinite(v)) ||
    typeof v === 'string';
  if (!valid) {
    throw new Error(
      `ReleaseDelta: behavior ${index}.value must be a boolean, finite number, or string`,
    );
  }
  return { target: o.target, field: o.field, value: v as boolean | number | string };
}

export interface ReleaseDeltaInput {
  readonly release: string;
  readonly content?: Partial<Record<ReleaseContentKind, readonly string[]>>;
  readonly behavior?: readonly BehaviorOverride[];
}

/** Build a validated release delta. */
export function createReleaseDelta(input: ReleaseDeltaInput): ReleaseDelta {
  if (typeof input.release !== 'string' || input.release.length === 0) {
    throw new Error('ReleaseDelta: release must be a non-empty string');
  }
  const content: Record<string, string[]> = {};
  for (const kind of RELEASE_CONTENT_KINDS) {
    content[kind] = [];
  }
  if (input.content !== undefined) {
    for (const key of Object.keys(input.content)) {
      if (!isReleaseContentKind(key)) {
        throw new Error(`ReleaseDelta: unknown content kind ${key}`);
      }
      content[key] = validateIdList(input.content[key as ReleaseContentKind], key);
    }
  }
  const behavior = (input.behavior ?? []).map(validateOverride);
  return {
    release: input.release,
    content: content as Record<ReleaseContentKind, readonly string[]>,
    behavior,
  };
}

/** The enabled content ids of one kind, in registration order (never undefined). */
export function contentForKind(delta: ReleaseDelta, kind: ReleaseContentKind): readonly string[] {
  return delta.content[kind];
}

/** Whether a content id is enabled by the delta. */
export function isEnabled(delta: ReleaseDelta, kind: ReleaseContentKind, id: string): boolean {
  return delta.content[kind].includes(id);
}

/** The behavior overrides targeting an id, in registration order. */
export function overridesFor(delta: ReleaseDelta, target: string): readonly BehaviorOverride[] {
  return delta.behavior.filter((o) => o.target === target);
}
