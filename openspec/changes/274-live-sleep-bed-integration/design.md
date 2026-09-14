# Design: 274-live-sleep-bed-integration

## Context/current state

- 198 `src/simulation/SleepFramework.ts`: `DAY_TICKS = 24000`,
  `NIGHT_START_TICK = 12542`, `NIGHT_END_TICK = 23459`; immutable
  `SleepState { sleeping, spawnSet, spawn: [x,y,z] }`,
  `createDefaultSleepState()` (awake, no spawn), `isNight(t)` (inclusive
  window), `canSleep(t, isStorm)` (night OR storm), `enterBed(state,
  bedPosition, occupied)` (same-bed re-enter ⇒ identical state no-op;
  occupied ⇒ `{ ok:false, reason:'occupied' }`; else NEW state
  `sleeping:true, spawnSet:true, spawn:bedPosition`), `leaveBed(state)`
  (awake, spawn kept; identity no-op when already awake),
  `canSkipNight(sleeping, total)` (`total > 0 && sleeping >= total`),
  `skipNight(t)` (`{ timeOfDay: 0, skippedTicks: DAY_TICKS - t }`),
  `spawnPoint(state)` (spawn or null), versioned
  `serialize/deserializeSleepState` (exact-keys, throws on any violation:
  non-object, wrong version, non-boolean flags, non-3-finite-number spawn,
  unknown key). No live caller.
- 265/266/267 live wiring in `src/engine/Game.ts`: raw-metadata persistence
  precedent — `WorldMetadataRepository` put/get pairs under reserved
  `__<name>__:<worldId>` keys (no `WorldMetadata` validation),
  `GamePersistence.initialXValue` loaded per-record in its own try/catch
  (corrupt ⇒ null), `saveX` guarded by `disposed || resetCompleted`, reset
  snapshot/restore + multi-store delete, `WorldArchive` optional field +
  `WorldArchiver` export/import passthrough (+ report flag). 267 death
  routing: `onSurvivalEvent('death')` applies `respawnModeAfterDeath` via
  `setGameMode` (persisted, toasted) before the unchanged `respawnPlayer()`
  reset. HUD chips/badges (`#gamemode-toggle`, `#hardcore-badge`) + toasts
  are the UI sync pattern. 245/267 E2E-only seams precedent
  (`testFreezeDayNight`, `testSetCameraPose`, `debugKillPlayer`).
- 260 block-use precedent: the brewing stand (block id 62) routes its block-
  use interaction to a panel; the use path is the existing per-block-id
  dispatch in the interaction layer (adventure/spectator gates from 266
  apply upstream).
- Registries: `BlockRegistry` highest id 62 (brewing stand); `ItemRegistry`
  highest id 66 (brewing items 64–66). Block items link item → block id via
  the 260 pattern.
- Day/night: the live clock is the fixed-tick simulation day-night clock
  (272 renders sun from its `worldSeconds`; 245's `testFreezeDayNight`
  freezes it). The 198 `timeOfDay` tick domain matches the 24000-tick day.
- `StartupSpawnSafety` (`src/engine/StartupSpawnSafety.ts`) resolves the
  final spawn position; `respawnPlayer()` currently targets the world spawn.
- No live weather `isStorm` input is owned by the Game today (196 weather is
  headless); the live `canSleep` storm input is therefore `false` in this
  change (documented; the night-window path is the live gate). The storm
  branch stays verified at the 198 unit level.

## Target state

Sleep is a live world feature alongside the 265/267 wiring:

1. A placeable, breakable, passable low bed block + bed item exist in the
   registries (next free ids).
2. `__sleep__` persists per world (default awake/no-spawn); corrupt payloads
   degrade to defaults; reset deletes; archive carries it.
3. Bed use runs 198: daytime use ⇒ refusal toast (no state change);
   night use ⇒ `enterBed` (spawn set to the bed cell, `sleeping` true),
   `canSkipNight(1,1)` ⇒ `skipNight` advances the clock to morning; a second
   use on the same bed while sleeping is the 198 identity no-op; use on an
   occupied bed is the structured refusal (unit-proven via the test seam);
   leaving (using again / waking) ⇒ `leaveBed` (awake, spawn kept).
4. `respawnPlayer()` teleports to `spawnPoint(this.sleep)` when set
   (spawn-safety resolved), world spawn otherwise. Hardcore death still
   routes to spectator via 267 (mode wins; the position target is the same
   bed-aware rule).
5. Toasts + a HUD `#sleep-indicator` reflect the store; E2E seams give
   deterministic time/bed control.

## Invariants

- I-1: Worlds without a `__sleep__` record behave exactly as before: awake,
  no spawn, respawn at world spawn.
