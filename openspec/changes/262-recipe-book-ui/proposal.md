# Proposal: 262-recipe-book-ui

## Problem

The known-recipes knowledge layer (`src/inventory/RecipeBook.ts`, change 204,
VERIFIED) is headless-only: no in-game surface exists to view known recipes,
search them, preview ingredient placement, or craft from the book. Known
recipes are not persisted with the world, and no gameplay event unlocks
anything — `CraftingSystem.craft()` and `Game.onCrafted()` never touch the
book, so a player-facing recipe book cannot fill through normal play. The
crafting UI (`CraftingPanel`, one-click list over `CraftingSystem`) shows every
registry recipe with no knowledge gating and no ingredient-layout preview.

## Goals

- Ship an accessible in-game recipe book UI over the existing 204 helpers:
  known-recipe list via `searchRecipes` (blank query = all known, registry
  order), case-insensitive key/name/output filtering, selection detail showing
  the `layoutRecipe` 3x3 ingredient grid with per-ingredient have/missing
  accounting, and a Craft action that crafts only when affordable.
- Open the book from the crafting UI: a "Recipe book" button inside the
  `#crafting` dialog opens the `#recipebook` dialog (one-container rule: the
  crafting panel closes first, mirroring 259/260/261).
- Crafting from the book is transactional: affordable selections craft through
  `CraftingSystem.craft` (ingredients removed only after both checks pass);
  unaffordable selections are a status-surfaced no-op — the inventory is never
  corrupted, never partially consumed.
- Persist the known set with the world save path already used by the game
  (IndexedDB metadata-store raw namespace, gamerule precedent from 261), so
  unlocks survive unload/reload; corrupt payloads fall back to the empty book
  without breaking boot.
- Unlock triggers that keep the book live without new simulation systems:
  (R1) every successful craft through `Game` unlocks that recipe key;
  (R2) opening the book unlocks every registry recipe currently craftable with
  the player's inventory (craftable-discovery). The book persists as an empty
  set, but the first open in a live world already discovers whatever the spawn
  inventory affords (glass, gravel, cobblestone with the default spawn kit —
  observed in browser E2E), so it is effectively never empty after its first
  open through normal play. Both rules are documented in design.md and the
  capability spec.
- Prove the loop with unit tests plus a browser E2E journey:
  open book → search → select → craft works → pagehide+reload → known set
  preserved.
- Original assets only (`.html`/`.css`/`.ts`, no binaries).

## Non-goals

- Multiplayer recipe-book replication or server-authoritative unlock sync
  (222–237 own the transport; no 262 codec or message changes).
- Change-258 headed FPS certification (258 stays BLOCKED; no headed work, no
  GPU evidence, 258 is never marked VERIFIED by this track).
- Reopening 259, 260, or 261 (all stay VERIFIED unless a recipe-book
  regression blocks this player loop).
- Redesigning the 204 `RecipeBook` or the 103/010 `RecipeRegistry`
  (unlock/search/layout/serde semantics are fixed; the UI renders whatever the
  registry returns).
- A JE-pixel-parity recipe book (ghost-placement into a visible 3x3 grid,
  recipe alternatives pagination, furnace-recipe tabs): the live crafting UI
  is the one-click `CraftingPanel`, so the book previews the laid-out grid and
  crafts in one click rather than moving ghost stacks into grid slots.
- New simulation systems (no pickup-event plumbing, no advancement/statistics
  hooks: R1/R2 reuse the existing craft path and inventory counts only).
- A separate crafting-table 3x3 screen: no live 3x3 table UI exists
  (`CRAFTING_TABLE_BLOCK_ID` is referenced only by `CraftingTable.ts`
  itself); the `and/or` entry requirement is satisfied through the inventory
  crafting flow (C key → `#crafting` → recipe-book button).

## Preconditions

- `origin/main` at session start `c9ae063c6ceeec6e5fe66bb0f83d8099f6093e2b`
  (fetched; local HEAD equals remote).
- Change 258 BLOCKED at 40/100 (headed hardware-WebGL deferred by owner);
  changes 259 (18/18), 260 (19/19), 261 (16/16) VERIFIED.
- 262 authorized as the sole ACTIVE implementation change by the standing owner
  order and `CHANGE_SEQUENCE_OVERRIDES.md`.

## Dependencies

- 204 `RecipeBook` (known state, identity unlocks, known-only registry-order
  search, `layoutRecipe`/`compactGrid`, versioned validate-before-accept
  serde).
- 010/103 `RecipeRegistry` + `CraftingSystem` (transactional one-click craft,
  tag-ingredient resolution) and the `ItemTypeRegistry` for display/counts.
- 261 persistence precedent (raw `__gamerules__:<worldId>` metadata namespace
  + `GamePersistence` bulk-load/save + reset deletion + `WorldArchive` /
  `WorldArchiver` passthrough).
- 259/260/261 panel + shell + lifecycle patterns (`EnchantingPanel`,
  `BrewingPanel`, `GameRulePanel`, `index.html` dialog blocks, `InputManager`
  toggle queue, one-container rule, walk-away/blur/death/dispose handling).

