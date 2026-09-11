# Proposal: 263-advancement-panel-ui

## Problem

The advancement meta-progression core is verified but player-invisible:
`AdvancementFramework` (185) and `CoreProgressionAdvancements` (186) are pure,
headless, and additive/unconsumed — no `Game.ts` consumer exists, no trigger
ever fires in live play, and no persistence path stores progress. A player can
craft a wooden pickaxe, yet `minecraft:stone_age` never completes and no UI
shows the seven core advancements. Certification risk R-4 additionally names
the `AdvancementFramework` deserializer as under-validating (duplicate/invalid
payloads do not fail closed).

## Goals

- Ship an in-game advancements panel over the existing 185/186 seam: openable
  UI listing the 7 core progression advancements with title, description, and
  progress/completion state.
- Wire triggers into live play: item-obtain choke points (item-entity pickup,
  crafting output incl. the recipe-book craft path) fire `obtain_item`; a
  public typed `fireAdvancementTrigger` seam carries `dimension_enter`,
  `boss_defeat`, and `kill_mob` sources (no live producers exist for those
  three yet — documented, not faked).
- Live progress updates: an open panel re-renders on trigger; each new
  completion toasts `Advancement made: <title>` exactly once.
- Persist progress across save/reload via a new world-scoped
  `__advancements__:<worldId>` raw record with degrade-to-defaults, 257-reset
  deletion, and archive passthrough.
- Harden deserialization (R-4 advancement half): a catalog-aware batch
  validator rejects duplicate keys, unknown keys, length mismatches, and
  achieved/tick inconsistencies fail-closed (single throw, nothing accepted).
- Prove with unit tests plus browser E2E: open panel → see defs →
  complete one criterion through the real craft path plus one via the harness
  seam → UI reflects completion → reload persists.

## Non-goals

- Multiplayer advancement sync (222+ transport scope; single-player save model
  only, gamerule/recipe-book precedent).
- A JE-scale advancement tree beyond the 186 core progression pack (new
  definitions are later content changes, not this UI change).
- Live producers for `dimension_enter`/`boss_defeat`/`kill_mob` (no Nether/End
  travel, no live dragon fight, no player-attributed mob kills exist in
  single-player play today; the seam is specified and harnessed, the producers
  are explicitly deferred — inventing fake dimension travel to "complete" them
  is forbidden).
- 258 headed FPS certification (BLOCKED track untouched; no GPU work, no
  VERIFIED claim on 258).
- Reopening 259/260/261/262 unless an advancement regression blocks the 263
  player loop.

## Preconditions

- 185 `src/simulation/AdvancementFramework.ts` VERIFIED (typed criteria,
  immutable progress, versioned single-record persistence).
- 186 `src/simulation/CoreProgressionAdvancements.ts` VERIFIED (7-def chain,
  `stone_age` obtain wooden_pickaxe … `free_the_end` boss_defeat ender_dragon).
- 259/260/261/262 panel, shell, lifecycle, persistence, and E2E-harness
  patterns available to mirror (never forked).
- `origin/main` at `fe23ac8e19614b6e2a304d19157f2568541ddfed`; 258 BLOCKED
  with owner authorization recorded in `CHANGE_SEQUENCE_OVERRIDES.md`.

## Dependencies

- 185/186 (headless seam, untouched — no signature changes).
- 204/262 persistence precedent (`WorldMetadataRepository` raw namespace,
  `GamePersistence` bulk-load, `WorldArchive` optional passthrough).
- `ItemTypeRegistry.getByLegacyId` for numeric-id → string-key obtain mapping.
- `CraftingPanel` one-click craft buttons (`button[data-recipe]`) for the E2E
  real-craft path.

## Proposed change

1. `src/simulation/AdvancementSave.ts` (new): versioned batch envelope
   `{version: 1, advancements: [...]}`, `serializeAdvancementSave`,
   catalog-aware `deserializeAdvancementSave` (R-4 hardening: dup/unknown/
   length/consistency rejection, fail-closed), `createDefaultAdvancementProgresses`,
   and pure fan-out `applyTriggerToProgresses` returning `{progresses, completedKeys}`.
2. `src/simulation/AdvancementView.ts` (new): pure headless row views —
   `describeAdvancement(def, progress)` with criterion-derived English
   descriptions (`describeAdvancementCriterion`), counts, and completion flag.
3. `Game` owns catalog-order `AdvancementProgress[]`, exposes
   `getAdvancementRows()` / `fireAdvancementTrigger(trigger)` /
   `isAdvancementOpen()`, fires obtain triggers at the item-entity pickup
   callback + `onCrafted` + recipe-book craft success, toasts each new
   completion exactly once, persists on change, and runs the standard
   open/close/upkeep/blur/death/dispose lifecycle.
4. `src/ui/AdvancementPanel.ts` (new): deps-bound dialog controller
   (signature-gated render, fail-fast ids, `aria-live` status), no panel-owned
   state.
5. Shell: HUD chip `#advancements-open` + `#advancements` dialog +
   `advancement-*` styles (original CSS only, no binaries).
6. Persistence: `__advancements__:<worldId>` raw record, bulk-load with
   degrade-to-defaults, reset deletion, archive optional passthrough.
7. Tests: 5 unit suites + 2 browser E2E specs (journey + lifecycle).

## Compatibility and migration

- New raw record only; old saves boot with default (all-unachieved) progress.
- `WorldArchive.advancementData` OPTIONAL (missing → null on import; export
  writes when present) — v1/v2 archives without it import cleanly.
- No 185/186/network/registry format changes. No new IndexedDB stores, no
  version bumps (raw-record precedent).

## Risks

- Catalog item keys `iron_pickaxe`/`diamond` have no live item definitions, so
  `iron_tools`/`diamonds` cannot complete through obtain wiring today —
  accepted and documented (panel shows them incomplete; future content changes
  may add the items). No synthetic completion is manufactured.
- Trigger fan-out runs per pickup/craft event: O(defs × criteria) = O(7 × 1),
  negligible; no per-tick work.
- Toast exactly-once relies on the fan-out identity rule (completed defs are
  no-ops) — pinned by unit test.

## Rollback strategy

Delete the panel/shell/wiring call sites (Game falls back to no-advancement
behavior; the raw record is inert without a reader); old saves unaffected
(unknown raw records are ignored by older code paths that never query the
key).

## Definition of Done

- Panel opens from live play, lists all 7 core advancements with
  title/description/progress, and reflects completions live.
- Real-craft completion (`stone_age` via one-click crafting) and harness-seam
  completion (`enter_the_nether` via `fireAdvancementTrigger`) proven in
  browser E2E; reload preserves progress field-for-field.
- R-4 advancement half closed: batch deserializer rejects every malformed
  class fail-closed with unit proof; risk register narrowed.
- Full gates green: typecheck, lint (0 errors), unit, build, E2E, file-audit,
  validate-state. PARITY_MATRIX C263 row exact. 258 still BLOCKED, 259–262
  still VERIFIED.

## Advancement gate

Target 100% (15/15). Floor 90% only via an explicit Advancement Exception
proving every incomplete task non-blocking with no MUST/SHALL unverified.
Required tests must pass; no data-loss/determinism/compatibility blocker may
remain open.
