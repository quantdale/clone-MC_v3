# Spec: live-villager-trading

## Contract

Wire the verified headless `VillagerTrading` (151) + `VillagerProfession` (150)
catalog into the live Game as a trading-post UI: world-scoped per-profession
trade states persisted under `__trades__`, three catalog-completing items, an
inventory-atomic apply with level-up unlocks, and a HUD/key panel under the
one-container rule. Village generation, villager spawning, workstation claiming,
gossip, and timers are out of scope.

## Definitions

- **Profession key**: one of `farmer`, `librarian`, `weaponsmith` (the 150
  default catalog).
- **Trade state**: the 151 `VillagerTradeState` (`offers`, `level`, `xp`).
- **Fresh state**: `createVillagerTradeState(key, 1)` (level-1 offers, full uses,
  0 XP).
- **Trading post**: the HUD/KeyT panel entry point (no world block/entity).

## Invariants

- I-1: 150/151 sources are consumed read-only.
- I-2: A refused apply mutates neither inventory nor trade state.
- I-3: `usesRemaining` stays in `[0, maxUses]`; `level` stays in `[1, 5]`.
- I-4: Only the three known profession keys persist; unknown payload keys are
  dropped.

## Requirements

### Requirement: catalog-completing items

The registries SHALL add `emerald`, `bread`, and `paper` items with stable ids
68–70, stack 64, procedural tiles, with bread flagged as food (5 hunger).

#### Scenario: item defs

- **GIVEN** a fresh item registry
- **WHEN** queried for `emerald`, `bread`, `paper`
- **THEN** each exists with the specified id/key/name/tile/stack, bread reports
  `isFood` with hunger 5, and every 151 trade key resolves to an item id.

#### Scenario: no id collision

- **GIVEN** the full item registry
- **WHEN** ids are collected
- **THEN** 68–70 are unique and above the previous maximum (67).

### Requirement: trading persistence

The Game SHALL persist the per-profession map under `__trades__:<worldId>` with
a versioned validate-before-accept codec, load it at boot with
degrade-to-fresh quarantine, delete it on world reset, and carry it through
archive export/import.

#### Scenario: fresh world defaults

- **GIVEN** a world with no `__trades__` record
- **WHEN** the Game boots
- **THEN** each of the three professions holds a fresh level-1 state.

#### Scenario: round-trip

- **GIVEN** a traded state (uses decremented, XP gained)
- **WHEN** saved and reloaded
- **THEN** uses, level, and XP are identical.

#### Scenario: corrupt payload degrades

- **GIVEN** a `__trades__` payload with a wrong version, non-object root,
  unknown-only keys, or an invalid offer row (bad counts, uses out of range,
  bad level/XP)
- **WHEN** loaded
- **THEN** the affected profession degrades to fresh while valid sibling
  professions are kept; boot never throws.

#### Scenario: reset deletes

- **GIVEN** a world with a `__trades__` record
- **WHEN** the world is reset
- **THEN** the record is deleted and the next boot holds fresh states; saves
  after reset are inert until the next trade.

#### Scenario: archive carry

- **GIVEN** a world with trading state
- **WHEN** exported and re-imported
- **THEN** the state is preserved; absent `tradingData` imports as fresh;
  malformed `tradingData` fails the pre-write validation with a throw.

### Requirement: inventory-atomic apply

`Game.applyTradeOffer` SHALL run the 151 pure core atomically against the
player inventory: on success it debits exact declared costs, updates the trade
state (uses −1, XP/level per 151, plus level-up unlock merge), grants the
result (inventory, else world-drop on full), fires the item-obtain advancement
choke, persists, and toasts; on any refusal it SHALL change nothing.

#### Scenario: successful wheat-for-emerald trade

- **GIVEN** farmer with full uses and inventory holding ≥20 wheat
- **WHEN** `applyTradeOffer('farmer', 0)` runs
- **THEN** 20 wheat are removed, 1 emerald is granted, that offer's
  `usesRemaining` drops by 1, XP rises by the offer reward, the payload is
  saved, and the result is `ok:true`.

#### Scenario: insufficient inventory no-op

- **GIVEN** farmer offer 0 and fewer than 20 wheat held
- **WHEN** `applyTradeOffer('farmer', 0)` runs
- **THEN** the result is `ok:false`, inventory counts are unchanged, trade
  state is identical (same reference or deep-equal), and no save occurs.

#### Scenario: exhausted offer no-op

- **GIVEN** an offer with `usesRemaining=0`
- **WHEN** applied with sufficient inventory
- **THEN** the result is `ok:false`, nothing is spent, and state is unchanged.

#### Scenario: unknown profession or offer no-op

- **GIVEN** any inventory
- **WHEN** `applyTradeOffer('not_a_profession', 0)` or `('farmer', 999)` runs
- **THEN** the result is `ok:false` with no mutation.

