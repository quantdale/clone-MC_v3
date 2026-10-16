# Design: 139-passive-wander-ai

## Context/current state
- 136 `Goal`/`GoalSelector` exist with no concrete implementations.
- 129 `EntityManager` offers `get`/`setVelocity`/`setTransform`; 130's `tickEntityPhysics` (separate,
  unmodified) is what actually integrates velocity into position via collision.
- 134 `canStandAt`/`classifyNode`/`PathNodeType` classify a cell's walkability and fluid kind.
- 054 `SeedRng` is the codebase's deterministic per-stream RNG.

## Target state
- `src/simulation/PassiveWanderAI.ts` provides `WanderGoal` and `LookGoal`, the first two concrete
  `Goal` implementations, built only on already-VERIFIED primitives.

## Invariants
- Both goals only ever consume randomness through the injected `SeedRng`; no `Math.random`, no
  wall-clock dependency — identical `SeedRng` state plus identical world/entity state always produces
  identical goal behavior.
- `WanderGoal.canUse()` never selects a target whose `classifyNode` is `Water`, and only ever selects
  a target that passes `canStandAt` — the wander goal never proposes an unwalkable or in-water
  destination.
- `WanderGoal` steers exactly the horizontal velocity components (`vx`/`vz`); it never writes `vy`
  (vertical motion remains governed by gravity/physics, 130, untouched by this goal).
  `LookGoal` writes only `yaw`; it never touches `x`/`y`/`z`/`pitch`/velocity.
- `WanderGoal.canContinueToUse()` is `false` once the entity is within `arrivalRadius` of its target,
  once `maxDurationTicks` ticks have elapsed since `start()`, or once the entity no longer exists/is
  no longer `ACTIVE`.

## API and data model
```ts
export interface WanderGoalOptions {
  manager: EntityManager;
  entityId: number;
  world: NavigationWorld;
  rng: SeedRng;
  speed?: number;            // default 2.5 (blocks/s)
  radius?: number;           // default 10 (blocks)
  startChance?: number;      // default 1/120 per tick
  maxDurationTicks?: number; // default 200 (10s at 20 TPS)
  arrivalRadius?: number;    // default 0.5 (blocks)
  height?: number;           // default 2
}

export class WanderGoal implements Goal {
  readonly flags: readonly GoalFlag[]; // [GoalFlag.Move]
  constructor(opts: WanderGoalOptions);
  canUse(): boolean;
  canContinueToUse(): boolean;
  start(): void;
  tick(): void;
  stop(): void;
}

export interface LookGoalOptions {
  manager: EntityManager;
  entityId: number;
  rng: SeedRng;
  changeChance?: number; // default 1/40 per tick
}

export class LookGoal implements Goal {
  readonly flags: readonly GoalFlag[]; // [GoalFlag.Look]
  constructor(opts: LookGoalOptions);
  canUse(): boolean;
  tick(): void;
}
```

## Control/data flow
1. `WanderGoal.canUse()`:
   a. `false` if `rng.nextFloat() >= startChance` (per-tick random start gate, vanilla-like).
   b. `false` if the entity is missing/not `ACTIVE`.
   c. Otherwise search up to a fixed bounded number of attempts (e.g. 10): pick a uniformly random
      angle/distance within `radius` around the entity's current `(x, z)`, at the entity's current
      (rounded) `y`; reject if `classifyNode(world, x, y, z) === Water`; accept (cache as the pending
      target) if `canStandAt(world, x, y, z, height)`. `false` if no attempt succeeds.
2. `start()`: adopt the cached pending target, reset an internal tick counter to `0`.
3. `canContinueToUse()`: `false` if the entity is missing/not `ACTIVE`, if the tick counter has
   reached `maxDurationTicks`, or if the horizontal distance to the target is within
   `arrivalRadius`; otherwise `true`.
4. `tick()`: increment the tick counter; compute the horizontal direction to the target and set
   `vx`/`vz` to that unit direction scaled by `speed` (preserving the entity's current `vy`).
5. `stop()`: zero `vx`/`vz` (preserving `vy`).
6. `LookGoal.canUse()`: `true` whenever the entity exists and is `ACTIVE` (always eligible as a
   filler; `canContinueToUse` is not overridden, so it defaults to re-checking this same condition).
7. `LookGoal.tick()`: if `rng.nextFloat() < changeChance`, set a new random `yaw` in `[0, 360)` via
   `setTransform`, copying every other transform field unchanged.

## Detailed behavior
- The target search's fixed attempt bound (design constant, not caller-configurable) keeps `canUse()`
  O(1)-bounded even when most of the radius is water/obstructed; failing to find a target after the
  bound is a normal, silent "not this tick" outcome, not an error.
- `WanderGoal` reads the entity fresh via `manager.get(entityId)` in every method rather than caching
  a stale reference, so external changes (e.g. another system moving the entity) are always reflected
  on the next call.
- `LookGoal` has no `start`/`stop`/`canContinueToUse` override — it is a pure filler goal that runs
  whenever selected and does nothing on interruption (no velocity/physics state to clean up).

## Failure modes
- Neither goal throws for a well-formed `NavigationWorld`/`EntityManager` and a valid `entityId` that
  was registered at goal-construction time; if the entity is later removed/forgotten, both goals'
  methods degrade to safe no-ops (`canUse`/`canContinueToUse` return `false`, `tick`/`stop` do
  nothing) rather than throwing.

## Compatibility/migration
- One new, additive file; no edits to `GoalSelector`, `EntityManager`, `NavigationGridQuery`, or
  `SeedRng`. No schema/save-format change; no migration.

## Performance/resource constraints
- `WanderGoal.canUse()` is O(bounded attempts) `canStandAt`/`classifyNode` calls (each themselves
  O(height)); `tick()`/`stop()` are O(1). `LookGoal` is O(1) throughout.

## Testing seams
- Both goals depend only on a hand-built `NavigationWorld` fixture (134's style), a real
  `EntityManager`/`EntityRegistry` pair (129/017), and a `SeedRng` (054) — no `Game`/`World`/
  `GoalSelector` instance is required to exercise them directly (though a test may also drive them
  through a real `GoalSelector` for an integration-style check).

## Observability/debugging
- `WanderGoal`'s target is derivable indirectly by observing the entity's velocity direction after
  `start()`/`tick()`; no additional debug API is added in this change.

## Affected files/symbols
- `src/simulation/PassiveWanderAI.ts` (new).
- Tests: `tests/unit/PassiveWanderAI.test.ts` (new).

## Rejected alternatives
- **Routing `WanderGoal` through 135's `findPath`**: rejected for this baseline (see proposal
  Non-goals) — open-area wandering rarely needs obstacle-aware search; a future refinement can add
  it without breaking this change's `Goal` contract.
- **Sampling a heightmap for the wander target's Y**: rejected — no height-sampler interface exists
  in this program yet; using the entity's current Y is documented as a deliberate baseline
  simplification.
- **Making `LookGoal` track a specific nearby entity** (a `LookAtEntity`-style goal): rejected — that
  needs an entity-proximity query this change doesn't otherwise need; a pure random-look filler is
  the documented baseline scope ("look ... baseline behavior").

## Downstream dependencies
- 145 (`passive-mob-baseline`) will be the first real consumer, constructing a `GoalSelector` with
  `WanderGoal`/`LookGoal` (plus others) for a spawned passive mob and ticking it each simulation
  step alongside 130's `tickEntityPhysics`.
