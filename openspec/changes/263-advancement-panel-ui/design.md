# Design: 263-advancement-panel-ui

## Context/current state

- `src/simulation/AdvancementFramework.ts` (185, VERIFIED) is pure/headless and
  additive/unconsumed: no `Game.ts` consumer exists. API: `AdvancementCriterion`
  union (`kill_mob`/`obtain_item`/`dimension_enter`/`boss_defeat`),
  `AdvancementDefinition` (`id`/`key`/`title`/`criteria`/`reward` — note: NO
  description field), `createAdvancementProgress`, `applyAdvancementTrigger`
  (first-match flip, completion at last criterion with tick, identity no-op
  otherwise), `advancementIsComplete`, `advancementCriteriaRemaining`,
  `serializeAdvancementProgress` / `deserializeAdvancementProgress` (version 1;
  validates version, non-empty key, boolean achieved, non-neg-int-or-null tick,
  boolean array — but NOT duplicate keys, unknown keys, length-vs-definition,
  or achieved/criteria consistency: the R-4 gap).
- `src/simulation/CoreProgressionAdvancements.ts` (186, VERIFIED): 7-def chain
  `stone_age → acquire_hardware → iron_tools → diamonds → enter_the_nether →
  enter_the_end → free_the_end`, each single-criterion. Live item keys
  `wooden_pickaxe`/`stone_pickaxe` exist in `ItemTypeRegistry`;
  `iron_pickaxe`/`diamond` do NOT (no live producer — documented gap, §Rejected).
- Live play is Overworld-only single-player: `Game` never changes dimensions,
  runs no dragon fight, and attributes no mob kills to the player. Real obtain
  choke points DO exist: item-entity pickup (`collectPlayerDrops` callback,
  `Game.ts:1623`), crafting output (`onCrafted`, `Game.ts:2312`), and the
  recipe-book craft path (`craftRecipeBookSelection`, `Game.ts:3534` — which
  bypasses `onCrafted`).
- Achieved-tick source: the existing monotonic `Game.simTick` counter
  (incremented in `runFixedTick`; 0 before the first tick). Event handlers
  read it directly — no new tick field (YAGNI).
- Toast: `Game.showToast` (`Game.ts:3691`) with `#toast` (`aria-live=polite`).
- Panel precedent: constructor `(el, deps)` + `show/hide/isVisible` via
  `.hidden` + `requireElement` fail-fast + signature-gated render
  (RecipeBookPanel/GameRulePanel). Panel owns no domain state.
- Lifecycle precedent (259/260/261/262): open closes other containers first
  (one-container rule) with lock/overlay handling; C-toggle closes; pointer
  relock closes; upkeep re-renders while open; blur keeps unstacked;
  death (`respawnPlayer`) + `dispose()` close.
- Persistence precedent (261/262): `WorldMetadataRepository` raw record
  `__<ns>__:<worldId>` (`getXData`/`putXData`), `GamePersistence` bulk-load +
  `saveX` + reset deletion, `WorldArchive` OPTIONAL + `WorldArchiver`
  passthrough. Inventory numeric ids map to string keys via
  `itemRegistry.getByLegacyId(id)?.key` (undefined-safe usage at
  `Game.ts:2638`).
- Crafting E2E path: `CraftingPanel` renders one button per recipe
  (`button.crafting-recipe[data-recipe=id]`, recipe ids `wooden_pickaxe` /
  `stone_pickaxe` in `RecipeRegistry`); click → `system.craft` →
  `onCraft(crafted)` → `Game.onCrafted`. Recipe `wooden_pickaxe` needs
  3 planks + 2 sticks (numeric ids: LOG 7, PLANKS 12, STICKS 19 per the 262
  harness).

## Target state

- `Game` owns `advancements: AdvancementProgress[]` in
  `coreProgressionAdvancements()` order, a `AdvancementPanel` bound to an
  `#advancements` dialog, and an `#advancements-open` HUD chip.
