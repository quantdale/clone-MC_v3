# Spec: dirty-save-queue

## Contract

The game MUST be able to collect dirty world-save units and write them through the 034-037 IndexedDB
repositories with *bounded*, ordered, de-duplicated work. A `DirtySaveQueue` MUST collect units by a
unique key, MUST drain at most `limit` units per `drain` call in insertion order, MUST remove
successfully written units, MUST re-queue units whose write failed, and MUST de-duplicate by key. A
`RepositorySaveSink` MUST route each unit to the correct 034-037 repository by `kind`.

## Definitions

- **SaveUnit**: `{ key, kind, worldId, chunkX, chunkZ, payload }` — a dirty unit to persist; `key` is
  unique per (kind, world, coordinates); `payload` is the kind-specific data.
- **SaveUnitKind**: `world-metadata | chunk-sections | block-entities | entities`.
- **SaveSink**: `{ write(unit): Promise<void> }` — the persistence target injected into `drain`.
- **RepositorySaveSink**: a `SaveSink` that dispatches by `unit.kind` to the matching 034-037 repo.

## Invariants

- `SaveUnit.key` is unique in the queue; re-marking the same key updates the stored unit but keeps its
  original FIFO position.
- `drain(sink, limit)` issues at most `limit` `write` calls.
- Successfully written units leave the pending set; units whose `write` rejects are re-queued at the end.
- `size`/`has`/`keys` reflect the pending set; `clear` empties it.
- `RepositorySaveSink` maps `world-metadata`→`WorldMetadataRepository`, `chunk-sections`→
  `ChunkSectionRepository`, `block-entities`→`BlockEntityRepository`, `entities`→`EntityRepository`.

## Requirements

### Requirement: bounded ordered drain
`drain(sink, limit)` MUST write at most `limit` units, in insertion (FIFO) order.

#### Scenario: drains in insertion order up to the limit
- **GIVEN** units marked `a`, `b`, `c` in that order
- **WHEN** `drain(sink, 2)` is called
- **THEN** `sink.write` is called for `a` then `b`, and `c` remains pending.

### Requirement: de-duplication by key
Re-`markDirty` with an existing key MUST update the unit without creating a second entry.

#### Scenario: re-mark keeps one entry and original order
- **GIVEN** units `a`, `b` marked in order
- **WHEN** `markDirty(a)` is called again with new payload
- **THEN** `size` is `2`, `keys()` order is `[a, b]`, and the stored `a` has the new payload.

### Requirement: failure leaves the unit pending
A unit whose `sink.write` rejects MUST be re-queued and retried on the next `drain`.

#### Scenario: failing unit is retried
- **GIVEN** units `a` (succeeds) and `b` (write rejects)
- **WHEN** `drain(sink, 10)` runs
- **THEN** `a` is removed, `b` remains pending, and a subsequent `drain` retries `b`.

### Requirement: size / has / keys / clear
The queue MUST expose pending state and support clearing.

#### Scenario: state queries and clear
- **GIVEN** units `a`, `b` marked
- **WHEN** `size`, `has('a')`, `keys()` are read, then `clear()` is called
- **THEN** `size` is `2`, `has('a')` is true, `keys()` is `[a, b]`, and after `clear()` `size` is `0`.

### Requirement: repository sink routes by kind
`RepositorySaveSink.write(unit)` MUST persist the unit through the repository matching `unit.kind`.

#### Scenario: each kind lands in its store
- **GIVEN** a `RepositorySaveSink` over the four repositories backed by in-memory mocks
- **WHEN** one unit of each kind is enqueued and drained
- **THEN** the world-metadata, chunk-sections, block-entities, and entities stores each contain the
  corresponding record.

## Error and failure behavior

- `sink.write` rejection → unit re-queued (end), `drain` returns count of successes only.
- `limit <= 0` → `drain` writes nothing, returns `0`.
- `RepositorySaveSink` with a missing repository for a unit's kind → `write` rejects (unit re-queued).
- Unknown `kind` → `write` rejects.

## Performance and resource bounds

`drain` performs at most `limit` async writes; the caller controls `limit` as its per-tick/per-frame
budget. De-dupe by key bounds the pending set against repeated marks on the same unit.

## Compatibility and migration

No schema/version change; `WORLD_DB_VERSION` stays `4`. 038 layers above 034-037 only.

## Security and integrity

Bounded draining prevents a single save from monopolizing the event loop; re-queue-on-failure prevents
silent loss of dirty data.

## Observability

`size()`, `has(key)`, `keys()`, and the `drain` return value let a coordinator monitor and meter
pending save work.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Bounded ordered drain | mock sink records call order; `drain(sink, 2)` writes first two |
| De-duplication by key | re-mark keeps one entry, original order, updated payload |
| Failure leaves unit pending | failing unit retried on next drain, success removed |
| size / has / keys / clear | state queries + clear |
| Repository sink routes by kind | one unit per kind drains into the correct store |
