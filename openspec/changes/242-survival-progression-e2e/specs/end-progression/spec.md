# Spec: end-progression

## Contract

Verifies progression stages 5-6 (End) and the final end-state through the
headless `ProgressionHarness` (spec: progression-harness): activating the End
portal with 12 eyes of ender, entering the End, defeating the Ender Dragon,
persisting the boss-completion record, spawning the exit portal, achieving
`free_the_end`, and granting its +500 XP reward. It composes the real
`EndPortalProgression` (182), `EnderDragon` (183), `BossFramework` (153),
`EndExitProgression` (184), `AdvancementFramework` (185), and
`CoreProgressionAdvancements` (186) modules.

## Definitions

- **Activated End portal**: `endPortalIsActivated(insertedEyeCount)` true, i.e.
  `insertedEyeCount >= END_PORTAL_FRAME_COUNT` (12).
- **End entry**: teleport to `endPortalDestination()` = `endSpawnPosition()`
  (0.5, 50, 0.5) standing on the 5×5 obsidian platform at
  `END_OBSIDIAN_PLATFORM_Y` (49), with player dimension `minecraft:the_end`.
- **Boss completion record**: `DragonCompletionRecord { dragonKey, defeated:
  true, defeatedTick }` produced by `markDragonDefeated` when the boss state is
  `DEFEATED`.
- **Exit portal**: `endExitPortalSpawns(gatewayOpen)` true, i.e. the dragon is
  defeated; the 21 exit-portal cells of `endExitPortalCells` are present.
- **Final end-state**: dragon `DEFEATED`, completion record persisted and
  reloadable, exit portal present, `free_the_end` achieved, and +500 XP granted.

## Invariants

- The End logic MUST be computed by the real `EndPortalProgression`,
  `EnderDragon`, `BossFramework`, `EndExitProgression`, and advancement modules,
  never a fixture.
- Entering the End sets the player dimension to `minecraft:the_end`.
- `enter_the_end` is achieved exactly when the player enters the End; `free_the_end`
  is achieved exactly when the dragon is defeated.
- The completion record MUST round-trip through `serializeDragonCompletion` /
  `deserializeDragonCompletion` (version 1) and survive save/reload.
- The final end-state completes only when all six assertions hold; no partial
  credit.

## Requirements

### Requirement: End portal activation and entry (Stage 5)
The player MUST be able to insert 12 eyes of ender to activate the End portal and
enter the End, landing on the obsidian platform in `minecraft:the_end`, achieving
`enter_the_end`.

#### Scenario: fewer than 12 eyes does not activate
- **GIVEN** an End portal frame with `k < 12` eyes inserted
- **WHEN** activation is evaluated
- **THEN** `endPortalIsActivated(k)` is `false`
- **AND** the harness aborts atomically with `not_enough_eyes_of_ender` if the
  script attempts to enter as if activated
- **AND** the player's dimension remains unchanged

#### Scenario: 12 eyes activate and enter the End
- **GIVEN** an End portal frame with exactly 12 eyes inserted
- **WHEN** activation is evaluated and the player steps into the portal
- **THEN** `endPortalIsActivated(12)` is `true`
- **AND** the player dimension is `minecraft:the_end`
- **AND** the player is at `endSpawnPosition()` = (0.5, 50, 0.5) standing on the
  obsidian platform (platform cells at y = 49 present)
- **AND** the advancement `enter_the_end` is achieved
- **AND** `isStageComplete('end')` is `true`

### Requirement: dragon defeat (Stage 6, part a)
The player MUST be able to defeat the Ender Dragon through `BossFramework`
damage, passing phases, until the boss state is `DEFEATED`.

#### Scenario: damage through phases to defeat
- **GIVEN** a fresh fight via `startBossFight(ENDER_DRAGON_DEFINITION)` at full
  health (200) in `SPAWNING`, promoted to `ACTIVE` after `BOSS_SPAWN_TICKS`
- **WHEN** the script applies `damageBoss` with the dragon's total max health and
  advances ticks
- **THEN** `BossState.status` becomes `DEFEATED` at health 0
- **AND** `dragonDefeated(state)` is `true`
- **AND** `endReturnGatewayAllowed(true)` is `true`

