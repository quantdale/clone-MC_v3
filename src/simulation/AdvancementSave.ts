/**
 * Advancement save envelope (263): versioned batch persistence over 185's
 * single-record shape, plus the pure trigger fan-out the live game uses.
 *
 * R-4 hardening: 185's `deserializeAdvancementProgress` validates each record
 * in isolation but cannot see duplicates, unknown keys, length drift against
 * the catalog, or achieved/criteria inconsistencies. `deserializeAdvancementSave`
 * closes that gap catalog-aware: the FIRST malformed field throws a
 * descriptive `Error` and nothing is partially accepted (fail-closed).
 *
 * Records absent from the payload but present in the catalog boot as fresh
 * defaults (forward-compatible: a later content change may add definitions
 * without invalidating existing saves). Records present in the payload but
 * absent from the catalog throw (unknown keys are never silently kept).
 *
 * 185's functions are reused untouched — this file only adds the batch layer.
 */
import {
  applyAdvancementTrigger,
  createAdvancementProgress,
  deserializeAdvancementProgress,
  serializeAdvancementProgress,
  type AdvancementCriterion,
  type AdvancementDefinition,
  type AdvancementProgress,
  type SerializedAdvancementProgress,
} from './AdvancementFramework';

export type {
  AdvancementCriterion,
  AdvancementDefinition,
  AdvancementProgress,
  SerializedAdvancementProgress,
} from './AdvancementFramework';

/** Version of the batch save envelope. */
export const ADVANCEMENT_SAVE_VERSION = 1;

/** Versioned batch envelope persisted under `__advancements__:<worldId>`. */
export interface SerializedAdvancementSave {
  version: 1;
  advancements: SerializedAdvancementProgress[];
}

/** Fresh, all-unachieved progress for every catalog definition, in order. */
export function createDefaultAdvancementProgresses(
  catalog: readonly AdvancementDefinition[],
): AdvancementProgress[] {
  return catalog.map(createAdvancementProgress);
}

/** Serialize the whole store as the versioned batch envelope. */
export function serializeAdvancementSave(
  progresses: readonly AdvancementProgress[],
): SerializedAdvancementSave {
  return {
    version: ADVANCEMENT_SAVE_VERSION as 1,
    advancements: progresses.map(serializeAdvancementProgress),
  };
}

/**
 * Validate and restore a batch save against the catalog. Returns progress in
 * CATALOG order (payload order is irrelevant); catalog definitions absent from
 * the payload boot as fresh defaults. Throws descriptively on the first fault:
 * non-object input, wrong/missing version, non-array `advancements`,
 * duplicate `advancementKey`, unknown key, `criteriaAchieved` length drift,
 * `achieved` inconsistent with the criteria, or `achievedTick` inconsistent
 * with `achieved`. Nothing is partially accepted.
 */
export function deserializeAdvancementSave(
  input: unknown,
  catalog: readonly AdvancementDefinition[],
): AdvancementProgress[] {
  if (typeof input !== 'object' || input === null) {
    throw new Error('AdvancementSave: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.version !== ADVANCEMENT_SAVE_VERSION) {
    throw new Error(`AdvancementSave: unsupported version ${String(r.version)}`);
  }
  if (!Array.isArray(r.advancements)) {
    throw new Error('AdvancementSave: advancements must be an array');
  }
  const defs = new Map<string, AdvancementDefinition>();
  for (const def of catalog) defs.set(def.key, def);
  const seen = new Set<string>();
  const byKey = new Map<string, AdvancementProgress>();
  for (let i = 0; i < r.advancements.length; i++) {
    const record = deserializeAdvancementProgress(r.advancements[i]);
    const key = record.advancementKey;
    if (seen.has(key)) {
      throw new Error(`AdvancementSave: duplicate advancementKey ${key} at index ${i}`);
    }
    seen.add(key);
    const def = defs.get(key);
    if (def === undefined) {
      throw new Error(`AdvancementSave: unknown advancementKey ${key} at index ${i}`);
    }
    if (record.criteriaAchieved.length !== def.criteria.length) {
      throw new Error(
        `AdvancementSave: criteriaAchieved length ${record.criteriaAchieved.length} ` +
          `does not match definition ${key} (${def.criteria.length})`,
      );
    }
    const allTrue = record.criteriaAchieved.every(Boolean);
    if (record.achieved !== allTrue) {
      throw new Error(
        `AdvancementSave: achieved mismatch for ${key} ` +
          `(achieved=${String(record.achieved)}, allCriteria=${String(allTrue)})`,
      );
    }
    if (record.achieved && record.achievedTick === null) {
      throw new Error(`AdvancementSave: achievedTick must be non-null when ${key} is achieved`);
    }
    if (!record.achieved && record.achievedTick !== null) {
      throw new Error(`AdvancementSave: achievedTick must be null when ${key} is unachieved`);
    }
    byKey.set(key, record);
  }
  return catalog.map((def) => byKey.get(def.key) ?? createAdvancementProgress(def));
}

/**
 * Apply one trigger to every catalog definition: the pure fan-out behind
 * `Game.fireAdvancementTrigger`. Returns the same array (identity) plus an
 * empty `completedKeys` when nothing changed — including a null/non-object
 * trigger, which matches nothing and never throws. `completedKeys` lists the
 * definitions that achieved exactly on this call, in catalog order.
 *
 * Throws `AdvancementSave: progress store out of sync with catalog` when the
 * store is not parallel to the catalog (a programming bug, never valid play).
 */
export function applyTriggerToProgresses(
  progresses: readonly AdvancementProgress[],
  catalog: readonly AdvancementDefinition[],
  trigger: AdvancementCriterion,
  tick: number,
): { progresses: AdvancementProgress[]; completedKeys: string[] } {
  if (progresses.length !== catalog.length) {
    throw new Error('AdvancementSave: progress store out of sync with catalog');
  }
  if (typeof trigger !== 'object' || trigger === null) {
    return { progresses: progresses as AdvancementProgress[], completedKeys: [] };
  }
  let changed = false;
  const completedKeys: string[] = [];
  const next = progresses.map((progress, i) => {
    const def = catalog[i]!;
    if (progress.advancementKey !== def.key) {
      throw new Error('AdvancementSave: progress store out of sync with catalog');
    }
    const updated = applyAdvancementTrigger(progress, def, trigger, tick);
    if (updated !== progress) {
      changed = true;
      if (updated.achieved && !progress.achieved) completedKeys.push(def.key);
    }
    return updated;
  });
  if (!changed) return { progresses: progresses as AdvancementProgress[], completedKeys: [] };
  return { progresses: next, completedKeys };
}
