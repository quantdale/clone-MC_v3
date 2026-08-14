# Verification: 020-resource-data-loader

Status: **VERIFIED**

Advancement allowed: **true**

Completion: **100%** (9/9 tasks complete).

## Definition of Done check

- [x] `ResourceReader`, `LoadFileError`, `LoadedResource` defined.
- [x] `ResourceDataLoader` reads files in supplied order via an injected reader + 019 `VersionedCodec`.
- [x] Missing files → `MISSING` error; decode failures → `DECODE` error; batch continues.
- [x] `loadIntoRegistry` builds a 003 `Registry` keyed by 002 `ResourceId`; duplicate keys surfaced as errors.
- [x] Browser-safe (no `fs` import); deterministic; source-agnostic.

## Evidence

| Requirement | Evidence |
| --- | --- |
| Deterministic ordered load + batch error collection | 5 `ResourceDataLoader.test.ts` tests: ordered load of a/b/c, missing middle file (no abort), decode-failure middle file (no abort), loadIntoRegistry keying, duplicate-key surfaced as DUPLICATE_ID with registry keeping first entry |

## Gate results

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 358/358 (was 353; +5 ResourceDataLoader) |
| `npm run build` | PASS — `tsc --noEmit && vite build` clean |
| `npm run test:e2e` | PASS — 19/19 |

No advancement exception used. All mandatory requirements and required tests pass.

**021 is authorized to begin.** NOTE: the 021 directory is expected to be missing and must be authored via SPEC_AUTHORING_PROTOCOL.md before implementation.
