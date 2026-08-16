/**
 * Advancement framework (185): the meta-progression layer — typed criteria/triggers, immutable
 * per-advancement progress, and versioned persistence. An advancement is data: a key, a title, an
 * ordered list of typed criteria, and a reward. Progress tracks which criteria are achieved; when
 * the LAST criterion fires, the advancement achieves at the observed tick. 184's boss-completion
 * record is one of the first trigger sources (a `boss_defeat` criterion).
 *
 * All functions are pure and deterministic: `applyAdvancementTrigger` returns a NEW progress
 * (identical object when nothing changed — including a trigger that matches no criterion), so a
 * caller can cheaply detect "did anything change". Rewards are definition data; GRANTING a reward
 * is a wiring concern (186's advancements consume the definitions).
 */
import { type ResourceId } from '../data/ResourceId';

/** The typed trigger set (the wiring fires these; a trigger matches criteria of the same shape). */
export type AdvancementCriterion =
  | { type: 'kill_mob'; mobKey: string }
  | { type: 'obtain_item'; itemKey: string }
  | { type: 'dimension_enter'; dimensionKey: string }
  | { type: 'boss_defeat'; bossKey: string };

/** Rewards are definition data; granting is wiring (186 consumes the definitions). */
export type AdvancementReward =
  | { kind: 'none' }
  | { kind: 'experience'; amount: number }
  | { kind: 'item'; itemKey: string; count: number };

/** An advancement: identity, title, ordered criteria, reward. */
export interface AdvancementDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly title: string;
  readonly criteria: readonly AdvancementCriterion[];
  readonly reward: AdvancementReward;
}

/** Immutable per-advancement progress. */
export interface AdvancementProgress {
  readonly advancementKey: string;
  /** Whether every criterion is achieved (and the tick it happened). */
  readonly achieved: boolean;
  readonly achievedTick: number | null;
  /** Parallel to `definition.criteria`. */
  readonly criteriaAchieved: ReadonlyArray<boolean>;
}

/** Versioned serialized progress. */
export interface SerializedAdvancementProgress {
  version: 1;
  advancementKey: string;
  achieved: boolean;
  achievedTick: number | null;
  criteriaAchieved: readonly boolean[];
}

export const ADVANCEMENT_PROGRESS_VERSION = 1;

/** Fresh, unachieved progress for a definition. */
export function createAdvancementProgress(def: AdvancementDefinition): AdvancementProgress {
  return {
    advancementKey: def.key,
    achieved: false,
    achievedTick: null,
    criteriaAchieved: def.criteria.map(() => false),
  };
}

function criterionMatches(criterion: AdvancementCriterion, trigger: AdvancementCriterion): boolean {
  if (criterion.type !== trigger.type) return false;
  switch (criterion.type) {
    case 'kill_mob':
      return criterion.mobKey === (trigger as { mobKey: string }).mobKey;
    case 'obtain_item':
      return criterion.itemKey === (trigger as { itemKey: string }).itemKey;
    case 'dimension_enter':
      return criterion.dimensionKey === (trigger as { dimensionKey: string }).dimensionKey;
    case 'boss_defeat':
      return criterion.bossKey === (trigger as { bossKey: string }).bossKey;
  }
}

/**
 * Apply one trigger: the first matching unachieved criterion flips to achieved; when ALL criteria
 * are then achieved, the advancement achieves at `tick`. A trigger matching nothing, or an
 * already-complete advancement, returns the SAME object (no-op). Pure and deterministic.
 */
export function applyAdvancementTrigger(
  progress: AdvancementProgress,
  def: AdvancementDefinition,
  trigger: AdvancementCriterion,
  tick: number,
): AdvancementProgress {
  if (progress.achieved) return progress;
  if (def.criteria.length === 0) return progress;

  const criteriaAchieved = progress.criteriaAchieved.slice();
  let changed = false;
  for (let i = 0; i < def.criteria.length; i++) {
    if (!criteriaAchieved[i] && criterionMatches(def.criteria[i]!, trigger)) {
      criteriaAchieved[i] = true;
      changed = true;
      break;
    }
  }
  if (!changed) return progress;

  const allAchieved = criteriaAchieved.every(Boolean);
  return {
    advancementKey: progress.advancementKey,
    achieved: allAchieved,
    achievedTick: allAchieved ? tick : null,
    criteriaAchieved,
  };
}

/** Whether the advancement is complete. */
export function advancementIsComplete(progress: AdvancementProgress): boolean {
  return progress.achieved;
}

/** Number of unachieved criteria (0 when complete). */
export function advancementCriteriaRemaining(
  def: AdvancementDefinition,
  progress: AdvancementProgress,
): number {
  return def.criteria.length - progress.criteriaAchieved.filter(Boolean).length;
}

/** Serialize progress (identity-shaped; validation happens on deserialize). */
export function serializeAdvancementProgress(progress: AdvancementProgress): SerializedAdvancementProgress {
  return {
    version: ADVANCEMENT_PROGRESS_VERSION as 1,
    advancementKey: progress.advancementKey,
    achieved: progress.achieved,
    achievedTick: progress.achievedTick,
    criteriaAchieved: progress.criteriaAchieved.slice(),
  };
}

/**
 * Validate and restore serialized progress. The whole payload is validated first; any malformed
 * field throws a descriptive `Error` and nothing is partially accepted.
 */
export function deserializeAdvancementProgress(input: unknown): AdvancementProgress {
  if (typeof input !== 'object' || input === null) {
    throw new Error('AdvancementProgress: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== ADVANCEMENT_PROGRESS_VERSION) {
    throw new Error(`AdvancementProgress: unsupported version ${String(r.version)}`);
  }
  if (typeof r.advancementKey !== 'string' || r.advancementKey.length === 0) {
    throw new Error('AdvancementProgress: advancementKey must be a non-empty string');
  }
  if (typeof r.achieved !== 'boolean') {
    throw new Error('AdvancementProgress: achieved must be a boolean');
  }
  if (r.achievedTick !== null && (!Number.isInteger(r.achievedTick) || (r.achievedTick as number) < 0)) {
    throw new Error('AdvancementProgress: achievedTick must be a non-negative integer or null');
  }
  if (
    !Array.isArray(r.criteriaAchieved) ||
    r.criteriaAchieved.some((c) => typeof c !== 'boolean')
  ) {
    throw new Error('AdvancementProgress: criteriaAchieved must be an array of booleans');
  }
  return {
    advancementKey: r.advancementKey,
    achieved: r.achieved,
    achievedTick: r.achievedTick as number | null,
    criteriaAchieved: r.criteriaAchieved as boolean[],
  };
}
