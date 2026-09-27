# Spec: pillager-patrol-bad-omen

## Contract

The Game MUST spawn deterministic, rate-limited pillager patrols near the
player under the rules below, MUST reuse the existing raider entity backend
(284) and pillager combat (288) for patrol members, and MUST grant Bad Omen
(+1, cap 5) through the existing `grantBadOmen` seam (285) when — and only
when — a patrol captain is killed. Patrols MUST be isolated from raid state in
both directions. This capability does not own raid progression, village
detection, Bad Omen persistence, outposts, banners, villagers, or rendering.

## Definitions

- **Patrol**: a roster of 1–4 live `pillager` entities in the dedicated patrol
  `EntityManager`, spawned by one successful attempt.
- **Captain**: the single roster member flagged `captain: true` at spawn.
- **Attempt**: one evaluation of `decidePatrolAttempt` (natural or forced).
- **Natural attempt**: an attempt triggered by the cooldown reaching 0.
- **World ticks**: the persisted `statistics.time_played` fixed-tick count.
- **Day tick**: `currentDayTick()` in 0..23999; night per `isNight` (12542–23459).
- **Outdoor surface**: a loaded column whose top motion-blocking block is solid
  ground (not air/water/lava) with two non-solid, non-fluid cells above.

## Invariants

- I1. At most one patrol is live; every spawned patrol has exactly one captain.
- I2. Consecutive natural attempts are ≥ 6000 fixed ticks apart.
- I3. Same seed + same context sequence ⇒ identical decision sequence.
- I4. Gate skips consume no planner RNG draws.
- I5. Only captain death calls the omen callback, at most once per patrol.
- I6. Patrol code never reads/writes `RaidState`; raid-wave deaths never grant
  Bad Omen.
- I7. No new persistence namespace; patrols/cooldown/Bad Omen are transient.
- I8. Change 258 remains BLOCKED; no headed GPU/FPS work or GPU evidence.

## Requirements

### Requirement: Gate precedence

A natural attempt MUST return `SKIP` with the first failing reason in this
order: `INVALID_PLAYER` (non-finite player coordinate), `DISABLED`
(`doMobSpawning` false), `PEACEFUL`, `SPECTATOR`, `RAID_ACTIVE`,
`PATROL_ALIVE`, `WORLD_TOO_YOUNG` (world ticks < 60000 or non-finite),
`NIGHT` (`isNight(dayTick)`), `NEAR_VILLAGE`. A gate skip MUST NOT consume any
RNG draw.

#### Scenario: Fresh world is too young

- **GIVEN** world ticks 100, daytime, no raid/patrol/village, survival, normal
- **WHEN** a natural attempt runs
- **THEN** the decision is `SKIP WORLD_TOO_YOUNG`
- **AND** the RNG's next value equals the value an untouched stream of the
  same seed would produce

#### Scenario: Precedence between multiple failing gates

- **GIVEN** `doMobSpawning` false AND difficulty peaceful AND night
- **WHEN** a natural attempt runs
- **THEN** the reason is `DISABLED`

#### Scenario: Each gate individually

- **GIVEN** an otherwise-eligible context with exactly one gate failing
- **WHEN** a natural attempt runs
- **THEN** the reason names that gate (one case per reason listed above)

### Requirement: Chance and position rules

After all gates pass the planner MUST draw, in order: chance
`nextInt(5)` (non-zero ⇒ `SKIP CHANCE`); up to 4 anchor tries each drawing
`nextBoolean`, `nextInt(24)`, `nextBoolean`, `nextInt(24)` giving
`|dx|, |dz| ∈ [24, 47]` from the floored player column; the first try whose
`surfaceY` is non-null becomes the anchor; none ⇒ `SKIP NO_SURFACE`.

#### Scenario: Anchor offsets are bounded

- **GIVEN** any seed and an always-valid surface
- **WHEN** a SPAWN decision is produced
- **THEN** `24 ≤ |anchorX − floor(px) − 0.5| ≤ 47` and the same for Z

#### Scenario: No loaded surface

- **GIVEN** a passing context whose `surfaceY` always returns null and a
  chance draw of 0
- **WHEN** the attempt runs
- **THEN** the decision is `SKIP NO_SURFACE` after exactly 4 surface probes

### Requirement: Group composition with exactly one captain

A SPAWN decision MUST contain the captain at the anchor plus up to
`nextInt(3) + 1` further members (size drawn as `2 + nextInt(3)` ∈ [2, 4]),
each offset by `nextInt(9) − 4` on X and Z and omitted if its surface is null.
Exactly one member MUST have `captain: true`, and it MUST be the first member.
All members MUST spawn as `typeKey 'pillager'`.

#### Scenario: Sizes and captain uniqueness over many seeds

- **GIVEN** 200 distinct seeds and an always-valid surface
- **WHEN** a forced SPAWN is produced for each
- **THEN** every member count is in [2, 4] and exactly one member is captain

#### Scenario: Invalid member surface shrinks the group

- **GIVEN** a surface valid only at the anchor column
- **WHEN** a SPAWN is produced
- **THEN** the patrol has exactly 1 member, the captain

### Requirement: Determinism

`decidePatrolAttempt` MUST be a pure function of its context and RNG state.
Two `PillagerPatrolSystem`s built from `createNamedRng(seed, 'pillager-patrol')`
and fed identical contexts MUST produce identical cooldowns, decisions and
member plans.

#### Scenario: Same seed, same plans

- **GIVEN** two systems with seed 1234 and identical contexts
- **WHEN** each runs 20 attempts
- **THEN** the decision sequences are deep-equal
- **AND** a different seed produces a different sequence

