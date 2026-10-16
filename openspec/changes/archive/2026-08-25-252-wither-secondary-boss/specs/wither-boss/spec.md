# Spec: wither-boss

## Contract
Adds a Wither-like secondary boss reusable from BossFramework, covering summoning, invulnerability/charge with spawn explosion, three-head targeting, normal/blue skull projectiles via ProjectileCore/ExplosionCore, Wither status effect, bounded world destruction, BossFramework phase machine (Birth/Charge, Ranged/Aerial, Armored/Enraged), damage/healing/immunities/death, Nether-Star reward, state-driven rendering, server-authoritative multiplayer replication, chunk-persistent lifecycle, deterministic/performance guarantees, and production integration without duplicating boss infrastructure.

## Definitions
- **Summon structure**: T-shaped base of soul_sand/soul_soil (4 blocks) topped with 3 wither skull blocks, two orientations (X-axis / Z-axis arms), activation on final skull placement.
- **Wither entity**: single authoritative entity with central + 2 side heads, BossState SPAWNING→ACTIVE→DEFEATED, charge 220 ticks, spawn explosion strength 7, health 300.
- **Skull projectile**: normal (strength 1, damage 8, wither 10s) or blue variant (strength 2.5, damage 12, wither 40s, high destruction), straight trajectory, lifetime 120 ticks.
- **Wither effect**: HARMFUL duration-based effect, periodic health damage 1 per 2s via manager tick, difficulty-scaled duration.

## Invariants
- Every transition returns new state, never mutates input.
- Health in [0,300]; phaseIndex matches phaseForHealthFraction; status monotonic.
- Summon detection reads ≤7 blocks around placed position only.
- Per-tick block queries per wither ≤ 64, destroys ≤32, oldest skull cap 12.
- All targeting/explosion/roll sequences deterministic given seed/tick/id.

## Requirements

### Requirement: Summoning pipeline
System MUST detect valid T-summon within 2 blocks of placed block, accept both soul_sand/soul_soil as base and both skull variants as top, support both X/Z orientations, spawn at center+1, consume 7 blocks atomically, prevent duplicate activation, reject malformed/incomplete patterns. Server is authoritative.

#### Scenario: valid X-oriented summon activates
- **GIVEN** soul T at (0,0,0) center, arms x±1, stem y-1, skulls y+1 above center+arms (X axis)
- **WHEN** final skull placed at (1,1,0)
- **THEN** detectWitherSummon returns valid with origin (0.5,1,0.5), consumeSummonStructure clears 7 blocks, creation yields wither at spawn.

#### Scenario: valid Z-oriented summon activates
- **GIVEN** same but arms z±1
- **WHEN** final skull at (0,1,1)
- **THEN** valid, spawn (0.5,1,0.5).

#### Scenario: soul soil variant accepted
- **GIVEN** T built with soul_soil instead of soul_sand
- **WHEN** final skull placed
- **THEN** valid.

#### Scenario: incomplete pattern rejected
- **GIVEN** missing arm soul block
- **WHEN** skull placed
- **THEN** null.

#### Scenario: duplicate activation prevented
- **GIVEN** structure already consumed (air)
- **WHEN** second summon check at same coords
- **THEN** null and no second wither.

### Requirement: Initial spawn/invulnerability phase
Wither MUST start SPAWNING, invulnerable 220 ticks, health bar fraction grows 0→1 linearly during charge, cannot take ordinary damage, emits particles/sounds via existing hooks, deterministically transitions to ACTIVE at tick 220 with exactly one spawn explosion (strength 7), no replay after save/load.

#### Scenario: invulnerable during charge
- **GIVEN** wither at tick 0 (SPAWNING)
- **WHEN** damageWither called with 50
- **THEN** health unchanged, status SPAWNING.

#### Scenario: spawn explosion exactly once
- **GIVEN** wither ticks 0..219 without explosion
- **WHEN** tick 220 reached
- **THEN** explosion once at spawn center, next tick no explosion, save/load before 220 resumes correctly.

#### Scenario: save/load during charge resumes
- **GIVEN** serialized wither at tick 100 SPAWNING
- **WHEN** deserialized and ticked to 220
- **THEN** explosion at 220, not earlier.

### Requirement: Three-head combat architecture
Single entity MUST support central head primary target, side heads independent secondary targets, deterministic acquisition every 20 ticks, invalid targets released, independent yaws, explicit cooldowns, bounded scan, replication state sorted by witherId.

#### Scenario: central tracks primary, sides independent
- **GIVEN** 3 players id 1,2,3 within range
- **WHEN** tickWither with acquire targets
- **THEN** central=nearest (id 1), left=next (id 2), right=next (id 3) or null if <3 candidates.