- `fireAdvancementTrigger(trigger)` fans out over the catalog, persists when
  anything changed, toasts each newly-completed title exactly once, and
  re-renders the open panel. Returns the newly-completed keys (E2E-observable).
- Obtain wiring: pickup callback + `onCrafted` + recipe-book craft success map
  numeric ids to item keys and fire `obtain_item` through the same seam.
- The panel lists all 7 defs in chain order with title, English description,
  `achievedCount/totalCount`, and a Completed badge; status line narrates.
- Progress persists under `__advancements__:<worldId>` as the versioned batch
  envelope, with degrade-to-defaults, reset deletion, archive passthrough.
- `tests/e2e/advancements.spec.ts` proves open → see defs → real-craft
  completion + harness-seam completion → UI reflects → reload persists, plus
  lifecycle.

## Invariants

- I1: `Game.advancements` is parallel to `coreProgressionAdvancements()` order
  (index `i` ↔ catalog `[i]`); mutated only via `applyTriggerToProgresses`.
- I2: The panel renders exclusively through `getAdvancementRows()` (all 7 defs,
  chain order); it never invents, filters, or reorders definitions.
- I3: `fireAdvancementTrigger` is total (never throws): a trigger matching
  nothing is an identity no-op returning `[]`; persistence writes only when
  the fan-out identity changed.
- I4: Each completion toasts exactly once: toasts fire only for keys in the
  fan-out `completedKeys`, and completed defs are identity no-ops afterwards
  (185 rule, pinned by unit test incl. double-fire).
- I5: Persistence writes only validated `serializeAdvancementSave` payloads;
  loads validate-before-accept (`deserializeAdvancementSave` in try/catch,
  corrupt → defaults + recorded error, boot never throws).
- I6: One container at a time: at most one of crafting/furnace/brewing/
  enchanting/gamerule/recipebook/advancements is open; opening advancements
  closes the rest.
- I7: 185/186 files are untouched (no signature, catalog, or test changes).

## API and data model

```ts
// AdvancementSave.ts (new, src/simulation)
ADVANCEMENT_SAVE_VERSION = 1
interface SerializedAdvancementSave { version: 1; advancements: SerializedAdvancementProgress[]; }
serializeAdvancementSave(progresses: readonly AdvancementProgress[]): SerializedAdvancementSave
deserializeAdvancementSave(input: unknown, catalog: readonly AdvancementDefinition[]): AdvancementProgress[]
// fail-closed: non-object / wrong version / non-array / duplicate key /
// unknown key / length mismatch / achieved⇔all-criteria / achieved⇔tick
// each throws descriptively; nothing is partially accepted.
createDefaultAdvancementProgresses(catalog): AdvancementProgress[]
applyTriggerToProgresses(progresses, catalog, trigger, tick): { progresses; completedKeys: string[] }
// identity (same array) when nothing changed; completedKeys = newly achieved.

// AdvancementView.ts (new, src/simulation)
interface AdvancementRowView { key; title; description; achieved; achievedTick; achievedCount; totalCount; remaining; }
describeAdvancementCriterion(criterion: AdvancementCriterion): string
describeAdvancement(def, progress): AdvancementRowView
describeAdvancements(catalog, progresses): AdvancementRowView[]

// WorldMetadataRepository (additive)
getAdvancementData(worldId: string): Promise<unknown | null>
putAdvancementData(worldId: string, payload: unknown): Promise<void>

// GamePersistence (additive)
get initialAdvancements(): AdvancementProgress[] | null
saveAdvancements(payload: unknown): void

// Game (new members; panel deps mirror RecipeBookPanel shape)
getAdvancementRows(): AdvancementRowView[]
fireAdvancementTrigger(trigger: AdvancementCriterion): string[]
isAdvancementOpen(): boolean
openAdvancements(): void
closeAdvancements(): void
```

