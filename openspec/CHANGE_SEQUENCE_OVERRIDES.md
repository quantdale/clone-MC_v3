# Change Sequence Overrides

## Post-terminal ordering: owner-authorized Change 254 ahead of reserved 253 (2026-08-26)

The product owner explicitly authorized a repository-wide performance-optimization campaign
in the session instruction of 2026-08-26 while `253-live-world-architecture-convergence`
remained PLANNED and not activated. Per the universal handoff rule that explicit user/product
instructions are authoritative, that campaign is numbered **254** and was implemented first;
253 remains reserved exactly as pinned by the dual-252 reconciliation below and MUST still be
activated under that name when its own activation decision arrives. No work belonging to 253
was performed under 254; the two campaigns touch overlapping files only insofar as both edit
the live world layer, and 254's changes are behavior-preserving optimizations that 253 may
supersede wholesale during its storage migration.

## 253 activation (2026-08-27)

Change 253 (`253-live-world-architecture-convergence`) was activated this session per the explicit product authorization carried by the execution campaign. The change directory was renamed from `252-live-world-architecture-convergence` (committed earlier on the remote) under the dual-252 reconciliation rule; the number 252 remains consumed by the archived `252-wither-secondary-boss`. Canonical state (`PROGRAM_STATE.json`/`.md`) now names 253 the sole active implementation change (non-terminal ACTIVE epoch); 254 remains VERIFIED and last completed. The reserved-number rule above is satisfied.

## 255 activation (2026-08-29)

Change 255 (`255-high-performance-voxel-engine`) is owner-authorized after Change 253 was verified and archived and Change 254 was verified. The existing repository-local high-performance master plan is expanded into a complete OpenSpec package before production implementation. Change 255 is the sole ACTIVE change; no later numbered work may begin until it reaches VERIFIED.

## Dual-252 numbering reconciliation (2026-08-25)

Two independently authorized campaigns were numbered `252` concurrently:

1. **`252-wither-secondary-boss`** — product authorization delivered with the
   campaign instruction of 2026-08-25 (session start `254d259`). It is
   **IMPLEMENTED, VERIFIED, and ARCHIVED** as
   `openspec/changes/archive/2026-08-25-252-wither-secondary-boss/` in commit
   series rebased onto `b5ff62d`. It closed master-plan gap `MP-19.4-1`
   (`PARITY_MATRIX.md` row exact, evidence cited there).
2. **`252-live-world-architecture-convergence`** — owner planning checkpoint
   `b5ff62dea5f5779ac78ce89cc180aefada4d57d4`, published while the wither
   campaign was executing offline against `254d259`. Planning-only; no
   production code; artifacts at `openspec/changes/252-live-world-architecture-convergence/`.

Resolution rules for the next session:

- The number **252 is consumed by the archived wither change**. The convergence
  campaign MUST be activated under its next free number (**`253-live-world-architecture-convergence`**)
  by renaming its change directory and updating its internal references at
  activation time — before any production edit, per `SPEC_AUTHORING_PROTOCOL.md`.
  Its scope, tasks, and normative spec are unchanged by this renumbering.
- Until that activation, `openspec/PROGRAM_STATE.json` remains terminal/COMPLETE
  (`currentChange: 252-wither-secondary-boss VERIFIED`), which is truthful: the
  wither change is done and verified; the convergence package is PLANNED.
- `.agent/EXECUTION_PROMPT.md`'s "Change 252" label refers to item 2 above;
  readers should apply the renumbering rule from this section.

This section is a sequence-number override only. It does not alter either
campaign's scope, ordering contract, or gate requirements.

## Mandatory post-250 production-persistence hardening interlock
