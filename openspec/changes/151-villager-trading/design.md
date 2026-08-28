# Design: 151-villager-trading

## Context/current state
- 150's `VillagerProfession` carries only `id`/`key`/`workstationType` — no trade data. 151 keys
  its offer table off the profession's `key` string rather than extending `VillagerProfession`
  itself, so 150's file is not modified (matching how 146 declared its own `HostileMobWorld` rather
  than editing 145's).
- 106's `MenuSlot` uses a **string** `item` field (an item key, not a numeric id) and a per-slot
  `maxStack`; `createContainerMenu(slots, playerSlotStart)` validates and returns an empty-cursor
  menu. `applyMenuTransaction` has no notion of a read-only slot — a result slot cannot be
  write-protected at this layer (flagged in the proposal's Risks).
- 120's `EnchantingTableSession` is the closest existing precedent for this change's shape: a
  session/state object plus a pure `apply` that returns an outcome and never touches
  `Inventory`/`Game`, with its DOM panel explicitly deferred. 151 follows it exactly.

## Target state
- `src/simulation/VillagerTrading.ts`: the offer/state model, a deterministic per-profession offer
  table, pure `canAcceptTrade`/`applyTrade`/`restock`, and a `buildTradeMenu` projection into 106's
  `ContainerMenu`.

## Invariants
- `applyTrade` is pure: it never mutates the supplied `state` or input stacks; it returns a new
  state object on success, and on rejection returns the *same* state reference with `result: null`.
- A successful `applyTrade` decrements exactly one offer's `usesRemaining` by exactly 1, never below
  0, and never touches any other offer.
- An offer with `usesRemaining === 0` is never acceptable (`canAcceptTrade` is `false`) and
  `applyTrade` always rejects it.
- Villager XP only ever increases through `applyTrade`; `level` only ever rises, never falls, and is
  clamped at `VILLAGER_MAX_LEVEL`.
- `restock(state)` returns a new state in which every offer's `usesRemaining === maxUses`, leaving
  level/XP and the offer list's order/content otherwise unchanged.
- `buildTradeMenu` always produces exactly `3 + playerSlots.length` slots with
  `playerSlotStart === 3` (two input slots then the result slot, then the player region).

## API and data model
```ts
// src/simulation/VillagerTrading.ts

/** One side of a trade: an item key and a positive count. */
export interface TradeItem {
  readonly item: string;
  readonly count: number;
}

export interface TradeOffer {
  readonly inputA: TradeItem;
  readonly inputB: TradeItem | null;   // vanilla's optional second input
  readonly result: TradeItem;
  readonly maxUses: number;
  readonly usesRemaining: number;
  readonly xpReward: number;
  /** Villager level at which this offer unlocks (1 = available from the start). */
  readonly unlockLevel: number;
}

export interface VillagerTradeState {
  readonly offers: readonly TradeOffer[];
  readonly level: number;
  readonly xp: number;
}

export const VILLAGER_MAX_LEVEL = 5;
export const XP_PER_VILLAGER_LEVEL = 10;

export function createOffersForProfession(professionKey: string, level: number): TradeOffer[];
export function createVillagerTradeState(professionKey: string, level?: number): VillagerTradeState;
export function canAcceptTrade(offer: TradeOffer, offeredA: TradeItem | null, offeredB: TradeItem | null): boolean;

export interface TradeResult {
  readonly state: VillagerTradeState;
  readonly result: TradeItem | null;   // null iff the trade was rejected
  readonly consumedA: TradeItem | null;
  readonly consumedB: TradeItem | null;
}

export function applyTrade(
  state: VillagerTradeState,
  offerIndex: number,
  offeredA: TradeItem | null,
  offeredB: TradeItem | null,
): TradeResult;

export function restock(state: VillagerTradeState): VillagerTradeState;

export function buildTradeMenu(
  state: VillagerTradeState,
  offerIndex: number,
  playerSlots: readonly MenuSlot[],
): ContainerMenu;
```

## Control/data flow
1. **Offer creation** (a future villager-AI change, once a villager exists):
   `createVillagerTradeState(profession.key)` → offers unlocked at level 1.
2. **Eligibility check** (a future UI, as the player fills the input slots):
   `canAcceptTrade(state.offers[i], slotAStack, slotBStack)`.
3. **Trade** (the future UI's "take the result" action): `applyTrade(state, i, a, b)` → on success,
   the caller deducts `consumedA`/`consumedB` from the player's `Inventory`, inserts `result`, and
   stores the returned `state`; on rejection (`result === null`) it does nothing.
4. **Level-up**: inside `applyTrade`, `xp += offer.xpReward`; while `xp >= XP_PER_VILLAGER_LEVEL`
   and `level < VILLAGER_MAX_LEVEL`, subtract `XP_PER_VILLAGER_LEVEL` and increment `level`. At
   `VILLAGER_MAX_LEVEL` the XP counter stops accumulating further levels (excess XP is retained in
   `xp` but no longer converts).
5. **Restock** (a future workday-schedule trigger using 150's `scheduleForHour`):
   `restock(state)`.
6. **Menu projection** (a future container screen): `buildTradeMenu(state, i, playerSlots)`.

## Detailed behavior
- The offer table is a plain module-level record keyed by profession key. Each profession gets three
  offers spanning `unlockLevel` 1/2/3 so level-gating is testable:
  - `farmer`: wheat×20 → emerald×1 (L1); emerald×1 → bread×6 (L2); emerald×3 → apple×4 (L3).
  - `librarian`: paper×24 → emerald×1 (L1); emerald×9 → book×1 (L2); emerald×5+book×1 → book×1 (L3,
    exercising the optional second input).
  - `weaponsmith`: coal×15 → emerald×1 (L1); emerald×7 → iron_ingot×1 (L2); emerald×36 →
    wooden_axe×1 (L3).
  An unknown profession key yields `[]` (no throw) — a caller passing an unregistered key gets an
  empty, harmless offer list rather than an exception.
- `createOffersForProfession(key, level)` filters that table to `unlockLevel <= level`, returning
  fresh offer objects each call (each with `usesRemaining === maxUses`), so two calls never share
  mutable state.
- `canAcceptTrade` requires: `usesRemaining > 0`; `offeredA` non-null with a matching `item` and
  `count >= inputA.count`; and, when `offer.inputB !== null`, `offeredB` likewise matching. When
  `offer.inputB === null`, `offeredB` is ignored entirely (a stray second stack does not block the
  trade — matching vanilla, where the second slot is simply unused).
- `applyTrade` rejects (returning the same `state` reference, `result: null`) for an out-of-range
  `offerIndex` as well as any `canAcceptTrade` failure — an out-of-range index is a *rejection*, not
  a throw, unlike 106's `applyMenuTransaction` (which throws on a bad slot index); documented here
  because the two neighboring modules deliberately differ, and this module's contract is
  "never throw for well-formed inputs."
- `consumedA`/`consumedB` report exactly the offer's declared input costs (not the full offered
  stacks), so the caller knows precisely how much to deduct.
- `buildTradeMenu` builds slot 0 = `inputA` (as a *requirement preview*: the offer's declared input
  item/count), slot 1 = `inputB` or an empty slot, slot 2 = `result`, then appends `playerSlots`;
  `playerSlotStart` is `3`. `maxStack` is a fixed `64` for the three trade slots (the trade slots
  are not real inventory storage; a future UI can override if it needs per-item caps).

## Failure modes
- No function in this module throws for well-formed inputs; every ineligible case is a rejection
  (`result: null` / `false` / `[]`).
- `buildTradeMenu` delegates to `createContainerMenu`, which validates and will throw for a
  malformed caller-supplied `playerSlots` entry — that is 106's existing contract, surfaced
  unchanged.

## Compatibility/migration
- One new, additive file. No existing module edited; no `Game.ts` edit; no schema/save-format
  change; trade state is session-only.

## Performance/resource constraints
- Every function is O(offers) at worst (a small fixed list); `buildTradeMenu` is O(playerSlots).

## Testing seams
- Everything is tested standalone with plain object literals — no `Inventory`, `Game`, `World`, or
  `EntityManager` dependency. `buildTradeMenu` is validated against real 106 `MenuSlot` inputs.

## Observability/debugging
- `VillagerTradeState` is a plain data object, fully inspectable; no separate debug hook needed.

## Affected files/symbols
- `src/simulation/VillagerTrading.ts` (new).
- Tests: `tests/unit/VillagerTrading.test.ts` (new).

## Rejected alternatives
- **Extending 150's `VillagerProfession` with a `trades` field**: rejected — it would edit 150's
  file for no functional gain; keying the table off the profession `key` string keeps both modules
  independent, mirroring 146's identical decision not to edit 145's `PassiveMobBaseline.ts`.
- **Building the DOM trading screen in this change**: rejected — 203
  (`container-screen-framework`) is the titled change for reusable menu UI, and 120 set the
  precedent of shipping session state with its panel deferred.
- **Modeling price adjustment (demand drift / reputation discounts) now**: rejected — vanilla's
  price layer depends on gossip/reputation, which the master plan lists as its own separate concern;
  fixed costs are the correct baseline.
- **Making `applyTrade` throw on an out-of-range `offerIndex`** (matching 106's `applyMenuTransaction`
  index behavior): rejected — this module's contract is total/non-throwing, matching the far more
  common convention across 129/141/147/149/150; the divergence is documented above rather than left
  implicit.

## Downstream dependencies
- 203 (`container-screen-framework`) / a future villager-AI-wiring change are the real consumers:
  they render `buildTradeMenu`'s output, gate the result slot, and route `applyTrade`'s outcome
  through a real `Inventory`.
- A future workday-schedule change consumes 150's `scheduleForHour` to trigger `restock`.
