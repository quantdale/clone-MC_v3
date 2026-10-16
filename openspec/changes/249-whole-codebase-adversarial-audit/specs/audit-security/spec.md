# Spec: audit-security

## Contract

The security audit enumerates the trust boundaries and every untrusted-input surface of the
application, verifies each is validated or constrained, and verifies that no production-reachable
backdoor or test hook exists. It relies on, and does not duplicate, the network adversarial
evidence from change 237 (malformed/duplicate/out-of-order/rate-abusive messages) and the
import/validation work in 42/240/234. It reconciles the legacy security findings `AUDIT-004`
(`?e2e` hook) and `AUDIT-024`-adjacent concerns against the current tree.

## Definitions

- **Untrusted input surface**: any data that enters the program from outside its own trusted
  state — URL parameters, network messages, loaded/saved world data, imported archives, and
  any environment-controlled flag that gates capability.
- **Production build**: the artifact produced by `npm run build` for end users, as opposed to a
  dev or test build.

## Invariants

- No security finding is reported `confirmed`/`high` without evidence.
- No secret, token, or credential is copied into the report; such content is redacted and
  referenced by location.
- Production-reachable capability gating is verified against the production build, not the dev
  build.

## Requirements

### Requirement: REQ-S1 — Enumerate and validate untrusted input surfaces
The security audit MUST enumerate every untrusted input surface (URL parameters, network
messages, stored/imported world data, environment-controlled capability flags) and MUST
determine for each whether it is validated/constrained before it influences behavior.

#### Scenario: URL parameter surface
- **GIVEN** `src/main.ts` reads URL parameters and environment flags,
- **WHEN** the security audit inspects the input surface,
- **THEN** it MUST record each parameter/flag read, whether a production build accepts it, and
  whether it gates any capability; any parameter that gates capability in a production build
  without an authenticated/secret gate MUST be a finding.

#### Scenario: network-message surface covered by prior evidence
- **GIVEN** malformed-message handling evidence from change 237,
- **WHEN** the security audit reaches the network surface,
- **THEN** it MUST cite the 237 verification evidence (and, where thin, run/confirm a headless
  probe) and record the resulting status rather than re-deriving it from scratch.

### Requirement: REQ-S2 — No production backdoor or test hook
The audit MUST verify that no production-reachable backdoor or test hook exposes game-state
manipulation. In particular, the `window.__voxelGame` handle and any `VITE_E2E`-style capability
flag MUST be reachable only in a dev or explicitly test-only build, never in a normal production
build.

#### Scenario: test hook gated by build flag
- **GIVEN** `src/main.ts` sets `window.__voxelGame` when `import.meta.env.DEV || import.meta.env
  .VITE_E2E === 'true'`,
- **WHEN** the production build is inspected,
- **THEN** the audit MUST confirm `VITE_E2E` is unset in a normal production build (recorded via
  build-time inspection and/or an E2E check that `window.__voxelGame` is absent without the
  flag) and record the result; if `VITE_E2E` can be set by a user-supplied query or header in
  production, that is a blocking finding.

#### Scenario: backdoor discovered
- **GIVEN** a production build where `window.__voxelGame` or an equivalent handle is reachable
  without a test-only gate,
- **WHEN** the audit classifies it,
- **THEN** it MUST be a `blocking` `security` finding with static evidence of the gating line and
  dynamic evidence from the production build.

### Requirement: REQ-S3 — Storage and import validation
The audit MUST verify that loaded/saved world data and imported archives are validated before
use: malformed or hostile data MUST NOT cause corruption, crashes, or unconstrained resource
growth.

#### Scenario: crafted world archive
- **GIVEN** the import/export and save-recovery components (`src/storage/WorldArchiver.ts`,
  `WorldArchive.ts`, change 240 evidence),
- **WHEN** the security audit inspects validation,
- **THEN** it MUST confirm malformed archives/records are rejected by documented validation with
  evidence (citing 240/42 verification or a headless probe) and record any surface where
  unvalidated bytes reach a hot path as a finding.

### Requirement: REQ-S4 — Dependency and supply-chain posture
The audit MUST run `npm audit` and record its result; any high/critical known-vulnerability
finding MUST be recorded as a `security` finding (blocking only if it is production-reachable
with a known exploit path).

#### Scenario: npm audit clean
- **GIVEN** `npm audit` returns no high/critical advisories,
- **WHEN** the dependency posture is recorded,
- **THEN** the result MUST be recorded as evidence with `status: not-an-issue` (or a
  `non-blocking` note if only low-severity advisories exist).

#### Scenario: production-reachable vulnerable dependency
- **GIVEN** `npm audit` reports a high-severity advisory on a package used in the production
  bundle,
- **WHEN** the finding is classified,
- **THEN** it MUST be recorded with the advisory reference and classified `blocking` if a known
  exploit path is reachable in the production app, else `non-blocking` with an explicit reason.

### Requirement: REQ-S5 — No secret/information leakage
The audit MUST verify the application and its error paths do not leak secrets, credentials, or
unnecessary internal details into the report, logs, or user-visible output.

#### Scenario: error message leak
- **GIVEN** an error path that includes internal symbols or paths in a user-visible message,
- **WHEN** the security audit inspects it,
- **THEN** it MUST be recorded as a `non-blocking` (or `blocking` if it reveals an exploit-
  enabling secret) `security` finding with static evidence; if the content is a secret, the
  report MUST redact it and cite the location.

#### Scenario: report redaction
- **GIVEN** review reveals a token in a stored config,
- **WHEN** the finding is written,
- **THEN** the report MUST NOT embed the token; it MUST reference the location and describe the
  issue.

## Error and failure behavior

- A surface that cannot be inspected (e.g. no production build artifact available) MUST be
  recorded as a `blocked`/`insufficient evidence` entry, not asserted secure.
- A scope decision to classify a legacy `AUDIT-004` as resolved requires current-tree evidence;
  without it the finding MUST remain `open`.

## Performance and resource bounds

Security review is static plus targeted probes; no probe may be unbounded. `npm audit` is a
single bounded command.

## Compatibility and migration

None — security audit changes no runtime behavior.

## Security and integrity

See REQ-S5; the audit's own report must not leak secrets.

## Observability

Each surface inspected and each `security` finding is traceable by ID in the report's evidence
index.

## Verification mapping

- REQ-S1 → enumerated surfaces table in the report's security summary.
- REQ-S2 → production-build check result for `window.__voxelGame`/`VITE_E2E`.
- REQ-S3 → storage/import validation evidence (237/240 citations or probe).
- REQ-S4 → `npm audit` output recorded.
- REQ-S5 → no secret in report; leakage findings evidenced.
