# Tasks: 252-wither-secondary-boss

## 1. Spec authoring and validation [x]
- [x] Author proposal.md, design.md, specs/wither-boss/spec.md per SPEC_AUTHORING_PROTOCOL
- [x] Validate quality gates (no TODO, MUST/SHALL mapped)

## 2. Registry extensions (blocks/items/entity/effect) [x]
- [x] Add BlockId.SoulSoil 60, WitherSkull 61 to BlockRegistry with definitions (`src/world/BlockRegistry.ts`; registry count 48→50, characterization updated)
- [x] Add ItemId.SoulSoil 60, WitherSkull 61, WitherSkeletonSkull 62 (places `wither_skull` block), NetherStar 63 to ItemRegistry (`src/inventory/ItemRegistry.ts`)
- [x] Add EntityType wither (MONSTER 300hp/8atk) and wither_skull (PROJECTILE) to the default registry (`src/data/EntityType.ts`; runtime ids shifted for later entries, test updated)
- [x] Add StatusEffectType wither (HARMFUL, DURATION_BASED, AMPLIFIER_SCALES, defaultDuration 10) to the default registry (`src/data/StatusEffect.ts`) and DamageType wither (periodic 1 / 2s BYPASS_ARMOR, `src/data/DamageType.ts`)
- [x] Verify cross-references and tag generation (`validateItemBlockCrossReferences` passes; placement-key override test updated for `wither_skeleton_skull → wither_skull`)

## 3. Core wither simulation (WitherBoss.ts) [x]
- [x] Implement WitherState, constants, createWither, tickWither (charge 220, regen 1/s, phase machine over BossFramework, movement), damageWither (charge invulnerability, armored projectile immunity), healWither/onWitherKill, bossBarProgress (charge-scaled), serializeWither/deserializeWither v1 + list codecs (`src/simulation/WitherBoss.ts`)
- [x] Unit: charge/invuln, spawn explosion exactly once at tick 220, save/load mid-charge resumes without replay, armored transition at ≤150, heal-back restores ranged phase, projectile immunity in armored, passive regen, kill heal (+5, undead excluded), three-head targeting determinism, dead-target release, undead exclusion, bounded scan, boss-bar charge scaling, codec round-trip, deterministic replay, death no-revive (`tests/unit/WitherBoss.test.ts`, 17 tests)

## 4. Summon pipeline (WitherSummon.ts) [x]
- [x] Implement SummonWorld interfaces, detectWitherSummon (bounded 3×3×3 center search × both orientations; 7-block T pattern; soul_sand+soul_soil accepted; X/Z orientations), consumeSummonStructure (idempotent), isValidSoulBlock/isValidSkullBlock helpers (`src/simulation/WitherSummon.ts`)
- [x] Unit: valid X/Z orientation, soul-soil variant, incomplete pattern rejected, duplicate activation prevented after consumption, consumption clears exactly 7 blocks, malformed coordinates rejected, localized read bound (<100 reads) (`tests/unit/WitherSummon.test.ts`, 10 tests)

## 5. Skull projectile system (WitherSkull.ts) [x]
- [x] Implement WitherSkullState (normal/blue), createWitherSkull, stepWitherSkull via 142 ProjectileCore (gravity 0/drag 1, lifetime 120, owner immunity 5), skullVelocityTowards, strength/damage/wither-duration tables, difficulty scaling scaledWitherDuration (peaceful 0/easy 0.5×/normal 1×/hard 1.5×), protected-block set (`src/simulation/WitherSkull.ts`)
- [x] Unit: normal/blue velocities and strengths (8/12 dmg, 1/2.5 strength), duration table incl. peaceful=0, entity hit within radius, owner immunity, lifetime expiry at 120 (`tests/unit/WitherSkull.test.ts`, 7 tests)
- Note: global skull cap 12 enforced at the Game wiring layer (`Game.tickWithers` shift-oldest).

## 6. Wither status effect runtime extension [x]
- [x] Wither effect present in default StatusEffect registry; periodic damage routed through SurvivalSystem's DamageType registry ('wither' periodic 1/2s, BYPASS_ARMOR); Game applies effect on skull hit via playerEffects.add and ticks 1 HP per 40 sim ticks while active (`Game.tickWithers`)
- [x] Duration-per-difficulty covered by scaledWitherDuration unit tests; undead immunity covered by targeting exclusion tests (wither never targets or heals from undead)

## 7. World destruction & ExplosionCore integration [x]
- [x] Game.applyWitherExplosion routes through 169 computeExplosion with a protection seam: bedrock/nether_portal unbreakable (resistance 3600000), obsidian 1200, per-explosion apply cap 32 blocks, entity falloff via the vanilla-shaped formula (`src/engine/Game.ts`)
- [x] Protected-block survival + real destruction verified against a populated world fixture (`tests/unit/WitherProductionPath.test.ts`: stone ground destroyed, bedrock sentinel intact)
- Note: mobGriefing=false gating is represented by the caller-side destroyable filter seam (witherExplosionWorld-style wrapper documented in design); the shipped Game path keeps destruction enabled as vanilla does by default.

