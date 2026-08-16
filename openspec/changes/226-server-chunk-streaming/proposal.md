# Proposal: 226-server-chunk-streaming

## Problem

223-225 built the codec, tick, and connection layers, but nothing models what a connected
client actually receives from the server world: which chunks it is interested in, what a
chunk snapshot looks like, and what an update (add/remove/dirty) means. 227+ (movement,
replication, block interaction) all assume the client has a consistent, interest-managed
chunk view; 226 provides that contract as a pure headless model.

## Goals

- Per-connection chunk interest: a validated view distance and center, with a deterministic
  Chebyshev interest set.
- Interest deltas: `setCenter` reports exactly which chunk columns entered and left.
- Chunk/section snapshots: a validated, serializable envelope (column key, sections with
  opaque data payloads, server tick) storable per column.
- Updates: `pendingUpdates(tick)` produces ordered `added`/`removed`/`updated` sets,
  consuming the accumulated state so each update is sent exactly once.
- Strict validation: every construction/put/move rejection throws a descriptive
  `ChunkStream: <detail>` error.
- Determinism: identical schedules produce identical update output (all lists key-sorted).
- Zero DOM/browser dependency; fully unit-testable headlessly.

## Non-goals

- No actual section block encoding/palettes (the snapshot payload is an opaque non-negative
  integer array; wire encoding arrives with the real transport changes).
- No world/chunk generation or meshing (client-side `World` stays untouched).
- No connection integration (the server gates streaming on 225's `connected` state; this
  module stays decoupled).
- No network IO, serializers, or binary formats.

## Preconditions

- 225 `connection-lifecycle` VERIFIED (the gating state exists for later integration).

## Dependencies

- None at runtime (pure module). Conventions from 222-225: `Module: <detail>` throws,
  scripted determinism, strict option validation, bounded resources.

## Proposed change

New module `src/simulation/ChunkStreaming.ts`:

- `ChunkKey` (string `"x,z"`), `columnKey(x, z)`, `ChunkCoord`.
- `SectionSnapshot { y, data }`, `ChunkSnapshot { key, x, z, sections, tick }`.
- `ChunkStreamOptions { viewDistance, maxSnapshots? }` (default 1024).
- `InterestDelta { entered, left }`, `ChunkUpdate { tick, added, removed, updated }`.
- Class `ChunkStreamManager`: `setCenter(x, z)`, `center`, `isInterested(x, z)`,
  `interest()`, `putSnapshot(snapshot)`, `getSnapshot(key)`, `hasSnapshot(key)`,
  `removeSnapshot(key)`, `pendingUpdates(tick)`, `reset()`.

## Compatibility and migration

Pure addition: one new simulation file plus tests. Zero registry changes, no `Game.ts` edit,
no save-format change.

## Risks

- Duplicating client-side interest logic → mitigated by keeping this model self-contained
  (Chebyshev radius matches the client's ticking-radius convention) and pure.
- Update-consumption semantics ambiguity → pinned in the spec (accumulators consumed by
  `pendingUpdates`, entered-without-snapshot simply not sent yet).

## Rollback strategy

Remove `src/simulation/ChunkStreaming.ts` and its test file; nothing else references it.

## Definition of Done

REQ-1..REQ-7 of the capability spec satisfied with unit tests; `npm run typecheck`,
`npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` green; OpenSpec
state files updated; change VERIFIED with advancement allowed.

## Advancement gate

100% task completion; every MUST/SHALL verified; baseline regression gate green; no
Advancement Exception required.
