# Design: 287-live-village-detection

## Context/current state

- `BadOmenRules` (285) defines `VillageContext` `{ centerX,Y,Z, containsPlayer }`
  and `resolveVillageRaidTrigger`. Game holds `villageQuery: () => VillageContext | null`
  defaulting to `() => null`, so production play never triggers a raid from omen.
- Live placeable settlement markers: `BlockId.Bed` (63, Change 274) and
  `BlockId.Smoker` (64, Change 281 workstation). `PointOfInterestManager` (149)
  exists headless but is **not** wired into live Game or block place/break.
- Worldgen structures: ruined well only — **no village structure generation**.
- Raid track 282–286 is VERIFIED: feedback, `__raid__` persistence, wave
  spawning, Bad Omen acquisition, raid bar parity.
- Unloaded columns read as air via `getBlock`; honest detection MUST skip
  non-resident columns via `storage.hasColumn(cx, cz)`.

## Chosen village definition (and why)

**A village exists when ≥ `VILLAGE_MIN_BEDS` (1) bed block(s) are found inside a
Chebyshev horizontal radius `VILLAGE_SCAN_RADIUS` (12) and vertical window
±`VILLAGE_SCAN_Y` (5) of the player's floored block position, scanning only
cells whose column is resident (`hasColumn`).**

- **Center:** arithmetic mean of qualifying bed world coordinates (finite
  floats). Deterministic because beds are collected in fixed nested-loop order
  `(dx, dz, dy)` with `dx,dz ∈ [-R..R]`, `dy ∈ [-Y..Y]`.
- **`containsPlayer`:** true iff the player's floored position is within
  Chebyshev horizontal distance `VILLAGE_BOUND_RADIUS` (12) of the floored
  center and `|playerY - centerY| ≤ VILLAGE_SCAN_Y`.
- **Why beds-only (not beds+smoker, not POI, not worldgen):**
  1. Beds are the only live "home/settlement" marker with sleep/respawn meaning
     (274); smokers alone are cooking stations, not villages.
  2. Requiring a smoker would force dual placement without matching any
     existing live POI claim path.
  3. `PointOfInterest` is not live-wired; inventing a POI campaign exceeds
     scope.
  4. No village worldgen exists; stopping to add generation would violate
     "narrowest honest" and the mission's stop-and-report rule — detection is
     possible without it because players can place beds.
  5. Matches Bad Omen's need: "player near a settlement marker" without
     fake villagers.

Smokers are **not** counted in 287 (documented rejected alternative). Future
changes may tighten the definition once POI or villagers ship.

## Target state

Pure module `VillageDetectionRules` answers `detectVillage(player, probe) →
VillageContext | null` with the definition above. Game wires a production
default query that invokes the detector against `world.getBlock` +
`world.storage.hasColumn`, with a rate-limited / move-threshold cache.
`setVillageQuery(explicit)` still overrides; `setVillageQuery(null)` restores
the **live detector** (updated 285 default). Fixed-tick omen evaluate is
unchanged aside from receiving real contexts.

## Invariants

1. Detector is total: never throws; invalid player coords → `null`.
2. Only `BlockId.Bed` qualifies; unloaded columns never contribute (not treated
   as air-beds).
3. Scan order and center math are deterministic for a fixed world snapshot.
4. Hard cap `VILLAGE_MAX_CELLS` (8192) stops the scan early; result uses only
   beds found before the cap (still deterministic).
5. Game cache: re-scan at most every `VILLAGE_RESAMPLE_TICKS` (20) fixed ticks,
   or sooner when the player block position moves by
   `VILLAGE_MOVE_RESAMPLE` (4) Chebyshev blocks; paused/loading/disposed never
   scan.
6. No persistence key; reload constructs a fresh cache.
7. Override query, when set, bypasses the live detector entirely (285 fixture
   contract preserved).

## API and data model

```ts
// src/simulation/VillageDetectionRules.ts
export const VILLAGE_SCAN_RADIUS = 12;
export const VILLAGE_SCAN_Y = 5;
export const VILLAGE_BOUND_RADIUS = 12;
export const VILLAGE_MIN_BEDS = 1;
export const VILLAGE_MAX_CELLS = 8192;
export const VILLAGE_RESAMPLE_TICKS = 20;
export const VILLAGE_MOVE_RESAMPLE = 4;

export interface VillageBlockProbe {
  getBlock(x: number, y: number, z: number): number;
  hasColumn(chunkX: number, chunkZ: number): boolean;
}

export function detectVillage(
  playerX: number,
  playerY: number,
  playerZ: number,
  probe: VillageBlockProbe,
  bedBlockId: number,
): VillageContext | null;

export function shouldResampleVillage(
  lastSampleTick: number,
  currentTick: number,
  lastPx: number, lastPy: number, lastPz: number,
  px: number, py: number, pz: number,
): boolean;
```

