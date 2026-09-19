# Proposal: 278-live-villager-trading-ui

## Problem

Changes 150 (`VillagerProfession`) and 151 (`VillagerTrading`) verified the pure
trading rules — per-profession level-gated offer tables, `canAcceptTrade`
eligibility, pure `applyTrade` with use limits and villager XP/level
progression, `restock`, and a `buildTradeMenu` projection into 106's
`ContainerMenu`. As shipped, trading has **no live semantics**:

- no `__trades__` world record exists; no offer uses/XP/level is ever stored;
- the 151 catalog references `emerald`, `bread`, and `paper` keys that have no
  `ItemRegistry` def (no emerald/bread/paper item exists to hold or grant);
- no `TradingPanel` exists; no HUD/key entry opens trading;
- no `Game` seam consumes `applyTrade` — inventory is never debited/credited
  through the 151 core, level-up unlocks never materialize, and
  `noteItemObtained` advancement triggers never fire for trade results;
- zero live consumers of any 150/151 accessor.

## Goals

1. Trade content: `emerald`, `bread`, `paper` items (next free `ItemId`s 68–70,
   original procedural assets only; bread is food) completing the 151 catalog.
   All other 151 keys already resolve (`wheat`, `apple`, `book`, `coal`,
   `iron_ingot`, `wooden_axe`).
2. Persistence: a world-scoped `__trades__` record (versioned, per-profession
   `VillagerTradeState`) with degrade-to-defaults on corrupt/absent payloads,
   reset delete, and archive export/import passthrough, following the
   265–275 raw-metadata precedent.
3. Live store: `Game` owns one `VillagerTradeState` per default profession
   (`farmer`/`librarian`/`weaponsmith`, level 1 at boot); `applyTradeOffer`
   runs the 151 pure core inventory-atomically (insufficient inventory or
   exhausted offer = status-surfaced no-op, inventory and trade state
   unchanged), appends newly unlocked level offers on level-up, persists,
   toasts, and fires the existing item-obtain advancement choke for the
   result.
4. Restock: explicit `restockTrades()` seam (all professions to full uses,
   level/XP kept) persisted; no automatic timers.
5. UI: `TradingPanel` (profession select + offer list + apply + status,
   original DOM/CSS/text only) + HUD `🤝 Trade` button + `KeyT` entry under
   the one-container rule; close on death/respawn, dispose, blur, and when any
   other container opens.
6. Proof: unit + browser E2E — open → select farmer → trade wheat×20 for
   emerald×1 → uses decrement + emerald granted → reload preserves uses/XP →
   exhausted/insufficient/unknown no-ops → lifecycle (close/T/blur/
   one-container/no-double).

## Non-goals

- Village generation, villager entity spawning, workstation POI claiming live,
  schedule/AI wiring (150 assignment/schedule stay headless-only).
- Gossip/reputation price modifiers, timed auto-restock, demand curves.
- Redesigning the 150/151 APIs (consumed as-is; only a level-up unlock merge
  and an item-key→ItemId map are added at the Game boundary).
- Multiplayer trade replication (222–237 own the network boundary).
- 258 headed FPS certification (stays BLOCKED, untouched).

## Preconditions

- 150/151 VERIFIED (pure profession/trading rules, unchanged by this change).
- 259/262 VERIFIED (panel + transactional-craft precedents: enchanting panel
  shape, recipe-book inventory-atomic craft + unlock persistence).
- 263 VERIFIED (item-obtain advancement choke `noteItemObtained` reused).
- 265–275 VERIFIED (raw-metadata persistence + reset/archive + HUD/key shell
  patterns extended, not altered).
- 258 BLOCKED (no headed work in this change).

## Dependencies

- `src/simulation/VillagerTrading.ts` (151): `createVillagerTradeState`,
  `canAcceptTrade`, `applyTrade`, `restock`, `VILLAGER_MAX_LEVEL`,
  `XP_PER_VILLAGER_LEVEL`, `createOffersForProfession` — consumed, not modified.
- `src/simulation/VillagerProfession.ts` (150): default profession keys
  (`farmer`/`librarian`/`weaponsmith`) — catalog reference only.
