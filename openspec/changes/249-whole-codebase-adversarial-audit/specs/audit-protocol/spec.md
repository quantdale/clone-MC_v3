# Spec: audit-protocol

## Contract

This capability defines the shared framework for the whole-codebase adversarial audit: the
seven audit categories, the finding taxonomy (blocking vs non-blocking plus severity,
confidence, evidence tier), the evidence requirements, the insufficient/contradictory-evidence
rules, the coverage rules, the scope boundary (audit only — no remediation, no
release-readiness decision), and the schema of the single report artifact. Every category spec
(`audit-{security,correctness,reliability,data-loss,concurrency,performance,architecture}`)
is subordinate to this contract and MUST NOT contradict it. This contract supersedes the
narrative `FULL_AUDIT_REPORT.md` as the authoritative whole-codebase audit definition.

## Definitions

- **Audit**: the read-only, evidence-producing review defined by this package. It changes no
  production behavior.
- **Category**: one of `security`, `correctness`, `reliability`, `data-loss`, `concurrency`,
  `performance`, `architecture`.
- **Finding**: a single recorded issue with a unique ID, category, classification, severity,
  confidence, evidence tier, status, and evidence.
- **Blocking finding**: a finding whose consequence (data loss, silent corruption, determinism
  violation, production-reachable security exploit/backdoor, unrecoverable concurrency race, or
  crash/hang from unbounded growth) means the codebase is not sound in that area without
  remediation.
- **Non-blocking finding**: any finding that is not blocking (performance improvement, UX,
  code quality, coverage gap, documentation drift, INFO architecture note).
- **Coverage minimum**: the per-category scope and evidence floor defined in that category's
  spec; satisfying it means the category is fully audited.
- **Coverage gap / blocked entry**: an explicit record that a coverage minimum was not met
  and why; it is never a silent omission.

## Invariants

- **Read-only**: the audit MUST NOT modify any production source file, configuration, or
  stored-data format.
- **No-fabrication**: every finding MUST carry evidence that is real (verifiable file:line and/or
  recorded command/test result); unsupported claims MUST NOT be reported as confirmed.
- **Unique-ID**: every finding ID is unique and stable within the report and its evidence index.
- **Blocking-justification**: every blocking finding MUST justify its classification in its body.
- **Coverage-honesty**: a category whose coverage minimum is unmet MUST be recorded as a
  coverage gap / blocked entry.

## Requirements

### Requirement: REQ-P1 — Seven categories in scope
The audit MUST cover exactly the seven categories — `security`, `correctness`, `reliability`,
`data-loss`, `concurrency`, `performance`, `architecture` — and MUST record a coverage statement
for each category in the report.

#### Scenario: all seven categories covered
- **GIVEN** an audit run that has completed per-category work,
- **WHEN** the report's coverage matrix is assembled,
- **THEN** it MUST contain exactly seven category rows (one per category) and each row MUST
  state its `minimumMet` value and any gaps.
- **AND** a category with no row is a protocol violation that MUST be fixed before the report is
  final.

### Requirement: REQ-P2 — Finding taxonomy and schema
Every finding in the report MUST conform to the finding schema: a unique `id` of the form
`249-<CATEGORY>-<NNN>` (zero-padded), a `category` from the seven, a `classification` of
`blocking` or `non-blocking`, a `severity` of `critical|high|medium|low|info`, a `confidence` of
`confirmed|high|medium|low`, an `evidenceTier` of `static|dynamic|mixed`, a `status` of
`open|resolved|duplicate|not-an-issue|blocked`, plus `title`, `affected`, `description`,
`trigger`, `impact`, `evidence`, and `recommendation` fields.

#### Scenario: a valid finding
- **GIVEN** a finding about an unreachable autosave flush path,
- **WHEN** it is recorded in the report,
- **THEN** its `id` MUST be unique (e.g. `249-DL-003`), its `category` MUST be `data-loss`, its
  `classification` MUST be `blocking` if it can lose committed edits, and its `evidence` MUST
  reference a real file/line and/or a recorded test result.

#### Scenario: blocking-vs-nonblocking boundary
- **GIVEN** a finding that is only a code-quality improvement with no consequence on data,
  determinism, security, or correctness,
