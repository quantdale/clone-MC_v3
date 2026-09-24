# Design: 290-hero-of-the-village-reward

## Context/current state

Raid track 282–288 + enchant integrity 289 are VERIFIED on `origin/main`
(`0fb15f6`):

- Raid reaches `VICTORY` / `DEFEAT`; `RaidState.badOmenLevel` is authoritative.
- Game owns ephemeral `raidState`, `tickRaidFeedback`, `debugClearRaidWave`,
  and `debugStartRaid`.
- `playerEffects: StatusEffectManager` ticks each frame; used by wither effect
  and potion/food consume. **Status effects are not persisted** in
  `PlayerStateRecord` (no `__effects__` / effects field).
- Default registry already lists `minecraft:effect/hero_of_the_village` but with
  placeholder bounds (`defaultDuration`/`maxDuration` 100, `maxAmplifier` 0).
- Trading (278): catalog offers in `VillagerTrading`; `Game.applyTradeOffer`
  debits exact `inputA`/`inputB` counts; `TradingPanel.describeOffer` shows
  catalog counts. No reputation/HOTV modifiers exist.
- HudParity can project `statusEffects`, but Game does **not** render a live
  effect-list HUD today (WitherBossBarParity passes `statusEffects: []`).

## Target state

1. **Registry** — `hero_of_the_village` supports amplifiers 0..4 (Levels I–V)
   and durations up to at least 2400 seconds; flag `AMPLIFIER_SCALES`.
2. **Pure rules** — map Bad Omen level → HOTV amplifier + duration; compute
   emerald discount; decide whether a status transition should grant.
3. **Exactly-once grant** — when raid status transitions from non-`VICTORY` to
   `VICTORY` in a live Game call path (`tickRaidFeedback`,
   `debugClearRaidWave`, or any other path that assigns a new terminal state),
   grant HOTV once. `DEFEAT` grants nothing. Hydrating/`deserialize` of an
   already-`VICTORY` raid MUST NOT grant.
4. **Trading discount** — while HOTV is active, emerald input counts on offers
   are reduced for display and for `applyTradeOffer` debit/affordability;
   non-emerald inputs unchanged; floor 1 emerald.
5. **Observability** — toast on grant; effect queryable via `playerEffects`;
   trading UI shows discounted emerald counts. No new HUD chrome.

## Invariants

- I1. Grant fires at most once per observed non-VICTORY→VICTORY transition.
- I2. DEFEAT never grants HOTV.
- I3. Discounted emerald count is always an integer ≥ 1 when the base emerald
  count was ≥ 1.
- I4. Catalog/`__trades__` offer templates remain undiscounted; discount is a
  live projection over active HOTV amplifier.
- I5. No new persistence namespace; HOTV is ephemeral (same as other
  `playerEffects`).
- I6. Pause/dispose: grant path only runs when a status assignment happens;
  dispose clears effects via existing `playerEffects.clear()` on death/reset
  paths already present — HOTV follows the same lifecycle.
- I7. Change 258 stays BLOCKED; no GPU work.

## API and data model

```ts
/** Vanilla-like: 40 minutes game time @ 20 TPS → 2400 seconds. */
export const HERO_OF_THE_VILLAGE_DURATION_SECONDS = 2400;

/** Bad Omen 1..5 → amplifier 0..4 (Level I..V). */
export function heroAmplifierFromBadOmen(badOmenLevel: number): number;

export function heroDurationSeconds(): number; // → 2400

/**
 * discountFraction = 0.3 + 0.0625 * amplifier
 * discounted = max(1, base - floor(base * fraction))
 * Only mutates TradeItem counts where item === 'emerald'.
 */
export function discountEmeraldCount(baseCount: number, amplifier: number): number;

export function applyHeroTradeDiscount(
  offer: TradeOffer,
  amplifier: number | null | undefined,
): TradeOffer;

/** True iff prev.status !== 'VICTORY' && next.status === 'VICTORY'. */
export function shouldGrantHeroOfTheVillage(
  prev: RaidStatus | null | undefined,
  next: RaidStatus,
): boolean;
```

### Level / duration rule (normative)

| Raid `badOmenLevel` | HOTV amplifier | Display level |
|---|---|---|
| ≤0 (should not VICTORY-grant from omen 0 in practice) | 0 | I |
| 1 | 0 | I |
| 2 | 1 | II |
| 3 | 2 | III |
| 4 | 3 | IV |
| ≥5 | 4 | V |

Duration: **2400 seconds** of effect time (40 minutes × 60 s). The Game ticks
`playerEffects` with real `dt` seconds (same as wither/potions), so 2400 s of
wall-clock simulation time while unpaused matches 48000 ticks at 20 TPS.

### Discount formula (normative)

