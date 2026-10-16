# Proposal: 224-dedicated-server-tick-loop

## Problem

World simulation (redstone, fluids, mobs, weather, random ticks, …) currently ticks only
inside the browser-coupled `Game.update` path, driven by the `requestAnimationFrame`-based
`GameLoop`. The fixed-timestep `SimulationClock` (044) and the test-side `SimulationHarness`
(055) exist, but there is no production headless process that owns the authoritative world
tick: a tick counter, an ordered set of tickable systems, bounded catch-up, and explicit
failure handling. The networking arc (225+) needs exactly this as its server-side simulation
foundation.

## Goals

- A production headless tick process: owns a fixed-timestep clock, a tick counter, and an
  ordered list of tickable systems.
- Deterministic: systems ticked in registration order, exactly once per tick, with monotonic
  1-based tick numbers.
- Two driving modes: wall-time `update(nowMs)` (clock-fed) and direct `step(times)`
  (authoritative replay/headless).
- Explicit failure behavior: a throwing system stops the process, the failed tick is not
  counted, and the error surfaces to the caller.
- Zero DOM/browser dependency; fully unit-testable headlessly with scripted time.

## Non-goals

- No rewiring of `Game.ts`/client loop (the client keeps its own loop; this change is purely
  additive infrastructure).
- No snapshot/restore of system state (test-side replay stays `SimulationHarness`'s job).
- No serialization/networking of ticks (225+).
- No chunk streaming/interest management (226).
- No server application/entry point (later networking changes assemble the server).

## Preconditions

- 222 `shared-simulation-package-boundary` VERIFIED (shareable/headless-safe module
  conventions).
- 223 `network-protocol-codecs` VERIFIED (wire surface for later changes).

## Dependencies

- `src/engine/SimulationClock.ts` (044) — the fixed 20 TPS accumulator clock; injected by
  default, overridable in options. It is pure and headless-safe, so importing it from the
  simulation package does not compromise the 222 shareable boundary.
- 055 `SimulationHarness` conventions — tick-number and ordering semantics are mirrored
  (not imported).

## Proposed change

New module `src/simulation/WorldTickProcess.ts`:

- `TickSystem { tick(tick: number): void }`
- `WorldTickProcessOptions { systems?, clock? }`
- `WorldTickProcess` with `update(nowMs): number`, `step(times = 1): number`, getters
  `tick`, `isRunning`, `isStopped`, `lastError`, and `reset()`.

All construction rejections throw `WorldTickProcess: <detail>`.

## Compatibility and migration

Pure addition: one new simulation file plus unit tests. Zero registry changes, no `Game.ts`
edit, no save-format change, no public-API change.

## Risks

- Semantic duplication with `SimulationHarness` (055) → mitigated by reusing the tested
  `SimulationClock` and mirroring the established 1-based tick-number convention.
- Scope creep toward client rewiring → explicitly out of scope (non-goals).

## Rollback strategy

Remove `src/simulation/WorldTickProcess.ts` and its test file; nothing else references it.

## Definition of Done

REQ-1..REQ-6 of the capability spec satisfied with unit tests; `npm run typecheck`,
`npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` green; OpenSpec
state files updated; change VERIFIED with advancement allowed.

## Advancement gate

100% task completion; every MUST/SHALL verified; baseline regression gate green; no
Advancement Exception required.
