# Proposal: 147-animal-breeding

## Problem
145 wired a real, live pig population into `Game` (`PassiveMobSystem`), but that population is
static: pigs wander and look around forever, never growing except through the throttled spawn
cycle. Vanilla lets a player feed two adult animals their species' breeding food to enter "love
mode," after which a nearby pair spawns a child and both parents enter a breeding cooldown. None of
that state machine exists yet.

## Goals
- A `LoveStateTracker` recording, per entity id, a love-mode expiry tick and a breeding-cooldown
  expiry tick.
- `feed(entityId, itemId, species, currentTick)`: enters love mode for `entityId` when `itemId`
  matches that species' breeding food and the entity is not on cooldown; otherwise a no-op
  (returns `false`).
- `findBreedingPair(entities, tracker, species, currentTick, range)`: the first same-species pair
  of in-love entities within `range` of each other (pure, deterministic given the same inputs).
- `completeBreeding(entityId, currentTick)`: clears love mode and starts the breeding cooldown.
- A `BreedingSystem` that, each tick, finds one eligible breeding pair among a caller-supplied
  entity list (reusing 145's existing `PassiveMobSystem`/`EntityManager` — no new entity id-space)
  and, when the live population is below a caller-supplied cap, spawns one child via
  `EntityManager.spawn` at the parents' midpoint and completes breeding for both parents.
- `Game` wiring: construct one `BreedingSystem` for the pig species (breeding food = wheat) and
  tick it every frame alongside the existing passive-mob tick, over `PassiveMobSystem`'s live pig
  set and manager — a spawned child pig automatically becomes a normal, wandering, rendered pig on
  the very next frame, since it shares `PassiveMobSystem`'s `EntityManager` and pig-type id.

## Non-goals
- **No player-initiated feeding interaction.** Exactly like 146's identical, explicitly-flagged
  gap for player→mob combat: `PlayerInteraction.ts`'s `InteractionAction` has no entity-hit
  raycast and no way to select a specific nearby entity to interact with at all. `feed()` is a
  pure, fully-tested API a future interaction-wiring change can call once that raycast exists; this
  baseline cannot demonstrate a player actually feeding a pig in the live game, because the
  plumbing to target one doesn't exist yet — flagged, not silently dropped.
- **No breeding-food consumption from the player's inventory.** Since there is no real feed
  interaction yet, there is nothing to consume an item stack from; `feed()` takes a bare `itemId`
  input, deferring inventory-slot consumption to whatever future change adds the real interaction.
- **No baby-to-adult growth/ageing.** A spawned child is, today, an ordinary adult-sized pig (145
  has no age/scale model at all); growth timers are out of scope here.
- **No love-mode visual indicator (heart particles).** 199 (`particle-system`) does not exist yet;
  purely a state-machine/spawn baseline.
- **Only one breeding pair processed per `tick()` call** — a deliberate simplification (documented
  in design.md) that keeps the system O(live population) per frame without a combinatorial
  matching pass; multiple ready pairs breed across subsequent frames instead of all at once, which
  is unobservable given love mode's multi-second duration relative to per-frame ticking.
- **No new entity type, no other species** — pig only, mirroring 145/146's identical "one species
  per baseline" scope.

## Preconditions
- Change 146 (`hostile-mob-baseline`) is VERIFIED.
- Change 145 (`passive-mob-baseline`) is VERIFIED and unchanged (`PassiveMobBaseline.ts` is not
  edited by this change).
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/PassiveMobBaseline.ts` (145, `PassiveMobSystem.getManager()`/`getActivePigs()`
  reused unmodified), `EntityManager.ts` (129, `spawn`), `src/data/EntityType.ts` (017, existing
  `pig` definition), `src/inventory/ItemRegistry.ts` (`ItemId.Wheat`, existing).

## Proposed change
1. `src/simulation/AnimalBreeding.ts` (NEW):
   - `LOVE_MODE_DURATION_TICKS`, `BREEDING_COOLDOWN_TICKS`, `BREEDING_RANGE` constants.
   - `BreedableSpecies` interface (`typeId`, `breedingFoodItemId`).
   - `LoveStateTracker` — per-entity-id love/cooldown expiry maps; `feed`, `isInLove`,
     `isOnCooldown`, `completeBreeding`, `clear`.
   - `findBreedingPair` — pure same-species/in-love/in-range pair search.
   - `childSpawnTransform(a, b)` — pure midpoint transform for the new child.
   - `BreedingSystem` — owns one `LoveStateTracker` and an internal frame counter (its own
     self-contained tick unit, matching 145/146's identical "per-frame, not fixed-20TPS"
     simplification); `feedEntity`, `tick(manager, entities, species, populationCap)`.
2. `src/engine/Game.ts` (EDIT): construct one `BreedingSystem`; per-frame tick call alongside the
   existing passive-mob tick, passing `passiveMobs.getManager()`, `passiveMobs.getActivePigs()`,
   the pig `BreedableSpecies` (breeding food `ItemId.Wheat`), and the existing `SPAWN_CAP` constant
   as the population cap.

## Compatibility and migration
- One new, additive file. One `Game.ts` edit adding construction + one per-frame call site; no
  existing method signature changes; `PassiveMobBaseline.ts` is not modified. No schema/save-format
  change (breeding state is not persisted, matching 145/146's identical non-goal); no migration.

## Risks
- **Nothing calls `feedEntity` in the live game yet** (see Non-goals), so `BreedingSystem.tick`
  observably does nothing in normal play until a future interaction change wires real feeding.
  Mitigation: fully covered by deterministic unit tests exercising `feedEntity` directly, matching
  how 140/141 were validated before 146 wired them into `Game`.
- **Reusing `PassiveMobSystem`'s `EntityManager` directly** (rather than a separate breeding
  entity store) means a child pig is immediately subject to `PassiveMobSystem.tick`'s own
  goal-assignment logic the next frame — intentional and desired (a bred child behaves exactly
  like any other pig), but means `BreedingSystem` must never be ticked with a stale/foreign entity
  list.

## Rollback strategy
One additive file plus a small, easily-revertible `Game.ts` edit; reverting fully removes the
feature with no other impact, and does not touch 145's or 146's files.

## Definition of Done
- All listed classes/functions implemented per design.md/spec.md.
- Unit tests cover: `LoveStateTracker` feed/cooldown/love-mode-expiry gating; `findBreedingPair`
  range/species/love-state filtering; `BreedingSystem.tick` spawns exactly one child for an
  eligible in-range pair, completes breeding for both parents, respects the population cap, and
  does nothing when no pair is eligible.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected — no
  regression). No new e2e assertion is added: nothing in the live game can trigger love mode yet
  (see Non-goals), so there is nothing observable to assert without a real feed-interaction
  pathway that does not exist — mirrors 146's identical reasoning for not asserting a natural
  zombie spawn.

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