### Requirement: Rate limit

The cooldown MUST be drawn as `6000 + nextInt(600)` at construction and after
every natural attempt (any outcome). A natural attempt MUST run only when the
cooldown reaches 0 during `tick`. At most one patrol MUST be live
(`PATROL_ALIVE`). Forced spawns MUST NOT alter the cooldown.

#### Scenario: Bounded attempts over time

- **GIVEN** an eligible context
- **WHEN** the system ticks 30000 times
- **THEN** at most 5 natural attempts ran and every inter-attempt gap is in
  [6000, 6599]

### Requirement: Reuse of raider backend and combat

Patrol members MUST be spawned via `RaidEntityBackend.spawn` (production:
`createEntityManagerRaidBackend` over a dedicated patrol `EntityManager`) and
MUST be driven by a dedicated `RaiderCombatSystem` using the 288 pillager
profile, homing to the patrol anchor. A spawn failure MUST roll back every
already-spawned member (roster empty, no omen).

#### Scenario: Patrol pillagers damage the player

- **GIVEN** a spawned patrol and a player within ranged reach
- **WHEN** the system ticks with a player target for 80 ticks
- **THEN** the player damage callback fired at least once with reason `pillager`

#### Scenario: Partial spawn failure rolls back

- **GIVEN** a recording backend that fails after 1 spawn
- **WHEN** a 3-member SPAWN is applied
- **THEN** the roster is empty and the one spawned member was despawned

### Requirement: Captain kill grants Bad Omen

When a patrol captain dies through combat, Game MUST call `grantBadOmen(1)`
exactly once for that patrol and MUST show a toast naming Bad Omen. The level
MUST stay capped at 5. Non-captain deaths, distance despawns, clears and
raid-start dismissals MUST NOT grant.

#### Scenario: Captain kill from 0

- **GIVEN** omen 0 and a live patrol
- **WHEN** a non-captain member is killed **THEN** omen stays 0
- **WHEN** the captain is killed **THEN** omen becomes 1

#### Scenario: Cap at 5

- **GIVEN** omen 5 and a live patrol
- **WHEN** the captain is killed
- **THEN** omen stays 5

#### Scenario: Duplicate death is a no-op

- **GIVEN** a captain whose death was consumed
- **WHEN** the same entity id is reported dead again
- **THEN** no second omen grant occurs

#### Scenario: Despawned captain grants nothing

- **GIVEN** a live patrol
- **WHEN** the player is more than 128 blocks (horizontal) from every member
  and the system ticks
- **THEN** the roster is empty and the omen callback was never called

### Requirement: Raid isolation

Patrol deaths MUST NOT read or modify `RaidState` (the `getRaidState()`
reference and counters are unchanged). Raid-wave entity deaths MUST NOT grant
Bad Omen. Natural attempts MUST skip during an ACTIVE raid, and any raid start
MUST dismiss a live patrol without granting omen. Patrol combat MUST receive
the player melee request only when no raid is ACTIVE.

#### Scenario: Patrol captain kill leaves raid untouched

- **GIVEN** a terminal (VICTORY) raid state object R and a live patrol
- **WHEN** the captain is killed
- **THEN** `getRaidState()` is still R (same counters) and omen increased by 1

#### Scenario: Raid kills never grant omen

- **GIVEN** omen 0 and an ACTIVE raid with wave entities
- **WHEN** every wave entity is killed through the raid path
- **THEN** omen is still 0

#### Scenario: Raid start dismisses patrol

- **GIVEN** a live patrol
- **WHEN** a raid starts
- **THEN** the patrol roster is empty and omen unchanged

### Requirement: Lifecycle safety

The patrol tick MUST run only inside the unpaused fixed tick. Dispose and
pagehide MUST clear the patrol (entities removed, no omen). Nothing about
patrols MUST be persisted; after reload no patrol exists and Bad Omen is 0
(ephemeral per 285).

#### Scenario: Reload clears patrol and omen

- **GIVEN** a live patrol and omen 1 from a captain kill
- **WHEN** the page reloads
- **THEN** `getPatrolState().memberIds` is empty and `getBadOmenLevel()` is 0

## Error and failure behavior

- The planner and system never throw for invalid contexts; spawn failures roll
  back; village probe errors are handled by the 287 fail-closed query.
- Debug seams on a disposed Game return empty snapshots / false.

## Performance and resource bounds

- ≤ 4 patrol entities, one patrol, projectile cap 32.
- Attempt cost ≤ 7 surface lookups + one cached village query, at most once per
  6000 ticks. Per-tick cost O(roster).

## Compatibility and migration

No stored-data change; existing saves load unchanged.

## Security and integrity

Omen grants go only through `grantBadOmen` (clamped). Raid death accounting
stays on `onRaidEntityRemoved` exclusively.

## Observability

`getPatrolState()` snapshot, `lastDecision` reason, captain-kill toast,
`getBadOmenLevel()`.

## Verification mapping

| Requirement | Primary evidence |
|---|---|
| Gate precedence | unit `PillagerPatrol.test.ts`; e2e WORLD_TOO_YOUNG |
| Chance/position | unit |
| Group/captain | unit; e2e forced spawn |
| Determinism | unit |
| Rate limit | unit |
| Backend/combat reuse | unit (real EntityManager + recording backend); e2e hp drop |
| Captain omen | unit `LivePillagerPatrol.test.ts`; e2e |
| Raid isolation | unit Live; e2e |
| Lifecycle | e2e reload; design |
| Full gates | typecheck/lint/unit/build/e2e/file-audit/validate-state |
