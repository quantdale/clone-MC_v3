# Design: 136-mob-goal-selector

## Context/current state
- Nothing in the codebase schedules competing behaviors. 135's `findPath` is a pure library call with
  no notion of "when should I path somewhere."

## Target state
- `src/simulation/GoalSelector.ts` provides a generic, per-mob prioritized goal scheduler, independent
  of any concrete goal implementation.

## Invariants
- Goals are always evaluated in ascending-priority order (lower number first); ties are broken by
  insertion (`addGoal` call) order, so the same sequence of `addGoal` calls always produces the same
  evaluation order.
- A goal is selected to run this tick only if its "wants to run" check passes (`canContinueToUse()`
  if it was already running, else `canUse()`) AND none of its `flags` were already claimed by a
  higher- (or equal-, earlier-inserted-) priority goal selected earlier in this same tick's
  evaluation.
- `stop()` is called on every goal that was running last tick but is not selected this tick, before
  any newly selected goal's `start()` is called.
- `start()` is called exactly once when a goal transitions from not-running to running; `tick()` is
  called on every goal that is running after this tick's start/stop transitions (including one that
  just started this same tick — a documented simplification, see Detailed behavior).
- `getRunning()` always reflects exactly the goals whose `start()` has been called more recently than
  their `stop()`.

## API and data model
```ts
export const enum GoalFlag { Move, Look, Jump, Target }

export interface Goal {
  readonly flags: readonly GoalFlag[];
  canUse(): boolean;
  canContinueToUse?(): boolean;
  start?(): void;
  tick?(): void;
  stop?(): void;
}

export class GoalSelector {
  addGoal(priority: number, goal: Goal): void;
  removeGoal(goal: Goal): void;   // stops it first if running
  tick(): void;
  getRunning(): readonly Goal[]; // insertion order
  clear(): void;                  // stops every running goal, removes all
}
```

## Control/data flow
1. `addGoal(priority, goal)` appends `{priority, goal, seq: nextSeq++}` and re-sorts the internal list
   by `(priority ascending, seq ascending)` — a stable sort by construction since `seq` is a strict
   tiebreak.
2. `tick()`:
   a. `usedFlags = new Set<GoalFlag>()`, `selected: Goal[] = []`.
   b. For each `{goal}` in priority order:
      i. `wantsToRun = this.running.has(goal) ? (goal.canContinueToUse?.() ?? goal.canUse()) :
         goal.canUse()`.
      ii. If `!wantsToRun`, skip.
      iii. If any of `goal.flags` is already in `usedFlags`, skip (a higher-or-equal-priority goal
           already claimed it this tick).
      iv. Otherwise push to `selected` and add every flag in `goal.flags` to `usedFlags`.
   c. For each goal currently in `this.running` not present in `selected`: call `goal.stop?.()`,
      remove from `this.running`.
   d. For each goal in `selected` not already in `this.running`: call `goal.start?.()`, add to
      `this.running`.
   e. For each goal now in `this.running`: call `goal.tick?.()`.
3. `removeGoal(goal)`: if running, call `stop()` and remove from `this.running`; remove from the
   priority list regardless.
4. `clear()`: call `stop()` on every running goal, then empty both the priority list and the running
   set.

## Detailed behavior
- A goal that was NOT running and fails `canUse()` this tick is simply never selected — no `stop()`
  is called for a goal that never started.
- A goal that IS running and whose `canContinueToUse` (or fallback `canUse`) now returns `false` is
  dropped this tick (`stop()` called), even if no other goal contests its flags — continuation is an
  independent condition from flag contention.
- `tick()` is called for a just-started goal in the same `GoalSelector.tick()` call as its `start()`
  — a documented simplification versus a stricter "start now, first `tick()` next selector tick"
  model, chosen because it lets a goal's `tick()` assume `start()` has already run without needing a
  redundant "am I newly started" check inside `tick()` itself.
- Flag contention is resolved purely by priority order within one `tick()` call; a currently-running
  lower-priority goal has no special protection against a higher-priority goal that wants the same
  flag this tick — it is stopped exactly like any other goal that loses the flag contest.

## Failure modes
- `GoalSelector` methods do not themselves throw for any well-formed `Goal`; if a `Goal`'s own
  `canUse`/`start`/`tick`/`stop` throws, that propagates unmodified (no error isolation is added —
  a throwing goal is a caller bug to fix, not something to silently swallow).
- `removeGoal` on a goal never added is a no-op (nothing to remove, nothing running to stop).

## Compatibility/migration
- One new, dependency-free file; no edits to any existing module. No schema/save-format change; no
  migration.

## Performance/resource constraints
- `tick()` is O(n log n) for the (already-sorted, so effectively O(n) re-scan) priority list per call,
  where n is the number of registered goals for one mob — expected to be small (single digits) per
  the framework's design; no unbounded growth.

## Testing seams
- `GoalSelector`/`Goal` are pure, dependency-free classes/interfaces — a test constructs simple stub
  goals (closures over booleans/counters) with no `Game`/`World`/`EntityManager` needed.

## Observability/debugging
- `getRunning()` exposes exactly which goals are active, letting a test or future debug overlay
  assert scheduler state directly.

## Affected files/symbols
- `src/simulation/GoalSelector.ts` (new).
- Tests: `tests/unit/GoalSelector.test.ts` (new).

## Rejected alternatives
- **A `Set<GoalFlag>` per goal instead of a `readonly GoalFlag[]`**: rejected — a plain readonly array
  is simpler for a caller to declare as a literal (`flags: [GoalFlag.Move]`) and the selector only
  ever iterates it; no need for `Set`'s O(1) membership inside a goal's own declaration.
- **Building concrete goal implementations alongside the scheduler in this change**: rejected (see
  proposal Non-goals) — those are 139/140's explicitly scoped content; 136 delivers the framework
  only, testable against stub goals.
- **A "current mob" global registry of `GoalSelector`s**: rejected — one `GoalSelector` instance is
  owned per-mob by whatever future code constructs it (136 doesn't prescribe that ownership model);
  no global state is introduced.

## Downstream dependencies
- 139 (`passive-wander-ai`) and 140 (`hostile-target-ai`) will implement concrete `Goal`s (wander,
  look-at-nearest, chase, attack) registered on a per-mob `GoalSelector`.
