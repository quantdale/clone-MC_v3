/**
 * Biome expansion (216): data-driven biome definitions over the biome/worldgen registries —
 * the same no-new-architecture pattern as 215 (the wiring maps these definitions onto 016 and
 * 094-101; registries stay untouched with characterization pinned). Pure and headless-safe.
 *
 * Determinism rules:
 * - Ids are valid namespaced ids (004 rules) whose path does NOT start with 'biome/' (the
 *   registry owns the prefix).
 * - `name` is a non-empty translation key (214); `temperature` is a finite number in [-2, 2]
 *   (default 0.5); `precipitation` is none|rain|snow (default rain); `category` is one of the
 *   eight documented values (default plains); `features` are non-empty strings (default []).
 * - Duplicate ids are rejected; the whole payload validates before anything is accepted.
 * - `createBiomeExpansion` preserves registration order; lookups are total.
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

export type BiomePrecipitation = 'none' | 'rain' | 'snow';

export type BiomeCategory =
  | 'plains'
  | 'forest'
  | 'desert'
  | 'snowy'
  | 'ocean'
  | 'nether'
  | 'end'
  | 'mountain';

const PRECIPITATIONS: readonly string[] = ['none', 'rain', 'snow'];
const CATEGORIES: readonly string[] = [
  'plains',
  'forest',
  'desert',
  'snowy',
  'ocean',
  'nether',
  'end',
  'mountain',
];

/** One data-driven biome definition. */
export interface BiomeDefinition {
  readonly id: ResourceId;
  /** Translation key (214). */
  readonly name: string;
  /** Finite number in [-2, 2] (default 0.5). */
  readonly temperature: number;
  readonly precipitation: BiomePrecipitation;
  readonly category: BiomeCategory;
  /** Feature ids (default []). */
  readonly features: readonly string[];
}

function toResourceId(value: unknown, what: string): ResourceId {
  if (typeof value === 'string') {
    const parsed = tryParseResourceId(value, 'minecraft');
    if (parsed === null) {
      throw new Error(`BiomeExpansion: ${what} must be a valid namespaced id`);
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
      throw new Error(`BiomeExpansion: ${what} must be a valid namespaced id`);
    }
    return createResourceId(r.namespace, r.path);
  }
  throw new Error(`BiomeExpansion: ${what} must be a valid namespaced id`);
}

export interface BiomeDefinitionInput {
  readonly id: ResourceId | string;
  readonly name: string;
  readonly temperature?: number;
  readonly precipitation?: BiomePrecipitation;
  readonly category?: BiomeCategory;
  readonly features?: readonly string[];
}

/** Build a validated biome definition with the documented defaults. */
export function createBiomeDefinition(input: BiomeDefinitionInput): BiomeDefinition {
  const id = toResourceId(input.id, 'id');
  if (id.path.startsWith('biome/')) {
    throw new Error(`BiomeExpansion: id path must not start with 'biome/'`);
  }
  if (typeof input.name !== 'string' || input.name.length === 0) {
    throw new Error('BiomeExpansion: name must be a non-empty string');
  }
  const temperature = input.temperature ?? 0.5;
  if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < -2 || temperature > 2) {
    throw new Error('BiomeExpansion: temperature must be a finite number in [-2, 2]');
  }
  const precipitation = input.precipitation ?? 'rain';
  if (!PRECIPITATIONS.includes(precipitation)) {
    throw new Error('BiomeExpansion: precipitation must be none, rain, or snow');
  }
  const category = input.category ?? 'plains';
  if (!CATEGORIES.includes(category)) {
    throw new Error(
      'BiomeExpansion: category must be one of plains, forest, desert, snowy, ocean, nether, end, or mountain',
    );
  }
  const features = input.features ?? [];
  for (const feature of features) {
    if (typeof feature !== 'string' || feature.length === 0) {
      throw new Error('BiomeExpansion: features must be non-empty strings');
    }
  }
  return {
    id,
    name: input.name,
    temperature,
    precipitation: precipitation as BiomePrecipitation,
    category: category as BiomeCategory,
    features: [...features],
  };
}

/** The validated biome expansion (registration order). */
export interface BiomeExpansion {
  readonly biomes: readonly BiomeDefinition[];
}

/** Build an expansion; duplicate ids are rejected wholesale. */
export function createBiomeExpansion(definitions: readonly BiomeDefinition[]): BiomeExpansion {
  const seen = new Set<string>();
  const biomes: BiomeDefinition[] = [];
  for (const definition of definitions) {
    const key = resourceIdToString(definition.id);
    if (seen.has(key)) {
      throw new Error(`BiomeExpansion: duplicate biome id ${key}`);
    }
    seen.add(key);
    biomes.push(definition);
  }
  return { biomes };
}

/** Look up a biome by id; undefined when missing. */
export function biomeById(
  expansion: BiomeExpansion,
  id: ResourceId | string,
): BiomeDefinition | undefined {
  const target = typeof id === 'string' ? tryParseResourceId(id, 'minecraft') : id;
  if (target === null) return undefined;
  return expansion.biomes.find((b) => resourceIdEquals(b.id, target));
}

/** The biome's feature ids. */
export function featuresFor(biome: BiomeDefinition): readonly string[] {
  return biome.features;
}
