/**
 * Vanilla gunpowder mob drop tables (297).
 *
 * Pure resolution of the vanilla `entities/creeper` gunpowder pool and the full
 * `entities/witch` table (the only witch pool that carries gunpowder). The 011
 * `LootTable` engine cannot express vanilla's `uniform(0, 2)` counts (its entry
 * minimum is 1), so this module rolls them directly with a fixed, documented
 * RNG draw order that a scripted RNG can pin:
 *
 * - creeper: `count = uniformInt(0, 2)` then `+ uniformInt(0, looting)` (the
 *   looting term draws only when `looting > 0`).
 * - witch: `rolls = uniformInt(1, 3)`; per roll: one weighted pick over
 *   {@link WITCH_LOOT_ENTRIES} (total weight {@link WITCH_TOTAL_WEIGHT}), then
 *   `count = uniformInt(0, 2)`, then the looting term.
 *
 * Entries whose `minecraft:<key>` item is not registered (glowstone dust, sugar,
 * spider eye, glass bottle do not exist yet) are rolled and DISCARDED — not
 * re-rolled — so the odds of every present item (gunpowder, redstone, stick)
 * stay exactly vanilla. Zero counts emit nothing; stacks of the same item merge.
 * Ghasts and live creepers do not exist in the clone; `ghast` (and any other
 * unknown mob) resolves to no drops. No looting enchantment exists, so the live
 * game always passes `looting = 0`.
 */
import type { ItemTypeRegistry } from '../inventory/ItemRegistry';
import type { LootStack, RandomSource } from '../inventory/LootTable';

/** Vanilla creeper gunpowder count upper bound (before looting). */
export const CREEPER_GUNPOWDER_MAX = 2;
/** Vanilla witch roll count bounds (uniform, inclusive). */
export const WITCH_ROLLS_MIN = 1;
export const WITCH_ROLLS_MAX = 3;
/** Vanilla per-entry witch count upper bound (before looting). */
export const WITCH_ENTRY_COUNT_MAX = 2;
/** Looting levels beyond this are clamped (defensive; no enchantment exists). */
export const MAX_LOOTING_LEVEL = 10;

/** One weighted witch table entry (item key without namespace). */
export interface WitchLootEntry {
  readonly itemKey: string;
  readonly weight: number;
}

/** The vanilla witch pool, in vanilla entry order. */
export const WITCH_LOOT_ENTRIES: readonly WitchLootEntry[] = Object.freeze([
  { itemKey: 'glowstone_dust', weight: 1 },
  { itemKey: 'sugar', weight: 1 },
  { itemKey: 'redstone', weight: 1 },
  { itemKey: 'spider_eye', weight: 1 },
  { itemKey: 'glass_bottle', weight: 1 },
  { itemKey: 'gunpowder', weight: 1 },
  { itemKey: 'stick', weight: 2 },
]);

/** Sum of {@link WITCH_LOOT_ENTRIES} weights (vanilla: 8). */
export const WITCH_TOTAL_WEIGHT = WITCH_LOOT_ENTRIES.reduce((sum, e) => sum + e.weight, 0);

/** Mob type keys with a gunpowder-bearing table. */
export type GunpowderMobKey = 'creeper' | 'witch';

/** One resolved roll, including discarded ones (for observability/tests). */
export interface MobDropRoll {
  readonly itemKey: string;
  readonly count: number;
  /** Why the roll emitted nothing, if it did not. */
  readonly dropped?: 'zero-count' | 'missing-item';
}

export interface MobDropResult {
  /** Merged, positive stacks ready for `ItemEntityManager.spawnLootStacks`. */
  readonly stacks: readonly LootStack[];
  readonly rolls: readonly MobDropRoll[];
}

const EMPTY: MobDropResult = Object.freeze({ stacks: Object.freeze([]), rolls: Object.freeze([]) });

function draw(rng: RandomSource): number {
  const v = rng();
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v >= 1) return 1 - Number.EPSILON;
  return v;
}

/** Vanilla-style inclusive uniform integer in `[min, max]` from one rng draw. */
export function uniformInt(rng: RandomSource, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.min(max - min, Math.floor(draw(rng) * (max - min + 1)));
}