#### Scenario: a defeated boss cannot be re-damaged or revived
- **GIVEN** a `DEFEATED` boss state
- **WHEN** `damageBoss` or `healBoss` is applied
- **THEN** the state is returned unchanged (no-op, per `BossFramework`)
- **AND** no additional defeat signal is produced

### Requirement: boss completion persistence
On defeat, `markDragonDefeated(state, tick)` MUST produce a
`DragonCompletionRecord` with `defeated: true` and the defeat tick, and this
record MUST round-trip through its versioned serializer and survive reload.

#### Scenario: completion record is created and reloads
- **GIVEN** a `DEFEATED` boss state observed at tick `T`
- **WHEN** `markDragonDefeated(state, T)` is called and the result is
  `serializeDragonCompletion` then `deserializeDragonCompletion`
- **THEN** the record has `defeated: true` and `defeatedTick: T`
- **AND** `dragonCompletionIsDefeated(record)` is `true`
- **AND** after `snapshot()`/`restore()`, `endExitPortalRemains(record)` is `true`
  and `isStageComplete('boss-complete')` is `true`

### Requirement: exit portal and final end-state (Stage 6, part b)
Once the dragon is defeated, the exit portal MUST spawn and the final end-state
MUST hold: exit portal cells present, `endExitDestination(overworldSpawn)` returns
the overworld spawn, `free_the_end` achieved, and +500 XP granted.

#### Scenario: exit portal spawns after defeat
- **GIVEN** a defeated dragon (return gateway open)
- **WHEN** the exit portal is evaluated
- **THEN** `endExitPortalSpawns(true)` is `true`
- **AND** the 21 `endExitPortalCells` are present as `end_portal` blocks
- **AND** `endExitDestination(overworldSpawn)` returns the overworld spawn
  coordinates

#### Scenario: final end-state assertions hold
- **GIVEN** a completed dragon defeat with its completion record persisted
- **WHEN** the full chain is queried
- **THEN** `dragonDefeated(state)` is `true`
- **AND** the exit portal cells are present
- **AND** the advancement `free_the_end` is achieved
- **AND** experience has increased by exactly 500 over the pre-defeat value (the
  `free_the_end` reward)
- **AND** `isChainComplete()` is `true`

### Requirement: end-stage determinism
The End chain MUST be reproducible: identical seed and script produce an
identical final state hash.

#### Scenario: same-seed End run matches
- **GIVEN** a `worldSeed` `S` and the End script
- **WHEN** the script runs to completion twice from `S`
- **THEN** both runs report the same `isChainComplete()` value
- **AND** both `stateHash()` values are identical

## Error and failure behavior

- Fewer than 12 eyes → `not_enough_eyes_of_ender` (atomic abort).
- Living dragon → no completion record (`markDragonDefeated` returns `null`) and
  no exit portal; the harness MUST NOT report `boss-complete`.
- `stepUntil('boss-complete', maxSteps)` before defeat returns `false`; the stage
  is not credited.

## Performance and resource bounds

- The fight advances under the bounded `maxSteps` budget (order of hundreds of
  ticks including `BOSS_SPAWN_TICKS`).
- `stateHash()` is computed once per completed run.

## Compatibility and migration

Round-trips the existing versioned envelopes (`SerializedBoss` v1,
`SerializedDragonCompletion` v1, `SerializedAdvancementProgress` v1,
`ExperienceSnapshot` v1). No new format or migration.

## Security and integrity

No external input surface. `restore` payloads (including a serialized completion
record or boss envelope) are validated atomically by their module deserializers
and the harness contract.

## Observability

- `dragonDefeated`, `dragonCompletionIsDefeated`, exit-portal presence, and the
  `enter_the_end`/`free_the_end` `achievedTick` values are the completion signals.
- The `free_the_end` +500 reward is observable as a +500 delta in the XP/level
  track.

## Verification mapping

- `tests/unit/ProgressionHarness.end.test.ts` (or a dedicated file): under-12-eyes
  failure, 12-eye activation + entry, phase-to-defeat, defeated no-op,
  completion-record round-trip + reload, exit-portal spawn, final end-state
  assertions, same-seed determinism.
