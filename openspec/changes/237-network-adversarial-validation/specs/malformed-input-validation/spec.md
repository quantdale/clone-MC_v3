# Spec: malformed-input-validation

## Contract

Cross-cutting adversarial contract that any malformed client-supplied input — unknown message ids,
wrong field arity, type-unsafe values, non-finite floats, non-safe integers, empty/oversized strings,
and oversized/empty collections — is deterministically rejected at the correct boundary with a
documented, testable outcome, and never mutates authoritative state. Malformed input must be handled
without throwing from the codec path (223 returns `null`), with a typed rejection from the new guard,
or with a descriptive `<Module>: <detail>` throw from the typed validators — and never as a silent
partial application.

This contract is expressed once and applies uniformly to every client-bound message handler from
changes 223, 225, 226, 227, 229, 230, 231, 232, and (by reference) 233. Omitted sections below are
not applicable because the codec/guard paths are the sole decoding boundary and the validators define
their own throw/reject conventions; the sections present cover the only failure surfaces that exist.

## Definitions

- **Wire envelope**: `{ messageId, values }` as defined by 223.
- **Codec failure**: `decodeMessage` (223) returning `null` — used for unknown id, wrong arity, and
  per-kind type mismatch (int = safe integer, float = finite number, string = string, bool = boolean).
- **Oversized field**: a string longer than `maxStringLength` or an array/list exceeding
  `maxArrayLength` (per top-level field) or `maxCollectionItems` (total nested items), as configured on
  `AdversarialMessageGuard`.
- **Boundary**: the decoding/guard layer (rejects with a typed reason) versus the typed validator layer
  (throws `<Module>: <detail>` for malformed *typed* request fields).

## Invariants

- **Codec totality**: `decodeMessage` MUST return `null` (never throw) for unknown ids, wrong arity,
  and type mismatches; the guard MUST translate that to `'malformed_fields'` or `'unknown_message_id'`.
- **No partial application**: a malformed message MUST NOT mutate any authoritative counter, registry,
  store, or tracker.
- **Determinism**: identical malformed inputs MUST produce identical rejection outcomes and identical
  (unchanged) state across repeated runs.
- **Bound preservation**: the guard MUST NOT mutate any input envelope or decoded record.

## Requirements

### Requirement: envelope integrity via 223 codecs

`AdversarialMessageGuard.inspectIncoming` MUST delegate decoding to 223 `decodeMessage` and MUST reject
as `'unknown_message_id'` an envelope whose `messageId` is not in the protocol, and as
`'malformed_fields'` an envelope whose id is known but whose value count or field types are invalid.

#### Scenario: unknown message id is rejected as unknown
- **GIVEN** a 223 protocol containing only message `move` (id 1, fields `x:int`).
- **WHEN** `inspectIncoming` is called with an envelope whose `messageId` is `99`.
- **THEN** the result MUST be `{ dispatch: false, reason: 'unknown_message_id' }` and no message
  handler is invoked.

#### Scenario: wrong arity is rejected as malformed
- **GIVEN** the `move` message with one `int` field.
- **WHEN** `inspectIncoming` is called with `{ messageId: 1, values: [] }` and with
  `{ messageId: 1, values: [1, 2] }`.
- **THEN** both MUST be `{ dispatch: false, reason: 'malformed_fields' }`.

#### Scenario: type-unsafe values are rejected as malformed
- **GIVEN** `move` with `x:int`, `y:float`, `name:string`, `active:bool`.
- **WHEN** envelopes use `x: 1.5` (non-safe int), `y: NaN` (non-finite float), `name: 5` (number for
  string), and `active: 'yes'` (string for bool).
- **THEN** each MUST be `{ dispatch: false, reason: 'malformed_fields' }`.

### Requirement: oversized and empty fields are rejected as oversized

