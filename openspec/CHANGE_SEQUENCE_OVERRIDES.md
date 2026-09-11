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

## 258 headed-certification deferral — owner-authorized BLOCKED (2026-09-11)

The product owner (Michael via Minecraft Clone Dev, 2026-09-11) formally deferred headed
hardware-WebGL certification for `258-real-world-runtime-performance-fps-recovery` and
authorized moving on to whatever else is still allowed without faking headed GPU evidence
or waiting for a GPU host.

- Change 258 status is **BLOCKED** at 40/100 (not ACTIVE waiting forever). The 40 completed
  tasks are environment-independent and headless-verified; the remaining 60 require a
  hardware-WebGL host (strictly headed: 3, 6–15, 29, 34, 91–95, 97–98; headed-profiling-
  gated: 39, 41, 48–57, 59–63, 65, 67–76, 78–81, 83, 86–90; closure: 99–100) and stay
  unchecked. Full classification lives in the change's `verification.md`.
- This deferral does NOT verify 258 and does NOT authorize any higher-numbered content
  campaign: no later change may be implemented as if 258 were VERIFIED. Only
  production-readiness / ship-hygiene work that needs no headed GPU is allowed meanwhile.
- Production default is unchanged (sync meshing, no quality retune). 001–257 remain VERIFIED;
  the game is shippable with known performance-certification debt.
- Resume order on a hardware-WebGL host: task 3 → tasks 6–15 → tasks 29/34 →
  governor/worker wiring with headed proof → tasks 91–95 → tasks 97–100.

## 259 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-11)

The product owner (Michael via Minecraft Clone Dev, 2026-09-11) authorized
activating and implementing OpenSpec change **259-enchanting-panel-ui** while
Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred).

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 259 track.
- Change 259 (`259-enchanting-panel-ui`) is the sole **ACTIVE** implementation
  change: an in-game enchanting panel UI over the existing headless enchanting
  seam (`src/inventory/EnchantingTable.ts`, changes 118–120 / 219). It closes
  certification debt **R-3** (enchanting session open→reselect→apply browser E2E).
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 259 track does not consume, waive, or re-litigate any 258 headed task.
