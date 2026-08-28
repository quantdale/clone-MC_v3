# Proposal: 150-villager-professions

## Problem
149 built a claimable, typed POI registry but nothing consumes it. Villager-like AI (the master
plan's dedicated "17.5 Villagers" subsystem) needs a villager entity and a profession model that
claims a workstation POI, before trading (151), schedules-driven behavior, or any of the rest of
that subsystem can exist.

## Goals
- A `villager` entity type registered in 017's `EntityRegistry` (`CREATURE` category, health 20,
  matching vanilla).
- A `VillagerProfession` data model (`id`, `key`, `workstationType` — a 149 POI type `ResourceId`)
  on a `VillagerProfessionRegistry` built on the 003 generic registry core, with a representative
  default set (`farmer`, `librarian`, `weaponsmith`, plus a sentinel "no profession" state
  represented as `null`, not a registry entry).
- `VillagerProfessionSystem.assignProfession(entityId, poiManager, professions, x, y, z,
  maxDistance)`: for an unassigned villager, tries each profession in registration order, claiming
  the nearest unclaimed matching-type POI via 149's `findNearestUnclaimed`/`claim`; returns the
  assigned profession id (and remembers the claimed POI position) or `null` if none is available.
- `VillagerProfessionSystem.unassign(entityId, poiManager)`: releases the villager's claimed POI (if
  any) and clears its tracked assignment.
- `scheduleForHour(hour)`: a pure function mapping an hour-of-day (`[0, 24)`) to `'WORK'`, `'REST'`,
  or `'MEANDER'`, the three coarse vanilla-like schedule phases.

## Non-goals
- **No villager spawning wired into `Game`.** No village/structure generation exists yet (a
  much later, unscheduled scope — 217 `structure-content-expansion` at the earliest) to naturally
  place a villager or a workstation block; this is the data model + assignment/schedule logic only,
  additive/unconsumed exactly like 149 itself and 136-144 before mob systems were wired in.
- **No trading offers** (151's scope), **no gossip/reputation**, **no restocking**, **no iron-golem
  spawning**, **no zombie-villager conversion** — all separate, later/unscheduled scope per the
  master plan's "17.5 Villagers" list.
- **No bed-claiming/sleep integration** (198 `sleep-and-time-skip`'s scope) — `scheduleForHour`'s
  `'REST'` phase is a labeled state only; nothing claims a bed POI for it in this change.
- **No actual goal-selector/AI wiring** (136's `GoalSelector` composition, the way 140/146 composed
  target-acquire/chase goals) — `assignProfession`/`unassign`/`scheduleForHour` are plain, pure/
  composed functions a future change wires into goals, mirroring how 140 shipped
  `TargetAcquisitionGoal`/`ChaseGoal` unconsumed before 146 wired them into a `GoalSelector`.
- **No workstation block placement** — `workstationType` POI ids are placeholder `ResourceId`s
  (`minecraft:poi/<profession>`); nothing in `World`/`BlockRegistry` registers a real POI at a real
  block position yet (149's own identical non-goal, inherited unchanged).

## Preconditions
- Change 149 (`point-of-interest-system`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/data/EntityType.ts` (017, new `villager` definition), `src/data/Registry.ts` (003),
  `src/simulation/PointOfInterest.ts` (149, `PointOfInterestManager`/`findNearestUnclaimed`/
  `claim`/`release`), `src/data/ResourceId.ts` (002).

## Proposed change
1. `src/data/EntityType.ts` (EDIT): add `def('villager', 'CREATURE', 20, 0, true, true)` to
   `createDefaultEntityRegistry()`.
2. `src/simulation/VillagerProfession.ts` (NEW): `VillagerProfession` interface;
   `VillagerProfessionRegistry` (003-based, `getByKey`/`get`/`getOptional`/`has`/`entries`);
   `createDefaultVillagerProfessionRegistry()`; `scheduleForHour`; `VillagerProfessionSystem`
   (`assignProfession`, `unassign`, `getAssignment`).

## Compatibility and migration
- One `EntityType.ts` edit (one new entity definition, additive) and one new, additive simulation
  file. No `Game.ts` edit; no schema/save-format change (villager profession assignment is
  session-only, not persisted — matches 145-149's identical non-persistence simplification); no
  migration. Adding the `villager` entity requires updating `EntityType.test.ts`'s hardcoded
  default-registry size/key-list assertions (non-regression test maintenance, the same pattern
  148's `BlockItemSeparation.test.ts` update followed).

## Risks
- **`assignProfession` claims a POI as a side effect of a "try this profession" attempt** — once a
  profession's workstation is claimed, the function commits to that profession rather than
  considering later professions in the list even if a "better" one existed farther away; documented
  as the intended first-match, priority-ordered behavior (matches vanilla's own first-available
  logic), not a bug.

## Rollback strategy
One additive file plus one additive `EntityType.ts` entry (plus its required test-assertion
update); reverting fully removes the feature with no other impact.

## Definition of Done
- All listed classes/functions implemented per design.md/spec.md.
- Unit tests cover: `VillagerProfessionRegistry` construction/lookup; `assignProfession` success
  (claims the correct POI, returns the right profession), no-workstation-available failure (returns
  `null`, claims nothing), and priority-order (a nearer later-priority-profession workstation is not
  chosen over an available earlier-priority one); `unassign` releases the claimed POI and clears the
  tracked assignment (idempotent for a villager with no assignment); `scheduleForHour` boundary
  cases across all three phases.
- Full gate green: typecheck, lint, unit, build (module count unchanged — additive/unconsumed,
  mirroring 148/149's own identical evidence), e2e (existing 22 assertions unaffected — no
  regression, nothing wired into the live game).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