The guard MUST reject `'oversized_field'` when any decoded `string` field exceeds `maxStringLength`.
Because the 223 wire envelope carries only scalar `WireValue`s (boolean | number | string), array-typed
fields such as entity `trackedData` (229) and chunk `sections`/`data` (226) are not present on the wire;
they live in the typed request objects passed directly to the typed validators. The guard therefore
exposes `boundedArray`/`boundedCollection` helpers and delegates array-bound enforcement to those
modules' own additive, configurable caps (`maxTrackedDataItems` on 229, `maxSectionDataLength`/
`maxSectionsPerSnapshot` on 226), which throw the module's `<Module>: <detail>` convention. Empty-body
rejection also stays with the validators so authoritative reasons are preserved verbatim: 229
`validateType` throws `EntityReplication: type must be a non-empty string` and 233's router returns
`'empty_message'`. The guard adds `'oversized_field'` only for the over-length scalar-string check it
performs uniformly.

#### Scenario: over-long string field is rejected
- **GIVEN** `AdversarialMessageGuard` with `maxStringLength: 16`.
- **WHEN** a message with a `string` field of length 17 is inspected.
- **THEN** the result MUST be `{ dispatch: false, reason: 'oversized_field' }`.

#### Scenario: oversized collection field is rejected at the typed layer
- **GIVEN** `EntityReplicationManager` with `maxTrackedDataItems: 2` and a chunk store with
  `maxSectionDataLength: 2` / `maxSectionsPerSnapshot: 2`.
- **WHEN** `upsertEntity` receives a `trackedData` array of 3 items, or `putSnapshot` receives a section
  with a 3-item `data` array or a snapshot with 3 sections.
- **THEN** each MUST throw an error matching `EntityReplication:` / `ChunkStream:` and MUST NOT mutate
  the authoritative pool/store.

#### Scenario: empty string body is rejected by the validator with its documented reason
- **GIVEN** a 229 entity spawn with `type: ''` and a 233 chat message whose body string is `''`
  (by reference).
- **WHEN** `upsertEntity` and the router's `submitText` handle them.
- **THEN** `upsertEntity` MUST throw `EntityReplication: type must be a non-empty string` and the router
  MUST return `{ kind: 'rejected', reason: 'empty_message' }` — the authoritative reasons are preserved
  verbatim and authoritative state is unchanged.

### Requirement: typed request field validation (validator layer)

Each typed validator MUST throw a descriptive `<Module>: <detail>` error — never partially apply —
for malformed typed request fields: non-safe-int/negative numeric ids, non-finite coordinates or
directions, invalid enum values, and out-of-range slot/block/entity ids.

#### Scenario: combat validator throws on malformed fields
- **GIVEN** an attack request with `targetId: -1`, a fire request with `origin: { x: NaN, y: 0, z: 0 }`,
  and a shield request with `raised: 'yes'`.
- **WHEN** each is submitted to `CombatValidator`.
- **THEN** each MUST throw an error matching `Combat:` and `CombatValidator.projectileCount` MUST be
  unchanged.

#### Scenario: movement authority throws on non-finite input
- **GIVEN** `submitIntent({ x: Infinity, y: 0, z: 0 }, 5)` and `submitIntent({ x: 0, y: 0, z: 0 }, -1)`.
- **WHEN** each is submitted to `MovementAuthority`.
- **THEN** each MUST throw an error matching `MovementAuthority:` and the authoritative
  `position`/`lastTick` MUST be unchanged.

#### Scenario: inventory validator throws on out-of-range slot
- **GIVEN** a 5-slot window and a `slot_click` request with `slotId: 7`.
- **WHEN** `processTransaction` is called.
- **THEN** it MUST throw an error matching `InventoryTransaction:` and `currentStateId`/`currentSlots`
  MUST be unchanged.

#### Scenario: block interaction validator throws on invalid face
- **GIVEN** a break request with `face: 'diagonal'`.
- **WHEN** `validateBreak` is called.
- **THEN** it MUST throw an error matching `BlockInteraction:` and the active-break map MUST be
  unchanged.

### Requirement: malformed input never mutates authoritative state

For every handler, a malformed input that is rejected (returned reason) or that throws MUST leave the
handler's authoritative state identical to its pre-input state.

#### Scenario: rejected break leaves state unchanged
- **GIVEN** a player with one active break at `(1, 2, 3)` and a `finish` request for a different block
  `(9, 9, 9)`.
- **WHEN** `validateBreak` returns `'no_active_break'`.
- **THEN** the active break at `(1, 2, 3)` MUST still be present and unchanged.

