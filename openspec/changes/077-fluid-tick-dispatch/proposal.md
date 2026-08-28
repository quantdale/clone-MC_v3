# Proposal: 077-fluid-tick-dispatch

## Problem

076 gives fluid states; the engine has a deterministic scheduled-tick queue (047). No machinery
schedules fluid work, bounds per-tick updates, or dispatches due fluid ticks to a handler. 078/079
(the flow engines) need this integration surface.

## Goals

- `FluidTickDispatcher`: schedule fluid ticks (relative delays), drain the dedicated fluid queue
  each tick in deterministic order, and dispatch each due tick to a caller-supplied handler —
  bounded by a validated per-tick budget (excess deferred deterministically).
- Deterministic report of processed/deferred/pending counts; no flow rules in this change.

## Non-goals

- Water/lava flow rules (078/079).
- Fluid block-state integration (081+).
- Queue persistence changes (047 already serializes; the dispatcher is stateless over it).

## Preconditions

- Change 076 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 076 baseline (860 unit / 19 e2e).

## Dependencies

- 047 `ScheduledTickQueue` (dedicated instance per kind — its entries carry no kind discriminator);
  076 `FluidState` semantics (the handler's domain, not touched here).

## Proposed change

- `src/simulation/FluidTickDispatcher.ts` (NEW): `FluidTickHandler`, `FluidTickDispatchReport`,
  `DEFAULT_MAX_FLUID_TICKS_PER_TICK`, `FluidTickDispatcher` (`schedule`, `tick`, `pendingCount`,
  `clear`).
- `tests/unit/FluidTickDispatcher.test.ts` (NEW).

## Compatibility and migration

Additive; 047 and all existing modules unchanged. The dispatcher must be given a queue instance
dedicated to fluid ticks (documented; 047 positions are kind-less).

## Risks

- Deferred entries are popped and re-scheduled at their original due tick, acquiring fresh
  insertion order — deterministic, but documented so consumers do not rely on cross-deferral
  ordering.
- Handler exceptions propagate (caller bug surface).

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Scheduling delegates to the queue with relative delays; positions dedupe per 047.
- `tick(nowTick)` processes due entries in `(tickTime, insertion)` order, at most `maxPerTick`;
  excess is deferred at its original due tick; the report carries processed/deferred/pending.
- `maxPerTick` validates as a positive integer; misuse throws.
- Handler receives `(x, y, z, dueTick)`; self-rescheduling during dispatch works.
- Deterministic: identical scripted schedules → identical order and reports.
- Full gate green; 077 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 077 suite; E2E stays 19/19.
