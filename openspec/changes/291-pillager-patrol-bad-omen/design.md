# Design: 291-pillager-patrol-bad-omen

## Context/current state

On `origin/main` `bc777e1` (290 VERIFIED):

- `Game.badOmen: BadOmenState` is ephemeral (285, never persisted);
  `Game.grantBadOmen(amount?)` stacks through `BadOmenRules.grantBadOmen`
  (cap `BAD_OMEN_MAX_LEVEL = 5`). No gameplay path calls it.
- The 285 fixed-tick `evaluateBadOmenVillageTrigger` starts a raid (via
  `startRaidAt`, which replaces any prior raid) when omen ≥ 1 and the player is
  inside a detected village (287 bed-scan, R=12).
- Raid waves spawn through `RaidWaveController` → `RaidEntityBackend`
  (`createEntityManagerRaidBackend`) into `Game.raidEntityManager`; 288
  `RaiderCombatSystem` drives pillager ranged / melee AI; deaths route through
  `onRaidEntityRemoved` → exactly-once `recordRaiderDeath`. Raid entities are
  **not rendered** (no renderer consumes `raidEntityManager`).
- `statistics.time_played` counts fixed play ticks and **is persisted** (271).
- Day tick: `currentDayTick()` 0–23999 (274); `isNight(tick)` in
  `SleepFramework` (night window 12542–23459 inclusive per 198 constants).
- Day length is 600 s = 12000 fixed ticks at 20 TPS, i.e. one in-game day.
- Seeded streams: `createNamedRng(worldSeed, name)` (`SeedRng`).

## Target state

1. Pure planner `decidePatrolAttempt(ctx, rng)` returning `SPAWN` with a
   member plan (exactly one captain) or `SKIP` with a typed reason.
2. `PillagerPatrolSystem` owns: cooldown countdown, one patrol roster, a
   `RaidEntityBackend` over a dedicated patrol `EntityManager`, a dedicated
   `RaiderCombatSystem`, captain-death detection and out-of-range despawn.
3. Game constructs one system (stream `createNamedRng(seed, 'pillager-patrol')`),
   ticks it once per unpaused fixed tick after the 285 omen evaluate, grants
   Bad Omen +1 on captain death, dismisses the patrol on raid start, clears it
   on dispose/pagehide, and exposes debug seams.

## Invariants

- I1. At most one live patrol; each patrol has exactly one captain at spawn;
  therefore at most one live captain exists.
- I2. Natural attempts are separated by ≥ `PATROL_ATTEMPT_INTERVAL_TICKS`
  (6000) fixed ticks; each attempt draws a new cooldown in [6000, 6599].
- I3. Given the same world seed and the same sequence of attempt contexts, the
  sequence of decisions is identical (determinism).
- I4. A gate skip consumes **no** RNG draws from the planner.
- I5. Captain death (and only captain death) invokes the omen callback, exactly
  once per patrol. Despawn/clear/dismiss never grant.
- I6. `PillagerPatrolSystem` has no access to `RaidState`; patrol deaths never
  call `recordRaiderDeath`. Raid-wave deaths never call `grantBadOmen`.
- I7. Patrols, cooldown and Bad Omen are not persisted; no new namespace.
- I8. Paused/loading/disposed Game never enters the patrol tick.
- I9. Change 258 stays BLOCKED; no GPU work.

## API and data model