#### Scenario: replayed inventory transaction leaves state unchanged
- **GIVEN** a validator with `stateId` 4 and a transaction carrying `stateId: 3`.
- **WHEN** `processTransaction` returns `'wrong_state_id'`.
- **THEN** `currentStateId` MUST remain 4 and `currentSlots` MUST be unchanged.

#### Scenario: combat rejection leaves trackers unchanged
- **GIVEN** an attacker whose last attack was at tick 100.
- **WHEN** a melee attack at tick 105 is rejected `'attack_cooldown'`.
- **THEN** the attacker's last-attack tick MUST remain 100 and `projectileCount` MUST be unchanged.

### Requirement: malformed seam/host output is rejected

Where a handler consumes host-provided seam output, malformed seam results MUST throw a descriptive
error and MUST NOT be applied (matching the 232 `Combat:` seam-validation convention).

#### Scenario: malformed target seam output throws
- **GIVEN** `CombatValidator.getTarget` returning a target with non-finite coordinates or `radius: -1`.
- **WHEN** an in-range melee attack is submitted.
- **THEN** it MUST throw an error matching `Combat:` and the attacker's last-attack tick MUST be
  unchanged (the malformed seam output is never trusted).

#### Scenario: malformed chunk snapshot is rejected
- **GIVEN** `ChunkStreamManager.putSnapshot` with a snapshot whose `key` does not equal `columnKey(x,z)`
  or whose sections contain a duplicate `y` or a negative data value.
- **WHEN** `putSnapshot` is called.
- **THEN** it MUST throw an error matching `ChunkStream:` and the store MUST NOT contain the snapshot.

## Error and failure behavior

- Codec path: `decodeMessage` returns `null`; the guard maps it to `'unknown_message_id'` or
  `'malformed_fields'`. Never throws from the codec path.
- Guard path: `'oversized_field'` for bounded-domain violations; guard input errors (non-safe-int
  sequence, non-integer tick) throw `NetworkAdversarial: <detail>`.
- Validator path: descriptive `<Module>: <detail>` throws for malformed typed fields; documented
  rejection reasons for semantic rejections. Rejected/thrown inputs never mutate authoritative state.

## Performance and resource bounds

- Codec and domain checks are O(fields) per message; array bounds are O(items) over a capped list. No
  unbounded allocation: `maxStringLength`, `maxArrayLength`, and `maxCollectionItems` cap every
  collection the guard inspects.

## Compatibility and migration

- Additive: no protocol, save-format, or existing rejection-reason change. The guard adds
  `'malformed_fields'`, `'unknown_message_id'`, and `'oversized_field'` only for checks no module
  performed uniformly.

## Security and integrity

- Malformed and forged payloads are rejected before any handler runs, so hostile input cannot drive
  coordinate/slot/id logic with unsafe values or exhaust memory via unbounded strings/arrays.

## Observability

- `InspectResult.reason` distinguishes `'unknown_message_id'`, `'malformed_fields'`, and
  `'oversized_field'`; deterministic `NetworkAdversarial: <detail>` and `<Module>: <detail>` error
  messages; authoritative-state getters expose "unchanged" assertions for tests.

## Verification mapping

| Requirement | Test / command |
|---|---|
| REQ-M1 envelope integrity | `tests/unit/NetworkAdversarialGuard.test.ts` › unknown id / arity / type mismatches |
| REQ-M2 oversized/empty fields | `tests/unit/NetworkAdversarialGuard.test.ts` › over-length string; `tests/unit/ChunkStreaming.test.ts` and `tests/unit/EntityReplication.test.ts` › section/data and tracked-data bounds; existing 229/233 empty-body tests |
| REQ-M3 typed field validation | `tests/unit/CombatNetworking.test.ts`, `MovementAuthority.test.ts`, `InventoryTransactionNetworking.test.ts`, `BlockInteractionNetworking.test.ts` adversarial cases |
| REQ-M4 no state mutation | adversarial cases above assert state before/after |
| REQ-M5 malformed seam output | `CombatNetworking.test.ts`, `ChunkStreaming.test.ts` seam/snapshot cases |