- `src/engine/Game.ts` 259/262/263/265 wiring (panels, inventory
  remove/add, advancement choke, persistence guards, toasts, HUD chips, E2E
  debug seams) — extended, not altered.
- `src/inventory/ItemRegistry.ts` — extended with 3 items.
- `src/storage/*` 265–275 raw-metadata precedent — extended with one record.

## Proposed change

1. **Registries**: `ItemId.Emerald=68`, `ItemId.Bread=69` (food 5/6.0),
   `ItemId.Paper=70` (stack 64, procedural tiles); unit pins on ids/keys.
2. **Persistence**: `WorldMetadataRepository.putTradingData/getTradingData`
   (`__trades__:<worldId>`); `GamePersistence.initialTradingValue` +
   `saveTrading` + degrade-to-default load + reset snapshot/restore/delete +
   `WorldArchive.tradingData` optional field + `WorldArchiver` export/import
   passthrough; `src/simulation/VillagerTradingPersistence.ts` versioned
   validate-before-accept codec (new, pure, headless-testable).
3. **Live store**: `Game.trades: Record<key, VillagerTradeState>`; boot
   hydration (absent/corrupt ⇒ fresh level-1 states); `getTradingState`,
   `selectTradingProfession`, `applyTradeOffer(professionKey, offerIndex)`,
   `restockTrades()`; level-up merge appends `createOffersForProfession(key,
   newLevel)` rows whose `unlockLevel` exceeds the pre-trade level; inventory
   mapping `TRADE_KEY_TO_ITEM_ID`; removal via `inventory.removeItem`, grant
   via component-preserving add (furnace/brewing precedent); result fires
   `noteItemObtained`.
4. **UI**: `src/ui/TradingPanel.ts` (deps-injected, panel-local selection only;
   render derived from `Game` getters); `index.html` `#trading` dialog +
   `#trading-open` HUD chip; `src/styles` panel CSS (enchanting precedent);
   `KeyT` toggle + HUD button; one-container rule both directions; close on
   `respawnPlayer`, `dispose`, blur/hidden, and when furnace/brewing/
   enchanting/gamerule/recipebook/advancements/statistics/creative/crafting
   opens.
5. **Tests**: codec unit (round-trip, every rejection class, absent⇒defaults);
   registry unit (ids/keys/food); `Game` composition unit (apply success,
   insufficient, exhausted, unknown profession/offer, level-up unlock merge,
   restock, reset/archive, degrade); panel unit (select/apply/status/close);
   new browser E2E `tests/e2e/trading.spec.ts` (journey + lifecycle).

## Compatibility and migration

- New record + 3 new items only; old saves boot with fresh level-1 states.
  No migration needed.
- Reset deletes the record (world returns to fresh states); archives carry
  `tradingData` as an optional field (absent ⇒ defaults on import).
- Saves authored by this build load on older builds with the record inert
  (unknown namespaced raw payloads are never parsed by old code).

## Risks

- Trade-key→ItemId drift if the 151 table grows: the map is exhaustive over
  today's 9 keys with a fail-closed unknown (no-op + status); unit pins the
  key set.
- Level-up merge duplicates: merge filters to `unlockLevel > preLevel` and
  dedupes by `(inputA,inputB,result)` triple; unit pins no-duplicate growth.
- E2E flakiness under software WebGL: reuse the 259/262 harness (seeded world,
  DOM-first assertions, `pagehide` reload); no pointer-lock raycast needed
  (HUD-button open).

## Rollback strategy

Revert the 278 commit range; the `__trades__` record is inert without this
code; the emerald/bread/paper ids simply do not exist on older builds.

## Definition of Done

- All 12 tasks checked with evidence; every MUST/SHALL requirement maps to a
  passing test; baseline gates green (`typecheck`, `lint`, `test`, `build`,
  `test:e2e`); `PARITY_MATRIX.md` C278 row `exact`; 258 still BLOCKED (not
  VERIFIED); 259–277 still VERIFIED.

## Advancement gate

Standard gate: 100% tasks (floor 90% only with an explicit non-blocking
exception), all MUST/SHALL verified, required tests green, no unresolved
data-loss/corruption/determinism/compatibility/security/regression blocker.
