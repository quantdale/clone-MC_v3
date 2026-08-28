# Proposal: 136-mob-goal-selector

## Problem
135 gave a pathfinder, but nothing decides *when* a mob should use it, wander, look at something, or
do anything else — the codebase has no AI scheduling framework at all. Real Minecraft's
`GoalSelector` runs a prioritized set of `Goal`s each tick, starting the highest-priority goal that
wants to run, interrupting a lower-priority running goal that competes for the same category of
control (movement, look direction, etc.), and stopping goals whose continuation condition no longer
holds. Nothing here does any of that yet.

## Goals
- `Goal` interface: `flags` (a set of `GoalFlag` control categories it needs), `canUse()` (may it
  start), optional `canContinueToUse()` (may it keep running; defaults to `canUse()` when absent),
  and optional `start()`/`tick()`/`stop()` lifecycle hooks.
- `GoalFlag` enum: `Move`, `Look`, `Jump`, `Target` — the mutual-exclusion categories a goal can
  claim.
- `GoalSelector`: `addGoal(priority, goal)` (lower priority number = higher precedence, ties broken
  by insertion order), `removeGoal(goal)`, `tick()` (each tick: determine which goals want to run in
  priority order, skip a lower-priority goal that would claim a flag another goal already claimed
  this tick — interrupting a running goal that loses that contest — call `stop()` on goals that
  drop out, `start()` on newly running goals, `tick()` on every goal still running), `getRunning()`,
  `clear()`.

## Non-goals
- **No concrete goal implementations** (wander, look-at-nearest-player, attack, etc.) — those begin
  at 139 (`passive-wander-ai`) and 140 (`hostile-target-ai`).
- **No `Game`/`EntityManager`/tick-loop wiring.** Nothing yet constructs a `GoalSelector` per live
  mob; that begins once a real mob-AI consumer exists.
- **No cross-mob coordination** (e.g. two mobs contesting one resource). One `GoalSelector` governs
  exactly one mob's own goals.

## Preconditions
- Change 135 (`a-star-pathfinding`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond TypeScript/JS built-ins — this is a self-contained, dependency-free scheduler.

## Proposed change
1. `src/simulation/GoalSelector.ts` (NEW):
   - `const enum GoalFlag { Move, Look, Jump, Target }`.
   - `interface Goal { flags: readonly GoalFlag[]; canUse(): boolean; canContinueToUse?(): boolean;
     start?(): void; tick?(): void; stop?(): void }`.
   - `class GoalSelector` — `addGoal(priority, goal)`, `removeGoal(goal)`, `tick()`, `getRunning()`,
     `clear()`.
2. No other file is edited.

## Compatibility and migration
- One new, dependency-free file. No schema/save-format change, no migration.

## Risks
- **Flag-conflict resolution order being non-deterministic.** Mitigation: goals are always evaluated
  in ascending-priority, then-insertion-order; ties are impossible to observe differently across
  runs, verified directly by a determinism-style test with two equal-priority goals.
- **A goal that never sets `canContinueToUse` running forever even when it "should" stop.**
  Mitigation: this is the documented default (`canContinueToUse` defaults to re-checking `canUse()`),
  matching real Minecraft's own default for goals that don't override it; a concrete goal
  implementation (139+) that needs different continuation semantics overrides it explicitly.

## Rollback strategy
One additive file with zero consumers; deleting it fully reverts the change with no other impact.

## Definition of Done
- `GoalSelector`/`Goal`/`GoalFlag` implemented per design.md/spec.md.
- Unit tests cover: starting the highest-priority eligible goal; a higher-priority goal interrupting
  (stopping) a lower-priority running goal that shares a flag; two non-conflicting goals (disjoint
  flags) running simultaneously; a running goal stopping when `canContinueToUse` (or, absent that,
  `canUse`) returns false; lifecycle ordering (`stop()` before a new goal's `start()`, `tick()` only
  for goals still running after this tick's selection); `removeGoal`/`clear()`.
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no consumer wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
