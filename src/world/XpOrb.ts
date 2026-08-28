/**
 * XP orb entity model (117).
 *
 * An `XpOrb` is a free-floating world object carrying a positive-integer amount of
 * XP. It mirrors `ItemEntity` (111): a strict `createXpOrb` constructor and a
 * `typeKey` matching the 037 `SerializedEntity` contract so orbs can later plug
 * into the chunk-grouped entity store (129+/131).
 */

/** Registry type key for XP orbs, matching the 037 `SerializedEntity` contract. */
export const XP_ORB_TYPE_KEY = 'minecraft:xp_orb';

/** A live world XP orb. */
export interface XpOrb {
  /** Unique non-negative integer minted by the manager. */
  readonly id: number;
  /** Positive integer XP carried by the orb. */
  value: number;
  /** World X (float). */
  x: number;
  /** World Y (float). */
  y: number;
  /** World Z (float). */
  z: number;
  /** Stored horizontal/vertical motion; integrated later (130), unused in 117. */
  vx: number;
  /** Stored vertical motion. */
  vy: number;
  /** Stored horizontal motion. */
  vz: number;
  /** Age in simulation ticks; advanced by `tickItemEntities`. */
  ageTicks: number;
}

/** Constructor arguments for {@link createXpOrb}. */
export interface CreateXpOrbOptions {
  id: number;
  value: number;
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  ageTicks?: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Strict `XpOrb` constructor. Validates a non-negative integer `id`, a positive
 * integer `value`, finite coordinates/velocity, and a non-negative integer
 * `ageTicks`. Throws a descriptive `Error` on any invalid field.
 */
export function createXpOrb(opts: CreateXpOrbOptions): XpOrb {
  if (!Number.isInteger(opts.id) || opts.id < 0) {
    throw new Error(`XpOrb: id must be a non-negative integer (got ${String(opts.id)})`);
  }
  if (!Number.isInteger(opts.value) || opts.value < 1) {
    throw new Error(`XpOrb: value must be a positive integer (got ${String(opts.value)})`);
  }
  if (!isFiniteNumber(opts.x) || !isFiniteNumber(opts.y) || !isFiniteNumber(opts.z)) {
    throw new Error('XpOrb: x/y/z must be finite numbers');
  }
  const vx = opts.vx ?? 0;
  const vy = opts.vy ?? 0;
  const vz = opts.vz ?? 0;
  if (!isFiniteNumber(vx) || !isFiniteNumber(vy) || !isFiniteNumber(vz)) {
    throw new Error('XpOrb: vx/vy/vz must be finite numbers');
  }
  const ageTicks = opts.ageTicks ?? 0;
  if (!Number.isInteger(ageTicks) || ageTicks < 0) {
    throw new Error(`XpOrb: ageTicks must be a non-negative integer (got ${String(ageTicks)})`);
  }
  return {
    id: opts.id,
    value: opts.value,
    x: opts.x,
    y: opts.y,
    z: opts.z,
    vx,
    vy,
    vz,
    ageTicks,
  };
}