```ts
export const PATROL_TYPE_KEY = 'pillager';
export const PATROL_MIN_WORLD_TICKS = 60000;        // 5 in-game days here
export const PATROL_ATTEMPT_INTERVAL_TICKS = 6000;  // half an in-game day
export const PATROL_ATTEMPT_JITTER_TICKS = 600;     // cooldown ∈ [6000, 6599]
export const PATROL_SPAWN_CHANCE_DENOMINATOR = 5;   // success iff nextInt(5) === 0
export const PATROL_MIN_OFFSET = 24;                // |dx|,|dz| ∈ [24, 47]
export const PATROL_OFFSET_SPREAD = 24;
export const PATROL_ANCHOR_TRIES = 4;
export const PATROL_MIN_SIZE = 2;                   // size ∈ [2, 4]
export const PATROL_MAX_SIZE = 4;
export const PATROL_MEMBER_SCATTER = 4;             // member offset ∈ [-4, 4]
export const PATROL_DESPAWN_DISTANCE = 128;         // horizontal blocks
export const BAD_OMEN_PER_CAPTAIN = 1;

export type PatrolSkipReason =
  | 'INVALID_PLAYER' | 'DISABLED' | 'PEACEFUL' | 'SPECTATOR' | 'RAID_ACTIVE'
  | 'PATROL_ALIVE' | 'WORLD_TOO_YOUNG' | 'NIGHT' | 'NEAR_VILLAGE'
  | 'CHANCE' | 'NO_SURFACE';

export interface PatrolAttemptContext {
  readonly doMobSpawning: boolean;
  readonly difficulty: string;           // 'peaceful' skips
  readonly spectator: boolean;
  readonly worldTicks: number;           // statistics.time_played
  readonly dayTick: number;              // 0..23999
  readonly raidActive: boolean;
  readonly patrolAlive: boolean;
  readonly nearVillage: boolean;         // live village query non-null
  readonly playerX: number; readonly playerY: number; readonly playerZ: number;
  /** Feet Y for a valid outdoor surface at integer column (x, z), else null. */
  readonly surfaceY: (x: number, z: number) => number | null;
}

export interface PatrolMemberPlan {
  readonly x: number; readonly y: number; readonly z: number; // block-centred
  readonly yaw: number; readonly captain: boolean;
}

export type PatrolAttemptDecision =
  | { kind: 'SPAWN'; anchorX: number; anchorY: number; anchorZ: number;
      members: readonly PatrolMemberPlan[] }
  | { kind: 'SKIP'; reason: PatrolSkipReason };

export interface PatrolRng { nextInt(n: number): number; nextBoolean(): boolean; nextFloat(): number; }

export function decidePatrolAttempt(ctx: PatrolAttemptContext, rng: PatrolRng,
  opts?: { force?: boolean }): PatrolAttemptDecision;
export function nextPatrolCooldown(rng: PatrolRng): number;

export class PillagerPatrolSystem {
  constructor(opts: { manager: EntityManager; registry: EntityRegistry;
    dimension: ResourceId; rng: PatrolRng; backend?: RaidEntityBackend });
  tick(input: PatrolTickInput): void;          // cooldown → attempt → prune/despawn → combat
  runAttempt(ctx: PatrolAttemptContext): PatrolAttemptDecision; // natural attempt now
  forceSpawn(ctx: PatrolAttemptContext): PatrolAttemptDecision; // debug: bypass gates
  damageMember(id: number, amount: number, onCaptainKilled: () => void): boolean;
  consumeDeath(id: number): { member: boolean; captain: boolean }; // exactly once
  tickCombat(input: Omit<PatrolTickInput, 'context'>): void;     // combat only (debug)
  clear(reason: 'dispose' | 'pagehide' | 'raid-start' | 'replace' | 'despawn'): void;
  isAlive(): boolean;
  snapshot(): PatrolSnapshot;
}
```

## Control/data flow

```
fixedTick (unpaused only)
  … tickRaidFeedback(); evaluateBadOmenVillageTrigger();
  tickPillagerPatrol():
    patrol.tick({
      context: () => buildPatrolContext(),      // lazy: only when attempt is due
      simTick, world, resolver, player target, hurtPlayer,
      playerMeleeRequested: melee && raid not ACTIVE,
      onCaptainKilled: () => onPatrolCaptainKilled(),
    })
onPatrolCaptainKilled(): grantBadOmen(1); toast "Bad Omen <level>"
startRaidAt(...): patrol.clear('raid-start'); … existing 282/284 start
dispose / pagehide: patrol.clear(...)
```

`PillagerPatrolSystem.tick` order:

1. Prune roster members whose entity is no longer ACTIVE (no omen).
2. Despawn members whose horizontal distance to the player exceeds 128 (no
   omen, including the captain).
3. `cooldown -= 1`; when `cooldown <= 0`: `runAttempt(context())`, which
   evaluates the planner, applies a SPAWN, and redraws the cooldown.
