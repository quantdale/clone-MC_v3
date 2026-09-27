# OVERRIDE_DRAFT — Change 293

**Status:** Applied to live `CHANGE_SEQUENCE_OVERRIDES.md` at T2 activation in
this session (292 is already VERIFIED/published).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 293-raider-and-patrol-rendering — activated from published VERIFIED 292

The product/session instruction authorizes activating OpenSpec change
**293-raider-and-patrol-rendering** as the sole ACTIVE implementation change
while Change **258** remains **BLOCKED** and Changes **259–292** remain
**VERIFIED**.

- **Activation dependency (satisfied):** Change
  **292-player-status-effect-persistence** is VERIFIED 11/11 and published;
  tip base `cef8f32` (origin/main).
- **Scope:** box-mesh rendering of ACTIVE raid-wave raiders (pillager,
  vindicator, ravager, witch) and patrol pillagers from `raidEntityManager` /
  `patrolEntityManager` (current overworld dimension) with per-kind
  silhouettes, a banner-marked patrol captain, movement/stored-yaw facing,
  derived removal on death/despawn/clear/raid end, leak-free disposal, no
  shared scene setup changes; unit + browser E2E.
- **Out of scope:** animation/textures/skins; simulation or yaw changes;
  other entity renderers; instancing/LOD; goldens; Change 258 headed FPS/GPU
  work or status change; Change 294.
- Change **258** stays **BLOCKED**; Changes **259–292** stay **VERIFIED** and
  are not reopened.

## Package path

`openspec/changes/293-raider-and-patrol-rendering/`