- I-2: 198 is consumed read-only (no edits to `SleepFramework.ts`).
- I-3: 265/266/267 semantics are unchanged (mode persistence, death
  routing, adventure/spectator use gates all byte-for-byte the same for
  non-bed blocks).
- I-4: A refused bed use (daytime or occupied) mutates nothing (no write,
  no toast-drift, no state change) beyond the refusal toast.
- I-5: The `sleeping` flag never survives a boot (wake-on-boot); only
  `spawnSet`/`spawn` are durable.
- I-6: Single-player night skip is deterministic: enter at tick t ⇒ clock
  reads 0 afterwards; no partial-skip states.

## API and data model

```ts
// BlockRegistry (additive)
// bed block: next free id (63 expected — pinned at impl), name 'bed',
// placeable, breakable, passable low block (non-solid), procedural tile.
// ItemRegistry (additive)
// bed item: next free id (67 expected — pinned at impl), links to the bed
// block id (260 block-item pattern).

// WorldMetadataRepository (additive, 265 precedent)
putSleepData(worldId: string, payload: unknown): Promise<void>; // __sleep__:worldId
getSleepData(worldId: string): Promise<unknown | null>;

// GamePersistence (additive, 265 precedent)
initialSleepValue: SleepState | null;   // getter initialSleep
saveSleep(payload: unknown): void;      // disposed || resetCompleted ⇒ no-op
// load: try deserializeSleepState → wake-on-boot ({ sleeping:false,
//         spawnSet, spawn }); catch → null (degrade to default)
// reset: snapshot + restore + delete of the __sleep__ key

// WorldArchive (additive optional field, 265 precedent)
sleepData?: unknown | null;             // plain object; re-validated at load

// src/engine/Game.ts (wiring only + public seams)
private sleep: SleepState;              // default createDefaultSleepState()
getSleepState(): SleepState;            // read-only accessor
useBedAt(x: number, y: number, z: number): { ok: boolean; reason?: string };
    // canSleep gate → enterBed/leaveBed routing → saveSleep → UI/toast
saveSleep(): void;                      // persistence guards mirror saveGameMode
debugSetTimeOfDay(tick: number): void;  // E2E-only (245 seam precedent)
// respawnPlayer(): target = spawnPoint(this.sleep) ?? worldSpawn (safety-resolved)
```

## Control/data flow

Boot: `GamePersistence.start()` loads the `__sleep__` raw payload in its own
try/catch (corrupt ⇒ null) → `Game` hydrates
`persistenceImpl?.initialSleep ?? createDefaultSleepState()` (same
late-binding pattern as `initialGameMode`). The persisted state has already
had the wake-on-boot rule applied at load (sleeping forced false).

