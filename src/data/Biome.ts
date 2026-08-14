/**
 * Biome-type registry (change 016).
 *
 * A biome type is a ResourceId-identified, immutable data record describing one biome with
 * category, temperature, precipitation, and grass/foliage/water/fog colors. A `BiomeRegistry`
 * validates and finalizes a set of definitions on the 003 generic registry core.
 * `createDefaultBiomeRegistry()` provides a representative set of vanilla-like biomes.
 *
 * 016 is additive and gameplay-free: no world/terrain code is migrated; this is the typed data
 * foundation for future biome-aware generation and coloring.
 */

import { type ResourceId, createResourceId, resourceIdToString } from './ResourceId';
import { Registry } from './Registry';

/** High-level biome grouping used by generation and coloring consumers. */
export type BiomeCategory =
  | 'OCEAN'
  | 'PLAINS'
  | 'DESERT'
  | 'EXTREME_HILLS'
  | 'FOREST'
  | 'TAIGA'
  | 'SWAMP'
  | 'RIVER'
  | 'SNOWY_TUNDRA'
  | 'JUNGLE'
  | 'MUSHROOM';

/** Precipitation kind a biome receives. */
export type BiomePrecipitation = 'NONE' | 'RAIN' | 'SNOW';

/**
 * 24-bit RGB color packed as `0xRRGGBB` (integer in `[0, 0xFFFFFF]`).
 * Matches downstream integer color conventions; split with `biomeColorToRGB`.
 */
export type BiomeColor = number;

/** An immutable data record describing one biome type. */
export interface BiomeTypeDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  readonly category: BiomeCategory;
  /** Air temperature in `[−2, 5]`; drives snow line and color blending. */
  readonly temperature: number;
  readonly precipitation: BiomePrecipitation;
  /** 24-bit RGB grass color. */
  readonly grassColor: BiomeColor;
  /** 24-bit RGB foliage color. */
  readonly foliageColor: BiomeColor;
  /** 24-bit RGB water color. */
  readonly waterColor?: BiomeColor;
  /** 24-bit RGB fog/sky tint color. */
  readonly fogColor?: BiomeColor;
}

/** Failure category for biome-type validation. */
export type BiomeErrorReason = 'DUPLICATE_ID' | 'INVALID_VALUE' | 'INVALID_FLAG' | 'INVALID_DEFINITION';

/** Thrown when a biome-type definition or registry operation fails validation. */
export class BiomeError extends Error {
  readonly reason: BiomeErrorReason;
  readonly identifier: string | undefined;

  constructor(reason: BiomeErrorReason, identifier: string | undefined, detail: string) {
    super(`Biome error (${reason}): ${detail}`);
    this.name = 'BiomeError';
    this.reason = reason;
    this.identifier = identifier;
  }
}

/** RGB components of a {@link BiomeColor}. */
export interface BiomeColorRGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const KNOWN_CATEGORIES: readonly BiomeCategory[] = [
  'OCEAN', 'PLAINS', 'DESERT', 'EXTREME_HILLS', 'FOREST', 'TAIGA',
  'SWAMP', 'RIVER', 'SNOWY_TUNDRA', 'JUNGLE', 'MUSHROOM',
];

const KNOWN_PRECIPITATION: readonly BiomePrecipitation[] = ['NONE', 'RAIN', 'SNOW'];

const MIN_TEMPERATURE = -2;
const MAX_TEMPERATURE = 5;
const MAX_COLOR = 0xFFFFFF;
const SNOW_MAX_TEMPERATURE = 0.15;
/** Shared fallback water color used by 016 defaults and 072 water-tint resolution. */
export const DEFAULT_WATER_COLOR = 0x3f76e4;
const DEFAULT_FOG_COLOR = 0xc0d8ff;

/** Red component (0-255) of a {@link BiomeColor}. */
export function biomeColorRed(color: BiomeColor): number {
  return (color >> 16) & 0xff;
}

/** Green component (0-255) of a {@link BiomeColor}. */
export function biomeColorGreen(color: BiomeColor): number {
  return (color >> 8) & 0xff;
}

/** Blue component (0-255) of a {@link BiomeColor}. */
export function biomeColorBlue(color: BiomeColor): number {
  return color & 0xff;
}

/** Pack r/g/b (each 0-255) into a {@link BiomeColor}. */
export function biomeColorFromRGB(rgb: BiomeColorRGB): BiomeColor {
  return ((rgb.r & 0xff) << 16) | ((rgb.g & 0xff) << 8) | (rgb.b & 0xff);
}

