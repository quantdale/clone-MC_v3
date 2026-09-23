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

## 264 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-11)

The product owner (Standing owner order, 2026-09-11 campaign instruction) authorized
activating and implementing OpenSpec change **264-item-xp-entity-persistence-hardening** while
Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes **259-enchanting-panel-ui**,
**260-live-brewing-stand-production-integration**, **261-gamerule-settings-ui**,
**262-recipe-book-ui**, and **263-advancement-panel-ui** stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 264 track.
- Changes 259 (18/18), 260 (19/19), 261 (16/16), 262 (14/14), and 263 (15/15)
  stand **VERIFIED** and MUST NOT be reopened unless an item/XP persistence
  regression blocks the 264 player loop.
- Change 264 (`264-item-xp-entity-persistence-hardening`) is the sole
  **ACTIVE** implementation change: harden `ItemEntityManager`/`XpOrbManager`
  batch deserialization to fail closed on duplicate ids and malformed payloads
  (deterministic throw, manager unchanged), and wire world-scoped live Game
  persistence for item entities + XP orbs (`__itementities__` / `__xporbs__`
  raw metadata records with degrade-to-empty quarantine, reset/archive
  passthrough) so drops/orbs survive page refresh, closing certification debt
  **R-4** (entity-manager half; advancement half already closed by 263).
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 264 track does not consume, waive, or re-litigate any 258 headed task.

## 265 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-11)

The product owner (Standing owner order, 2026-09-11 campaign instruction) authorized
activating and implementing OpenSpec change **265-live-creative-mode-integration** while
Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes **259-enchanting-panel-ui**,
**260-live-brewing-stand-production-integration**, **261-gamerule-settings-ui**,
**262-recipe-book-ui**, **263-advancement-panel-ui**, and
**264-item-xp-entity-persistence-hardening** stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 265 track.
- Changes 259 (18/18), 260 (19/19), 261 (16/16), 262 (14/14), 263 (15/15),
  and 264 (13/13) stand **VERIFIED** and MUST NOT be reopened unless a
  creative-mode regression blocks the 265 player loop.
- Change 265 (`265-live-creative-mode-integration`) is the sole
  **ACTIVE** implementation change: wire the verified headless `GameModeFramework`
  (192) predicates into the live Game (world-scoped `__gamemode__` persistence
  with degrade-to-defaults and reset/archive passthrough; `setGameMode` +
  `setGameModeFromText` seams; creative no-deplete / instant-break / no-stats
  / minimal safe flight applied live; creative inventory/menu UI over the block
  and item registries with search and grant-to-hotbar/inventory, no survival
  crafting gates), with survival kept default and unaffected.
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 265 track does not consume, waive, or re-litigate any 258 headed task.

## 266 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-11)

The product owner (Standing owner order, 2026-09-11 campaign instruction) authorized
activating and implementing OpenSpec change **266-live-adventure-spectator-integration**
while Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes **259-enchanting-panel-ui**,
**260-live-brewing-stand-production-integration**, **261-gamerule-settings-ui**,
**262-recipe-book-ui**, **263-advancement-panel-ui**,
**264-item-xp-entity-persistence-hardening**, and **265-live-creative-mode-integration**
stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 266 track.
- Changes 259 (18/18), 260 (19/19), 261 (16/16), 262 (14/14), 263 (15/15),
  264 (13/13), and 265 (13/13) stand **VERIFIED** and MUST NOT be reopened
  unless an adventure/spectator regression blocks the 266 player loop. The 265
  HUD chip toggle (survival⇄creative) and text-seam semantics are preserved
  byte-for-byte; the 266 track extends them without altering them.
- Change 266 (`266-live-adventure-spectator-integration`) is the sole
  **ACTIVE** implementation change: wire the verified headless `AdventureModeRules`
  (194) and `SpectatorFramework` (195) predicates into the live Game — adventure
  break/place gated by held-stack CanDestroy/CanPlaceOn declarations resolved via
  `resolveBlockPermissionSet`, spectator noclip/no-collision/no-interaction/no-
  targeting applied live, mode switching exposing adventure + spectator, and
  world-scoped `__gamemode__` persistence covering all four modes.
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 266 track does not consume, waive, or re-litigate any 258 headed task.

## 267 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-12)

