# Design: 001-autonomous-program-control

## Target

Repository-persisted state and ordered OpenSpec changes let a fresh development session resume without prior session context.

## Invariants

- `openspec/PROGRAM_STATE.json` is canonical current state.
- `openspec/CHANGE_SEQUENCE.md` is canonical order.
- Exactly one numbered implementation change is active.
- Mandatory requirements and required checks must pass before advancement.
- 100% completion is expected; below 90% never advances.
- Future change artifacts are authored and validated before production implementation.

## Flow

Read control files, inspect actual repository state, resume the first unchecked active task, validate it, checkpoint progress, perform the full change gate, then activate the next number only after verification.

## Recovery

When checkpoint data and actual implementation disagree, use the more conservative state until tests and inspection reconcile the discrepancy. Record blockers instead of skipping dependent changes.

## Scope

This design changes documentation/control state only; it does not alter runtime game behavior.