4. If the roster is non-empty (or projectiles are in flight), run
   `RaiderCombatSystem.tick` with `trackedIds = roster ids`, `center = anchor`;
   `onRaiderDied(id)` → `consumeDeath(id)` → captain ⇒ `onCaptainKilled()`.

## Detailed behavior

### Gate precedence (natural attempt; first failing gate wins, no draws)

1. `INVALID_PLAYER` — any non-finite player coordinate.
2. `DISABLED` — `doMobSpawning === false`.
3. `PEACEFUL` — difficulty `'peaceful'`.
4. `SPECTATOR` — player in spectator mode.
5. `RAID_ACTIVE` — a raid is ACTIVE.
6. `PATROL_ALIVE` — a patrol roster is non-empty.
7. `WORLD_TOO_YOUNG` — `worldTicks < 60000` (non-finite ⇒ too young).
8. `NIGHT` — `isNight(dayTick)`.
9. `NEAR_VILLAGE` — live village query returned a village.

Then the draws, in this exact order:

10. Chance: `rng.nextInt(5) !== 0` ⇒ `CHANCE`.
11. Anchor, up to 4 tries: `sx = nextBoolean() ? 1 : -1`, `dx = 24 + nextInt(24)`,
    `sz = nextBoolean() ? 1 : -1`, `dz = 24 + nextInt(24)`;
    column `(floor(px) + sx*dx, floor(pz) + sz*dz)`; `surfaceY` null ⇒ next try.
    All tries fail ⇒ `NO_SURFACE`.
12. Size: `2 + nextInt(3)`.
13. Captain at the anchor column, `yaw = nextFloat() * 2π`.
14. For each remaining member: `ox = nextInt(9) - 4`, `oz = nextInt(9) - 4`,
    `yaw = nextFloat() * 2π`; `surfaceY(ax+ox, az+oz)` null ⇒ member omitted
    (a patrol always keeps its captain; size may shrink to ≥ 1).

Member positions are block-centred (`x + 0.5`, `z + 0.5`), `y = surfaceY`.
`force` mode (debug seam only) skips gates 5–10 (and replaces any live
patrol) but uses the identical draw order from step 11.

### Surface predicate (Game `surfaceY`)

Returns `h + 1` iff: the column is present in canonical storage
(`getCanonicalMotionBlockingHeight` non-null, i.e. loaded), `h ≥ minY`, the
ground block at `h` is not air/water/lava, and cells `h+1`, `h+2` are neither
solid nor water/lava. Because `h` is the column's top motion-blocking block,
the spawn cell is sky-exposed ("outdoors/at surface") by construction.

### Cooldown

`nextPatrolCooldown(rng) = 6000 + rng.nextInt(600)`. Drawn once at system
construction (session start) and once after every natural attempt regardless
of outcome. `forceSpawn` does not touch the cooldown.

### Spawning and rollback

SPAWN applies members through `RaidEntityBackend.spawn` with
`typeKey 'pillager'`, `waveIndex 0`, `raidGeneration = patrol generation`.
If any spawn throws, every already-spawned member is despawned, the roster is
left empty and the attempt reports `{ ok: false }`; no omen, no raid effect.
Generation increments per successful patrol.

### Captain death and Bad Omen

`consumeDeath(id)` removes a roster member exactly once and reports whether it
was the captain. Only a combat death (`RaiderCombatSystem.damageRaider`
reaching 0 via player melee or the debug damage seam) reaches
`consumeDeath`. Captain ⇒ `onCaptainKilled()` ⇒ `Game.grantBadOmen(1)`
(cap 5, identity at 5) and toast `Bad Omen <level>`. Remaining members keep
fighting; the patrol is alive until its roster is empty.

### Raid interplay

- Natural attempts skip while a raid is ACTIVE (`RAID_ACTIVE`).
- `startRaidAt` (debug or 285 trigger) calls `patrol.clear('raid-start')`
  first, so no patrol captain can exist during an ACTIVE raid — this prevents a
  captain kill from re-triggering the 285 raid-replacement path mid-raid.
- Patrol combat gets `playerMeleeRequested` only when no raid is ACTIVE.

