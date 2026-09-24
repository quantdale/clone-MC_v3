# OVERRIDE_DRAFT — Change 288

**Status:** To be applied to live `CHANGE_SEQUENCE_OVERRIDES.md` at T1
activation in this session (287 is already VERIFIED/published).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 288-raider-combat-behavior — activated from published VERIFIED 287

The product/session instruction authorizes activating OpenSpec change
**288-raider-combat-behavior** as the sole ACTIVE implementation change while
Change **258** remains **BLOCKED** and Changes **259–287** remain **VERIFIED**.

- **Activation dependency (satisfied):** Change **287-live-village-detection** is
  VERIFIED 11/11 and published; tip base `3b26e2a` (origin/main).
- **Scope:** live raider combat behavior over verified wave entities — target
  player / home to raid center, per-type melee/ranged using existing AI and
  projectile/melee systems, deaths through exactly-once `recordRaiderDeath`,
  player death/timeout → `DEFEAT`, pause/dispose/reload safety, unit + browser E2E.
- **Out of scope:** new AI framework; villager entities; Hero of the Village;
  patrols/outposts; captain/banner; new persistence namespace; full witch potion
  entity system (documented fallback only); Change 258 headed FPS/GPU work or
  status change; Change 289 implementation.
- Change **258** stays **BLOCKED**; Changes **259–287** stay **VERIFIED** and
  are not reopened.

## Package path

`openspec/changes/288-raider-combat-behavior/`
