# Spec: persistent-world-codecs

## Contract

The shared persistent-codec seam converts between in-memory server world units and the existing persisted record shapes (034-040), enforcing shared validation and 041 data-version migration. It is the single typed boundary through which the server save lifecycle (spec `server-save-lifecycle`) serializes and deserializes world state. It is pure and headless: no IndexedDB, no IO, no DOM. Sections otherwise omitted are inapplicable because the codec owns no storage, no network transport, and no runtime state beyond stateless encode/decode functions.

## Definitions

- **Persistent unit**: an in-memory server world unit to persist — a chunk column, a chunk's block-entity group, a chunk's entity group, the world metadata record, or the world player-state record — identified by `kind`, `worldId`, and chunk coordinates.
- **Persistent payload**: the shared persisted record for a unit — `SerializedChunkColumn`, `SerializedBlockEntity[]`, `SerializedEntity[]`, `WorldMetadata`, or `PlayerStateRecord`.
- **Shared validator**: the per-record `validate*` function for a `kind` (e.g. `validateSerializedChunkColumn`).
- **Migration chain**: the 041 `DataMigrationChain` for a record type, applied before validation on decode.

## Invariants

- **Validator pass**: `encode` output for a `kind` MUST pass the shared validator for that `kind`.
- **Migrate-then-validate**: `decode` MUST apply the migration chain for the record type before validating; a record that fails either step is rejected.
- **Round-trip fidelity**: `decode(encode(unit))` MUST reproduce the unit's `kind`, `worldId`, `chunkX`, `chunkZ`, and an equivalent `value`.
- **Codec determinism**: `encode` MUST NOT inject timestamps, randomness, or any runtime state; identical inputs yield identical payloads.
- **No partial write**: a rejected `decode` MUST NOT return a partially-built unit.

## Requirements

### Requirement: REQ-1 — Encode produces validator-passing shared payloads

`WorldSaveCodec.encode(unit)` SHALL return a persisted payload for `unit.kind` that passes the shared validator for that kind, carrying the unit's world identity and coordinates.

#### Scenario: Encode a chunk-sections unit passes the chunk validator
- **GIVEN** a `ServerWorldUnit` with `kind = 'chunk-sections'`, `worldId = 'w1'`, `chunkX = 1`, `chunkZ = 2`, and an in-memory chunk column `value`.
- **WHEN** `codec.encode(unit)` is called.
- **THEN** the returned payload MUST satisfy `validateSerializedChunkColumn`, and its `chunkX`/`chunkZ` MUST equal 1 and 2.

#### Scenario: Encode an entities unit passes the entity validator
- **GIVEN** a `ServerWorldUnit` with `kind = 'entities'`, `worldId = 'w1'`, `chunkX = 3`, `chunkZ = 4`, and an in-memory entity group `value`.
- **WHEN** `codec.encode(unit)` is called.
- **THEN** the returned payload MUST satisfy `validateEntityChunkRecord` for a chunk-group envelope whose entities each satisfy `validateSerializedEntity`.

#### Scenario: Encode a player-state unit passes the player-state validator
- **GIVEN** a `ServerWorldUnit` with `kind = 'player-state'`, `worldId = 'w1'`, `chunkX = 0`, `chunkZ = 0`, and a `PlayerStateRecord` `value`.
- **WHEN** `codec.encode(unit)` is called.
- **THEN** the returned payload MUST satisfy `validatePlayerStateRecord`.

---

### Requirement: REQ-2 — Decode migrates then validates

`WorldSaveCodec.decode(payload, meta)` SHALL migrate the payload to the current record version via the 041 chain for its type, then validate it, and return a `ServerWorldUnit` matching `meta`.

#### Scenario: Current-version record decodes unchanged
- **GIVEN** a payload already at the current record version that satisfies the shared validator, and `meta = { kind, worldId, chunkX, chunkZ }`.
- **WHEN** `codec.decode(payload, meta)` is called.
- **THEN** it MUST return a unit with the same `kind`, `worldId`, `chunkX`, `chunkZ`, and a `value` equivalent to the payload content, and no migration steps MUST be applied.

#### Scenario: Older-version record is migrated before decode
- **GIVEN** a chunk-column payload whose `version` is older than the current `CHUNK_COLUMN_MIGRATIONS.currentVersion`, with a registered `fromVersion → currentVersion` step.
- **WHEN** `codec.decode(payload, meta)` is called.
- **THEN** the migration step MUST be applied to reach the current version before validation, and the returned unit's `value` MUST reflect the migrated record.

