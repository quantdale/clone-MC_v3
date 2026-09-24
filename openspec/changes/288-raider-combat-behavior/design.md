# Design: 288-raider-combat-behavior

## Context/current state

Raid track 282–287 is VERIFIED on `origin/main` (`3b26e2a`):

- 282: Game-owned ephemeral `raidState`, fixed-tick `tickRaid`, HUD feedback.
- 283: `__raid__` persistence (state only; entities non-persistent).
- 284: `RaidWaveController` + `RaidEntityBackend` spawn/despawn; registry
  keys `pillager`/`vindicator`/`ravager`/`witch`; exactly-once
  `onRaidEntityRemoved` → `recordRaiderDeath`.
- 285–287: Bad Omen, bar parity, live village detection.

`Game` owns a dedicated `raidEntityManager` (separate from
`HostileMobSystem`'s zombie manager). Wave entities spawn with health /
`attackDamage` metadata but no AI bundle, no physics tick, no player damage
out, and no player→raider damage in. Ambient zombies already fight via 146
(`TargetAcquisitionGoal` + `ChaseGoal` + `resolveMeleeAttack` → `hurtPlayer`).
Player→wither melee uses proximity + cooldown (252). `MobHealthTracker` (148)
exists but is not Game-wired for raiders. `ProjectileCore` (142) +
`BowAndArrow` formulas (143) exist; WitherSkull is the live projectile
consumer. No throwable potion entity simulation exists (PotionItemData is
payload-only).

## Target state

A narrow `RaiderCombatSystem` sits beside 284:

1. **Pure role helpers** — map `typeKey` → `MELEE` | `RANGED`, pin cadences /
   ranges / witch fallback damage.
2. **Per-tracked-entity AI** — for each `RaidWaveController` tracked id in the
   raid `EntityManager`: acquire player (if attackable) else home toward raid
   center; melee types swing via `resolveMeleeAttack`; ranged types fire
   projectiles through `ProjectileCore` + bow/arrow damage math (witch uses
   the same projectile seam with pinned fallback damage).
3. **Player→raider damage** — wither-style proximity melee while the player is
   attackable and break/attack input is active (plus a deterministic
   `debugDamageRaidEntity` seam for E2E).
4. **Death** — on raider HP ≤ 0: `manager.remove` + `onRaidEntityRemoved`
   (exactly-once). On player death while raid `ACTIVE`: force `DEFEAT` and
   clear wave entities. Timeout `DEFEAT` unchanged.
5. **Lifecycle** — skip combat while paused/loading/disposed; clear bundles /
   projectiles / health on clear/terminal/dispose/reload.

## Invariants

- `RaidStateMachine` remains the sole mutator of raid counters/status except
  through existing public helpers (`recordRaiderDeath`, `tickRaid`, and a
  narrow `forceRaidDefeat` helper that only flips ACTIVE→DEFEAT).
- Deaths still pass `RaidWaveController.consumeDeath` exactly once per
  `(generation, entityId)`.
- Combat only considers ids currently tracked by the wave controller.
- Raiders never join `HostileMobSystem` or ambient spawn caps.
- No new persistence namespace; combat state is ephemeral.
- Pause: no AI/projectile/player-melee ticks driven by the fixed simulation
  path while paused (same gate as 282 `tickRaid`).
- Dispose/reload: bundles/projectiles/health cleared; no resurrection.
- Witch MUST NOT invent a potion entity system; fallback is documented.
- Bounded work: O(tracked raiders + live projectiles) per tick; projectile
  cap; no A* pathfinding required (straight chase like 146).

## API and data model

```ts
export type RaiderCombatRole = 'MELEE' | 'RANGED';

export function raiderCombatRole(typeKey: string): RaiderCombatRole;

export interface RaiderCombatProfile {
  readonly role: RaiderCombatRole;
  readonly meleeRange: number;
  readonly rangedMin: number;   // standoff
  readonly rangedMax: number;   // fire when within
  readonly chaseSpeed: number;
  readonly homeSpeed: number;
  readonly attackCooldownTicks: number;
  readonly baseDamage: number;  // from registry or witch fallback
}

export function raiderCombatProfile(
  typeKey: string,
  registryDamage: number | undefined,
): RaiderCombatProfile;

// System (Game-owned, one instance)
export class RaiderCombatSystem {
  constructor(opts: {
    manager: EntityManager;
    registry: EntityRegistry;
  });
  tick(input: RaiderCombatTickInput): RaiderCombatTickResult;
  damageRaider(entityId: number, amount: number): { died: boolean; health: number };
  clear(): void; // dispose/terminal/reload
}

export interface RaiderCombatTickInput {
  readonly dt: number;
  readonly simTick: number;
  readonly paused: boolean;
  readonly center: { x: number; y: number; z: number };
  readonly trackedIds: readonly number[];
  readonly getPlayerTarget: () => PlayerTarget | null; // null = untargetable
  readonly world: ShapeWorld; // for projectile block hits
  readonly resolver: CollisionResolver;
  readonly onPlayerDamaged: (amount: number, sourceX: number, sourceZ: number, reason: string) => void;
  readonly onRaiderDied: (entityId: number) => void; // Game routes to onRaidEntityRemoved
  readonly playerMeleeRequested: boolean;
}
```

Pinned constants (unit-tested):

| key | role | notes |
|---|---|---|
| pillager | RANGED | damage from registry `attackDamage` (4) via arrow formula floor |
| vindicator | MELEE | registry 6 |
| ravager | MELEE | registry 12; slightly larger melee range |
| witch | RANGED | `WITCH_RANGED_FALLBACK_DAMAGE = 5` (attackDamage 0 in registry) |

## Control/data flow

1. After 282/284 raid tick + spawn apply on an unpaused fixed tick, Game calls
   `raiderCombat.tick(...)` with current tracked ids + raid center + player
   target (null when spectator / dead / not attackable).
2. System ensures a goal bundle per tracked id; drops bundles for untracked ids.
3. Per raider: if player target acquired → chase/standoff; else steer toward
   center; run one physics step; attempt melee or spawn/step projectiles.
4. Projectile hits player → `onPlayerDamaged` with reason `pillager`/`witch`.
5. If `playerMeleeRequested` and cooldown ready → nearest raider in range takes
   damage; death → remove + `onRaiderDied`.
6. `onSurvivalEvent('death')` while `raidState.status === 'ACTIVE'` → force
   DEFEAT, clear combat + wave entities, sync HUD.

## Detailed behavior

### Target selection
- Prefer the live player when `getPlayerTarget()` returns non-null and within
  detection radius (default 24) / forget hysteresis (40), mirroring 140.
- Else home: steer horizontal velocity toward `(centerX, centerZ)` at
  `homeSpeed` while farther than 1.5 blocks.

### Melee (vindicator, ravager)
- Reuse `ChaseGoal` + `resolveMeleeAttack` with registry `attackDamage`,
  shared player `InvulnerabilityTracker` (`PLAYER_SENTINEL_ID`), same
  full-cooldown ticks pattern as 146.
- Ravager melee range 2.5; vindicator 2.0.

### Ranged (pillager, witch)
- Approach until horizontal distance ≤ `rangedMax` and prefer staying near
  `rangedMin` (simple chase with attackRange = rangedMin).
- On cooldown and within `rangedMax`, spawn a `ProjectileState` aimed at the
  player using `computeFireVelocity` at full pull; step via `stepProjectile`.
- On `hitEntityId` player: damage =
  - pillager: `computeArrowDamage(speed)` (pinned baseline),
  - witch: `WITCH_RANGED_FALLBACK_DAMAGE`.
- Block hit / expire: drop projectile. Cap live projectiles (e.g. 32).

### Witch fallback rationale
`PotionItemData` / brewing expand catalogs but there is no throwable potion
entity stepper analogous to WitherSkull. Building one is out of scope.
Witch therefore reuses the projectile core with a fixed damage constant and
reason `'witch'`, still shield-blockable via `hurtPlayer`.

### Player→raider
- When `playerMeleeRequested` (break held / attack window, matching wither
  proximity pattern) and player attackable: damage nearest tracked raider
  within 3.5 blocks for `PLAYER_RAID_MELEE_DAMAGE` (5) subject to cooldown.
- `debugDamageRaidEntity(id, amount)` for deterministic E2E / unit seams.
- Health from registry `health` via `MobHealthTracker`; death removes entity
  and invokes `onRaiderDied`.

### LOSS / VICTORY
- VICTORY: unchanged — clear all raiders via death consumption until waves
  exhaust.
- DEFEAT: timeout unchanged; **new** player-death while ACTIVE →
  `forceRaidDefeat(state)` sets status DEFEAT preserving counters for HUD.

## Failure modes

- Unknown/stale entity id in damage/death → no-op.
- Non-finite positions/damage → skip attack / no-op.
- Backend entity already removed → drop bundle silently.
- Projectile world missing shapes → block miss only; never throw on tick.
- Double death callback → `consumeDeath` false → no second recordRaiderDeath.

## Compatibility/migration

No schema/registry/archive changes. 284 spawn/despawn contracts unchanged.
285–287 village/omen/bar paths untouched except shared fixed-tick ordering
(combat after spawn apply).

## Performance/resource constraints

- Only tracked wave entities (typically ≤ ~20).
- Projectile cap 32; one physics step per raider; no A*.
- No workers, GPU, or headed FPS claims.

## Testing seams

- Pure: `raiderCombatRole`, profiles, witch fallback constant, forceDefeat.
- System harness with recording manager + fake player target.
- Game: `debugDamageRaidEntity`, `getRaidWaveEntityIds`, survival death →
  DEFEAT, pause freeze.
- E2E: start raid → raiders damage player HP; kill all via debug damage →
  waves advance / VICTORY; optional player-kill → DEFEAT.

## Observability/debugging

- Existing `#raid-feedback` / bar parity reflects status.
- `getLastRaidWaveApplyResult` unchanged.
- Optional toast on DEFEAT already covered by feedback projection.

## Affected files/symbols

- NEW: `src/simulation/RaiderCombatBehavior.ts`
- NEW: `tests/unit/RaiderCombatBehavior.test.ts`,
  `tests/unit/LiveRaiderCombat.test.ts`,
  `tests/e2e/raider-combat.spec.ts`
- UPDATE: `src/engine/Game.ts` (wire tick, death→DEFEAT, debug seam)
- UPDATE: OpenSpec control plane + `PARITY_MATRIX.md` C288

## Rejected alternatives

- Folding raiders into `HostileMobSystem` — mixes ambient spawn caps and
  raid generation tracking.
- New Goal/AI framework — forbidden by scope; 140/146 suffice.
- Full witch potion entities — missing primitives; deferred.
- A* pathfinding for home/chase — 146 straight chase is the verified parity
  baseline and cheaper.

## Downstream dependencies

- 289+ may add HOTV, villager defend, patrols, or richer witch potions; 288
  must not implement them.
