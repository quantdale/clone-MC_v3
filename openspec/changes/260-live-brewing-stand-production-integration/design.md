# Design: 260-live-brewing-stand-production-integration

## Context/current state

- Headless brewing is VERIFIED but unreachable: `BrewingStandBlockEntity`
  (immutable `BrewingState`, `tickBrewing`, strict validation, 036
  serialize/deserialize, 39-slot 106 menu helpers over bottle 0 / fuel 1 /
  ingredient 2 + 36 player) has no block, no item, no host record, no panel,
  and no Game path. `grep brewing_stand` touches only the seam module.
- The live furnace (251) is the exact template: `LiveBlockEntityHost` owns one
  authoritative `FurnaceState` per placed furnace (052 manager +
  `furnaceContext`, simulating-chunk fixed ticks, per-chunk snapshot
  persistence, envelope+version quarantine, lazy stale removal);
  `FurnacePanel` is a pure view (derive fresh menu → one 106 transaction →
  atomic write-back → re-render; cursor settled on close); Game wires
  place/open/use/tick/break/upkeep/dispose around it.
- The enchanting panel (259) is the shell/lifecycle template: `#enchanting`
  block, `enchanting-*` styles, container exclusivity, walk-away/destroy
  upkeep, focus/relock/toggle/death/dispose parity, E2E harness shape
  (`waitForGame`, pointer-lock, `acquireTarget`, `aimAt`/`waitForTargetAt`,
  `__voxelGame` setup/observation only).
- Registries: `BlockId` max 61, `ItemId` max 63; brewing items
  (`minecraft:blaze_powder`, `minecraft:potion`, stand,
  speed/strength/healing reagents, fermented eye, glowstone) are NOT
  registered — only `nether_wart` (59) and `redstone` (37) exist. The live
  loop therefore runs on **awkward + redstone → speed** (both registered or
  added here) and proves fuel with blaze powder (added here).
- Inventory/menu conversions (`MenuSlots`) already round-trip components, so
  bottles keep their 122 contents through panel transactions, close-settle,
  break-drops-into-inventory, and save/load. Item entities (111/112) are
  component-less end-to-end — overflow ground drops cannot carry contents
  (accepted, pinned, follow-up).
- Atlas: 256×64 procedural canvas, tiles 0–29 painted; 30–65 referenced but
  blank (252 precedent). Block faces need painted tiles; three new original
  tiles (66/67/68) plus `ATLAS_ROWS` 4→5 keep every existing index stable.

## Target state

A placed brewing stand behaves like a placed furnace, bottle-aware:

- Placing the brewing-stand item writes block 62 and registers an empty
  brewing instance; breaking removes it exactly once and drops its contents.
- Right-click opens `#brewing`: bottle/fuel/ingredient cells, brew-arrow and
  fuel-flame bars, status line, 36 player cells, cursor chip.
- While its chunk simulates, the fixed tick advances brewing (fuel lights only
  when a brew is possible; active fuel always burns down, mirroring the
  furnace safe-pause rule); the open panel re-renders progress live.
- Closing returns the cursor (components intact) to the inventory; full
  inventory spills plain items as loot (contents-detach pinned).
- Reload restores the committed snapshot field-for-field; breaking then
  reloading never resurrects the stand.
- R-8 brewing half CLOSED; C260 matrix row exact.

## Invariants

- I-1 One authoritative instance per position (`BlockEntityManager`
  add/remove/replace); every view derives from it and writes back atomically.
- I-2 Only simulating chunks advance (`world.isChunkSimulating`); one
  canonical tick per fixed tick; pause/loading/render rate never alter brew
  speed. Fuel burns down while paused exactly like the furnace (123 pinned).
- I-3 The panel owns no item state beyond the transient cursor; close always
  settles it (inventory-direct with components, else plain loot spill).
- I-4 One container at a time: brewing/furnace/crafting/enchanting are
  mutually exclusive; opening one closes the others.
- I-5 Persistence is full-snapshot per chunk (`block-entities` dirty units);
  a chunk flushes on content change and eagerly on deactivation; corrupt or
  future-version payloads quarantine with a sticky degraded banner, never a
  crash.
- I-6 No duplication, no silent loss on covered paths: every content-bearing
  slot converts back through `menuSlotToStack`; unconvertible results abort
  the transaction whole (furnace atomicity guard, mirrored).

## API and data model

