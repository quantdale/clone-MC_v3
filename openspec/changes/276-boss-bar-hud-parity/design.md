# Design: 276-boss-bar-hud-parity

## Approach
- Source of truth: `BossFramework.bossBarSnapshot` (or wither adapter emitting the same shape).
- Map via `HudParity` / `HudBossBarView` into the existing `#wither-boss-bar` fill width + visibility.
- Keep CSS/HTML assets; replace Game.ts one-off percent updates with parity-driven updates each tick/render.
- Test seams: expose getter for projected boss bars; E2E uses `__voxelGame` + wither spawn helpers.

## Invariants
- I-1: When a live wither exists with charge/health, bar visible and fill matches snapshot progress.
- I-2: On wither defeat/despawn, bar hidden.
- I-3: No 258 headed/FPS changes.
