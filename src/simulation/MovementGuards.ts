/**
 * Shared finite-position guard for the movement-authority/reconciliation pair
 * (227/228).
 *
 * `MovementAuthority` validates client intents and `MovementReconciler` validates
 * prediction/reconciliation payloads; both must reject the same malformed shapes
 * (null, non-object, non-finite coordinates) with the same rule, so the predicate
 * lives here once instead of being duplicated in each module. Pure, headless-safe,
 * no IO.
 */
export interface Position {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * True only for an object whose `x`, `y` and `z` are all finite numbers.
 *
 * Rejects null, primitives, arrays in the general case, and any coordinate that is
 * `NaN`, `+/-Infinity` or a non-number. The check is structural only: extra
 * properties are ignored, and no coercion is performed.
 */
export function isFinitePosition(value: unknown): value is Position {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.x === 'number' &&
    Number.isFinite(p.x) &&
    typeof p.y === 'number' &&
    Number.isFinite(p.y) &&
    typeof p.z === 'number' &&
    Number.isFinite(p.z)
  );
}
