# Design: 185-advancement-framework

## Context/current state
- 184's `markDragonDefeated` produces the completion record; nothing consumes it as meta-progression.
  153/184 established the versioned-serialization pattern. 185 adds the typed framework those
  systems will feed.

## Target state
- `src/simulation/AdvancementFramework.ts` holding the definitions, the pure trigger application,
  and the validated persistence pair.

## Invariants
- `applyAdvancementTrigger` flips exactly the first matching unachieved criterion; completion occurs
  only when all criteria are achieved, recording `tick`.
- A trigger matching no criterion — or an already-achieved advancement — returns the identical
  object.
- `advancementCriteriaRemaining` = criteria.length − achieved count.
- `deserializeAdvancementProgress` validates version, non-empty key, boolean achieved,
  non-negative-integer-or-null tick, and a boolean array before accepting.

## API and data model
```ts
// src/simulation/AdvancementFramework.ts (new)
export type AdvancementCriterion =
  | { type: 'kill_mob'; mobKey: string }
  | { type: 'obtain_item'; itemKey: string }
  | { type: 'dimension_enter'; dimensionKey: string }
  | { type: 'boss_defeat'; bossKey: string };
export type AdvancementReward =
  | { kind: 'none' } | { kind: 'experience'; amount: number } | { kind: 'item'; itemKey: string; count: number };
export interface AdvancementDefinition { id: ResourceId; key: string; title: string; criteria: readonly AdvancementCriterion[]; reward: AdvancementReward; }
export interface AdvancementProgress { advancementKey: string; achieved: boolean; achievedTick: number | null; criteriaAchieved: ReadonlyArray<boolean>; }
export interface SerializedAdvancementProgress { version: 1; advancementKey: string; achieved: boolean; achievedTick: number | null; criteriaAchieved: readonly boolean[]; }
export const ADVANCEMENT_PROGRESS_VERSION = 1;
export function createAdvancementProgress(def: AdvancementDefinition): AdvancementProgress;
export function applyAdvancementTrigger(progress: AdvancementProgress, def: AdvancementDefinition, trigger: AdvancementCriterion, tick: number): AdvancementProgress;
export function advancementIsComplete(progress: AdvancementProgress): boolean;
export function advancementCriteriaRemaining(def: AdvancementDefinition, progress: AdvancementProgress): number;
export function serializeAdvancementProgress(progress: AdvancementProgress): SerializedAdvancementProgress;
export function deserializeAdvancementProgress(input: unknown): AdvancementProgress;
```

## Control/data flow
1. 186 defines advancements as `AdvancementDefinition` data.
2. The wiring fires typed triggers from gameplay events (mob kills, item pickup, dimension entry,
   184's completion record).
3. `applyAdvancementTrigger` updates progress; the caller persists via the serialization pair.

## Detailed behavior
- Criteria are boolean (no counters in this change); count-based criteria are a later content
  concern if needed.
- Rewards are definition data only: the framework never grants anything (granting is wiring).

## Failure modes
- Deserialization throws on any malformed field; every other function is total.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; new additive versioned shape.

## Performance/resource constraints
- Trigger application O(criteria).

## Testing seams
- Tests use 153/184's real fight/completion path for the integration case.

## Observability/debugging
- `advancementIsComplete`/`advancementCriteriaRemaining` make state explicit; progress is a plain
  value.

## Affected files/symbols
- `src/simulation/AdvancementFramework.ts` (new).
- Tests: `tests/unit/AdvancementFramework.test.ts` (new). No other files.

## Rejected alternatives
- **A central store/manager**: rejected — 185 is the pure core; a store belongs to wiring (single
  player) or 222+ (multiplayer), keeping this change small.
- **Count-based criteria now**: rejected — the typed boolean set covers 186's progression chain;
  counters can extend the union later without breaking the framework.

## Downstream dependencies
- 186 (`core-progression-advancements`) defines the survival→End chain over this framework;
  187 (statistics) uses the same persistence style; 242's e2e asserts completions.
