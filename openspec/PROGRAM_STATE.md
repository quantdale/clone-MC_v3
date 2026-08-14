# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **020-resource-data-loader — VERIFIED 100%**
- Active implementation change: **020-resource-data-loader — VERIFIED (advanced)**
- Next change: **021-section-coordinate-model — NOT YET ACTIVE (artifacts missing)**
- 020 task ledger: **9 total tasks, 9 completed**
- 020 completion: **100%**
- 020 mandatory loader requirements: **PASS**
- 020 required-test gate: **PASS — unit 358/358, E2E 19/19**
- 020 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `5df70ada98d9d8b9cb7c869905337466c3f2e4e8`
- Next exact action: **Advance to 021-section-coordinate-model. Its directory/artifacts do not yet exist; author proposal/design/tasks/specs/section-coordinates/spec.md/verification via SPEC_AUTHORING_PROTOCOL.md, validate, then implement 16x16x16 section coordinate model with correct negative X/Y/Z conversion (unit/index math, bounds), verify full gate, commit + push, advance program state.**

## What 020 implemented

Change 020 introduced a deterministic resource-data loader:

- `src/data/ResourceDataLoader.ts` — `ResourceReader` (`(name) => string | undefined`), `LoadFileError` (`MISSING` / `DECODE`), and `LoadedResource<T>` (values in file order, sources, errors, warnings, ok). `ResourceDataLoader<T>` reads each configured file in order through an injected reader and decodes it with a 019 `VersionedCodec`, collecting per-file errors without aborting the batch. `loadIntoRegistry` builds a 003 `Registry<T>` from successfully decoded values keyed by a 002 `ResourceId`, surfacing duplicate keys as errors. The module is browser-safe (no `fs` import) and source-agnostic.
- `tests/unit/ResourceDataLoader.test.ts` — 5 tests covering ordered load, missing-file handling, decode-failure handling, `loadIntoRegistry` keying, and duplicate-key rejection.

## Validation evidence (020)

- typecheck: PASS
- lint: PASS
- unit: PASS 358/358 (prior 353 + 5 new ResourceDataLoader tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 020 is **VERIFIED** at 9/9 (100%). All gates are green: typecheck, lint, full unit suite (358/358), production build, and the required E2E suite (19/19). No advancement exception was needed. The loader is additive infrastructure; no game schema was defined.

## Next change: 021 (blocked on missing artifacts)

`021-section-coordinate-model` is named in `CHANGE_SEQUENCE.md` but its change directory does not yet exist, so it has no proposal/design/tasks/specs/verification. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code; scope is "16×16×16 section coordinates with correct negative X/Y/Z conversion."

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 020 verification. Change 021 is the next change; its artifacts must be authored and validated before implementation begins.