#### Scenario: out-of-range/dead target released
- **GIVEN** wither tracking dead entity 5
- **WHEN** next acquisition tick
- **THEN** target 5 released.

#### Scenario: scan bounded
- **GIVEN** 100 candidates
- **WHEN** tickWither queries
- **THEN** only first 30 sorted by id considered.

### Requirement: Skull projectile system
Normal and blue skulls MUST spawn per-head deterministically, velocity towards target, gravity 0 drag 1, entity/world collision via ProjectileCore, direct damage, ExplosionCore explosion, wither effect, ownership attribution, self-hit prevention, lifetime 120, bounded count, replication, persistence if supported.

#### Scenario: normal skull hits entity
- **GIVEN** wither fires normal skull at target 2
- **WHEN** step reaches target radius
- **THEN** hitEntityId=2, direct damage 8, explosion strength 1, wither effect 10s.

#### Scenario: blue skull high destruction
- **GIVEN** blue skull fired
- **WHEN** hits world
- **THEN** explosion strength 2.5, can destroy obsidian? Actually respects blastResistance but with higher power, damage 12, wither 40s.

#### Scenario: skull lifetime bound
- **GIVEN** skull age 120
- **WHEN** next tick
- **THEN** expired true, removed.

### Requirement: Wither status effect
StatusEffect registry MUST contain `wither` (HARMFUL, DURATION_BASED, maxAmplifier 4, defaultDuration 10). Manager MUST support duration/difficulty scaling (peaceful 0, easy 5s, normal 10s/40s blue, hard 20s/60s), periodic 1 damage per 40 ticks (2s), refresh/stack semantics (higher amplifier wins, same amplifier max duration), death attribution, HUD status, save/load via manager serialize, replication via status sync, immunity for wither/undead.

#### Scenario: wither ticks damage
- **GIVEN** player with wither 10s
- **WHEN** tick 40 times (2s)
- **THEN** health reduced by 1, duration decreased.

#### Scenario: difficulty scaling
- **GIVEN** easy difficulty
- **WHEN** normal skull applies
- **THEN** duration 5s.

#### Scenario: undead immune
- **GIVEN** wither entity itself
- **WHEN** skull would apply wither
- **THEN** no effect.

### Requirement: World destruction and explosions
Skull/spawn explosions MUST use ExplosionCore, respect blastResistance, protected blocks (bedrock, portal, barrier) never destroyed, entity damage falloff via explosionEntityDamage, honor gamerule mobGriefing false ⇒ no block destruction, server authoritative, chunk dirtiness via world setBlock, persistence.

#### Scenario: bedrock protected
- **GIVEN** explosion at (0,0,0) strength 7 containing bedrock
- **WHEN** computeExplosion
- **THEN** bedrock not in destroyed.

#### Scenario: mobGriefing false
- **GIVEN** gamerule mobGriefing false
- **WHEN** skull hits ground
- **THEN** no blocks destroyed, only entity damage.

#### Scenario: bounded destruction
- **GIVEN** dense terrain wither intersecting ground continuously
- **WHEN** 100 skulls fire
- **THEN** per-tick destroys ≤32, no stall.

### Requirement: Combat phases
BossFramework phases MUST map to Birth/Charge (SPAWNING), Ranged/Aerial (health>150, airborne pursuit), Armored/Enraged (health≤150, visible armored, projectile immunity, 1.5x speed, continues offensive). Transitions idempotent save/load safe.

#### Scenario: armored transition
- **GIVEN** wither health 300
- **WHEN** damaged to 150
- **THEN** phaseIndex 1, armored true.

#### Scenario: heal above threshold restores ranged
- **GIVEN** armored at 100
- **WHEN** healed to 200
- **THEN** phaseIndex 0, armored false.

#### Scenario: projectile immunity in armored
- **GIVEN** armored wither health 100
- **WHEN** projectile damage 10 via damageWither isProjectile true
- **THEN** health unchanged.

### Requirement: Damage, healing, immunities, death
MaxHealth 300, difficulty-scaled damage taken (peaceful immune?), passive regen 1/s, kill heal 5 (excludes undead), fire/lava/drown/fall/suffocation immunities for wither, undead classification not targeted, self/explosion immunity, friendly exclusion, death at 0 ⇒ DEFEATED, XP 50, removal deterministic.

#### Scenario: passive regen
- **GIVEN** wither health 299 at ACTIVE
- **WHEN** tick 20 times
- **THEN** health 300 (capped).

