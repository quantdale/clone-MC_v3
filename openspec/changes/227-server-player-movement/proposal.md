# Proposal: 227-server-player-movement

## Problem

223-226 built codecs, the tick process, the connection lifecycle, and chunk streaming, but
nothing validates a connected player's movement. A real server must be authoritative: it
must accept client movement intents only when they are well-formed and physically
plausible (bounded per-tick speed, newer-than-last tick) and must correct the client with a
teleport when an intent violates the rules. 227 provides that contract as a pure headless
model.

## Goals

- A server-authoritative movement authority: holds the authoritative position, validates
  client intents, and emits corrections.
- Strict input validation: well-formed but rule-breaking intents return a teleport
  correction; malformed intents (non-finite coords, non-integer/negative ticks) throw a
  descriptive `MovementAuthority: <detail>` error.
- Deterministic acceptance rules: Euclidean per-tick displacement bounded by
  `maxSpeedPerTick` (inclusive), intent tick strictly newer than the last accepted tick.
- Explicit teleport support (server-initiated reposition) and spawn placement.
- Determinism: identical intent schedules on identical authorities yield identical state.
- Zero DOM/browser dependency; fully unit-testable headlessly.

## Non-goals

- No collision/physics with the world (the authority validates speed, not terrain — world
  collision is a later, world-aware change).
- No networking/serialization of intents or corrections (223 codecs; 229+/230 wire them).
- No client prediction/reconciliation (228).
- No actual entity state, gamemode, or flight/creative overrides.

## Preconditions

- 224 `dedicated-server-tick-loop` VERIFIED (tick numbering exists for intents).
- 225 `connection-lifecycle` VERIFIED (the server gates authority on `connected`).
- 226 `server-chunk-streaming` VERIFIED (the authority's center can drive streaming).

## Dependencies

- None at runtime (pure module). Conventions from 222-226: `Module: <detail>` throws,
  scripted determinism, strict validation, bounded resources.

## Proposed change

New module `src/simulation/MovementAuthority.ts`:

- `Position { x, y, z }`.
- `MovementAuthorityOptions { maxSpeedPerTick }` (positive finite; required).
- `MovementResult = { accepted: true; position } | { accepted: false; correction: Position;
  reason: 'stale tick' | 'speed limit' }`.
- `MovementAuthority` with `spawn(position, tick)`, `submitIntent(position, tick)`,
  `teleport(position, tick)`, getters `position`, `lastTick`, `acceptedCount`,
  `lastRejection`, `reset()`.

## Compatibility and migration

Pure addition: one new simulation file plus tests. Zero registry changes, no `Game.ts` edit,
no save-format change.

## Risks

- 2D vs 3D speed bound → pinned to Euclidean 3D for simplicity and determinism (documented).
- Duplicate/equal-tick handling → strict "newer than last" rule pinned in the spec.

## Rollback strategy

Remove `src/simulation/MovementAuthority.ts` and its test file; nothing else references it.

## Definition of Done

REQ-1..REQ-6 of the capability spec satisfied with unit tests; `npm run typecheck`,
`npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` green; OpenSpec
state files updated; change VERIFIED with advancement allowed.

## Advancement gate

100% task completion; every MUST/SHALL verified; baseline regression gate green; no
Advancement Exception required.
