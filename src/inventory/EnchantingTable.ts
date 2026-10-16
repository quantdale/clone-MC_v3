/**
 * Enchanting-table offer generation + session (change 120).
 *
 * Independent, procedural re-implementation of the enchanting-table flow. It is NOT
 * byte-faithful to Java's `EnchantmentHelper`; instead it satisfies a deterministic,
 * bounded contract:
 *
 * - `slotCost` returns an integer in `[1, 255]` biased by the item's
 *   `enchantability`, the player's level, and seeded jitter.
 * - `generateEnchantments` returns a list of applicable, in-range, mutually
 *   non-conflicting `EnchantmentInstance`s for the item.
 * - `enchantCosts` returns the `{ xpLevels, lapis }` price, capped at 30.
 * - `createSession` builds three deterministic offers from a single `SeedRng` seeded
 *   by the world seed, a fixed stream name, and the (item, bookshelf-count, level)
 *   inputs, so identical inputs always yield identical offers.
 * - `EnchantingTableSession.apply` is atomic: it spends XP + reports lapis only when
 *   both are available, returning the enchanted stack on success or a `{ ok:false }`
 *   with a typed reason on failure — and it never spends anything on failure.
 *
 * All randomness flows from a single `SeedRng`; the module never calls `Math.random`.
 * The DOM presentation panel is an explicit non-goal for 120 (deferred to a later
 * change); this module is the logic-level deliverable it will consume.
 */

import { type ItemTypeDefinition } from './ItemRegistry';
import type { ItemStack } from './Inventory';
import {
  DAMAGE_COMPONENT,
  ENCHANTMENTS_COMPONENT,
  type DamageComponentValue,
} from './StackDataComponents';
import {
  type EnchantmentInstance,
  type EnchantmentRegistry,
} from './EnchantmentRegistry';
import { setStackEnchantments } from './EnchantmentApplication';
import { SeedRng, createNamedRng } from '../simulation/SeedRng';
import type { ExperienceSystem } from '../player/ExperienceSystem';

/** One of the three selectable offers in an enchanting session. */
export interface EnchantOffer {
  /** Displayed enchant level; equal to the XP/lapis cost (capped at 30). */
  level: number;
  /** XP levels required (== `level`, capped at 30). */
  xpLevels: number;
  /** Lapis required (== `level`, capped at 30). */
  lapis: number;
  /** Enchantments granted if this offer is applied. */
  enchantments: EnchantmentInstance[];
}

/** Context supplied at apply-time by the caller (inventory + systems). */
export interface EnchantApplyContext {
  experience: ExperienceSystem;
  /** Count of lapis available to the table/player. */
  lapisAvailable: number;
  registry: EnchantmentRegistry;
}

/** Result of `EnchantingTableSession.apply`. */
export interface EnchantApplyResult {
  ok: boolean;
  stack?: ItemStack;
  xpSpent?: number;
  lapisSpent?: number;
  reason?: 'ok' | 'bad_offer' | 'insufficient_xp' | 'insufficient_lapis' | 'incompatible' | 'empty';
}

/** A deterministic, cached enchanting session for one item + world interaction. */
export interface EnchantingTableSession {
  item: ItemStack;
  /** Bookshelf count used to build the session (clamped to `[0, 15]`). */
  bookShelves: number;
  playerLevel: number;
  /** Three offers, one per table slot. */
  offers: EnchantOffer[];
  /** Apply the offer at `offerIndex`, spending XP + reporting lapis atomically. */
  apply(offerIndex: number, ctx: EnchantApplyContext): EnchantApplyResult;
}

const MAX_BOOKSHELVES = 15;

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * The enchantment "power" (and displayed cost) for one table slot.
 *
 * `base = (slot + 1) + enchantability + clamp(playerLevel, 1, 50)`, then a
 * seeded jitter in `±0.15` is applied before clamping the floored result to
 * `[1, 255]`.
 */
export function slotCost(slot: number, enchantability: number, playerLevel: number, rng: SeedRng): number {
  const base = slot + 1 + enchantability + clamp(playerLevel, 1, 50);
  const f = (rng.nextFloat() + rng.nextFloat() - 1) * 0.15;
  const raw = (base + 1) * f + base;
  return clamp(Math.floor(raw), 1, 255);
}

/**
 * Build a deterministic offer list for the item at the given `power`. Each pick is
 * applicable to the item, in `[1, maxLevel]`, and mutually non-conflicting with every
 * already-chosen enchantment. The loop terminates when the pool is exhausted, the
 * remaining power drops below 1, or a seeded coin-flip ends it.
 */
