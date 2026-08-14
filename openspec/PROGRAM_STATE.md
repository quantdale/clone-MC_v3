# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **091-surface-rule-engine — VERIFIED 100%**
- Active implementation change: **091-surface-rule-engine — VERIFIED**
- Next change: **092-cave-carver-system — NOT YET ACTIVE (artifacts pending)**
- 091 task ledger: **4 total tasks, 4 completed**
- 091 completion: **100%**
- 091 mandatory surface-rule-engine requirements: **PASS**
- 091 required-test gate: **PASS — unit 1022/1022, E2E 19/19**
- 091 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `36d8696ff7884e23c55d3334e8ee2e7761689ce2`
- Next exact action: **Advance to 092-cave-carver-system. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (092 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement configurable 3D cave-carving stage independent of terrain density (deterministic; 087 noise), verify full gate, commit + push, advance program state.**

## What 091 implemented

Change 091 adds the layered surface-rule engine.

- `src/worldgen/SurfaceRuleEngine.ts` (NEW) — `SurfaceCondition` union (always, biome key,
  y-range, noise threshold, not, and, or with fixed-order short-circuit); `SurfaceRule`
  (condition → blockId + optional depth, default 1); `SurfaceRuleContext` (biomeKey, x/y/z,
  `depthFromSurface` 0 = surface cell, caller-owned noise sampler);
  `evaluateSurfaceCondition`; `applySurfaceRules` (first-match-wins, depth coverage, null when no
  match, pure); `validateSurfaceRules` (strict: known types, depth ≥ 1, block ids ≥ 0,
  64-composition cap).
- `tests/unit/SurfaceRuleEngine.test.ts` (NEW) — 9 tests: leaf and composition condition
  matrix, first-match/order, depth coverage at all depths, no-match, validation matrix,
  composition depth cap, purity.

## Validation evidence (091)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1022/1022 (prior 1013 + 9 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 091 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 091 suites,
the full unit suite (1022/1022, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 092 (pending artifacts)

`092-cave-carver-system` is named in `CHANGE_SEQUENCE.md` with scope "Configurable 3D cave-carving
stage independent of terrain density." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 091 verification.
Change 092 is the next change; its artifacts must be authored and validated before implementation
begins.
