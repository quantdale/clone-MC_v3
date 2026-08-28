# Spec: server-chunk-streaming

## Contract

A pure headless per-connection chunk streaming model: deterministic Chebyshev interest
around a center, validated column snapshots in a bounded store, and consumed update sets
(added/removed/updated) that are key-sorted and exactly-once. No world access, no IO.

## Definitions

- **Column**: a chunk column identified by `(x, z)`; its key is `columnKey(x, z)` =
  `"x,z"`.
- **Interest set**: all columns with `|x - center.x| <= viewDistance` and
  `|z - center.z| <= viewDistance` (Chebyshev square).
- **Accumulator**: a set of column keys awaiting consumption by `pendingUpdates`
  (`entered`, `left`, `dirty`).
- **Key-sorted**: ascending string order of the column keys.

## Invariants

- Interest membership is exactly the Chebyshev rule above.
- Every returned list of keys or snapshots is key-sorted by column key.
- Accumulators are non-empty only between a state change and the next `pendingUpdates`.
- A failed validation changes nothing.
- The store holds at most `maxSnapshots` snapshots; the oldest-inserted is evicted first.

## Requirements

### Requirement: construction and option validation

`new ChunkStreamManager(options)` MUST construct with `viewDistance` as a positive integer
and `maxSnapshots` defaulting to 1024. It MUST reject non-positive or non-integer
`viewDistance` and non-positive or non-integer `maxSnapshots` with a descriptive
`ChunkStream: <detail>` throw naming the field. A fresh manager MUST have no center, no
interest, and an empty store.

#### Scenario: default construction
- **GIVEN** `viewDistance: 2`
- **WHEN** `new ChunkStreamManager({ viewDistance: 2 })` is evaluated
- **THEN** `center` is null, `interest()` is empty, `hasSnapshot` is false for any key

#### Scenario: invalid view distance
- **GIVEN** `viewDistance: 0` and `viewDistance: 2.5`
- **WHEN** the manager is constructed
- **THEN** a `ChunkStream: ...` error is thrown in both cases

#### Scenario: invalid max snapshots
- **GIVEN** `maxSnapshots: 0` and `maxSnapshots: 3.5`
- **WHEN** the manager is constructed
- **THEN** a `ChunkStream: ...` error is thrown in both cases

### Requirement: interest computation

`isInterested(x, z)` MUST return true exactly for columns inside the Chebyshev square
around the current center, and MUST be false when no center is set. `interest()` MUST
return the current interest set key-sorted.

#### Scenario: Chebyshev membership
- **GIVEN** a manager with `viewDistance: 1` after `setCenter(5, 5)`
- **WHEN** `isInterested` is queried for `(5,5)`, `(6,5)`, `(5,4)`, `(6,6)`, `(7,5)`,
  `(5,7)`
- **THEN** the first four are true and the last two are false

#### Scenario: interest list is sorted
- **GIVEN** a manager with `viewDistance: 1` after `setCenter(0, 0)`
- **WHEN** `interest()` is called
- **THEN** it equals `['-1,-1', '-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0', '1,1']`

#### Scenario: no center means no interest
- **GIVEN** a fresh manager
- **WHEN** `isInterested(0, 0)` is called
- **THEN** it is false

### Requirement: center moves produce deltas

`setCenter(x, z)` MUST accept only integer coordinates (rejecting others with a
`ChunkStream: <detail>` throw) and MUST return `{ entered, left }` computed against the
previous center: the first call returns the entire interest set as `entered` and empty
`left`; later calls return exactly this move's symmetric difference split by direction.
Entered and left keys MUST accumulate across consecutive `setCenter` calls (observable via
`pendingUpdates`) until consumed.

#### Scenario: first move enters everything
- **GIVEN** a fresh manager with `viewDistance: 1`
- **WHEN** `setCenter(0, 0)` is called
- **THEN** `entered` has 9 keys and `left` is empty

#### Scenario: a one-chunk move
- **GIVEN** a manager with `viewDistance: 1` after `setCenter(0, 0)`
- **WHEN** `setCenter(1, 0)` is called
- **THEN** `entered` is `['2,-1', '2,0', '2,1']` and `left` is `['-1,-1', '-1,0', '-1,1']`

