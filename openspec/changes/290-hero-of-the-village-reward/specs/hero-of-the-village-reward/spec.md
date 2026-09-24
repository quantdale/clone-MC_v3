# Spec: hero-of-the-village-reward

## Contract

On the exactly-once live transition of a raid into `VICTORY`, the Game MUST
grant the player Hero of the Village through the existing status-effect runtime
and MUST apply a vanilla-like emerald trading discount while that effect is
active. `DEFEAT` MUST grant nothing. This capability owns the reward and
discount only; raid progression, wave combat, village detection, and trading
catalog persistence remain prior changes.

## Definitions

- **HOTV**: status effect type `minecraft:effect/hero_of_the_village`.
- **Amplifier**: non-negative integer effect level index (0 = Level I).
- **Grant transition**: an in-session assignment where previous raid status was
  not `VICTORY` and the new status is `VICTORY`.
- **Emerald input**: a `TradeItem` whose `item === 'emerald'`.
- **Ephemeral effect**: an effect held only in `playerEffects` for the current
  runtime session (not written to player-state / world metadata).

## Invariants

- I1. A single grant transition MUST produce at most one HOTV `add` for that
  transition (manager stacking on a *later* distinct VICTORY is allowed).
- I2. `DEFEAT` MUST NOT grant HOTV.
- I3. Hydrating or retaining an already-`VICTORY` raid state MUST NOT grant HOTV.
- I4. Discounted emerald counts MUST be integers ≥ 1 when the base count was ≥ 1.
- I5. `__trades__` stored offers MUST remain undiscounted catalog values.
- I6. No new persistence/archive namespace is introduced by this change.
- I7. Change 258 remains BLOCKED; this change MUST NOT perform headed GPU/FPS
  certification or fabricate GPU evidence.

## Requirements

### Requirement: Registry bounds for Hero of the Village

The default status-effect registry entry for `hero_of_the_village` MUST allow
amplifiers `0..4` inclusive and a duration of at least
`HERO_OF_THE_VILLAGE_DURATION_SECONDS` (2400). It MUST be `BENEFICIAL`,
`DURATION_BASED`, and `AMPLIFIER_SCALES`.

#### Scenario: Registry accepts Level V duration

- **GIVEN** the default status-effect registry
- **WHEN** `StatusEffectManager.add(heroId, 2400, 4)` is invoked
- **THEN** the active instance has `amplifier === 4` and `duration === 2400`
- **AND** MUST NOT clamp amplifier to 0 or duration to 100

### Requirement: Level and duration mapping

`heroAmplifierFromBadOmen(badOmenLevel)` MUST map clamped omen levels as:

| badOmenLevel | amplifier |
|---|---|
| ≤ 1 | 0 |
| 2 | 1 |
| 3 | 2 |
| 4 | 3 |
| ≥ 5 | 4 |

Non-finite inputs MUST map to amplifier 0. Duration MUST be exactly **2400**
seconds (40 minutes of game time at 20 TPS, expressed in the effect runtime's
seconds unit).

#### Scenario: Omen 3 yields Level III for 2400s

- **GIVEN** a grant from a VICTORY raid with `badOmenLevel === 3`
- **WHEN** HOTV is applied
- **THEN** amplifier is 2 and duration is 2400

### Requirement: Exactly-once grant on VICTORY transition

When Game assigns a new raid status and
`shouldGrantHeroOfTheVillage(prev, next)` is true, Game MUST call
`playerEffects.add` for HOTV with the mapped amplifier and 2400s duration and
MUST surface a toast mentioning Hero of the Village. The predicate MUST be true
iff `prev !== 'VICTORY'` (including `null`/`undefined`) and `next === 'VICTORY'`.

#### Scenario: First VICTORY grants once

- **GIVEN** an ACTIVE raid with `badOmenLevel === 1` and no HOTV
- **WHEN** the raid transitions to VICTORY via `debugClearRaidWave` (or live tick)
- **THEN** HOTV is active at amplifier 0 for 2400s
- **AND** a subsequent tick that remains VICTORY MUST NOT call add again for
  that same already-terminal state (predicate false)

#### Scenario: DEFEAT grants nothing

- **GIVEN** an ACTIVE raid
- **WHEN** the raid transitions to DEFEAT
- **THEN** HOTV MUST NOT be present as a result of that transition

#### Scenario: Reload of VICTORY does not re-grant

