# Design: 296-periodic-status-effect-ticks

## Context/current state

- `StatusEffectManager` (015) owns the player's effects; durations are in
  **seconds** (`StatusEffectInstance.tick(dt)` subtracts `dt`, expiry at 0).
  The registry contains `poison`, `regeneration`, `wither` (max amplifier 4)
  and **no** `hunger` entry.
- `Game.runFixedTick` step 6 runs `survival.update` (survival/adventure only,
  265), then `playerEffects.tick(dt)` and `tickBadOmenDuration(dt)`; the
  fixed tick only runs unpaused (044 `FixedTickDriver.pause`).
- `Game.tickWithers` ends with a stand-in: while a wither boss or skull
  exists, every global `simTick % WITHER_EFFECT_PERIOD_TICKS (40)` the player
  takes `hurtPlayer(1, 'wither')` if the wither effect is active.
- `SurvivalSystem.damage(amount, reason)`: armor applies unless the reason's
  damage type is `BYPASS_ARMOR`; 0.55 s i-frames; `health <= 0` → `death`
  event with the reason. `heal(amount)` caps at 20.
- Damage types: fall, drowning, lava, starvation, wither (all BYPASS_ARMOR).
  295 harming uses `hurtPlayer(n, 'magic')`, and `magic` is unregistered, so
  armor currently reduces it.
- `hurtPlayer` refuses everything unless `survivalStatsDeplete(mode)`
  (survival/adventure) — creative/spectator invulnerability.
- Death (`onSurvivalEvent('death')`): raid DEFEAT, stats, hardcore rule,
  `respawnPlayer()` (`consumeDeath` → health 20, `playerEffects.clear()`,
  Bad Omen cleared, durable save), then `showDeathScreen(reason)`.
- 280 `normalizeDeathCause` maps fall/drowning/lava/starvation/wither/debug/
  damage; anything else → "Unknown damage".
- 292 persists effects with their remaining seconds and restores them.

## Target state

Every unpaused fixed tick, before durations count down, each active poison /
regeneration / wither effect is checked against its vanilla schedule and, when
due, deals magic damage (poison, never below 1 HP), heals 1 (regeneration,
capped at max health) or deals wither damage (can kill → real death).

## Invariants

- I1. The pass runs only inside `runFixedTick` (unpaused) and in the test
  seam; no wall-clock timers, no randomness.
- I2. Schedule is `remainingTicks % max(1, base >> amp) == 0` with
  `remainingTicks = round(seconds·20) > 0`, evaluated **before** the tick's
  count-down (vanilla order).
- I3. Poison never damages at `health <= 1`; its damage never reduces health
  below 1 (1 damage at health ≥ 2).
- I4. Regeneration never raises health above max (20).
- I5. Wither damage can kill; the death is the normal death path (280 screen
  "Wither", 294 respawn clears effects).
- I6. Damage goes through `hurtPlayer`: creative/spectator take none; magic
  and wither bypass armor; i-frames unchanged.
- I7. Exactly one wither-effect damage source (legacy block retired).
- I8. Order poison → regeneration → wither; each effect is re-read from the
  manager before applying so effects cleared by a death are skipped.
- I9. The schedule depends only on (remaining duration, amplifier), so
  restored effects (292) continue the same cadence after reload.

## API and data model

```ts
// src/simulation/PeriodicStatusEffects.ts
export const POISON_INTERVAL_TICKS = 25;
export const REGENERATION_INTERVAL_TICKS = 50;
export const WITHER_INTERVAL_TICKS = 40;
export const PERIODIC_TICKS_PER_SECOND = 20;
export type PeriodicEffectKind = 'poison' | 'regeneration' | 'wither';
export const PERIODIC_EFFECT_ORDER: readonly PeriodicEffectKind[];
export function periodicEffectTypeId(kind): ResourceId;       // minecraft:effect/<kind>
export function periodicIntervalTicks(kind, amplifier): number;
export function remainingDurationTicks(seconds: number): number;
export function shouldApplyPeriodicTick(kind, remainingTicks, amplifier): boolean;
export type PeriodicEffectAction =
  | { type: 'damage'; amount: 1; reason: 'magic' | 'wither' }
  | { type: 'heal'; amount: 1 };
export function resolvePeriodicEffect(kind, health, maxHealth): PeriodicEffectAction | null;
export interface PeriodicEffectTarget {
  readonly health: number; readonly maxHealth: number;
  damage(amount: number, reason: 'magic' | 'wither'): void;
  heal(amount: number): void;
}
export interface PeriodicEffectSource { get(id: ResourceId): { remainingDuration; amplifier } | undefined }
export function tickPeriodicStatusEffects(effects, target): PeriodicEffectAction[]; // applied actions
```

