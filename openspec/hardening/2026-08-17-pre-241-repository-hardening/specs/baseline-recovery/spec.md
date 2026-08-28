# Specification: Baseline Recovery

## Requirement BR-1 — Preserve future specifications

Hardening MUST preserve authored OpenSpec packages for Changes 241-250 unless an individual spec artifact is corrected by the spec-integrity work. It MUST NOT delete future packages merely because their implementation is inactive.

### Scenario: Restoring pre-241 code
- WHEN premature 241 source/test work is removed
- THEN `openspec/changes/241-*` through `250-*` remain present and reviewable.

## Requirement BR-2 — Remove premature implementation precisely

Hardening MUST identify implementation provenance and remove only Change-241-owned production/test behavior that crossed the inactive boundary, preserving unrelated fixes made after the observed audit SHA.

### Scenario: Shared file contains later unrelated fix
- GIVEN a shared file has both premature 241 hunks and a later unrelated hardening fix
- THEN the executor MUST surgically restore the 241 hunk rather than reset the entire file/branch to an old commit.

## Requirement BR-3 — No destructive hard reset as remediation

The executor MUST NOT use an old commit as a blind hard-reset target for the published branch. Historical SHAs are comparison evidence, not guaranteed present truth.

### Scenario: `origin/main` moved since authoring
- THEN the executor rebaselines current history and reapplies the boundary rule to current code.

## Requirement BR-4 — Green compile/static baseline

After boundary restoration, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test` MUST all pass before deeper remediation proceeds.

### Scenario: Typecheck still fails
- THEN a new/current hardening finding is recorded and fixed; the executor MUST NOT activate 241 to make types compile.

## Requirement BR-5 — Canonical E2E recovery

All current E2E scenarios MUST pass from the production-preview path with retries disabled before the baseline is accepted. Previously observed failures in spawn, block interaction/drop/placement, and long-exploration resource behavior MUST receive explicit dispositions.

### Scenario: Test passes only on retry
- THEN the baseline is not accepted and the nondeterminism remains an open hardening finding.

## Requirement BR-6 — Budget integrity

Timeouts, retry counts, assertions, memory/GPU ceilings, or similar acceptance budgets MUST NOT be loosened solely to convert a failure to green.

### Scenario: Long exploration exceeds geometry ceiling
- THEN the executor investigates ownership/disposal/streaming behavior; changing the ceiling requires separate evidence that the requirement itself is invalid and no regression is hidden.

## Requirement BR-7 — Deterministic evidence

Each repaired previously failing behavior SHALL pass at least three consecutive isolated no-retry runs; long-session/resource stress SHALL pass at least two consecutive runs in addition to the full-suite pass.