The product owner (Standing owner order, 2026-09-12 campaign instruction) authorized
activating and implementing OpenSpec change **267-live-hardcore-mode-integration**
while Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes **259-enchanting-panel-ui**,
**260-live-brewing-stand-production-integration**, **261-gamerule-settings-ui**,
**262-recipe-book-ui**, **263-advancement-panel-ui**,
**264-item-xp-entity-persistence-hardening**, **265-live-creative-mode-integration**,
and **266-live-adventure-spectator-integration** stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 267 track.
- Changes 259 (18/18), 260 (19/19), 261 (16/16), 262 (14/14), 263 (15/15),
  264 (13/13), 265 (13/13), and 266 (13/13) stand **VERIFIED** and MUST NOT be
  reopened unless a hardcore regression blocks the 267 player loop. The 265
  `__gamemode__` store, the 266 adventure/spectator gates, and the chip/select
  semantics are preserved byte-for-byte; the 267 track extends them without
  altering them.
- Change 267 (`267-live-hardcore-mode-integration`) is the sole
  **ACTIVE** implementation change: wire the verified headless `HardcoreFramework`
  (193) into the live Game — world-scoped `__hardcore__` (+ `__difficulty__`)
  persistence, hardcore difficulty lock, permanent-death routing into spectator
  via the 266 spectator path, and a hardcore toggle + difficulty select in the
  gamerule-adjacent settings UI.
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 267 track does not consume, waive, or re-litigate any 258 headed task.

## 268 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-12)

The product owner (Standing owner order, 2026-09-12 campaign instruction) authorized
activating and implementing OpenSpec change **268-ci-immutable-action-pins**
while Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes **259-enchanting-panel-ui**,
**260-live-brewing-stand-production-integration**, **261-gamerule-settings-ui**,
**262-recipe-book-ui**, **263-advancement-panel-ui**,
**264-item-xp-entity-persistence-hardening**, **265-live-creative-mode-integration**,
**266-live-adventure-spectator-integration**, and **267-live-hardcore-mode-integration**
stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 268 track.
- Changes 259 (18/18), 260 (19/19), 261 (16/16), 262 (14/14), 263 (15/15),
  264 (13/13), 265 (13/13), 266 (13/13), and 267 (13/13) stand **VERIFIED** and
  MUST NOT be reopened unless a CI regression blocks the 268 pipeline. The 268
  track touches no `src/` or `tests/` file and changes no gameplay behavior.
- Change 268 (`268-ci-immutable-action-pins`) is the sole **ACTIVE**
  implementation change: pin every `actions/*@v4` step in
  `.github/workflows/ci.yml` and `seed-visual-goldens.yml` to immutable full
  commit SHAs (with `# v4` version comments), closing certification debt
  **R-5**. SHAs are resolved via the GitHub API at authoring time and recorded
  in the change `verification.md`.
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 268 track does not consume, waive, or re-litigate any 258 headed task.

## 269 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-12)

The product owner (Standing owner order, 2026-09-12 campaign instruction) authorized
activating and implementing OpenSpec change **269-composed-game-dispose-worker-terminate**
while Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes **259-enchanting-panel-ui**,
**260-live-brewing-stand-production-integration**, **261-gamerule-settings-ui**,
**262-recipe-book-ui**, **263-advancement-panel-ui**,
**264-item-xp-entity-persistence-hardening**, **265-live-creative-mode-integration**,
**266-live-adventure-spectator-integration**, **267-live-hardcore-mode-integration**,
and **268-ci-immutable-action-pins** stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 269 track.
- Changes 259 (18/18), 260 (19/19), 261 (16/16), 262 (14/14), 263 (15/15),
  264 (13/13), 265 (13/13), 266 (13/13), 267 (13/13), and 268 (12/12) stand
  **VERIFIED** and MUST NOT be reopened unless a dispose/worker regression
  blocks the 269 teardown path. The 269 track changes no gameplay behavior
  and performs no gameplay retune.
- Change 269 (`269-composed-game-dispose-worker-terminate`) is the sole
  **ACTIVE** implementation change: harden the composed `Game.dispose()` +
  world/worker teardown path so dispose is idempotent and terminates/joins
  workers (no post-dispose callbacks mutate state or leak handles; no pending
  Game timers/rAF/listeners keep the page alive), with unit/integration tests
  proving double-dispose safety + worker terminate, closing certification debt
  **R-6** (composed-Game dispose/worker terminate residual).
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 269 track does not consume, waive, or re-litigate any 258 headed task.