`describeAdvancementCriterion` English (original text, no proprietary copy):
obtain_item X → `Obtain ${humanize(X)}`; kill_mob X → `Defeat ${humanize(X)}`;
dimension_enter `minecraft:the_nether` → `Enter the Nether`;
dimension_enter `minecraft:the_end` → `Enter the End`; other dimension keys →
`Enter ${humanize(key)}`; boss_defeat `ender_dragon` → `Defeat the Ender
Dragon`; other boss keys → `Defeat ${humanize(key)}`. `humanize` strips any
`namespace:` prefix, splits `_`, capitalizes each word.

## Control/data flow

1. Player clicks `#advancements-open` → `openAdvancements()`: closes
   crafting/furnace/brewing/enchanting/gamerule/recipebook first (I6),
   releases lock, hides overlay/crosshair/hud/hotbar, shows panel.
2. Panel renders `getAdvancementRows()`: 7 rows (`data-advancement-row=key`)
   with title + description + `achievedCount/totalCount` + Completed badge.
3. Item-entity pickup / `onCrafted` / recipe-book craft success map numeric id
   → item key → `fireAdvancementTrigger({type:'obtain_item', itemKey})`.
4. `fireAdvancementTrigger`: fan-out at `simTick`; when changed →
   `saveAdvancements(serializeAdvancementSave(...))`; toast each completed
   title; re-render open panel; return completed keys.
5. Harness/E2E (and future Nether/End/mob producers) call the same
   `fireAdvancementTrigger` for `dimension_enter`/`boss_defeat`/`kill_mob`.
6. Reload: `GamePersistence.open()` bulk-loads `__advancements__`, validates
   via the strict batch deserializer (corrupt → defaults + recorded error);
   Game boots from it.

## Detailed behavior

- Pickup callback wraps `(id, count) => inventory.addItem(id, count)`:
  after adding, resolve `itemRegistry.getByLegacyId(id)?.key`; fire obtain
  only when the key is a non-empty string (unknown ids never throw).
- `onCrafted`: resolve `itemRegistry.getByLegacyId(recipe.output)?.key` and
  fire obtain (R1-adjacent; recipe-book craft path fires identically on its
  own success branch since it bypasses `onCrafted`).
- `fireAdvancementTrigger` with a malformed trigger object (wrong type tag,
  empty payload) matches nothing → `[]` (total; never throws).
- Panel with zero catalog defs (unreachable — catalog is a 7-const) would
  render the empty notice; rows always 7 in practice.
- Query/search is out of scope (7 rows fit without filtering — YAGNI).
- `iron_tools`/`diamonds` show `0/1` until content changes add the items;
  the panel never suggests they are obtainable now (honest progress text).
- E2E-observable surface mirrors 262: `isAdvancementOpen()`,
  `getAdvancementRows()`, `fireAdvancementTrigger()` return value.

## Failure modes

- Missing `#advancement-*` elements → `Advancement element missing: #id`
  throw at construction (fail-fast, 259–262 precedent).
- Corrupt `__advancements__` payload → defaults + recorded persistence error;
  boot continues; next trigger overwrites the corrupt record.
- IndexedDB write failure on `saveAdvancements` → recorded error, in-memory
  progress unchanged (session keeps working; reload falls back to last good
  write).
- Unknown numeric item id at an obtain choke → skipped silently (no trigger,
  no throw); registry drift can never break pickup/craft.

## Compatibility/migration

- New raw record only; old saves boot with default progress. `WorldArchive`
  gains OPTIONAL `advancementData` (missing → null) + `WorldArchiver`
  export/import passthrough — v1/v2 archives without it import cleanly.
