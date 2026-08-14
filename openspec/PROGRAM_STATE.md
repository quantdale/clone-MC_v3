# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **064-worker-job-protocol — VERIFIED 100%**
- Active implementation change: **064-worker-job-protocol — VERIFIED**
- Next change: **065-worker-section-meshing — NOT YET ACTIVE (artifacts pending)**
- 064 task ledger: **4 total tasks, 4 completed**
- 064 completion: **100%**
- 064 mandatory worker-job-protocol requirements: **PASS**
- 064 required-test gate: **PASS — unit 730/730, E2E 19/19**
- 064 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `57dc9c336b3f05da85b482b2089f79514dc35f2f`
- Next exact action: **Advance to 065-worker-section-meshing. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (065 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement moving section meshing off the main thread over the 064 protocol, verify full gate, commit + push, advance program state.**

## What 064 implemented

Change 064 adds the versioned worker job protocol.

- `src/rendering/WorkerJobProtocol.ts` (NEW) — `WORKER_PROTOCOL_VERSION = 1`, `WorkerRequest`/
  `WorkerResult` envelopes with strict `validateWorkerRequest`/`validateWorkerResult` (version match,
  non-empty ids/kinds, payload-on-ok / error-on-failure), and `WorkerJobClient` (`submit` unique ids,
  `resolveResult` resolving each pending job exactly once with deterministic stale rejection of
  unknown/cancelled/already-resolved ids, `cancel`, `pendingCount`; validate-before-mutate).
- `tests/unit/WorkerJobProtocol.test.ts` (NEW) — 6 tests: envelope validation, submission/ids,
  single resolution, stale rejection (unknown/cancelled/duplicate), invalid-message non-mutation,
  and outcome payload rules.

## Validation evidence (064)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 730/730 (prior 724 + 6 new WorkerJobProtocol tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 064 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 064 suite
(6/6), the full unit suite (730/730, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 065 (pending artifacts)

`065-worker-section-meshing` is named in `CHANGE_SEQUENCE.md` with scope "Move section meshing off the
main thread." Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block.
Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 064 verification.
Change 065 is the next change; its artifacts must be authored and validated before implementation
begins.
