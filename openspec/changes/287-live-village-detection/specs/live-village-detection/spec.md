# Spec: live-village-detection

## Contract

This change defines **live spatial village/settlement detection** that backs
the Change 285 `VillageQuery` / `VillageContext` seam in production so a Bad
Omen player near qualifying beds starts a raid without test fixtures. It does
not claim villager AI, village worldgen, outposts, Hero of the Village,
raider combat redesign, new persistence, or Change 258 headed GPU/FPS work.

## Definitions

- **Qualifying bed:** a world cell whose `getBlock` equals the live bed block
  id (`BlockId.Bed`).
- **Resident column:** a chunk column for which `hasColumn(chunkX, chunkZ)` is
  true.
- **Scan volume:** Chebyshev horizontal radius `VILLAGE_SCAN_RADIUS` (12) and
  vertical window ±`VILLAGE_SCAN_Y` (5) about the player's floored block
  position.
- **Village context:** `VillageContext` from `BadOmenRules` (center +
  `containsPlayer`).
- **Live default query:** the Game village query used when no explicit
  override is installed.

## Invariants

1. Detection NEVER throws; invalid inputs yield `null`.
2. Only resident columns contribute beds; unloaded columns are skipped.
3. Only bed blocks qualify; smokers/workstations/POI records do not.
4. Scan order and center math are deterministic for a fixed probe snapshot.
5. Cell budget NEVER exceeds `VILLAGE_MAX_CELLS` (8192) getBlock calls per
   sample.
6. No persistence / archive / registry mutation by this change.
7. Change 258 remains BLOCKED; no GPU/FPS evidence is claimed.

## Requirements

### Requirement: Pure detectVillage MUST implement the bed-scan definition

`detectVillage(playerX, playerY, playerZ, probe, bedBlockId)` MUST return
`VillageContext` when at least `VILLAGE_MIN_BEDS` (1) qualifying beds exist in
the scan volume on resident columns, MUST return `null` otherwise, MUST set
center to the arithmetic mean of those bed coordinates, and MUST set
`containsPlayer` from the bound check against `VILLAGE_BOUND_RADIUS` /
`VILLAGE_SCAN_Y`.

#### Scenario: One bed in range yields a village containing the player

- **GIVEN** a probe with a single bed at the player's floored position and a
  resident column there
- **WHEN** `detectVillage` runs
- **THEN** the result is non-null
- **AND** `centerX/Y/Z` equal that bed position
- **AND** `containsPlayer` is true

#### Scenario: No beds yields null

- **GIVEN** a probe whose loaded cells are all non-bed
- **WHEN** `detectVillage` runs
- **THEN** the result is `null`
- **AND** no exception is thrown

#### Scenario: Bed outside the scan radius is ignored

- **GIVEN** a bed beyond `VILLAGE_SCAN_RADIUS` horizontally from the player
- **WHEN** `detectVillage` runs
- **THEN** the result is `null`

#### Scenario: Unloaded column never contributes a bed

- **GIVEN** `hasColumn` false for a cell that would otherwise be in range
- **WHEN** `detectVillage` runs
- **THEN** that cell is not read as a bed (skipped)
- **AND** if no other beds exist the result is `null`

#### Scenario: Non-finite player coordinates yield null

- **GIVEN** any of player X/Y/Z is NaN or ±Infinity
- **WHEN** `detectVillage` runs
- **THEN** the result is `null`
- **AND** no exception is thrown

#### Scenario: Deterministic center for multiple beds

- **GIVEN** two beds at distinct in-range positions on resident columns
- **WHEN** `detectVillage` is invoked twice with the same probe snapshot
- **THEN** both results are deep-equal
- **AND** center equals the arithmetic mean of both bed coordinates

### Requirement: Cell budget MUST bound getBlock calls

A single `detectVillage` invocation MUST call `getBlock` at most
`VILLAGE_MAX_CELLS` times, MUST only call `getBlock` for resident columns, and
MUST still return a valid context if ≥1 bed was found before the cap.

#### Scenario: Cap stops further reads

- **GIVEN** a probe that would expose more than `VILLAGE_MAX_CELLS` resident
  in-volume cells
- **WHEN** `detectVillage` runs
- **THEN** `getBlock` is invoked ≤ `VILLAGE_MAX_CELLS` times
- **AND** no exception is thrown

### Requirement: Game live default MUST use the detector with bounded resampling