Bed use: player uses the bed block (existing use dispatch, 260 pattern;
266 gates apply — spectator cannot, adventure only if declared) →
`useBedAt(x,y,z)`:
- `!canSleep(timeOfDay, false)` ⇒ refusal toast, no mutation (I-4);
- `sleep.sleeping` and same cell ⇒ 198 identity no-op (toast "already
  sleeping");
- `sleep.sleeping` and different cell ⇒ `enterBed` to the new bed (spawn
  moves; vanilla-like bed switch);
- else `enterBed(state, [x,y,z], false)` ⇒ on ok: apply state, `saveSleep`,
  `canSkipNight(1,1)` ⇒ `skipNight(timeOfDay)` advances the clock to 0,
  enter toast, HUD sync.

Leave: use the bed again (or wake seam) while sleeping in it ⇒ `leaveBed`
(awake, spawn kept) ⇒ `saveSleep`, leave toast, HUD sync. (While sleeping,
the same-bed use toggles to leave; a different bed switches per above.)

Death/respawn: `onSurvivalEvent('death')` — 267 mode routing unchanged;
`respawnPlayer()` computes the target from `spawnPoint(this.sleep) ??
worldSpawn`, runs it through the existing spawn-safety resolution, and
teleports (rest of the reset unchanged).

Reload: the autosave/pagehide flush path calls `saveSleep` alongside
`saveGameMode`/`saveHardcore`; boot rehydrates (awake, spawn kept); E2E
asserts `spawnSet` + spawn cell + respawn landing.

## Detailed behavior

- Fresh world: awake, no spawn, respawn at world spawn (I-1).
- Use the bed at day (timeOfDay outside [12542,23459] and no storm):
  refusal toast `You can't sleep now.` (or equivalent), state unchanged,
  nothing written.
- Use at night: enter — spawn = bed cell, sleeping true, clock → 0
  (morning), toast `You set your spawn point.` + sleep indicator on.
- Re-use same bed while sleeping: leave (toggle) — awake, spawn kept.
- Use a second bed while sleeping in the first: switch — spawn moves to the
  new bed cell (198 `enterBed` new-state path), still sleeping.
- Occupied bed (unit seam only, `occupied=true`): `{ ok:false,
  reason:'occupied' }` refusal toast, no mutation.
- Corrupt `__sleep__` payload (wrong version, non-boolean, bad spawn,
  unknown key, non-object): caught at load ⇒ default awake/no-spawn; boot
  never throws for this record.
- Reset deletes the record (world returns to defaults); archive export
  includes `sleepData` when present; import validates at load (malformed ⇒
  pre-write throw, absent ⇒ defaults).
- `saveSleep` with no persistence or post-reset ⇒ silent no-op (265
  precedent).
- Hardcore death: mode ⇒ spectator (267, unchanged); the spectator
  respawn-position reset still uses the bed-aware target (mode wins,
  position is the same rule for everyone).

## Failure modes

- Unknown/extra keys, wrong versions, non-object payloads ⇒ load-time
  degrade to defaults (caught per-record); boot never throws.
- `saveSleep` with no persistence or post-reset ⇒ silent no-op.
- Archive with malformed `sleepData` (non-object): `validateWorldArchive`
  throws before any write (F257-L atomicity); absent field imports as
  defaults.
- Bed use in spectator: gated by the existing 266 no-interaction rule
  (never reaches `useBedAt`); adventure: gated by the existing 266
  declaration rule. No new gating invented.

## Compatibility/migration

- Zero schema changes to existing records (new reserved key). Old saves boot
  awake/no-spawn. No migration.
- Forward-created `__sleep__` records are inert on older builds (no reader).
- New bed block/item ids are additive registry entries (260 pattern).

## Performance/resource constraints

- No per-tick cost: the sleep state is read on bed use, death/respawn, and
  hydration only (all edge-triggered). One extra metadata read at boot, one
  debounced write on enter/leave — negligible against the existing autosave
  budget. No hot-path allocations.

## Testing seams

- Unit: repository put/get over the injectable mock factory (265 pattern);
  `GamePersistence` load-degrade + reset/archive passthrough over the same
  mock; composition matrix over 198 (enter/leave/occupied/same-bed
  identity/skip math/serialize round-trips/wake-on-boot) without full Game
  instantiation where possible.
- E2E (`window.__voxelGame`): `getSleepState`, `useBedAt`,
  `debugSetTimeOfDay`, block place/use via the existing interaction seams,
  real DOM for toasts/HUD, reload through `pagehide` + reload (265
  precedent).

## Observability/debugging

- `getSleepState()` exposes the live state; toasts narrate enter/leave/
  refusal; the HUD indicator reflects sleeping. No new logging/metrics.

## Affected files/symbols

- `src/world/BlockRegistry.ts`: +1 block (bed).
- `src/inventory/ItemRegistry.ts`: +1 item (bed).
- `src/storage/WorldMetadataRepository.ts`: +2 methods (putSleepData /
  getSleepData), `deleteRaw` comment.
- `src/storage/GamePersistence.ts`: +1 initial value/getter, +1 save,
  load/reset/restore/delete wiring.
- `src/storage/WorldArchive.ts`: +1 optional field + validation.
- `src/storage/WorldArchiver.ts`: export/import passthrough (+ report flag,
  265 pattern).
- `src/engine/Game.ts`: sleep field, hydration (wake-on-boot), `useBedAt`,
  bed-use dispatch hook, `saveSleep`, respawn target, toasts, HUD
  indicator, `debugSetTimeOfDay`, autosave/pagehide/dispose wiring.
- `index.html`: `#sleep-indicator` in the HUD.
- `src/styles.css`: indicator placement (266/267 badge precedent).
- Texture/tile asset for the bed (procedural, original).
- `tests/unit/SleepPersistence.test.ts` (new) + composition suite
  `tests/unit/SleepIntegration.test.ts` (new).
- NEW `tests/e2e/sleep-bed.spec.ts`.
- `PARITY_MATRIX.md` C274 row; program state files.

## Rejected alternatives

- Two-cell oriented bed with color states: rejected — the standing order
  forbids full block-state geometry parity beyond interact + spawn; a single
  passable cell keeps meshing/movement unchanged.
- Persisting `sleeping` across reloads: rejected — a boot mid-sleep is not a
  meaningful live state; wake-on-boot is deterministic and keeps the durable
  contract to the spawn point only.
- Wiring live weather as the `canSleep` storm input: rejected for this
  change — no live `WeatherState` is Game-owned yet; adding one is a
  separate integration. The storm branch stays 198-verified; the live gate
  is the night window (documented).
- Skipping the night only on `leaveBed`: rejected — vanilla skips on enter;
  198 `skipNight` is the verified primitive and enter is the natural
  trigger (I-6 deterministic).

## Downstream dependencies

None: 274 is a leaf live-integration (no later change in 274–277 consumes
its seams; future multiplayer sleep would build on the persisted spawn).
