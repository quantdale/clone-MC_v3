# Proposal: 307-parity-validator-completeness

## Problem

At `2031fededbc2597ce80e9eab7967d8d013fd625c`, the real `validate-state.mjs` exits 0 against a copied, otherwise coherent state whose parity matrix omits verified C305 and whose category counts were adjusted accordingly. A second fixture changes the bold total from `308` to `1`; validation still exits 0. The existing loop checks missing rows only through 250 and skips missing later verified rows, while the summary parser silently ignores bold totals.

## Goals

Make the real state validator reject missing or misclassified verified change rows and invalid summary totals, including normal Markdown bold formatting. Preserve the owner-deferred C258 state and existing synthetic fixture compatibility.

## Non-goals

No game, save, dependency, visual, coverage-threshold or change-258 hardware work. Do not turn missing optional matrix files in synthetic roots into an unrelated failure.

## Preconditions

306 VERIFIED 7/7; its final code candidate passed all 13 gates plus isolated multiplayer performance. `origin/main` was verified at `2031fededbc2597ce80e9eab7967d8d013fd625c` and the worktree was clean before this change. Change 258 stays BLOCKED.

## Dependencies

Existing `scripts/validate-state.mjs`, `PARITY_MATRIX.md`, `PROGRAM_STATE.json`, TypeScript/Vitest and Git; no new dependencies.

## Proposed change

Add failing-first subprocess tests using synthetic state/matrix fixtures. Require a row for every explicitly recorded VERIFIED change, including `lastCompletedChange` while another change is active, and validate both category counts and bold or plain total counts without silently skipping malformed numbers. Preserve the original 001–250 coverage and existing checks.

## Compatibility and migration

No production or persisted user data changes. Malformed previously accepted parity records become nonzero validation errors; coherent historical synthetic roots without a matrix remain valid.

## Risks

Incorrect Markdown parsing can reject a valid matrix or overlook malformed values. Tests cover plain/bold cells, intentionally missing or malformed counts, post-250 verified rows and C258 deferred behavior; run against the real tree.

## Rollback strategy

Revert the change commits together; this restores the previous known false-pass defects.

## Definition of Done

Each normative requirement has executable passing and failing evidence, both reproduced false passes become failures, real state passes, and the mandatory full gate plus isolated performance measurement pass. State, review and publication evidence remain truthful.

## Advancement gate

All tasks and mandatory requirements pass at 100%; publish via normal history-preserving `origin/main` push. Change 258 remains BLOCKED.
