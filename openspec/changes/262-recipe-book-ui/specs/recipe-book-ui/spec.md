# Spec: recipe-book-ui

## Contract

This capability ships the in-game recipe book UI over the VERIFIED headless
`RecipeBook` (204) and integrates it with the live crafting flow. It MUST open
from the crafting UI, list and filter KNOWN recipes only, preview ingredient
placement via `layoutRecipe`, craft transactionally when affordable, persist
the known set across save/reload, and unlock through the documented R1/R2
rules. It MUST NOT corrupt the inventory, MUST NOT list unknown recipes,
MUST NOT touch 258 headed work, and MUST NOT reopen 259/260/261.

## Definitions

- **Known set**: `RecipeBookState.known` — unique non-empty recipe keys in
  unlock order (204 invariant).
- **R1 (craft-output unlock)**: a successful craft through `Game` unlocks
  that recipe's key.
- **R2 (craftable-discovery)**: opening the book unlocks every registry
  recipe currently craftable with the player's inventory.
- **Selection view**: the laid-out 9-cell ingredient grid plus per-cell
  have/missing counts and the aggregate `canCraft` flag.
- **Status-surfaced no-op**: the action changes nothing and reports the
  reason on `#recipebook-status` (never throws, never a fatal overlay).

## Invariants

- INV-1: `known` holds unique non-empty keys in unlock order; R1/R2 only grow
  it (except the 257 reset path, which deletes the raw record).
- INV-2: The list shows known recipes only, in registry order for a blank
  query (204 search semantics, delegated — never reimplemented).
- INV-3: A failed craft leaves the inventory byte-identical.
- INV-4: Only validated `serializeRecipeBook` payloads are written; loads are
  validate-before-accept with degrade-to-empty.

## Requirements

### Requirement: Open the recipe book from the crafting UI

The book SHALL open from the live crafting flow and obey the one-container
rule.

#### Scenario: open book from crafting dialog

- **GIVEN** the crafting screen is open (C key)
- **WHEN** the player activates `#crafting-recipebook-open`
- **THEN** the crafting panel closes and `#recipebook:not(.hidden)` is shown
- **AND** the search field is focused when available.

#### Scenario: one-container rule

- **GIVEN** any of furnace/brewing/enchanting/gamerule/crafting is open
- **WHEN** the recipe book opens
- **THEN** the previously open container is closed first
- **AND** at most one container is visible.

### Requirement: List known recipes with search/filter

The panel SHALL render `searchRecipes(registry, book, query)` results and
nothing else.

#### Scenario: blank query lists all known in registry order

- **GIVEN** a book knowing `sticks` and `planks` (unlocked sticks-first)
- **WHEN** the query is empty or whitespace-only
- **THEN** both recipes render in registry order (`planks` before `sticks`,
  matching `entries()` order).

#### Scenario: non-blank query filters by key, name, or output

- **GIVEN** the 9-recipe default catalog and a book knowing all keys
- **WHEN** the query is `pickaxe`
- **THEN** only `wooden_pickaxe` and `stone_pickaxe` render
- **WHEN** the query is `PLANK` (case-insensitive)
- **THEN** `planks` renders.

#### Scenario: unknown recipes never render

- **GIVEN** a book knowing only `sticks`
- **WHEN** the query is blank
- **THEN** `planks` does not render and no unknown-key entry throws
  (unknown known-keys are skipped per 204).

### Requirement: Select a recipe and preview ingredient placement

Selecting a known recipe SHALL show its `layoutRecipe` grid with have/missing
accounting.

#### Scenario: select shows laid-out cells with counts

- **GIVEN** the book knows `sticks` and the player holds 1 plank
- **WHEN** the player selects `sticks`
- **THEN** the detail shows 2 filled cells (planks ×2, have 1, missing 1)
  and 7 empty cells
- **AND** the missing line reports the shortfall.

#### Scenario: selecting an unknown or stale key is a status no-op

- **GIVEN** a rendered list
- **WHEN** selection is requested for a key that is not known or not in the
  registry
- **THEN** the selection becomes null with status
  "Recipe no longer available."
- **AND** no throw occurs.

#### Scenario: tag ingredients resolve deterministically

- **GIVEN** a recipe with a tag ingredient (layout cell kind `tag`)
- **WHEN** the selection renders
- **THEN** the cell shows the tag id and the have-count of the first registry
  tag member with covering stock (or the maximum member stock when none
  covers), matching `CraftingSystem` resolution order.

### Requirement: Craft from the book without corrupting inventory

#### Scenario: affordable selection crafts

- **GIVEN** the `sticks` selection with the player holding 2 planks and
  output capacity
- **WHEN** the player activates Craft
- **THEN** `CraftingSystem.craft` runs once, 2 planks are consumed, 4 sticks
  are added (identical to the `CraftingPanel` one-click outcome)
- **AND** status reports "Crafted Sticks".

#### Scenario: unaffordable selection is a status no-op with intact inventory

- **GIVEN** the `sticks` selection with the player holding 1 plank
- **WHEN** the player activates Craft
- **THEN** status reports the missing ingredients
- **AND** the inventory snapshot before and after are field-for-field equal
  (no partial consumption).

#### Scenario: craft with no selection is a status no-op

- **GIVEN** no recipe selected
- **WHEN** the player activates Craft
- **THEN** status reports "Select a recipe first."
- **AND** the inventory is unchanged.

### Requirement: Persist the known set across save/reload

#### Scenario: unlocks survive pagehide and reload

- **GIVEN** a book that learned `sticks` through play
- **WHEN** the page hides and reloads (real IndexedDB round-trip)
- **THEN** the reloaded book knows `sticks` (field-for-field known-set
  equality).

