# Spec: villager-trading

## Contract
This capability adds the villager trade-offer model: per-profession level-gated offers, eligibility
checking, a pure trade application with use limits and villager XP/level progression, restocking,
and a projection into 106's `ContainerMenu`. No DOM trading UI, no `Game` wiring, no player-inventory
integration, no gossip/reputation price modifiers, no persistence, no automatic timed restock — see
the proposal's Non-goals.

## Definitions
- **Offer**: a `TradeOffer` — one or two required input items, one result item, a use limit, a
  remaining-use counter, an XP reward, and an unlock level.
- **Exhausted**: an offer whose `usesRemaining` is `0`.
- **Villager level**: `VillagerTradeState.level`, in `[1, VILLAGER_MAX_LEVEL]`, raised by
  accumulated trade XP.

## Invariants
- `applyTrade` never mutates its inputs; a rejected trade returns the same state reference with
  `result: null`.
- A successful trade decrements exactly one offer's `usesRemaining` by exactly 1, never below 0.
- An exhausted offer is never acceptable and never applies.
- Villager `level` only rises and is clamped at `VILLAGER_MAX_LEVEL`.
- `restock` sets every offer's `usesRemaining` to its `maxUses`, leaving level/XP unchanged.
- `buildTradeMenu` produces exactly `3 + playerSlots.length` slots with `playerSlotStart === 3`.

## Requirements

### Requirement: createOffersForProfession returns only offers unlocked at or below the level
`createOffersForProfession(professionKey, level)` MUST return exactly the offers whose
`unlockLevel <= level` for that profession, each with `usesRemaining === maxUses`, and MUST return
an empty array for an unknown profession key without throwing.

#### Scenario: level 1 yields only the level-1 offers
- **GIVEN** the `farmer` profession
- **WHEN** `createOffersForProfession('farmer', 1)` is called
- **THEN** every returned offer has `unlockLevel === 1` and `usesRemaining === maxUses`

#### Scenario: a higher level unlocks more offers
- **GIVEN** the `farmer` profession
- **WHEN** `createOffersForProfession('farmer', 3)` is called
- **THEN** it returns strictly more offers than the level-1 call, all with `unlockLevel <= 3`

#### Scenario: an unknown profession yields no offers
- **GIVEN** the key `'not_a_profession'`
- **WHEN** `createOffersForProfession` is called with it
- **THEN** it returns an empty array and does not throw

### Requirement: canAcceptTrade validates items, counts, and exhaustion
`canAcceptTrade` MUST return `true` only when the offer has `usesRemaining > 0`, `offeredA` matches
`inputA`'s item with a count `>=` its required count, and (when `inputB` is non-null) `offeredB`
likewise matches. It MUST return `false` otherwise.

#### Scenario: a sufficient offering is accepted
- **GIVEN** an offer requiring `wheat×20` with uses remaining
- **WHEN** `canAcceptTrade` is called with `wheat×20`
- **THEN** it returns `true`

#### Scenario: an insufficient count is rejected
- **GIVEN** the same offer
- **WHEN** `canAcceptTrade` is called with `wheat×19`
- **THEN** it returns `false`

#### Scenario: a wrong item is rejected
- **GIVEN** the same offer
- **WHEN** `canAcceptTrade` is called with `paper×20`
- **THEN** it returns `false`

#### Scenario: an exhausted offer is rejected
- **GIVEN** an otherwise-satisfiable offer with `usesRemaining === 0`
- **WHEN** `canAcceptTrade` is called with a sufficient offering
- **THEN** it returns `false`

#### Scenario: a missing required second input is rejected
- **GIVEN** an offer whose `inputB` is non-null
- **WHEN** `canAcceptTrade` is called with a valid `offeredA` but `offeredB` of `null`
- **THEN** it returns `false`

### Requirement: applyTrade yields the result, consumes uses, and awards villager XP
A successful `applyTrade` MUST return the offer's `result`, the exact `consumedA`/`consumedB` input
costs, a new state whose offer has one fewer remaining use, and the villager's XP increased by the
offer's `xpReward`. A rejected `applyTrade` MUST return `result: null` and the unchanged state.