## 270 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-12)

The product owner (Standing owner order, 2026-09-12 campaign instruction) authorized
activating and implementing OpenSpec change **270-leaf-apple-loot-probability**
while Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes **259-enchanting-panel-ui**,
**260-live-brewing-stand-production-integration**, **261-gamerule-settings-ui**,
**262-recipe-book-ui**, **263-advancement-panel-ui**,
**264-item-xp-entity-persistence-hardening**, **265-live-creative-mode-integration**,
**266-live-adventure-spectator-integration**, **267-live-hardcore-mode-integration**,
**268-ci-immutable-action-pins**, and **269-composed-game-dispose-worker-terminate**
stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 270 track.
- Changes 259 (18/18), 260 (19/19), 261 (16/16), 262 (14/14), 263 (15/15),
  264 (13/13), 265 (13/13), 266 (13/13), 267 (13/13), 268 (12/12), and 269 (12/12)
  stand **VERIFIED** and MUST NOT be reopened unless a leaf-loot regression
  blocks the 270 loot path. The 270 track changes no gameplay behavior beyond
  the probabilistic apple drop and performs no economy redesign.
- Change 270 (`270-leaf-apple-loot-probability`) is the sole **ACTIVE**
  implementation change: route leaf apple drops through the existing loot-table
  path (`src/inventory/LootTable.ts`) with a deterministic RNG hook at roughly
  vanilla-like rarity (about 1/200, 0.5% chance of 1 apple per leaf break),
  remove the guaranteed-apple special cases, preserve shears/silk-touch
  block-drop semantics without forcing an apple, update tests/fixtures from the
  guaranteed-apple assumption with fixed-rng proof tests, and close
  certification debt **R-2**.
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 270 track does not consume, waive, or re-litigate any 258 headed task.

## 271 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-12)

The product owner (Standing owner order, 2026-09-12 campaign instruction) authorized
activating and implementing OpenSpec change **271-statistics-panel-ui**
while Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes **259-enchanting-panel-ui**,
**260-live-brewing-stand-production-integration**, **261-gamerule-settings-ui**,
**262-recipe-book-ui**, **263-advancement-panel-ui**,
**264-item-xp-entity-persistence-hardening**, **265-live-creative-mode-integration**,
**266-live-adventure-spectator-integration**, **267-live-hardcore-mode-integration**,
**268-ci-immutable-action-pins**, **269-composed-game-dispose-worker-terminate**, and
**270-leaf-apple-loot-probability** stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 271 track.
- Changes 259 (18/18), 260 (19/19), 261 (16/16), 262 (14/14), 263 (15/15),
  264 (13/13), 265 (13/13), 266 (13/13), 267 (13/13), 268 (12/12), 269 (12/12),
  and 270 (12/12) stand **VERIFIED** and MUST NOT be reopened unless a
  statistics regression blocks the 271 player loop. The 271 track does not
  redesign the 187 key set and performs no economy or progression retune.
- Change 271 (`271-statistics-panel-ui`) is the sole **ACTIVE**
  implementation change: wire the verified headless `StatisticsFramework`
  (187) into the live Game — world-scoped `__statistics__` persistence with
  degrade-to-defaults and reset/archive passthrough, live counter increments
  from real gameplay events (walk distance, blocks broken, mob kills, deaths,
  damage taken, jumps, time played via play_tick on the fixed tick), and an
  in-game statistics panel (hotkey + HUD/pause entry, one-container rule)
  rendering `statisticsSnapshot` values with readable labels and live updates
  while open.
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 271 track does not consume, waive, or re-litigate any 258 headed task.

## 272 activation alongside BLOCKED 258 — owner-authorized parallel track (2026-09-12)

The product owner (Standing owner order, 2026-09-12 campaign instruction) authorized
activating and implementing OpenSpec change **272-lighting-clock-dt-sync**
while Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes **259-enchanting-panel-ui**,
**260-live-brewing-stand-production-integration**, **261-gamerule-settings-ui**,
**262-recipe-book-ui**, **263-advancement-panel-ui**,
**264-item-xp-entity-persistence-hardening**, **265-live-creative-mode-integration**,
**266-live-adventure-spectator-integration**, **267-live-hardcore-mode-integration**,
**268-ci-immutable-action-pins**, **269-composed-game-dispose-worker-terminate**,
**270-leaf-apple-loot-probability**, and **271-statistics-panel-ui** stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 272 track.
- Changes 259 (18/18), 260 (19/19), 261 (16/16), 262 (14/14), 263 (15/15),
  264 (13/13), 265 (13/13), 266 (13/13), 267 (13/13), 268 (12/12), 269 (12/12),
  270 (12/12), and 271 (14/14) stand **VERIFIED** and MUST NOT be reopened
  unless a lighting-clock regression blocks the 272 render path. The 272 track
  performs no gameplay/systems retune and changes no simulation behavior.