#### Scenario: corrupt payload degrades to the empty book

- **GIVEN** a stored `__recipebook__:<worldId>` payload with a bad version,
  duplicate keys, empty keys, or non-array `known`
- **WHEN** the game boots
- **THEN** the book is empty, boot continues, a persistence error is recorded
- **AND** the next unlock overwrites the corrupt record.

#### Scenario: reset and archive passthrough

- **GIVEN** the 257 reset path
- **WHEN** it runs
- **THEN** exactly the `__recipebook__:<worldId>` key is deleted
- **AND** world export carries `recipeBookData` when present while v1/v2
  archives without the field import as null.

### Requirement: R1 craft-output unlock

#### Scenario: successful craft unlocks the recipe

- **GIVEN** a book not knowing `sticks`
- **WHEN** `sticks` is crafted through `Game` (crafting panel or book)
- **THEN** `sticks` is appended to `known` and persisted
- **AND** a failed craft unlocks nothing.

### Requirement: R2 craftable-discovery on open

#### Scenario: opening discovers currently-craftable recipes

- **GIVEN** a fresh-world empty book and a player holding 1 log
  (`planks` craftable, `sticks` not)
- **WHEN** the book opens
- **THEN** `planks` is unlocked and persisted while `sticks` stays locked
- **AND** reopening with an unchanged inventory performs no write
  (identity no-op, `unlockRecipes` identity).

### Requirement: Lifecycle parity with sibling panels

#### Scenario: close paths

- **GIVEN** the book open
- **WHEN** the player activates `#recipebook-close`, presses C, dies
  (`respawnPlayer`), or the game disposes
- **THEN** the book closes (overlay restored per the sibling-panel rules)
- **AND** selection clears while the known set is retained.

#### Scenario: focus loss keeps the book unstacked

- **GIVEN** the book open
- **WHEN** the window blurs / visibility hides
- **THEN** the book stays open exactly once (no duplicate state, no stacking)
  per the sibling-panel focus rules.

### Requirement: Scope discipline

#### Scenario: no headed work, no reopened changes

- **GIVEN** the 262 track
- **WHEN** any 262 commit is inspected
- **THEN** it touches no headed-FPS/258-certification path, fakes no GPU
  evidence, never marks 258 VERIFIED, and reopens none of 259/260/261
  (`git status`/diff review).

## Error and failure behavior

- Missing `#recipebook*` nodes at construction SHALL throw
  `Recipebook element missing: #<id>` (fail-fast, sibling precedent).
- `layoutRecipe` overflow (`>9`) SHALL surface as a status message, never a
  fatal overlay (unreachable with the current catalog; defensive).
- Persistence write failure SHALL record an error and keep the in-memory book
  authoritative for the session.
- All user-action failures (unknown selection, unaffordable craft,
  no-selection craft, invalid query type) SHALL be status-surfaced no-ops;
  none SHALL throw and none SHALL mutate inventory or the known set.

## Performance and resource bounds

- R2 discovery SHALL run at most once per book open (O(catalog)); search
  SHALL be O(known) per keystroke with signature-gated DOM rebuilds.
- Persistence SHALL add at most one metadata read at boot and one write per
  unlock event; no per-tick book work (open-state re-render only, mirroring
  gamerule upkeep).

## Compatibility and migration

- Old saves without `__recipebook__` SHALL boot with the empty book.
- `WorldArchive.recipeBookData` SHALL be OPTIONAL (missing → null).
- No 204, registry, block/item, worldgen, or network format change SHALL ship
  in this change.

## Security and integrity

- Unknown-key and extra-field payload rejections (204) SHALL be preserved
  end-to-end: a hand-edited record with unknown keys MUST NOT partially load.
- No new E2E-only seam was added: tests grant items through the pre-existing
  `__voxelGame.inventory.addItem` surface, which SHALL remain gated behind the
  existing DEV/VITE_E2E flag and asserted absent from release bundles by
  `scripts/check-release-bundle.mjs`.

## Observability

- Every book outcome (craft, missing, discovery count, selection-void)
  SHALL narrate on `#recipebook-status` (`aria-live=polite`). R1 unlocks
  through the crafting panel SHALL narrate via the craft toast
  ("Crafted X. Learned X."); book crafts address already-known selections,
  so the panel status reports "Crafted X." without an unlock suffix.
- `Game` SHALL expose `isRecipeBookOpen()`, `getRecipeBook()`,
  `getRecipeBookQuery()`, and `getRecipeBookSelection()` for tests/E2E.

## Verification mapping

| Requirement | Unit evidence | E2E evidence |
|---|---|---|
| Open from crafting UI | RecipeBookPanel open-hook test + Game wiring test | journey: C → button → `#recipebook` visible, crafting hidden |
| List + search/filter | Panel list tests over real registry (blank order, pickaxe/PLANK filters, unknown-only book) | journey: type `stick` → only sticks renders; clear → all known |
| Select + layout preview | Selection view tests (sticks 2+7 cells, stale-key null, tag cell) | journey: click sticks → cells + missing line visible |
| Transactional craft | Craft-failure inventory-identity test | journey: craft with stock → counts change; without → identical |
| Persistence | Round-trip/corrupt/reset/archive tests | journey: craft-unlock → reload → still known |
| R1 unlock | Craft-success appends + persists; failure unlocks nothing | journey: known set grows after craft |
| R2 discovery | Open with 1 log → planks only; reopen → no write | E2E: grant log → open → planks listed |
| Lifecycle | Game close-branch tests | lifecycle spec: close/C/death-safe/blur |
| Scope discipline | `git status` touch-set review | n/a (review artifact) |
