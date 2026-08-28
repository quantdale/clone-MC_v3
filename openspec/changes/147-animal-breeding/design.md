# Design: 147-animal-breeding

## Context/current state
- `PassiveMobSystem` (145) owns its `EntityManager` privately but exposes `getManager()` and
  `getActivePigs()` — both already used by `PassiveMobBaseline.test.ts` as the test seam for
  spawning entities directly. 147 uses these same two public methods rather than adding any new
  surface to `PassiveMobBaseline.ts`.
- `EntityManager.spawn(typeId, dimension, transform, opts?)` is the only way to create a new
  entity; it requires no per-species knowledge beyond a registered `typeId`, so a bred child pig is
  created exactly the same way 138's `runSpawnCycleForChunk` creates a naturally-spawned one — it
  is indistinguishable from any other pig to `PassiveMobSystem.tick`, `PassiveMobRenderer`, or
  `getActivePigs()`.
- There is still no entity-hit raycast or "interact with this specific nearby entity" action
  anywhere in `PlayerInteraction` (the same gap 146 flagged for player→mob combat). Feeding a
  specific pig therefore cannot be wired into real player input yet; `feed()` is designed as a
  pure, injectable-input API precisely so a later interaction change can call it without any
  change to this module.
- `Game.update(dt)` runs once per animation frame; 145/146 both established the "own frame-count
  cadence, not fixed-20TPS" convention for their own tick timing. 147 follows the identical
  convention with its own internal frame counter (independent of `Game.simTick`, `PassiveMobSystem`,
  and `HostileMobSystem`'s own counters) for love-mode/cooldown timing.

## Target state
- `src/simulation/AnimalBreeding.ts`: `LoveStateTracker` (per-entity love/cooldown expiry),
  `findBreedingPair`/`childSpawnTransform` (pure helpers), and `BreedingSystem` (owns one tracker +
  frame counter; `feedEntity`/`tick`).
- `Game` constructs one `BreedingSystem` for the pig species and ticks it every frame against
  `PassiveMobSystem`'s live manager/pig set.

## Invariants
- `LoveStateTracker.feed(id, itemId, species, currentTick)` returns `true` and makes
  `isInLove(id, currentTick)` true for the next `LOVE_MODE_DURATION_TICKS` ticks only when
  `itemId === species.breedingFoodItemId` and `id` is not currently on cooldown; otherwise it
  returns `false` and love/cooldown state for `id` is unchanged.
- `LoveStateTracker.completeBreeding(id, currentTick)` always clears `id`'s love mode and starts a
  `BREEDING_COOLDOWN_TICKS`-long cooldown, regardless of prior state.
- `findBreedingPair` only ever returns two entities that are (a) of `species.typeId`, (b) both
  currently in love per the supplied tracker/tick, and (c) within `range` of each other; it returns
  `null` when fewer than two such entities exist.
- `BreedingSystem.tick` spawns at most one child per call, only when `findBreedingPair` finds an
  eligible pair AND the supplied entity list's length is below `populationCap`; on a successful
  spawn, both parents' love mode is cleared and their cooldown starts in the same call.
- `BreedingSystem.tick` never spawns when the population is already at or above `populationCap`,
  regardless of how many eligible pairs exist (love/cooldown state for those pairs is left
  untouched, so they remain eligible once population drops).

## API and data model
```ts
// src/simulation/AnimalBreeding.ts

export const LOVE_MODE_DURATION_TICKS = 600;   // 30s-equivalent at this system's own tick cadence
export const BREEDING_COOLDOWN_TICKS = 6000;   // 5min-equivalent, same cadence
export const BREEDING_RANGE = 8;               // blocks

export interface BreedableSpecies {
  readonly typeId: ResourceId;
  readonly breedingFoodItemId: number;
}

export class LoveStateTracker {
  feed(entityId: number, itemId: number, species: BreedableSpecies, currentTick: number): boolean;
  isInLove(entityId: number, currentTick: number): boolean;
  isOnCooldown(entityId: number, currentTick: number): boolean;
  completeBreeding(entityId: number, currentTick: number): void;
  clear(entityId?: number): void;
}

export function findBreedingPair(
  entities: readonly EntityInstance[],
  tracker: LoveStateTracker,
  species: BreedableSpecies,
  currentTick: number,
  range?: number, // default BREEDING_RANGE
): readonly [EntityInstance, EntityInstance] | null;

export function childSpawnTransform(a: EntityInstance, b: EntityInstance): EntityTransform;

export class BreedingSystem {
  feedEntity(entityId: number, itemId: number, species: BreedableSpecies): boolean;
  tick(
    manager: EntityManager,
    entities: readonly EntityInstance[],
    species: BreedableSpecies,
    populationCap: number,
  ): number; // 0 or 1 children spawned this call
}
```

## Control/data flow
1. **Feed** (currently only reachable from a test or a future interaction change):
   `breeding.feedEntity(pigId, itemId, pigSpecies)` delegates to
   `tracker.feed(pigId, itemId, pigSpecies, this.frameCounter)`.
2. **Per-frame tick** (every frame, alongside the existing passive-mob tick):
   `breeding.tick(passiveMobs.getManager(), passiveMobs.getActivePigs(), pigSpecies, SPAWN_CAP)`:
   a. Increments the internal frame counter.
   b. If `entities.length >= populationCap`, returns `0` immediately (no pair search, no state
      change — capped pairs simply wait).
   c. `findBreedingPair(entities, tracker, species, frameCounter)` — `null` short-circuits to `0`.
   d. On a found pair: `tracker.completeBreeding(a.id, frameCounter)` and
      `tracker.completeBreeding(b.id, frameCounter)`, then
      `manager.spawn(species.typeId, a.dimension, childSpawnTransform(a, b))`. Returns `1`.
3. **Automatic downstream pickup**: because the child is spawned on the same `EntityManager`
   `PassiveMobSystem` already owns, `PassiveMobSystem.tick`'s own `selectTickingEntities` +
   pig-type filter picks it up the very next frame (lazily assigning it a `WanderGoal`/`LookGoal`
   bundle exactly like any other pig), and `PassiveMobRenderer.sync` renders it — no additional
   wiring needed for either.

## Detailed behavior
- `childSpawnTransform` places the child at the horizontal midpoint of the two parents' positions
  and at the lower of the two parents' `y` (so it never spawns floating above the ground when
  parents are on slightly different heights), with `yaw: 0, pitch: 0`.