- Change 272 (`272-lighting-clock-dt-sync`) is the sole **ACTIVE**
  implementation change: use the same effective (clamped / frozen-aware) dt
  for both `worldSeconds` and sun rotation in `src/rendering/Lighting.ts`
  `update()`, preserving frozen-test behavior (245), with hitch-sized-dt unit
  proofs that clock phase and sun angle stay consistent, closing certification
  debt **R-9**.
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 272 track does not consume, waive, or re-litigate any 258 headed task.

## 273 activation alongside BLOCKED 258 — owner-authorized parallel track, FINAL campaign of the current chain (2026-09-12)

The product owner (Standing owner order, 2026-09-12 campaign instruction) authorized
activating and implementing OpenSpec change **273-chunksection-isempty-air-check**
while Change **258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes **259-enchanting-panel-ui**,
**260-live-brewing-stand-production-integration**, **261-gamerule-settings-ui**,
**262-recipe-book-ui**, **263-advancement-panel-ui**,
**264-item-xp-entity-persistence-hardening**, **265-live-creative-mode-integration**,
**266-live-adventure-spectator-integration**, **267-live-hardcore-mode-integration**,
**268-ci-immutable-action-pins**, **269-composed-game-dispose-worker-terminate**,
**270-leaf-apple-loot-probability**, **271-statistics-panel-ui**, and
**272-lighting-clock-dt-sync** stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 273 track.
- Changes 259 (18/18), 260 (19/19), 261 (16/16), 262 (14/14), 263 (15/15),
  264 (13/13), 265 (13/13), 266 (13/13), 267 (13/13), 268 (12/12), 269 (12/12),
  270 (12/12), 271 (14/14), and 272 (10/10) stand **VERIFIED** and MUST NOT be
  reopened unless a section-emptiness regression blocks the 273 chunk path.
  The 273 track performs no gameplay/systems retune and changes no simulation
  behavior.
- Change 273 (`273-chunksection-isempty-air-check`) is the sole **ACTIVE**
  implementation change: `ChunkSection.isEmpty()` is true iff the section is
  entirely air (single-palette whose only entry is `airId`); the `nonAirCount()`
  short-circuit and the mesher empty fast-path keep skipping true air sections
  and MUST NOT skip solid mono-block sections; unit proofs plus closure of
  certification debt **R-8** (isEmpty half; the brewing half was closed by 260).
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 273 track does not consume, waive, or re-litigate any 258 headed task.
- This is the **final owner-requested campaign of the current chain**: after
  273 is VERIFIED and published to `origin/main`, the session MUST STOP and
  MUST NOT author or activate any 274+ change.

## 274 activation alongside BLOCKED 258 — owner-authorized parallel track, 2026-09-13 campaign (274 through 277)

The product owner (Standing owner order, 2026-09-13, Minecraft Clone Dev /
Michael master directive) authorized activating and implementing OpenSpec
change **274-live-sleep-bed-integration** while Change
**258-real-world-runtime-performance-fps-recovery** remains **BLOCKED**
(headed hardware-WebGL certification deferred) and Changes
**259-enchanting-panel-ui**, **260-live-brewing-stand-production-integration**,
**261-gamerule-settings-ui**, **262-recipe-book-ui**,
**263-advancement-panel-ui**, **264-item-xp-entity-persistence-hardening**,
**265-live-creative-mode-integration**, **266-live-adventure-spectator-integration**,
**267-live-hardcore-mode-integration**, **268-ci-immutable-action-pins**,
**269-composed-game-dispose-worker-terminate**, **270-leaf-apple-loot-probability**,
**271-statistics-panel-ui**, **272-lighting-clock-dt-sync**, and
**273-chunksection-isempty-air-check** stand **VERIFIED**.