#### Scenario: level-up unlocks new offers without duplicates

- **GIVEN** a farmer one XP below the level threshold with a fresh lockable
  offer at the next level
- **WHEN** a rewarding trade pushes XP over the threshold
- **THEN** `level` increments per 151 carry rules and the newly unlocked offer
  rows appear exactly once with full uses; a second identical level-up adds no
  duplicates.

#### Scenario: full inventory drops the result without loss

- **GIVEN** a full inventory and a valid trade
- **WHEN** applied
- **THEN** inputs are still debited, trade state still advances, and the result
  stack is spawned in the world (no void).

### Requirement: restock seam

`Game.restockTrades` SHALL reset every offer's `usesRemaining` to `maxUses`
while keeping level/XP, and persist the result.

#### Scenario: restock keeps progression

- **GIVEN** a partially used state with gained XP/level
- **WHEN** `restockTrades()` runs
- **THEN** all uses are full, level/XP are unchanged, and the payload is saved.

### Requirement: trading panel UI

The trading panel SHALL render the profession tabs and the selected
profession's offers (cost → result, uses left, level/XP) from the live `Game`
store, hold only the pending profession/offer selection locally, delegate
apply to `Game.applyTradeOffer`, surface the outcome in `#trading-status`,
and close safely.

#### Scenario: open shows professions and offers

- **GIVEN** a live `Game` with fresh states
- **WHEN** the trading panel opens on `farmer`
- **THEN** three profession tabs render, the farmer offer rows show costs,
  results, and full uses, and `#trading-status` holds the idle text.

#### Scenario: select then apply delegates once

- **GIVEN** an open panel with a valid offer selected
- **WHEN** Apply is pressed
- **THEN** the delegate runs once, success clears the selection and shows the
  trade summary, failure keeps inventory/state unchanged and shows the reason.

#### Scenario: invalid selection never applies

- **GIVEN** an out-of-range offer index or an empty offer
- **WHEN** selected or applied
- **THEN** no delegate call occurs and the selection is unchanged/cleared.

#### Scenario: null session renders closed

- **GIVEN** no trading store (null deps)
- **WHEN** rendered
- **THEN** the panel hides without throwing and never shows stale offers.

### Requirement: shell and lifecycle

Trading SHALL open via the HUD `🤝 Trade` button and `KeyT`, obey the
one-container rule in both directions, and close on death/respawn, dispose,
and sibling-panel open without mutating state; blur/hidden keeps the panel
open exactly once with no stacking (271 precedent).

#### Scenario: KeyT toggles

- **GIVEN** a running game with no container open
- **WHEN** `KeyT` is pressed
- **THEN** trading opens; a second `KeyT` closes it.

#### Scenario: one-container rule

- **GIVEN** trading open
- **WHEN** crafting/furnace/brewing/enchanting/gamerule/recipebook/
  advancements/statistics/creative opens
- **THEN** trading closes; opening trading closes any of those first.

#### Scenario: death closes without mutation

- **GIVEN** trading open
- **WHEN** the player dies and `respawnPlayer` runs
- **THEN** trading is closed and trade states are unchanged except the
  pre-death persisted values.

#### Scenario: blur keeps without mutation

- **GIVEN** trading open
- **WHEN** the window blurs or hides
- **THEN** trading stays open exactly once with no state mutation.

## Error and failure behavior

- Unmapped trade keys (future 151 growth) fail closed: apply returns
  `ok:false` with `Unknown trade.` and mutates nothing; the codec drops
  unparsable rows per profession.
- `removeItem` shortfalls after the count pre-check abort before the pure
  apply (defensive; covered by unit).
- Archive malformed `tradingData` throws pre-write (archiver precedent);
  import-absent means fresh.

## Performance and resource bounds

- No per-tick work. Saves occur once per successful apply/restock (3 × ≤6
  offers). Panel renders are signature-gated; no per-frame DOM writes.

## Compatibility and migration

- Additive record + items only. Old saves boot fresh; reset deletes; archives
  carry optionally; older builds ignore the unknown raw key.

## Security and integrity

- No network, no eval, no new storage origins. Inventory debit precedes the
  pure apply so no duplication path exists; full-inventory drops via the
  existing world-drop path (no void, no dupe).

## Observability

- `#trading-status` (`role=status`) + toasts surface outcomes; `getTradingState`
  exposes the store for tests/E2E.

## Verification mapping

- Codec + reset/archive: `tests/unit/VillagerTradingPersistence.test.ts`.
- Items: `tests/unit/TradingItems.test.ts`.
- Store/rules: `tests/unit/LiveVillagerTrading.test.ts`.
- Panel: `tests/unit/TradingPanel.test.ts`.
- Journey + lifecycle: `tests/e2e/trading.spec.ts`.
- Gates: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e`, `npm run validate-state`.