#### Scenario: accumulation is observable through pendingUpdates
- **GIVEN** a manager with `viewDistance: 1` after `setCenter(0, 0)`, `setCenter(1, 0)`,
  `setCenter(2, 0)`, and snapshots for `'2,0'` and `'3,0'` (keys entered by two different
  moves)
- **WHEN** `pendingUpdates(1)` is called
- **THEN** `added` contains both `'2,0'` and `'3,0'` — the entered keys accumulated across
  both moves until consumed

#### Scenario: non-integer coordinates rejected
- **GIVEN** a manager with `viewDistance: 1`
- **WHEN** `setCenter(0.5, 0)` is called
- **THEN** a `ChunkStream: ...` error is thrown and `center` is unchanged

### Requirement: snapshot validation and storage

`putSnapshot(snapshot)` MUST accept a valid envelope: integer `x`/`z` whose `key` equals
`columnKey(x, z)`, at least one section with unique integer `y` values, each `data` a
non-empty array of non-negative safe integers, and `tick` a non-negative safe integer. It
MUST reject, with a descriptive `ChunkStream: <detail>` throw and no state change: a key
mismatch, non-integer coordinates, empty or duplicate section `y`, empty or negative data
elements, and a negative or non-integer `tick`. A valid `putSnapshot` MUST store the
snapshot, replace any previous snapshot for the same key, and mark the key dirty.
`getSnapshot(key)`/`hasSnapshot(key)` MUST reflect the store; `removeSnapshot(key)` MUST
delete the snapshot and its dirty flag.

#### Scenario: round trip
- **GIVEN** a manager with `viewDistance: 2`
- **WHEN** a snapshot for `"0,0"` with one section is put, then fetched
- **THEN** `hasSnapshot('0,0')` is true and `getSnapshot('0,0')` equals the put envelope

#### Scenario: key mismatch rejected
- **GIVEN** a manager
- **WHEN** a snapshot with `key: '1,1'` but `x: 1, z: 2` is put
- **THEN** a `ChunkStream: ...` error is thrown and `hasSnapshot('1,1')` is false

#### Scenario: duplicate section y rejected
- **GIVEN** a manager
- **WHEN** a snapshot with two sections both at `y: 0` is put
- **THEN** a `ChunkStream: ...` error is thrown and nothing is stored

#### Scenario: negative payload rejected
- **GIVEN** a manager
- **WHEN** a snapshot with `data: [0, -1]` is put
- **THEN** a `ChunkStream: ...` error is thrown and nothing is stored

#### Scenario: replacement and removal
- **GIVEN** a manager with a stored snapshot for `"0,0"`
- **WHEN** a new snapshot for `"0,0"` with different sections is put, then `removeSnapshot`
  is called
- **THEN** `getSnapshot` returns the new envelope before removal; after removal
  `hasSnapshot` is false

#### Scenario: bounded store evicts oldest
- **GIVEN** a manager with `maxSnapshots: 2`
- **WHEN** snapshots for `"0,0"`, `"1,0"`, then `"2,0"` are put
- **THEN** `hasSnapshot('0,0')` is false and `hasSnapshot('1,0')` and `hasSnapshot('2,0')`
  are true

### Requirement: pending updates

`pendingUpdates(tick)` MUST return `{ tick, added, removed, updated }` where: `added` is
the key-sorted snapshots of entered columns that currently have a snapshot; `removed` is
the key-sorted keys of columns that left since the last `pendingUpdates`; `updated` is the
key-sorted snapshots of columns that are dirty and inside the current interest with a
snapshot, EXCLUDING columns already covered by `added` (so each column is sent exactly
once). It MUST consume the accumulators (a second call without new changes returns empty
lists) and MUST reject a negative or non-integer `tick`. Entered columns without a snapshot
MUST be absent from `added`, then surface as `updated` once their snapshot arrives while
still inside the interest.

#### Scenario: first update after setup
- **GIVEN** a manager with `viewDistance: 1`, after `setCenter(0, 0)` and snapshots for
  `"-1,-1"` and `"0,0"`
- **WHEN** `pendingUpdates(10)` is called
- **THEN** `added` has 2 snapshots in key order, `removed` is empty, `updated` is empty,
  and `tick === 10`

