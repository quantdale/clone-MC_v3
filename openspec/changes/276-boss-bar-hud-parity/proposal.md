# Proposal: 276-boss-bar-hud-parity

Unify the ad-hoc wither boss bar DOM path in Game with BossFramework snapshots + HudParity boss-bar view.

## Scope
- Drive HUD boss bars from BossFramework/HudParity (`bossBarSnapshot` / `HudBossBarView`) rather than a one-off wither-only path (migrate/wrap `#wither-boss-bar`).
- Support live wither visibility/progress; original assets only.
- Unit tests for view mapping + E2E: spawn/damage → bar visible/progress → defeat hides.
- 258 stays BLOCKED; no headed FPS work.

## Non-goals
- New boss types beyond live wither wiring.
- Combat balance retune.
