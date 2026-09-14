# Spec: live-sleep-bed-integration

## Contract

Wire the verified headless `SleepFramework` (198) into the live Game: a
placeable bed block + item, a bed-use interaction path running
`enterBed`/`leaveBed` with night/storm gating and occupied rejection, a
world-scoped `__sleep__` spawn-point record, single-player night skip,
bed-aware respawn, and minimal toast/HUD feedback. Non-sleep behavior is
unchanged.

## Definitions

- **Bed cell**: the single world cell the bed block occupies.
- **Sleep state**: the 198 `SleepState` (`{ sleeping, spawnSet, spawn }`),
  default awake with no spawn point.
- **World spawn**: the existing world-gen spawn target used by
  `respawnPlayer()` today.
- **Live time-of-day**: the fixed-tick simulation clock's day tick
  (0–23999) as consumed by the 198 night window.
- **Wake-on-boot**: the load rule that a hydrated `sleeping` is forced
  `false` while `spawnSet`/`spawn` are kept.

## Invariants

- I-1: Worlds without a `__sleep__` record boot awake with no spawn and
  respawn at the world spawn (pre-274 behavior).
- I-2: `SleepFramework.ts` (198) is consumed read-only.
- I-3: 265/266/267 behavior is unchanged for non-bed blocks and non-death
  flows.
- I-4: A refused bed use mutates nothing.
- I-5: `sleeping` never survives a boot; only `spawnSet`/`spawn` are
  durable.

## Requirements

### Requirement: bed block and item

The registries SHALL add a placeable, breakable bed block and a bed item
linked to it, using the next free ids and original procedural assets only.

#### Scenario: registry entries

- **GIVEN** a fresh registry build
- **WHEN** the block and item registries are queried
- **THEN** the bed block exists with a unique id above the previous maximum
  (62) and the bed item exists with a unique id above the previous maximum
  (66), the item maps to the bed block id (place → bed block), and the bed
  block is breakable and a passable low block (non-solid).

### Requirement: sleep persistence

The Game SHALL persist the sleep state under `__sleep__:<worldId>` with the
198 versioned serializer, load it at boot with degrade-to-defaults
quarantine (wake-on-boot), delete it on world reset, and carry it through
archive export/import.

#### Scenario: fresh world defaults

- **GIVEN** a world with no `__sleep__` record
- **WHEN** the Game boots
- **THEN** `getSleepState()` is the default (awake, `spawnSet` false, spawn
  [0,0,0]).

#### Scenario: spawn round-trip

- **GIVEN** a successful bed enter at cell (x,y,z) + `leaveBed`
- **WHEN** the page reloads through the save path
- **THEN** `getSleepState()` has `spawnSet` true, `spawn` equal to (x,y,z),
  and `sleeping` false (wake-on-boot).

#### Scenario: sleeping does not persist

- **GIVEN** a player currently sleeping (`sleeping` true)
- **WHEN** the page reloads through the save path
- **THEN** the booted state is awake (`sleeping` false) with the spawn point
  kept.

#### Scenario: corrupt payloads degrade

- **GIVEN** a stored `__sleep__` payload with a wrong version, a non-boolean
  flag, a non-finite/short spawn, an unknown key, or a non-object
- **WHEN** the Game boots
- **THEN** the world boots with the default state; the corrupt record blocks
  neither boot nor any other record.

#### Scenario: reset and archive

- **GIVEN** a world with a set spawn point
- **WHEN** the world is reset
- **THEN** the record is deleted and the world boots to defaults.
- **WHEN** the world is archived and re-imported instead
- **THEN** `spawnSet`/`spawn` survive field-for-field (booted awake);
  archives without the field import as defaults; archives with a malformed
  field are rejected before any write.

### Requirement: bed use interaction

Using the bed block SHALL run the 198 rules: the `canSleep` gate
(night window or storm; live storm input false), `enterBed` (occupied
rejection; same-bed identity), `leaveBed` (spawn kept), `saveSleep`, and the
single-player night skip.

#### Scenario: daytime refusal

- **GIVEN** the live time-of-day outside [12542, 23459] and no storm
- **WHEN** the player uses the bed
- **THEN** a refusal is surfaced (toast), `getSleepState()` is unchanged,
  and nothing is written.

#### Scenario: night enter sets spawn and skips to morning

- **GIVEN** the live time-of-day inside [12542, 23459] and the player not
  sleeping