`SurvivalSystem.tickInvulnerability(dt)` (extracted from `update`, identical
arithmetic). `DamageType` gains `magic` (`kind: 'periodic'`, amount 1,
interval 1.25, flags `BYPASS_ARMOR`). `DeathCause` gains `magic` → "Magic".

Game seams: `debugAddPlayerEffect(key, seconds, amplifier): boolean`,
`debugTickPeriodicStatusEffects(ticks): number` (runs `ticks` status-only
fixed ticks: i-frame countdown for depleting modes, the pass, effect and Bad
Omen count-down), `getPlayerHealth(): number`.

## Control/data flow

```
runFixedTick step 6
  survival.update (survival/adventure)     // i-frames, hunger, env damage
  tickPeriodicStatusEffects(playerEffects, target)
      target.damage → hurtPlayer(1, reason) → survival.damage → death? → respawnPlayer + death screen
      target.heal   → survival.heal(1)
  playerEffects.tick(dt); tickBadOmenDuration(dt)
```

## Detailed behavior

### Interval table

| amp | poison | regeneration | wither |
|-----|--------|--------------|--------|
| 0 | 25 | 50 | 40 |
| 1 | 12 | 25 | 20 |
| 2 | 6 | 12 | 10 |
| 3 | 3 | 6 | 5 |
| 4 | 1 | 3 | 2 |
| ≥5 (defensive) | 1 | 1 (amp ≥ 6) | 1 |

### Application

For kind in order: `inst = effects.get(id)`; skip if absent; `ticks =
remainingDurationTicks(inst.remainingDuration)`; skip unless
`shouldApplyPeriodicTick`; `action = resolvePeriodicEffect(kind,
target.health, target.maxHealth)`; apply. A 45 s poison (900 ticks) therefore
hits on its first tick (900 % 25 = 0), exactly like vanilla.

### i-frames

Unchanged 0.55 s window (≈ vanilla 10-tick cooldown). As in vanilla, poison
III/IV intervals shorter than the window lose some hits.

### Hunger

No `hunger` status effect is registered; skipped and documented.

## Failure modes

- Non-finite health / durations → no action (guards).
- Unregistered ids never appear in the manager (015 invariant).
- Death during the pass → later effects already cleared → skipped.

## Compatibility/migration

No persistence change. Legacy `WITHER_EFFECT_PERIOD_TICKS` removed.

## Performance/resource constraints

Three map lookups per fixed tick; no allocation beyond the action list.

## Testing seams

Pure module unit tests; composition tests with real `StatusEffectManager` +
`SurvivalSystem`; Game source guards (order, legacy removal, gate routing);
E2E seams above (the page is not pointer-locked, so the real driver is paused
— used as the pause proof).

## Observability/debugging

`tickPeriodicStatusEffects` returns applied actions; seams expose health and
effects; damage toasts/HUD unchanged.

## Affected files/symbols

- `src/simulation/PeriodicStatusEffects.ts` (new)
- `src/engine/Game.ts` (step 6 pass, legacy wither block removed, seams)
- `src/player/SurvivalSystem.ts` (`tickInvulnerability`)
- `src/data/DamageType.ts` (`magic`)
- `src/simulation/DeathRespawnPresentation.ts` (`magic`)
- tests: `PeriodicStatusEffects.test.ts`, `LivePeriodicStatusEffects.test.ts`,
  legacy `DamageType.test.ts` / death presentation tests; E2E
  `periodic-status-effects.spec.ts`
- docs: 295 notes, PARITY C295/C296, control plane.

## Rejected alternatives

- Global-tick modulo (legacy wither): ignores duration/amplifier, diverges
  from vanilla and restarts phase on reload.
- Per-effect accumulators: extra persisted state; vanilla has none.
- Registering hunger now: new registry entry + exhaustion model is not cheap.

## Downstream dependencies

297 (gunpowder + splash brewing) makes poison/regeneration splash potions
obtainable in survival; mob status effects / witch self-heal later.
