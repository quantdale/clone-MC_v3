# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **081-waterlogging-state — VERIFIED 100%**
- Active implementation change: **081-waterlogging-state — VERIFIED**
- Next change: **082-fluid-collision-movement — NOT YET ACTIVE (artifacts pending)**
- 081 task ledger: **4 total tasks, 4 completed**
- 081 completion: **100%**
- 081 mandatory waterlogging-state requirements: **PASS**
- 081 required-test gate: **PASS — unit 916/916, E2E 19/19**
- 081 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `dc978854a117d919dadce36a018171e9ab747056`
- Next exact action: **Advance to 082-fluid-collision-movement. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (082 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement fluid immersion, movement drag, buoyancy, and eye-fluid state from fluid data (deterministic; 056/057 collision primitives + 076 fluid data), verify full gate, commit + push, advance program state.**

## What 081 implemented

Change 081 adds waterlogged block-state support and fluid coexistence semantics.

- `src/world/Waterlogging.ts` (NEW) — `WaterloggedCell { blockId, waterLevel }`;
  `validateWaterloggingLevel` accepts exactly 0 (source) and 8-15 (falling) — flowing levels 1-7
  never coexist with a block (MC semantics); `waterlog` (validated construction);
  `waterloggingLevelFromFluid` (flowing 1-7 → 0, falling kept); `fluidLevelFromWaterlogging`
  (0 → 0, falling kept); `withWaterLevel(cell, level | null)` (null → null, original untouched);
  `isWaterloggable` (pure set membership). All helpers pure and deterministic.
- `tests/unit/Waterlogging.test.ts` (NEW) — 11 tests: level validation (accepted/rejected
  ranges), construction, both conversion directions, transitions, membership, purity.

## Validation evidence (081)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 916/916 (prior 905 + 11 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 081 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 081 suites,
the full unit suite (916/916, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 082 (pending artifacts)

`082-fluid-collision-movement` is named in `CHANGE_SEQUENCE.md` with scope "Fluid immersion,
movement drag, buoyancy, and eye-fluid state from fluid data." Per `AGENTS.md`, a change lacking
full artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 081 verification.
Change 082 is the next change; its artifacts must be authored and validated before implementation
begins.
