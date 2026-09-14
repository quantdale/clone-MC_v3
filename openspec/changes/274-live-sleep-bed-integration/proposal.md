# Proposal: 274-live-sleep-bed-integration

## Problem

Change 198 (`SleepFramework`) verified the pure sleep rules over the fixed-tick
24000-tick day — the night window [12542, 23459], `canSleep` (night or storm),
bed occupancy with spawn-point-on-sleep, the all-players night-skip rule, the
time skip itself, and versioned persistence. As shipped, sleep has **no live
semantics**:

- no bed block or bed item exists in `BlockRegistry` / `ItemRegistry` — there
  is nothing placeable to sleep in;
- no `__sleep__` world record exists; no spawn point is ever stored;
- `respawnPlayer()` always teleports to the world spawn; the `SleepFramework`
  spawn point is never consulted;
- no UI feedback for sleeping;
- zero live consumers of any 198 accessor.

## Goals

1. Bed content: a placeable, breakable bed block + a bed item (next free
   registry ids after brewing stand 62 / item 66), original procedural assets
   only.
2. Persistence: a world-scoped `__sleep__` record (the 198 versioned
   `SleepState`) with degrade-to-defaults on corrupt/absent payloads, reset
   delete, and archive passthrough, following the 265–267 raw-metadata
   precedent.
3. Bed use: the existing block-use interaction path routes bed use through 198
   `enterBed` / `leaveBed` — occupied rejection, night/storm `canSleep`
   gating (daytime refusal), spawn set on successful enter, spawn kept on
   leave, and the single-player night skip via `canSkipNight` / `skipNight`.
4. Respawn: `respawnPlayer()` targets the `SleepFramework` spawn point when
   set (world spawn otherwise); 267 hardcore mode routing stays unchanged
   (hardcore permanent death ⇒ spectator still wins).
5. UI feedback: toasts on enter/leave/refusal + a HUD sleep indicator
   (DOM/CSS/text, original assets only).
6. Proof: unit + browser E2E — daytime refusal → force night → place/use bed
   → sleeping + spawn set + skip to morning → leave keeps spawn → reload
   persists spawn → respawn lands at the bed.

## Non-goals

- Multiplayer sleep majority rules (222–237 own the network boundary);
  `canSkipNight` runs with `totalPlayers = 1` (single player, always all
  sleeping once the local player is).
- Phantoms / hostile reactions to sleeping.
- Full bed block-state geometry parity (orientation/color states, two-cell
  footprint, burning) beyond what interact + spawn need.
- Redesigning the `SleepFramework` API (consumed as-is; only E2E test seams
  are added).
- 258 headed FPS certification (stays BLOCKED, untouched).
- Cross-session sleeping: the `sleeping` flag is transient (wake-on-boot);
  only the spawn point is durable.

## Preconditions

- 198 VERIFIED (pure sleep rules, unchanged by this change).
- 265/266/267 VERIFIED (this change extends their seams without altering
  them: 265 raw-metadata persistence pattern, 267 death/respawn routing).
- 260 VERIFIED (block-use panel dispatch precedent — brewing stand id 62).
- 258 BLOCKED (no headed work in this change).

## Dependencies

- `src/simulation/SleepFramework.ts` (198): `createDefaultSleepState`,
  `enterBed`, `leaveBed`, `canSleep`, `isNight`, `canSkipNight`, `skipNight`,
  `spawnPoint`, `serializeSleepState` / `deserializeSleepState` — consumed,
  not modified.
- `src/engine/Game.ts` 265/267 wiring (`gameMode`/`hardcore` persistence
  pattern, `respawnPlayer`, `onSurvivalEvent`, toasts, HUD chips, E2E debug
  seams) — extended, not altered.
- `src/world/BlockRegistry.ts` + `src/inventory/ItemRegistry.ts` — extended
  with the bed block/item.
- `src/storage/*` 265–267 raw-metadata precedent (`__gamemode__`,
  `__hardcore__`, …) — extended with one record.

## Proposed change

1. **Registries**: bed block (next free id; placeable, breakable, passable
   low block) + bed item (next free id) linked to it; procedural
   texture/tile; unit pins on ids/flags.
2. **Persistence**: `WorldMetadataRepository.putSleepData` / `getSleepData`
   (`__sleep__:<worldId>` key); `GamePersistence.initialSleepValue` +
   `saveSleep` + degrade-to-default load + reset snapshot/restore/delete +
   `WorldArchive.sleepData` optional field + `WorldArchiver` export/import
   passthrough (+ report flag).
3. **Live store**: `Game.sleep: SleepState` (default awake, no spawn); boot
   hydration with the wake-on-boot rule (hydrated `sleeping` is forced
   `false`, `spawnSet`/`spawn` kept); bed-use path → `enterBed` (single
   player ⇒ `occupied` false; `canSleep` gate) / `leaveBed`; `saveSleep`
   guards mirror `saveGameMode`.
4. **Night skip**: on a successful single-player enter, `canSkipNight(1, 1)`
   ⇒ `skipNight(timeOfDay)` advances the live day-night clock to morning
   (timeOfDay 0).
5. **Respawn**: `respawnPlayer()` target = `spawnPoint(this.sleep) ?? world
   spawn`, resolved through the existing spawn-safety path; 267 mode routing
   unchanged.
6. **UI**: toasts (enter / leave / refusal) + HUD `#sleep-indicator` synced
   with the store.
7. **Seams**: E2E-only `debugSetTimeOfDay` (if no existing time-set seam) +
   a bed-use test seam (245/267 precedent).
8. **Tests**: persistence round-trip + degrade + reset/archive unit suite;
   store/use/skip/respawn composition unit suite; new browser E2E spec
   reusing the 265 harness shape (seams + real DOM + `pagehide` reload).

## Compatibility and migration

- New record + new registry entries only; old saves boot awake with no spawn
  (the specified defaults). No migration needed.
- Reset deletes the record (world returns to defaults); archives carry
  `sleepData` as an optional field (absent ⇒ defaults on import).
- Saves authored by this build load on older builds with the record inert
  (unknown namespaced raw payloads are never parsed by old code).

## Risks

- E2E flakiness under software WebGL: reuse the 265 harness (pointer lock,
  seeded world, `pagehide` reload); time is driven by the deterministic seam,
  not gameplay races.
- Respawn position inside the bed cell: the existing spawn-safety path
  resolves the final position; pinned by unit tests.
- Passable low block vs solid: the bed is a passable low block (vanilla-like;
  the player can stand in the cell); pinned by the registry-flags unit and
  the respawn unit.

## Rollback strategy

Revert the 274 commit range; the `__sleep__` record is inert without this
code (raw payload no reader parses); the bed block/item ids simply do not
exist on older builds.

## Definition of Done

- All 13 tasks checked with evidence; every MUST/SHALL requirement maps to a
  passing test; baseline gates green (`typecheck`, `lint`, `test`, `build`,
  `test:e2e`); `PARITY_MATRIX.md` C274 row `exact`; 258 still BLOCKED (not
  VERIFIED); 259–273 still VERIFIED.

## Advancement gate

Standard gate: 100% tasks (floor 90% only with an explicit non-blocking
exception), all MUST/SHALL verified, required tests green, no unresolved
data-loss/corruption/determinism/compatibility/security/regression blocker.
