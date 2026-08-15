/**
 * Enchantment effect application (change 119).
 *
 * Bridges the `118-enchantment-registry` definitions to the live game pathways:
 *
 * - **Storage** — read/write enchantments carried on an `ItemStack` via the
 *   `ENCHANTMENTS_COMPONENT` (`minecraft:enchantments`, a `resourceId -> level`
 *   record).
 * - **Mining** — `efficiencySpeedMultiplier`, `silkTouchActive`, `fortuneBonusCount`.
 * - **Durability** — `unbreakingWearChance` (consumed by `DurabilityRules`).
 * - **Armor** — `protectionEPF`, `protectionEnchantKeysFor`, `armorEnchantEPF`,
 *   `applyArmorEnchantReduction` (composed by `ArmorProtection.reduce`).
 * - **Weapon** — `weaponDamageBonus`, a pure, tested primitive for a future
 *   attack pathway (application is an explicit non-goal for 119).
 *
 * Every function is pure and deterministic (except `fortuneBonusCount`, which
 * takes the `rng` it draws from) so later changes (enchanting table 120,
 * anvil/grindstone/mending 948/949/2202/2203) can reuse them.
 */

import { type ResourceId, parseResourceId, resourceIdToString } from '../data/ResourceId';
import {
  ENCHANTMENTS_COMPONENT,
  emptyStackComponents,
} from './StackDataComponents';
import type { ItemStack } from './Inventory';
import {
  type EnchantmentInstance,
  type EnchantmentRegistry,
  validateEnchantmentList,
} from './EnchantmentRegistry';

/** Type guard read of the `ENCHANTMENTS_COMPONENT` value. */
type EnchantmentRecord = Readonly<Record<string, number>>;

/**
 * Read the enchantments carried by a stack. Returns `[]` when the component is
 * absent. Entries whose key fails to parse or is not in the registry are skipped
 * defensively (write-time validation already guarantees well-formed data).
 */
export function getStackEnchantments(stack: ItemStack, registry: EnchantmentRegistry): EnchantmentInstance[] {
  const record = stack.components?.get<EnchantmentRecord>(ENCHANTMENTS_COMPONENT);
  if (!record) return [];
  const out: EnchantmentInstance[] = [];
  for (const key of Object.keys(record)) {
    let rid: ResourceId;
    try {
      rid = parseResourceId(key);
    } catch {
      continue;
    }
    if (!registry.getByResourceId(rid)) continue;
    out.push({ id: rid, level: record[key]! });
  }
  return out;
}

/**
 * Level of the enchantment identified by `key`, or `0` when the stack has no
 * enchantments, the key is unknown, or the level is absent.
 */
export function getEnchantmentLevel(stack: ItemStack, key: string, registry: EnchantmentRegistry): number {
  const def = registry.getByKey(key);
  if (!def) return 0;
  const record = stack.components?.get<EnchantmentRecord>(ENCHANTMENTS_COMPONENT);
  if (!record) return 0;
  const level = record[resourceIdToString(def.resourceId)];
  return typeof level === 'number' && level >= 1 ? level : 0;
}

/**
 * Validate `instances` via the registry and store them as the
 * `ENCHANTMENTS_COMPONENT` on a new `ItemStack`. An empty list removes the
 * component (yielding a pristine stack). Never mutates `stack`; throws
 * `RegistryError` (`UNKNOWN_ENCHANTMENT` / `LEVEL_OUT_OF_RANGE` /
 * `ENCHANTMENT_CONFLICT`) on invalid input without writing anything.
 */
export function setStackEnchantments(
  stack: ItemStack,
  instances: EnchantmentInstance[],
  registry: EnchantmentRegistry,
): ItemStack {
  validateEnchantmentList(instances, registry);
  if (instances.length === 0) {
    if (stack.components?.has(ENCHANTMENTS_COMPONENT)) {
      return { ...stack, components: stack.components.without(ENCHANTMENTS_COMPONENT) };
    }
    return stack;
  }
  const record: Record<string, number> = {};
  for (const instance of instances) {
    record[resourceIdToString(instance.id)] = instance.level;
  }
  const map = stack.components ?? emptyStackComponents();
  return { ...stack, components: map.with(ENCHANTMENTS_COMPONENT, record) };
}