- This 2026-09-13 master directive **supersedes** the 273 section's
  "final campaign / STOP / no 274+" clause: the owner re-authorized a
  parallel track running **274 through 277**. Each change in that track
  still gets its own activation section here as it is activated.
- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral
  intact. No headed FPS work is touched, no GPU evidence is faked, and 258
  MUST NOT be marked VERIFIED by the 274 track.
- Changes 259 (18/18), 260 (19/19), 261 (16/16), 262 (14/14), 263 (15/15),
  264 (13/13), 265 (13/13), 266 (13/13), 267 (13/13), 268 (12/12), 269 (12/12),
  270 (12/12), 271 (14/14), 272 (10/10), and 273 (10/10) stand **VERIFIED**
  and MUST NOT be reopened unless a sleep/bed regression blocks the 274
  integration path. The 274 track performs no gameplay/systems retune beyond
  the bed/sleep integration itself and changes no unrelated simulation
  behavior.
- Change 274 (`274-live-sleep-bed-integration`) is the sole **ACTIVE**
  implementation change: wire the verified headless `SleepFramework` (198)
  into the live Game — a placeable bed block + bed item, the bed use
  interaction path running `enterBed`/`leaveBed` (occupied rejection,
  night/storm `canSleep` gating), world-scoped `__sleep__` persistence
  (versioned, degrade-to-defaults, reset/archive passthrough), respawn at the
  `SleepFramework` spawn point when set (hardcore permanent death still
  wins), minimal toast/HUD sleep feedback (original assets only), unit +
  browser E2E (place/use bed → sleeping/spawn set → leave → reload persists
  spawn → respawn lands at bed).
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL
  host; the 274 track does not consume, waive, or re-litigate any 258 headed
  task.

## 275 activation (2026-09-14, 274–277 campaign; 258 BLOCKED; 275 sole ACTIVE)

Owner (Michael via Minecraft Clone Dev) authorizes Change **275-live-weather-cycle-integration** as the sole ACTIVE implementation change while **258** remains **BLOCKED**. Changes **259–274** stand **VERIFIED** and MUST NOT be reopened unless a regression blocks 275. Campaign continues through **277** only — no Changes 1–277 audit. Session start head for 275: `f872c88` (274 published tip).


## 276-boss-bar-hud-parity (owner-authorized 2026-09-14)

Authorize Change 276 as sole ACTIVE while Change 258 remains BLOCKED.
Last completed: 275-live-weather-cycle-integration VERIFIED.
Campaign through 277; no 1–277 audit.

## 277-live-ambient-audio-integration (owner-authorized 2026-09-14)
Authorize Change 277 as sole ACTIVE while 258 remains BLOCKED. Last completed: 276. Stop after VERIFIED publish; no 1–277 audit.

## Published outcome — 2026-09-16 release-readiness hardening

Changes 274–277 are VERIFIED in repository state. The post-277 release-readiness
follow-up corrected interaction cooldown handling, stabilized browser evidence,
fixed the HUD control stack, refreshed the 60-cell visual baselines, and passed
the complete local validation matrix. Change 258 remains BLOCKED pending the
owner-deferred headed hardware-WebGL certification; no GPU evidence was fabricated.

## 278 activation alongside BLOCKED 258 — standing owner order 2026-09-19 campaign through 300

The product owner (Standing owner order + Master directive 2026-09-19, clone-MC_v3
OpenSpec development through Change 300) authorized activating and implementing OpenSpec change
**278-live-villager-trading-ui** while Change **258-real-world-runtime-performance-fps-recovery**
remains **BLOCKED** (headed hardware-WebGL certification deferred) and Changes
**259–277** stand **VERIFIED**.

- Change 258 status stays **BLOCKED** at 40/100 with its existing deferral intact.
  No headed FPS work is touched, no GPU evidence is faked, and 258 MUST NOT be
  marked VERIFIED by the 278 track.
- Changes 259–277 stand **VERIFIED** and MUST NOT be reopened unless a trading
  regression blocks the 278 player loop. The 278 track performs no gameplay/systems
  retune beyond the trading-post integration itself and changes no unrelated
  simulation behavior.
