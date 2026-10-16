/**
 * Enchantment registry.
 *
 * Defines stable enchantment definitions (resource id, display name, maximum
 * level), the per-item-category applicability rules, and the symmetric conflict
 * rules that forbid certain enchantments from coexisting on one item. It also
 * defines the normalized `EnchantmentInstance` model, strict validation of an
 * enchantment list, and the `version:1` persistence envelope.
 *
 * This module is self-contained: it does NOT apply enchantment effects (that is
 * `119-enchantment-application`), attach enchantments to `ItemStack` (119 /
 * equipment), or generate offers at an enchanting table (120).
 */

import { type ResourceId, createResourceId, parseResourceId, resourceIdToString } from '../data/ResourceId';
import { RegistryError } from '../data/Registry';
import { ToolKind } from '../world/BlockRegistry';
import type { ItemTypeDefinition } from './ItemRegistry';

/** Item categories an enchantment may target. */
export type EnchantmentTarget =
  | 'all'
  | 'tool'
  | 'weapon'
  | 'armor'
  | 'pickaxe'
  | 'axe'
  | 'shovel'
  | 'bow'
  | 'fishing_rod';

/** A registered enchantment definition. */
export interface EnchantmentDefinition {
  /** Stable numeric legacy id. This value is the current save identity. */
  id: number;
  /** Stable resource id backing the legacy numeric id. */
  resourceId: ResourceId;
  /** Stable string key. */
  key: string;
  /** Human-readable display name. */
  name: string;
  /** Maximum enchantment level (`>= 1`). */
  maxLevel: number;
  /** Item categories this enchantment may be applied to. */
  targets: EnchantmentTarget[];
  /** Resource ids this enchantment cannot coexist with. */
  incompatibleWith: ResourceId[];
}

/** A concrete enchantment on an item. */
export interface EnchantmentInstance {
  id: ResourceId;
  level: number;
}

/** The `version:1` persistence envelope for a list of enchantments. */
export interface EnchantmentListSnapshot {
  version: 1;
  entries: { id: string; level: number }[];
}

/** Stable numeric legacy ids backing the seeded catalog. */
export enum EnchantmentId {
  Efficiency = 1,
  Fortune = 2,
  SilkTouch = 3,
  Unbreaking = 4,
  Sharpness = 5,
  Smite = 6,
  BaneOfArthropods = 7,
  Protection = 8,
  FireProtection = 9,
  BlastProtection = 10,
  ProjectileProtection = 11,
}

/** Predicate deciding whether an item matches a single target category. */
const APPLICABILITY: Record<EnchantmentTarget, (def: ItemTypeDefinition) => boolean> = {
  all: () => true,
  tool: (def) => def.toolKind !== undefined,
  weapon: (def) => def.isWeapon === true,
  armor: (def) => (def.defensePoints ?? 0) > 0,
  pickaxe: (def) => def.toolKind === ToolKind.Pickaxe,
  axe: (def) => def.toolKind === ToolKind.Axe,
  shovel: (def) => def.toolKind === ToolKind.Shovel,
  bow: (def) => def.isBow === true,
  fishing_rod: (def) => def.isFishingRod === true,
};

/**
 * Whether any of `targets` matches `item`.
 *
 * `all` always matches; reserved targets (`weapon`, `bow`, `fishing_rod`)
 * match only items carrying the corresponding flag (none currently set).
 */
export function enchantmentAppliesTo(
  targets: EnchantmentTarget[],
  item: ItemTypeDefinition,
): boolean {
  return targets.some((target) => APPLICABILITY[target](item));
}

/**
 * Typed registry of enchantment definitions keyed by stable numeric id.
 *
 * Lookups are constant-time via a dense lookup array; resource-id and key maps
 * support compatibility/validation lookups. The numeric `id` is the persistent
 * save identity — generic runtime registry ids are intentionally absent.
 */
