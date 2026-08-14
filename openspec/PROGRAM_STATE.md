# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **027-vertical-neighbor-dirtying — VERIFIED 100%**
- Active implementation change: **027-vertical-neighbor-dirtying — VERIFIED (advanced)**
- Next change: **028-section-mesh-versioning — NOT YET ACTIVE (artifacts missing)**
- 027 task ledger: **7 total tasks, 7 completed**
- 027 completion: **100%**
- 027 mandatory vertical-neighbor-dirtying requirements: **PASS**
- 027 required-test gate: **PASS — unit 432/432, E2E 19/19**
- 027 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `43cbb5894db456654188988c3223a63d69149fe8`
- Next exact action: **Advance to 028-section-mesh-versioning. Its directory/artifacts do not yet exist; author proposal/design/tasks/specs/section-mesh-versioning/spec.md/verification via SPEC_AUTHORING_PROTOCOL.md, validate, then implement section-level mesh versions/stale-job protection, verify full gate, commit + push, advance program state.**

## What 027 implemented

Change 027 added dirty propagation across all six section faces:

- `src/world/ChunkColumn.ts` — added `markSectionDirty(sy)` (range-checked; adds `sy` to the dirty set without
  materializing the section; out-of-range is a no-op).
- `src/world/VerticalWorldAccess.ts` — `setBlockState` now, after writing, calls a private
  `markNeighborSectionsDirty` that flags the four horizontal chunk-neighbor sections (same in-column `sy`) and
  the same column's `sy-1`/`sy+1` (vertical) when the written block sits on a local face (`localX`/`localZ`/
  `localY` is `0` or `SECTION_SIZE-1`). Only existing neighbor columns are touched; absent ones are not
  materialized, and out-of-range vertical neighbors no-op.
- `tests/unit/VerticalNeighborDirtying.test.ts` — 10 tests covering `markSectionDirty` range safety, each of
  the six face directions, vertical top/bottom no-op, absent-neighbor no-op, interior-write cleanliness, and the
  written section staying dirty.

## Validation evidence (027)

- typecheck: PASS
- lint: PASS
- unit: PASS 432/432 (prior 422 + 10 new VerticalNeighborDirtying tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 027 is **VERIFIED** at 7/7 (100%). All gates are green: typecheck, lint, full unit suite (432/432), production build, and the required E2E suite (19/19). No advancement exception was needed. The module is additive world-storage infrastructure; the legacy streaming `World.ts` is untouched.

## Next change: 028 (blocked on missing artifacts)

`028-section-mesh-versioning` is named in `CHANGE_SEQUENCE.md` but its change directory does not yet exist, so it has no proposal/design/tasks/specs/verification. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code; scope is "Section-level mesh versions/stale-job protection."

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 027 verification. Change 028 is the next change; its artifacts must be authored and validated before implementation begins.
