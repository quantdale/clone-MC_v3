# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **085-worldgen-stage-pipeline — VERIFIED 100%**
- Active implementation change: **085-worldgen-stage-pipeline — VERIFIED**
- Next change: **086-worker-worldgen — NOT YET ACTIVE (artifacts pending)**
- 085 task ledger: **4 total tasks, 4 completed**
- 085 completion: **100%**
- 085 mandatory worldgen-stage-pipeline requirements: **PASS**
- 085 required-test gate: **PASS — unit 965/965, E2E 19/19**
- 085 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `64871801eafbd17050db358b925aa2af9e3fedbf`
- Next exact action: **Advance to 086-worker-worldgen. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (086 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement off-main-thread generation jobs with versioned results (deterministic; 064/065 worker protocol patterns + 085 pipeline), verify full gate, commit + push, advance program state.**

## What 085 implemented

Change 085 adds the explicit deterministic generation-stage pipeline scaffolding.

- `src/worldgen/GenerationPipeline.ts` (NEW) — ordered `GENERATION_STAGES` vocabulary
  (`TERRAIN, CLIMATE, BIOMES, SURFACE, CAVES, FLUIDS, FEATURES, FINAL`), `GenerationStageId`,
  `stageIndex`, `nextStage`, `validateGenerationStage`; generic `GenerationPipeline<S>`:
  per-column monotonic status with forward-only `advanceTo` (same-stage no-ops record
  `advanced: false`, backward transitions throw without mutation), `getStage` (defaults to the
  first stage), `isAtLeast`, `isComplete` (true only at the final stage). Column statuses are
  independent; Map-backed O(1); fully deterministic. Distinct from 030 `ChunkStatus` (the loading
  lifecycle).
- `tests/unit/GenerationPipeline.test.ts` (NEW) — 11 tests: vocabulary order/indices/next,
  validation, forward/same/backward transitions, status queries, full-cycle completion,
  independence, determinism, custom vocabulary.

## Validation evidence (085)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 965/965 (prior 954 + 11 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 085 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 085 suites,
the full unit suite (965/965, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 086 (pending artifacts)

`086-worker-worldgen` is named in `CHANGE_SEQUENCE.md` with scope "Off-main-thread generation jobs
with versioned results." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 085 verification.
Change 086 is the next change; its artifacts must be authored and validated before implementation
begins.
