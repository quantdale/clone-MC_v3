# Spec: block-entity-framework

## Contract

The game MUST support runtime block-entity instances with a tickable/non-tickable lifecycle, grouped
per chunk, ticked deterministically, and persisted through the 036 envelope. A `BlockEntityInstance`
MUST carry position, `typeKey`, opaque `data`, a `tickable` flag, and an optional `onTick` hook; a
`BlockEntityManager` MUST enforce one instance per position, expose per-chunk access, tick tickable
instances in insertion order, and serialize/deserialize chunks via 036 `SerializedBlockEntity`.

## Definitions

- **BlockEntityInstance**: `{ typeKey, x, y, z, tickable, data, onTick? }`.
- **Chunk**: the `(x >> 4, z >> 4)` cell containing an instance.

## Invariants

- At most one instance per world position; `add` on an occupied position returns `false`.
- `tickAll(tick)` ticks tickable instances in insertion order and returns the ticked count.
- `serializeChunk`/`deserializeChunk` round-trip through the 036 envelope; malformed or
  duplicate-position payloads are rejected without mutating the manager.
- `size`/`clear` reflect the instance set; `removeChunk` returns the removed count.

## Requirements

### Requirement: instance lifecycle
`tick(tick)` MUST invoke `onTick` only when `tickable`; `setTickable` MUST toggle.

#### Scenario: tickable toggle
- **GIVEN** an instance with an `onTick` recording ticks, initially non-tickable
- **WHEN** `tick(5)` runs, then `setTickable(true)` and `tick(6)` run
- **THEN** the recorded ticks are `[6]`.

### Requirement: one instance per position
`add` on an occupied position MUST return `false` and MUST NOT replace the existing instance.

#### Scenario: duplicate position
- **GIVEN** an instance at `(1, 2, 3)`
- **WHEN** a second instance at `(1, 2, 3)` is added
- **THEN** `add` returns `false` and `get(1, 2, 3)` is still the first instance.

### Requirement: chunk grouping
`getForChunk(cx, cz)` MUST return only instances in that chunk; `removeChunk(cx, cz)` MUST remove them
and return the count.

#### Scenario: two chunks
- **GIVEN** instances at `(5, 0, 5)` (chunk 0,0) and `(20, 0, 20)` (chunk 1,1)
- **WHEN** `getForChunk(0, 0)` and `removeChunk(0, 0)` run
- **THEN** `getForChunk(0, 0)` has one instance, `removeChunk(0, 0)` returns `1`, and
  `getForChunk(1, 1)` still has its instance.

### Requirement: deterministic ticking
`tickAll(tick)` MUST tick tickable instances in insertion order and return the count.

#### Scenario: order and count
- **GIVEN** tickable instances A then B (insertion order), plus one non-tickable
- **WHEN** `tickAll(10)` runs
- **THEN** the recorded order is `[A, B]` and the return value is `2`.

### Requirement: persistence round-trip
`serializeChunk(cx, cz)` MUST produce 036 `SerializedBlockEntity[]`; `deserializeChunk` MUST validate
and restore them; malformed payloads MUST be rejected without mutation.

#### Scenario: round-trip and rejection
- **GIVEN** a chunk with two instances
- **WHEN** `serializeChunk` then `deserializeChunk` on a fresh manager run, and `deserializeChunk`
  with a malformed element on the original
- **THEN** the fresh manager matches the original's chunk, and the original is unchanged after the
  rejected call (which throws).

## Error and failure behavior

- Duplicate position on `add` → `false`.
- Malformed payload element or duplicate positions in a payload → `Error`; manager unchanged.

## Performance and resource bounds

add/remove/get O(1); `tickAll` O(instances); `getForChunk` O(instances in chunk).

## Compatibility and migration

Additive; the 036 envelope is the single persistence shape.

## Security and integrity

One-instance-per-position and validate-before-mutate prevent duplicate/corrupt block-entity state.

## Observability

`size` and `getForChunk` expose runtime state.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Instance lifecycle | tickable toggle; onTick recording |
| One instance per position | duplicate add rejected, first kept |
| Chunk grouping | per-chunk access and removal |
| Deterministic ticking | insertion order + count |
| Persistence round-trip | serialize→deserialize equality; malformed rejected unchanged |
