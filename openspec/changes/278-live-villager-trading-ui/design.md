# Design: 278-live-villager-trading-ui

## Context/current state

- `src/simulation/VillagerTrading.ts` (151) is pure and unconsumed: offer tables
  per profession key, `canAcceptTrade`, `applyTrade` (decrement + XP/level, no
  unlock merge), `restock`, `buildTradeMenu` (106 projection, headless-only).
- `src/simulation/VillagerProfession.ts` (150) owns the profession registry
  (`farmer`/`librarian`/`weaponsmith`) plus assignment/schedule (both stay
  headless in 278).
- `ItemRegistry` ends at `ItemId.Bed=67`; the 151 keys `emerald`/`bread`/`paper`
  have no def. All other 151 keys resolve to existing defs.
- `Game` (engine) owns analogous world-scoped stores (`__gamemode__`,
  `__statistics__`, `__sleep__`, `__weather__`) with the same load/save/reset/
  archive shape 278 reuses. Panels (`EnchantingPanel`, `RecipeBookPanel`, …)
  follow the deps-injected render-from-Game shape with the one-container rule.
- No `__trades__` key exists in `WorldMetadataRepository`, `GamePersistence`,
  `WorldArchive`, or `WorldArchiver`.

## Target state

- `Game.trades: Record<ProfessionKey, VillagerTradeState>` (exactly the three
  default keys, level-1 fresh at boot) is the live authority; every render and
  every apply derives from it.
- `__trades__:<worldId>` persists the versioned map; boot degrades to fresh
  states; reset deletes; archives carry it optionally.
- `TradingPanel` renders profession tabs + offer rows (cost → result, uses left,
  level/XP) with a pending selection; Apply delegates to
  `Game.applyTradeOffer` which alone mutates inventory + trade state.
- HUD `#trading-open` + `KeyT` toggle; one-container rule; close on death,
  dispose, blur, and sibling-panel open.

## Invariants

- I-1: 150/151 sources are consumed read-only (no edits to either file).
- I-2: Worlds without `__trades__` boot with fresh level-1 states (pre-278
  behavior = no trading, now = fresh trading; no world-gen change).
- I-3: A refused apply mutates neither inventory nor trade state (atomic).
- I-4: `usesRemaining` never exceeds `maxUses` and never goes negative.
- I-5: Level never exceeds `VILLAGER_MAX_LEVEL`; XP carries per 151 rules.
- I-6: 259–277 behavior is unchanged for non-trading flows.

## API and data model

```ts
// New pure codec (src/simulation/VillagerTradingPersistence.ts)
export interface PersistedTradeState { version: 1; level: number; xp: number; offers: PersistedOffer[]; }
export interface PersistedOffer { inputA: TradeItem; inputB: TradeItem | null; result: TradeItem; maxUses: number; usesRemaining: number; xpReward: number; unlockLevel: number; }
export type PersistedTrades = Record<string, PersistedTradeState>;
export function serializeTrades(states: Record<string, VillagerTradeState>): PersistedTrades;
export function deserializeTrades(payload: unknown): Record<string, VillagerTradeState> | null; // null = degrade
export const TRADING_STORE_VERSION = 1;
export const TRADING_PROFESSIONS: readonly string[] = ['farmer', 'librarian', 'weaponsmith'];

// Item-key → ItemId map (src/engine/Game.ts boundary, exhaustive over today's 9 keys)
const TRADE_KEY_TO_ITEM_ID: Record<string, number> = {
  wheat: ItemId.Wheat, emerald: ItemId.Emerald, bread: ItemId.Bread, apple: ItemId.Apple,
  paper: ItemId.Paper, book: ItemId.Book, coal: ItemId.Coal,
  iron_ingot: ItemId.IronIngot, wooden_axe: ItemId.WoodenAxe,
};

// Game seams
getTradingState(professionKey: string): VillagerTradeState | null;
getTradingProfession(): string; // selected tab, default 'farmer'
selectTradingProfession(key: string): boolean;
applyTradeOffer(professionKey: string, offerIndex: number): { ok: boolean; reason?: string };
restockTrades(): void;
saveTrading(): void;
isTradingOpen(): boolean;
```

Level-up merge: `pre = state.level` before `applyTrade`; `post = result.state`;
when `post.level > pre`, append `createOffersForProfession(key, post.level)`
rows with `unlockLevel > pre` whose `(inputA.item,inputA.count,inputB?.item,
inputB?.count,result.item,result.count)` triple is absent, each with full uses.

## Control/data flow

1. Boot: `GamePersistence.open` bulk-loads `__trades__` raw → `deserializeTrades`
   (null ⇒ fresh); late-load parity mirrors sleep/weather (constructor default
   then self-open replace).
2. Open: HUD/KeyT → close siblings → `tradingPanel.show()` + render.
3. Select: panel-local `profession + offerIndex` (validated against live state;
   invalid ⇒ no-op, selection cleared).
4. Apply: panel calls `Game.applyTradeOffer` → resolve ItemIds → check
   `canAcceptTrade` over inventory counts → `inventory.removeItem` inputs →
   `applyTrade` pure → level-up merge → grant result via inventory add →
   `noteItemObtained(resultId)` → `saveTrading()` → toast + panel render.
   Any failure before the pure apply returns `{ok:false}` with inventory and
   trade state untouched.
