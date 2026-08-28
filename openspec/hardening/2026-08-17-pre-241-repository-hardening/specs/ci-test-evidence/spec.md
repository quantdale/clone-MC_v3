# Specification: CI and Test Evidence

## Requirement CTE-1 — Exact-SHA provenance

Every verification claim MUST identify the exact commit SHA tested. Canonical CI proof MUST identify the GitHub Actions run for that same SHA.

### Scenario: Tests passed before a later commit
- THEN those results are historical evidence only and cannot verify the later SHA without rerunning required gates.

## Requirement CTE-2 — First-attempt E2E acceptance

Hardening acceptance MUST include a complete E2E run with retries disabled. Retry-enabled runs MAY be used diagnostically but MUST NOT be the sole pass evidence.

### Scenario: One test fails then passes on retry
- THEN hardening verification remains failed until the nondeterminism is resolved and a no-retry suite passes.

## Requirement CTE-3 — Repeatability probes

Critical repaired E2E scenarios SHALL pass at least three consecutive isolated no-retry runs. Long-exploration/resource stress SHALL pass at least two consecutive runs.

## Requirement CTE-4 — Diagnostics retained

Failed E2E/CI runs MUST retain sufficient diagnostics to identify scenario, assertion, console/page errors, trace/screenshot where supported, and deterministic seed/state context when applicable.

## Requirement CTE-5 — Test and skip accounting

Unit/E2E verification MUST record discovered/executed/passed/failed/skipped counts. Unexpected new skips or quarantines are failures unless explicitly justified by a governing spec.

### Scenario: Suite is green because a critical test became skipped
- THEN the acceptance gate MUST fail.

## Requirement CTE-6 — Coverage no-regression gate

The repository MUST measure statement/branch/function/line coverage on the clean hardening baseline and enforce justified thresholds in CI. Thresholds MUST NOT be selected below observed healthy baseline merely to make the gate pass.

### Scenario: Coverage drops below established floor
- THEN CI fails and the drop is either restored or the requirement is explicitly revised with evidence; silent threshold reduction is prohibited.

## Requirement CTE-7 — Critical-path characterization

Coverage percentages alone are insufficient. The audit MUST identify critical stateful/deterministic boundaries and prove they have meaningful behavioral tests, including failure/boundary cases where relevant.

## Requirement CTE-8 — No green-by-weakening

Hardening MUST NOT obtain green status by adding broad ignores, disabling strict checks, increasing retries, removing assertions, deleting legitimate tests, or loosening resource budgets without an evidence-backed requirement correction.

## Requirement CTE-9 — Canonical completion

The final hardening SHA MUST be pushed to canonical `origin/main`, refetched, and have a completed successful canonical GitHub Actions run before the interlock is VERIFIED.
