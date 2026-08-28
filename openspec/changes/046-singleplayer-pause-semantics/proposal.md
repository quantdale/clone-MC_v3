# Proposal: 046-singleplayer-pause-semantics

## Problem

044/045 provide a fixed simulation clock and render interpolation, but nothing defines *pause*. In a
singleplayer game several sources legitimately pause the simulation (opening a menu, losing pointer
lock, an auto-pause option, window blur), and each must be explicit so the simulation clock is only
fed when no pause reason is active — and so UI/menus keep working while paused.

## Goals

- Provide a `PauseManager` with explicit, reason-based pause semantics: `pause(reason)` /
  `resume(reason)`, idempotent, with the simulation paused while *any* reason is active.
- Expose `isPaused`, the active `reasons`, and change listeners so the game loop stops feeding the 044
  clock while paused (simulation freezes; UI/timers outside the sim keep running by construction).
- Support `resumeAll()` for clean teardown and a single explicit `PAUSE_REASONS` vocabulary for the
  known sources.

## Non-goals

- Wiring into `Game`/`GameLoop` (a later consumer change; 046 is the state primitive + tests).
- Timer/UI pausing beyond the simulation gate (UI keeps running; only simulation advancement is
  gated by `isPaused`).
- Multiplayer pause rules (a server-authoritative concern).

## Preconditions

- Change 045 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 045 baseline (605 unit / 19 e2e).

## Dependencies

- None beyond the standard library (the 044 clock is consumed by the future wiring, not by 046).

## Proposed change

- `src/engine/PauseManager.ts` (NEW): `PauseReason` union (`'menu-open' | 'pointer-lock-lost' |
  'window-blur' | 'auto-pause' | string`), `PauseManager` (`pause`/`resume`/`isPaused`/`reasons`/
  `onChange`/`resumeAll`), and the `PAUSE_REASONS` vocabulary.
- `tests/unit/PauseManager.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet, no behavior changes.

## Risks

- A reason released twice must not corrupt state (Set semantics make `resume` idempotent).
- Orphaned reasons (a pause never released) would freeze the sim; `resumeAll()` and the explicit
  vocabulary mitigate this.

## Rollback strategy

Revert the commit; the manager is additive.

## Definition of Done

- `pause(reason)` pauses; the sim stays paused while any reason is active; `resume(reason)` unpauses
  only when no reasons remain.
- `pause`/`resume` are idempotent; listeners fire only on actual state changes; `onChange` returns an
  unsubscribe.
- `resumeAll()` clears all reasons; `reasons` reflects the active set.
- Unit tests cover single/multi-reason transitions, idempotency, listeners, and `resumeAll`.
- Full gate green; 046 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 046 suite; E2E stays 19/19.