#### Scenario: updates are consumed
- **GIVEN** the same manager after the first `pendingUpdates`
- **WHEN** `pendingUpdates(11)` is called
- **THEN** `added`, `removed`, and `updated` are all empty

#### Scenario: move then update
- **GIVEN** a manager with `viewDistance: 1` after `setCenter(0, 0)` and
  `pendingUpdates(1)`, then `setCenter(1, 0)`
- **WHEN** `pendingUpdates(2)` is called
- **THEN** `added` is empty (no snapshot for the entered `'2,*'` column), `removed` is
  `['-1,-1', '-1,0', '-1,1']`, and `updated` is empty

#### Scenario: late snapshot arrives while inside interest
- **GIVEN** a manager after `setCenter(0, 0)`, `setCenter(1, 0)`, and `pendingUpdates(1)`
  (with `'2,0'` entered but unsent)
- **WHEN** a snapshot for `'2,0'` is put and `pendingUpdates(2)` is called
- **THEN** `added` is empty and `updated` contains the `'2,0'` snapshot

#### Scenario: dirty snapshot inside interest is updated
- **GIVEN** a manager with a snapshot for `'0,0'` inside interest, after `pendingUpdates(1)`
- **WHEN** a new snapshot for `'0,0'` is put and `pendingUpdates(2)` is called
- **THEN** `updated` contains the new `'0,0'` snapshot and `added`/`removed` are empty

#### Scenario: removed snapshot is not sent
- **GIVEN** a manager with a dirty snapshot for `'0,0'`
- **WHEN** `removeSnapshot('0,0')` then `pendingUpdates(1)` are called
- **THEN** `updated` is empty

#### Scenario: invalid tick rejected
- **GIVEN** a manager
- **WHEN** `pendingUpdates(-1)` and `pendingUpdates(1.5)` are called
- **THEN** a `ChunkStream: ...` error is thrown in both cases and no accumulators are
  consumed

### Requirement: reset and determinism

`reset()` MUST clear the center, store, and all accumulators, restoring the pristine
construction state. Two managers with identical options and identical
`setCenter`/`putSnapshot`/`pendingUpdates` schedules MUST produce identical update output
(keys, snapshots, tick) at every step.

#### Scenario: reset
- **GIVEN** a manager that has moved, stored, and produced updates
- **WHEN** `reset()` is called
- **THEN** it matches the pristine construction state (null center, empty interest, empty
  store)

#### Scenario: identical schedules produce identical output
- **GIVEN** two managers with `viewDistance: 1` and `maxSnapshots: 2`
- **WHEN** both run `setCenter(0,0)`, `pendingUpdates(1)`, `setCenter(2,0)`,
  `putSnapshot` for `'1,0'` and `'3,0'`, then `pendingUpdates(2)`
- **THEN** both produce equal `tick`/`added`/`removed`/`updated` values at each step

## Error and failure behavior

- Construction/`setCenter`/`putSnapshot`/`pendingUpdates` rejections: `ChunkStream:
  <detail>` naming the offending field, with no state change.
- Eviction is silent and documented (oldest-inserted first).

## Performance and resource bounds

- `setCenter` O(viewDistance²); `pendingUpdates` O(store + accumulators); `putSnapshot`
  O(sections); memory O(maxSnapshots + viewDistance²). No timers, IO, DOM, or network.

## Compatibility and migration

Additive: new exported names only; the client-side `world/WorldCoordinates.chunkKey`
(3D section key) is untouched. Own `columnKey` format documented. No migration.

## Security and integrity

- No external inputs besides numbers, strings, and plain data arrays; no storage or
  network access.
- Integrity: failed validations cannot corrupt the store or accumulators; eviction is
  deterministic (oldest-inserted).

## Observability

- `center`, `interest()`, `hasSnapshot`/`getSnapshot`, and exact `ChunkStream: <detail>`
  error strings provide full passive observability.

## Verification mapping

| Requirement | Evidence |
|---|---|
| REQ construction and option validation | `tests/unit/ChunkStreaming.test.ts` › construction |
| REQ interest computation | › interest |
| REQ center moves produce deltas | › center moves |
| REQ snapshot validation and storage | › snapshots |
| REQ pending updates | › updates |
| REQ reset and determinism | › reset/determinism |