5. Restock: `restockTrades()` maps `restock()` over all professions, persists.
6. Teardown: `respawnPlayer`, `dispose`, and sibling open all close the
   panel (selection cleared, no state mutation); blur/hidden keeps it open
   exactly once (271 precedent).

## Detailed behavior

- Profession select with an unknown key is a no-op returning false (selection
  unchanged).
- Offer index out of range, exhausted offer (`usesRemaining<=0`), insufficient
  inventory for either input, or unmapped item key ⇒ `{ok:false}` + status text;
  nothing is spent and `saveTrading` is not called.
- Successful apply debits exact declared costs (`consumedA`/`consumedB` from the
  pure result), never the offered surplus.
- Result grant uses the furnace/brewing component-preserving add path; when the
  inventory is full the result is dropped via `itemEntities.spawnLootStacks`
  at the player (no loss), matching the no-loss precedent.
- Toasts: success `Traded <cost> → <result> (<profession> Lv<level>)`; failure
  reasons (`Need <n>× <name>.`, `Offer exhausted — restock soon.`,
  `Unknown trade.`); level-up appends ` — new offers unlocked!`.
- `saveTrading` guards mirror `saveGameMode` (no-op without persistence or
  while recovery-required).

## Failure modes

- Corrupt/absent `__trades__` ⇒ fresh states (quarantine, no throw to boot).
- Unknown profession keys in payload ⇒ dropped (only the three known keys
  survive, each validated; extra keys ignored).
- Invalid offer rows (bad counts, `usesRemaining>maxUses`/negative, bad levels)
  ⇒ whole profession degraded to fresh (fail-closed per profession, other
  professions kept when valid).
- `removeItem` partial (should not happen after the count check) ⇒ abort before
  the pure apply (defensive re-check; no state mutation).
- Full inventory on grant ⇒ world drop, never void.

## Compatibility/migration

- Additive only: new record + 3 items. Old saves boot fresh; reset deletes;
  archives carry optional `tradingData` (absent ⇒ fresh on import; malformed ⇒
  pre-write throw per archiver precedent).
- Older builds ignore `__trades__` (unknown raw key, never parsed).

## Performance/resource constraints

- Trade states are 3 × ≤5 offers; serialize/deserialize is O(offers) per
  save/load plus one save per successful trade/restock. No tick work. Panel
  render is signature-gated (enchanting precedent) — no per-frame DOM churn.

## Testing seams

- Existing `noteItemObtained`, `showToast`, inventory count/remove/add, and
  `itemEntities.spawnLootStacks` are reused (no new seams except the public
  `restockTrades` + `getTradingState` accessors, both production API).
- E2E uses the seeded-world + HUD-button + `pagehide` reload harness
  (259/262 precedent); a `debugGrantItems` path already exists via creative
  grant (`grantCreativeItem`) so no new cheat seam is added — tests grant via
  creative mode or start with wheat seeded through the inventory debug hook
  used by 262's E2E.

## Observability/debugging

- Status line in the panel (`#trading-status`, `role=status`) surfaces the last
  apply outcome; toasts mirror it.
- `getTradingState`/`getTradingProfession` expose the store for E2E/DOM
  assertions.

## Affected files/symbols

- NEW `src/simulation/VillagerTradingPersistence.ts` (codec).
- NEW `src/ui/TradingPanel.ts` (+ tests).
- EDIT `src/inventory/ItemRegistry.ts` (`ItemId` + 3 defs).
- EDIT `src/storage/WorldMetadataRepository.ts` (put/get `__trades__`).
- EDIT `src/storage/GamePersistence.ts` (`initialTradingValue`, `saveTrading`,
  open bulk-load, reset snapshot/restore/delete).
- EDIT `src/storage/WorldArchive.ts` + `WorldArchiver.ts` (+ report flag).
- EDIT `src/engine/Game.ts` (store, hydration, seams, shell, teardown,
  advancement hook, save calls at autosave/dispose/pagehide).
- EDIT `index.html` (`#trading` dialog + `#trading-open` chip) + panel CSS.
- NEW `tests/unit/VillagerTradingPersistence.test.ts`,
  `tests/unit/TradingPanel.test.ts`, `tests/unit/LiveVillagerTrading.test.ts`,
  `tests/unit/TradingItems.test.ts`.
- NEW `tests/e2e/trading.spec.ts`.
- EDIT `PARITY_MATRIX.md` (C278 row), `PROGRAM_STATE.*`, `CHANGE_SEQUENCE*`.

## Rejected alternatives

- Villager-entity interaction open (raycast → entity): rejected — no villager
  spawning exists (150 blocker); a trading-post HUD entry is reachable today
  and the entity path remains a clean follow-up.
- `ContainerMenu` (106) apply path via `buildTradeMenu`: rejected for live —
  the 151 projection slots are previews without write-protection; direct
  inventory-atomic apply (recipe-book precedent) is safer and simpler.
- Automatic timed restock: rejected — no workstation/day-clock owner exists in
  278; explicit restock keeps determinism and scope narrow.

## Downstream dependencies

- Future village generation / villager spawning (opens trading via entity
  interact while reusing this store/panel/persistence verbatim).
- Future workstation-claim restock (calls `restockTrades` on claim/day).
- Future multiplayer trade replication (server-owns `__trades__` codec).
