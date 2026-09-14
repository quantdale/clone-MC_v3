# Spec: boss-bar-hud-parity

## Requirements
- W-1: Live wither boss bar visibility and progress are driven from BossFramework/HudParity projections, not a divergent one-off store.
- W-2: Fill width reflects current boss progress (charge/health per existing wither semantics).
- W-3: Bar hides when no active wither boss bar snapshot exists.

## Scenarios
- S-1: Spawn wither → bar visible.
- S-2: Damage/charge change → fill updates.
- S-3: Defeat/despawn → bar hidden.
