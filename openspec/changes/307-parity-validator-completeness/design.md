# Design: 307-parity-validator-completeness

## Context/current state

On `2031fededbc2597ce80e9eab7967d8d013fd625c`, copied real state/matrix fixtures produced `State validation PASSED` after (1) removing verified C305 and adjusting summary counts and (2) changing the bold total to 1. The validator only mandates 001–250, silently skips missing later verified rows, collects `lastCompletedChange` only when the current status is VERIFIED, and parses bold summary values with `parseInt` without stripping Markdown emphasis.

## Target state

When a matrix exists, all numbered VERIFIED changes explicitly named by validation results, current VERIFIED status or `lastCompletedChange` must have exactly one VERIFIED row. Existing 001–250 row coverage, duplicate, category, MP-row and non-VERIFIED current semantics remain. Summary numeric cells are read consistently with or without Markdown emphasis and malformed or absent required total/counts fail closed.

## Invariants

C258 remains deferred and must not be demanded VERIFIED merely because its row exists. Matrix remains optional for synthetic state fixtures. No gameplay, persistence or dependency changes.

## API and data model

No new command: `npm run validate-state` / `node scripts/validate-state.mjs --root <root>` remain exit 0 on coherent inputs and exit 1 with descriptive errors for invalid inputs. Set of verified three-digit change numbers remains deduplicated; matrix map remains keyed by C-number.

## Control/data flow

Collect verified identities from `validationResults[].status === VERIFIED`, `currentChange` when VERIFIED and `lastCompletedChange` unconditionally. Enforce presence and VERIFIED status of each collected row. In the Summary table normalize simple Markdown emphasis around cell contents before recognizing category and total labels and reading numeric counts; reject missing, malformed, duplicate or incorrect required count entries.

## Detailed behavior

Preserve strict 001–250 row requirement. Verified post-250 entries absent from the matrix produce an error naming the row; existing non-VERIFIED row contradiction remains an error. An ACTIVE current change is not itself required VERIFIED. Every category represented in matrix rows requires one numeric Summary count matching its cardinality, and a single Total rows count must equal all unique C/MP rows. Plain and bold text are accepted. Missing category counts or malformed/duplicate counts fail.

## Failure modes

Invalid state exits 1 with the missing/mismatched row or summary count named. A synthetic fixture without a matrix preserves existing behavior. Existing 258 deferred row is permitted while not recorded VERIFIED.

## Compatibility/migration

No user data changes. Repository matrix should already pass; fix any demonstrated record contradiction rather than weakening validation. Existing non-matrix unit fixtures remain supported.

## Performance/resource constraints

Linear scan over state and matrix rows; no network or recursive filesystem traversal. Existing 30-second real-tree validator timeout remains.

## Testing seams

Invoke the actual CLI against disposable roots with valid state, full 001–250 synthetic rows, selected post-250 rows, both master-plan rows and a computed summary. Negative cases exercise missing last-completed/current/historical VERIFIED rows, missing or nonnumeric/incorrect bold total and category counts, and duplicates. Positive cases cover plain/bold summary, active current, optional matrix and deferred C258.

## Observability/debugging

Diagnostics name C-number, Summary category, or total; no generic silent skip of malformed Summary numeric fields.

## Affected files/symbols

`scripts/validate-state.mjs` (`validateParityMatrix`), `tests/unit/ValidateStateInvalidStates.test.ts`, state/control documents, reviewed file-audit manifest.

## Rejected alternatives

Hardcoding 305/306 simply moves the failure to the next change. Requiring all planned future rows would incorrectly force future unimplemented changes into the present matrix. Removing bold formatting from the current matrix would hide, not repair, the parser defect.

## Downstream dependencies

CI, `npm run validate-state`, `npm run verify:all` and historical state fixtures depend on stable CLI behavior and coherent parity summaries.
