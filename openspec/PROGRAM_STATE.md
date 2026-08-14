# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **077-fluid-tick-dispatch — VERIFIED 100%**
- Active implementation change: **077-fluid-tick-dispatch — VERIFIED**
- Next change: **078-water-flow-simulation — NOT YET ACTIVE (artifacts pending)**
- 077 task ledger: **4 total tasks, 4 completed**
- 077 completion: **100%**
- 077 mandatory fluid-tick-dispatch requirements: **PASS**
- 077 required-test gate: **PASS — unit 868/868, E2E 19/19**
- 077 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `d8c9d9280e722c052884916027a05f0fc12219b2`
- Next exact action: **Advance to 078-water-flow-simulation. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (078 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement water downward/horizontal propagation and source rules (deterministic; 076 states + 077 dispatcher), verify full gate, commit + push, advance program state.**

## What 077 implemented

Change 077 adds scheduled fluid tick integration with bounded updates.

- `src/simulation/FluidTickDispatcher.ts` (NEW) — `FluidTickHandler` `(x, y, z, dueTick)`,
  `FluidTickDispatchReport { processed, deferred, pending }`,
  `DEFAULT_MAX_FLUID_TICKS_PER_TICK` (1000), `FluidTickDispatcher`: validated positive-integer
  `maxPerTick`; relative scheduling via 047 `scheduleIn` (position dedupe); `tick(nowTick)` pops
  all due entries, runs at most `maxPerTick` handlers in the queue's deterministic `(tickTime,
  seq)` order, defers the excess at their original due tick; `pendingCount`/`clear`. The queue
  instance must be fluid-dedicated (047 entries are kind-less).
- `tests/unit/FluidTickDispatcher.test.ts` (NEW) — 8 tests: scheduling/dedupe, deterministic
  order, budget exceeded/within, handler args + self-rescheduling, not-yet-due entries,
  lifecycle, budget validation, scripted determinism.

## Validation evidence (077)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 868/868 (prior 860 + 8 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 077 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 077 suites,
the full unit suite (868/868, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 078 (pending artifacts)

`078-water-flow-simulation` is named in `CHANGE_SEQUENCE.md` with scope "Water downward/horizontal
propagation and source rules." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 077 verification.
Change 078 is the next change; its artifacts must be authored and validated before implementation
begins.
