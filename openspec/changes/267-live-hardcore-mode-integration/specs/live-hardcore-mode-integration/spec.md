# Spec: live-hardcore-mode-integration

## Contract

Wire the verified headless `HardcoreFramework` (193) and the configured
`WorldDifficulty` level (188) into the live Game as a world-scoped hardcore
setting: persisted flag + difficulty, hard-locked effective difficulty,
permanent-death routing into spectator, and a gamerule-adjacent settings UI.
Non-hardcore behavior is unchanged.

## Definitions

- **Hardcore flag**: the 193 `HardcoreState` (`{ hardcore: boolean }`),
  default off.
- **Configured difficulty**: the 188 `DifficultyLevel` stored per world,
  default `normal`.
- **Effective difficulty**: `effectiveDifficulty(hardcore, configured)` —
  `hard` when hardcore is enabled, the configured level otherwise.
- **Normal respawn**: the existing `respawnPlayer()` position reset, which
  never touches the mode.

## Invariants

- I-1: With hardcore disabled, death, respawn, toasts, and difficulty
  behavior are identical to the pre-267 build.
- I-2: Worlds without `__hardcore__` / `__difficulty__` records boot as
  non-hardcore with configured `normal`.
- I-3: Enabling hardcore never changes the live mode by itself.
- I-4: 193, 188, and 252 modules are consumed read-only.

## Requirements

### Requirement: hardcore + difficulty persistence

The Game SHALL persist the hardcore flag under `__hardcore__:<worldId>` and
the configured difficulty under `__difficulty__:<worldId>`, load both at boot
with degrade-to-defaults quarantine, delete both on world reset, and carry
both through archive export/import.

#### Scenario: fresh world defaults

- **GIVEN** a world with neither record
- **WHEN** the Game boots
- **THEN** `isHardcore()` is false, `getConfiguredDifficulty()` is `normal`,
  and `getDifficulty()` is `normal`.

#### Scenario: hardcore round-trip

- **GIVEN** `setHardcore(true)` + `setDifficultyFromText('easy')` on a world
- **WHEN** the page reloads through the save path
- **THEN** `isHardcore()` is true, `getConfiguredDifficulty()` is `easy`,
  and `getDifficulty()` is `hard`.

#### Scenario: corrupt payloads degrade

- **GIVEN** a stored `__hardcore__` payload with a wrong version, a
  non-boolean flag, or an unknown key (and, independently, a stored
  `__difficulty__` payload with a wrong version or unknown level)
- **WHEN** the Game boots
- **THEN** the world boots with the corresponding default (off / normal);
  the corrupt record blocks neither boot nor the healthy record.

#### Scenario: reset and archive

- **GIVEN** a hardcore world with a non-default difficulty
- **WHEN** the world is reset
- **THEN** both records are deleted and the world boots to defaults.
- **WHEN** the world is archived and re-imported instead
- **THEN** both values survive field-for-field; archives without the fields
  import as defaults; archives with malformed fields are rejected before any
  write.

### Requirement: difficulty lock

While hardcore is enabled, the effective difficulty SHALL always be `hard`
regardless of the configured level, and difficulty edits SHALL be refused
without mutation.

#### Scenario: lock matrix

- **GIVEN** hardcore enabled with each configured level in turn
  (peaceful/easy/normal/hard)
- **WHEN** `getDifficulty()` is read
- **THEN** it returns `hard` in all four cases.

#### Scenario: passthrough matrix

- **GIVEN** hardcore disabled with each configured level in turn
- **WHEN** `getDifficulty()` is read
- **THEN** it returns the configured level verbatim.

#### Scenario: locked edit refused

- **GIVEN** hardcore enabled with configured `easy`
- **WHEN** `setDifficulty('normal')` (or the difficulty select) is used
- **THEN** it returns false (status-surfaced refusal in UI), the configured
  level stays `easy`, the effective difficulty stays `hard`, and nothing is
  written.

#### Scenario: live consumer follows the lock

- **GIVEN** the wither-skull hit path
- **WHEN** a skull strikes near the player
- **THEN** the wither-effect duration is computed with the effective
  difficulty (identical to the old hardcoded `normal` for default worlds;
  the `hard` row under hardcore).

