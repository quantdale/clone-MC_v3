# OVERRIDE_DRAFT — Change 298

**Status:** Applied to the live `CHANGE_SEQUENCE_OVERRIDES.md` at T2 activation in
this session (297 is already VERIFIED/published).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 298-glass-bottles-and-drinkable-potions — activated from published VERIFIED 297

The product/session instruction authorizes activating OpenSpec change
**298-glass-bottles-and-drinkable-potions** as the sole ACTIVE implementation
change while Change **258** remains **BLOCKED** and Changes **259–297** remain
**VERIFIED**.

- **Activation dependency (satisfied):** Change
  **297-gunpowder-and-splash-brewing** is VERIFIED 12/12 and published at tip
  base `2ecf781` (origin/main).
- **Scope:**
  - `glass_bottle` item (id 74, unused atlas tile 76).
  - The crafting recipe is gated by a controlled `container-ui` golden
    experiment. Only those 6 cells may be re-pinned, and only if the diff is
    solely the new recipe row; otherwise there is no recipe.
  - Raid witches drop bottles from the existing vanilla table.
  - Filling a bottle at water in reach produces a water bottle. Survival
    consumes one bottle; creative keeps it (no duplicate); the save is durable.
  - Base-only `potion_contents` are accepted, so water + nether wart →
    awkward completes in a real stand.
  - Drinking a NORMAL potion over 32 ticks: cancel on release, full effects
    with instant effects applied immediately, an empty bottle back in
    survival/adventure, creative keeps the potion, spectators refused, a
    water bottle has no effect; the mainhand drink takes priority over the
    shield; the save is durable.
  - Unit + browser E2E.
- **Out of scope:** milk/buckets (absent), lingering potions, glowstone
  dust/fermented spider eye, a survival nether wart source (no Nether), drink
  slowdown/particles, TNT, live creepers; Change 258 headed FPS/GPU work or
  status change; Change 299.
- Change **258** stays **BLOCKED**; Changes **259–297** stay **VERIFIED**.

## Package path

`openspec/changes/298-glass-bottles-and-drinkable-potions/`
