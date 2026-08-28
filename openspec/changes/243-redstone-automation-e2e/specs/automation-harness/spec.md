# Spec: automation-harness

## Contract

The headless execution and persistence seam for change 243. A
`RedstoneAutomationHarness` composes the real production redstone/automation
modules (154-172) over an in-memory world fixture and a 047 `ScheduledTickQueue`,
drives them with `SimulationHarness`-style deterministic stepping, and provides
the two survival operations every circuit spec depends on: **full save→reload**
(through the 234 `WorldSaveCodec`/`ServerSaveLifecycle` seams plus the 047 queue
v1 round-trip) and **single-chunk unload→reload** (`cycleChunk`). It must report
per-tick deterministic stepping, support snapshot/restore mid-run, abort
atomically on malformed round-trip payloads, and produce a deterministic
`stateHash()`. This spec is the shared contract every circuit spec
(`clock-and-divider`, `t-flip-flop`, `piston-door`, `item-sorter-chain`,
`torch-burnout`) builds on. It is test-support infrastructure under `tests/`; it
is not shipped game code.

## Definitions

- **Scheduled event**: an entry in the harness's 047 `ScheduledTickQueue` at a
  position with an absolute due `tickTime` (e.g. a repeater output, torch update,
  comparator update, observer pulse phase, lamp-off recheck, hopper/dropper/
  dispenser eject, or component release).
- **Round-trip**: a save→reload or a chunk unload→reload operation that must
  reproduce the world and its pending scheduled work exactly.
- **Probe**: a circuit position + accessor the harness exposes so a test can read
  a stored value (wire power, torch lit, repeater powered, piston extended, slot
  count) at an assertion point.
- **State hash**: a deterministic string over the serialized
  `AutomationStateSnapshot` (tick, scheduled-queue entries, chunk-sections,
  block-entities, burnout toggle history).
- **Cycle**: `cycleChunk(cx, cz)`, unload then reload one chunk while preserving
  its block states, block entities, and the scheduled events whose positions lie
  in that chunk.

## Invariants

- The harness MUST drive the real production modules (not re-implementations).
- All redstone timing MUST ride the single harness-owned 047 queue; wire
  propagation MUST ride 156's `RedstonePropagator`. No ad-hoc tick fields.
- A scheduled event MUST be preserved at its absolute due tick across a
  round-trip; it MUST NOT be re-anchored, dropped, or duplicated.
- A malformed round-trip or restore payload MUST be rejected atomically (harness
  unchanged).
- Snapshot/restore MUST be a faithful state round-trip: stepping forward after
  restore equals stepping forward from that point in a fresh run.
- Scenarios MUST run under a bounded step budget; exceeding it is a
  budget-exceeded result, never success.

## Requirements

### Requirement: deterministic construction
The harness MUST be constructed with a `worldId`, a real 234 `WorldSaveCodec`,
and an in-memory `SaveLoadBoundary`, and MUST own exactly one 047 queue, one 156
`RedstonePropagator`, one 158 `TorchBurnoutTracker`, a per-chunk block-state
container, and a per-position `MenuSlot[]` block-entity container. Two harnesses
constructed identically and driven by the same step script MUST produce
identical state.

#### Scenario: identical construction and script yields identical state
- **GIVEN** the same `worldId`, codec, boundary fixture, and step script `P`
- **WHEN** two harnesses are constructed and run `P` to completion
- **THEN** both report the same completion flags
- **AND** both `stateHash()` values are identical

### Requirement: bounded deterministic stepping
The harness MUST provide `step(times)` and `stepUntil(predicate, maxSteps)` with
`SimulationHarness` semantics. Each `step` MUST advance the tick counter by one
and process exactly the 047 entries due at that tick in deterministic
`(tickTime, seq)` order, then settle wire propagation. `stepUntil` MUST return
`false` (no throw) without crediting completion when the budget is exhausted.

