/**
 * Ender Dragon boss (183): the largest single boss — a `BossDefinition` consumed by 153's
 * `BossFramework` plus the dragon-specific lifecycle: end crystals (which heal the dragon while
 * alive and are summoned as the fight progresses), a distance-based dragon attack, and the victory
 * transition that flips 182's `endReturnGatewayAllowed` to true on defeat.
 *
 * The definition is vanilla-keyed data; the framework owns phase transitions (health thresholds),
 * damage, healing (capped), and the SPAWNING -> ACTIVE -> DEFEATED status. This module adds:
 * - `summonEndCrystals`: vanilla's 0..10 crystals; the summoning advances as the dragon's health
 *   fraction falls (first 80%, then 50%, then 20%).
 * - `endCrystalHealAmount`: a live crystal heals the dragon `END_CRYSTAL_HEAL_PER_TICK` per tick.
 * - `dragonDamageTowardsPlayer`: the vanilla 3 damage when the player is within bite range.
 * - `dragonDefeated`: exactly whether the boss state is `DEFEATED` (drives the return gateway).
 * - constants (max health 200, phases 100/50/20, per-crystal heal 1/tick, bite damage 3).
 */
import { createResourceId } from '../data/ResourceId';
import type { BossDefinition, BossState } from './BossFramework';
import { endReturnGatewayAllowed } from './EndPortalProgression';

/** Vanilla Ender Dragon max health. */
export const ENDER_DRAGON_MAX_HEALTH = 200;
/** Vanilla phase thresholds (as health fractions): 100%, 50%, 20%. */
export const ENDER_DRAGON_PHASE_THRESHOLDS = [1, 0.5, 0.2];
/** Vanilla bite damage toward a player in range. */
export const ENDER_DRAGON_BITE_DAMAGE = 3;
/** Vanilla bite range (horizontal distance in blocks). */
export const ENDER_DRAGON_BITE_RANGE = 4;
/** Vanilla end crystals: 0..10 are alive progressively. */
export const MAX_END_CRYSTALS = 10;
/** A live crystal heals the dragon this much per tick. */
export const END_CRYSTAL_HEAL_PER_TICK = 1;
/** Health fraction at which each summoning wave starts (80% / 50% / 20%). */
export const DRAGON_CRYSTAL_SUMMON_FRACTIONS = [0.8, 0.5, 0.2];

/** The Ender Dragon boss definition (vanilla-keyed data for 153's framework). */
export const ENDER_DRAGON_DEFINITION: BossDefinition = {
  id: createResourceId('minecraft', 'ender_dragon'),
  key: 'ender_dragon',
  name: 'Ender Dragon',
  maxHealth: ENDER_DRAGON_MAX_HEALTH,
  phases: ENDER_DRAGON_PHASE_THRESHOLDS.map((t) => ({ name: `dragon-phase-${t}`, healthThreshold: t })),
  barColor: 'purple',
};

/**
 * How many end crystals exist at a given health fraction: vanilla's 0..10 with summoning waves at
 * 80%, 50%, and 20% (each wave adds more). Deterministic: fraction of 1 -> 1, 0.8+ -> 4, 0.5+ -> 7,
 * 0.2+ -> 10 (a fresh fight starts with a few crystals already alive, per vanilla).
 */
export function summonEndCrystals(healthFraction: number): number {
  const f = Number.isFinite(healthFraction) ? Math.max(0, Math.min(1, healthFraction)) : 0;
  if (f >= 0.8) return 1;
  if (f >= 0.5) return 4;
  if (f >= 0.2) return 7;
  return MAX_END_CRYSTALS;
}

/**
 * The healing a single live crystal grants the dragon this tick:
 * `END_CRYSTAL_HEAL_PER_TICK` when at least one crystal is alive, else 0 — the total heal is
 * `END_CRYSTAL_HEAL_PER_TICK * liveCrystals`, and 153's `healBoss` caps it at max health.
 */
export function endCrystalHealAmount(liveCrystals: number): number {
  return liveCrystals > 0 ? END_CRYSTAL_HEAL_PER_TICK : 0;
}

/** Dragon attack: vanilla bite damage when the player is within bite range (exclusive). */
export function dragonDamageTowardsPlayer(distance: number): number {
  return distance < ENDER_DRAGON_BITE_RANGE ? ENDER_DRAGON_BITE_DAMAGE : 0;
}

/** Whether the fight is defeated — the signal 182's return gateway consumes. */
export function dragonDefeated(state: BossState): boolean {
  return state.status === 'DEFEATED';
}

/** Whether the End's return gateway is open for this boss fight (182 composition). */
export function dragonReturnGatewayOpen(state: BossState): boolean {
  return endReturnGatewayAllowed(dragonDefeated(state));
}