/** Clamp a looting level to an integer in `[0, MAX_LOOTING_LEVEL]`. */
export function normalizeLooting(looting: unknown): number {
  if (typeof looting !== 'number' || !Number.isFinite(looting)) return 0;
  return Math.max(0, Math.min(MAX_LOOTING_LEVEL, Math.floor(looting)));
}

function lootingBonus(rng: RandomSource, looting: number): number {
  return looting > 0 ? uniformInt(rng, 0, looting) : 0;
}

/** Weighted pick over the witch entries from one rng draw. */
export function pickWitchEntry(rng: RandomSource): WitchLootEntry {
  let ticket = Math.floor(draw(rng) * WITCH_TOTAL_WEIGHT);
  for (const entry of WITCH_LOOT_ENTRIES) {
    if (ticket < entry.weight) return entry;
    ticket -= entry.weight;
  }
  return WITCH_LOOT_ENTRIES[WITCH_LOOT_ENTRIES.length - 1]!;
}

class StackMerger {
  private readonly order: number[] = [];
  private readonly counts = new Map<number, number>();
  readonly rolls: MobDropRoll[] = [];

  add(registry: ItemTypeRegistry, itemKey: string, count: number): void {
    if (count <= 0) {
      this.rolls.push({ itemKey, count: 0, dropped: 'zero-count' });
      return;
    }
    const def = registry.getByKey(itemKey);
    if (!def) {
      this.rolls.push({ itemKey, count, dropped: 'missing-item' });
      return;
    }
    this.rolls.push({ itemKey, count });
    if (!this.counts.has(def.id)) this.order.push(def.id);
    this.counts.set(def.id, (this.counts.get(def.id) ?? 0) + count);
  }

  result(): MobDropResult {
    return {
      stacks: this.order.map((item) => ({ item, count: this.counts.get(item)! })),
      rolls: this.rolls,
    };
  }
}

/** Vanilla creeper drop (gunpowder only; no music disc path exists). */
export function resolveCreeperDrops(registry: ItemTypeRegistry, rng: RandomSource, looting = 0): MobDropResult {
  const lvl = normalizeLooting(looting);
  const merger = new StackMerger();
  const count = uniformInt(rng, 0, CREEPER_GUNPOWDER_MAX) + lootingBonus(rng, lvl);
  merger.add(registry, 'gunpowder', count);
  return merger.result();
}

/** Vanilla witch drop table (1–3 weighted rolls, 0–2 each, missing items discarded). */
export function resolveWitchDrops(registry: ItemTypeRegistry, rng: RandomSource, looting = 0): MobDropResult {
  const lvl = normalizeLooting(looting);
  const merger = new StackMerger();
  const rolls = uniformInt(rng, WITCH_ROLLS_MIN, WITCH_ROLLS_MAX);
  for (let i = 0; i < rolls; i++) {
    const entry = pickWitchEntry(rng);
    const count = uniformInt(rng, 0, WITCH_ENTRY_COUNT_MAX) + lootingBonus(rng, lvl);
    merger.add(registry, entry.itemKey, count);
  }
  return merger.result();
}

/**
 * Resolve the gunpowder-bearing drop table for a mob type key. Unknown keys
 * (including `ghast`, which is not present in the clone) return no drops.
 */
export function resolveMobGunpowderDrops(
  typeKey: string,
  registry: ItemTypeRegistry,
  rng: RandomSource,
  looting = 0,
): MobDropResult {
  switch (typeKey) {
    case 'creeper':
      return resolveCreeperDrops(registry, rng, looting);
    case 'witch':
      return resolveWitchDrops(registry, rng, looting);
    default:
      return EMPTY;
  }
}

/**
 * Build a cycling scripted RNG over `values` (each finite and in `[0, 1)`), or
 * null when the sequence is empty or invalid. Used by test/debug seams.
 */
export function createScriptedRandom(values: readonly unknown[]): RandomSource | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const list: number[] = [];
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v >= 1) return null;
    list.push(v);
  }
  let i = 0;
  return () => {
    const v = list[i % list.length]!;
    i++;
    return v;
  };
}
