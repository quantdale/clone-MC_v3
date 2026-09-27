# Proposal: 296-periodic-status-effect-ticks

## Problem

Player status effects are managed, stacked, persisted (292) and counted down,
but the periodic ones do nothing. Poison and regeneration are pure markers:
a witch's poison splash (295) costs no HP and a regeneration effect never
heals. Wither has a stand-in inside `Game.tickWithers`: 1 HP every global
`simTick % 40` while the effect is active, but only while a wither boss or
skull exists, independent of amplifier and of the effect's own remaining
duration. Vanilla applies these effects from `MobEffectInstance.tick`:
`shouldApplyEffectTickThisTick(duration, amplifier)` with
`interval = base >> amplifier` (`interval > 0 ? duration % interval == 0 :
true`) followed by the duration count-down, with poison 25 ticks (1 magic
damage, only while health > 1), regeneration 50 ticks (heal 1 while below
max health) and wither 40 ticks (1 wither damage, can kill).

## Goals

- Pure `src/simulation/PeriodicStatusEffects.ts`:
  - base intervals `POISON_INTERVAL_TICKS = 25`,
    `REGENERATION_INTERVAL_TICKS = 50`, `WITHER_INTERVAL_TICKS = 40`;
  - `periodicIntervalTicks(kind, amplifier) = max(1, base >> amp)` (amp
    clamped to an integer in [0, 31]);
  - `remainingDurationTicks(seconds) = max(0, round(seconds · 20))`;
  - `shouldApplyPeriodicTick(kind, remainingTicks, amplifier)` =
    `remainingTicks > 0 && remainingTicks % interval === 0`;
  - `resolvePeriodicEffect(kind, health, maxHealth)`: poison → 1 `magic`
    damage only while `health > 1`; wither → 1 `wither` damage (may kill);
    regeneration → heal 1 only while `health < maxHealth`;
  - `tickPeriodicStatusEffects(effects, target)`: one fixed-tick pass over
    poison → regeneration → wither (registry order, deterministic), each
    re-read live so a death mid-pass (effects cleared on respawn) stops the
    remaining effects.
- `Game.runFixedTick` step 6 runs the pass once per unpaused fixed tick
  **before** `playerEffects.tick(dt)` (vanilla apply-then-count-down) with the
  target routed through `hurtPlayer` (creative/spectator refused by the 265
  gate) and `survival.heal`.
- Retire the `tickWithers` global-`simTick % 40` wither-effect damage so wither
  damage is applied exactly once per interval by the new pass (also when no
  boss exists).
- Register a `magic` damage type (`BYPASS_ARMOR`) so poison (and 295 instant
  harming) ignore armor like vanilla magic damage; `wither` is already
  `BYPASS_ARMOR`. Death presentation maps `magic` → "Magic".
- Wither death is a real death: the 280 death screen opens with cause
  "Wither", the 294 respawn clears effects and Bad Omen.
- Persisted effects (292) keep ticking after reload because the schedule is a
  function of the restored remaining duration only.
- Hunger effect: **not registered** in the status-effect registry, so no
  exhaustion drain is added (documented skip; registering is out of scope).
- Update 295 docs/notes that say witch poison costs no HP.
- Unit tests (interval math per amplifier, poison 1-HP floor, regen cap at
  max health, wither kill, pause/no-tick-without-step, creative refusal,
  reload continuity, legacy guards) and browser E2E (player splash poison
  lowers health over ticks but stops at 1 HP; regeneration heals; wither
  kills → death screen "Wither"; paused game applies nothing).

## Non-goals

- Hunger effect/exhaustion model, absorption, health boost, instant effects
  in the pass (instant harming/healing already apply on shatter in 295).
- Mob status effects (raiders/witches have no effect manager), witch
  self-heal, drinkable/lingering potions, particles/sounds/HUD icons.
- Changing i-frames, armor, or natural regeneration.
- Change 258 headed FPS/GPU work or status change; Change 297.

## Preconditions

- Change 295 VERIFIED and published (`218aabd` origin/main).
- 258 BLOCKED; 259–295 VERIFIED.

## Dependencies

- 014/015 StatusEffect + StatusEffectManager; 013 DamageType registry;
  SurvivalSystem; 265/266 game-mode gates; 280 death presentation; 292
  effect persistence; 294 death clears effects; 295 splash potions.

## Proposed change

A pure schedule/decision module plus a thin Game integration in the fixed
tick, a `magic` damage type, a `SurvivalSystem.tickInvulnerability` split
(so the test seam can advance i-frames exactly as `update` does), and test
seams `debugAddPlayerEffect` / `debugTickPeriodicStatusEffects(ticks)`.

## Compatibility and migration

- No schema change; old saves' effects simply start doing damage/healing.
- Harming (295) damage now bypasses armor (vanilla magic); the wither boss
  path keeps its existing `wither` reason.
- The 292 `debugTickStatusEffects(seconds)` seam stays a duration-only bulk
  advance (documented).

## Risks

- Double wither damage if the legacy block remains → retired and guarded.
- A death mid-pass applying later effects after respawn → live re-read.
- Float drift of second-based durations → tick rounding.

## Rollback strategy

Revert the 296 commits; no stored data depends on them.

## Definition of Done

- Package passes the SPEC_AUTHORING_PROTOCOL quality gate.
- Implementation + unit + E2E green; full baseline gates green (visual:176
  SwiftShader drift documented cell-by-cell, goldens untouched;
  enchanting:227 green).
- C296 exact; C295 note updated; VERIFIED 100%; published by fast-forward;
  258 still BLOCKED.

## Advancement gate

Target 100% task completion with all mandatory requirements and tests passing.
Absolute floor 90% only via explicit Advancement Exception (not planned).
