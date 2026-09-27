# OVERRIDE_DRAFT — Change 297

**Status:** Applied to live `CHANGE_SEQUENCE_OVERRIDES.md` at T2 activation in
this session (296 is already VERIFIED/published).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 297-gunpowder-and-splash-brewing — activated from published VERIFIED 296

The product/session instruction authorizes activating OpenSpec change
**297-gunpowder-and-splash-brewing** as the sole ACTIVE implementation change
while Change **258** remains **BLOCKED** and Changes **259–296** remain
**VERIFIED**.

- **Activation dependency (satisfied):** Change
  **296-periodic-status-effect-ticks** is VERIFIED 12/12 and published; tip
  base `fdba42d` (origin/main).
- **Scope:** `gunpowder` item (id 73, unused atlas tile 75, no golden cell
  shift); pure vanilla creeper (0–2 + looting) and witch (1–3 weighted rolls,
  missing items discarded) drop tables; live raid witches drop their table as
  item entities on every death path (exactly once, scripted-RNG seam);
  brewing any NORMAL potion with gunpowder yields the SPLASH variant with
  base/effects preserved and every other recipe preserves the bottle kind
  (existing blaze-powder/400-tick rules, persisted components);
  `testGrantSplashPotion` kept test-only; unit + browser E2E.
- **Out of scope:** TNT recipe (would add a row to the golden-captured
  `#crafting` panel), live creepers/ghasts, looting enchantment, other raider
  drops, glass/water bottles, drinkable and lingering potions; Change 258
  headed FPS/GPU work or status change; Change 298.
- Change **258** stays **BLOCKED**; Changes **259–296** stay **VERIFIED**.

## Package path

`openspec/changes/297-gunpowder-and-splash-brewing/`
