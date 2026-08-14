# Proposal: 051-block-event-queue

## Problem

Block logic sometimes needs *local events* — Minecraft's `addBlockEvent` mechanism (note-block sounds,
piston motion, dispenser clicks): a `(blockId, eventId, param)` event delivered at the block's
position within a few ticks, independent of scheduled/random ticks. Nothing provides this with
deterministic ordering and bounded propagation.

## Goals

- Provide a `BlockEventQueue` for typed local block events keyed per `(position, eventId)`.
- Minecraft-like dedupe: re-adding the same `(position, eventId)` updates the `param` in place (the
  newest event wins), while different `eventId`s at one position coexist.
- Deterministic FIFO delivery with bounded work per drain (`maxPerDrain`) and a total cap
  (`maxQueueSize`, drop-newest with a `false` return).

## Non-goals

- The event *effects* (pistons, note blocks — later changes 159/164/170 consume this).
- Scheduled ticks (047), random ticks (048), neighbor updates (049) — separate primitives.
- Wiring into the world (a later consumer change).

## Preconditions

- Change 050 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 050 baseline (638 unit / 19 e2e).

## Dependencies

- None beyond the standard library.

## Proposed change

- `src/simulation/BlockEventQueue.ts` (NEW): `BlockEvent` (x, y, z, blockId, eventId, param),
  `BlockEventQueue` (`add(x, y, z, blockId, eventId, param)` → boolean, `drain(handler)` → processed
  count, `size`, `clear`; per-(position,eventId) dedupe, FIFO, budgets).
- `tests/unit/BlockEventQueue.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet, no behavior changes.

## Risks

- Drop-newest on overflow is lossy by design (bounded memory); the boolean return lets callers react.
- Param-update semantics must be documented: for a pending `(position, eventId)` the newest param
  replaces the older one (Java parity).

## Rollback strategy

Revert the commit; the queue is additive.

## Definition of Done

- `add` enqueues FIFO, dedupes per `(position, eventId)` (updating `param` in place), and returns
  `false` at the cap without growing.
- `drain(handler)` delivers at most `maxPerDrain` events in FIFO order and returns the count.
- `size`/`clear` behave; different `eventId`s at one position coexist.
- Unit tests cover FIFO, dedupe/param update, eventId coexistence, budget, overflow, and clear.
- Full gate green; 051 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 051 suite; E2E stays 19/19.
