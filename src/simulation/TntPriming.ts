/**
 * TNT priming (170): the first consumer of 169's explosion core. A TNT block is stateless; when it
 * is primed (by redstone power or an adjacent fire block) it disappears as a block and becomes a
 * `PrimedTnt` descriptor — vanilla's PrimedTnt *entity* modeled as pure data, exactly as 167's
 * `DroppedItem` modeled a world drop. The fuse counts down on the fixed 20 TPS clock; when it
 * reaches zero, `explodePrimedTnt` runs 169's `computeExplosion` with strength 4 centered on the
 * primed position.
 *
 * Fuse semantics match vanilla: redstone priming gives 80 ticks (4 seconds); fire priming is
 * vanilla's *random* 10-30 ticks, for which this deterministic core uses the fixed middle value 20
 * (documented stand-in, consistent with 169's no-random-roll stance). The block-level trigger is
 * 162-style (a powered consumer — NOT the inverted lockout of 166-168): `tntShouldPrime(powered,
 * fireAdjacent)` is simply `powered || fireAdjacent`.
 */
import { computeExplosion, type ExplosionResult, type ExplosionWorld } from './ExplosionCore';

/** TNT's explosion strength (vanilla). */
export const TNT_STRENGTH = 4;
/** Fuse when primed by redstone (vanilla: 80 ticks = 4 seconds at 20 TPS). */
export const TNT_FUSE_TICKS_REDSTONE = 80;
/** Fuse when primed by fire: deterministic stand-in for vanilla's random 10-30 ticks. */
export const TNT_FUSE_TICKS_FIRE = 20;

/** What primed the TNT. */
export type TntPrimingCause = 'redstone' | 'fire';

/** A primed TNT (vanilla's PrimedTnt entity, modeled as pure data). */
export interface PrimedTnt {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Remaining fuse in ticks (<= 0 means due to explode). */
  readonly fuseTicks: number;
  readonly strength: number;
}

/** The fuse length for a priming cause. */
export function tntFuseTicks(cause: TntPrimingCause): number {
  return cause === 'redstone' ? TNT_FUSE_TICKS_REDSTONE : TNT_FUSE_TICKS_FIRE;
}

/**
 * Whether a TNT block primes right now: it is a 162-style *powered* consumer (not the 166-168
 * inverted lockout) and additionally primes when fire is adjacent.
 */
export function tntShouldPrime(powered: boolean, fireAdjacent: boolean): boolean {
  return powered || fireAdjacent;
}

/** Create a primed TNT at a block position. */
export function primeTnt(
  x: number,
  y: number,
  z: number,
  cause: TntPrimingCause,
  strength: number = TNT_STRENGTH,
): PrimedTnt {
  return { x, y, z, fuseTicks: tntFuseTicks(cause), strength };
}

function normalizeTicks(t: number): number {
  return Number.isFinite(t) && t > 0 ? t : 0;
}

/** Advance a primed TNT by `elapsedTicks` on the fixed tick clock; fuse clamps at 0. */
export function tickPrimedTnt(primed: PrimedTnt, elapsedTicks: number): PrimedTnt {
  const elapsed = normalizeTicks(elapsedTicks);
  const fuse = primed.fuseTicks - elapsed;
  return { ...primed, fuseTicks: fuse < 0 ? 0 : fuse };
}

/** Whether a primed TNT has reached the end of its fuse (and should explode). */
export function primedTntIsDue(primed: PrimedTnt): boolean {
  return primed.fuseTicks <= 0;
}

/**
 * Detonate a primed TNT: run 169's `computeExplosion` with strength `primed.strength` centered on
 * the primed position (block center). The caller applies the returned destroyed/drops to the real
 * world (164-style write-back) — this module only computes.
 */
export function explodePrimedTnt<S>(primed: PrimedTnt, world: ExplosionWorld<S>): ExplosionResult {
  return computeExplosion({
    center: [primed.x + 0.5, primed.y + 0.5, primed.z + 0.5],
    strength: primed.strength,
    world,
  });
}