## Proposed change

1. Persistence: `WorldMetadataRepository.getRecipeBookData/putRecipeBookData`
   under `__recipebook__:<worldId>`; `GamePersistence.open()` bulk-load
   beside the 261 hydration (null → absent; non-null →
   `deserializeRecipeBook` in try/catch → empty book + recorded error);
   `initialRecipeBook` getter + `saveRecipeBook(payload)` fire-and-forget
   with recorded errors; 257 reset path deletes the raw key;
   `WorldArchive.recipeBookData` OPTIONAL (missing → null) +
   `WorldArchiver` export/import passthrough.
2. `Game` owns a `RecipeBookState` (init from validated persistence else
   `createDefaultRecipeBook()`): `getRecipeBook()` / `isRecipeBookOpen()` /
   `openRecipeBook()` (R2 discovery unlock + persist when changed) /
   `closeRecipeBook()` / `selectRecipeBookRecipe(key|null)` /
   `craftRecipeBookSelection()` (transactional craft + R1 unlock + persist);
   selection detail (laid-out cells + have/missing + canCraft) computed by a
   pure helper over the registry + inventory counts.
3. `src/ui/RecipeBookPanel.ts`: pure view over `Game` getters (no owned book
   state; only a status line is local), accessible dialog (search
   `<input type=search>` with label, result list buttons with
   `data-recipebook-recipe`, 3x3 layout preview grid, have/missing line, Craft
   button, status line `aria-live=polite`, close button). Opened from the
   `#crafting-recipebook-open` button inside the crafting dialog; closed by
   its own close button, `C` (one-container rule), death, and `dispose()`.
4. Shell: `index.html` `#recipebook` dialog block + `#crafting-recipebook-open`
   button in `#crafting` + `src/styles.css` `recipebook-*` styles (additive
   only).
5. Tests: `RecipeBookPanel` unit (FakeElement harness), `RecipeBookPersistence`
   unit (round-trip, corrupt fallback, reset deletion, archive passthrough),
   wiring unit (R1/R2 unlock rules, selection have/missing edges, craft
   no-corruption on missing),
   `tests/e2e/recipebook.spec.ts` journey (open → search → select → craft →
   reload-preserves) + lifecycle (close paths, missing-ingredient no-op,
   blur-kept).

## Compatibility and migration

- New raw record: old saves simply have no `__recipebook__` key and boot with
  the empty book (forward-compatible by absence). Corrupt payloads degrade to
  the empty book with a recorded persistence error; boot never throws.
- `WorldArchive` gains an OPTIONAL `recipeBookData` field (v1 and v2 archives
  without it import as null); export writes it when present.
- No registry, block/item, worldgen, or network format changes. No 204
  semantics changes. Default (empty) book changes no existing behavior:
  `CraftingPanel` keeps showing all registry recipes; crafts that previously
  succeeded still succeed with identical inventory effects (plus an unlock
  side-effect that only grows the known set).

## Risks

- E2E flakiness on shared runners (mitigate with the 259/260/261 harness
  shape: single worker, seeded world, inventory granted through test hooks,
  deterministic craft assertions, no timing dependence).
- Scope creep into JE parity (ghost placement, alternatives UI, furnace tabs)
  (mitigate: explicit non-goals above; any such request belongs to a later
  numbered change).
- Tag-ingredient have/missing display diverging from craft resolution
  (mitigate: display reuses the same first-member-with-stock resolution as
  `CraftingSystem`; craft itself stays transactional so display drift can
  never corrupt the inventory).

## Rollback strategy

Revert the 262 commit range on `origin/main` (normal history-preserving
revert). Persistence is additive (a dormant raw record); pre-262 builds ignore
it. No migration to unwind.

## Definition of Done

- The recipe book opens from the crafting UI and lists known recipes;
  blank search shows all known in registry order; non-blank search filters by
  key/name/output through `searchRecipes`.
- Selecting a known recipe shows its `layoutRecipe` grid with have/missing
  accounting; Craft crafts when affordable and is a status-surfaced no-op
  otherwise, with the inventory provably unchanged on failure.
- Known recipes persist across pagehide + reload; corrupt store degrades to
  the empty book.
- R1 (craft unlock) + R2 (craftable-discovery on open) fire and persist; the
  documented rule keeps the book non-permanently-empty through normal play.
- Unit + browser E2E journey green; full baseline gates green
  (typecheck/lint/unit/build/e2e); `validate-state` PASS; C262 matrix row
  exact; 262 VERIFIED and published to `origin/main`.

## Advancement gate

100% tasks (T1–T14) plus all MUST/SHALL verified and all required gates green.
Floor 90% only via an explicit Advancement Exception proving every incomplete
task is non-blocking and implements/verifies no MUST/SHALL; no unresolved
data-loss/corruption/determinism/compatibility/security/regression blocker.
258 is not VERIFIED by this track under any circumstance.
