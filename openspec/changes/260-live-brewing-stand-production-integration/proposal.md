# Proposal: 260-live-brewing-stand-production-integration

## Problem

The brewing stand exists only as a verified headless seam (change 123:
`src/world/BrewingStandBlockEntity.ts` over `src/inventory/BrewingRecipes.ts`,
change 122 potion item data, and 219 potion catalog data). No player can place,
open, load, brew, persist, or break a brewing stand in the playable Game.
Certification debt **R-8 (brewing half)** in
`openspec/hardening/2026-08-23-exhaustive-repository-certification/risk-register.md`
is open exactly for this: *"Brewing fuel-on-pause divergence (unwired brewing
stand)"* — *"Brewing half remains accepted; revisit when brewing-stand is wired
live."* The furnace half was resolved by Change 251 live wiring; brewing is the
same shape of work and mirrors the proven 251 furnace + 259 panel lifecycle
patterns.

## Goals

- Place a brewing stand from the player inventory (new block id 62 + item) and
  instantiate one authoritative headless state per placed stand.
- Right-click/`use` a placed stand opens a live brewing panel (container
  exclusivity with crafting/furnace/enchanting).
- Insert a potion bottle (122 `potion_contents`), an ingredient, and
  blaze-powder fuel through real 106 menu transactions (mouse + quick-move).
- Brew deterministically on the canonical fixed tick while the chunk simulates
  (awkward + redstone → speed in 400 ticks; blaze powder burns 1200 ticks),
  with live brew/fuel progress in the UI.
- Persist stand state across chunk unload, autosave, pagehide, and page reload
  through the existing 036 block-entity envelope (same store as furnaces).
- Break the stand exactly once: contents drop safely (component-preserving),
  the record is invalidated, and no reload resurrects it.
- Close/walk-away/focus/relock/toggle/death/dispose lifecycle is safe: the
  transient cursor (which may carry the brewed bottle) is never deleted.
- Unit coverage for host/panel/menu/slots/integration plus a browser E2E
  journey (place→open→insert→brew→collect→reload→break) and a lifecycle E2E.
- Close R-8 (brewing half); add PARITY_MATRIX row C260.

## Non-goals

- Multiplayer replication of brewing state (network arc is VERIFIED through
  235; brewing sync is future work).
- Change 258 headed FPS certification (remains BLOCKED; no headed work, no GPU
  evidence, 258 is never marked VERIFIED by this track).
- Reopening 259 (VERIFIED) unless a brewing regression blocks the loop.
- A second potion system: the 122/123/219 data and the 123 tick engine are
  extended by wiring only, never forked.
- Component-carrying item entities: the 111/112 component-less pickup contract
  is unchanged (overflow drops detach bottle contents; documented, tested).
- Water→awkward completion: the pinned 123 pause-on-empty-effects behavior is
  untouched; the live loop is proven on awkward→redstone→speed.
- New binary assets: procedural atlas tiles only.

## Preconditions

- 259 VERIFIED (18/18); 258 BLOCKED (40/100) with owner deferral intact.
- Headless seam VERIFIED and unchanged: 122 potion contents, 123 stand engine
  (incl. `createBrewingMenu`/`applyBrewingMenuTransaction`), 219 potion data,
  106 menu transactions, 052 manager, 036 envelope, 251 host/panel/Game
  patterns, 259 shell/lifecycle patterns.
- Session starts from current `origin/main` (`a1a734c` or newer), clean tree.

## Dependencies

- `src/world/BrewingStandBlockEntity.ts` (123 engine + menu helpers).
- `src/inventory/BrewingRecipes.ts` (`createDefaultBrewingContext`, ids).
- `src/data/PotionItemData.ts` (122 contents + component type).
- `src/engine/LiveBlockEntityHost.ts` (251 host, extended not forked).
- `src/ui/FurnacePanel.ts` (251 panel, mirrored not copied).
- `src/engine/Game.ts`, `src/player/PlayerInteraction.ts`, `index.html`,
  `src/styles.css`, `src/rendering/TextureAtlas.ts`.
- `src/inventory/MenuSlots.ts` (component-preserving conversions, 251).
- `src/inventory/LootTable.ts` (`LootStack`), `src/inventory/Inventory.ts`.

## Proposed change

Extend the live Game exactly the way 251 wired the furnace:

