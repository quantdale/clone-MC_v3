# Proposal: 049-neighbor-update-queue

## Problem

Block changes cascade: breaking a block notifies its six neighbors, which may react (and cascade
again). Doing this with recursive calls overflows the stack on deep cascades and makes per-frame work
unbounded. 047 schedules *timed* ticks; neighbor updates are *immediate* work that still needs
ordering and bounds.

## Goals

- Provide a `NeighborUpdateQueue` for immediate, FIFO-ordered per-position neighbor updates.
- Deduplicate by position so a position notified twice before being processed runs once.
- Bound work per drain (`maxPerDrain`) and bound memory (`maxQueueSize`, dropping the newest beyond
  the cap, reported to the caller).
- Protect against recursion: handlers that enqueue during a drain just append to the same iterative
  loop (never re-enter `drain`), so deep cascades cannot overflow the stack.

## Non-goals

- The actual neighbor-notification semantics (which blocks react how — later behavior changes).
- Scheduled ticks (047) or random ticks (048) — separate primitives.
- Wiring into the world (a later consumer change).

## Preconditions

- Change 048 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 048 baseline (627 unit / 19 e2e).

## Dependencies

- None beyond the standard library.

## Proposed change

- `src/simulation/NeighborUpdateQueue.ts` (NEW): `NeighborUpdateQueue` (`enqueue(x, y, z)` → boolean,
  `drain(handler)` → processed count, `size`, `has`, `clear`; FIFO + dedupe + per-drain budget +
  queue cap with drop-newest).
- `tests/unit/NeighborUpdateQueue.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet, no behavior changes.

## Risks

- Drop-newest on overflow is lossy by design (bounded memory); the boolean return lets callers detect
  and react (e.g. schedule a full re-notification).
- A handler that enqueues forever would loop until the budget; `maxPerDrain` bounds each drain, and
  the next tick drains again — no unbounded single-frame work.

## Rollback strategy

Revert the commit; the queue is additive.

## Definition of Done

- `enqueue` adds positions FIFO, dedupes by position, and returns `false` (dropping the new entry)
  when at `maxQueueSize`.
- `drain(handler)` processes at most `maxPerDrain` positions in FIFO order, including positions
  enqueued by the handler itself (iteratively, no recursion), and returns the processed count.
- `size`/`has`/`clear` behave; `clear` empties pending work.
- Unit tests cover FIFO order, dedupe, budget, handler-enqueue cascades (no recursion), overflow drop,
  and state queries.
- Full gate green; 049 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 049 suite; E2E stays 19/19.