```ts
// Registries (ids: next free, stable forever)
BlockId.BrewingStand = 62;              // opaque cube, pickaxe, hardness 0.5, dropItem brewing_stand
ItemId.BrewingStand = 64;               // placeBlock brewing_stand, stack 64
ItemId.BlazePowder = 65;                // fuel, stack 64
ItemId.Potion = 66;                     // bottle, stackSize 1 (vanilla-accurate), no placeBlock
TILE_INDEX += { brewingStand: 66, blazePowder: 67, potionBottle: 68 }; ATLAS_ROWS 4 → 5.

// Host (additive; furnace surface untouched)
placeBrewing(x,y,z): boolean; removeBrewing(x,y,z): BrewingState | null;
hasBrewing(x,y,z): boolean; getBrewingState(x,y,z): BrewingState | null;
applyBrewingMenuSlots(x,y,z, {bottle,fuel,ingredient}): BrewingState | null;
tickBrewingStands(): number; // + hydrate('brewing_stand') + same quarantine
// brewingContext: createDefaultBrewingContext() (123 data), stored beside furnaceContext.

// Panel (new, furnace-mirrored)
new BrewingPanel(el, { inventory, registry, atlas, getState, applySlots, onInventoryChanged, onClose })
show/hide/isVisible; takeCursor(): { item, count, components? } | null; render() signature-gated.

// Game (additive fields/methods mirroring furnace)
brewingOpen/brewingPos/brewingPanel; openBrewing(x,y,z); closeBrewing();
isBrewingOpen; brewingSessionPosition; testGrantAwkwardBottle(): number;
// helpers: insertBrewingStackPreservingComponents(stack: ItemStack): number (leftover)
```

`MenuCursor` gains optional `components` (T7b 106 component-carry completion,
a hidden prerequisite found in implementation: the 123-era core moved
item/count but dropped contents, so bottle insert/pickup detached
`potion_contents`). Carry rules, all pure and additive: pickup/place/swap/
split/quickMove move components with the stack; emptied slots keep no
orphans; same-item merges require `menuComponentsEqual` (canonical
key-sorted JSON) else swap/no-op; component-less flows byte-identical
(106/202/203 suites green unchanged). The panel keeps the full cursor slot
internally and `takeCursor` returns components alongside.

## Control/data flow

- **Place**: `onAction('place')` → block 62 committed → `host.placeBrewing`.
- **Open**: interaction `use` on block 62 (coords ride along, 251/259 parity)
  → `openBrewing` (closes furnace/crafting/enchanting first; releases lock;
  hides overlay/crosshair/hud/hotbar; clears target; `panel.show()`).
- **Transact**: panel derives `createBrewingMenu(hostState, playerSlots,
  cursor)` → one `applyBrewingMenuTransaction` → furnace-style guards
  (out-of-bounds catch; atomicity: every content-bearing result slot must
  `menuSlotToStack`, else abort) → `host.applyBrewingMenuSlots` → write back
  player slots (components intact) → cursor → re-render. No extraction-only
  output slot exists (unlike the furnace): every slot is symmetric.
- **Tick**: `runFixedTick` §3.5 calls `tickFurnaces()` then
  `tickBrewingStands()` (order documented; independent stores).
- **Upkeep** (per frame): open + pos → block-still-62? distance ≤ 8?
  else `closeBrewing()`; else `panel.render()`.
- **Close**: `takeCursor` → component-preserving insert → hide → overlay
  `Click to play`. (No XP settle: brewing accrues none.)
- **Break** (`onBlockBrokenAt`, before toast): close matching panel →
  `removeBrewing` → slots → `menuSlotToStack` → direct insert (components) →
  leftovers as plain loot at the cell → persistChunk invalidation.
- **Persist**: host `persistChunk` on every mutation; hydration at boot from
  `initialBlockEntities` (brewing rows accepted, others skipped as today).

## Detailed behavior

- Fuel lights only when bottle+ingredient match (123 `canBrew`); brew cycle is
  400 ticks; blaze powder burns 1200 (20 brews, vanilla-shaped).
- Progress UI: brew fraction `brewTime/brewTimeTotal`, fuel fraction
  `fuelBurnTime/fuelBurnTimeTotal`, lit flag; status line mirrors the furnace
  (`Brewing — …%`, `Out of fire — add blaze powder`, `Insert bottle,
  ingredient and fuel`).
- `openBrewing` requires `host.hasBrewing(x,y,z)`; otherwise no-op (stale
  `use` after break races safely).
- Death (`respawnPlayer`), `dispose`, C-toggle, pointer relock, blur/
  visibility (panel stays, no overlay stacking — 259 parity), and the
  simulation-active gate all treat `brewingOpen` exactly like `furnaceOpen`.
- `updateHotbar` void path closes an open brewing panel (259 void-pattern).
- `testGrantAwkwardBottle()`: builds `{id: Potion, count: 1, components:
  potion_contents(awkward + zeroed placeholder effect)}` via
  `createPotionContents` (the 123 unit-test pattern) and inserts
  merge-or-empty-slot; returns leftover count. E2E setup only.

## Failure modes

- Corrupt/future-version brewing payload at hydrate → quarantine + sticky
  `bootSaveDegraded` banner (furnace path, shared `onQuarantined`).
- Stale record (block ≠ 62 when the chunk simulates) → lazy removal +
  persist (furnace path).
- Corrupt runtime payload at tick → drop the instance, never tick garbage
  (furnace path).
- Menu write to a vanished stand → `applyBrewingMenuSlots` null → panel
  ignores (authoritative state untouched).
- Unconvertible transaction result → whole-transaction abort (I-6).
- Full inventory on settle/break → plain-item loot spill + unit-pinned
  contents-detach (accepted debt, follow-up: component entities).
- Water→awkward completion pauses (123 pinned empty-effects rule) — out of
  scope, documented; live loop proven on awkward→redstone.

