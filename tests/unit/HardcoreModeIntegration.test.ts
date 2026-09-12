import { describe, expect, it } from "vitest";
import {
  createDefaultHardcoreState,
  effectiveDifficulty,
  forcesPermanentDeath,
  locksDifficulty,
  respawnModeAfterDeath,
  serializeHardcoreState,
  deserializeHardcoreState,
  setHardcore,
} from "../../src/simulation/HardcoreFramework";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_LEVELS,
  deserializeDifficulty,
  parseDifficultyLevel,
  serializeDifficulty,
  type DifficultyLevel,
} from "../../src/simulation/WorldDifficulty";
import { scaledWitherDuration } from "../../src/simulation/WitherSkull";
import type { GameMode } from "../../src/simulation/GameModeFramework";

/**
 * Composition oracles for live hardcore-mode integration (267): the exact
 * 193 + 188 compositions the live Game applies — the difficulty lock matrix,
 * the death-routing matrix, the identity rules behind the seams, the text
 * entry edges, and the wither consumer's effective-difficulty argument.
 * The 193/188 modules stay the unit of behavior; this suite pins the way
 * `Game` composes them (lock × 4 levels, death × 4 modes, parse edges,
 * serialize round-trips) without instantiating the Game.
 */

const MODES: readonly GameMode[] = ["survival", "creative", "adventure", "spectator"];

describe("HardcoreModeIntegration (267)", () => {
  it("defaults are non-hardcore normal (fresh-world contract)", () => {
    const hardcore = createDefaultHardcoreState();
    expect(hardcore).toEqual({ hardcore: false });
    expect(DEFAULT_DIFFICULTY).toBe("normal");
    expect(locksDifficulty(hardcore)).toBe(false);
    expect(forcesPermanentDeath(hardcore)).toBe(false);
    expect(effectiveDifficulty(hardcore, DEFAULT_DIFFICULTY)).toBe("normal");
  });

  it("the lock returns hard for every configured level when enabled", () => {
    const hardcore = setHardcore(createDefaultHardcoreState(), true);
    for (const level of DIFFICULTY_LEVELS) {
      expect(effectiveDifficulty(hardcore, level)).toBe("hard");
    }
  });

  it("the disabled flag passes every configured level through verbatim", () => {
    const hardcore = createDefaultHardcoreState();
    for (const level of DIFFICULTY_LEVELS) {
      expect(effectiveDifficulty(hardcore, level)).toBe(level);
    }
  });

  it("death routes every mode to spectator when enabled, verbatim otherwise", () => {
    const on = setHardcore(createDefaultHardcoreState(), true);
    const off = createDefaultHardcoreState();
    for (const mode of MODES) {
      expect(respawnModeAfterDeath(on, mode)).toBe("spectator");
      expect(respawnModeAfterDeath(off, mode)).toBe(mode);
    }
  });

  it("setHardcore is an identity no-op on the same value, a new state on change", () => {
    const base = createDefaultHardcoreState();
    expect(setHardcore(base, false)).toBe(base);
    const on = setHardcore(base, true);
    expect(on).toEqual({ hardcore: true });
    expect(on).not.toBe(base);
    expect(setHardcore(on, true)).toBe(on);
  });

  it("difficulty text entry trims and lowercases; unknown text is null", () => {
    expect(parseDifficultyLevel("  HARD ")).toBe("hard");
    expect(parseDifficultyLevel("Easy")).toBe("easy");
    expect(parseDifficultyLevel("")).toBeNull();
    expect(parseDifficultyLevel("godmode")).toBeNull();
    expect(parseDifficultyLevel(null)).toBeNull();
  });

  it("both payloads serialize field-for-field and re-validate under the strict readers", () => {
    const hardcore = setHardcore(createDefaultHardcoreState(), true);
    const serialized = serializeHardcoreState(hardcore);
    expect(serialized).toEqual({ version: 1, hardcore: true });
    expect(deserializeHardcoreState(serialized)).toEqual(hardcore);
    expect(deserializeHardcoreState({ version: 1, hardcore: false })).toEqual({ hardcore: false });

    const level: DifficultyLevel = "easy";
    expect(serializeDifficulty(level)).toEqual({ version: 1, level: "easy" });
    expect(deserializeDifficulty(serializeDifficulty(level))).toBe("easy");
  });

  it("the wither consumer hardens under hardcore and matches legacy normal otherwise", () => {
    const off = createDefaultHardcoreState();
    const on = setHardcore(createDefaultHardcoreState(), true);
    for (const kind of ["normal", "blue"] as const) {
      // Default worlds pass effective 'normal' — identical to the pre-267
      // hardcoded argument (I-2 regression pin).
      expect(scaledWitherDuration(kind, effectiveDifficulty(off, "normal"))).toBe(
        scaledWitherDuration(kind, "normal"),
      );
      // Hardcore worlds compute the 'hard' row even with easy configured.
      expect(scaledWitherDuration(kind, effectiveDifficulty(on, "easy"))).toBe(
        scaledWitherDuration(kind, "hard"),
      );
    }
  });
});
