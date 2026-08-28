/**
 * Mob expansion (218): data-driven mob definitions (category, archetype, stats, spawn data)
 * over 129-146's entity/AI primitives — the established no-new-architecture pattern (215-217;
 * 137-138's spawn cycle consumes the spawn data; registries stay untouched). Pure and
 * headless-safe.
 *
 * Determinism rules:
 * - Ids are valid namespaced ids (004 rules) whose path does NOT start with 'mob/'.
 * - `name` is a non-empty translation key (214); `category` is one of the four documented
 *   values; `archetype` is melee|ranged|wanderer (default wanderer); `health` is a positive
 *   integer; `speed` is a finite number > 0; `hostileToPlayer` is a boolean (default
 *   category === 'hostile').
 * - `spawns.biomes` is non-empty and known (216); `spawns.weight` is a positive integer;
 *   `spawns.packSize` is a positive-integer [min, max] pair with min <= max.
 * - Duplicate ids are rejected; the whole payload validates before anything is accepted.
 * - `createMobExpansion` preserves registration order; lookups are total.
 */
import {
  createResourceId,
  isValidResourceNamespace,
  isValidResourcePath,
  resourceIdEquals,
  resourceIdToString,
  tryParseResourceId,
  type ResourceId,
} from './ResourceId';
import { BIOME_CATEGORIES, type BiomeCategory } from './BiomeExpansion';

export type MobCategory = 'passive' | 'hostile' | 'neutral' | 'utility';
export type MobArchetype = 'melee' | 'ranged' | 'wanderer';

const MOB_CATEGORIES: readonly string[] = ['passive', 'hostile', 'neutral', 'utility'];
const MOB_ARCHETYPES: readonly string[] = ['melee', 'ranged', 'wanderer'];

/** The spawn data for one mob. */
export interface MobSpawnData {
  readonly biomes: readonly BiomeCategory[];
  /** Positive integer. */
  readonly weight: number;
  /** Positive-integer [min, max] pair with min <= max. */
  readonly packSize: readonly [number, number];
}

/** One data-driven mob definition. */
export interface MobDefinition {
  readonly id: ResourceId;
  /** Translation key (214). */
  readonly name: string;
  readonly category: MobCategory;
  /** Default 'wanderer'. */
  readonly archetype: MobArchetype;
  /** Positive integer. */
  readonly health: number;
  /** Finite number > 0. */
  readonly speed: number;
  /** Default `category === 'hostile'`. */
  readonly hostileToPlayer: boolean;
  readonly spawns: MobSpawnData;
}

function toResourceId(value: unknown, what: string): ResourceId {
  if (typeof value === 'string') {
    const parsed = tryParseResourceId(value, 'minecraft');
    if (parsed === null) {
      throw new Error(`MobExpansion: ${what} must be a valid namespaced id`);
    }
    return parsed;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).namespace === 'string' &&
    typeof (value as Record<string, unknown>).path === 'string'
  ) {
    const r = value as { namespace: string; path: string };
    if (!isValidResourceNamespace(r.namespace) || !isValidResourcePath(r.path)) {
      throw new Error(`MobExpansion: ${what} must be a valid namespaced id`);
    }
    return createResourceId(r.namespace, r.path);
  }
  throw new Error(`MobExpansion: ${what} must be a valid namespaced id`);
}

export interface MobDefinitionInput {
  readonly id: ResourceId | string;
  readonly name: string;
  readonly category: MobCategory;
  readonly archetype?: MobArchetype;
  readonly health: number;
  readonly speed: number;
  readonly hostileToPlayer?: boolean;
  readonly spawns: {
    readonly biomes: readonly BiomeCategory[];
    readonly weight: number;
    readonly packSize: readonly [number, number];
  };
}

/** Build a validated mob definition with the documented defaults. */
export function createMobDefinition(input: MobDefinitionInput): MobDefinition {
  const id = toResourceId(input.id, 'id');
  if (id.path.startsWith('mob/')) {
    throw new Error(`MobExpansion: id path must not start with 'mob/'`);
  }
  if (typeof input.name !== 'string' || input.name.length === 0) {
    throw new Error('MobExpansion: name must be a non-empty string');
  }
  if (!MOB_CATEGORIES.includes(input.category)) {
    throw new Error('MobExpansion: category must be passive, hostile, neutral, or utility');
  }
  const archetype = input.archetype ?? 'wanderer';
  if (!MOB_ARCHETYPES.includes(archetype)) {
    throw new Error('MobExpansion: archetype must be melee, ranged, or wanderer');
  }
  if (!Number.isInteger(input.health) || input.health < 1) {
    throw new Error('MobExpansion: health must be a positive integer');
  }
  if (typeof input.speed !== 'number' || !Number.isFinite(input.speed) || input.speed <= 0) {
    throw new Error('MobExpansion: speed must be a finite number > 0');
  }
  const hostileToPlayer = input.hostileToPlayer ?? input.category === 'hostile';
  if (typeof hostileToPlayer !== 'boolean') {
    throw new Error('MobExpansion: hostileToPlayer must be a boolean');
  }
  const s = input.spawns;
  if (s.biomes.length === 0) {
    throw new Error('MobExpansion: spawns.biomes must not be empty');
  }
  for (const biome of s.biomes) {
    if (!BIOME_CATEGORIES.includes(biome)) {
      throw new Error('MobExpansion: spawns.biomes must be known biome categories');
    }
  }
  if (!Number.isInteger(s.weight) || s.weight < 1) {
    throw new Error('MobExpansion: spawns.weight must be a positive integer');
  }
  const [min, max] = s.packSize;
  if (
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    min < 1 ||
    max < 1 ||
    min > max
  ) {
    throw new Error('MobExpansion: spawns.packSize must be a positive integer [min, max] pair with min <= max');
  }
  return {
    id,
    name: input.name,
    category: input.category,
    archetype: archetype as MobArchetype,
    health: input.health,
    speed: input.speed,
    hostileToPlayer,
    spawns: { biomes: [...s.biomes], weight: s.weight, packSize: [min, max] },
  };
}

/** The validated mob expansion (registration order). */
export interface MobExpansion {
  readonly mobs: readonly MobDefinition[];
}

/** Build an expansion; duplicate ids are rejected wholesale. */
export function createMobExpansion(definitions: readonly MobDefinition[]): MobExpansion {
  const seen = new Set<string>();
  const mobs: MobDefinition[] = [];
  for (const definition of definitions) {
    const key = resourceIdToString(definition.id);
    if (seen.has(key)) {
      throw new Error(`MobExpansion: duplicate mob id ${key}`);
    }
    seen.add(key);
    mobs.push(definition);
  }
  return { mobs };
}

/** Look up a mob by id; undefined when missing. */
export function mobById(
  expansion: MobExpansion,
  id: ResourceId | string,
): MobDefinition | undefined {
  const target = typeof id === 'string' ? tryParseResourceId(id, 'minecraft') : id;
  if (target === null) return undefined;
  return expansion.mobs.find((m) => resourceIdEquals(m.id, target));
}

/** The mobs of one category, in registration order. */
export function mobsByCategory(expansion: MobExpansion, category: MobCategory): readonly MobDefinition[] {
  return expansion.mobs.filter((m) => m.category === category);
}

/** The mobs spawning in a biome category, in registration order. */
export function mobsInBiome(expansion: MobExpansion, category: BiomeCategory): readonly MobDefinition[] {
  return expansion.mobs.filter((m) => m.spawns.biomes.includes(category));
}