export class EnchantmentRegistry {
  private readonly byId = new Map<number, EnchantmentDefinition>();
  private readonly byKey = new Map<string, EnchantmentDefinition>();
  private readonly byResourceId = new Map<string, EnchantmentDefinition>();
  /** Mirrors Map entries for O(1) indexed access in the hot path. */
  private readonly fastLookup: (EnchantmentDefinition | undefined)[] = [];

  constructor(definitions: EnchantmentDefinition[]) {
    for (const def of definitions) {
      if (this.byId.has(def.id)) {
        throw new RegistryError(
          'DUPLICATE_ID',
          String(def.id),
          `duplicate legacy enchantment id: ${def.id}`,
        );
      }
      this.byId.set(def.id, def);
      this.byKey.set(def.key, def);
      this.byResourceId.set(resourceIdToString(def.resourceId), def);
      this.fastLookup[def.id] = def;
    }
  }

  /** Look up an enchantment by numeric id. Throws for unknown ids. */
  get(id: number): EnchantmentDefinition {
    const def = this.getById(id);
    if (!def) {
      throw new RegistryError('MISSING_ID', String(id), `unknown enchantment id: ${id}`);
    }
    return def;
  }

  /** Look up an enchantment by numeric id, returning undefined when absent. */
  getByLegacyId(id: number): EnchantmentDefinition | undefined {
    return this.getById(id);
  }

  /** Look up an enchantment by resource id. Throws for unknown ids. */
  getByResourceId(rid: ResourceId): EnchantmentDefinition {
    const def = this.byResourceId.get(resourceIdToString(rid));
    if (!def) {
      throw new RegistryError('MISSING_ID', resourceIdToString(rid), 'unknown enchantment resource id');
    }
    return def;
  }

  /** Look up an enchantment by key. Returns undefined for unknown keys. */
  getByKey(key: string): EnchantmentDefinition | undefined {
    return this.byKey.get(key);
  }

  /** All registered definitions. */
  all(): EnchantmentDefinition[] {
    return [...this.byId.values()];
  }

  /**
   * Whether two enchantments conflict (symmetric).
   *
   * Two enchantments conflict iff either's `incompatibleWith` contains the
   * other's id. Both ids are resolved via the registry; unknown ids throw
   * `MISSING_ID`.
   */
  areIncompatible(a: ResourceId, b: ResourceId): boolean {
    const defA = this.getByResourceId(a);
    const defB = this.getByResourceId(b);
    const aStr = resourceIdToString(a);
    const bStr = resourceIdToString(b);
    return (
      defA.incompatibleWith.some((r) => resourceIdToString(r) === bStr) ||
      defB.incompatibleWith.some((r) => resourceIdToString(r) === aStr)
    );
  }

  /** Whether `def` may be applied to `item` per its targets. */
  appliesTo(def: EnchantmentDefinition, item: ItemTypeDefinition): boolean {
    return enchantmentAppliesTo(def.targets, item);
  }

  private getById(id: number): EnchantmentDefinition | undefined {
    if (Number.isInteger(id) && id >= 0 && id < this.fastLookup.length) {
      return this.fastLookup[id];
    }
    return this.byId.get(id);
  }
}

/**
 * Validate a list of enchantment instances.
 *
 * Returns `true` only when every instance resolves to a known definition, has an
 * integer `level` in `[1, maxLevel]`, and is pairwise non-conflicting. Throws
 * `RegistryError` with code `UNKNOWN_ENCHANTMENT` for an unknown id,
 * `LEVEL_OUT_OF_RANGE` for a level outside `[1, maxLevel]`, and
 * `ENCHANTMENT_CONFLICT` for a conflicting pair. Never mutates `instances`.
 */
