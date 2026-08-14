# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **030-chunk-status-model — VERIFIED 100%**
- Active implementation change: **030-chunk-status-model — VERIFIED (advanced)**
- Next change: **031-chunk-ticket-model — NOT YET ACTIVE (artifacts missing)**
- 030 task ledger: **6 total tasks, 6 completed**
- 030 completion: **100%**
- 030 mandatory chunk-status-model requirements: **PASS**
- 030 required-test gate: **PASS — unit 456/456, E2E 19/19**
- 030 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `efc12fee050ad5b242531c2a01dae50c7728868a`
- Next exact action: **Advance to 031-chunk-ticket-model. Its directory/artifacts do not yet exist; author proposal/design/tasks/specs/chunk-ticket-model/spec.md/verification via SPEC_AUTHORING_PROTOCOL.md, validate, then implement typed reasons/levels for keeping chunks loaded or ticking on the vertical storage stack, verify full gate, commit + push, advance program state.**

## What 030 implemented

Change 030 added an explicit, ordered chunk-generation lifecycle independent of rendering/visibility:

- `src/world/ChunkStatus.ts` (new) — `ChunkStatus` ordered enum (`Empty` → `StructureStarts` → `StructureReferences` →
  `Biomes` → `Noise` → `Surface` → `Carvers` → `LiquidCarvers` → `Blocks` → `Fluids` → `Light` → `Spawn` → `Features` →
  `Full`) with `CHUNK_STATUS_ORDER`, `chunkStatusOrdinal`, `isChunkStatusAtLeast`, `compareChunkStatus`, and
  `chunkStatusName`. The lifecycle describes *generation progress* only.
- `src/world/ChunkColumn.ts` — added a runtime-only `status` field (default `Empty`) with `getStatus()`, `setStatus(s)`
  (exact assignment), and `advanceStatusTo(s)` (monotonic — only moves forward). Status is orthogonal to `isDirty`,
  `sectionMeshVersion`, and heightmaps, and is not serialized.
- `tests/unit/ChunkStatus.test.ts` — 7 tests covering ordinal ordering, `isAtLeast`, `compare`, name mapping, fresh
  `Empty`, `setStatus`, monotonic `advanceStatusTo`, and serialize-reset.

## Validation evidence (030)

- typecheck: PASS
- lint: PASS
- unit: PASS 456/456 (prior 449 + 7 new ChunkStatus tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 030 is **VERIFIED** at 6/6 (100%). All gates are green: typecheck, lint, full unit suite (456/456), production build, and the required E2E suite (19/19). No advancement exception was needed. The module is additive world-storage infrastructure; the legacy streaming `World.ts` is untouched.

## Next change: 031 (blocked on missing artifacts)

`031-chunk-ticket-model` is named in `CHANGE_SEQUENCE.md` but its change directory does not yet exist, so it has no proposal/design/tasks/specs/verification. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code; scope is "Typed reasons/levels for keeping chunks loaded or ticking."

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 030 verification. Change 031 is the next change; its artifacts must be authored and validated before implementation begins.
