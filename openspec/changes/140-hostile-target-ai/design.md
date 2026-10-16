# Design: 140-hostile-target-ai

## Context/current state
- 136 `Goal`/`GoalSelector` and 139's `WanderGoal`/`LookGoal` are the only concrete goals so far,
  both single-purpose and independent. 140 introduces the first goal *dependency*: `ChaseGoal` reads
  its target from a `TargetAcquisitionGoal` instance rather than owning target-finding itself.
- 129 `EntityManager.get`/`setVelocity` are the only entity-state accessors these goals need.

## Target state
- `src/simulation/HostileTargetAI.ts` provides `TargetAcquisitionGoal` and `ChaseGoal`, composable on
  one `GoalSelector` for a hostile mob (a future change's wiring responsibility).

## Invariants
- `TargetAcquisitionGoal.canUse()` is `true` only when `findNearestTarget` returns a position within
  `detectionRadius` of the entity's current position.
- Once running, `TargetAcquisitionGoal.canContinueToUse()` re-queries `findNearestTarget` every call
  (so a moving target's tracked position stays current) and is `false` exactly when the callback
  returns nothing or the (possibly updated) target is farther than `forgetRadius`.
- `getTarget()` always reflects the most recently accepted target position, or `null` before any
  acquisition / after the goal stops.
- `ChaseGoal.canUse()`/`canContinueToUse()` are `true` only when `targetSource.getTarget()` is
  non-`null`.
- `ChaseGoal.tick()` writes only `vx`/`vz`, scaled by `speed` toward the target while farther than
  `attackRange`, or zeroed when within `attackRange`; it never writes `vy`.

## API and data model
```ts
export interface TargetPosition { x: number; y: number; z: number; }

export interface TargetAcquisitionOptions {
  manager: EntityManager;
  entityId: number;
  findNearestTarget: (x: number, y: number, z: number) => TargetPosition | null;
  detectionRadius?: number; // default 16
  forgetRadius?: number;    // default 32 (hysteresis: > detectionRadius)
}

export class TargetAcquisitionGoal implements Goal {
  readonly flags: readonly GoalFlag[]; // [GoalFlag.Target]
  constructor(opts: TargetAcquisitionOptions);
  canUse(): boolean;
  canContinueToUse(): boolean;
  start(): void;
  stop(): void;
  getTarget(): TargetPosition | null;
}

export interface ChaseGoalOptions {
  manager: EntityManager;
  entityId: number;
  targetSource: TargetAcquisitionGoal;
  speed?: number;      // default 3.0 (blocks/s)
  attackRange?: number; // default 2 (blocks)
}

export class ChaseGoal implements Goal {
  readonly flags: readonly GoalFlag[]; // [GoalFlag.Move]
  constructor(opts: ChaseGoalOptions);
  canUse(): boolean;
  canContinueToUse(): boolean;
  tick(): void;
  stop(): void;
}
```

## Control/data flow
1. `TargetAcquisitionGoal.canUse()`: read the entity's transform; call
   `findNearestTarget(x, y, z)`; `false` if `null`; compute Euclidean distance; `false` if
   `> detectionRadius`; else cache as the pending target and return `true`.
2. `start()`: adopt the pending target as the current target.
3. `canContinueToUse()`: `false` if the entity is gone/not `ACTIVE`; else re-call
   `findNearestTarget` from the entity's current position; `false` if `null`; else update the current
   target to this fresh position and return whether its distance is `<= forgetRadius`.
4. `stop()`: clear the current target to `null`.
5. `ChaseGoal.canUse()`/`canContinueToUse()`: `targetSource.getTarget() !== null` (plus the entity
   existing/`ACTIVE`).
6. `ChaseGoal.tick()`: read the entity and `targetSource.getTarget()`; compute horizontal distance;
   if `<= attackRange`, zero `vx`/`vz` (preserving `vy`) and return; else set `vx`/`vz` to the unit
   horizontal direction toward the target scaled by `speed` (preserving `vy`).
7. `ChaseGoal.stop()`: zero `vx`/`vz` (preserving `vy`).

## Detailed behavior
- `forgetRadius` defaults larger than `detectionRadius` specifically to avoid immediate
  acquire/drop flapping for a target sitting near the detection boundary — once acquired, the mob
  commits to the chase until the target moves meaningfully farther away or disappears.
- `TargetAcquisitionGoal` re-queries `findNearestTarget` on every `canContinueToUse()` call (not just
  once at `start()`), so `getTarget()` always reflects the target's live position — `ChaseGoal` reads
  a moving target correctly without either goal needing to poll the other's internals beyond the
  public `getTarget()` accessor.
- `ChaseGoal` depends on `TargetAcquisitionGoal` purely through its public `getTarget()` method — no
  shared mutable state beyond that one accessor, so the two goals can be registered on a
  `GoalSelector` independently (different priorities, different flags) and still cooperate correctly.

## Failure modes
- Neither goal throws when its entity is missing/not `ACTIVE`, or when `findNearestTarget` returns
  `null`; all such cases degrade to `false`/no-op as documented.
- `findNearestTarget` throwing propagates unmodified (a caller's query bug should surface, not be
  silently swallowed).

## Compatibility/migration
- One new, additive file; no edits to `GoalSelector`, `EntityManager`, or any other module. No
  schema/save-format change; no migration.

## Performance/resource constraints
- Every method on both goals is O(1) (one `findNearestTarget` call plus arithmetic); no unbounded
  loops.

## Testing seams
- Both goals depend only on a real `EntityManager`/`EntityRegistry` pair (129/017) and a plain
  closure for `findNearestTarget` — no `Game`/`World`/pathfinding needed.

## Observability/debugging
- `TargetAcquisitionGoal.getTarget()` exposes the tracked target directly for inspection or for a
  dependent goal (like `ChaseGoal`) to read.

## Affected files/symbols
- `src/simulation/HostileTargetAI.ts` (new).
- Tests: `tests/unit/HostileTargetAI.test.ts` (new).

## Rejected alternatives
- **Routing `ChaseGoal` through 135's `findPath`**: rejected for this baseline (see proposal
  Non-goals), mirroring 139's identical rejection for `WanderGoal` — a future refinement can add it
  without changing either goal's contract.
- **`ChaseGoal` owning its own target search** (duplicating `TargetAcquisitionGoal`'s logic):
  rejected — splitting acquisition (a `Target`-flagged goal, matching real Minecraft's target-flag
  convention) from movement (a `Move`-flagged goal) lets a future attack goal (141) also depend on
  `TargetAcquisitionGoal.getTarget()` without duplicating the search.
- **A shared mutable "blackboard" object instead of a direct `TargetAcquisitionGoal` reference**:
  rejected — a direct reference to one public accessor (`getTarget()`) is simpler and equally
  decoupled for this scope; a blackboard pattern would be premature generality with only one
  dependent goal so far.

## Downstream dependencies
- 141 (`melee-combat-cooldown`) will add an attack goal that also reads
  `TargetAcquisitionGoal.getTarget()` and deals damage once in range (where `ChaseGoal` currently just
  stops).
- 146 (`hostile-mob-baseline`) will be the first real consumer, constructing a `GoalSelector` with
  both goals (plus a future attack goal) for a spawned hostile mob.