export function validateEnchantmentList(
  instances: EnchantmentInstance[],
  registry: EnchantmentRegistry,
): boolean {
  const defs: EnchantmentDefinition[] = [];
  for (const instance of instances) {
    const def = resolveInstance(registry, instance);
    if (!Number.isInteger(instance.level) || instance.level < 1 || instance.level > def.maxLevel) {
      throw new RegistryError(
        'LEVEL_OUT_OF_RANGE',
        resourceIdToString(instance.id),
        `enchantment level ${instance.level} out of range [1, ${def.maxLevel}] for ${def.key}`,
      );
    }
    defs.push(def);
  }
  for (let i = 0; i < defs.length; i++) {
    for (let j = i + 1; j < defs.length; j++) {
      if (registry.areIncompatible(defs[i]!.resourceId, defs[j]!.resourceId)) {
        throw new RegistryError(
          'ENCHANTMENT_CONFLICT',
          `${defs[i]!.key}+${defs[j]!.key}`,
          `enchantments ${defs[i]!.key} and ${defs[j]!.key} are incompatible`,
        );
      }
    }
  }
  return true;
}

/** Resolve an instance's definition, throwing UNKNOWN_ENCHANTMENT when absent. */
function resolveInstance(
  registry: EnchantmentRegistry,
  instance: EnchantmentInstance,
): EnchantmentDefinition {
  try {
    return registry.getByResourceId(instance.id);
  } catch (err) {
    if (err instanceof RegistryError && err.reason === 'MISSING_ID') {
      throw new RegistryError(
        'UNKNOWN_ENCHANTMENT',
        resourceIdToString(instance.id),
        `unknown enchantment id: ${resourceIdToString(instance.id)}`,
      );
    }
    throw err;
  }
}

/** Serialize enchantment instances into the `version:1` persistence envelope. */
export function serializeEnchantments(instances: EnchantmentInstance[]): EnchantmentListSnapshot {
  return {
    version: 1,
    entries: instances.map((instance) => ({
      id: resourceIdToString(instance.id),
      level: instance.level,
    })),
  };
}

/**
 * Rebuild enchantment instances from a `version:1` snapshot.
 *
 * Validates `version`, id, and level; the first failure throws and yields no
 * partial result (atomic). Throws `INVALID_SNAPSHOT` for a malformed envelope,
 * `INVALID_ENTRY` for a malformed entry, `UNKNOWN_ENCHANTMENT` for an unknown
 * id, and `LEVEL_OUT_OF_RANGE` for an out-of-range level.
 */
export function deserializeEnchantments(
  snapshot: unknown,
  registry: EnchantmentRegistry,
): EnchantmentInstance[] {
  if (typeof snapshot !== 'object' || snapshot === null) {
    throw new RegistryError('INVALID_SNAPSHOT', undefined, 'enchantment snapshot is not an object');
  }
  const candidate = snapshot as Partial<EnchantmentListSnapshot>;
  if (candidate.version !== 1 || !Array.isArray(candidate.entries)) {
    throw new RegistryError('INVALID_SNAPSHOT', undefined, 'enchantment snapshot has invalid version or entries');
  }
  const out: EnchantmentInstance[] = [];
  for (const entry of candidate.entries) {
    if (typeof entry?.id !== 'string' || typeof entry?.level !== 'number') {
      throw new RegistryError('INVALID_ENTRY', undefined, 'enchantment entry has invalid id or level');
    }
    let rid: ResourceId;
    try {
      rid = parseResourceId(entry.id);
    } catch {
      throw new RegistryError('UNKNOWN_ENCHANTMENT', entry.id, `unparseable enchantment id: ${entry.id}`);
    }
    let def: EnchantmentDefinition;
    try {
      def = registry.getByResourceId(rid);
    } catch (err) {
      if (err instanceof RegistryError && err.reason === 'MISSING_ID') {
        throw new RegistryError('UNKNOWN_ENCHANTMENT', entry.id, `unknown enchantment id: ${entry.id}`);
      }
      throw err;
    }
    if (!Number.isInteger(entry.level) || entry.level < 1 || entry.level > def.maxLevel) {
      throw new RegistryError(
        'LEVEL_OUT_OF_RANGE',
        entry.id,
        `enchantment level ${entry.level} out of range [1, ${def.maxLevel}] for ${def.key}`,
      );
    }
    out.push({ id: rid, level: entry.level });
  }
  return out;
}

