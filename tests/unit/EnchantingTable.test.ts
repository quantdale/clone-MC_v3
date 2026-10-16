import { describe, expect, it } from 'vitest';
import { SeedRng } from '../../src/simulation/SeedRng';
import {
  createDefaultEnchantmentRegistry,
  type EnchantmentRegistry,
} from '../../src/inventory/EnchantmentRegistry';
import {
  createDefaultItemRegistry,
  ItemId,
  type ItemTypeDefinition,
} from '../../src/inventory/ItemRegistry';
import { ExperienceSystem } from '../../src/player/ExperienceSystem';
import { getStackEnchantments } from '../../src/inventory/EnchantmentApplication';
import {
  createSession,
  enchantCosts,
  generateEnchantments,
  slotCost,
  type EnchantOffer,
} from '../../src/inventory/EnchantingTable';

const reg: EnchantmentRegistry = createDefaultEnchantmentRegistry();
const itemReg = createDefaultItemRegistry();
const pickaxeDef: ItemTypeDefinition = itemReg.getByLegacyId(ItemId.WoodenPickaxe)!;
const appleDef: ItemTypeDefinition = itemReg.getByLegacyId(ItemId.Apple)!;

const buildSession = (itemDef: ItemTypeDefinition, id: number, bookShelves: number, playerLevel: number, seed = 12345) =>
  createSession({
    stack: { id, count: 1 },
    itemDef,
    bookShelves,
    playerLevel,
    seed,
    registry: reg,
  });

describe('slotCost bounds', () => {
  it('returns an integer in [1, 255] across slots, enchantabilities, levels, and seeds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = new SeedRng(seed);
      for (const slot of [0, 1, 2]) {
        for (const ench of [0, 5, 15, 30]) {
          for (const lvl of [1, 10, 30, 50]) {
            const c = slotCost(slot, ench, lvl, rng);
            expect(Number.isInteger(c)).toBe(true);
            expect(c).toBeGreaterThanOrEqual(1);
            expect(c).toBeLessThanOrEqual(255);
          }
        }
      }
    }
  });
});

describe('generateEnchantments invariants', () => {
  it('returns only applicable, in-range, non-conflicting enchantments', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = new SeedRng(seed);
      for (const power of [1, 5, 20, 50, 200]) {
        const out = generateEnchantments(pickaxeDef, power, rng, reg);
        for (let i = 0; i < out.length; i++) {
          const inst = out[i]!;
          const def = reg.getByResourceId(inst.id);
          expect(def).toBeTruthy();
          // applicable
          expect(reg.appliesTo(def!, pickaxeDef)).toBe(true);
          // in range
          expect(inst.level).toBeGreaterThanOrEqual(1);
          expect(inst.level).toBeLessThanOrEqual(def!.maxLevel);
          // pairwise non-conflicting
          for (let j = i + 1; j < out.length; j++) {
            expect(reg.areIncompatible(inst.id, out[j]!.id)).toBe(false);
          }
        }
      }
    }
  });

  it('returns [] for a non-enchantable item regardless of power', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new SeedRng(seed);
      expect(generateEnchantments(appleDef, 100, rng, reg)).toEqual([]);
    }
  });

  it('is deterministic for identical rng + inputs', () => {
    const a = generateEnchantments(pickaxeDef, 40, new SeedRng(7), reg);
    const b = generateEnchantments(pickaxeDef, 40, new SeedRng(7), reg);
    expect(b).toEqual(a);
  });
});

describe('enchantCosts caps', () => {
  it('caps xp and lapis at 30', () => {
    expect(enchantCosts(50)).toEqual({ xpLevels: 30, lapis: 30 });
    expect(enchantCosts(30)).toEqual({ xpLevels: 30, lapis: 30 });
  });

  it('floors low levels at 1', () => {
    expect(enchantCosts(0)).toEqual({ xpLevels: 1, lapis: 1 });
    expect(enchantCosts(1)).toEqual({ xpLevels: 1, lapis: 1 });
    expect(enchantCosts(15)).toEqual({ xpLevels: 15, lapis: 15 });
  });
});