#### Scenario: a due event fires on its scheduled tick
- **GIVEN** a pending scheduled event with `tickTime = T`
- **WHEN** the harness is stepped from `T-1` to `T`
- **THEN** the event is processed exactly once at tick `T`
- **AND** it is not processed at `T-1`

#### Scenario: budget exceeded is not success
- **GIVEN** a predicate that requires `n` steps to become true
- **WHEN** `stepUntil(predicate, maxSteps)` is called with `maxSteps < n`
- **THEN** it returns `false`
- **AND** the harness state is not silently advanced past the budget

### Requirement: snapshot and restore mid-run
The harness MUST support `snapshot()` capturing the full `AutomationStateSnapshot`
(tick, 047 `serialize()` output, chunk-sections, block-entities, burnout toggle
history) and `restore(snapshot)` returning it to that exact point. `restore` MUST
validate the whole payload first and reject a malformed payload atomically
(harness unchanged).

#### Scenario: restore-then-step equals fresh run
- **GIVEN** a harness run to a point `B` with snapshot `b = snapshot()`
- **WHEN** the harness is `reset()` and then `restore(b)`, and the script continues
  from `B`
- **THEN** the resulting state is identical to a fresh run from `B`
- **AND** both runs produce the same `stateHash()`

#### Scenario: malformed snapshot is rejected atomically
- **GIVEN** a harness in some nonzero state `X`
- **WHEN** `restore()` is called with a payload that is not a valid
  `AutomationStateSnapshot` (wrong tick type, 047 `version !== 1`, missing
  chunk-section/block-entity field, or malformed nested state)
- **THEN** the call throws a descriptive error
- **AND** the harness state is unchanged from `X`

### Requirement: full-world save→reload
`saveReload()` MUST perform a complete round-trip: (a) capture the 047 queue via
`serialize()`; (b) encode chunk-sections and block-entities through the real 234
`WorldSaveCodec.encode` and write them via the `SaveLoadBoundary`; (c) reset the
harness; (d) all-or-nothing read → `WorldSaveCodec.decode` → restore
chunk-sections/block-entities; (e) `ScheduledTickQueue.deserialize()` the
captured queue and restore the burnout tracker. After `saveReload()`, the world
and its pending timing MUST be exactly as before. `saveReload()` MUST NOT throw
when the world is well-formed; a failure partway MUST NOT leave a half-restored
world.

#### Scenario: a pending event survives full save→reload at its absolute tick
- **GIVEN** a circuit with a scheduled event due at tick `T` (e.g. a repeater
  output) and the harness currently at tick `t0 < T`
- **WHEN** `saveReload()` runs at `t0`, then the harness steps to `T`
- **THEN** the event fires at tick `T` (not earlier, not later, not twice)
- **AND** the circuit's block states and container inventories after the step are
  identical to a run without `saveReload()`

#### Scenario: encode failure does not leave a partial world
- **GIVEN** a `WorldSaveCodec` or `SaveLoadBoundary` that throws during `encode`
  or `write` for a chunk
- **WHEN** `saveReload()` runs
- **THEN** it throws
- **AND** the harness state is unchanged (no half-restored chunk-sections or
  block-entities)

### Requirement: single-chunk unload→reload
`cycleChunk(cx, cz)` MUST unload and reload exactly one chunk, preserving its
block states and block entities, and MUST preserve (never cancel) every 047
entry whose position lies in that chunk. Chunks the operation does not own MUST
be untouched.

#### Scenario: a pending event in the cycled chunk survives at its absolute tick
- **GIVEN** a circuit spanning chunk `(cx, cz)` with a scheduled event at position
  `(x, y, z)` in that chunk due at tick `T`
- **WHEN** `cycleChunk(cx, cz)` runs at `t0 < T`, then the harness steps to `T`
- **THEN** the event fires at tick `T`
- **AND** the event's position is still in the reloaded chunk with its block state
  intact