Game MUST use the live detector as the production default `VillageQuery`.
`setVillageQuery(null)` MUST restore that live default. An explicit override
MUST bypass the detector. Live samples MUST be rate-limited by
`shouldResampleVillage` (`VILLAGE_RESAMPLE_TICKS` or
`VILLAGE_MOVE_RESAMPLE`) and MUST NOT run while paused, loading, or disposed.
Probe failures MUST fail closed to `null`.

#### Scenario: Placed bed + omen starts a raid without fixtures

- **GIVEN** a live Game with ≥1 bed in scan range of the player and no query
  override
- **WHEN** Bad Omen level ≥ 1 and the village trigger is evaluated on an
  unpaused fixed tick
- **THEN** `resolveVillageRaidTrigger` receives a non-null context with
  `containsPlayer` true
- **AND** a raid is started and omen cleared per 285 rules

#### Scenario: No beds means no raid

- **GIVEN** a live Game with no beds in range (or an explicit
  `setVillageQuery(() => null)`)
- **WHEN** Bad Omen is granted and the trigger is evaluated
- **THEN** the decision is `NONE` with reason `NO_VILLAGE` (or retained omen
  with no start)
- **AND** no raid is created by this path

#### Scenario: Override bypasses live beds

- **GIVEN** beds in range and `setVillageQuery(() => null)`
- **WHEN** the trigger is evaluated with omen ≥ 1
- **THEN** no raid starts from the live beds
- **AND** omen is retained

#### Scenario: Pause and dispose skip sampling

- **GIVEN** a paused or disposed Game
- **WHEN** fixed ticks would otherwise evaluate omen
- **THEN** no village scan runs (285 pause/dispose gates preserved)
- **AND** dispose clears the detection cache without throwing

#### Scenario: Reload does not resurrect omen via detection

- **GIVEN** a raid was started and omen cleared, then the page reloads
- **WHEN** the new Game boots
- **THEN** Bad Omen level is 0 (285 ephemeral)
- **AND** no new persistence namespace was written by 287

### Requirement: Resample helper MUST be total and threshold-exact

`shouldResampleVillage` MUST return true when never sampled, when tick delta
≥ `VILLAGE_RESAMPLE_TICKS`, or when Chebyshev block distance from the last
sample origin ≥ `VILLAGE_MOVE_RESAMPLE`; otherwise false. Non-finite inputs
MUST force true (fail open to resample) or be documented; chosen: non-finite
→ true.

#### Scenario: Fresh cache within thresholds skips resample

- **GIVEN** last sample 5 ticks ago and player moved 1 block
- **WHEN** `shouldResampleVillage` runs
- **THEN** it returns false

#### Scenario: Tick threshold forces resample

- **GIVEN** last sample ≥ 20 ticks ago and player unmoved
- **WHEN** `shouldResampleVillage` runs
- **THEN** it returns true

### Requirement: Scope exclusions MUST hold

The change MUST NOT add villager spawning, village worldgen, pillager
outposts/patrols, Hero of the Village rewards, raider AI/combat redesign, a
new persistence/archive namespace, PointOfInterest live wiring, or any Change
258 headed FPS/GPU work. Change 258 MUST remain BLOCKED.

#### Scenario: No new persistence key

- **GIVEN** a play session that detects villages and starts a raid
- **WHEN** persistence keys are inspected
- **THEN** no new village-detection namespace is present
- **AND** existing `__raid__` behavior from 283 is unchanged in contract

## Error and failure behavior

- Detector and resample helpers never throw.
- Game wraps live probe invocation in fail-closed `null` on unexpected throw.
- Unloaded / missing world → `null` village.

## Performance and resource bounds

- Volume `(2*12+1)^2 * (2*5+1) = 6875` ≤ `VILLAGE_MAX_CELLS` 8192.
- At most one live sample per `VILLAGE_RESAMPLE_TICKS` unless move threshold
  hit.
- No workers, GPU, or unbounded entity iteration.

## Compatibility and migration

No stored schema change. Behavioral change: production default query is live
detection instead of constant `null`. Tests needing absence MUST call
`setVillageQuery(() => null)`.

## Security and integrity

No credentials, network, or cross-world leakage. Detection reads only the
active world's resident columns.

## Observability

Optional test/debug seam may expose the current live context; no new HUD
widgets are required.

## Verification mapping

| Requirement | Primary evidence |
|---|---|
| Pure detectVillage definition | `VillageDetectionRules.test.ts` |
| Cell budget | unit cap counter |
| Game live default + cache | `LiveVillageDetection.test.ts` + e2e |
| Resample helper | unit matrix |
| Scope exclusions | design/tasks + file-audit + 258 BLOCKED |