- **GIVEN** a persisted raid in VICTORY and no session grant pending
- **WHEN** the world reloads and hydrates that VICTORY state
- **THEN** HOTV MUST NOT be granted by hydration alone

### Requirement: Emerald trading discount formula

While HOTV is active at amplifier `a`, every emerald input count `base ≥ 1`
MUST be replaced for live trading by:

```
fraction = 0.3 + 0.0625 * a
discounted = max(1, base - floor(base * fraction))
```

Non-emerald inputs and result counts MUST be unchanged. When HOTV is absent or
expired, offers MUST use catalog counts.

#### Scenario: Level I discounts 9 emeralds to 7

- **GIVEN** amplifier 0 and an offer requiring 9 emeralds
- **WHEN** `discountEmeraldCount(9, 0)` is evaluated
- **THEN** the result is 7
- **AND** `discountEmeraldCount(1, 0)` is 1
- **AND** `discountEmeraldCount(3, 0)` is 3 (30% of 3 floors to 0)

#### Scenario: Expiry restores catalog price

- **GIVEN** an active HOTV discounting an emerald buy offer
- **WHEN** the effect is removed or expires
- **THEN** trading display and `applyTradeOffer` debit the catalog emerald count

### Requirement: Trading UI shows the discounted price

`TradingPanel` offer text (via `describeTradeOffer` or equivalent) MUST render
the discounted emerald counts while HOTV is active so the player can see the
cheaper price before applying. `applyTradeOffer` MUST debit those same
discounted counts and MUST use them for affordability.

#### Scenario: Librarian book offer shows discount

- **GIVEN** HOTV amplifier 0 and the librarian level-2 offer `9 emerald → 1 book`
- **WHEN** the trading panel renders that offer
- **THEN** the visible cost shows `7× Emerald`
- **AND** `1 emerald → …` offers remain at floor 1

### Requirement: Ephemeral persistence policy

This change MUST NOT add a new world-metadata or archive namespace for status
effects. HOTV MUST follow existing `playerEffects` lifecycle (tick down,
death/clear, dispose). Documentation in design/verification MUST state that
effects do not currently survive reload.

#### Scenario: No new namespace keys

- **GIVEN** a VICTORY grant in a normal session
- **WHEN** persistence saves run
- **THEN** no new `__effects__` (or equivalent) metadata key is required for
  290 to be correct
- **AND** `__raid__` / `__trades__` schemas remain unchanged

### Requirement: Pause and dispose safety

Grant evaluation MUST only run on raid status assignment paths (not on paused
no-op ticks that do not change status). Dispose/teardown MUST NOT leave dangling
grant flags that could fire after dispose. Post-dispose raid debug seams MUST
no-op or remain safe per existing Game disposed guards.

#### Scenario: Paused game does not invent a grant

- **GIVEN** a paused Game with an ACTIVE raid
- **WHEN** no status-assigning API is invoked
- **THEN** HOTV MUST NOT appear spontaneously

## Error and failure behavior

- Non-finite omen / amplifier inputs clamp; grant MUST NOT throw on the raid
  tick path.
- Unknown trade keys continue to fail closed as in 278.
- Missing HOTV type in a broken registry would throw on `add` — production boot
  uses the default registry which MUST include the type.

## Performance and resource bounds

- Grant check is O(1) per status assignment.
- Discount projection is O(number of visible offers) on render/apply.
- No GPU/mesh/worker work.

## Compatibility and migration

Additive behavior only. Existing worlds load. Catalog trade records unchanged.

## Security and integrity

Discount MUST NOT allow debiting fewer items than the discounted price or more
than inventory contains. Inventory remains atomic per 278.

## Observability

- Toast on grant.
- `playerEffects.get(heroId)` for tests and debugging.
- Trading DOM text reflects discounted emerald counts.
- No dedicated new effect-list HUD is required (none exists live); absence is
  documented rather than redesigned.

## Verification mapping

| Requirement | Primary evidence |
|---|---|
| Registry bounds | unit StatusEffect / HeroOfTheVillage |
| Level/duration | unit HeroOfTheVillage |
| Exactly-once grant | unit LiveHeroOfTheVillage + e2e |
| DEFEAT / reload | unit + e2e |
| Discount formula | unit HeroOfTheVillage |
| Trading UI + apply | unit Live + e2e |
| Ephemeral policy | design citation + absence of new namespace in diff |
| Full gates | typecheck/lint/unit/build/e2e/file-audit/validate-state |