- No 185/186/registry/network format changes. No new stores/version bumps.
- The envelope version is 1; a future shape bumps it and rejects old versions
  with the same descriptive-throw rule (forward-incompatible by design, like
  185's record).

## Performance/resource constraints

- Fan-out is O(7 × 1 criteria) per pickup/craft event; one fan-out per
  collected stack, and post-completion invocations are identity no-ops via
  the 185 rule (no dedupe table needed).
- One extra metadata read at boot (bulk-loaded beside recipe-book) and one
  write per changed trigger; no per-tick work (upkeep only re-renders while
  open, mirroring recipe-book upkeep).
- Panel render is signature-gated (skips DOM rebuild when the rows signature
  is unchanged).

## Testing seams

- Save/view unit: pure, no DOM (FakeElement panel harness in node, 262
  precedent).
- Persistence unit: injected IndexedDB factory + capturing asserts (262
  precedent: round-trip, absent→null, 6+ corrupt shapes, reset deletion,
  archive v1/v2 passthrough).
- Wiring unit: real `ItemTypeRegistry` + real `Inventory` — defaults,
  obtain/dimension/boss/kill fan-out, double-fire exactly-once, unknown-id
  skip, tick recording, persist-on-change-only.
- E2E: 262 harness shape; grants through existing `__voxelGame.inventory`
  + `fireAdvancementTrigger` seam (no new privileged seams; assert hook-free
  release bundles per 262 precedent — the seam is the specified product API,
  also used by future producers).

## Observability/debugging

- Toast (`#toast`) narrates every new completion: `Advancement made: Stone
  Age`.
- Panel status line (`#advancement-status`, `aria-live=polite`) narrates open
  state (`7 advancements, 1 complete.`).
- E2E-observable `Game` surface: `isAdvancementOpen()`,
  `getAdvancementRows()`, `fireAdvancementTrigger()` return.

## Affected files/symbols

- NEW: `src/simulation/AdvancementSave.ts`,
  `src/simulation/AdvancementView.ts`, `src/ui/AdvancementPanel.ts`,
  `tests/unit/AdvancementSave.test.ts`,
  `tests/unit/AdvancementView.test.ts`,
  `tests/unit/AdvancementPanel.test.ts`,
  `tests/unit/AdvancementPersistence.test.ts`,
  `tests/unit/AdvancementWiring.test.ts`, `tests/e2e/advancements.spec.ts`.
- EDIT: `src/storage/WorldMetadataRepository.ts`
  (`getAdvancementData/putAdvancementData`),
  `src/storage/GamePersistence.ts`
  (`initialAdvancements/saveAdvancements`, open bulk-load, reset deletion),
  `src/storage/WorldArchive.ts` + `WorldArchiver.ts` (optional passthrough),
  `src/engine/Game.ts` (store, fan-out, obtain chokes, toast, open/close/
  upkeep/C-toggle/relock/blur/death/dispose, HUD-button wiring),
  `index.html` (`#advancements` dialog + `#advancements-open` chip),
  `src/styles.css` (`advancement-*`), `PARITY_MATRIX.md` (post-terminal note;
  no C263 row until VERIFIED), file-audit manifest (new-file rows),
  `openspec/hardening/2026-08-23-exhaustive-repository-certification/risk-register.md`
  (R-4 advancement-half closure note).
- TOUCH-NOT: 185/186 sources and tests, 204/registry semantics, 258 files,
  259/260/261/262 verification artifacts, network codecs.

## Rejected alternatives

- Adding `description` to `AdvancementDefinition` (185/186 edit): rejected —
  touches VERIFIED catalog semantics and forces a 186 spec amendment for what
  the view layer can derive honestly from criterion data.
- Wiring obtain by polling the inventory each tick: rejected — event-choke
  firing is exact, cheaper, and matches the pickup/craft causality; polling
  would also complete advancements for pre-existing spawn-kit items on boot
  (wrong: progress must come from play events after this change lands).
- Producing `dimension_enter`/`boss_defeat` from fake travel/kill stubs to
  make every row completable: rejected — fabricating producers would be
  dishonest parity; the seam is specified, harnessed, and documented for the
  future Nether/End/mob changes.
- Search/filter in the panel: rejected — 7 rows need no filtering (YAGNI;
  recipe-book search exists because its catalog is unbounded).
- Hotkey (L): rejected for this change — the HUD chip + C-toggle-close cover
  open/close without touching the input framework; a remappable binding is a
  later input change's scope.

## Downstream dependencies

Later Nether/End/mob changes call `Game.fireAdvancementTrigger` (or the
fan-out helper) from their real producers; multiplayer sync (222+) may ship
the envelope's `advancements` array as the sync payload (versioned, strict).
