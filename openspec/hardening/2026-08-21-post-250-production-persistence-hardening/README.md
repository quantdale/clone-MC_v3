# Post-250 Production Persistence Hardening

Status: **VERIFIED / COMPLETE (2026-08-23)** — all 78 tasks done, Gates A–F PASS, DL-001/DL-002/DL-005
resolved in production code, canonical CI SUCCESS on the published remediation checkpoint
`aa92a5c229a753f10f8c1677e836136962b5d07a`, and release readiness **READY**
(`openspec/evidence/release-readiness-post-hardening.md`). The campaign text below is preserved as
the record of what was mandated and executed.

This out-of-band hardening campaign supersedes the Change 250 `READY` release decision for release purposes. It does not renumber Changes 001-250 and it does not create Change 251.

The trigger is Change 249's confirmed data-loss findings that remained present in the published Change 250 tree:

- `249-DL-001` — production localStorage save failures are silently swallowed.
- `249-DL-002` — dirty edit-overlay LRU eviction can discard committed unsaved edits.
- `249-DL-005` — the transactional IndexedDB persistence stack is not wired into the shipped game.

A blocker cannot be made non-blocking merely because the final verification phase was documentation-only. This campaign must remediate the production paths, prove end-to-end durability on the shipped path, rerun the adversarial audit, and issue a new release-readiness decision.

## Executor entrypoint

A fresh `/goal`, `continue`, or equivalent session MUST:

1. sync exactly to current `origin/main`;
2. read `AGENTS.md` and the normal governance/state chain;
3. read every file in this directory;
4. treat this package as higher precedence than the historical terminal/READY text in Change 250;
5. execute `tasks.md` in order;
6. keep `verification.md` evidence truthful;
7. commit and push directly to `origin/main` per repository governance;
8. require canonical CI success on the exact published remediation SHA before this interlock can be VERIFIED.

## Non-negotiable release rule

The repository is **not release-ready while this interlock is incomplete**. `249-DL-001` and `249-DL-002` must be resolved in production code, not accepted, waived, relabeled, or moved to documentation-only debt. `249-DL-005` must either be resolved by wiring the durable stack into the live game or replaced by an equally durable live architecture that satisfies every normative durability requirement.

See `proposal.md`, `design.md`, `design-addendum.md` (normative implementation contracts),
`tasks.md`, `verification.md`, `remediation-matrix.md`, and `specs/**/spec.md`.
