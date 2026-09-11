# Design: 262-recipe-book-ui

## Context/current state

- `src/inventory/RecipeBook.ts` (204, VERIFIED) is pure/headless and
  additive/unconsumed: no `Game.ts` consumer exists. API: `RecipeBookState`
  (`known` keys in unlock order), `createDefaultRecipeBook()`,
  `unlockRecipe`/`unlockRecipes` (identity no-ops), `hasRecipe`,
  `searchRecipes(registry, state, query)` (known-only, registry order, blank =
  all known, case-insensitive key/name/output, unknown keys skipped),
  `layoutRecipe(ingredients)` (compacted row-major 9-cell grid, `>9` throws),
  `compactGrid` (exact inverse), `serializeRecipeBook` /
  `deserializeRecipeBook` (version 1, validate-before-accept, descriptive
  throws, unknown-key rejection).
- Live crafting UI is `src/ui/CraftingPanel.ts` over `CraftingSystem`
  (`src/inventory/Crafting.ts`): one-click list; `craft(id)` is transactional
  (unknown/unaffordable/no-output-capacity → null, inventory unchanged).
  `Game.openCrafting()` (`src/engine/Game.ts:2203`) / `closeCrafting()`
  (`:2216`) / `onCrafted()` (`:2226`, toast+render only). C toggle
  (`:1408`) implements the one-container rule across furnace/brewing/
  enchanting/gamerule/crafting. No live 3x3 table UI exists.
- Persistence precedent (261): `WorldMetadataRepository` raw record
  `__gamerules__:<worldId>` (`getGameRuleData` `:180` / `putGameRuleData`),
  `GamePersistence` bulk-load + `saveGameRules` + reset deletion (`:825`),
  `WorldArchive.gameruleData` OPTIONAL + `WorldArchiver` passthrough (`:155`).
- Panel precedent: constructor `(el, deps)` + `show/hide/isVisible` via
  `.hidden` + `requireElement` fail-fast + `onClose` dep + signature-gated
  render; `Game` open (close other containers first, release lock, hide
  overlay/crosshair/hud/hotbar) / close / per-frame upkeep / blur-keep /
  death+dispose close. `GameRulePanel` owns no rule state (only a status
  line); the 262 panel follows that split.
- No unlock triggers exist: `CraftingSystem.craft` and `Game.onCrafted` never
  call `unlockRecipe`; no advancement/statistic hook fires on craft.

## Target state

- `Game` owns `recipeBook: RecipeBookState` + transient
  `recipeBookQuery: string` + `selectedRecipeKey: string | null`, a
  `RecipeBookPanel` bound to a `#recipebook` dialog, and a "Recipe book"
  button (`#crafting-recipebook-open`) inside `#crafting` that opens the book
  (closing crafting first).
- Selecting a known recipe shows its laid-out ingredient grid with
  have/missing per cell and an always-enabled Craft button (unaffordable =
  status-surfaced no-op, so the failure path stays reachable by real clicks
  and browser E2E); crafting
  routes through `CraftingSystem.craft` (transactional) and unlocks + persists
  (R1). Opening the book runs craftable-discovery (R2) and persists when the
  known set grows.
- The known set persists under `__recipebook__:<worldId>` with
  degrade-to-empty, reset deletion, and archive passthrough.
- `tests/e2e/recipebook.spec.ts` proves open → search → select → craft →
  reload-preserves, plus lifecycle.

## Invariants