### Requirement: permanent death into spectator

On the survival `death` event the Game SHALL apply
`respawnModeAfterDeath(hardcore, mode)` through the existing mode path
(persisted) before the unchanged position reset.

#### Scenario: hardcore death

- **GIVEN** a hardcore world with the player in survival
- **WHEN** the player dies
- **THEN** the mode becomes `spectator` (persisted; hardcore death toast),
  the position reset runs, and the 266 spectator predicates are live
  (noclip movement, no interaction, no targeting).

#### Scenario: hardcore spectator persists across reload

- **GIVEN** a hardcore death has switched the player to spectator
- **WHEN** the page reloads through the save path
- **THEN** `isHardcore()` is true, the mode is still `spectator`, and the
  effective difficulty is still `hard`.

#### Scenario: normal death unchanged

- **GIVEN** a non-hardcore world with the player in survival
- **WHEN** the player dies
- **THEN** the mode stays `survival`, the normal respawn toast shows, and
  the position reset runs exactly as before (normal respawn can never
  return a hardcore spectator to survival because `respawnPlayer` never
  touches the mode).

#### Scenario: hardcore death outside survival

- **GIVEN** a hardcore world with the player already in spectator
  (or creative)
- **WHEN** the player dies
- **THEN** the mode becomes (stays) `spectator` and the reset runs; no error,
  no mode flapping.

### Requirement: settings UI

The gamerule-adjacent settings UI SHALL expose a hardcore toggle and a
difficulty select; the HUD SHALL show a hardcore badge only while hardcore
is enabled.

#### Scenario: toggle through real DOM

- **GIVEN** the settings dialog open on a normal world
- **WHEN** the hardcore toggle is activated through real DOM
- **THEN** `isHardcore()` becomes true, the record persists, the badge
  appears, and the difficulty select becomes disabled (lock visible).

#### Scenario: defaults

- **GIVEN** a fresh world
- **WHEN** the settings dialog opens
- **THEN** the toggle reads off (default off) and the select reads normal.

## Error and failure behavior

- Corrupt `__hardcore__` / `__difficulty__` payloads degrade to defaults at
  load (caught per-record); boot never throws for these records.
- Save seams with no persistence or after a completed reset are silent
  no-ops (265 `saveGameMode` precedent).
- Malformed archive fields are rejected pre-write (F257-L atomicity).
- Unknown difficulty text (including empty/whitespace) is a `false` no-op.
- `debugKillPlayer` is an E2E-only seam (245 hook precedent); no production
  path calls it.

## Performance and resource bounds

- No per-tick cost: the flag is consulted on death, toggle, and difficulty
  query only. Boot adds two metadata reads; toggles add debounced writes
  through the existing autosave path. No hot-path allocation changes.

## Compatibility and migration

- New reserved keys only; old saves boot to defaults with no migration.
- Records are inert on older builds; hardcore-death spectator
  `__gamemode__` records load as spectator on any 265+ build.
- Reset returns the world to defaults; archives without the optional fields
  import as defaults.

## Security and integrity

- Payloads are validated at load by the 193/188 deserializers (exact-keys /
  version / type); nothing is trusted blindly. The difficulty select cannot
  override the lock (server-equivalent refusal happens in `setDifficulty`
  before any write, and the UI re-syncs).

## Observability

- `isHardcore()`, `getDifficulty()`, `getConfiguredDifficulty()` expose the
  live state; toasts narrate toggle, lock-refusal, and hardcore death; the
  badge and select reflect the store.

## Verification mapping

- Persistence (round-trip, degrade, reset/archive): `HardcorePersistence`
  + archive unit suites (T3/T4) and E2E reload legs (T9/T10).
- Lock matrix + refusal + consumer: `HardcoreModeIntegration` unit suite
  (T5/T6) and E2E lock leg (T9).
- Death routing (all four scenarios): unit decision cases (T6) and E2E death
  legs (T9/T10).
- Settings UI: DOM unit/E2E legs (T7/T8/T10).
- Regression + full gate: T11/T12. State/matrix/publish: T13.
