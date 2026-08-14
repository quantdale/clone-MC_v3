# Proposal: 047-scheduled-tick-queue

## Problem

Fixed-tick primitives (044-046) provide the clock, interpolation, and pause, but nothing schedules
per-position work (block ticks, fluid ticks) at exact future game times. Today there is no primitive
for "run this block's logic at tick T", so block/fluid behavior cannot be deterministic or
persistence-ready.

## Goals

- Provide a deterministic `ScheduledTickQueue` for per-position scheduled work.
- Deduplicate by position: scheduling a position that is already pending updates its due tick instead
  of enqueueing twice.
- Pop due entries in deterministic order: by due tick, ties broken by insertion order.
- Persistence hooks: validated `serialize()` / `deserialize()` so pending scheduled ticks survive
  save/reload (the save layer can store the serialized queue).

## Non-goals

- The actual block/fluid tick logic (047 is the queue primitive; 050+ behaviors consume it).
- Random-tick selection (048) or neighbor-update ordering (049) — separate changes.
- Wiring into the world/save layer (a later consumer change).

## Preconditions

- Change 046 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 046 baseline (611 unit / 19 e2e).

## Dependencies

- None beyond the standard library.

## Proposed change

- `src/simulation/ScheduledTickQueue.ts` (NEW): `ScheduledTick` (x, y, z, tickTime), `SCHEDULED_TICK_QUEUE_VERSION = 1`, `validateSerializedScheduledTickQueue`, and `ScheduledTickQueue` (`schedule`/`scheduleIn`/`tick(nowTick)`/`has`/`cancel`/`clear`/`size`/`serialize`/`deserialize`).
- `tests/unit/ScheduledTickQueue.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet. Serialized shape is versioned for future migration (041-style chains can
be applied if the format changes).

## Risks

- Duplicate scheduling semantics: defined as update-in-place (single entry per position), documented.
- Tie-breaking: insertion order via a monotonic sequence number — deterministic across runs.

## Rollback strategy

Revert the commit; the queue is additive.

## Definition of Done

- `schedule(x, y, z, dueTick)` adds or updates; `tick(nowTick)` pops exactly the entries due at
  `<= nowTick`, in `(tickTime, seq)` order.
- `scheduleIn(x, y, z, delayTicks, currentTick)` schedules at `currentTick + delayTicks`.
- `has`/`cancel`/`clear`/`size` behave; cancelled positions are removed.
- `serialize` → `deserialize` round-trips exactly; malformed data is rejected without partial state.
- Unit tests cover ordering, dedupe, cancel, round-trip, and validation.
- Full gate green; 047 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 047 suite; E2E stays 19/19.