- **WHEN** it is classified,
- **THEN** it MUST be `non-blocking`, even if its severity is `medium` or `high`.
- **AND** the reverse MUST hold: a finding that can silently lose committed player edits MUST be
  `blocking` regardless of how rare the trigger is estimated to be.

### Requirement: REQ-P3 — Evidence requirements
Every finding MUST cite at least one piece of evidence that is either (a) static — a real
`path/file.ts:line` or module/symbol reference a reviewer can open — or (b) dynamic — a recorded
command or test result with enough identifying detail to re-run (script name, test name, or
command). A finding with no verifiable evidence MUST NOT be reported as `confirmed` or `high`.

#### Scenario: fabricated citation rejected
- **GIVEN** a draft finding whose static citation points at a non-existent file or line,
- **WHEN** the finding is validated,
- **THEN** the citation MUST be corrected to a real reference or the finding's confidence MUST be
  downgraded to `low` with an explicit `insufficient evidence` note.
- **AND** the report MUST NOT contain the uncorrected citation.

#### Scenario: dynamic evidence recorded
- **GIVEN** a finding about malformed network-message handling,
- **WHEN** its evidence is recorded,
- **THEN** it MUST cite the headless test that demonstrates the behavior (e.g.
  `tests/unit/NetworkProtocol.test.ts` scenario name or `npm audit` output for a dependency
  finding), not an unverifiable claim.

### Requirement: REQ-P4 — Insufficient and contradictory evidence
When a claim cannot be evidenced, the audit MUST record the finding with `confidence: low`,
`status: blocked` (if it could not be characterized), and an explicit `insufficient evidence`
note. When prior-change evidence and a current-tree observation conflict, the audit MUST re-read
the actual code/result, prefer the current-tree observation, and record the resolution in the
finding body.

#### Scenario: insufficient evidence recorded, not fabricated
- **GIVEN** a suspected memory leak that no headless measurement can reach,
- **WHEN** the auditor attempts to evidence it,
- **THEN** the finding MUST be recorded with `confidence: low`, an `insufficient evidence` note,
  and `status: blocked`; it MUST NOT be reported as confirmed or silently dropped.

#### Scenario: contradictory prior/current evidence reconciled
- **GIVEN** a prior change's verification file claims `X`, but a current-tree inspection shows
  the code now behaves as `Y`,
- **WHEN** the auditor reconciles,
- **THEN** the current-tree observation MUST win, the finding MUST document that the prior
  evidence was superseded, and the report MUST note the resolution.

### Requirement: REQ-P5 — Supersession and reconciliation of the legacy audit
The audit MUST reconcile every legacy finding `AUDIT-001..030` from `FULL_AUDIT_REPORT.md`
against the current codebase, and the report MUST classify each as `resolved`, `persists`,
`duplicate`, or `not-an-issue` with evidence. The narrative report is superseded as the
authoritative whole-codebase audit, not deleted.

#### Scenario: legacy finding already resolved
- **GIVEN** legacy `AUDIT-001` (WebGL context loss) and a current `src/engine/Renderer.ts` that
  registers `webglcontextlost`/`webglcontextrestored` handlers,
- **WHEN** the reconciliation table is built,
- **THEN** `AUDIT-001` MUST be marked `resolved` with a citation to the current handler code
  and any residual limitation recorded as a new finding.

#### Scenario: legacy finding still open
- **GIVEN** a legacy performance finding whose relevant hot path still exists unchanged,
- **WHEN** the reconciliation table is built,
- **THEN** the legacy ID MUST be marked `persists` and mapped to the new finding ID in the
  current catalog rather than silently renumbered.

### Requirement: REQ-P6 — Report artifact structure
The audit MUST produce a single structured report at
`openspec/changes/249-whole-codebase-adversarial-audit/report.md` containing, in order: an
executive summary; methodology (commands, probes, evidence inputs); a coverage matrix (one row
per category); a finding catalog (one entry per finding across all seven categories); an
evidence index (map of finding ID to citations/results); per-category summaries; and a
legacy-finding reconciliation table.

#### Scenario: report complete and internally consistent
- **GIVEN** a finished audit,
- **WHEN** the report is assembled,
- **THEN** it MUST include every section above, every finding ID in the catalog MUST appear in
  the evidence index, every `id` MUST be unique, and every `status` MUST be one of the four
  valid values `open|resolved|duplicate|not-an-issue` plus `blocked` for uncharacterized items.

