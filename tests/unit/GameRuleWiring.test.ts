import { describe, expect, it } from "vitest";
import {
  createDefaultGameRules,
  resolveRandomTickCount,
  setGameRule,
} from "../../src/simulation/GameRuleFramework";
import {
  shouldWitherDestroyBlock,
  witherExplosionWorld,
} from "../../src/simulation/WitherBoss";
import { RANDOM_TICKS_PER_SUB_CHUNK } from "../../src/simulation/RandomTickSelector";

/**
 * Wiring oracles for the gamerule settings UI (261): the pure selector-count
 * resolution Game.tickRandomBlocks uses, and the mobGriefing destroyable gate
 * Game.applyWitherExplosion funnels through. Game-level behavior (store init,
 * panel edits, persistence) is pinned by GameRulePanel/GameRulesPersistence
 * suites and the browser E2E journey.
 */

describe("resolveRandomTickCount (261)", () => {
  it("defaults to the pre-261 selector count", () => {
    expect(resolveRandomTickCount(createDefaultGameRules())).toBe(RANDOM_TICKS_PER_SUB_CHUNK);
    expect(RANDOM_TICKS_PER_SUB_CHUNK).toBe(3);
  });

  it("propagates edited values verbatim", () => {
    expect(resolveRandomTickCount(setGameRule(createDefaultGameRules(), "randomTickSpeed", 0))).toBe(0);
    expect(resolveRandomTickCount(setGameRule(createDefaultGameRules(), "randomTickSpeed", 7))).toBe(7);
  });

  it("clamps negatives to 0 and falls back on non-integers", () => {
    expect(
      resolveRandomTickCount(setGameRule(createDefaultGameRules(), "randomTickSpeed", -5)),
    ).toBe(0);
    expect(
      resolveRandomTickCount({ ...createDefaultGameRules(), randomTickSpeed: 2.5 }),
    ).toBe(RANDOM_TICKS_PER_SUB_CHUNK);
    expect(
      resolveRandomTickCount({ ...createDefaultGameRules(), randomTickSpeed: "fast" as unknown as number }),
    ).toBe(RANDOM_TICKS_PER_SUB_CHUNK);
  });
});

describe("mobGriefing destroyable gate (261)", () => {
  const base = {
    getBlockState: (_x: number, _y: number, _z: number): number => 1,
    isAir: (s: number): boolean => s === 0,
    isDestroyable: (s: number): boolean => s !== 0 && s !== 6,
    blastResistance: (_s: number): number => 6,
    dropFor: (): string | null => null,
  };

  it("shouldWitherDestroyBlock is closed under mobGriefing=false", () => {
    expect(shouldWitherDestroyBlock(1, false)).toBe(false);
    expect(shouldWitherDestroyBlock(1, true)).toBe(true);
    // Protected ids stay spared even when griefing is on.
    expect(shouldWitherDestroyBlock(6, true)).toBe(false);
  });

  it("witherExplosionWorld kills destroyability when false, delegates when true", () => {
    const off = witherExplosionWorld(base, false);
    expect(off.isDestroyable(1)).toBe(false);
    expect(off.isDestroyable(0)).toBe(false);
    const on = witherExplosionWorld(base, true);
    expect(on.isDestroyable(1)).toBe(true);
    expect(on.isDestroyable(0)).toBe(false);
    expect(on.isDestroyable(6)).toBe(false);
    // Non-gating seams pass through untouched.
    expect(on.blastResistance(1)).toBe(6);
    expect(on.isAir(0)).toBe(true);
  });
});
