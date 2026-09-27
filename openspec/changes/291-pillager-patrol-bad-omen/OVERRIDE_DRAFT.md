# OVERRIDE_DRAFT — Change 291

**Status:** Applied to live `CHANGE_SEQUENCE_OVERRIDES.md` at T2 activation in
this session (290 is already VERIFIED/published).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 291-pillager-patrol-bad-omen — activated from published VERIFIED 290

The product/session instruction authorizes activating OpenSpec change
**291-pillager-patrol-bad-omen** as the sole ACTIVE implementation change while
Change **258** remains **BLOCKED** and Changes **259–290** remain **VERIFIED**.

- **Activation dependency (satisfied):** Change **290-hero-of-the-village-reward**
  is VERIFIED 11/11 and published; tip base `bc777e1` (origin/main).
- **Scope:** deterministic seeded, rate-limited pillager patrol spawning near
  the player (world-age/daytime/surface/village/raid gates, 6000–6599 tick
  cooldown, 1-in-5 roll, 2–4 pillagers with exactly one captain) over the
  reused 284 raider backend + 288 pillager combat; captain kill grants Bad Omen
  +1 (cap 5) through the 285 `grantBadOmen` seam; strict raid isolation;
  unit + browser E2E.
- **Out of scope:** outposts; banners (item/visual); villagers; patrol/raider
  rendering; persistence of patrols or Bad Omen; Change 258 headed FPS/GPU work
  or status change; Change 292 implementation.
- Change **258** stays **BLOCKED**; Changes **259–290** stay **VERIFIED** and
  are not reopened.

## Package path

`openspec/changes/291-pillager-patrol-bad-omen/`
