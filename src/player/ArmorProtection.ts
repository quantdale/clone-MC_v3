/**
 * Armor protection rule (change 116).
 *
 * Translates worn armor (points + toughness) into a deterministic damage
 * reduction and applies durability wear to the absorbing pieces. The formula is
 * self-contained and order-independent; the `ArmorProtection` class binds it to a
 * player's `PlayerEquipment` + `ItemTypeRegistry` for the `SurvivalSystem`
 * integration. All functions are pure except `ArmorProtection.applyWear`, which
 * mutates the equipment slots.
 */

import { ARMOR_SLOTS, type PlayerEquipment } from '../inventory/Equipment';
import type { ItemTypeRegistry } from '../inventory/ItemRegistry';
import type { ItemStack } from '../inventory/Inventory';
import { applyDamage } from '../inventory/DurabilityRules';
import { armorEnchantEPF, applyArmorEnchantReduction } from '../inventory/EnchantmentApplication';
import type { EnchantmentRegistry } from '../inventory/EnchantmentRegistry';

/** Aggregated worn-armor protection. Each field is clamped to [0, 20]. */
export interface ArmorStats {
  points: number;
  toughness: number;
}

/** Result of the protection rule. For the non-bypass path, reduced + absorbed === raw. */
export interface ArmorReduction {
  /** HP that still reaches the player's health. */
  reduced: number;
  /** HP the armor absorbed; the sole input to durability wear. */
  absorbed: number;
}

const ARMOR_CEILING = 20;

function clampStat(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(ARMOR_CEILING, value);
}

/**
 * Sum `defensePoints` and `toughness` across the given stacks using
 * `registry.getByLegacyId(stack.id)`. A missing definition or an absent field
 * contributes `0`. Each running total is clamped to [0, 20].
 */
export function computeArmorStats(stacks: ItemStack[], registry: ItemTypeRegistry): ArmorStats {
  let points = 0;
  let toughness = 0;
  for (const stack of stacks) {
    const def = registry.getByLegacyId(stack.id);
    if (!def) continue;
    points = clampStat(points + (def.defensePoints ?? 0));
    toughness = clampStat(toughness + (def.toughness ?? 0));
  }
  return { points, toughness };
}

/**
 * Deterministic protection rule.
 *
 * - `rawDamage <= 0` or `bypassArmor` returns the input unchanged with
 *   `absorbed = 0` (armor does nothing).
 * - Otherwise: armor reduces damage per the curve. `absorbed` is exactly the HP
 *   the armor took and drives durability wear.
 *
 * Formula (independently authored, captures the Minecraft design shape):
 *   armor    = min(20, points)
 *   cap      = armor / 25                       // max 0.8 => 80% at low dmg
 *   tf       = min(20, toughness)
 *   retained = max(0, 1 - sqrt(raw) / (sqrt(raw) + 4 + tf * 2))
 *   absorbed = raw * cap * retained
 *   reduced  = raw - absorbed
 */
export function reduceDamage(
  rawDamage: number,
  stats: ArmorStats,
  bypassArmor: boolean,
): ArmorReduction {
  if (rawDamage <= 0 || bypassArmor) {
    return { reduced: Math.max(0, rawDamage), absorbed: 0 };
  }
  const armor = Math.min(ARMOR_CEILING, stats.points);
  const cap = armor / 25;
  const tf = Math.min(ARMOR_CEILING, stats.toughness);
  const sqrtRaw = Math.sqrt(rawDamage);
  const retained = Math.max(0, 1 - sqrtRaw / (sqrtRaw + 4 + tf * 2));
  const absorbed = Math.max(0, Math.min(rawDamage, rawDamage * cap * retained));
  const reduced = rawDamage - absorbed;
  return { reduced, absorbed };
}

/**
 * Apply `absorbed` HP as equal wear across the worn, durable armor pieces.
 *
 * Returns one entry per input stack in the same order. Each durable piece loses
 * `max(1, ceil(absorbed / pieceCount))` durability via `DurabilityRules.applyDamage`.
 * A piece that breaks (reaches <= 0 remaining durability) is represented as
 * `null`. Non-durable pieces (`maxDurability <= 0`) and `absorbed <= 0` are
 * returned unchanged (no-op).
 */
export function applyArmorWear(
  stacks: ItemStack[],
  absorbed: number,
  registry: ItemTypeRegistry,
): (ItemStack | null)[] {
  const pieceCount = stacks.filter(
    (s) => (registry.getByLegacyId(s.id)?.maxDurability ?? 0) > 0,
  ).length;
  if (absorbed <= 0 || pieceCount === 0) {
    return stacks.map((s) => s);
  }
  const wear = Math.max(1, Math.ceil(absorbed / pieceCount));
  return stacks.map((stack) => {
    const max = registry.getByLegacyId(stack.id)?.maxDurability ?? 0;
    if (max <= 0) return stack; // non-durable: unchanged
    const result = applyDamage(max, stack, wear);
    return result.broke ? null : result.stack;
  });
}

/**
 * Integration wrapper bound to a player's equipment + item registry. A
 * `SurvivalSystem` holds one optional instance.
 */
export class ArmorProtection {
  constructor(
    private readonly equipment: PlayerEquipment,
    private readonly registry: ItemTypeRegistry,
    private readonly enchantRegistry?: EnchantmentRegistry,
  ) {}

  /** Current aggregated armor stats from the worn pieces. */
  getStats(): ArmorStats {
    return computeArmorStats(this.equipment.getArmorStacks(), this.registry);
  }

  /**
   * Reduce `rawDamage` using the current worn stats and the protection-family
   * enchantment EPF for `damageType` (change 119). Without an `enchantRegistry`
   * the result matches the prior EPF-less reduction. The armor `absorbed` value
   * (durability wear driver) is preserved unchanged.
   */
  reduce(rawDamage: number, bypassArmor: boolean, damageType?: string): ArmorReduction {
    const base = reduceDamage(rawDamage, this.getStats(), bypassArmor);
    if (bypassArmor || !this.enchantRegistry) return base;
    const epf = armorEnchantEPF(this.equipment.getArmorStacks(), this.enchantRegistry, damageType);
    return { reduced: applyArmorEnchantReduction(base.reduced, epf), absorbed: base.absorbed };
  }

  /**
   * Apply durability wear for `absorbed` HP to the worn pieces. No-op when
   * `absorbed <= 0`. Broken pieces clear their equipment slot (consumed).
   */
  applyWear(absorbed: number): void {
    if (absorbed <= 0) return;
    const worn = this.equipment.getArmorStacks();
    const updated = applyArmorWear(worn, absorbed, this.registry);
    let i = 0;
    for (const slot of ARMOR_SLOTS) {
      const current = this.equipment.getEquipment(slot);
      if (!current) continue;
      this.equipment.setEquipment(slot, updated[i++] ?? null);
    }
  }
}