- At activation, Change 278 (`278-live-villager-trading-ui`) was the sole
  **ACTIVE** implementation change; it is now **VERIFIED 12/12** after wiring the
  verified headless `VillagerTrading` (151) +
  `VillagerProfession` (150) catalog into the live Game as a trading-post UI —
  world-scoped per-profession trade states with versioned `__trades__` persistence
  (degrade-to-defaults, reset/archive passthrough), new `emerald`/`bread`/`paper`
  item defs completing the 151 catalog, inventory-atomic apply through the 151
  pure core with level-up offer unlocks, `TradingPanel` + HUD/KeyT shell under the
  one-container rule, unit + browser E2E (open→trade→reload-preserves + lifecycle).
  No village generation, no villager entity spawning, no workstation POI claiming
  live, no gossip/restock timers.
- Change 258 remains recorded BLOCKED and resumable on a hardware-WebGL host;
  the 278 track does not consume, waive, or re-litigate any 258 headed task.
- Campaign continues sequentially 279→300 per the 2026-09-19 master directive;
  each change gets its own activation section as it is activated.

## 279-shield-live-wiring activation — sequential non-GPU continuation

Change **279-shield-live-wiring** is the sole **ACTIVE** implementation change after
published Change 278. It is authorized to wire the verified headless
`ShieldBlocking` contract (144) into the live player loop while Change **258** remains
**BLOCKED** and Changes **259–278** remain **VERIFIED**.

- 279 MUST remain limited to the shield item/offhand/use path, directional blocking
  at existing hostile and wither damage chokes, durability/break and axe-disable
  cooldown behavior, HUD feedback, tests, and state/matrix evidence.
- Inventory snapshots already carry equipment and durability; no new persistence
  namespace or migration is permitted. Unknown/malformed inventory data keeps the
  existing fail-closed restore behavior.
- No village/workstation/raid expansion, headed FPS work, GPU evidence, or 258
  status change is part of 279.
- 258 stays BLOCKED, and the next change after 279 is reserved as
  `280-death-respawn-ui`.

## 279-shield-live-wiring — VERIFIED and published (2026-09-19)

Change 279 completed all 12 tasks and is VERIFIED. The implementation tip is
`a9b7108` (`feat: ship live shield wiring (change 279)`); the live shield
catalog, offhand/use path, source-aware blocking, durability/break, axe
cooldown, HUD, inventory snapshot reuse, and unit/browser evidence are
complete. The full browser gate passed under the repository's configured
`CI=1` retry policy (98 direct passes plus 2 flaky-after-retry outcomes; 60/60
visual cells). Change 258 remains BLOCKED, Changes 259–278 remain VERIFIED,
and `280-death-respawn-ui` is the next sequential change.

## 280-death-respawn-ui activation — sequential non-GPU continuation

Change **280-death-respawn-ui** is now the sole **ACTIVE** implementation
change after published Change 279. It is authorized to add a player-visible
death/respawn card over the existing synchronous normal respawn, bed-spawn,
and hardcore-spectator rules. Changes **258** remains **BLOCKED** and
**259–279** remain **VERIFIED**.

- 280 MUST remain presentation-focused: carry the existing damage reason into
  a fail-safe label, show normal respawn versus hardcore spectator outcome,
  support an idempotent dismiss action, and preserve the existing one-container
  and pointer/input lifecycle.
- No death/respawn persistence namespace, new death simulation, deferred
  respawn semantics, new hardcore/bed rule, headed FPS/GPU work, or 258 status
  change is part of 280.
- The next sequential slot is reserved as `281-workstation-ui` for a later
  spec-first decision after 280 is VERIFIED.

## 280-death-respawn-ui — VERIFIED and published (2026-09-19)

Change 280 completed all 10 tasks and is VERIFIED. The implementation tip is
`b5265b8` (`feat: ship live death respawn presentation (change 280)`): the
existing death reason now reaches a closed safe mapper, normal and hardcore
outcomes render through a transient DOM card, dismissal and pointer/container
lifecycle are idempotent, and no persistence namespace was added. Full gates
passed: typecheck, lint (0 errors/85 existing warnings), 442-file unit
5243 passed + 1 skipped, build 244 modules, exact full E2E 102/102 with the
60-cell visual matrix, reviewed file-audit 2862, and validate-state. The
dedicated 259–279 browser regression had one known software-WebGL spectator
threshold variance, while the exact full suite passed all 102 tests including
the affected journeys. Change 258 remains BLOCKED; Changes 259–279 remain
VERIFIED; `281-workstation-ui` is the next sequential spec-first change.

## 281-workstation-ui activation — sequential non-GPU continuation

