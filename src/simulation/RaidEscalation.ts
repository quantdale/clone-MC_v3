/**
 * Bad Omen raid escalation (294): pure vanilla-parity rules for what happens
 * when the player's Bad Omen triggers inside a village that already has an
 * ACTIVE raid. Instead of replacing the raid (the pre-294 285 behaviour), the
 * running raid absorbs the omen: its omen level rises by the player's level
 * (clamped to `BAD_OMEN_MAX_LEVEL`) and its wave total grows per the 152 wave
 * table — never shrinking — while wave progress, remaining raiders, the
 * timeout clock and the center are untouched. The omen is consumed by every
 * applied escalation, including one at the cap (vanilla removes the effect
 * even when the raid is already at its maximum level).
 *
 * No Game, DOM, entity or persistence imports: Game owns the omen/raid state,
 * patrol dismissal and the durable save.
 */

import {
  clampBadOmenLevel,
  resolveVillageRaidTrigger,
  type BadOmenState,
  type OmenTriggerDecision,
  type VillageContext,
} from './BadOmenRules';
import { RAID_BASE_WAVES, RAID_MAX_WAVES, type RaidState } from './RaidStateMachine';

/** Blocks (3D, strict `<`) within which an ACTIVE raid belongs to the triggering village. */
export const RAID_ESCALATION_RADIUS = 96;

/** Wave total for an omen level (identical to `startRaid`): 1→3 … 5→7. */
export function raidWavesForOmen(level: number): number {
  const omen = clampBadOmenLevel(level);
  return Math.min(RAID_MAX_WAVES, RAID_BASE_WAVES + Math.max(0, omen - 1));
}

export interface RaidEscalationResult {
  readonly state: RaidState;
  readonly applied: boolean;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly wavesBefore: number;
  readonly wavesAfter: number;
}

/**
 * Escalate an ACTIVE raid by the player's omen level. Non-ACTIVE raids and
 * player levels < 1 return the same state object with `applied: false` (the
 * caller keeps the omen). Never throws.
 */
export function escalateRaid(state: RaidState, playerOmenLevel: number): RaidEscalationResult {
  const levelBefore = state.badOmenLevel;
  const wavesBefore = state.totalWaves;
  const add = clampBadOmenLevel(playerOmenLevel);
  if (state.status !== 'ACTIVE' || add < 1) {
    return { state, applied: false, levelBefore, levelAfter: levelBefore, wavesBefore, wavesAfter: wavesBefore };
  }
  const levelAfter = clampBadOmenLevel(clampBadOmenLevel(levelBefore) + add);
  const wavesAfter = Math.max(wavesBefore, raidWavesForOmen(levelAfter));
  return {
    state: { ...state, badOmenLevel: levelAfter, totalWaves: wavesAfter },
    applied: true,
    levelBefore,
    levelAfter,
    wavesBefore,
    wavesAfter,
  };
}

/** True when `raid` is ACTIVE and its center lies strictly within `RAID_ESCALATION_RADIUS` of `center`. */
export function isRaidInVillage(
  raid: RaidState | null | undefined,
  center: { readonly centerX: number; readonly centerY: number; readonly centerZ: number },
): boolean {
  if (!raid || raid.status !== 'ACTIVE') return false;
  const dx = raid.centerX - center.centerX;
  const dy = raid.centerY - center.centerY;
  const dz = raid.centerZ - center.centerZ;
  const d2 = dx * dx + dy * dy + dz * dz;
  return Number.isFinite(d2) && d2 < RAID_ESCALATION_RADIUS * RAID_ESCALATION_RADIUS;
}

export interface EscalateRaidAction {
  readonly kind: 'ESCALATE_RAID';
  readonly centerX: number;
  readonly centerY: number;
  readonly centerZ: number;
  /** The player's (clamped) omen level that the raid absorbs. */
  readonly badOmenLevel: number;
  readonly raidLevelBefore: number;
  readonly raidLevelAfter: number;
  readonly totalWavesBefore: number;
  readonly totalWavesAfter: number;
}

export type VillageOmenAction = OmenTriggerDecision | EscalateRaidAction;

/**
 * 294 village-omen action: the 285 decision, upgraded to `ESCALATE_RAID` when
 * it is `START_RAID` and an ACTIVE raid belongs to the triggering village.
 * A terminal raid or one ≥ 96 blocks away keeps `START_RAID` (single raid
 * slot: the Game replaces it). Never throws.
 */
export function resolveVillageOmenAction(
  omen: BadOmenState,
  village: VillageContext | null | undefined,
  raid: RaidState | null | undefined,
): VillageOmenAction {
  const decision = resolveVillageRaidTrigger(omen, village);
  if (decision.kind !== 'START_RAID') return decision;
  if (!raid || !isRaidInVillage(raid, decision)) return decision;
  const preview = escalateRaid(raid, decision.badOmenLevel);
  return {
    kind: 'ESCALATE_RAID',
    centerX: decision.centerX,
    centerY: decision.centerY,
    centerZ: decision.centerZ,
    badOmenLevel: decision.badOmenLevel,
    raidLevelBefore: preview.levelBefore,
    raidLevelAfter: preview.levelAfter,
    totalWavesBefore: preview.wavesBefore,
    totalWavesAfter: preview.wavesAfter,
  };
}