#### Scenario: Downgrade or unknown version is rejected
- **GIVEN** a payload whose version is newer than the current chain version, or below the chain base version, such that `DataMigrationChain.migrate` throws `DOWNGRADE` or `UNKNOWN_VERSION`.
- **WHEN** `codec.decode(payload, meta)` is called.
- **THEN** it MUST throw an error matching `PersistentWorldCodecs:` and MUST NOT return a unit.

---

### Requirement: REQ-3 — Round-trip fidelity

For any valid unit, `decode(encode(unit))` SHALL reproduce the unit's identity and an equivalent `value`.

#### Scenario: Round-trip reproduces the unit
- **GIVEN** a valid `ServerWorldUnit` for `kind = 'block-entities'`.
- **WHEN** `codec.encode(unit)` is called, then `codec.decode(codec.encode(unit), metaFrom(unit))` is called.
- **THEN** the resulting unit MUST have the same `kind`, `worldId`, `chunkX`, `chunkZ`, and a `value` equivalent to `unit.value`.

---

### Requirement: REQ-4 — Foreign and ambiguous data rejected

`decode` SHALL reject a payload whose `worldId` or coordinates contradict the `meta` it is decoded against, and `load` (spec `server-save-lifecycle`) SHALL reject a boundary snapshot containing duplicate keys within one record kind.

#### Scenario: World mismatch is rejected
- **GIVEN** a payload for `worldId = 'w1'` and `meta = { worldId: 'w2', ... }`.
- **WHEN** `codec.decode(payload, meta)` is called.
- **THEN** it MUST throw an error matching `PersistentWorldCodecs:` and MUST NOT return a unit.

#### Scenario: Duplicate column key is rejected on load
- **GIVEN** a `PersistedWorldSnapshot` whose `columns` contains two entries with the same `(chunkX, chunkZ)`.
- **WHEN** the snapshot is loaded through the lifecycle.
- **THEN** the load MUST fail and the lifecycle MUST roll back to `unloaded` (ambiguous data).

---

### Requirement: REQ-5 — Codec determinism

`encode` SHALL be deterministic: identical inputs produce byte-identical payloads across repeated calls, with no injected timestamps or randomness.

#### Scenario: Repeated encode is identical
- **GIVEN** the same `ServerWorldUnit`.
- **WHEN** `codec.encode(unit)` is called twice.
- **THEN** the two returned payloads MUST be deep-equal.

---

### Requirement: REQ-6 — Invalid input and unknown kind rejected

`encode`/`decode` SHALL reject unknown `kind` values and malformed inputs with descriptive `PersistentWorldCodecs: <detail>` errors, without returning partial results.

#### Scenario: Unknown kind throws on encode
- **GIVEN** a `ServerWorldUnit` with `kind = 'unknown-kind'`.
- **WHEN** `codec.encode(unit)` is called.
- **THEN** it MUST throw an error matching `PersistentWorldCodecs:`.

#### Scenario: Malformed payload throws on decode
- **GIVEN** a payload missing a required field for its kind (e.g. a chunk-column payload with no `sections`).
- **WHEN** `codec.decode(payload, meta)` is called.
- **THEN** it MUST throw an error matching `PersistentWorldCodecs:` and MUST NOT return a partial unit.

## Error and failure behavior

- `encode`/`decode` throw descriptive `PersistentWorldCodecs: <detail>` errors for unknown kind, invalid `worldId`, non-integer chunk coordinates, missing `value`, malformed payloads, and migration failures (`DOWNGRADE`/`UNKNOWN_VERSION`).
- A failed `decode` returns nothing and leaves no partial unit; callers treat it as a hard load failure (spec `server-save-lifecycle` rolls back).

## Performance and resource bounds

- `encode`/`decode` are per-unit O(record size); migration applies at most the registered chain length.
- No persistent state, no allocations beyond the returned payload/unit.

## Compatibility and migration

- The codec writes current-version records (035-040) and reads records written by the existing client save path; a world saved by one path loads on the other. Only existing 041 chains are applied; no new migration or schema version is introduced.

## Security and integrity

- Every payload is validated against the shared validator on both encode and decode, so invalid or mis-versioned records cannot enter or leave the save pipeline.
- Foreign (wrong `worldId`) and ambiguous (duplicate key) data is rejected rather than silently accepted.

## Observability

- Codec functions are pure and expose no state; migration application is observable through the returned `ServerWorldUnit` (a migrated record is indistinguishable from a current-version record after decode). Callers may compare `decode` failure messages for diagnosis.

## Verification mapping

- `tests/unit/PersistentWorldCodecs.test.ts` verifies REQ-1..REQ-6 scenarios with stub serializers and a real 041 chain where migration is exercised.
