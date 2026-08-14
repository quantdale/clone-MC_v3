# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **044-fixed-20tps-clock — VERIFIED 100%**
- Active implementation change: **044-fixed-20tps-clock — VERIFIED**
- Next change: **045-render-interpolation — NOT YET ACTIVE (artifacts pending)**
- 044 task ledger: **4 total tasks, 4 completed**
- 044 completion: **100%**
- 044 mandatory fixed-20tps-clock requirements: **PASS**
- 044 required-test gate: **PASS — unit 598/598, E2E 19/19**
- 044 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `70b10a82df1c1d6c24ed735cd41354919001ed58`
- Next exact action: **Advance to 045-render-interpolation. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (045 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement render interpolation and bounded catch-up without changing simulation truth over the 044 clock, verify full gate, commit + push, advance program state.**

## What 044 implemented

Change 044 adds the canonical fixed 20 TPS simulation clock, the first primitive of the fixed-tick
simulation section.

- `src/engine/SimulationClock.ts` (NEW) — `TICK_RATE = 20`, `TICK_MS = 50`, and `SimulationClock`
  (`update(nowMs)` returns exactly the whole ticks due, bounded by `maxTicksPerFrame` with the
  accumulator capped after a stall; backward time preserves the anchor; `totalTicks`/`totalMs`/
  `accumulatorMs`/`isRunning`/`reset`). Pure and driven by supplied timestamps, so it is fully
  headless-testable with scripted time.
- `tests/unit/SimulationClock.test.ts` (NEW) — 6 tests: exact emission with remainder accumulation,
  frame-rate independence (10×50 ms ≡ 5×100 ms ≡ 4×125 ms → 10 ticks / 500 ms), bounded catch-up after
  a 5000 ms stall, backward-time safety, and anchoring on first update/reset.
- Also fixed a flaky 042 `WorldArchiver` round-trip test: `putMetadata` stamps `updatedAt =
  Date.now()` on import, so `stripExportedAt` now normalizes `metadata.updatedAt` too (eliminates a
  millisecond-boundary flake that intermittently failed the gate).

## Validation evidence (044)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 598/598 (prior 592 + 6 new SimulationClock tests), stable across 3 consecutive full runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 044 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 044 suite
(6/6), the full unit suite (598/598, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed. The persistent-storage section (034-043) is complete and the
fixed-tick simulation section has begun (044).

## Next change: 045 (pending artifacts)

`045-render-interpolation` is named in `CHANGE_SEQUENCE.md` with scope "Render interpolation and
bounded catch-up without changing simulation truth." It builds on 044 by interpolating rendered state
between fixed ticks. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation
block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 044 verification.
Change 045 is the next change; its artifacts must be authored and validated before implementation
begins.