- `findBreedingPair` iterates the in-love same-species subset in the caller-supplied entity order
  (stable, matching `EntityManager.getAll()`'s insertion order) and returns the first pair (by
  nested-loop scan order) within `range` — deterministic given identical inputs, no RNG involved
  anywhere in this module.
- Feeding an already-in-love entity again (before it breeds or the window expires) simply refreshes
  the expiry to `currentTick + LOVE_MODE_DURATION_TICKS` (matches `Map.set`'s overwrite semantics —
  no special-cased "already in love" branch needed).
- A cooldown strictly gates `feed()` (an on-cooldown entity cannot re-enter love mode at all) but
  does not affect an already-in-love entity's existing expiry — `completeBreeding` is the only
  thing that starts a cooldown, and it always also clears love mode in the same call, so the two
  states never overlap for one entity.

## Failure modes
- No function/method in this module throws for well-formed inputs; `feed`/`tick` degrade to
  `false`/`0` for every "not eligible" case rather than throwing.

## Compatibility/migration
- One new, additive file. `Game.ts` gains one construction plus one per-frame call site — no
  existing method signature changes. No schema/save-format change; breeding state (love/cooldown
  timers) is session-only, matching 145/146's identical non-persistence simplification.

## Performance/resource constraints
- `findBreedingPair` is O(n^2) over the in-love subset only (not the full population), which stays
  small in practice since only fed entities are ever in love; `BreedingSystem.tick` overall is
  bounded by the live pig population, itself capped at `SPAWN_CAP` (12).

## Testing seams
- `LoveStateTracker`/`findBreedingPair`/`childSpawnTransform` are tested with plain
  `EntityInstance` object literals — no `EntityManager`/`World` needed.
- `BreedingSystem.tick` is tested against a real `EntityManager` (129, `createDefaultEntityRegistry()`)
  so `manager.spawn`'s actual side effect (a new pig appearing in `manager.getAll()`) is observed
  directly, mirroring how `PassiveMobBaseline.test.ts` uses a real `EntityManager` via
  `PassiveMobSystem.getManager()`.

## Observability/debugging
- No new debug-overlay hook (`BreedingSystem` has no equivalent of `getActivePigs()` beyond what
  `PassiveMobSystem` already exposes — a bred child is just another pig).

## Affected files/symbols
- `src/simulation/AnimalBreeding.ts` (new).
- `src/engine/Game.ts` (edit: construction + one per-frame call site).
- Tests: `tests/unit/AnimalBreeding.test.ts` (new).

## Rejected alternatives
- **A separate `EntityManager`/id-space for bred children**: rejected — a child must join the same
  population `PassiveMobSystem`/`PassiveMobRenderer` already manage to behave/render like a normal
  pig with zero extra wiring; a second manager would require merging two populations for every
  future pig-consuming change (breeding again, loot, despawn), pure added complexity with no
  benefit.
- **Processing every eligible pair per tick (not just one)**: rejected for this baseline — a single
  eligible-pair-per-tick cap keeps the per-frame cost trivially bounded and deterministic; because
  love mode lasts many frames relative to the tick cadence, multiple ready pairs still all breed
  within a few frames of each other, which is behaviorally indistinguishable from "all at once" in
  normal play.
- **Wiring real player-feed interaction now**: rejected — requires an entity-hit raycast and a new
  interaction action, the same substantial, separate scope 146 already flagged and deferred for
  player→mob combat; bundling it here would silently expand this change's scope past "the breeding
  state machine."

## Downstream dependencies
- 148 (`mob-drop-loot`) is unaffected (breeding does not touch health/death/loot).
- A future interaction-wiring change (the same one 146 flagged for player→mob combat) should also
  wire `BreedingSystem.feedEntity` to a real "feed this specific nearby entity" action once the
  entity-hit raycast exists.