#### Scenario: a valid trade succeeds and decrements uses
- **GIVEN** a fresh `farmer` trade state and a sufficient offering for offer 0
- **WHEN** `applyTrade(state, 0, offering, null)` is called
- **THEN** `result` equals the offer's result, the returned state's offer 0 has
  `usesRemaining === maxUses - 1`, and the returned state's `xp` increased by the offer's
  `xpReward`

#### Scenario: an ineligible trade is rejected without changing state
- **GIVEN** a fresh trade state
- **WHEN** `applyTrade` is called with an insufficient offering
- **THEN** `result` is `null` and the returned state is the same, unchanged state

#### Scenario: an out-of-range offer index is rejected, not thrown
- **GIVEN** a trade state with 1 offer
- **WHEN** `applyTrade(state, 99, offering, null)` is called
- **THEN** it returns `result: null` without throwing

### Requirement: villager level rises at the XP threshold and is capped
`applyTrade` MUST raise `level` by one for each full `XP_PER_VILLAGER_LEVEL` of accumulated XP,
and MUST NOT raise `level` above `VILLAGER_MAX_LEVEL`.

#### Scenario: accumulated XP raises the level
- **GIVEN** a trade state at level 1 and an offer with a positive `xpReward`
- **WHEN** enough successful trades are applied to accumulate `XP_PER_VILLAGER_LEVEL` XP
- **THEN** the resulting state's `level` is `2`

#### Scenario: level never exceeds the maximum
- **GIVEN** a trade state already at `VILLAGER_MAX_LEVEL`
- **WHEN** further successful trades award XP
- **THEN** `level` remains `VILLAGER_MAX_LEVEL`

### Requirement: restock resets every offer's remaining uses
`restock(state)` MUST return a new state in which every offer's `usesRemaining` equals its
`maxUses`, with `level` and `xp` unchanged.

#### Scenario: a partially used offer is restocked
- **GIVEN** a state whose offer 0 has been used at least once
- **WHEN** `restock` is called
- **THEN** offer 0's `usesRemaining` equals its `maxUses`, and `level`/`xp` are unchanged

### Requirement: buildTradeMenu projects an offer into a container menu
`buildTradeMenu(state, offerIndex, playerSlots)` MUST return a `ContainerMenu` with exactly
`3 + playerSlots.length` slots and `playerSlotStart === 3`, where slot 0 previews `inputA`, slot 1
previews `inputB` (or is empty when the offer has none), and slot 2 previews `result`.

#### Scenario: a single-input offer projects correctly
- **GIVEN** an offer with no `inputB` and 4 player slots
- **WHEN** `buildTradeMenu` is called
- **THEN** the menu has 7 slots, `playerSlotStart === 3`, slot 0 holds `inputA`'s item/count, slot 1
  is empty, and slot 2 holds `result`'s item/count

## Error and failure behavior
- No function in this module throws for well-formed inputs; every ineligible case is a rejection.
- `buildTradeMenu` surfaces 106's existing `createContainerMenu` validation error for a malformed
  caller-supplied player slot.

## Performance and resource bounds
- Every function is O(offers) at worst; `buildTradeMenu` is O(playerSlots).

## Compatibility and migration
- One new, additive file; no existing module edited; no schema/save-format change (session-only).

## Security and integrity
- All inputs are caller-supplied plain data values; no new untrusted input surface.

## Observability
- `VillagerTradeState` is a plain, fully-inspectable data object.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 createOffersForProfession level-gating | `tests/unit/VillagerTrading.test.ts` offer-table cases |
| REQ-2 canAcceptTrade validation | canAcceptTrade accept/reject cases |
| REQ-3 applyTrade result/uses/XP | applyTrade success + rejection + bad-index cases |
| REQ-4 level threshold + cap | level-up and level-cap cases |
| REQ-5 restock resets uses | restock case |
| REQ-6 buildTradeMenu projection | buildTradeMenu layout case |