#### Scenario: kill heal
- **GIVEN** wither kills non-undead entity
- **WHEN** onKill called
- **THEN** +5 health.

#### Scenario: death drops reward exactly once
- **GIVEN** wither at 1 health
- **WHEN** lethal damage
- **THEN** DEFEATED, nether star dropped once, second damage no-op.

### Requirement: Reward and progression
Nether-star-like item MUST drop exactly once via ItemEntityManager, world pickup, serialization stable, multiplayer ownership world drop (not inventory direct), no duplication after save/load.

#### Scenario: reward exactly once after reload
- **GIVEN** wither DEFEATED serialized with hasDroppedReward true
- **WHEN** deserialized and lethal damage re-applied
- **THEN** no second star.

### Requirement: Rendering and player feedback
Boss bar via bossBarSnapshot progress/phasename, body + 3 heads orientation derived from targets, charge shimmer particle, armored glow, skull sprite, explosion particles, status effect icon via HUD, damage flash, death particles, dispose cleanly.

#### Scenario: boss bar at charge scales
- **GIVEN** SPAWNING tick 110
- **WHEN** bossBarSnapshot
- **THEN** progress 0.5 (110/220) alternative scaling? Actually health still 300 but bar shows charge fraction.

#### Scenario: heads yaw towards targets
- **GIVEN** targets at angles 0,90
- **WHEN** tickWither
- **THEN** sideHeadYaws updated.

### Requirement: Multiplayer authority and replication
Server owns all authoritative decisions, client interpolates, state replication via EntityReplication/BossBar sync, test 2+ clients observe sync bar/phases/projectiles/destruction, simultaneous attacks, disconnect/reconnect, late join, no duplicate summon/loot.

#### Scenario: simultaneous attacks from 2 players
- **GIVEN** wither health 100, two clients deal 60 each same tick server
- **WHEN** server processes both
- **THEN** order deterministic by playerId, health 0 DEFEATED one star.

### Requirement: Persistence and chunk lifecycle
Save/load/unload/reload at charge/ranged/armored/low health MUST restore health/phase/cooldowns/targets-independent state, no replay explosion, no duplicate reward, malformed data quarantined.

#### Scenario: reload during armored low health
- **GIVEN** serialized armored 10 HP
- **WHEN** deserialize
- **THEN** health 10 phase 1 ACTIVE.

### Requirement: Determinism and performance
No Math.random(), deterministic RNG stream seeded by wither id+tick, iteration sorted, stress multiple bosses/dense terrain/many targets/projectiles/clients/chunk cycles without allocations blowup.

#### Scenario: deterministic replay
- **GIVEN** same seed wither tick sequence 100 ticks twice
- **WHEN** compared
- **THEN** states deep equal.

## Error and failure behavior
- Invalid summon ⇒ null no throw.
- Invalid deserialize ⇒ throw before mutation, quarantine.
- Skull expired ⇒ silent removal.
- Protected block ⇒ not destroyed.
- Projectile immunity ⇒ 0 damage not error.
- Duplicate reward ⇒ suppressed.

## Performance and resource bounds
- Summon ≤7 reads, O(1).
- Tick ≤30 target candidates, ≤3 skull spawns per 40 ticks, explosion ≤64 reads.
- Skull global cap 12.
- No per-frame full-chunk scan.
- Memory per wither <2KB, per skull <200B.

## Compatibility and migration
- New block/item/entity IDs append; no reuse.
- Codec version 1; unknown version rejected.
- Legacy world loads empty wither list.

## Security and integrity
- Server validates summon, ignores client-spawned wither messages.
- Blast resistance prevents protected block grief.
- Skull ownership prevents self-damage attribution bypass.

## Observability
- bossBarSnapshot for HUD
- getWitherDebugInfo trace
- serializeWithers for save

## Verification mapping
| Requirement | Test |
|---|---|
| Summon pipeline | WitherSummon.test.ts valid/invalid/consume/duplicate |
| Charge/invuln+explosion exactly once | WitherBoss.test.ts charge, spawn explosion, save/load charge |
| Three-head targeting | WitherBoss targeting tests |
| Skull projectiles | WitherSkull.test.ts normal/blue/collision/lifetime |
| Wither effect | StatusEffect w/ wither duration/damage/immunity |
| World destruction | ExplosionCore wither strengths + gamerule |
| Phases | phase transition, armored immunity |
| Damage/heal/death | regen, kill heal, death reward once |
| Reward | loot drop once, persistence |
| Rendering | snapshot tests for bar/projection |
| Multiplayer | deterministic server authority, late join |
| Persistence | serialize/deserialize round-trip all phases |
| Determinism | replay hash |