- **WHEN** the player uses the bed at cell (x,y,z)
- **THEN** `getSleepState()` is `{ sleeping: true, spawnSet: true, spawn:
  (x,y,z) }`, the live clock advances to 0 (morning), an enter toast shows,
  and the state is persisted.

#### Scenario: occupied rejection

- **GIVEN** a bed reported occupied (single-player test seam)
- **WHEN** the player uses the bed
- **THEN** the result is the structured occupied refusal, a refusal toast
  shows, and `getSleepState()` is unchanged.

#### Scenario: leave keeps spawn

- **GIVEN** the player sleeping in the bed at (x,y,z)
- **WHEN** the player leaves (uses the same bed again / wakes)
- **THEN** `getSleepState()` is `{ sleeping: false, spawnSet: true, spawn:
  (x,y,z) }` and the state is persisted.

#### Scenario: bed switch moves spawn

- **GIVEN** the player sleeping in bed A
- **WHEN** the player uses a different bed B at night
- **THEN** `getSleepState()` has `spawn` equal to B's cell (198 new-state
  path) and `sleeping` true.

#### Scenario: mode gates unchanged

- **GIVEN** the player in spectator (or adventure without a bed-use
  declaration)
- **WHEN** the player attempts to use the bed
- **THEN** the existing 266 gate denies it and `getSleepState()` is
  unchanged.

### Requirement: bed-aware respawn

`respawnPlayer()` SHALL teleport to the 198 `spawnPoint` when set (resolved
through the existing spawn-safety path) and to the world spawn otherwise;
267 mode routing (including hardcore spectator) is unchanged.

#### Scenario: respawn at bed spawn

- **GIVEN** a set spawn point at (x,y,z)
- **WHEN** the player dies and respawns
- **THEN** the respawn position is the spawn-safety-resolved position of the
  bed cell (not the world spawn).

#### Scenario: respawn at world spawn without a bed

- **GIVEN** no set spawn point
- **WHEN** the player dies and respawns
- **THEN** the respawn position is exactly the pre-274 world-spawn
  behavior.

#### Scenario: hardcore death still wins

- **GIVEN** a hardcore world with a set spawn point and the player in
  survival
- **WHEN** the player dies
- **THEN** the mode becomes `spectator` (267 routing, unchanged) and the
  position reset uses the bed-aware target.

## Error and failure behavior

- Corrupt `__sleep__` payloads degrade to defaults at load (caught
  per-record); boot never throws for this record.
- Save seams with no persistence or after a completed reset are silent
  no-ops (265 precedent).
- Malformed archive fields are rejected pre-write (F257-L atomicity).
- Refusals (daytime, occupied) are toast-surfaced and mutate nothing.
- E2E seams (`debugSetTimeOfDay`, bed-use seam) are test-only (245/267
  precedent); no production path calls them.

## Performance and resource bounds

- No per-tick cost: the sleep state is consulted on bed use, death/respawn,
  and hydration only. Boot adds one metadata read; enter/leave add
  debounced writes through the existing autosave path. No hot-path
  allocation changes.

## Compatibility and migration

- New reserved key + additive registry entries only; old saves boot to
  defaults with no migration.
- Records are inert on older builds; the bed ids simply do not exist there.
- Reset returns the world to defaults; archives without the optional field
  import as defaults.

## Security and integrity

- The payload is validated at load by the 198 deserializer (exact-keys /
  version / types); nothing is trusted blindly. Refusals happen before any
  write or state mutation.

## Observability

- `getSleepState()` exposes the live state; toasts narrate enter/leave/
  refusal; the HUD sleep indicator reflects `sleeping`.

## Verification mapping

- Bed block/item: registry unit pins (T5) + E2E place leg (T9).
- Persistence (round-trip, wake-on-boot, degrade, reset/archive):
  `SleepPersistence` unit suite (T3/T4) + E2E reload legs (T9/T10).
- Bed use (gate, enter, occupied, leave, switch, modes):
  `SleepIntegration` unit suite (T6) + E2E use legs (T9/T10).
- Night skip: `SleepIntegration` unit (T6) + E2E clock leg (T9).
- Respawn (bed / world-spawn / hardcore): unit (T7) + E2E respawn legs
  (T9/T10).
- UI: toast/HUD legs (T8/T10).
- Regression + full gate: T11/T12. State/matrix/publish: T13.
