# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **033-vertical-streaming — VERIFIED 100%**
- Active implementation change: **033-vertical-streaming — VERIFIED (advanced)**
- Next change: **034-indexeddb-world-metadata — NOT YET ACTIVE (artifacts pending)**
- 033 task ledger: **5 total tasks, 5 completed**
- 033 completion: **100%**
- 033 mandatory vertical-streaming requirements: **PASS**
- 033 required-test gate: **PASS — unit 485/485, E2E 19/19**
- 033 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `e9f49182d69bfe147f46d80747b79008396ddcff`
- Next exact action: **Advance to 034-indexeddb-world-metadata. Author proposal/design/tasks/specs/indexeddb-world-metadata/spec.md/verification via SPEC_AUTHORING_PROTOCOL.md, validate, implement IndexedDB database/version/world metadata with a typed repository boundary, verify full gate, commit + push, advance program state.**

## What 033 implemented

Change 033 removed the hardcoded `cy = 0` single-layer assumption from `World`'s streaming:

- `src/world/World.ts` — accepts an optional `dimension?: DimensionType`; derives
  `minChunkY = floor(dimension.minY / CHUNK_DIMENSIONS.height)` and
  `chunkLayerCount = ceil(dimension.height / CHUNK_DIMENSIONS.height)` (defaulting to
  `0`/`1` when no dimension is supplied). `ensureChunks`, `preloadChunks`, and
  `getReadyProgress` iterate the full vertical window `[minChunkY, minChunkY + chunkLayerCount)`
  instead of the literal `0`. New accessors `getMinChunkY()`/`getChunkLayerCount()` expose
  the window. The default path is bit-for-bit identical to the prior single-layer world.
- `tests/unit/VerticalStreaming.test.ts` — 7 tests (default single-layer parity, two-layer
  window derivation, multi-layer `ensureChunks` column coverage + queue bound, per-layer
  `preloadChunks`, and default readiness no-regression).

## Validation evidence (033)

- typecheck: PASS
- lint: PASS
- unit: PASS 485/485 (prior 478 + 7 new VerticalStreaming tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 033 is **VERIFIED** at 5/5 (100%). All gates are green: typecheck, lint, full unit
suite (485/485), production build, and the required E2E suite (19/19). No advancement
exception was needed. The default single-layer behavior is preserved, so the 478/19
baseline is unchanged.

## Next change: 034 (pending artifacts)

`034-indexeddb-world-metadata` is named in `CHANGE_SEQUENCE.md` with scope "IndexedDB
database/version/world metadata with typed repository boundary." Per `AGENTS.md`, a change
lacking full artifacts is a hard pre-implementation block. Author and validate those
artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 033
verification. Change 034 is the next change; its artifacts must be authored and validated
before implementation begins.
