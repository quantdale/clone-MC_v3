# Verification: 019-versioned-codec-framework

Status: **VERIFIED**

Advancement allowed: **true**

Completion: **100%** (9/9 tasks complete).

## Definition of Done check

- [x] `VersionedEnvelope` + `CodecError` (UNSUPPORTED_VERSION / INVALID_FORMAT / INVALID_CHECKSUM / SCHEMA_ERROR) defined.
- [x] `fnv1a32` deterministic 32-bit checksum implemented.
- [x] `VersionedCodec<T>` with `encode`/`decode`/`tryDecode` and per-version serializers.
- [x] Version tolerance: backward accept (known older versions decode), forward reject (`v > currentVersion` → UNSUPPORTED_VERSION), unknown older → INVALID_FORMAT.
- [x] Checksum verification on decode (tamper detected).
- [x] Malformed envelope → INVALID_FORMAT; decoder schema error → SCHEMA_ERROR.
- [x] `tryDecode` returns structured result without throwing.

## Evidence

| Requirement | Evidence |
| --- | --- |
| Round-trip + version tolerance + integrity | 10 `VersionedCodec.test.ts` tests: round-trip at v2, backward decode v1, reject newer v3, reject unknown older v1, tamper→INVALID_CHECKSUM, malformed→INVALID_FORMAT, schema error→SCHEMA_ERROR, tryDecode ok/fail, fnv1a32 determinism |

## Gate results

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 353/353 (was 343; +10 VersionedCodec) |
| `npm run build` | PASS — `tsc --noEmit && vite build` clean |
| `npm run test:e2e` | PASS — 19/19 |

No advancement exception used. All mandatory requirements and required tests pass.

**020-resource-data-loader is authorized to begin.**