1. **Registries + art**: `BlockId.BrewingStand = 62` (+ opaque-cube def with
   pickaxe/0.5 hardness and `dropItem`), `ItemId.BrewingStand = 64`
   (`placeBlock`), `ItemId.BlazePowder = 65`, `ItemId.Potion = 66`
   (`stackSize 1`, vanilla-accurate); three original procedural atlas tiles
   (66/67/68, `ATLAS_ROWS` 4→5) for stand/powder/bottle icons and stand faces.
2. **Host**: brewing parallels in `LiveBlockEntityHost`
   (`placeBrewing`/`removeBrewing`/`getBrewingState`/`applyBrewingMenuSlots`/
   `tickBrewingStands` + brewing hydration/quarantine); furnace methods and
   semantics byte-for-byte untouched.
3. **Panel**: new `src/ui/BrewingPanel.ts` mirroring `FurnacePanel` (39-slot
   menu, signature-gated render, bottle/fuel/ingredient cells, brew + fuel
   progress bars, cursor that preserves components) over the 123 menu helpers.
4. **Game**: `brewingOpen`/`brewingPos`/`brewingPanel` session lifecycle
   (`openBrewing`/`closeBrewing`, `isBrewingOpen`, `brewingSessionPosition`);
   `use`-routing for brewing stands; placement instantiation; fixed-tick
   `tickBrewingStands()` beside `tickFurnaces()`; destruction handling with
   component-preserving drops; container exclusivity, walk-away/destroy gates,
   simulation gate, focus/relock/toggle/death/dispose parity; a test-only
   `testGrantAwkwardBottle()` setup seam (E2E stand-in for bottle acquisition).
5. **Shell**: `#brewing` block in `index.html`, `brewing-*` styles in
   `src/styles.css`, no binaries.
6. **Tests**: host/panel/menu/slots/integration unit suites; fingerprint
   verified unchanged (closed generation-relevant set excludes the stand) +
   v2 matrix hash unchanged; `tests/e2e/brewing.spec.ts` journey + lifecycle;
   R-8 closure; C260 matrix row; file-audit manifest rows.

## Compatibility and migration

- No stored/network format change: brewing records reuse the 036
  `SerializedBlockEntity` envelope (`typeKey 'brewing_stand'`, version-gated,
  quarantined like furnaces). Old saves load; foreign/future payloads are
  quarantined, never fatal.
- `PINNED_WORLDGEN_STATE_FINGERPRINT` is verified unchanged (the digest
  covers a closed 14-path generation-relevant set that excludes
  `brewing_stand`; the passing suite is the evidence). The v2 matrix hash
  is terrain-derived and MUST NOT change.
- All existing public APIs keep their signatures (`LiveBlockEntityHost`
  furnace methods, `Inventory.addItem`, `ItemEntityManager` spawn/collect).

## Risks

- **Component loss on overflow drops** (item entities are component-less by
  the 112 contract): mitigated by inventory-direct insertion first; residual
  overflow detaches contents loudly-pinned by unit test, recorded as accepted
  follow-up debt (component-carrying entities = future change).
- **Golden churn**: new atlas tiles/rows and one new block could perturb
  visual goldens or the worldgen matrix — mitigated by fingerprint/matrix
  stability checks + full E2E; any golden diff outside new-item pixels is
  a stop-ship regression.
- **Scope creep into 258/259**: forbidden by override; 258 headed work and
  259 files are untouched (259 reopened only if a brewing regression blocks).
- **Cursor-contents loss on close**: mitigated by component-preserving settle
  helper + E2E close/reopen asserts.

## Rollback strategy

Revert the 260 commit range. Old saves are unaffected (brewing records are
additive envelope rows a pre-260 build ignores/quarantines; no migration ran).

## Definition of Done

- MUST loop playable end-to-end in the browser: place → open → insert →
  brew → collect → reload persists → break cleans up, plus lifecycle
  (walk-away/focus/break-while-open) — all green in `tests/e2e/brewing.spec.ts`.
- Unit suites green (new host/panel/slots/integration suites + full `npm test`
  with zero regressions, incl. the unchanged fingerprint pin).
- `npm run typecheck`, `npm run lint` (0 errors), `npm run build` PASS;
  full `npm run test:e2e` green.
- R-8 brewing half CLOSED in the risk register; PARITY_MATRIX C260 exact.
- State checkpointed, file-audit manifest extended + validated, change
  published to `origin/main`.

## Advancement gate

100% tasks (18/18) with all MUST/SHALL evidenced; floor 90% only via an
explicit Advancement Exception proving every gap is non-blocking and no
MUST/SHALL is unverified. Required tests pass; no unresolved
data-loss/corruption/determinism/compatibility/security/regression blocker.
258 stays BLOCKED; 259 stays VERIFIED.
