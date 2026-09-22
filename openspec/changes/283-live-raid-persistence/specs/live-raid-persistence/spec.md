# Spec: live-raid-persistence

## Contract

This capability persists the live Game-owned `RaidState` across reload through a dedicated
world-scoped `__raid__:<worldId>` namespace over the verified `RaidStateMachine` codec. It
does not spawn raiders, register entity types, detect settlements, or alter Change 282's
ephemeral feedback projection. Fail-closed rules govern both runtime load (degrade to null)
and archive migration (reject before write).

## Definitions

- **Raid state**: the `RaidState` value produced only by `RaidStateMachine` transitions.
- **Serialized raid**: the `SerializedRaid` envelope (`schemaVersion: 1`) from
  `serializeRaid`.
- **Valid payload**: an untrusted value that `deserializeRaid` reconstructs without
  throwing.
- **Stale payload**: a payload whose `schemaVersion` is not `RAID_RECORD_VERSION` (1).
- **Runtime load**: boot/hydrate path; must never throw for corrupt input.
- **Archive migration**: export/import path; must reject malformed data before any write.
- **Single record**: at most one `__raid__:<worldId>` key exists per world.

## Invariants

1. `RaidStateMachine` remains the only transition and codec authority; persistence only
   stores `serializeRaid` output and restores via `deserializeRaid`.
2. At most one raid record exists per world; each save replaces the prior record.
3. Runtime load never throws and never writes a partial state on failure.
4. Archive import validates before the first write and throws on malformed `raidData`.
5. No raider entity is registered, spawned, or required by this capability.
6. Change 282's `#raid-feedback` projection and `getRaidState()` contract are unchanged.

## Requirements

### Requirement: Persist and hydrate raid state through a dedicated namespace

`Game` MUST save the current `RaidState` to `__raid__:<worldId>` using `serializeRaid` at
autosave, dispose, and pagehide, and MUST hydrate `raidState` at boot by reading that key
and decoding with the runtime load path. A null live state MUST clear (not retain) the
record so a cleared raid cannot resurrect.

#### Scenario: Active raid survives reload

- **GIVEN** an active raid at wave 2 of 3 with 4 remaining raiders and a captured serialized
  payload
- **WHEN** the page reloads and boot hydration completes
- **THEN** `getRaidState()` returns an equal `RaidState` (status, center, wave, counters,
  omen, ticks)
- **AND** the 282 feedback bar projects from that restored state without spawning entities.

#### Scenario: Absent record boots with null state

- **GIVEN** a world with no `__raid__` record
- **WHEN** boot hydration runs
- **THEN** `raidState` is `null` and `getRaidState()` returns `null`
- **AND** no exception is thrown.

### Requirement: Fail-closed runtime validation of invalid and stale payloads

The runtime load path MUST return `null` for a missing record, a non-object payload, a
stale `schemaVersion`, an unknown status, non-finite coordinates, non-integer or negative
counters, or `waveIndex > totalWaves`. It MUST NOT throw out of boot and MUST NOT write a
partial state back to the store on failure.

#### Scenario: Corrupt payload degrades to null

- **GIVEN** a stored payload with `schemaVersion: 2` or a non-finite center coordinate
- **WHEN** boot hydration decodes it
- **THEN** `raidState` is `null`
- **AND** no partial raid fields are observable via `getRaidState()`.

#### Scenario: Valid payload round-trips exactly

- **GIVEN** any state produced by `startRaid` plus zero or more `tickRaid` transitions
- **WHEN** it is serialized, stored, and loaded
- **THEN** the loaded state deep-equals the original state.

### Requirement: Fail-closed archive migration rejects malformed raid data

`WorldArchive.raidData` MUST be optional. When present and non-null, import validation MUST
run `deserializeRaid` (and an explicit `schemaVersion` check) and MUST throw before the
first store write if the payload is invalid or stale. Absent or null `raidData` MUST import
as null. A successful import MUST set `raidDataImported` true; an absent field MUST set it
false.

#### Scenario: Malformed archive field refuses import

- **GIVEN** an archive whose `raidData` is an object with a bad status string
- **WHEN** import validation runs
- **THEN** it throws a validation error
- **AND** no `__raid__` record and no other archive field are written (zero partial
  migration).

#### Scenario: Valid archive field imports and round-trips

