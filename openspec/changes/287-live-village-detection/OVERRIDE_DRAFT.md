# OVERRIDE_DRAFT — Change 287

**Status:** To be applied to live `CHANGE_SEQUENCE_OVERRIDES.md` at T1
activation in this session (286 is already VERIFIED/published).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 287-live-village-detection — activated from published VERIFIED 286

The product/session instruction authorizes activating OpenSpec change
**287-live-village-detection** as the sole ACTIVE implementation change while
Change **258** remains **BLOCKED** and Changes **259–286** remain **VERIFIED**.

- **Activation dependency (satisfied):** Change **286-live-raid-bar-parity** is
  VERIFIED 14/14 and published; tip base `97c1231` (origin/main).
- **Scope:** real spatial settlement/village detection backing the 285
  `setVillageQuery` seam in production — pure bed-scan rules, Game wiring,
  pause/dispose/reload safety, bounded per-tick cost, unit + browser E2E.
- **Out of scope:** raider AI/combat redesign; pillager outposts/patrols;
  Hero of the Village; villager spawning; village worldgen; new persistence
  namespace; PointOfInterest live wiring campaign; Change 258 headed FPS/GPU
  work or status change; Change 288 implementation.
- Change **258** stays **BLOCKED**; Changes **259–286** stay **VERIFIED** and
  are not reopened.

## Package path

`openspec/changes/287-live-village-detection/`