const rid = (path: string): ResourceId => createResourceId('minecraft', path);

/** Build the default enchantment registry covering every seeded enchantment. */
export function createDefaultEnchantmentRegistry(): EnchantmentRegistry {
  const defs: EnchantmentDefinition[] = [
    {
      id: EnchantmentId.Efficiency,
      resourceId: rid('efficiency'),
      key: 'efficiency',
      name: 'Efficiency',
      maxLevel: 5,
      targets: ['pickaxe', 'axe', 'shovel'],
      incompatibleWith: [],
    },
    {
      id: EnchantmentId.Fortune,
      resourceId: rid('fortune'),
      key: 'fortune',
      name: 'Fortune',
      maxLevel: 3,
      targets: ['pickaxe', 'axe', 'shovel'],
      incompatibleWith: [rid('silk_touch')],
    },
    {
      id: EnchantmentId.SilkTouch,
      resourceId: rid('silk_touch'),
      key: 'silk_touch',
      name: 'Silk Touch',
      maxLevel: 1,
      targets: ['pickaxe', 'axe', 'shovel'],
      incompatibleWith: [rid('fortune')],
    },
    {
      id: EnchantmentId.Unbreaking,
      resourceId: rid('unbreaking'),
      key: 'unbreaking',
      name: 'Unbreaking',
      maxLevel: 3,
      targets: ['all'],
      incompatibleWith: [],
    },
    {
      id: EnchantmentId.Sharpness,
      resourceId: rid('sharpness'),
      key: 'sharpness',
      name: 'Sharpness',
      maxLevel: 5,
      targets: ['weapon'],
      incompatibleWith: [rid('smite'), rid('bane_of_arthropods')],
    },
    {
      id: EnchantmentId.Smite,
      resourceId: rid('smite'),
      key: 'smite',
      name: 'Smite',
      maxLevel: 5,
      targets: ['weapon'],
      incompatibleWith: [rid('sharpness'), rid('bane_of_arthropods')],
    },
    {
      id: EnchantmentId.BaneOfArthropods,
      resourceId: rid('bane_of_arthropods'),
      key: 'bane_of_arthropods',
      name: 'Bane of Arthropods',
      maxLevel: 5,
      targets: ['weapon'],
      incompatibleWith: [rid('sharpness'), rid('smite')],
    },
    {
      id: EnchantmentId.Protection,
      resourceId: rid('protection'),
      key: 'protection',
      name: 'Protection',
      maxLevel: 4,
      targets: ['armor'],
      incompatibleWith: [rid('fire_protection'), rid('blast_protection'), rid('projectile_protection')],
    },
    {
      id: EnchantmentId.FireProtection,
      resourceId: rid('fire_protection'),
      key: 'fire_protection',
      name: 'Fire Protection',
      maxLevel: 4,
      targets: ['armor'],
      incompatibleWith: [rid('protection'), rid('blast_protection'), rid('projectile_protection')],
    },
    {
      id: EnchantmentId.BlastProtection,
      resourceId: rid('blast_protection'),
      key: 'blast_protection',
      name: 'Blast Protection',
      maxLevel: 4,
      targets: ['armor'],
      incompatibleWith: [rid('protection'), rid('fire_protection'), rid('projectile_protection')],
    },
    {
      id: EnchantmentId.ProjectileProtection,
      resourceId: rid('projectile_protection'),
      key: 'projectile_protection',
      name: 'Projectile Protection',
      maxLevel: 4,
      targets: ['armor'],
      incompatibleWith: [rid('protection'), rid('fire_protection'), rid('blast_protection')],
    },
  ];
  return new EnchantmentRegistry(defs);
}