- **GIVEN** an archive carrying a valid `SerializedRaid`
- **WHEN** import completes
- **THEN** `__raid__:<worldId>` holds a payload that decodes to the original state
- **AND** `raidDataImported` is true.

### Requirement: Single-record and duplicate-save rules

The namespace MUST use exactly one key per world. A second save MUST overwrite the first
atomically (last write wins). The system MUST NOT create or read a second parallel raid
record for the same world.

#### Scenario: Repeated saves leave one record

- **GIVEN** two successive `saveRaid` calls with different wave values for the same world
- **WHEN** both complete
- **THEN** a single `__raid__` record exists and contains the second payload
- **AND** no duplicate key or list of raids is present.

### Requirement: Reset and lifecycle guards

World reset MUST delete the `__raid__` record (with snapshot/restore if the broader reset
fails, matching the weather precedent). `saveRaid` MUST be a no-op when persistence is
absent or the game is in recovery-required state. Dispose MUST still hide the 282 feedback
bar after the final save attempt.

#### Scenario: Reset removes the record

- **GIVEN** a world with a stored active raid
- **WHEN** world reset completes successfully
- **THEN** `getRaidData` returns null
- **AND** a subsequent reload boots with `raidState === null`.

#### Scenario: Guarded save does not throw

- **GIVEN** persistence is unavailable or recovery is required
- **WHEN** `saveRaid` is invoked at pagehide
- **THEN** it returns without throwing and without writing a partial record.

### Requirement: Preserve 282 feedback and forbid raider spawning

This capability MUST NOT register or spawn raider entities, MUST NOT change
`projectRaidFeedback` or `#raid-feedback` behavior, and MUST NOT perform headed FPS/GPU
work. Change 258 MUST remain BLOCKED.

#### Scenario: Feedback bar unchanged after hydration

- **GIVEN** a hydrated active raid
- **WHEN** the next frame projects the HUD
- **THEN** `#raid-feedback` shows the same wave/remaining text the 282 projection would
  compute from that state
- **AND** no entity registry entries for raiders exist.

#### Scenario: Reload does not spawn mobs

- **GIVEN** a reloaded active raid state
- **WHEN** boot completes
- **THEN** the entity count and type set are unchanged from a world with no raid record
- **AND** no raider entity type is resolvable from any registry.

## Error and failure behavior

- Runtime decode failures return `null` (never throw to boot).
- Archive validation failures throw before any write (fail-closed migration).
- Save guards absorb persistence unavailability without throwing.
- `deserializeRaid` continues to throw for programmer-error misuse at the pure codec layer;
  callers at the runtime boundary catch and degrade.

## Performance and resource bounds

One O(1) serialize+put per save point (autosave/dispose/pagehide) and one get+decode at
boot. No per-tick I/O, no entity scans, no workers, no GPU work.

## Compatibility and migration

Additive `__raid__` record and optional `raidData` archive field. Absent record preserves
pre-283 null behavior. Older builds ignore the unknown raw key. Stale `schemaVersion` is
rejected at both boundaries (no half-parse). Reset deletes; export/import carries
optionally.

## Security and integrity

Payloads are untrusted storage/archive input and are fully validated before use. Import
validates the entire archive before the first write. No HTML interpolation; debug seams stay
on the existing `__voxelGame` handle. No secrets or elevated capabilities are introduced.

## Observability

`getRaidState()` is the read-only runtime observable. `WorldImportReport.raidDataImported`
is the migration observable. No new user-facing surfaces.

## Verification mapping

| Requirement | Test / command |
|---|---|
| Persist/hydrate namespace + null clear | `tests/unit/RaidPersistence.test.ts`, `tests/unit/LiveRaidPersistence.test.ts`, `tests/e2e/raid-persistence.spec.ts` reload leg |
| Fail-closed runtime validation | RaidPersistence rejection suite + corrupt-boot E2E leg |
| Fail-closed archive migration | WorldArchiver/RaidPersistence unit + archive refuse-import E2E leg |
| Single-record duplicate rule | Namespace overwrite unit |
| Reset + lifecycle guards | GamePersistence reset unit + LiveRaidPersistence guards |
| Preserve 282 / no spawning / 258 BLOCKED | Existing `tests/e2e/raid-feedback.spec.ts` + registry audit + full gates |
