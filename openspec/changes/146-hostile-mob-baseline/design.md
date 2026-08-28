# Design: 146-hostile-mob-baseline

## Context/current state
- 145 established the exact pattern this change reuses: a world-adapter bridging `World`/
  `TerrainGenerator`/`BiomeRegistry` to the primitives' required interfaces, an owning `*System`
  class (its own `EntityManager`, spawn cycle, per-frame tick composing goals + `EntityPhysics`),
  and a `*Renderer` mesh pool — all wired into `Game` alongside the existing per-frame update.
  `PassiveMobWorldAdapter` already implements every method the hostile side needs (`ShapeWorld` +
  `NavigationWorld` + `SpawnWorld` + `getBiomeDefinition` + `getSurfaceHeightAt`) — it is stateless,
  so the same live instance can be reused by both systems without constructing a second adapter.
- 140's `TargetAcquisitionGoal`/`ChaseGoal` and 139's `WanderGoal`/`LookGoal` were designed to
  compose on one `GoalSelector` (140's own design doc's "Downstream dependencies" section names 146
  as the first real consumer). `TargetAcquisitionGoal` claims only `GoalFlag.Target` (not `Move`), so
  it can run every tick alongside whichever `Move`-flagged goal wins that tick — `ChaseGoal` (also
  `Move`) is added at a lower priority number (higher priority) than `WanderGoal`, so once a target is
  acquired, `ChaseGoal.canUse()` (which requires `targetSource.getTarget() !== null`) wins the `Move`
  flag contest and interrupts wander. `TargetAcquisitionGoal.start()` (which populates `getTarget()`)
  runs only after the full per-tick selection pass, so a target acquired on tick N is not visible to
  `ChaseGoal.canUse()` until tick N+1 — a one-tick acquisition lag inherent to the `GoalSelector`
  framework (136), not a defect introduced here.
- 141's `resolveMeleeAttack` is a pure attacker/target-agnostic function: it does not care whether the
  attacker is a player or a mob, only that the caller supplies cooldown/geometry/velocity inputs. No
  code anywhere yet calls it with a mob as attacker and the player as target.
- The player has no entity id (it is not an `EntityManager`-tracked instance at all). 141's
  `InvulnerabilityTracker` keys purely by `number`, so a negative sentinel id (never mintable by
  `EntityManager`, which starts at 0 and only increments) cleanly represents "the player" without
  requiring any change to `InvulnerabilityTracker` or giving the player a real entity record.
- `Game.update(dt)` runs once per animation frame, and 145's own `tickPassiveMobs` already
  established the "own frame-count-driven throttle, not a fixed-20TPS substep" convention for this
  codebase's non-player simulation systems. 146 follows the identical convention for its own
  spawn-cycle throttle and adds a private per-system frame counter (independent of `Game.simTick`)
  to time the shared `InvulnerabilityTracker`'s cooldown window in the same units
  `resolveMeleeAttack`/`InvulnerabilityTracker` already expect ("ticks").

## Target state
- `src/simulation/HostileMobBaseline.ts`: a `HostileMobWorld` interface (structurally identical to
  145's `PassiveMobWorld` — deliberately not imported from it, keeping the two modules independent
  per the proposal's non-goal, but satisfied transparently by the same `PassiveMobWorldAdapter`
  instance at the `Game` call site) and `HostileMobSystem` (owns its own `EntityManager`, per-entity
  goal-selector state, a shared player-facing `InvulnerabilityTracker`, spawn cycle, and the per-frame
  tick composing target-acquire/chase/wander/look goals with `EntityPhysics` and a melee-attack
  resolution against the player).
- `src/rendering/HostileMobRenderer.ts`: per-entity-id mesh pool mirroring `PassiveMobRenderer`,
  visually distinct (darker/green materials, taller silhouette).
- `Game` constructs both, reusing the existing `passiveMobWorld` adapter instance, and drives them
  from the same per-frame `update(dt)` alongside the passive-mob calls; `onPlayerDamaged` routes to
  `this.survival.damage(amount, 'mob')`.

## Invariants
- `HostileMobSystem.spawnCycle` never causes the live zombie count to exceed `HOSTILE_SPAWN_CAP`.
- `HostileMobSystem.tick` never advances (moves, retargets) an entity whose current chunk fails the
  supplied `isChunkTicking` predicate.
- Each zombie has at most one goal-selector bundle (selector + target/chase/wander/look goals),
  created no earlier than its first tick after spawn, and reused thereafter (never recreated while
  the entity remains active).
- A zombie's `TargetAcquisitionGoal` only ever reports the position `getPlayerTarget()` returns; when
  that callback returns `null`, no target is ever acquired and no melee attack is ever attempted that
  tick.