#### Scenario: a pending event outside the cycled chunk is not cancelled
- **GIVEN** a scheduled event at position `(x, y, z)` in a chunk other than
  `(cx, cz)` due at tick `T`
- **WHEN** `cycleChunk(cx, cz)` runs, then the harness steps to `T`
- **THEN** the event fires at tick `T`

### Requirement: circuit building and probing
The harness MUST provide `buildCircuit(kind)` for each of the six canonical kinds
(`clock`, `pulse-divider`, `t-flip-flop`, `piston-door`, `item-sorter-chain`,
`torch-burnout`) and `probe(circuit)` to read stored circuit state at an
assertion point. Building a circuit MUST NOT disturb any other circuit's state.

#### Scenario: circuits build independently
- **GIVEN** a harness
- **WHEN** two different circuits are built at disjoint positions
- **THEN** `probe` of each returns the values expected from its own construction
- **AND** building the second does not change the first circuit's probed state

### Requirement: deterministic state hash
The harness MUST compute `stateHash()` deterministically over the serialized
`AutomationStateSnapshot`. Identical serialized state MUST yield an identical
hash; the hash MUST be stable across repeated calls for unchanged state.

#### Scenario: hash is stable for unchanged state
- **GIVEN** a harness in a fixed state
- **WHEN** `stateHash()` is called twice without intervening mutation
- **THEN** both calls return the identical string

## Error and failure behavior

- A malformed round-trip or restore payload throws a descriptive error and leaves
  the harness unchanged (atomic). The accepted invalid inputs include: 047
  `SerializedScheduledTickQueue` with `version !== 1` or non-integer entry fields;
  a `BlockEntityChunkRecord` with a duplicate `worldId|chunkX|chunkZ` key within
  one restore; a foreign `worldId` (does not match the harness `worldId`); and an
  `AutomationStateSnapshot` with a non-integer `tick`.
- `stepUntil` budget exhaustion returns `false` and does not throw.
- A `cycleChunk` MUST NOT cancel a pending scheduled entry for a position it does
  not own.
- A duplicate scheduled event (re-scheduling an already-pending position) MUST
  update the due tick in place per 047 dedup; it MUST NOT duplicate the entry.
- A full save→reload that fails partway MUST NOT leave a half-restored world
  (234 all-or-nothing semantics).

## Performance and resource bounds

- Each scenario MUST run under a bounded `maxSteps` budget (a few hundred ticks at
  most for the clock/divider circuits).
- `stateHash()` MUST be computed once per completed run, not per tick.
- The fixture holds only the circuit's chunks and container inventories; no hot
  path in the shipped game is touched.

## Compatibility and migration

The harness round-trips state only through existing versioned contracts
(`SerializedScheduledTickQueue` v1, `SerializedChunkColumn` 035, `BlockEntityChunkRecord`/
`SerializedBlockEntity` 036 v1, and the 234 `WorldSaveCodec` envelope kinds). It
introduces no stored/public data format and requires no migration. The 234
`PersistentUnitKind` union is NOT extended.

## Security and integrity

The harness is local test-support infrastructure with no external input surface;
the only untrusted-shaped inputs are the round-trip and restore payloads, which
MUST be validated atomically (never partially accepted) before committing any
field, and the harness MUST reject foreign `worldId`s so one world's data can
never be injected into another.

## Observability

- `stateHash()` provides a single reproducible fingerprint per run.
- Not-due/due tick assertions and per-circuit `probe` reads localize whether a
  failure is timing, circuit state, or a dropped/duplicated scheduled entry.
- The survival-matrix table (circuit × dimension × operation) is the canonical
  scenario index referenced by the circuit specs.

## Verification mapping

- `tests/unit/RedstoneAutomationHarness.test.ts`: deterministic construction,
  bounded stepping (not-due/due), snapshot/restore round-trip and atomic
  rejection, full save→reload, single-chunk cycle, circuit build/probe
  independence, state-hash stability, malformed-payload rejection.
