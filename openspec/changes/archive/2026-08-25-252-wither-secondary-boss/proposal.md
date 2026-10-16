# Proposal: 252-wither-secondary-boss

## Problem
`PARITY_MATRIX.md` records `MP-19.4-1` Wither-like secondary boss as deferred — the sole remaining master-plan gap after 001–251. BossFramework (153), ExplosionCore (169), Ender Dragon (183), combat/projectiles/effects/entities/block interaction/loot/multiplayer/persistence/rendering/HUD/audio/progression/determinism infrastructure are all VERIFIED. No Wither implementation exists. Players cannot summon, fight, or obtain the Nether-Star reward.

## Goals
- Player-driven T-shaped soul-sand/soul-soil + 3 skull summoning integrated with live block placement, deterministic localized validation, server-authoritative creation, structure consumption, duplicate-prevention.
- Birth/charge/invulnerability phase with timed charging, spawn explosion via ExplosionCore, boss-bar progression, audiovisual feedback, deterministic transition, exactly-once explosion, save/load safe.
- Three-head combat architecture: one entity, central head primary target, side heads independent secondary targets, deterministic targeting, bounded scans, replicated head orientations.
- Skull projectile system via ProjectileCore: normal and blue/dangerous variants, per-head origin, velocity, collision, damage, explosion, Wither effect, ownership, lifetime bounds, multiplayer replication.
- Wither status effect via StatusEffect framework: duration/difficulty scaling, periodic damage, stack/refresh, HUD, save/load, replication, immunity.
- World destruction via ExplosionCore: skull/spawn explosions, block breaking, protected blocks, resistance, damage falloff, gamerule, bounded per-operation cost, chunk dirtiness.
- Combat phases via BossFramework: Birth/Charge, Ranged/Aerial, Armored/Enraged with projectile immunity and movement changes, idempotent transitions.
- Damage/healing/immunities/death: max health, difficulty scaling, passive regen, kill heal, environmental/fire/lava immunities, undead exclusion, armored projectile immunity, deterministic removal.
- Reward: exactly-once Nether-Star-like drop via loot pipeline, pickup, serialization, multiplayer ownership.
- Rendering: boss bar, body, head orientations, charge/armored/projectile/explosion/status feedback via existing abstractions, state-driven, clean disposal.
- Multiplayer authority: server owns summon/AI/targeting/movement/phases/projectiles/damage/healing/explosions/destruction/death/loot; clients interpolate; tested for multi-client sync, late join, disconnect.
- Persistence: save/load/chunk lifecycle across all phases, migration, no duplicate explosions/rewards.
- Determinism & performance: no iteration-order bugs, no unbounded scans, stress-tested, profiled.
- Testing: comprehensive unit/integration/E2E including the full E2E summon→charge→fight→death→reward→reload path.
- OpenSpec/state reconciliation and parity matrix closure.

## Non-goals
- Beacons or other post-Nether-Star progression subsystems.
- New art pipeline; reuse original procedural visuals/sounds.
- Rewriting BossFramework/ExplosionCore; extend only where deficiency proven.
- Copying proprietary Minecraft assets/code/branding.

## Preconditions
- Changes 001–251 VERIFIED, program COMPLETE.
- Origin/main at 254d259c3193b6d7a74d04bf5a117309cd00794a reconciled.
- BossFramework, ExplosionCore, EnderDragon, combat/projectile/effect/entity registries available.

## Dependencies
- BossFramework, ExplosionCore, ProjectileCore, StatusEffect/Manager, EntityType, BlockRegistry, ItemRegistry, World/Chunk, Explosion/Projectile networking, persistence, rendering/HUD.

## Proposed change
Implement `src/simulation/WitherBoss.ts` (+ `WitherSummon.ts`, `WitherSkull.ts`), extend registries for skull/soul-soil/nether-star, integrate into `Game.ts`/`World.ts`/rendering/HUD/networking/persistence, add comprehensive tests.

## Compatibility and migration
- Additive blocks/items/entity types; numeric IDs appended, never reused.
- Wither state version 1 codec; unknown fields rejected, legacy worlds get empty wither set.
- World height unchanged; no save-format break for existing chunks.

## Risks
- Summon false positives on dense terrain — mitigate via localized pattern check around changed block only.
- Explosion runaway — bound per-tick block queries/changes, reuse ExplosionCore.
- Network state spam — rate-limit projectile batch, delta boss bar.
- Determinism loss via Map iteration — sort IDs, use deterministic RNG.

## Rollback strategy
Revert wither files and registry additions; no migration to undo due to additive versioned codec.

## Definition of Done
- All mustard requirements in spec verified with tests.
- Gates pass: typecheck, lint, unit, build, e2e (existing assertions unaffected plus new wither E2E).
- Multiplayer & persistence scenarios verified.
- Parity matrix MP-19.4-1 moved to exact/equivalent with evidence.
- Committed and pushed to origin/main.

## Advancement gate
Target 100% task completion, all MUST/SHALL pass, no critical blocker. 90% floor requires explicit exception proving non-blocking.