- A melee attack against the player is only resolved when a zombie's acquired target is within
  `HOSTILE_ATTACK_RANGE` (horizontal distance, matching `ChaseGoal`'s own stopping distance) of that
  zombie's current position, in the same tick.
- The shared `InvulnerabilityTracker` (keyed by `PLAYER_SENTINEL_ID`) admits at most one successful
  hit per `DEFAULT_INVULNERABILITY_TICKS`-tick window, regardless of how many zombies are in range
  that tick or how many ticks are processed.
- `onPlayerDamaged` is invoked with a positive `amount` only when `resolveMeleeAttack` reports
  `applied: true`; it is never invoked for a blocked (still-invulnerable) attempt.
- After `HostileMobRenderer.sync(zombies)`, the scene contains exactly one mesh per element of
  `zombies` (by id), and no others; after `dispose()`, zero.

## API and data model
```ts
// src/simulation/HostileMobBaseline.ts

/** The world-access surface HostileMobSystem needs — structurally identical to 145's
 *  PassiveMobWorld, satisfied transparently by the same PassiveMobWorldAdapter instance, but
 *  declared independently so this module has no import-time dependency on PassiveMobBaseline.ts. */
export interface HostileMobWorld extends ShapeWorld, NavigationWorld, SpawnWorld {
  getBiomeDefinition(x: number, z: number): BiomeTypeDefinition;
  getSurfaceHeightAt(x: number, z: number): number;
}

export interface ChunkCoord { readonly cx: number; readonly cz: number; }

/** The player's current world-facing position (+ optional velocity, for knockback-vector math the
 *  proposal computes but intentionally does not apply — see Non-goals). */
export interface PlayerTarget {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

export const ZOMBIE_BOUNDING_BOX: EntityPhysicsBox = { width: 0.6, height: 1.95, depth: 0.6 };
export const HOSTILE_SPAWN_CAP = 8;
export const HOSTILE_SPAWN_ATTEMPTS_PER_CHUNK = 2;
export const HOSTILE_SPAWN_CYCLE_INTERVAL_TICKS = 100;
export const HOSTILE_DETECTION_RADIUS = 16;
export const HOSTILE_FORGET_RADIUS = 32;
export const HOSTILE_ATTACK_RANGE = 2;
export const HOSTILE_CHASE_SPEED = 2.6;
export const HOSTILE_KNOCKBACK_STRENGTH = 0.4;
export const DEFAULT_HOSTILE_ATTACK_DAMAGE = 3;
export const HOSTILE_ATTACKS_PER_SECOND = 1;
export const HOSTILE_ATTACK_TICKS_SINCE_LAST = 20;
/** Sentinel InvulnerabilityTracker key representing the player (never a mintable EntityManager id). */
export const PLAYER_SENTINEL_ID = -1;

export class HostileMobSystem {
  constructor(registry: EntityRegistry, seed: number);
  getManager(): EntityManager;
  spawnCycle(
    world: HostileMobWorld,
    dimension: ResourceId,
    chunks: readonly ChunkCoord[],
    nearestPlayerDistance: (x: number, y: number, z: number) => number,
  ): number;
  tick(
    dt: number,
    world: HostileMobWorld,
    isChunkTicking: (cx: number, cz: number) => boolean,
    getPlayerTarget: () => PlayerTarget | null,
    onPlayerDamaged: (amount: number) => void,
  ): void;
  getActiveZombies(): readonly EntityInstance[];
}
```
```ts
// src/rendering/HostileMobRenderer.ts

export class HostileMobRenderer {
  constructor(scene: THREE.Scene);
  sync(zombies: readonly EntityInstance[]): void;
  dispose(): void;
}
```

## Control/data flow
1. **Construction** (once, in `Game`'s constructor): `new HostileMobSystem(createDefaultEntityRegistry(), this.seed)` and `new HostileMobRenderer(this.renderer.scene)`. No new adapter — `this.passiveMobWorld` is passed directly wherever a `HostileMobWorld` is required.
2. **Spawn-cycle sweep** (throttled, every `HOSTILE_SPAWN_CYCLE_INTERVAL_TICKS` frames, alongside the
   existing passive sweep and reusing the same enumerated ticking-chunk list): builds one
   `SpawnCategoryConfig` (`category: 'MONSTER'`, `typeId: <zombie id>`, `cap: HOSTILE_SPAWN_CAP`,
   `attemptsPerChunk: HOSTILE_SPAWN_ATTEMPTS_PER_CHUNK`) and calls `runSpawnCycleForChunk` once per
   chunk, exactly mirroring 145's sweep shape. Because `MONSTER`'s `isValidSpawnLight` requires
   `lightLevelAt <= MONSTER_MAX_LIGHT` (137) and `PassiveMobWorldAdapter.getSkyLight` returns `15` for
   any open-sky column, a zombie can only pass a real spawn attempt in a column already dark for some
   other reason (underground/enclosed) — documented in the proposal's Risks, unchanged here.
3. **Per-frame tick** (every frame, alongside the existing passive tick/sync):
   `hostileMobs.tick(dt, this.passiveMobWorld, (cx, cz) => this.world.isChunkSimulating(cx, cz),
   () => ({ x: this.player.position.x, y: this.player.position.y, z: this.player.position.z }),
   (amount) => this.survival.damage(amount, 'mob'))`:
   a. Increments a private per-system frame counter (independent of `Game.simTick`), used as the
      `currentTick` input to `resolveMeleeAttack`/`InvulnerabilityTracker` — a self-contained tick
      unit for this system only, matching 145's identical "per-frame, not fixed-20TPS" simplification.
   b. `selectTickingEntities(manager, isChunkTicking)` — the live set for this frame, filtered to the
      zombie type.
   c. For each entity without a registered goal bundle: create `TargetAcquisitionGoal` (priority 0,
      `findNearestTarget` delegating to `getPlayerTarget`, `detectionRadius`/`forgetRadius` from the
      module constants), `ChaseGoal` (priority 1, `targetSource` the acquisition goal,
      `speed: HOSTILE_CHASE_SPEED`, `attackRange: HOSTILE_ATTACK_RANGE`), `WanderGoal` (priority 2,
      seeded via `createNamedRng(seed, \`hostile-mob-ai-${entity.id}\`).fork('wander')`), `LookGoal`
      (priority 3, `.fork('look')`) on one new `GoalSelector`; store the bundle.
   d. `selector.tick()`, then `tickEntityPhysics(manager, entity.id, world, resolver,
      ZOMBIE_BOUNDING_BOX, dt)`.
   e. Re-fetch the (possibly physics-moved) entity; read `targetGoal.getTarget()`. If non-null and
      the horizontal distance to it is `<= HOSTILE_ATTACK_RANGE`: call `resolveMeleeAttack(tracker,
      PLAYER_SENTINEL_ID, frameCounter, attackDamage, HOSTILE_ATTACK_TICKS_SINCE_LAST,
      HOSTILE_ATTACKS_PER_SECOND, entity.x, entity.z, target.x, target.z,
      HOSTILE_KNOCKBACK_STRENGTH, { vx: target.vx ?? 0, vy: target.vy ?? 0, vz: target.vz ?? 0 })`; if
      `result.applied`, call `onPlayerDamaged(result.damage)`. The knockback in the result is
      intentionally discarded (see proposal Non-goals — no knockback is applied to the player).
4. **Per-frame render sync** (every frame): `hostileMobRenderer.sync(hostileMobs.getActiveZombies())`.

## Detailed behavior
- `attackDamage` is read once at construction from `registry.getByKey('zombie')!.attackDamage ??
  DEFAULT_HOSTILE_ATTACK_DAMAGE` — driven by the 017 registry data rather than duplicating the value
  as an independent hardcoded constant, so a future change to the zombie's registered `attackDamage`
  is picked up automatically.
- `HOSTILE_ATTACK_TICKS_SINCE_LAST`/`HOSTILE_ATTACKS_PER_SECOND` are chosen so
  `attackCooldownProgress(20, 1) = (20 + 0.5) / (20 / 1) = 1.025`, clamped to `1.0` — every mob swing
  deals full, unscaled damage (`cooldownDamageMultiplier(1) = 1.0`), sidestepping 141's
  player-attack-cooldown-charge scaling entirely, per the proposal's documented Risk mitigation. The
  *only* pacing mechanism for repeat hits is the target's own `DEFAULT_INVULNERABILITY_TICKS`-tick
  invulnerability window.
- The melee-attack distance check reuses `ChaseGoal`'s own `attackRange` value
  (`HOSTILE_ATTACK_RANGE`), so a zombie only ever attempts a hit exactly when it has stopped chasing
  (both conditions gate on the identical horizontal-distance comparison) — no separate/inconsistent
  range constant.
- `HostileMobSystem` owns exactly one `InvulnerabilityTracker` instance for its entire lifetime,
  shared across every zombie's attack attempt each tick, keyed only by `PLAYER_SENTINEL_ID` — multiple
  zombies attempting a hit in the same tick each call `resolveMeleeAttack`, but only the first (in
  ticking-set iteration order) can succeed; the rest observe `tracker.canDamage` already `false` for
  that tick (registered by the first) and return `applied: false`.
- A goal bundle is retained in a `Map<number, ZombieAIBundle>` keyed by entity id for the system's
  lifetime (no despawning yet, matching 145's identical simplification — a future despawn change
  would also clear the map entry).
- `HostileMobRenderer` uses a taller, darker box silhouette (distinct geometry/material instances,
  no shared state with `PassiveMobRenderer`/`WorldLife`) so a zombie is visually distinguishable from
  a pig at a glance.

## Failure modes
- `HostileMobSystem`'s constructor throws if the supplied `EntityRegistry` has no `zombie`
  definition (defensive; `createDefaultEntityRegistry()` always has one).
- `getPlayerTarget` throwing propagates unmodified (matches 140's own documented contract for
  `findNearestTarget` — a caller query bug should surface, not be silently swallowed).
- No other function/method throws for well-formed inputs.

## Compatibility/migration
- Two new, additive files. One `Game.ts` edit adding construction + two per-frame call sites (spawn
  sweep throttled identically to the passive sweep; tick/sync run every frame) — no existing method
  signature changes. `PassiveMobBaseline.ts` is not modified. No schema/save-format change (zombies
  are not persisted, matching 145's identical non-goal); no migration.

## Performance/resource constraints
- Spawn-cycle sweep: O(ticking chunks × `HOSTILE_SPAWN_ATTEMPTS_PER_CHUNK`) pure-math checks, run once
  per `HOSTILE_SPAWN_CYCLE_INTERVAL_TICKS` frames, bounded further by `HOSTILE_SPAWN_CAP` once
  reached.
- Per-frame tick/render: O(live zombie count), bounded by `HOSTILE_SPAWN_CAP`; each zombie's melee
  check is O(1).

## Testing seams
- `HostileMobSystem` is tested by constructing a `HostileMobWorld`-shaped plain object literal (not
  the concrete `PassiveMobWorldAdapter`), exactly mirroring 145's `PassiveMobSystem` test pattern —
  independent of `World`/`TerrainGenerator`.
- Melee-attack composition is tested by placing a zombie and a scripted `getPlayerTarget` within
  `HOSTILE_ATTACK_RANGE`, then asserting `onPlayerDamaged` is called with a positive amount on the
  first in-range tick and is not called again on an immediately-following tick (invulnerability
  gating) even though the target remains in range.
- `HostileMobRenderer` is tested with a real `THREE.Scene` and no GL context, exactly matching
  `PassiveMobRenderer.test.ts`'s existing pattern.

## Observability/debugging
- `HostileMobSystem.getActiveZombies()` exposes the full live set for a future debug-overlay hook
  (not added in this change — no HUD/debug-overlay edit here), mirroring 145's identical
  `getActivePigs()`.

## Affected files/symbols
- `src/simulation/HostileMobBaseline.ts` (new).
- `src/rendering/HostileMobRenderer.ts` (new).
- `src/engine/Game.ts` (edit: construction + two per-frame call sites; `onPlayerDamaged` wired to
  `SurvivalSystem.damage`).
- Tests: `tests/unit/HostileMobBaseline.test.ts` (new), `tests/unit/HostileMobRenderer.test.ts` (new).

## Rejected alternatives
- **Importing `PassiveMobWorld` from `PassiveMobBaseline.ts` instead of declaring an identical local
  `HostileMobWorld` interface**: rejected — the proposal explicitly keeps this baseline from touching
  or depending on `PassiveMobBaseline.ts` at all (separate `EntityManager` id-space, independent
  modules); TypeScript's structural typing means the same adapter instance still satisfies both
  declared interfaces with zero duplication of *behavior*, only of one small type declaration.
- **Giving the player a real `EntityManager` record so `resolveMeleeAttack`'s target-id parameter is
  "real"**: rejected — a much larger scope (player-as-entity unification) not requested by this
  change; a numeric sentinel id keyed into the same `InvulnerabilityTracker` achieves the identical
  observable cooldown behavior with zero risk to existing player code.
- **Applying `resolveMeleeAttack`'s computed knockback to the player**: rejected per the proposal's
  explicit non-goal — `Player`/`PlayerController` own their own velocity representation separately
  from `EntityVelocity`, and wiring one into the other is substantial, separate scope.
- **A single shared `EntityManager` for both passive and hostile systems**: rejected — the proposal
  explicitly defers unification; two independent managers (each with their own id space) is simpler
  and lower-risk for this baseline.

## Downstream dependencies
- 147 (`animal-breeding`) is unaffected (passive-only).
- 148 (`mob-drop-loot`) will need `EntityDataTracker` health wired onto both the pig and the zombie
  before death/loot makes sense — neither exists yet (both 145 and 146 document this identically).
- A future change must add player-initiated combat (an "attack" interaction action, an entity-AABB
  raycast, and a health/death pathway for mobs) before a zombie can be damaged or killed at all —
  flagged explicitly in the proposal's Non-goals, not silently dropped.