#### Scenario: missing section fails the report
- **GIVEN** a report draft lacking the evidence index,
- **WHEN** completeness is checked,
- **THEN** the draft MUST be rejected as incomplete and the evidence index MUST be added before
  the report is final.

### Requirement: REQ-P7 — Scope boundary: audit, not remediation or decision
The audit MUST NOT remediate any finding, change production behavior, or decide the final
release-readiness verdict. Blocking findings MUST be surfaced and traceable as inputs to change
250, but 249 MUST NOT make or gate the 250 decision.

#### Scenario: a blocking finding is not fixed here
- **GIVEN** an audit that surfaces a blocking data-loss finding,
- **WHEN** the change is completed,
- **THEN** the finding MUST be recorded with `classification: blocking` and traced as an input to
  250, and MUST NOT be "fixed" as part of 249.
- **AND** any attempt to modify production code to remediate a finding is a scope violation that
  MUST be reverted and re-tracked to a later change.

#### Scenario: release-readiness decision deferred
- **GIVEN** a finished audit report,
- **WHEN** the final release-readiness verdict is considered,
- **THEN** the verdict MUST be left to change 250; 249's report MUST present findings and
  coverage gaps without asserting that the program is or is not release-ready.

### Requirement: REQ-P8 — Coverage honesty
For each category, the audit MUST either satisfy the category's coverage minimum or record an
explicit coverage gap / blocked entry stating which part of the minimum was not met and why. A
silently skipped category or surface is a protocol violation.

#### Scenario: gap recorded, never silent
- **GIVEN** a category whose coverage minimum includes a surface that cannot be audited headless,
- **WHEN** the category's coverage statement is written,
- **THEN** it MUST mark `minimumMet: false`, list the unauditable surface in `gaps`, and explain
  the blocker.

#### Scenario: boundary — minimum exactly met
- **GIVEN** a category whose coverage minimum is exactly satisfied (no surface in excess, none
  omitted),
- **WHEN** the coverage statement is written,
- **THEN** it MUST mark `minimumMet: true` and record the exact surfaces examined as evidence.

## Error and failure behavior

- If the baseline gate fails at start, the audit MUST record the exact failing command and mark
  per-category findings that depend on a green baseline as `blocked`, not proceed on a false
  green claim.
- If a probe cannot run (unavailable seam), the affected claim MUST be recorded with
  `confidence: low` / `status: blocked`, never asserted.
- Scope violations (fixing a found issue, or deciding release-readiness) MUST be treated as
  hard failures of the change and reverted.

## Performance and resource bounds

The audit adds no production runtime cost. Any characterization probe MUST be bounded: a per-probe
runtime cap (default `< 60s` under Vitest) and bounded memory (no unbounded accumulation). The
report's evidence index MUST reference results rather than embed unbounded raw logs.

## Compatibility and migration

No public API, stored-data, serialized, or config change. `FULL_AUDIT_REPORT.md` is left in place
and reconciled, not deleted. Report and spec files are additive under the 249 change directory.

## Security and integrity

The audit's own artifacts must not be used as an attack surface: the report MUST NOT embed
secrets, tokens, or credentials discovered during review; any such content MUST be redacted and
referenced by location instead.

## Observability

The report is the durable observability artifact; finding IDs are the stable handles that
subsequent remediation changes and change 250 use to reference issues. Each category spec lists
concrete inspectable surfaces so a finding can be reproduced by name.

## Verification mapping

- REQ-P1 → coverage matrix has exactly seven rows.
- REQ-P2 → sample-validate finding IDs, classifications, and schema fields.
- REQ-P3 → validate every citation resolves and no finding is `confirmed`/`high` without
  evidence.
- REQ-P4 → confirm insufficient-evidence and contradictory-evidence cases recorded.
- REQ-P5 → legacy reconciliation table maps `AUDIT-001..030` with evidence.
- REQ-P6 → report contains all mandated sections; IDs unique and indexed.
- REQ-P7 → no production code changed (clean `src/` tree); no release-readiness assertion.
- REQ-P8 → every category row has `minimumMet` and gaps, or an explicit blocked entry.
