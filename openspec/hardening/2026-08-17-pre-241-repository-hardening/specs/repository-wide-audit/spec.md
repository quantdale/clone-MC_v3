# Specification: Repository-Wide Tracked-File Audit

## Requirement RWA-1 — 100% tracked-path accountability

The audit MUST derive its inventory from `git ls-files` for the exact reviewed SHA and MUST produce exactly one manifest record per tracked path.

### Scenario: One tracked file has no row
- THEN the repository-wide audit is incomplete and hardening cannot be VERIFIED.

## Requirement RWA-2 — No duplicate/stale manifest

The manifest MUST contain no duplicate paths and MUST be regenerated/reconciled after tracked-file changes made during remediation.

## Requirement RWA-3 — Integration authenticity

Every production/source module MUST be classified as `integrated`, `intentional-dormant`, or `dead-unreachable` with evidence.

### Scenario: New module has unit tests but no production import/reachability
- THEN it MUST NOT be treated as implemented merely because tests exist; it is classified dormant/dead and reconciled with its owning spec/change.

## Requirement RWA-4 — Mechanical review coverage

Every applicable text/code/config path MUST receive mechanical checks for parse/type/lint/build issues, diagnostic suppressions, unsafe casts, TODO/FIXME/HACK/placeholder debt, secret-like content, case/portability hazards, stale generated output, duplicate definitions, unbounded resource containers/listeners, and obvious trust-boundary misuse.

## Requirement RWA-5 — Semantic boundary review

Mechanical checks MUST be supplemented by semantic review of all high-risk subsystem boundaries identified in `file-audit-manifest.md`. The audit MUST reason about lifecycle, ownership, failure paths, ordering, cleanup, determinism, concurrency, and data integrity rather than only style.

## Requirement RWA-6 — Test authenticity

Tests MUST be reviewed for whether they exercise production integration rather than test-only closures/shims that bypass the real API. A passing isolated test that cannot map to production dependency flow is a finding.

## Requirement RWA-7 — Generated/assets provenance

Generated files and assets MUST identify source/provenance/usage and must not be stale, duplicated source-of-truth, or unintentionally committed build output.

## Requirement RWA-8 — Finding linkage

Every defect/gap found during file review MUST receive a unique hardening finding ID, severity, blocking classification, evidence, affected paths, and disposition.

## Requirement RWA-9 — No silent exclusions

Binary files, large files, third-party-looking content, docs, and specs are not silently excluded. Where line-level semantic review is inapplicable, provenance/usage/integration and policy review still produce an audited record.

## Requirement RWA-10 — Completion proof

At verification, tracked path count MUST equal manifest record count, `unreviewed` MUST equal zero, open blocking findings MUST equal zero, and the exact reviewed SHA MUST be recorded.