// ── Mining effect primitives ────────────────────────────────────────────────

/** Speed multiplier applied to break duration for an Efficiency level. */
export function efficiencySpeedMultiplier(level: number): number {
  return 1 + 0.3 * Math.max(0, level);
}

/** Whether a Silk Touch level is active. */
export function silkTouchActive(level: number): boolean {
  return level >= 1;
}

/** Extra Fortune drops in `0..level` for a given `rng` (0 when `level <= 0`). */
export function fortuneBonusCount(level: number, rng: () => number): number {
  if (level <= 0) return 0;
  return Math.floor(rng() * (level + 1));
}

// ── Durability effect primitive ─────────────────────────────────────────────

/** Probability that a wear event actually degrades an Unbreaking item. */
export function unbreakingWearChance(level: number): number {
  return 1 / (Math.max(0, level) + 1);
}

// ── Weapon effect primitive (non-goal application) ──────────────────────────

/**
 * Extra damage contributed by a weapon enchantment. Sharpness adds
 * `1 + 0.5*level`; Smite and Bane of Arthropods add `2.5*level`; all others
 * contribute `0`. Pure and deterministic; not wired to any combat pathway in 119.
 */
export function weaponDamageBonus(key: string, level: number): number {
  if (level <= 0) return 0;
  switch (key) {
    case 'sharpness':
      return 1 + 0.5 * level;
    case 'smite':
    case 'bane_of_arthropods':
      return 2.5 * level;
    default:
      return 0;
  }
}

// ── Armor protection EPF primitives ─────────────────────────────────────────

/**
 * Enchantment protection factor contributed by one enchantment of `kind` at
 * `level`: `protection` gives `level`; the specialized fire/blast/projectile
 * enchants each give `2*level`.
 */
export function protectionEPF(kind: string, level: number): number {
  return kind === 'protection' ? level : 2 * level;
}

/**
 * The protection-family enchant keys that mitigate `damageType`. Always includes
 * `protection` (reduces all damage); adds the matching specialized key for
 * fire/lava, explosion/blast, and projectile/arrow damage. Falls back to
 * `['protection']` for generic/fall/drowning/starvation damage.
 */
export function protectionEnchantKeysFor(damageType?: string): string[] {
  const type = typeof damageType === 'string' ? damageType.toLowerCase() : '';
  let specialized: string | null = null;
  if (type === 'fire' || type === 'lava') {
    specialized = 'fire_protection';
  } else if (type === 'explosion' || type === 'blast') {
    specialized = 'blast_protection';
  } else if (type === 'projectile' || type === 'arrow') {
    specialized = 'projectile_protection';
  }
  return specialized === null ? ['protection'] : ['protection', specialized];
}

/**
 * Sum the protection EPF across all worn stacks for `damageType`, capped at 20.
 * Only enchants whose key is in `protectionEnchantKeysFor(damageType)` count.
 */
export function armorEnchantEPF(
  stacks: ItemStack[],
  registry: EnchantmentRegistry,
  damageType?: string,
): number {
  const keys = protectionEnchantKeysFor(damageType);
  let epf = 0;
  for (const stack of stacks) {
    for (const instance of getStackEnchantments(stack, registry)) {
      const def = registry.getByResourceId(instance.id);
      if (keys.includes(def.key)) {
        epf += protectionEPF(def.key, instance.level);
      }
    }
  }
  return Math.min(20, epf);
}

/** Apply the protection EPF to the post-armor `reduced` damage. */
export function applyArmorEnchantReduction(reduced: number, epf: number): number {
  return epf > 0 ? reduced / (epf + 1) : reduced;
}
