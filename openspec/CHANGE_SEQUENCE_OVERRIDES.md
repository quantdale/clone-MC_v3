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

## 260 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-11)

The product owner (Michael via Minecraft Clone Dev, 2026-09-11) authorized
activating and implementing OpenSpec change **260-live-brewing-stand-production-integration**
while Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Change **259-enchanting-panel-ui**
stands **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 260 track.
- Change 259 stands **VERIFIED** (18/18) and MUST NOT be reopened unless a
  brewing regression blocks the 260 player loop.
- Change 260 (`260-live-brewing-stand-production-integration`) is the sole
  **ACTIVE** implementation change: live Game wiring for the verified headless
  brewing seam (`src/world/BrewingStandBlockEntity.ts`, change 123, over
  `src/inventory/BrewingRecipes.ts` + change 122 potion item data + 219 potion
  catalog data), mirroring the Change 251 furnace and Change 259 panel
  lifecycle patterns. It closes certification debt **R-8 (brewing half)**
  (risk register 2026-08-23) with a browser E2E journey
  (place→open→insert→brew→collect→reload→break).
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 260 track does not consume, waive, or re-litigate any 258 headed task.

## 261 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-11)

The product owner (Standing owner order, 2026-09-11 campaign instruction) authorized
activating and implementing OpenSpec change **261-gamerule-settings-ui** while
Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes **259-enchanting-panel-ui**
and **260-live-brewing-stand-production-integration** stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 261 track.
- Changes 259 (18/18) and 260 (19/19) stand **VERIFIED** and MUST NOT be
  reopened unless a gamerule regression blocks the 261 player loop.
- Change 261 (`261-gamerule-settings-ui`) is the sole **ACTIVE** implementation
  change: an in-game settings/gamerule UI over the existing `GameRuleFramework`
  (change 189) with world-scoped persistence and live-consumer wiring
  (`mobGriefing` into the Wither/destroyable paths that already accept the flag,
  plus other 189 keys where a production consumer already exists). It closes the
  "seam not wired to UI" debt noted on C252/MP-19.4-1.
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 261 track does not consume, waive, or re-litigate any 258 headed task.

## 262 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-11)

The product owner (Standing owner order, 2026-09-11 campaign instruction) authorized
activating and implementing OpenSpec change **262-recipe-book-ui** while
Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes **259-enchanting-panel-ui**,
**260-live-brewing-stand-production-integration**, and **261-gamerule-settings-ui**
stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 262 track.
- Changes 259 (18/18), 260 (19/19), and 261 (16/16) stand **VERIFIED** and MUST NOT be
  reopened unless a recipe-book regression blocks the 262 player loop.
- Change 262 (`262-recipe-book-ui`) is the sole **ACTIVE** implementation
  change: an in-game recipe book UI over the existing headless `RecipeBook`
  (change 204), opened from the crafting UI (`CraftingPanel` flow), with
  known-recipe search/filter via the existing helpers, `layoutRecipe`
  ingredient preview with have/missing accounting, transactional craft-on-select
  through `CraftingSystem`, world-scoped unlock persistence, and craft-output +
  craftable-discovery unlock triggers.
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 262 track does not consume, waive, or re-litigate any 258 headed task.

## 263 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-11)

The product owner (Standing owner order, 2026-09-11 campaign instruction) authorized
activating and implementing OpenSpec change **263-advancement-panel-ui** while
Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes **259-enchanting-panel-ui**,
**260-live-brewing-stand-production-integration**, **261-gamerule-settings-ui**, and
**262-recipe-book-ui** stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 263 track.
- Changes 259 (18/18), 260 (19/19), 261 (16/16), and 262 (14/14) stand
  **VERIFIED** and MUST NOT be reopened unless an advancement regression blocks
  the 263 player loop.
- Change 263 (`263-advancement-panel-ui`) is the sole **ACTIVE** implementation
  change: an in-game advancements panel UI over the existing headless
  `AdvancementFramework` (185) + `CoreProgressionAdvancements` (186), with live
  trigger wiring into Game play (item-obtain choke points plus a typed trigger
  seam for dimension/boss/kill sources), world-scoped `__advancements__`
  persistence with degrade-to-defaults, toast-on-completion, and a hardened
  catalog-aware batch deserializer closing the R-4 advancement-half
  under-validation debt (duplicate/unknown/inconsistent payloads fail closed).
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 263 track does not consume, waive, or re-litigate any 258 headed task.