```
fraction = 0.3 + 0.0625 * amplifier   // amp 0 → 30%, amp 4 → 55%
discountedEmerald = max(1, base - floor(base * fraction))
```

Applied independently to `inputA` and `inputB` when `item === 'emerald'`.
Result counts and non-emerald inputs are unchanged.

## Control/data flow

```
tickRaid / debugClearRaidWave
  prev = raidState?.status
  next = … terminal or advanced state
  raidState = next
  if shouldGrantHeroOfTheVillage(prev, next):
    amp = heroAmplifierFromBadOmen(next.badOmenLevel)
    playerEffects.add(heroId, HERO_OF_THE_VILLAGE_DURATION_SECONDS, amp)
    showToast('Hero of the Village …')

TradingPanel.render / applyTradeOffer
  amp = playerEffects.get(heroId)?.amplifier  // undefined if absent/expired
  effective = applyHeroTradeDiscount(catalogOffer, amp ?? null)
  display + debit using effective counts
```

Reload with persisted `__raid__` = VICTORY: hydration sets `raidState` without
calling the grant helper (or calls it with `prev === next === VICTORY` → false).

## Detailed behavior

### Grant

- Resource id: `minecraft:effect/hero_of_the_village`.
- Stacking: existing `StatusEffectManager.add` rules (higher amp wins duration;
  same amp takes max duration). A second VICTORY in the same session (replay
  raid → win again) MAY refresh/stack per manager rules — that is a **new**
  transition, not a double-grant of the same one.
- Death: existing `playerEffects.clear()` on death/respawn paths clears HOTV.

### Trading UI

- `describeTradeOffer` / panel lines MUST use the discounted emerald counts when
  HOTV is active so the player sees the cheaper price before applying.
- Affordability checks use discounted counts.
- Persistence of `__trades__` continues to store undiscounted catalog uses/XP.

### Persistence decision

**Status effects do not persist today.** 290 documents this and does **not** add
a new namespace. Consequences:

- After reload, HOTV is gone → prices restore to catalog.
- After reload of a VICTORY raid, grant MUST NOT fire again.
- Unit/E2E cover reload no-double-grant explicitly.

## Failure modes

| Case | Behavior |
|---|---|
| DEFEAT | no grant |
| VICTORY tick while already VICTORY | no grant |
| Hydrate VICTORY | no grant |
| Invalid/NaN omen on grant | clamp amplifier to 0..4 |
| Emerald base count 1 | stays 1 after discount |
| No HOTV active | identity offer |
| Dispose mid-effect | effects cleared with Game teardown / existing clear |

## Compatibility/migration

Additive only. Old saves load. Registry definition change is in-memory boot
data. No archive schema change.

## Performance/resource constraints

- O(1) grant check per raid status assignment.
- O(offers) discount projection on trading render (already O(offers)).
- No per-frame raid grant work beyond the existing tick path.

## Testing seams

- Pure unit: amplifier mapping, duration constant, discount floor, grant
  predicate, discounted offer projection.
- Game/unit integration: VICTORY grants once; DEFEAT none; second tick no
  re-grant; applyTradeOffer debits discounted emerald count; clear/expiry
  restores prices.
- E2E: `debugStartRaid` → clear to VICTORY → effect present → open trading →
  discounted emerald text → clear effect / wait expiry seam → price restored;
  reload after VICTORY does not re-grant.

Debug seam (optional, minimal): `debugClearPlayerEffect(typeKey)` or reuse
`playerEffects.remove` via evaluate for expiry simulation in E2E.

## Observability/debugging

- Toast on grant naming Hero of the Village and level.
- `playerEffects.get(heroId)` for tests.
- Trading offer DOM text shows discounted counts.

## Affected files/symbols

- `src/simulation/HeroOfTheVillage.ts` (new pure helpers)
- `src/data/StatusEffect.ts` (`hero_of_the_village` bounds)
- `src/engine/Game.ts` (grant on transition; trade discount wiring)
- `src/ui/TradingPanel.ts` / `describeTradeOffer` (show discounted)
- `tests/unit/HeroOfTheVillage.test.ts`, `LiveHeroOfTheVillage.test.ts`
- `tests/e2e/hero-of-the-village.spec.ts`
- OpenSpec control plane + `PARITY_MATRIX.md` C290

## Rejected alternatives

- Persisting effects in a new `__effects__` namespace — out of scope; owner
  said keep minimal when effects do not already persist.
- Gift-throwing villager entities — explicitly non-goal.
- Discounting wheat/paper sell prices — vanilla HOTV targets emerald buy
  costs; keep emerald-only for honesty.
- Custom HUD effect strip — no existing live list; redesign forbidden.

## Downstream dependencies

- Future villager entities / gifts can consume the same HOTV effect id.
- Future effect persistence (if ever) can serialize `playerEffects` without
  changing the grant predicate.
