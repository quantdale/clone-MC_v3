# Design: 150-villager-professions

## Context/current state
- 017's `EntityRegistry` has no `villager` entry; 149's `PointOfInterestManager` has no consumer.
- 149's `findNearestUnclaimed`/`claim` already provide exactly the two operations profession
  assignment needs ("find the nearest free matching workstation" + "take it"); no change to
  `PointOfInterest.ts` is needed.
- `Lighting.getTimeOfDayHours()` (an existing `Game`-internal source) already produces an hour value
  in a compatible domain, but this module takes a plain `number` parameter rather than depending on
  `Lighting` directly, keeping it fully testable and decoupled — the same "caller supplies the
  input, module stays pure" convention `HostileMobSystem`/`BreedingSystem` already established for
  player position/food-item inputs.

## Target state
- `src/data/EntityType.ts`: one additional `villager` `CREATURE` definition.
- `src/simulation/VillagerProfession.ts`: `VillagerProfession`/`VillagerProfessionRegistry`/
  `createDefaultVillagerProfessionRegistry`, `scheduleForHour`, and `VillagerProfessionSystem`
  (owns per-villager assignment tracking; composes 149's manager for claim/release).

## Invariants
- `VillagerProfessionRegistry` never contains a "no profession" entry — unemployment is represented
  as `null`, never a registered profession id.
- `VillagerProfessionSystem.assignProfession` either returns `null` and claims nothing (no
  matching, unclaimed workstation exists for any profession within `maxDistance`), or returns a
  profession id **and** has claimed exactly one POI (the one backing that profession) — never a
  profession id with no corresponding claim, and never more than one claim per call.
- Professions are tried strictly in the caller-supplied `professions` list's order; the first
  profession with an available (unclaimed, in-range) workstation wins, even if a later profession's
  workstation would have been nearer.
- `unassign` releases the tracked POI (if any) and always clears the tracked assignment, whether or
  not a POI was actually claimed — safe to call on an already-unassigned villager (no-op, returns
  `false`).
- `scheduleForHour` is a total, pure function over `[0, 24)`: every hour in that range maps to
  exactly one of `'WORK'`/`'REST'`/`'MEANDER'`, with no gap or overlap.

## API and data model
```ts
// src/simulation/VillagerProfession.ts

export interface VillagerProfession {
  readonly id: ResourceId;
  readonly key: string;
  readonly workstationType: ResourceId;
}

export class VillagerProfessionRegistry {
  constructor(professions: VillagerProfession[]);
  get finalized(): boolean;
  get size(): number;
  get(id: ResourceId): VillagerProfession;
  getOptional(id: ResourceId): VillagerProfession | undefined;
  has(id: ResourceId): boolean;
  getByKey(key: string): VillagerProfession | undefined;
  entries(): readonly VillagerProfession[];
}

export function createDefaultVillagerProfessionRegistry(): VillagerProfessionRegistry;

export type VillagerSchedulePhase = 'WORK' | 'REST' | 'MEANDER';

/** WORK: [6,18); MEANDER: [18,22); REST: [22,24) union [0,6). */
export function scheduleForHour(hour: number): VillagerSchedulePhase;

export interface VillagerAssignment {
  readonly professionId: ResourceId;
  readonly poiX: number;
  readonly poiY: number;
  readonly poiZ: number;
}

export class VillagerProfessionSystem {
  assignProfession(
    entityId: number,
    poiManager: PointOfInterestManager,
    professions: readonly VillagerProfession[],
    x: number,
    y: number,
    z: number,
    maxDistance: number,
  ): ResourceId | null;
  unassign(entityId: number, poiManager: PointOfInterestManager): boolean;
  getAssignment(entityId: number): VillagerAssignment | undefined;
}
```

## Control/data flow
1. **Assignment** (a future villager goal, analogous to 140's `TargetAcquisitionGoal`):
   `system.assignProfession(id, poiManager, professions, x, y, z, maxDistance)`:
   a. If `system.getAssignment(id)` is already set, return its `professionId` unchanged (idempotent
      — an already-employed villager is not reassigned).
   b. For each `profession` in `professions` (registration order): call
      `poiManager.findNearestUnclaimed(profession.workstationType, x, y, z, maxDistance)`; on the
      first non-null result, `poiManager.claim(poi.x, poi.y, poi.z)`, record the assignment
      (`{ professionId: profession.id, poiX, poiY, poiZ }`), and return `profession.id`.
   c. If no profession finds an available workstation, return `null` (no assignment recorded).
2. **Release** (a future "villager despawned/changed job" path): `system.unassign(id, poiManager)`
   looks up the tracked assignment; if present, `poiManager.release(poiX, poiY, poiZ)` and delete
   the tracked entry, returning `true`; if absent, returns `false` (no-op).
3. **Schedule** (a future per-tick villager goal, analogous to how `HostileMobSystem` calls
   `getPlayerTarget()`): `scheduleForHour(currentHour)` — a pure lookup, no state.

## Detailed behavior
- `createDefaultVillagerProfessionRegistry()` seeds three representative professions: `farmer` →
  `minecraft:poi/farmer`, `librarian` → `minecraft:poi/librarian`, `weaponsmith` →
  `minecraft:poi/weaponsmith` — enough to exercise priority-ordering in tests without claiming to
  be an exhaustive vanilla profession catalog (a later content-expansion change can add more; the
  registry/system code does not hardcode a fixed count anywhere).
- `VillagerProfessionSystem` stores assignments in a `Map<number, VillagerAssignment>` keyed by
  entity id — the same lightweight per-entity-id bookkeeping pattern `LoveStateTracker`/
  `MobHealthTracker` already use, avoiding any dependency on a specific `EntityManager` instance.
- `assignProfession`'s already-assigned short-circuit (step 1a) means a caller can safely call it
  every tick for every unclaimed-or-claimed villager without needing to track "have I already
  assigned this one" itself.

## Failure modes
- No function/method in this module throws for well-formed inputs; `unassign` on an unassigned
  villager is a no-op returning `false`, matching 149's own `claim`/`release` false-return
  convention for an ineligible call.

## Compatibility/migration
- One `EntityType.ts` edit (additive) and one new, additive simulation file. No `Game.ts` edit; no
  schema/save-format change; no migration. `EntityType.test.ts`'s hardcoded default-registry
  size/key-list assertions require an update (12 entities, `villager` added to the sorted key list)
  — required test maintenance for a legitimate new entity addition, the same pattern 148's
  `BlockItemSeparation.test.ts` update followed.

## Performance/resource constraints
- `assignProfession` is O(professions × 149's `findNearestUnclaimed` cost) per call — bounded by a
  small, caller-controlled profession list.

## Testing seams
- `VillagerProfessionRegistry`/`scheduleForHour` are tested standalone.
- `VillagerProfessionSystem` is tested against a real `PointOfInterestManager` (149) — no `World`/
  `EntityManager`/`Game` dependency.

## Observability/debugging
- `getAssignment(entityId)` exposes the current profession/POI binding for a future debug-overlay
  hook (not added in this change).

## Affected files/symbols
- `src/data/EntityType.ts` (edit: one new `villager` definition).
- `src/simulation/VillagerProfession.ts` (new).
- Tests: `tests/unit/EntityType.test.ts` (edit: updated count/key-list assertions),
  `tests/unit/VillagerProfession.test.ts` (new).

## Rejected alternatives
- **Choosing the globally nearest workstation across all professions (not priority-ordered)**:
  rejected — vanilla assigns by profession-registration/attempt order, not a single cross-profession
  nearest-search; priority order is simpler to reason about and matches the spec's own worked
  scenario.
- **Persisting profession assignment now**: rejected — no real villager entity is ever spawned yet
  (no consumer), so there is nothing to persist; matches 145-149's identical non-persistence
  simplification.
- **Wiring a `GoalSelector`-based villager AI in this same change**: rejected — a separate, larger
  scope (goal composition, `Game` wiring, a villager renderer) that has no real spawn source yet
  (no village generation); mirrors 140's own precedent of shipping goals unconsumed before 146
  wired them in.

## Downstream dependencies
- 151 (`villager-trading`) will read a villager's assigned profession to determine its trade offer
  pool.
- 198 (`sleep-and-time-skip`) will likely add a parallel bed-POI-claiming path alongside this
  change's workstation claiming, and consume `scheduleForHour`'s `'REST'` phase.
- A future villager-AI-wiring change (analogous to 146) is the real consumer of
  `VillagerProfessionSystem` end-to-end, once village/structure generation exists to spawn
  villagers and place workstations at all.
