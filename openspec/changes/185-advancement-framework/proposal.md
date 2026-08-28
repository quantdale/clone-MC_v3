# Proposal: 185-advancement-framework

## Problem
184 closed the survival loop, but nothing records *what the player did*: no typed triggers, no
progress tracking, no persisted meta-progression. The framework is the layer 186's
core-progression advancements and 187's statistics build on.

## Goals
- `src/simulation/AdvancementFramework.ts` (NEW), pure and deterministic:
  - **Definitions**: `AdvancementDefinition` (`id`/`key`/`title`/ordered `criteria`/`reward`);
    `AdvancementCriterion` is a typed trigger union (`kill_mob`/`obtain_item`/`dimension_enter`/
    `boss_defeat`); `AdvancementReward` is data (`none`/`experience`/`item`) — granting is wiring.
  - **Progress**: `createAdvancementProgress` (unachieved); `applyAdvancementTrigger(progress, def,
    trigger, tick)` — marks the first matching unachieved criterion; when the LAST criterion
    achieves, the advancement completes at `tick`; a non-matching trigger or an achieved
    advancement returns the SAME object (cheap no-op detection); `advancementIsComplete`;
    `advancementCriteriaRemaining`.
  - **Persistence**: versioned `serializeAdvancementProgress`/`deserializeAdvancementProgress`
    (fully validated; malformed input throws — the 153/184 pattern).
  - **184 integration**: a `boss_defeat` criterion fires from 184's `markDragonDefeated` record
    (pinned by an integration test).

## Non-goals
- **No advancement catalog** (186 defines the survival→End chain), **no reward granting** (wiring),
  **no statistics** (187), **no advancement UI** (202+), **no `Game`/`World` wiring**.

## Preconditions
- Change 184 (`end-exit-progression`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/data/ResourceId.ts` (002), 153/184's serialization pattern (reference only).

## Proposed change
1. `src/simulation/AdvancementFramework.ts` (NEW): the types and seven functions above.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change (progress serialization is a new additive shape, versioned).

## Risks
- **Trigger/criterion mismatch semantics** (a trigger marking the wrong criterion, or completing
  early). Mitigation: matching requires equal `type` AND equal payload key, and completion only when
  the last criterion fires — both pinned by tests, including a non-matching no-op returning the
  identical object.
- **Corrupted progress acceptance**. Mitigation: full validation on deserialize (version, key,
  boolean, tick, boolean array).

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All listed functions implemented per design.md/spec.md.
- Unit tests cover: fresh progress; matching/non-matching triggers (identity no-op); completion at
  the last criterion with the tick recorded; post-completion trigger no-op; criteria-remaining
  counts; the 184 boss-completion integration; serialize/deserialize round-trip; malformed-payload
  rejection (five classes).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