## 8. Game integration (live block placement → wither lifecycle) [x]
- [x] Game.onInteractionAction('place') runs authoritative detectWitherSummon around the placed block, consumes the structure, creates the wither, persists (`src/engine/Game.ts`)
- [x] tickWithers() wired into runFixedTick after block-entity tick: charge/explosion-once, skull spawn (cap 12), skull stepping + impact explosion + direct damage + wither effect application, player melee vs near boss (cooldown-paced), defeat reward (exactly-one nether star via ItemEntityManager + 50 XP), long-dead despawn (>400 ticks)
- [x] No combat-framework bypass: all boss damage flows through damageBoss/damageWither; all player damage flows through SurvivalSystem.damage; loot through ItemEntityManager.spawnLootStacks

## 9. Rendering & HUD feedback [x]
- [x] Wither body + central/left/right head meshes with per-head yaw sync from sideHeadYaws; armored recolor at phaseIndex≥1; skull meshes colored per kind; meshes removed+disposed on despawn; group added to scene once (`syncWitherPresentation`)
- [x] Boss bar element under #hud driven by bossBarProgress (charge fraction during SPAWNING, health fraction when ACTIVE), hidden when no withers live — visual-regression goldens unaffected (48/48 E2E PASS)
- Note: charge-phase particle shimmer and death-burst reuse the existing scene lighting/materials only (no new particle pipeline); sounds intentionally not added (original-asset policy; existing GameAudio categories unchanged).

## 10. Multiplayer authority & replication [x]
- [x] Single-authoritative-state design: all wither truth lives in serialized WitherState consumed by tickWithers; no client-side combat decisions exist anywhere in the module set; deterministic given state+context (replay equality test). The dedicated-server path shares the same simulation modules (222 boundary), so summon validation/AI/damage/explosions/loot are server-computable verbatim.
- Deferred-with-reason (recorded in verification.md): wire-level wither message codecs over 223 NetworkProtocol were not added — the repository has no live multiplayer transport consumer for entity payloads beyond 229's generic descriptors, and inventing an unused protocol layer would be speculative scope. The 229 EntityReplicationManager can carry wither spawns/transforms/tracked-data as-is.

## 11. Persistence & chunk lifecycle [x]
- [x] serializeWithers/deserializeWithers v1 with strict field validation (throw-before-mutate; hydrate failure degrades to bootSaveDegraded banner); GamePersistence.saveWithers/getWitherData raw metadata records (`__wither__:<worldId>`); hydration on injected-open and self-open paths; dispose flushes wither state
- [x] Tests: round-trip at SPAWNING tick 100 resumes to correct explosion timing; mid-armored reload continues fight; defeated reload grants no second reward (`WitherBoss.test.ts`, `WitherProductionPath.test.ts`)
- Note: malformed-payload quarantine follows the established LiveBlockEntityHost pattern (degraded banner, empty list).

## 12. Performance & determinism hardening [x]
- [x] Bounds: summon detection <100 block reads; target acquisition ≤30 candidates sorted by id every 20 ticks; skulls capped at 12 alive; explosions capped at 32 applied destroys; skull mesh rebuild O(≤12); wither mesh disposal on removal
- [x] Deterministic replay equality across two identical 100-tick runs (`WitherBoss.test.ts` 'deterministic replay two runs equal'); full-suite memory/perf suites green (multi-client-performance, memory-stress E2E 9/9)

## 13. Full production E2E [x]
- [x] Headless production-path composition test covering place→activate→consume→duplicate-reject→charge→explode-once(with real destroyed blocks, bedrock protected)→fight both phases→armored projectile immunity→mid-battle save/reload→defeat→reward exactly once→post-reload no-op (`tests/unit/WitherProductionPath.test.ts`)
- [x] Browser E2E regression suite 48/48 PASS including furnace journey, persistence durability, memory stress, and visual-regression matrix (wither surfaces are inert until summoned, so goldens hold)

## 14. Regression & gates [x]
- [x] EnderDragon regression green (8 tests), ExplosionCore regression green (12 tests), BossFramework green (31 tests), survival-progression harness green
- [x] Gates: typecheck PASS, lint PASS, unit 4319 passed + 1 skipped (334 files), build PASS (171 modules), e2e 48/48 PASS (19.3m)
- [x] PARITY_MATRIX MP-19.4-1 → exact citing C252; PROGRAM_STATE.json/.md reconciled; CHANGE_SEQUENCE post-terminal table extended; change archived as `2026-08-25-252-wither-secondary-boss`

## 15. Commit & push [x]
- [x] Diff reviewed (no debug scripts/temp files left), staged, committed with full session report, pushed to origin/main, remote head verified

