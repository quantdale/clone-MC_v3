# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **019-versioned-codec-framework — VERIFIED 100%**
- Active implementation change: **019-versioned-codec-framework — VERIFIED (advanced)**
- Next change: **020-resource-data-loader — NOT YET ACTIVE (artifacts missing)**
- 019 task ledger: **9 total tasks, 9 completed**
- 019 completion: **100%**
- 019 mandatory codec requirements: **PASS**
- 019 required-test gate: **PASS — unit 353/353, E2E 19/19**
- 019 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `f263bd12fe697384cc053f5fbd027514c97669b7`
- Next exact action: **Advance to 020-resource-data-loader. Its directory/artifacts do not yet exist; author proposal/design/tasks/specs/resource-data-loader/spec.md/verification via SPEC_AUTHORING_PROTOCOL.md, validate, then implement deterministic loading/validation of original game data from repository assets/data files (using the 019 codec + 002/003 foundations), verify full gate, commit + push, advance program state.**

## What 019 implemented

Change 019 introduced a reusable versioned codec primitive:

- `src/data/VersionedCodec.ts` — `VersionedEnvelope` (`{ v, d, c? }`), `CodecError` (UNSUPPORTED_VERSION / INVALID_FORMAT / INVALID_CHECKSUM / SCHEMA_ERROR), `fnv1a32` deterministic 32-bit checksum, and `VersionedCodec<T>` with `encode`/`decode`/`tryDecode` driven by per-version `VersionedSerializers`. `encode` stamps the schema version, optionally embeds an FNV-1a checksum of the canonical body, and emits JSON; `decode` parses, enforces version tolerance (backward-accepts known older versions, rejects `v > currentVersion` as UNSUPPORTED_VERSION), verifies the checksum, and dispatches to the matching decoder. `tryDecode` returns a structured result without throwing.
- `tests/unit/VersionedCodec.test.ts` — 10 tests covering round-trip, backward decode, forward/unknown-version rejection, checksum tamper, malformed envelope, schema error, `tryDecode` success/failure, and FNV-1a determinism.

## Validation evidence (019)

- typecheck: PASS
- lint: PASS
- unit: PASS 353/353 (prior 343 + 10 new VersionedCodec tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 019 is **VERIFIED** at 9/9 (100%). All gates are green: typecheck, lint, full unit suite (353/353), production build, and the required E2E suite (19/19). No advancement exception was needed. The framework is additive infrastructure; no game schema was defined.

## Next change: 020 (blocked on missing artifacts)

`020-resource-data-loader` is named in `CHANGE_SEQUENCE.md` but its change directory does not yet exist, so it has no proposal/design/tasks/specs/verification. Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code; scope is "deterministic loading/validation of original game data from repository assets/data files."

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 019 verification. Change 020 is the next change; its artifacts must be authored and validated before implementation begins.