describe('createSession determinism and shape', () => {
  it('produces three identical offers for identical inputs', () => {
    const a = buildSession(pickaxeDef, ItemId.WoodenPickaxe, 12, 40);
    const b = buildSession(pickaxeDef, ItemId.WoodenPickaxe, 12, 40);
    expect(a.offers).toHaveLength(3);
    expect(b.offers).toEqual(a.offers);
  });

  it('clamps the bookshelf count to [0, 15]', () => {
    expect(buildSession(pickaxeDef, ItemId.WoodenPickaxe, 99, 10).bookShelves).toBe(15);
    expect(buildSession(pickaxeDef, ItemId.WoodenPickaxe, -5, 10).bookShelves).toBe(0);
  });

  it('exposes cost == level for every offer, capped at 30', () => {
    const s = buildSession(pickaxeDef, ItemId.WoodenPickaxe, 5, 30);
    for (const offer of s.offers as EnchantOffer[]) {
      expect(offer.xpLevels).toBe(offer.level);
      expect(offer.lapis).toBe(offer.level);
      expect(offer.level).toBeLessThanOrEqual(30);
      expect(offer.level).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('session.apply', () => {
  it('spends xp + reports lapis and enchants the stack on success', () => {
    const s = buildSession(pickaxeDef, ItemId.WoodenPickaxe, 15, 50);
    const idx = s.offers.findIndex((o) => o.enchantments.length > 0);
    expect(idx).toBeGreaterThanOrEqual(0);
    const offer = s.offers[idx]!;

    const xp = new ExperienceSystem();
    xp.level = 50;
    const before = xp.level;
    const result = s.apply(idx, { experience: xp, lapisAvailable: 50, registry: reg });

    expect(result.ok).toBe(true);
    expect(result.reason).toBe('ok');
    expect(xp.level).toBe(before - offer.xpLevels);
    expect(result.xpSpent).toBe(offer.xpLevels);
    expect(result.lapisSpent).toBe(offer.lapis);
    const enchanted = getStackEnchantments(result.stack!, reg);
    expect(enchanted).toEqual(offer.enchantments);
  });

  it('does not spend on insufficient xp', () => {
    const s = buildSession(pickaxeDef, ItemId.WoodenPickaxe, 15, 50);
    const xp = new ExperienceSystem();
    xp.level = 2;
    const result = s.apply(0, { experience: xp, lapisAvailable: 50, registry: reg });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient_xp');
    expect(xp.level).toBe(2);
    expect(result.stack).toBeUndefined();
  });

  it('does not spend on insufficient lapis', () => {
    const s = buildSession(pickaxeDef, ItemId.WoodenPickaxe, 15, 50);
    const xp = new ExperienceSystem();
    xp.level = 50;
    const result = s.apply(0, { experience: xp, lapisAvailable: 0, registry: reg });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient_lapis');
    expect(xp.level).toBe(50);
  });

  it('rejects an out-of-range offer index', () => {
    const s = buildSession(pickaxeDef, ItemId.WoodenPickaxe, 15, 50);
    const xp = new ExperienceSystem();
    xp.level = 50;
    const result = s.apply(99, { experience: xp, lapisAvailable: 50, registry: reg });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad_offer');
    expect(xp.level).toBe(50);
  });

  it('is a no-op (empty) for a non-enchantable item and spends nothing', () => {
    const s = buildSession(appleDef, ItemId.Apple, 15, 50);
    expect(s.offers.every((o) => o.enchantments.length === 0)).toBe(true);
    const xp = new ExperienceSystem();
    xp.level = 50;
    const result = s.apply(0, { experience: xp, lapisAvailable: 50, registry: reg });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty');
    expect(xp.level).toBe(50);
  });
});