## Compatibility/migration

- Envelope unchanged; brewing rows are additive. Pre-260 saves load (no rows
  to hydrate). Post-260 saves on a pre-260 build: unknown `brewing_stand`
  rows are skipped by the furnace-only hydrate (same as any foreign typeKey).
- `PINNED_WORLDGEN_STATE_FINGERPRINT` verified unchanged in
  `WorldgenRegressionMatrix.ts` (the digest covers a closed 14-path
  generation-relevant set excluding `brewing_stand`); v2 matrix hash MUST be
  byte-identical (terrain untouched). `BlockStateRegistry` count formula holds
  (+1 single-state block on both sides) — verified by the suite, not edited.
- No API signature changes anywhere; `has()` stays furnace-only (furnace
  suites pin it); brewing gets `hasBrewing`.

## Performance/resource constraints

- Per-frame open-panel cost: one block read + one distance check + one
  signature-gated render (furnace shape); zero timers/rAF/RNG in the panel.
- Per-tick cost: one pass over brewing instances in simulating chunks only;
  unchanged-tick short-circuit via state equality (furnace shape).
- Atlas growth 64→80 tiles is canvas-construction-time only; existing UVs
  byte-identical.
- No headed-FPS claims: 258 stays BLOCKED; this change adds no GPU work.

## Testing seams

- `__voxelGame` (DEV/VITE_E2E): `inventory.addItem` (plain items),
  `testGrantAwkwardBottle` (componented bottle), `blockEntityHost`
  (`hasBrewing`/`getBrewingState`/`size`), `isBrewingOpen`,
  `brewingSessionPosition`, `world.getBlock`, `interaction.getTarget(Face)`.
- Unit seams: host constructed over fake `HostWorldView` + capturing
  persistence (251 pattern); panel over FakeElement DOM (259 pattern);
  integration over real registries + real 123 engine.

## Observability/debugging

- Quarantine funnels to the existing `onQuarantined` → degraded banner.
- `host.size`, per-position `getBrewingState`, and panel status text expose
  live state to E2E/tests; `tickBrewingStands()` returns changed-count.

## Affected files/symbols

Production: `src/world/BlockRegistry.ts` (`BlockId`, def),
`src/inventory/ItemRegistry.ts` (`ItemId`, defs),
`src/inventory/BrewingRecipes.ts` (id constants realigned to the
live-registry `minecraft:<key>` shape),
`src/world/BrewingStandBlockEntity.ts` (`BREWING_STAND_BLOCK_ID` only;
engine untouched), `src/inventory/MenuTransaction.ts` (T7b component carry),
`src/rendering/TextureAtlas.ts` (`TILE_INDEX`, 3 painters; grid constants
moved to `AtlasGrid`), `src/rendering/AtlasGrid.ts` (new, worker-safe grid
constants), `src/rendering/WorkerMeshing.ts` (UV unification onto
`AtlasGrid`, literal `/4` removed),
`src/engine/LiveBlockEntityHost.ts` (brewing section + dep),
`src/ui/BrewingPanel.ts` (new), `src/engine/Game.ts` (session + wiring +
seam), `src/player/PlayerInteraction.ts` (`use` branch), `index.html`
(`#brewing`), `src/styles.css` (`brewing-*`);
`src/worldgen/WorldgenRegressionMatrix.ts` untouched (fingerprint verified
unchanged by construction).
Tests: `tests/unit/BrewingRegistry.test.ts`,
`tests/unit/LiveBrewingHost.test.ts`, `tests/unit/BrewingPanel.test.ts`,
`tests/unit/BrewingPersistence.test.ts`,
`tests/unit/MenuTransactionComponents.test.ts`,
`tests/unit/LiveBrewingIntegration.test.ts` (all new); characterization
updates only (`BlockRegistry` 51, `BlockItemSeparation` allowlist,
`WorkerRegistryInitialization` `ATLAS_ROWS` + float32 tolerance);
`tests/e2e/brewing.spec.ts` (new).
Docs/state: 260 package, `PARITY_MATRIX.md` C260, risk-register R-8,
`PROGRAM_STATE.json/.md`, file-audit manifest rows.

## Rejected alternatives

- Forking/duplicating the host per type: rejected — one manager already
  keys by position+typeKey; parallels keep I-1/I-5 uniform.
- Generalizing `has()` to any type: rejected — furnace suites pin
  furnace-only semantics; `hasBrewing` is additive and unambiguous.
- Extending item entities with components: rejected for 260 — touches
  111/112/131 envelopes and pickup contracts; overflow-detach is the
  documented, tested, follow-up-tracked compromise.
- Amending the 123 engine for water→awkward: rejected — pinned VERIFIED
  behavior with 123 tests; live proof uses awkward→redstone.
- Reusing blank tile indices for art: rejected — would re-skin existing
  items (lapis/book/shelf at 30–32); fresh 66–68 keeps all pixels stable.

## Downstream dependencies

None in-repo: no consumer reads brewing state besides the panel/Game/E2E.
Future component-carrying item entities would consume `LootStack.components`
through the spill path unchanged.
