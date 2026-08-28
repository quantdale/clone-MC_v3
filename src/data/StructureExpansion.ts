/**
 * Structure expansion (217): data-driven structure definitions (template + placement rules)
 * over 099-101's structure systems — the established no-new-architecture pattern (215/216; the
 * placement pipeline consumes these rules; registries stay untouched). Pure and headless-safe.
 *
 * Determinism rules:
 * - Ids are valid namespaced ids (004 rules) whose path does NOT start with 'structure/'.
 * - `name`/`template` are non-empty strings; `biomeCategories` is a non-empty list of 216's
 *   known categories; `spacing` is a positive integer; `separation` is an integer in
 *   [0, spacing) (default 0); `rarity` is a finite number in (0, 1] (default 1); `yRange` is an
 *   integer [min, max] pair with min <= max.
 * - Duplicate ids are rejected; the whole payload validates before anything is accepted.
 * - `createStructureExpansion` preserves registration order; lookups are total.
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

/** The placement rules for one structure. */
export interface StructurePlacement {
  readonly biomeCategories: readonly BiomeCategory[];
  /** Positive integer (chunks). */
  readonly spacing: number;
  /** Integer in [0, spacing) (default 0). */
  readonly separation: number;
  /** Finite number in (0, 1] (default 1). */
  readonly rarity: number;
  /** Integer [min, max] pair with min <= max. */
  readonly yRange: readonly [number, number];
}

/** One data-driven structure definition. */
export interface StructureDefinition {
  readonly id: ResourceId;
  /** Translation key (214). */
  readonly name: string;
  /** Template id (099-101). */
  readonly template: string;
  readonly placement: StructurePlacement;
}

function toResourceId(value: unknown, what: string): ResourceId {
  if (typeof value === 'string') {
    const parsed = tryParseResourceId(value, 'minecraft');
    if (parsed === null) {
      throw new Error(`StructureExpansion: ${what} must be a valid namespaced id`);
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
      throw new Error(`StructureExpansion: ${what} must be a valid namespaced id`);
    }
    return createResourceId(r.namespace, r.path);
  }
  throw new Error(`StructureExpansion: ${what} must be a valid namespaced id`);
}

export interface StructureDefinitionInput {
  readonly id: ResourceId | string;
  readonly name: string;
  readonly template: string;
  readonly placement: {
    readonly biomeCategories: readonly BiomeCategory[];
    readonly spacing: number;
    readonly separation?: number;
    readonly rarity?: number;
    readonly yRange: readonly [number, number];
  };
}

/** Build a validated structure definition with the documented defaults. */
export function createStructureDefinition(input: StructureDefinitionInput): StructureDefinition {
  const id = toResourceId(input.id, 'id');
  if (id.path.startsWith('structure/')) {
    throw new Error(`StructureExpansion: id path must not start with 'structure/'`);
  }
  if (typeof input.name !== 'string' || input.name.length === 0) {
    throw new Error('StructureExpansion: name must be a non-empty string');
  }
  if (typeof input.template !== 'string' || input.template.length === 0) {
    throw new Error('StructureExpansion: template must be a non-empty string');
  }
  const p = input.placement;
  if (p.biomeCategories.length === 0) {
    throw new Error('StructureExpansion: biomeCategories must not be empty');
  }
  for (const category of p.biomeCategories) {
    if (!BIOME_CATEGORIES.includes(category)) {
      throw new Error('StructureExpansion: biomeCategories must be known biome categories');
    }
  }
  if (!Number.isInteger(p.spacing) || p.spacing < 1) {
    throw new Error('StructureExpansion: spacing must be a positive integer');
  }
  const separation = p.separation ?? 0;
  if (!Number.isInteger(separation) || separation < 0 || separation >= p.spacing) {
    throw new Error('StructureExpansion: separation must be an integer in [0, spacing)');
  }
  const rarity = p.rarity ?? 1;
  if (typeof rarity !== 'number' || !Number.isFinite(rarity) || rarity <= 0 || rarity > 1) {
    throw new Error('StructureExpansion: rarity must be a finite number in (0, 1]');
  }
  const [min, max] = p.yRange;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new Error('StructureExpansion: yRange must be an integer [min, max] pair with min <= max');
  }
  return {
    id,
    name: input.name,
    template: input.template,
    placement: {
      biomeCategories: [...p.biomeCategories],
      spacing: p.spacing,
      separation,
      rarity,
      yRange: [min, max],
    },
  };
}

/** The validated structure expansion (registration order). */
export interface StructureExpansion {
  readonly structures: readonly StructureDefinition[];
}

/** Build an expansion; duplicate ids are rejected wholesale. */
export function createStructureExpansion(
  definitions: readonly StructureDefinition[],
): StructureExpansion {
  const seen = new Set<string>();
  const structures: StructureDefinition[] = [];
  for (const definition of definitions) {
    const key = resourceIdToString(definition.id);
    if (seen.has(key)) {
      throw new Error(`StructureExpansion: duplicate structure id ${key}`);
    }
    seen.add(key);
    structures.push(definition);
  }
  return { structures };
}

/** Look up a structure by id; undefined when missing. */
export function structureById(
  expansion: StructureExpansion,
  id: ResourceId | string,
): StructureDefinition | undefined {
  const target = typeof id === 'string' ? tryParseResourceId(id, 'minecraft') : id;
  if (target === null) return undefined;
  return expansion.structures.find((s) => resourceIdEquals(s.id, target));
}

/** The structures placeable in a biome category, in registration order. */
export function structuresInCategory(
  expansion: StructureExpansion,
  category: BiomeCategory,
): readonly StructureDefinition[] {
  return expansion.structures.filter((s) => s.placement.biomeCategories.includes(category));
}
