# Spec: chunk-status-model

## Contract

`chunk-status-model` defines an explicit, ordered `ChunkStatus` lifecycle describing a chunk column's *generation
progress*, independent of rendering/visibility. It provides pure ordering helpers and tracks a per-column status on
`ChunkColumn` that generation advances monotonically. Status is orthogonal to mesh/dirty/heightmap state and is not
persisted.

## Definitions

- **ChunkStatus**: an ordered generation-lifecycle stage. Ordered set (ascending): `Empty`, `StructureStarts`,
  `StructureReferences`, `Biomes`, `Noise`, `Surface`, `Carvers`, `LiquidCarvers`, `Blocks`, `Fluids`, `Light`,
  `Spawn`, `Features`, `Full`.
- **ordinal**: `chunkStatusOrdinal(s)` — the position of `s` in the ascending order (0 for `Empty`, largest for `Full`).
- **at-least**: `isChunkStatusAtLeast(s, min)` — true when `s` has reached or passed `min`.

## Invariants

- `ChunkStatus` MUST be a totally ordered finite set; `chunkStatusOrdinal` MUST be strictly increasing along it.
- `isChunkStatusAtLeast(s, min)` MUST equal `chunkStatusOrdinal(s) >= chunkStatusOrdinal(min)`.
- `ChunkColumn.getStatus()` MUST start at `Empty` for a fresh column.
- `advanceStatusTo(s)` MUST set the status to `max(getStatus(), s)`; `setStatus(s)` MUST assign `s` exactly.
- `serialize`/`deserialize` MUST NOT carry status; a deserialized column's status MUST be `Empty`.

## Requirements

### Requirement: ChunkStatus is an ordered finite lifecycle
`ChunkStatus` MUST enumerate the generation stages from `Empty` to `Full` in strictly ascending ordinal order.

#### Scenario: ordinal increases along the lifecycle
- **GIVEN** the `ChunkStatus` enum
- **THEN** `chunkStatusOrdinal(Empty) < chunkStatusOrdinal(Blocks) < chunkStatusOrdinal(Full)`

#### Scenario: name mapping is total and stable
- **GIVEN** every `ChunkStatus` value
- **THEN** `chunkStatusName(s)` returns a non-empty string unique per value

### Requirement: ordering helpers compare statuses correctly
`isChunkStatusAtLeast` and `compareChunkStatus` MUST reflect the ordinal order.

#### Scenario: at-least respects order
- **GIVEN** `Full` and `Blocks`
- **THEN** `isChunkStatusAtLeast(Full, Blocks)` is `true` and `isChunkStatusAtLeast(Blocks, Full)` is `false`

#### Scenario: compare returns signed order
- **GIVEN** `Noise` and `Surface`
- **THEN** `compareChunkStatus(Noise, Surface) < 0` and `compareChunkStatus(Surface, Noise) > 0`

### Requirement: ChunkColumn tracks a monotonic generation status
`ChunkColumn` MUST expose a `status` defaulting to `Empty`, assignable via `setStatus` and advanced monotonically
via `advanceStatusTo`.

#### Scenario: fresh column starts Empty
- **GIVEN** a new `ChunkColumn`
- **THEN** `getStatus()` equals `Empty`

#### Scenario: setStatus assigns exactly
- **GIVEN** a `ChunkColumn`
- **WHEN** `setStatus(Blocks)` is called
- **THEN** `getStatus()` equals `Blocks`

#### Scenario: advanceStatusTo never moves backward
- **GIVEN** a `ChunkColumn` at `Blocks`
- **WHEN** `advanceStatusTo(Noise)` (an earlier stage) is called, then `advanceStatusTo(Full)`
- **THEN** `getStatus()` is `Blocks` after the first call and `Full` after the second

### Requirement: status is not persisted
`serialize`/`deserialize` MUST NOT carry the status; a restored column restarts at `Empty`.

#### Scenario: deserialize resets status
- **GIVEN** a `ChunkColumn` advanced to `Blocks`, then serialized and deserialized
- **THEN** the restored column's `getStatus()` equals `Empty`

## Error and failure behavior

- `advanceStatusTo` with a lower stage is a no-op (monotonic guard); it does not throw.
- `setStatus`/`advanceStatusTo` accept any `ChunkStatus` value (the enum is the only valid input type).

## Performance and resource bounds

O(1) ordinal/compare/read/assign/advance; one enum per column; no allocation on read.

## Compatibility and migration

Additive; `serialize`/`deserialize` byte layout unchanged; status is runtime-only.

## Security and integrity

No external input; status is local generation state.

## Observability

`getStatus()` returns a plain enum usable by generation/streaming code to decide remaining work.

## Verification mapping

- All scenarios → `tests/unit/ChunkStatus.test.ts`
- Full gate → typecheck, lint, unit, build, e2e
