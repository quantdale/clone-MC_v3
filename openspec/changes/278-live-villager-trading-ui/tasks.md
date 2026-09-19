# Tasks: 278-live-villager-trading-ui

## A. Control plane

- [x] T1. Control-plane entries: 278 row in `CHANGE_SEQUENCE.md`, 278
  authorization in `CHANGE_SEQUENCE_OVERRIDES.md` (2026-09-19 campaign through
  300; 258 BLOCKED), `PROGRAM_STATE.json`/`.md` activation
  (`currentChange=278-live-villager-trading-ui` ACTIVE, `lastCompleted=277`,
  258 BLOCKED). Session start `3b60c6e`.
- [x] T2. Package quality gate (SPEC_AUTHORING_PROTOCOL): number/name matches
  sequence; previous change VERIFIED; one narrow outcome; proposal/design/spec
  structures complete; every MUST/SHALL has a scenario; tasks cover
  impl/unit/E2E/edge/regression/docs/gate; verification mapping declared; no
  vague placeholders; no later-change scope.

## B. Content + persistence

- [x] T3. Trade items: `ItemId.Emerald=68`, `ItemId.Bread=69` (food 5/6.0),
  `ItemId.Paper=70` + defs (stack 64, procedural tiles); unit
  (`TradingItems.test.ts`): ids/keys/names/tiles/food flags.
- [x] T4. `__trades__` codec + record: NEW
  `src/simulation/VillagerTradingPersistence.ts` (versioned
  validate-before-accept, per-profession fail-closed, unknown keys dropped);
  `WorldMetadataRepository.putTradingData/getTradingData`;
  `GamePersistence.initialTradingValue + saveTrading` + open bulk-load
  degrade + reset snapshot/restore/delete; unit
  (`VillagerTradingPersistence.test.ts`): round-trips, every rejection class,
  absent⇒defaults, post-reset inert saves.
- [x] T5. Archive passthrough: `WorldArchive` optional `tradingData` +
  validation, `WorldArchiver` export/import (+ report flag), unit cases
  (absent ⇒ defaults, malformed ⇒ pre-write throw, round-trip preserves).

## C. Live store + rules

- [x] T6. `Game` trading store: field + boot hydration (fresh level-1 states on
  absent/corrupt), `getTradingState/getTradingProfession/
  selectTradingProfession/applyTradeOffer/restockTrades/saveTrading`,
  item-key→ItemId map (exhaustive, fail-closed), inventory-atomic apply through
  the 151 pure core, level-up unlock merge (no duplicates), full-inventory
  world-drop (no loss), `noteItemObtained` hook, `saveTrading` guards;
  composition unit (`LiveVillagerTrading.test.ts`): success, insufficient,
  exhausted, unknown profession/offer, unmapped key, level-up merge,
  restock, degrade, guards.
- [x] T7. Shell + lifecycle: `TradingPanel` (NEW `src/ui/TradingPanel.ts`)
  profession/offer select + apply + status; `index.html` `#trading` dialog +
  `#trading-open` HUD chip + CSS; `KeyT` toggle + HUD button; one-container
  rule both directions; close on `respawnPlayer`/`dispose`/blur/hidden +
  sibling opens; toasts; unit (`TradingPanel.test.ts`): select/apply/status/
  close/aria.

## D. Browser E2E

- [x] T8. E2E trading journey (NEW `tests/e2e/trading.spec.ts`): open via HUD →
  farmer tab → wheat×20 → emerald×1 uses decrement + emerald granted → reload
  (`pagehide`) preserves uses/XP → second trade → XP/level reflected.
- [x] T9. E2E lifecycle + edges: close/T/blur/no-double/one-container (open
  trading closes crafting and vice versa); insufficient (no wheat) no-op with
  status + inventory unchanged; exhausted offer no-op; real-DOM toast/HUD legs.

## E. Gate

- [x] T10. Regression: 259–277 E2E unmodified + green; full unit suite green;
  no 259–277 source touched except additive Game/storage/registry/shell seams.
- [x] T11. Full gates: `typecheck`, `lint`, `test`, `build`, `test:e2e` green;
  file-audit clean; `validate-state` PASS.
- [x] T12. Reconciliation + `PARITY_MATRIX.md` C278 `exact` row + publish
  `origin/main` + final report (SHAs, completion, validations, blockers, next
  action: 279).