/** Unpack a {@link BiomeColor} into r/g/b components. */
export function biomeColorToRGB(color: BiomeColor): BiomeColorRGB {
  return { r: biomeColorRed(color), g: biomeColorGreen(color), b: biomeColorBlue(color) };
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidColor(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COLOR;
}

function validate(def: BiomeTypeDefinition): void {
  if (!KNOWN_CATEGORIES.includes(def.category)) {
    throw new BiomeError('INVALID_FLAG', def.key, `unknown biome category: ${def.category}`);
  }
  if (!KNOWN_PRECIPITATION.includes(def.precipitation)) {
    throw new BiomeError('INVALID_FLAG', def.key, `unknown precipitation: ${def.precipitation}`);
  }
  if (!isFiniteNumber(def.temperature) || def.temperature < MIN_TEMPERATURE || def.temperature > MAX_TEMPERATURE) {
    throw new BiomeError('INVALID_VALUE', def.key, `temperature must be finite in [${MIN_TEMPERATURE}, ${MAX_TEMPERATURE}]`);
  }
  if (!isValidColor(def.grassColor)) {
    throw new BiomeError('INVALID_VALUE', def.key, 'grassColor must be an integer in [0, 0xFFFFFF]');
  }
  if (!isValidColor(def.foliageColor)) {
    throw new BiomeError('INVALID_VALUE', def.key, 'foliageColor must be an integer in [0, 0xFFFFFF]');
  }
  if (def.waterColor !== undefined && !isValidColor(def.waterColor)) {
    throw new BiomeError('INVALID_VALUE', def.key, 'waterColor must be an integer in [0, 0xFFFFFF]');
  }
  if (def.fogColor !== undefined && !isValidColor(def.fogColor)) {
    throw new BiomeError('INVALID_VALUE', def.key, 'fogColor must be an integer in [0, 0xFFFFFF]');
  }
  if (def.precipitation === 'SNOW' && def.temperature > SNOW_MAX_TEMPERATURE) {
    throw new BiomeError(
      'INVALID_DEFINITION',
      def.key,
      `snow biome must have temperature <= ${SNOW_MAX_TEMPERATURE}, got ${def.temperature}`,
    );
  }
}

/**
 * Registry of biome-type definitions built on the 003 generic registry core.
 *
 * Construction validates every definition (unique id, known category/precipitation, finite
 * bounded temperature, valid colors, snow/temperature consistency) and finalizes before any
 * lookup.
 */
export class BiomeRegistry {
  private readonly inner: Registry<BiomeTypeDefinition>;
  private readonly byKeyMap: Map<string, BiomeTypeDefinition> = new Map();

  constructor(definitions: BiomeTypeDefinition[]) {
    this.inner = new Registry<BiomeTypeDefinition>();
    for (const def of definitions) {
      validate(def);
      if (this.inner.has(def.id)) {
        throw new BiomeError('DUPLICATE_ID', resourceIdToString(def.id), 'biome id already registered');
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

  /** Number of registered biome-type definitions. */
  get size(): number {
    return this.inner.size;
  }

  /** Strict lookup by ResourceId. */
  get(id: ResourceId): BiomeTypeDefinition {
    return this.inner.get(id);
  }

  /** Optional lookup by ResourceId. */
  getOptional(id: ResourceId): BiomeTypeDefinition | undefined {
    return this.inner.getOptional(id);
  }

  /** Whether a biome ResourceId is registered. */
  has(id: ResourceId): boolean {
    return this.inner.has(id);
  }

  /** Lookup by short key string (e.g. `'plains'`). Undefined when absent. */
  getByKey(key: string): BiomeTypeDefinition | undefined {
    return this.byKeyMap.get(key);
  }

  /** Strict lookup by dense runtime id assigned at construction. */
  getByRuntimeId(runtimeId: number): BiomeTypeDefinition {
    return this.inner.getByRuntimeId(runtimeId);
  }

  /** All definitions in ascending registration order (deterministic). */
  entries(): readonly BiomeTypeDefinition[] {
    return this.inner.entries().map((entry) => entry.value);
  }
}

const rid = (path: string): ResourceId => createResourceId('minecraft', `biome/${path}`);

function def(
  key: string,
  category: BiomeCategory,
  temperature: number,
  precipitation: BiomePrecipitation,
  grassColor: BiomeColor,
  foliageColor: BiomeColor,
  waterColor: BiomeColor = DEFAULT_WATER_COLOR,
  fogColor: BiomeColor = DEFAULT_FOG_COLOR,
): BiomeTypeDefinition {
  return {
    id: rid(key),
    key,
    name: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    category,
    temperature,
    precipitation,
    grassColor,
    foliageColor,
    waterColor,
    fogColor,
  };
}

/**
 * Default biome registry with a representative, vanilla-like set. Snow biomes are cold enough
 * to receive snow; water/fog colors fall back to deterministic defaults when not specified.
 */
export function createDefaultBiomeRegistry(): BiomeRegistry {
  return new BiomeRegistry([
    def('plains', 'PLAINS', 0.8, 'RAIN', 0x7cbd6b, 0x4b9c3a),
    def('desert', 'DESERT', 2.0, 'NONE', 0xbfb755, 0x9e8b3f),
    def('ocean', 'OCEAN', 0.5, 'RAIN', 0x8eb971, 0x4b9c3a),
    def('mountains', 'EXTREME_HILLS', 0.2, 'RAIN', 0x7cbd6b, 0x4b9c3a),
    def('forest', 'FOREST', 0.7, 'RAIN', 0x79c05a, 0x59ae30),
    def('taiga', 'TAIGA', 0.25, 'RAIN', 0x86b783, 0x68a55f),
    def('snowy_tundra', 'SNOWY_TUNDRA', 0.0, 'SNOW', 0x80b497, 0x60a17b),
    def('swampland', 'SWAMP', 0.8, 'RAIN', 0x6a7039, 0x4b9c3a, 0x4e7a4e, 0xc0d8ff),
    def('jungle', 'JUNGLE', 0.95, 'RAIN', 0x6aa321, 0x4b9c3a),
    def('mushroom_fields', 'MUSHROOM', 0.9, 'RAIN', 0xa0a0a0, 0xa0a0a0, 0xa0a0a0, 0xa0a0a0),
  ]);
}