Game:

```ts
// default: live detector (not constant null)
setVillageQuery(query: VillageQuery | null): void; // null → restore live
// internal: queryLiveVillage() uses cache + detectVillage
```

## Control/data flow

1. Fixed tick (unpaused): omen evaluate calls `villageQuery()`.
2. If override set → return override result.
3. Else if cache fresh (`!shouldResampleVillage`) → return cached context.
4. Else run `detectVillage(player.pos, probe, BlockId.Bed)`, store cache +
   sample tick/pos, return result.
5. `resolveVillageRaidTrigger` + start/clear unchanged from 285.

## Detailed behavior

- Floor player to integers with `Math.floor` for finite numbers; non-finite →
  `null`.
- Nested loops `dx`-major, then `dz`, then `dy`. For each cell, compute chunk
  via `sectionIndex`; if `!hasColumn`, skip (do not call getBlock / do not
  count toward bed finds; **does** count toward cell budget as a visited
  candidate OR we only charge loaded cells — pin: **only loaded cells charge
  the budget and call getBlock**, unloaded skips are free so far columns do
  not starve the budget). Chosen: unloaded skips are free; only
  `hasColumn===true` cells increment the counter and call `getBlock`.
- On bed id match, push `{x,y,z}`.
- After loops (or cap): if `beds.length < MIN` → `null`; else
  `center = mean`; `containsPlayer` from bound check.
- `shouldResampleVillage`: true when `currentTick - lastSampleTick >= 20` or
  Chebyshev block delta from last sample origin ≥ 4, or never sampled.

## Failure modes

- Missing world / disposed Game → query returns `null` (no throw).
- Probe throwing → Game MUST catch and treat as `null` (fail closed; omen
  retained).
- Cap hit with zero beds → `null`; with ≥1 bed → valid context from partial
  (documented).
- Override `() => null` → never starts from live beds (test seam).

## Compatibility/migration

No persistence. 285 unit tests that relied on default-null MUST inject
`setVillageQuery(() => null)`. Browser 285 fixture tests still set an
explicit fixture and remain valid. Dispose resets override to live default.

## Performance/resource constraints

- Worst-case loaded cells per sample ≤ `min(volume, VILLAGE_MAX_CELLS)` with
  volume `(2R+1)²(2Y+1) = 25×25×11 = 6875 < 8192`.
- Amortized ≈ one sample / 20 ticks unless the player moves ≥4 blocks.
- No workers, timers, GPU, textures, or entity iteration.

## Testing seams

- Pure unit: empty world, one bed in range, bed out of range, unloaded column
  ignored, determinism (same inputs → same center), cap behavior, invalid
  player coords, `shouldResampleVillage` matrix.
- Game unit: live default detects placed bed; override null suppresses; pause
  freezes samples; dispose safe.
- E2E: place bed near player → grant omen → evaluate/tick → raid ACTIVE +
  omen 0; break/remove beds or far-away player with override-null path → no
  raid; reload does not resurrect omen.

## Observability/debugging

No new HUD. Optional `debugDetectVillage()` test seam returning the current
live (uncached or cached) context for E2E asserts.

## Affected files/symbols

- `src/simulation/VillageDetectionRules.ts` (new)
- `src/engine/Game.ts` (default query, cache, dispose/reset)
- `tests/unit/VillageDetectionRules.test.ts`, `tests/unit/LiveVillageDetection.test.ts`
- `tests/e2e/village-detection.spec.ts`
- Possibly adjust `tests/unit/LiveBadOmen.test.ts` default-null assumptions
- OpenSpec package + SEQUENCE/OVERRIDES/PROGRAM_STATE/PARITY_MATRIX

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Beds + smoker required | Forces dual placement; smoker ≠ settlement; e2e heavier |
| Wire PointOfInterest live | Separate campaign; POI not on place/break today |
| Add village worldgen | Out of scope; detection possible without it |
| Euclidean sphere scan | Chebyshev matches chunk-aligned bounds and is cheaper |
| Scan every tick | Unnecessary cost; omen path is rare |
| Constant-null default kept | Defeats the mission (no raid in normal play) |

## Downstream dependencies

- 288+ may deepen settlement (POI, villagers, outposts) using this detector as
  the baseline presence signal.
- Raid bar village name (286) remains optional presentation input; 287 does
  not invent names (center only).
