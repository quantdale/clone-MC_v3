# OVERRIDE_DRAFT — Change 296

**Status:** Applied to live `CHANGE_SEQUENCE_OVERRIDES.md` at T2 activation in
this session (295 is already VERIFIED/published).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 296-periodic-status-effect-ticks — activated from published VERIFIED 295

The product/session instruction authorizes activating OpenSpec change
**296-periodic-status-effect-ticks** as the sole ACTIVE implementation change
while Change **258** remains **BLOCKED** and Changes **259–295** remain
**VERIFIED**.

- **Activation dependency (satisfied):** Change
  **295-throwable-splash-potion-entities** is VERIFIED 12/12 and published;
  tip base `218aabd` (origin/main).
- **Scope:** vanilla periodic player status effects: poison (1 magic damage
  every `25 >> amp` ticks, never below 1 HP), regeneration (heal 1 every
  `50 >> amp` ticks, capped at max health), wither (1 damage every
  `40 >> amp` ticks, can kill → real death + death screen), scheduled on the
  remaining duration before the count-down, unpaused fixed tick only,
  creative/spectator refused, armor bypassed (`magic` damage type); the
  `tickWithers` global-tick wither stand-in retired; 292 persisted effects
  keep ticking; 295 witch-poison notes updated; unit + browser E2E.
- **Out of scope:** hunger effect (not registered), mob status effects,
  witch self-heal, drinkable/lingering potions, gunpowder/splash brewing,
  particles/sounds/HUD icons; Change 258 headed FPS/GPU work or status
  change; Change 297.
- Change **258** stays **BLOCKED**; Changes **259–295** stay **VERIFIED**.
  The 295 "poison costs no HP" divergence is closed by 296 without reopening
  295.

## Package path

`openspec/changes/296-periodic-status-effect-ticks/`