export function generateEnchantments(
  itemDef: ItemTypeDefinition,
  power: number,
  rng: SeedRng,
  registry: EnchantmentRegistry,
): EnchantmentInstance[] {
  const p = clamp(power, 1, 255);
  // A non-enchantable item (enchantability undefined or 0) never receives offers
  // from the table — even `unbreaking` (target 'all') is excluded here, matching
  // the table's "cannot be enchanted" behavior for such items.
  if ((itemDef.enchantability ?? 0) <= 0) return [];
  const out: EnchantmentInstance[] = [];
  let remaining = p;
  for (;;) {
    const pool = registry.all().filter(
      (e) =>
        e.maxLevel >= 1 &&
        registry.appliesTo(e, itemDef) &&
        out.every((chosen) => !registry.areIncompatible(e.resourceId, chosen.id)),
    );
    if (pool.length === 0) break;
    const pick = weightedRandom(pool, (e) => e.maxLevel + 1, rng);
    const bumped = remaining + Math.floor(rng.nextFloat() * (remaining / 4 + 1));
    const level = clamp(Math.floor(bumped / 16) + 1, 1, pick.maxLevel);
    if (level < 1) break;
    out.push({ id: pick.resourceId, level });
    remaining = Math.floor(remaining / 2);
    if (remaining < 1) break;
    if (rng.nextFloat() < 0.5) break;
  }
  return out;
}

/** XP + lapis cost for a displayed level, both capped at 30. */
export function enchantCosts(level: number): { xpLevels: number; lapis: number } {
  const capped = clamp(level, 1, 30);
  return { xpLevels: capped, lapis: capped };
}

/** Pick an item from `items` with probability proportional to `weightOf`. */
function weightedRandom<T>(items: T[], weightOf: (item: T) => number, rng: SeedRng): T {
  let total = 0;
  for (const item of items) total += weightOf(item);
  let r = rng.nextFloat() * total;
  for (const item of items) {
    r -= weightOf(item);
    if (r < 0) return item;
  }
  return items[items.length - 1]!;
}

/**
 * Build a deterministic enchanting session for one interaction. `bookShelves` is
 * clamped to `[0, 15]`; a single `SeedRng` (world seed + `'enchanting_table'` stream
 * name + item/bookshelf/level inputs) drives all three slot draws so that the same
 * inputs always produce identical offers.
 */
export function createSession(params: {
  stack: ItemStack;
  itemDef: ItemTypeDefinition;
  bookShelves: number;
  playerLevel: number;
  seed: number;
  registry: EnchantmentRegistry;
}): EnchantingTableSession {
  const bookShelves = clamp(Math.floor(params.bookShelves), 0, MAX_BOOKSHELVES);
  const enchantability = params.itemDef.enchantability ?? 0;

  // Mix the world seed + stream name with the interaction inputs into one seed.
  const base = createNamedRng(params.seed, 'enchanting_table');
  let seed = (base.state ^ params.itemDef.id) >>> 0;
  seed = (seed ^ ((bookShelves & 0xff) << 8)) >>> 0;
  seed = (seed ^ ((params.playerLevel & 0xff) << 16)) >>> 0;
  const rng = new SeedRng(seed);

  const offers: EnchantOffer[] = [];
  for (let slot = 0; slot < 3; slot++) {
    const power = slotCost(slot, enchantability, params.playerLevel, rng);
    const enchantments = generateEnchantments(params.itemDef, power, rng, params.registry);
    const costs = enchantCosts(power);
    offers.push({ level: costs.xpLevels, xpLevels: costs.xpLevels, lapis: costs.lapis, enchantments });
  }

  return {
    item: params.stack,
    bookShelves,
    playerLevel: params.playerLevel,
    offers,
    apply(offerIndex, ctx) {
      if (!Number.isInteger(offerIndex) || offerIndex < 0 || offerIndex >= offers.length) {
        return { ok: false, reason: 'bad_offer' };
      }
      const offer = offers[offerIndex]!;
      if (offer.enchantments.length === 0) {
        // No-op offer: never consume XP/lapis.
        return { ok: false, reason: 'empty' };
      }
      if (ctx.experience.level < offer.xpLevels) {
        return { ok: false, reason: 'insufficient_xp' };
      }
      if (ctx.lapisAvailable < offer.lapis) {
        return { ok: false, reason: 'insufficient_lapis' };
      }
      // Compute the enchanted stack first so a validation failure cannot spend XP.
      const stack = setStackEnchantments(params.stack, offer.enchantments, ctx.registry);
      ctx.experience.spendLevels(offer.xpLevels);
      return { ok: true, stack, xpSpent: offer.xpLevels, lapisSpent: offer.lapis, reason: 'ok' };
    },
  };
}

/**
 * Whether the live selected stack is still the item a session was opened
 * against (hardening 2026-08-23): identical id, count, accumulated damage, and
 * enchantment record. Anything else — a consumed unit, extra wear, a different
 * item entirely — voids the session so an apply can never enchant a copy of
 * the captured stack into whatever slot is currently selected.
 */
export function enchantingTargetMatches(
  live: ItemStack | null,
  captured: ItemStack,
): boolean {
  if (!live || live.id !== captured.id || live.count !== captured.count) {
    return false;
  }
  const damageOf = (stack: ItemStack): number =>
    stack.components?.get<DamageComponentValue>(DAMAGE_COMPONENT)?.damage ?? 0;
  if (damageOf(live) !== damageOf(captured)) {
    return false;
  }
  const enchantmentsOf = (stack: ItemStack): string =>
    JSON.stringify(stack.components?.get<Record<string, number>>(ENCHANTMENTS_COMPONENT) ?? {});
  return enchantmentsOf(live) === enchantmentsOf(captured);
}
