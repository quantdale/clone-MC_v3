# Spec: unreferenced-source-gate

## Contract

The guard MUST determine direct module references from TypeScript syntax, not text that merely resembles an import. It is a direct-importer check, not a reachability or unused-export check.

## Definitions

A source is a Git-tracked `src/**/*.ts` file excluding `.d.ts`. A scanned importer is a Git-tracked TypeScript file in `src/` or `tests/`. A literal reference is a relative string-literal module specifier in a supported syntax node.

## Invariants

The existing three-entry allow-list MUST NOT expand. Apart from the urgent save-queue integrity correction specified below, no production behavior, save format, dependency, visual golden or verification threshold changes are authorized.

## Requirements

### Requirement: R1 real syntax edges only

The guard MUST count references only from parsed static import declarations, export declarations, import-equals external module references, literal dynamic imports and literal `require` calls. It MUST NOT count import-like text in comments or arbitrary strings. It MUST count type-only and side-effect imports.

#### Scenario: misleading comment and string
- **GIVEN** a tracked source module with no importer and an entry point containing only a comment or unrelated string resembling an import
- **WHEN** the real guard runs
- **THEN** it exits 1 and names the orphan.

#### Scenario: supported import forms
- **GIVEN** tracked source targets referenced with each supported syntax form
- **WHEN** the real guard runs
- **THEN** those references count as edges and the targets are not reported as orphans.

### Requirement: R2 tracked relative resolution

Relative literal references MUST resolve to tracked source `.ts` files by extensionless name, explicit `.ts`, `.js` mapped to `.ts`, or `index.ts` directory import. Bare package and unresolvable references MUST NOT count as edges.

#### Scenario: supported paths
- **GIVEN** tracked source modules addressed by each supported path spelling
- **WHEN** the guard runs
- **THEN** each corresponding target has an importer.

#### Scenario: missing or external target
- **GIVEN** a missing relative target or a bare package name
- **WHEN** the guard runs
- **THEN** it does not invent an edge to an unrelated tracked module.

### Requirement: R3 fail-closed scanning

A bad root, failed Git listing, unreadable tracked file or syntactically invalid scanned TypeScript MUST fail with a diagnostic and a nonzero exit rather than report a passing census. An unexpected orphan MUST exit 1; a scan error MUST exit 2.

#### Scenario: malformed file
- **GIVEN** a tracked source with malformed TypeScript syntax
- **WHEN** the guard runs
- **THEN** it exits 2 and identifies the file.

#### Scenario: invalid invocation
- **GIVEN** a missing `--root` value or a non-repository root
- **WHEN** the guard runs
- **THEN** it exits 2.

### Requirement: R4 preservation and verification

The real tree MUST pass the corrected guard without widening its allow-list. Tests MUST exercise the actual script, including the reproduced false pass, and the existing full mandatory gates MUST pass before verification.

#### Scenario: real checkout
- **GIVEN** the current tracked repository
- **WHEN** `npm run verify:orphans` runs
- **THEN** it exits 0 with the unchanged three-entry allow-list and no unexpected orphan.

### Requirement: R5 statistics browser gate retains real mining evidence

The statistics journey MUST wait for the jump to finish and the target to be updated after aiming before capturing the block to mine. It MUST still use real held mining, verify that captured block becomes air, and verify that the mining statistic increases.

#### Scenario: repeated statistics journey
- **GIVEN** a fresh playable world after the walking and jumping steps
- **WHEN** the grounded player aims and mines the captured target
- **THEN** that exact block becomes air and `blocks_broken` increases
- **AND** the existing panel and reload assertions remain in place.

### Requirement: R6 preserve superseding pending saves

A draining batch MUST NOT delete or write a captured pending entry that has been replaced or cleared before its turn. A newer replacement MUST remain pending for a subsequent drain, and MUST eventually be written when the sink succeeds. Previously established re-mark-during-write, failure-requeue, FIFO and serialized concurrent-drain guarantees MUST remain intact.

#### Scenario: later entry re-marked during an earlier write
- **GIVEN** queued A and B(v1) in one batch and an in-flight write of A
- **WHEN** B is re-marked B(v2) before A completes
- **THEN** the obsolete B(v1) is not written or reported committed, B(v2) remains pending, and the next successful drain writes B(v2).

#### Scenario: pending batch cleared during an earlier write
- **GIVEN** queued A and B in one batch and an in-flight write of A
- **WHEN** the pending queue is cleared before A completes
- **THEN** the obsolete B entry is not written or recreated by the batch.

## Error and failure behavior

Orphans yield exit 1 with names; scanner or input errors yield exit 2 with an actionable diagnostic.

## Performance and resource bounds

One AST parse per tracked importer and a bounded number of path checks per literal reference; real-tree test timeout remains 30 seconds.

## Compatibility and migration

No save schema, browser product or protocol changes. The save-queue correction preserves the existing durability contract. The guard's documented direct-importer semantics and command remain unchanged.

## Security and integrity

No external paths or code are executed from parsed module specifiers. Git is invoked with fixed arguments and no shell interpolation of user input.

## Observability

Print unexpected paths and failing scan files; preserve the existing census.

## Verification mapping

| Requirement | Evidence |
| --- | --- |
| R1 | Synthetic real-script tests for comments, strings and supported syntax; before/after reproduction |
| R2 | Synthetic extension, index, missing and package-reference tests |
| R3 | Invalid syntax, root and Git fixtures |
| R4 | Real-tree gate, focused suite, full mandatory verification and isolated performance gate |
| R5 | Failing-first browser repeats and repeated real statistics journeys after the test-precondition correction |
| R6 | Failing-first deterministic queue interleaving tests and existing queue/storage regression suites |
