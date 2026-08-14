# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **028-section-mesh-versioning — VERIFIED 100%**
- Active implementation change: **028-section-mesh-versioning — VERIFIED (advanced)**
- Next change: **029-section-meshing — NOT YET ACTIVE (artifacts missing)**
- 028 task ledger: **6 total tasks, 6 completed**
- 028 completion: **100%**
- 028 mandatory section-mesh-versioning requirements: **PASS**
- 028 required-test gate: **PASS — unit 437/437, E2E 19/19**
- 028 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `f7e819149c52cfaa206975b71c0dbf420ac4d0cc`
- Next exact action: **Advance to 029-section-meshing. Its directory/artifacts do not yet exist; author proposal/design/tasks/specs/section-meshing/spec.md/verification via SPEC_AUTHORING_PROTOCOL.md, validate, then implement section-level meshing that consumes 028 meshVersion/isSectionStale + 027 dirty tracking, verify full gate, commit + push, advance program state.**

## What 028 implemented

Change 028 added section-level mesh versioning as a storage primitive:

- `src/world/ChunkSection.ts` — added `meshVersion` (starts `0`, bumped exactly once per mutator: `set`/
  `setAt`/`setStateId`/`fill`). Runtime-only.
- `src/world/ChunkColumn.ts` — added `sectionMeshVersion(sy)` (returns the section's version or `0` for an
  untouched section) and `isSectionStale(sy, capturedVersion)` (true when the current version differs from a
  captured one). These give a queued section mesh job a cheap stale-job guard.
- `tests/unit/SectionMeshVersioning.test.ts` — 5 tests covering version bootstrap, per-mutator bump, untouched
  reads, stale detection, and serialize-reset.

## Validation evidence (028)

- typecheck: PASS
- lint: PASS
- unit: PASS 437/437 (prior 432 + 5 new SectionMeshVersioning tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 028 is **VERIFIED** at 6/6 (100%). All gates are green: typecheck, lint, full unit suite (437/437), production build, and the required E2E suite (19/19). No advancement exception was needed. The module is additive world-storage infrastructure; the legacy streaming `World.ts` is untouched.

## Next change: 029 (blocked on missing artifacts)

`029-section-meshing` is named in `CHANGE_SEQUENCE.md` but its change directory does not yet exist, so it has no proposal/design/tasks/specs/verification. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code; scope is "Section-level meshing consuming 028 meshVersion/isSectionStale + 027 dirty tracking."

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 028 verification. Change 029 is the next change; its artifacts must be authored and validated before implementation begins.
