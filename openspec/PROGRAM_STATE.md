# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **078-water-flow-simulation — VERIFIED 100%**
- Active implementation change: **078-water-flow-simulation — VERIFIED**
- Next change: **079-lava-flow-simulation — NOT YET ACTIVE (artifacts pending)**
- 078 task ledger: **4 total tasks, 4 completed**
- 078 completion: **100%**
- 078 mandatory water-flow-simulation requirements: **PASS**
- 078 required-test gate: **PASS — unit 886/886, E2E 19/19**
- 078 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `d67be5fefa9f023dee15a5b166d699ce2c11fc14`
- Next exact action: **Advance to 079-lava-flow-simulation. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (079 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement slower dimension-aware lava propagation (deterministic; mirrors 078 with lava cadence/range differences), verify full gate, commit + push, advance program state.**

## What 078 implemented

Change 078 adds deterministic water flow simulation.

- `src/simulation/WaterFlowEngine.ts` (NEW) — `WaterWorldAccess`, `WaterStepResult`,
  `WATER_FLOW_INTERVAL` (5), `MAX_FLOW_LEVEL` (7), `FALLING_LEVEL` (8), `stepWaterCell(world,
  waterFluidId, x, y, z)`: per-cell deterministic rules in fixed order — downward spawn of falling
  level 8 into an empty replaceable cell below (never onto existing water); falling converts to
  flowing 7 at ground; horizontal spread with level+1 falloff (sources spread 1, capped at 7,
  worse flowing water improves, falling never overwritten); a flowing cell with ≥ 2 horizontal
  sources becomes a source; unfed flowing water (no water above, no lower-level neighbor) decays
  +1 per step and is removed at level 7. `affected` lists exactly the positions to re-schedule
  (077, `WATER_FLOW_INTERVAL`). Fixed neighbor order `-x, +x, -z, +z`; pure per-cell steps.
- `tests/unit/WaterFlowEngine.test.ts` (NEW) — 18 tests: downward scenarios, ground conversion,
  conversion-then-spread chaining, spread cap/improvement/falling protection, source formation,
  decay ladder and guards, lava/empty no-ops, affected correctness, determinism.

## Validation evidence (078)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 886/886 (prior 868 + 18 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 078 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 078 suites,
the full unit suite (886/886, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 079 (pending artifacts)

`079-lava-flow-simulation` is named in `CHANGE_SEQUENCE.md` with scope "Slower dimension-aware
lava propagation." Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation
block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production
code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 078 verification.
Change 079 is the next change; its artifacts must be authored and validated before implementation
begins.