- I1: `Game.recipeBook.known` holds unique non-empty keys in unlock order
  (204's invariant; Game only mutates via `unlockRecipe(s)`).
- I2: The panel renders exclusively through `searchRecipes` (blank query =
  all known, registry order); it never lists unknown recipes.
- I3: Crafting from the book calls `CraftingSystem.craft` exactly once per
  user action; on `null` the inventory is byte-identical before/after (the
  104/106 transaction guarantee, pinned by a unit test).
- I4: Persistence writes only validated `serializeRecipeBook` payloads; loads
  validate-before-accept (`deserializeRecipeBook` in try/catch, corrupt →
  empty book + recorded error, boot never throws).
- I5: One container at a time: at most one of crafting/furnace/brewing/
  enchanting/gamerule/recipebook is open; opening the book closes crafting.
- I6: R1/R2 only ever grow `known`; no path removes a key except the 257
  reset path deleting the raw record (fresh empty book afterwards).

## API and data model

```ts
// WorldMetadataRepository (additive, mirrors gamerule fns)
getRecipeBookData(worldId: string): Promise<unknown | null>
putRecipeBookData(worldId: string, payload: unknown): Promise<void>

// GamePersistence (additive, mirrors gamerule wiring)
get initialRecipeBook(): unknown | null
saveRecipeBook(payload: unknown): void  // fire-and-forget, recorded errors

// Game (new members; panel deps mirror GameRulePanel shape)
getRecipeBook(): RecipeBookState
getRecipeBookQuery(): string
setRecipeBookQuery(query: string): void            // transient, no persist
searchRecipeBook(): RecipeDefinition[]            // searchRecipes(registry, book, query)
getRecipeBookSelection(): RecipeBookSelectionView | null
selectRecipeBookRecipe(key: string | null): void  // unknown key -> null selection + status
craftRecipeBookSelection(): boolean               // false = status-surfaced no-op
isRecipeBookOpen(): boolean
openRecipeBook(): void                            // R2 discovery + persist-if-grown
closeRecipeBook(): void

interface RecipeBookSelectionView {
  key: string; name: string; description: string;
  outputName: string; outputCount: number;
  cells: readonly (RecipeBookCellView | null)[];  // length 9, layoutRecipe order
  missingCount: number;                           // ingredients not fully covered
  canCraft: boolean;
}
interface RecipeBookCellView {
  label: string;        // item or tag display id
  need: number; have: number;
  missing: boolean;
}
```

`have` resolution reuses `CraftingSystem` semantics: item ingredients use
`inventory.getItemCount(numericId)`; tag ingredients use the first registry
tag member (deterministic order) with stock covering the count, else the
maximum member stock (display-only; craft stays transactional so display drift
cannot corrupt).

## Control/data flow

1. Player presses C → `openCrafting()` (unchanged) → clicks
   `#crafting-recipebook-open` → `openRecipeBook()`: closes crafting (I5),
   runs R2 (`unlockRecipes(book, craftableKeys)`; persist iff identity
   changed), resets query/selection, shows panel.
2. Typing in `#recipebook-search` → `setRecipeBookQuery` → panel re-renders
   `searchRecipeBook()` results as `button[data-recipebook-recipe]`.
3. Clicking a result → `selectRecipeBookRecipe(key)` → panel renders
   `getRecipeBookSelection()` (9 cells + missing line + always-enabled Craft;
   the button narrates unaffordable selections instead of disabling).
4. Clicking `#recipebook-craft` → `craftRecipeBookSelection()`:
   `system.craft(key)`; success → R1 `unlockRecipe` + `saveRecipeBook` +
   status "Crafted X"; failure → status "Missing ingredients" + no-op.
5. `savePlayerStateDurable`/pagehide/autosave paths unchanged; the book saves
   eagerly on every known-set change (R1/R2) via `saveRecipeBook`, so reload
   always observes the latest set.

## Detailed behavior

- Search: delegated to `searchRecipes`; the panel passes the raw query string
  (trim/lowercase inside the helper). Blank/whitespace-only = all known.
- Select unknown key (stale button, registry drift): selection becomes null
  with status "Recipe no longer available." — never throws.
- Craft with empty selection: no-op with status "Select a recipe first."
- `layoutRecipe` `>9` throw is unreachable (registry ingredients are bounded)
  but propagates as a status message, never a fatal overlay, if ever hit.
- R2 craftable keys: registry definitions in registry order where
  `isRecipeAffordable` holds (output capacity ignored for discovery; craft
  still enforces it). Unknown `known` keys are skipped by search (204 rule).
- The book persists as an empty set and starts empty; the first open in a
  live world discovers whatever the spawn inventory affords (glass, gravel,
  cobblestone with the default spawn kit — observed in browser E2E), so the
  book is effectively never empty after its first open through normal play.
- Query is transient (not persisted); selection clears on close (enchanting
  precedent).

## Failure modes

- Missing `#recipebook*` elements → `Recipebook element missing: #id` throw
  at construction (fail-fast, 259/260/261 precedent).
- Corrupt `__recipebook__` payload → empty book + recorded persistence error;
  boot continues; next unlock overwrites the corrupt record.
- IndexedDB write failure on `saveRecipeBook` → recorded error, in-memory
  book unchanged (session keeps working; reload falls back to last good
  write).
- Craft failure (lost race with inventory change between render and click) →
  status no-op; inventory untouched (transactional guarantee).

## Compatibility/migration

- New raw record only; old saves boot with the empty book. `WorldArchive`
  gains OPTIONAL `recipeBookData` (missing → null on import; export writes
  when present) — v1/v2 archives without it import cleanly.
- No 204/registry/network format changes. Empty-book default changes no
  existing behavior besides the additive unlock side-effect on craft.

## Performance/resource constraints

- R2 discovery is O(registry × ingredients) over 9 catalog recipes on open
  only; search is O(known) per keystroke with signature-gated re-render
  (panel skips DOM rebuild when the result-key signature is unchanged).
- One extra metadata read at boot (bulk-loaded beside gamerules) and one
  write per unlock event; no per-tick work ( upkeep only re-renders while
  open, mirroring gamerule upkeep).

## Testing seams

- Panel unit: FakeElement DOM shim in node (GameRulePanel precedent).
- Persistence unit: injected IndexedDB factory + capturing asserts (261
  precedent: round-trip, absent→null, corrupt shapes, reset deletion,
  archive v1/v2 passthrough).
- Wiring unit: real `createDefaultRecipeRegistry` + real `Inventory` —
  R1/R2 rules, selection have/missing edges (exact, tag-first-member,
  zero-stock), craft-failure inventory identity.
- E2E: 259/260/261 harness shape; inventory granted through existing
  `__voxelGame` test hooks (no new privileged seams unless the existing set
  cannot grant items — then one minimal `testGrantRecipeBookItems` hook under
  the same DEV/VITE_E2E gate, asserted hook-free in release bundles).

## Observability/debugging

- Status line (`#recipebook-status`, `aria-live=polite`) narrates every
  outcome: crafts, missing counts, unlocks ("Learned Sticks"), discovery
  count on open, selection-void, persistence failures.
- E2E-observable `Game` surface: `isRecipeBookOpen()`,
  `getRecipeBook()` (known keys), `getRecipeBookQuery()`,
  `getRecipeBookSelection()` — mirroring `isGameruleOpen()/getGameRules()`.

## Affected files/symbols

- NEW: `src/ui/RecipeBookPanel.ts`, `src/inventory/RecipeBookView.ts`
  (pure selection/discovery/search-order helpers Game delegates to),
  `tests/unit/RecipeBookPanel.test.ts`,
  `tests/unit/RecipeBookPersistence.test.ts`,
  `tests/unit/RecipeBookWiring.test.ts`, `tests/e2e/recipebook.spec.ts`.
- EDIT: `src/storage/WorldMetadataRepository.ts`
  (`getRecipeBookData/putRecipeBookData`), `src/storage/GamePersistence.ts`
  (`initialRecipeBook/saveRecipeBook`, open bulk-load, reset deletion),
  `src/storage/WorldArchive.ts` + `WorldArchiver.ts` (optional passthrough),
  `src/engine/Game.ts` (book store, R1/R2, open/close/select/craft, C-toggle
  branch, upkeep, death/dispose, crafting-button wiring),
  (`CraftingPanel.ts` itself untouched: `#crafting-recipebook-open` is static
  shell wired Game-side, and `render()` never touches it),
  `index.html` (`#recipebook` dialog + `#crafting-recipebook-open`),
  `src/styles.css` (`recipebook-*`), `PARITY_MATRIX.md` (post-terminal note;
  no C262 row until VERIFIED), file-audit manifest (new-file rows).
- TOUCH-NOT: 204/registry semantics, 258 files, 259/260/261 verification
  artifacts, network codecs.

## Rejected alternatives

- Embedding the book as a section inside `#crafting` instead of a dialog:
  rejected — a dialog reuses the proven panel lifecycle (one-container
  rule, upkeep, death/dispose, blur) and keeps the crafting panel's render
  path untouched.
- Ghost-placement into a visible 3x3 grid: rejected — no live 3x3 crafting
  UI exists; building one is a later change's scope (JE parity non-goal).
- Unlock-on-pickup (JE-like): rejected — no central pickup choke point is
  wired today; R1+R2 cover the requirement with existing seams only.
- Player-scoped instead of world-scoped persistence: rejected — gamerule
  precedent is world-scoped via raw metadata, and the book describes world
  progress in this single-player save model.

## Downstream dependencies

None: 262 is a leaf UI change. Later changes may build recipe alternatives,
furnace-recipe tabs, or multiplayer unlock sync on top of the persisted
known set.
