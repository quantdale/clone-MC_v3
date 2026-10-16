# Design: 252-wither-secondary-boss

## Context/current state
- 153 BossFramework provides validated BossDefinition/State, health/phase/status machine, boss-bar snapshot, versioned codec. Default registry seeds wither definition (300 HP, ranged@1.0, armored@0.5, #303030) but no behavior.
- 169 ExplosionCore provides deterministic 1352-ray explosion with isAir/isDestroyable/blastResistance, sorted destroys, drops caller.
- 183 EnderDragon demonstrates framework consumption: definition + crystal/heal/bite/gateway composition, no entity/AI.
- 142 ProjectileCore provides swept-collision per-tick step with gravity/drag/owner immunity.
- 014/121 StatusEffect registry/manager provides type/instance lifecycle, ticking, stacking, attribute hooks.
- 017 EntityRegistry provides type definitions; default contains zombie/skeleton/creeper/spider/pig/cow/chicken/sheep/squid/bat/villager/item.
- BlockRegistry: soul_sand exists (58), no soul_soil, no skull blocks. ItemRegistry: soul_sand exists, no skull, no nether_star.
- World/Chunk provides edit overlay, block state, chunk pipeline, lighting.
- Game.ts orchestrates simulation tick (runFixedTick) with tickDriver 20 TPS.
- Multiplayer frameworks (222-235) exist but wither not integrated.

## Target state
- `src/simulation/WitherBoss.ts`: wither core state machine building on BossFramework. Owns invulnerability ticks (WITHER_CHARGE_TICKS=220), passive regen, skull cooldowns, multi-head targeting, armored projectile immunity, motion, healing.
- `src/simulation/WitherSummon.ts`: pattern detection `trySummonWither(world, placedPos)` — T-shape validation for soul sand/soil variants, 3 skulls, orientations north-south/east-west, spawn at T center+1, consumption.
- `src/simulation/WitherSkull.ts`: normal/blue skull projectile state + step via ProjectileCore, explosion mapping, wither effect application.
- Registry extensions: BlockId.SoulSoil (60), WitherSkull (61); ItemId.SoulSoil (60), WitherSkull (61), WitherSkeletonSkull (62), NetherStar (63); EntityType wither (MONSTER, 300 HP, attack 8), wither_skull (PROJECTILE).
- StatusEffect: add `wither` type (HARMFUL, DURATION_BASED, maxAmplifier 4, default 10s).
- `src/simulation/WitherNetworking.ts`: replication descriptors (WitherSpawn/Update/Despawn) if needed, else reuse EntityReplication.
- `src/rendering/WitherRenderer.ts`: Three.js group for body+3 heads, boss-bar wiring via HUD (205), particles/sounds via existing systems.
- Game.ts wiring: onBlockPlace triggers summon check authoritative, tickWithers each simulation tick, spawn explosion once, skull stepping, damage routing, loot drop, save/load via GamePersistence extension.
- Persistence: `WitherSaveCodec` version 1, atomic validation, legacy migration returns empty.
- Tests: unit for each module + integration + E2E summon→charge→fight→death→loot→reload.

## Invariants
- One WitherState per boss entity; statuses SPAWNING→ACTIVE→DEFEATED monotonic; DEFEATED never mutated.
- Health in [0, maxHealth]; phaseIndex == phaseForHealthFraction.
- TILE: summon checks only positions within 2×2×3 around placed block; never scans world.
- Skull count per tick bounded: at most 3 projectiles fired per 40-tick window, max 12 alive globally.
- Explosion block changes per skull ≤ 64 queried, ≤32 destroyed (strength scaled); protected blocks never destroyed.
- Projectile state deterministic given seed + tick; no Math.random().
- Replication state sorted by witherId ascending.

## API and data model
```ts
// WitherBoss.ts
export const WITHER_MAX_HEALTH = 300
export const WITHER_CHARGE_TICKS = 220
export const WITHER_SPAWN_EXPLOSION_STRENGTH = 7
export const WITHER_SKULL_STRENGTH = 1
export const WITHER_BLUE_SKULL_STRENGTH = 2.5
export const WITHER_ARMORED_THRESHOLD = 0.5
export const WITHER_REGEN_PER_TICK = 0.05 // 1 per 20 ticks
export const WITHER_SKULL_DAMAGE = 8
export const WITHER_BLUE_SKULL_DAMAGE = 12
export const WITHER_EFFECT_DURATION_TICKS = 200 // 10s normal, 40s blue handled via difficulty scaling

export interface WitherState {
  readonly id: number
  readonly bossState: BossState
  readonly x: number; y: number; z: number
  readonly yaw: number; pitch: number
  readonly sideHeadYaws: readonly [number, number]
  readonly targets: readonly [number|null, number|null, number|null] // central, left, right
  readonly skullCooldowns: readonly [number, number, number]
  readonly invulnerableTicks: number
  readonly hasSpawnExploded: boolean
  readonly hasDroppedReward: boolean
}

export function createWither(...): WitherState
export function tickWither(state: WitherState, ctx: WitherTickContext): WitherTickResult
export function damageWither(state: WitherState, amount: number, isProjectile: boolean, definition: BossDefinition): WitherDamageResult
export function healWither(...): WitherState
// etc.

// WitherSummon.ts
export interface SummonCheck { valid: boolean; origin: BlockCoord; soulSandPositions: BlockCoord[]; skullPositions: BlockCoord[] }
export function detectWitherSummon(world: SummonWorld, placedPos: BlockCoord): SummonCheck|null
export function consumeSummonStructure(world: SummonWorldMut, check: SummonCheck): void

// WitherSkull.ts
export interface WitherSkullState extends ProjectileState { kind: 'normal'|'blue'; ownerWitherId: number }
export function stepWitherSkull(...): SkullStepResult
```

## Control/data flow
1. Player places skull block → Game.onBlockPlace → detectWitherSummon localized → if valid, server authoritative createWither at spawn center, consume blocks, emit spawn.
2. Each simulation tick: tickWither increments charge, handles invulnerability, spawns explosion once, acquisitions targets via bounded scan (radius 40, max 30 candidates sorted by id), fires skulls per cooldown, moves, heals.
3. Skull tick: stepWitherSkull via ProjectileCore, on hit → explosion via ExplosionCore + damage + wither effect.
4. Damage: damageWither checks invulnerable (0 damage), armored projectile immunity (isProjectile && health<=50% ⇒ 0), applies via damageBoss, reports phaseChanged/defeated.
5. Death: on defeated → drop nether star via ItemEntityManager, award XP/advancement, replication despawn.
6. Persistence: serializeWithers validates, deserializeWithers atomic.
7. Rendering: WitherRenderer reads authoritative WitherStates each frame, interpolates, updates boss bar.

## Detailed behavior
- Summon pattern: base: center (x0,y0,z0) is soul sand/soil; arms: x±1 or z±1 at same y (orientation decides axis); stem: y-1 below center soul; skulls: y+1 above center and both arms. Valid soul blocks: soul_sand OR soul_soil. Valid skull blocks: wither_skeleton_skull or wither_skull (both accepted). Top of T is 1 block above surface.
- Spawn position: 0.5,1,0.5 above soul T center (center's +1 y). Structure consumption removes all 7 blocks.
- Invulnerability: ticks 0..219 status SPAWNING, health scales 0→1 linearly for boss bar (BossFramework's ticks used plus wither invulnerableTicks). During this phase damageBoss returns no-op except explosion? Actually invulnerable ⇒ all damage ignored. At tick 220 explosion strength 7 centered at spawn, then ACTIVE.
- Regen: +1 HP per second (0.05 per tick) when ACTIVE and not at max, deterministic. Kill heal: +5 HP per valid kill (undead excluded).
- Targeting: central head primary hostile target preferring nearest player within 40; side heads independently acquire nearest valid target excluding already-targeted ids, excluding undead (wither/skeleton/zombie), dead, out of range. Acquisition cadence every 20 ticks.
- Skull cadence: central every 40 ticks, sides every 40 offset by 20; blue skull fires when armored phase and 20% chance via deterministic rng stream seeded by wither id + tick.
- Projectiles: velocity length 1.5 (normal) or 0.9 (blue slow but high explosion), lifetime 120 ticks, no gravity/drag variant? Actually skulls are straight: gravity 0, drag 1.0.
- Wither effect: 10s normal, 40s blue on normal difficulty, scaled by difficulty (peaceful 0, easy 0.5, normal 1, hard 1.5). Periodic damage 1 per second via DamageType wither (periodic, interval 2s? Need check). Refresh semantics: higher amplifier replaces, same amplifier max duration wins.
- Armored: health ≤150 triggers armored, bar color same but renderer adds armor glow; while armored projectile damage =0, movement speed 1.5x.
- Death: health 0 ⇒ DEFEATED, spawn nether_star item entity, XP 50.
- Difficulty: peaceful: wither does not spawn? Actually vanilla despawns on peaceful. We'll treat peaceful as still spawns but deals 0 damage and despawns slowly. Simpler: wither takes half damage on easy, normal 1x, hard 1.5x? Need difficulty scaling documented.

## Failure modes
- Malformed summon structure ⇒ null, no side effects.
- Duplicate activation where structure already consumed ⇒ no wither created (idempotent consumption).
- Invalid skull/block ids during tick ⇒ skip, log bounded warning, don't crash.
- Persistence payload wrong version ⇒ throw before mutation, discard quarantined entry.
- Skull age exceeded ⇒ expired, removed, no explosion.

## Compatibility/migration
- New blocks/items/entity types appended after existing max ids (BlockId 60+, ItemId 60+, EntityType). No reuse.
- Save version 1 for withers; world without withers loads empty list silently.
- No dimension change; wither spawns in overworld only.

## Performance/resource constraints
- Summon check ≤ 7 block reads per placement, no scan.
- Target scan ≤ 30 candidates, sorted, every 20 ticks.
- Explosion per skull ≤ 64 block reads, ≤32 writes, chunks dirtied via existing pipeline.
- Skull count global cap 12, despawn oldest if exceeded.
- No per-frame full-world scan.

## Testing seams
- SummonWorld interface injected (getBlock, isSoulBlock, isSkullBlock).
- WitherTickContext injects world, entity query, explosion, rng, difficulty, gamerule.
- Projectile step injects resolver/world.
- Codec pure.

## Observability/debugging
- witherBarSnapshot, serializeWithers, getWitherDebugInfo.
- Particle/sound hooks use existing event emitters with wither-specific names.

## Affected files/symbols
- src/simulation/WitherBoss.ts (NEW)
- src/simulation/WitherSummon.ts (NEW)
- src/simulation/WitherSkull.ts (NEW)
- src/simulation/WitherEffect.ts (maybe extension)
- src/world/BlockRegistry.ts add blocks 60,61
- src/inventory/ItemRegistry.ts add items 60,61,62,63
- src/data/EntityType.ts add wither, wither_skull
- src/data/StatusEffect.ts add wither
- src/simulation/BossFramework.ts extend if needed but preserve
- src/engine/Game.ts wiring
- src/rendering/WitherRenderer.ts (NEW)
- tests/unit/Wither*.test.ts

## Rejected alternatives
- Three separate mob entities for heads: rejected — heads are not independent mobs, breaks single-entity authority and persistence.
- Bespoke explosion math: rejected — reuse ExplosionCore, only parameterize strength.
- Second boss engine: rejected — extend BossFramework, keep one lifecycle.

## Downstream dependencies
- HUD 205 consumes bossBarSnapshot
- ParticleSystem 199 for skull trail/explosion
- SoundEventFramework 200 for wither sounds
