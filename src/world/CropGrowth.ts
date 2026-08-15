/**
 * Pure crop-growth model (change 125).
 *
 * Growth is a deterministic function of the current age: each stage is `age + 1`
 * clamped to {@link MAX_AGE}. This keeps growth unit-testable and replayable
 * without any RNG: a crop planted at age 0 reaches maturity in exactly 7 random
 * ticks.
 */

/** Maximum crop age; a crop at this age is mature. */
export const MAX_AGE = 7;

/** Whether a crop age is mature (>= {@link MAX_AGE}). */
export function isMature(age: number): boolean {
  return age >= MAX_AGE;
}

/**
 * The next crop age after one growth stage. Non-integer or negative inputs
 * normalize to 0 (defensive against malformed state reads); otherwise the result
 * is `min(MAX_AGE, age + 1)`, so age never exceeds {@link MAX_AGE}.
 */
export function nextCropAge(age: number): number {
  if (!Number.isInteger(age) || age < 0) {
    return 0;
  }
  return Math.min(MAX_AGE, age + 1);
}