Change **281-workstation-ui** is now the sole **ACTIVE** implementation change
after published Change 280. It is authorized to add one player-placed smoker
workstation over the verified furnace state/menu/block-entity seams while
Change **258** remains **BLOCKED** and Changes **259–280** remain **VERIFIED**.

- 281 MUST remain limited to smoker registry identity, the twice-fast
  furnace-context wrapper, `smoker` block-entity lifecycle, shared
  station-labelled furnace UI, save/reload/break lifecycle, tests, and exact
  state/parity evidence.
- Smoker records MUST reuse the existing `block-entities` envelope and schema;
  no `__smoker__` namespace, villager workstation POI claiming, villager
  spawning, raid wiring, or unrelated simulation retune is authorized.
- No headed FPS/GPU work, fake GPU evidence, or Change 258 status change is
  part of 281. Existing furnace, brewing, shield, trading, and death/respawn
  behavior remains the regression boundary.
- The next sequential slot is reserved as `282-live-raid-feedback` for a
  separate spec-first decision after 281 is VERIFIED; it is not implemented by
  this change.

## 281-workstation-ui — ACTIVE control-plane checkpoint (2026-09-19)

The complete 281 OpenSpec package is present under
`openspec/changes/281-workstation-ui/` and passed the pre-implementation
authoring review. 281 is 0/12 ACTIVE pending implementation. Change 258
remains BLOCKED and Changes 259–280 remain VERIFIED.

## 281-workstation-ui — VERIFIED publication checkpoint (2026-09-19)

Change **281-workstation-ui** is VERIFIED at **12/12 (100%)** with exact
parity status and implementation tip `cf0c2e3`. The live player-placed smoker
uses block 64/item 72, the existing furnace state/menu and block-entity archive
envelope, and the delegated twice-fast cooking context. Final typecheck, lint
(0 errors/85 existing warnings), full unit (5,260 passed + 1 skipped), build
(246 modules), focused smoker E2E (2/2), file-audit (2,873 rows), and
validate-state passed. The exact full E2E scheduled 104 tests and passed 103;
the sole failure is the pre-existing Linux software-WebGL `hud/high/1280x720`
golden drift (changed fraction `0.027805989583333333`), with no 281 functional
failure. Change 258 remains BLOCKED, Changes 259–281 remain VERIFIED, and
`282-live-raid-feedback` is the next sequential spec-first change. No headed
FPS/GPU evidence is claimed.

## 282-live-raid-feedback activation — sequential non-GPU continuation

Change **282-live-raid-feedback** is now the sole **ACTIVE** implementation
change after published Change 281. Its complete OpenSpec package is present at
`openspec/changes/282-live-raid-feedback/` and is authorized to make the
verified headless RaidStateMachine visible through one ephemeral Game-owned
raid feedback bar.

- 282 MUST remain limited to the pure feedback projection, Game fixed-tick
  ownership, active/terminal HUD state, deterministic test seams, lifecycle
  coverage, and exact state/parity evidence.
- No raider entity spawning, village/settlement detection, bad-omen acquisition,
  raid persistence/archive namespace, combat retune, headed FPS/GPU work, or
  Change 258 status change is authorized.
- Existing wither boss-bar, smoker, furnace, brewing, shield, trading, and
  death/respawn behavior remains the regression boundary.
- The next sequential slot is reserved as `283-live-raid-persistence` for a
  separate spec-first decision after 282 is VERIFIED; it is not implemented by
  this change.

## 282-live-raid-feedback — ACTIVE control-plane checkpoint (2026-09-19)

The 282 package passed the pre-implementation authoring review. 282 is 0/10
ACTIVE pending production implementation. Change 258 remains BLOCKED and
Changes 259–281 remain VERIFIED.

## 282-live-raid-feedback — VERIFIED publication checkpoint (2026-09-23)

Published implementation + verification tip: `f0e022c798b3452a1a2a47a85cd0e493e952fe5e`
(`origin/main`, local == remote verified after push from session start
`3b60c6e38666acfde752dc40d7e12bba2ed1d164`).

