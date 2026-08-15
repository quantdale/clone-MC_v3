/**
 * Player experience system (117).
 *
 * Owns the player's XP/level track, the deterministic leveling cost curve, and a
 * strict snapshot/restore pair that mirrors `SurvivalSystem`. XP is never negative
 * and `level` only rises through `addXp`. The persisted payload is a small
 * `version:1` object so it can live beside `survival` in the game/player-state
 * save envelopes.
 */

/** Persisted experience payload. Mirrors `SurvivalSnapshot`'s strict version-1 contract. */
export interface ExperienceSnapshot {
  /** Persistence schema version (starts at 1). */
  version: 1;
  /** Non-negative integer experience level. */
  level: number;
  /** Progress within the current level, `0 <= xp < xpToNext`. */
  xp: number;
}

/**
 * Canonical per-level XP cost (parity). Returns the integer XP required to advance
 * from `level` to `level + 1`:
 * - `level < 16`   → `2·level + 7`
 * - `16 ≤ level < 31` → `5·level − 38`
 * - `level ≥ 31`   → `9·level − 158`
 *
 * The function is continuous at the tier boundaries (e.g. `level 15 → 37`,
 * `level 16 → 42`; `level 30 → 112`, `level 31 → 121`).
 */
export function computeXpToNext(level: number): number {
  const lvl = !Number.isInteger(level) || level < 0 ? 0 : level;
  if (lvl < 16) return 2 * lvl + 7;
  if (lvl < 31) return 5 * lvl - 38;
  return 9 * lvl - 158;
}

/**
 * Lightweight experience rules: an `xp`/`level` state, XP accrual via `addXp`,
 * level spending via `spendLevels` (120), and a strict `snapshot()`/`restore()`
 * pair. Independent of rendering so the same rules can be exercised in unit tests
 * and later surfaced through a HUD bar (205).
 */
export class ExperienceSystem {
  /** Current non-negative integer level. Starts at `0`. */
  level = 0;
  /** Progress within the current level, `0 <= xp < xpToNext`. */
  xp = 0;
  /** Cost to advance from `level` to `level + 1`; derived from `computeXpToNext`. */
  xpToNext: number;

  constructor() {
    this.xpToNext = computeXpToNext(this.level);
  }

  /**
   * Add a non-negative integer of XP. Advances `level` (re-deriving `xpToNext`)
   * one or more times while `xp >= xpToNext`, so that afterwards
   * `0 <= xp < xpToNext`. Non-integer or negative `amount` is ignored (no-op) so a
   * malformed/hostile feed cannot drive `xp` negative or `level` downward.
   */
  addXp(amount: number): void {
    if (!Number.isInteger(amount) || amount < 0) return;
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = computeXpToNext(this.level);
    }
  }

  /** Normalized progress within the current level, in `[0, 1)`. */
  get progress(): number {
    if (this.xpToNext <= 0) return 0;
    return this.xp / this.xpToNext;
  }

  /**
   * Spend `n` levels (120). Reduces `level` by `min(n, level)` (so it can never go
   * negative) and preserves the current progress *fraction* within the level, so the
   * `0 <= xp < xpToNext` invariant always holds afterward. Non-integer, zero, or
   * negative `n` is ignored (no-op), and spending more levels than owned simply
   * spends all owned levels.
   */
  spendLevels(n: number): void {
    if (!Number.isInteger(n) || n <= 0) return;
    const toSpend = Math.min(n, this.level);
    if (toSpend <= 0) return;
    const fraction = this.xpToNext > 0 ? this.xp / this.xpToNext : 0;
    this.level -= toSpend;
    this.xpToNext = computeXpToNext(this.level);
    this.xp = Math.floor(fraction * this.xpToNext);
    if (this.xp >= this.xpToNext) this.xp = this.xpToNext - 1;
    if (this.xp < 0) this.xp = 0;
  }

  /** Capture the current state for persistence. */
  snapshot(): ExperienceSnapshot {
    return { version: 1, level: this.level, xp: this.xp };
  }

  /**
   * Restore from an unknown value. Returns `true` and commits when the payload is a
   * valid `version:1` object with an integer `level >= 0` and finite `xp >= 0`;
   * `xp` is defensively clamped into `[0, xpToNext)`. Returns `false` (and leaves
   * state unchanged) for any malformed input (`version !== 1`, non-integer `level`,
   * or `xp < 0`).
   */
  restore(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<ExperienceSnapshot>;
    if (
      candidate.version !== 1 ||
      !Number.isInteger(candidate.level) ||
      (candidate.level as number) < 0 ||
      typeof candidate.xp !== 'number' ||
      !Number.isFinite(candidate.xp) ||
      (candidate.xp as number) < 0
    ) {
      return false;
    }
    const level = candidate.level as number;
    const xp = candidate.xp as number;
    const xpToNext = computeXpToNext(level);
    this.level = level;
    this.xp = Math.min(Math.max(0, xp), xpToNext - 1);
    this.xpToNext = xpToNext;
    return true;
  }
}
