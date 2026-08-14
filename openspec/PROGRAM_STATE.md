# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **074-translucent-surface-rendering — VERIFIED 100%**
- Active implementation change: **074-translucent-surface-rendering — VERIFIED**
- Next change: **075-render-performance-contract — NOT YET ACTIVE (artifacts pending)**
- 074 task ledger: **4 total tasks, 4 completed**
- 074 completion: **100%**
- 074 mandatory translucent-surface-rendering requirements: **PASS**
- 074 required-test gate: **PASS — unit 837/837, E2E 19/19**
- 074 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `46372518b47698291c47cab5290fb24eb9aef9e8`
- Next exact action: **Advance to 075-render-performance-contract. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (075 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement draw-call/mesh-build/frame-time/memory/render-distance budgets with automated measurement (deterministic instrumentation harness), verify full gate, commit + push, advance program state.**

## What 074 implemented

Change 074 adds dedicated translucent geometry handling and a stable ordering policy.

- `src/rendering/TranslucentGeometry.ts` (NEW) — `QuadLayerResolver` (blockId → 061 render layer,
  caller-owned), `partitionQuadsByLayer` (order-preserving `{ opaque, translucent }` buckets,
  translucent = exactly layer `'translucent'`), `quadCentroid` (face-plane-aware center via 070
  `inPlaneAxes`), `sortTranslucentBackToFront` (descending squared centroid distance from the
  camera; explicit stable input-order tie-break; new array, input never mutated).
- `tests/unit/TranslucentGeometry.test.ts` (NEW) — 11 tests: partition mixed/empty/immutability,
  centroids for all six face kinds, far-first ordering, tie stability, camera-inside case,
  determinism, input immutability.

## Validation evidence (074)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 837/837 (prior 826 + 11 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 074 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 074 suites,
the full unit suite (837/837, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 075 (pending artifacts)

`075-render-performance-contract` is named in `CHANGE_SEQUENCE.md` with scope "Draw-call,
mesh-build, frame-time, memory, and render-distance budgets with automated measurement." Per
`AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate
those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 074 verification.
Change 075 is the next change; its artifacts must be authored and validated before implementation
begins.