Change **282-live-raid-feedback** is VERIFIED at **10/10 (100%)** with exact
parity status. The Game-owned ephemeral raid state drives a pure bounded
`RaidFeedbackView` projection into one hidden-by-default accessible
`#raid-feedback` bar, with deterministic start/tick/clear/replay seams over the
verified `RaidStateMachine` and no raider entity, settlement, persistence, or
headed-GPU work. Final typecheck, lint (0 errors/85 existing warnings), full
unit (447 files, 5,278 passed + 1 skipped), build (existing chunk-size advisory
only), focused raid-feedback E2E (4/4), file-audit (2,882 rows), and
validate-state passed. The exact full E2E scheduled 108 tests and passed 107;
the sole failure is the Linux SwiftShader visual matrix, proven baseline-
equivalent by a disposable worktree at pristine published tip `722f007`
(without 282 working-tree Game/index/styles changes): identical 30 fail / 30
pass cell set with matching changed fractions. Change 258 remains BLOCKED,
Changes 259–282 remain VERIFIED, and `283-live-raid-persistence` is the next
sequential spec-first change. No headed FPS/GPU evidence is claimed.

## 283-live-raid-persistence — reserved checkpoint (2026-09-23)

The next sequential slot remains reserved as `283-live-raid-persistence`. A
prepared worktree exists at `/workspace/mc-worktrees/283` (branch
`wt/283-live-raid-persistence`); it is a handoff target only. This session does
NOT activate, author, or implement 283. A fresh session must activate 283 via
its own T1 control-plane step from published VERIFIED 282. Change 258 stays
BLOCKED.

## 283-live-raid-persistence activation — sequential non-GPU continuation (after 282 VERIFIED)

The product owner (Standing owner order, campaign through 300) authorizes activating
**283-live-raid-persistence** as the sole ACTIVE implementation change after published
Change **282-live-raid-feedback** is VERIFIED, while Change **258** remains **BLOCKED** and
Changes **259–282** remain **VERIFIED**.

- Change 258 stays BLOCKED at 40/100; no headed FPS/GPU work, no fake GPU evidence, and 258
  MUST NOT be marked VERIFIED by the 283 track.
- Changes 259–282 stand VERIFIED and MUST NOT be reopened unless a raid-persistence regression
  blocks the 283 path. 282's ephemeral feedback projection and `getRaidState()` contract are
  preserved byte-for-byte; 283 only adds the durable store behind that seam.
- Change 283 (`283-live-raid-persistence`) is authorized to: persist Game-owned `RaidState`
  under world-scoped `__raid__:<worldId>` via `serializeRaid`/`deserializeRaid`; hydrate and
  save at boot/autosave/dispose/pagehide with existing persistence guards; delete on reset;
  carry optional `raidData` through `WorldArchive`/`WorldArchiver` with fail-closed pre-write
  validation; degrade corrupt runtime payloads to null without partial writes; and prove
  reload/reset/archive behavior with unit + browser E2E.
- 283 MUST NOT register or spawn raider entities, detect settlements, acquire bad omen,
  redesign 282's HUD, or perform Change 258 headed work.
- Package source: `openspec/changes/283-live-raid-persistence/` (authored on
  `wt/283-live-raid-persistence` as SPEC-FIRST draft; live control-plane files are edited only
  at activation).

## 283-live-raid-persistence — VERIFIED publication checkpoint (2026-09-23)

Change **283-live-raid-persistence** is VERIFIED at **13/13 (100%)** with exact C283
parity and full local gates green: typecheck, lint (0 errors / 85 existing warnings),
full unit 449 files 5351 passed + 1 skipped, build, file-audit 2892 rows (sha
`75d564f6…`), validate-state, and exact `npm run test:e2e` (112 scheduled, 110 passed;
enchanting:227 transient flake proven by isolated re-run 2/2 PASS; visual:176 proven
baseline-equivalent Linux SwiftShader golden drift — 30 fail/30 pass matching two
independent baselines, one-cell swap, 25/30 fractions byte-identical; all raid E2E green).

- Session start: `a463e0fe8571576fc10a5bda49dead34b0eac61a`; published_head is recorded
  in `openspec/PROGRAM_STATE.json` after the final push to `origin/main`.
- Change 258 remains BLOCKED at 40/100 (no headed FPS/GPU work, no fake GPU evidence).
- Changes 259–283 remain VERIFIED and are not reopened.
- The next sequential slot is `284-raider-entity-spawning`, reserved for a separate
  control-plane activation from published VERIFIED 283; it is NOT implemented by the
  283 track (owner rule: no 284 until 283 published — satisfied at publication).
