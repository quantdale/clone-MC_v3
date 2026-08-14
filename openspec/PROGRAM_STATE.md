# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **086-worker-worldgen — VERIFIED 100%**
- Active implementation change: **086-worker-worldgen — VERIFIED**
- Next change: **087-density-noise-router — NOT YET ACTIVE (artifacts pending)**
- 086 task ledger: **4 total tasks, 4 completed**
- 086 completion: **100%**
- 086 mandatory worker-worldgen requirements: **PASS**
- 086 required-test gate: **PASS — unit 975/975, E2E 19/19**
- 086 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `69dace37afa1cba295fcf2858add56e2034320f5`
- Next exact action: **Advance to 087-density-noise-router. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (087 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement reusable 3D density/noise composition primitives (deterministic; 054 SeedRng + 048 FNV-1a patterns), verify full gate, commit + push, advance program state.**

## What 086 implemented

Change 086 adds off-main-thread worldgen jobs with versioned results.

- `src/worldgen/WorkerWorldgen.ts` (NEW) — `WORLDGEN_PROTOCOL_VERSION` (1);
  `WorldgenRequestPayload { columnX, columnZ, seed, stage }` (085 stage vocabulary) and the
  versioned identity-echoing `WorldgenResultPayload { identity..., generationVersion }`; strict
  `validateWorldgenRequest`/`validateWorldgenResult`; pure `processWorldgenRequest` (the worker
  job envelope — stage bodies arrive in 087+); `WorldgenWorkerClient` over 064: exactly-once
  dispatch on identity-matching results; stale, duplicate, cancelled, and identity-mismatched
  results rejected without callbacks (a mismatch consumes the job per 064 semantics; the caller
  re-submits).
- `tests/unit/WorkerWorldgen.test.ts` (NEW) — 10 tests: request/result validation matrices,
  pure job, client dispatch (valid/mismatch-retry/stale/duplicate/cancel), pendingCount.

## Validation evidence (086)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 975/975 (prior 965 + 10 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 086 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 086 suites,
the full unit suite (975/975, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 087 (pending artifacts)

`087-density-noise-router` is named in `CHANGE_SEQUENCE.md` with scope "Reusable 3D density/noise
composition primitives." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 086 verification.
Change 087 is the next change; its artifacts must be authored and validated before implementation
begins.