### Persistence decision

Patrols are transient like raid waves (284): pagehide and dispose clear them
and nothing is written. The cooldown restarts from the seeded stream on load
(first natural attempt ≥ 6000 ticks after load). Bad Omen remains ephemeral
(285): **a reload drops Bad Omen to 0**. Persisting effects/omen is a 292
candidate, not this change.

## Failure modes

| Case | Behavior |
|---|---|
| Any gate fails | `SKIP` with reason, no draws, cooldown redrawn |
| No loaded surface after 4 tries | `SKIP NO_SURFACE` |
| Member surface invalid | member omitted; captain kept |
| Backend spawn throws mid-patrol | full rollback, roster empty, no omen |
| Double death / unknown id | `consumeDeath` false; no omen |
| Captain despawned by distance/clear | no omen |
| Omen already 5 | `grantBadOmen` identity (stays 5) |
| Village probe throws | treated as no village by existing 287 fail-closed query |
| Non-finite player position | `SKIP INVALID_PLAYER` |
| Disposed Game | tick never entered; seams return empty/false |

## Compatibility/migration

Additive only. No schema, archive or namespace change. Old saves load.

## Performance/resource constraints

- Per tick: O(1) cooldown decrement + O(roster ≤ 4) prune/despawn + combat over
  ≤ 4 entities (projectile cap 32 inherited).
- An attempt (≤ once per 6000 ticks) does ≤ 4 anchor + 3 member surface
  lookups and at most one cached village query.
- No GPU/mesh/worker work.

## Testing seams

- Pure: `decidePatrolAttempt` with a fake/real `SeedRng` and a stub
  `surfaceY`; `nextPatrolCooldown`.
- System: `PillagerPatrolSystem` over a real `EntityManager` +
  `createEntityManagerRaidBackend` or `createRecordingRaidBackend`
  (failure injection).
- Game seams: `getPatrolState()`, `debugRunPatrolAttempt()`,
  `debugSpawnPatrol()`, `debugDamagePatrolEntity(id, amount)`,
  `debugTickPatrols(n)` (combat only, n ≤ 2000; advances a patrol-only combat
  clock bias, never the global `simTick` that seeds random ticks), and
  `debugGetPatrolEntityPosition(id)`.
- Structural guards: a unit test extracts `Game.onRaidEntityRemoved` /
  `onPatrolCaptainKilled` / `startRaidAt` bodies and asserts the isolation
  wiring (no omen in the raid death choke, no raid state in the captain
  handler, raid start dismisses patrols).

## Observability/debugging

- `PatrolSnapshot { generation, memberIds, captainId, anchor, cooldownTicks,
  attempts, lastDecision, lastApplyOk }` via `getPatrolState()`.
- Toast on captain kill (`Bad Omen <level>`).
- `getBadOmenLevel()` (285) and `getRaidState()` (282) for isolation checks.

## Affected files/symbols

- `src/simulation/PillagerPatrol.ts` (new)
- `src/engine/Game.ts` (construction, fixed tick, raid start, dispose,
  pagehide, seams)
- `tests/unit/PillagerPatrol.test.ts`, `tests/unit/LivePillagerPatrol.test.ts`
- `tests/e2e/pillager-patrol.spec.ts`
- OpenSpec control plane, `PARITY_MATRIX.md` C291, file-audit manifest

## Rejected alternatives

- Spawning patrols into `raidEntityManager` / `RaidWaveController` — mixes
  roster ownership and risks raid death accounting; a dedicated manager keeps
  isolation structural.
- Using session `simTick` as "world time" — resets on every reload; the
  persisted `time_played` statistic is the only durable world-age measure.
- Absolute world clock age — `Lighting.worldSeconds` wraps each day and is not
  persisted.
- Local-difficulty-scaled group sizes — no local-difficulty model exists;
  fixed 2–4 is documented instead.
- Ominous bottle (1.21) omen delivery — requires new items; out of scope.

## Downstream dependencies

- Persisting Bad Omen / effects (292 candidate) makes captain omen survive
  reload without changing this capability's contract.
- A future raider renderer can consume both raid and patrol managers.
