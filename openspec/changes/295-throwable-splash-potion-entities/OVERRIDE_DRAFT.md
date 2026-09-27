# OVERRIDE_DRAFT — Change 295

**Status:** Applied to live `CHANGE_SEQUENCE_OVERRIDES.md` at T2 activation in
this session (294 is already VERIFIED/published).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 295-throwable-splash-potion-entities — activated from published VERIFIED 294

The product/session instruction authorizes activating OpenSpec change
**295-throwable-splash-potion-entities** as the sole ACTIVE implementation
change while Change **258** remains **BLOCKED** and Changes **259–294**
remain **VERIFIED**.

- **Activation dependency (satisfied):** Change
  **294-bad-omen-raid-escalation-and-death-parity** is VERIFIED 12/12 and
  published; tip base `b25dbc1` (origin/main).
- **Scope:** thrown splash potion entities over 142 ProjectileCore (gravity
  arc, block/entity shatter), vanilla splash radius with distance-scaled
  instant/duration effects on the player and instant harming on raid/patrol
  raiders; player right-click throw with creative no-consume; raid witches
  throw vanilla-chosen harming/poison/slowness/weakness potions, retiring the
  288 fixed-damage fallback (288 tests/docs/PARITY note updated); in-flight
  potion box renderer on the 293 pattern; debug/test splash availability;
  unit + browser E2E.
- **Out of scope:** lingering clouds, drinking, gunpowder item and splash
  brewing, per-mob effects, poison/regeneration ticks, particles/sounds,
  persistence of in-flight potions; Change 258 headed FPS/GPU work or status
  change; Change 296.
- Change **258** stays **BLOCKED**; Changes **259–294** stay **VERIFIED**.
  The 288 witch fallback is superseded by 295 without reopening 288.

## Package path

`openspec/changes/295-throwable-splash-potion-entities/`
