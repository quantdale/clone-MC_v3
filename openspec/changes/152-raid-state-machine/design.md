# Design: 152-raid-state-machine

## Context/current state
- No multi-wave/multi-phase event state machine exists anywhere. The closest structural precedents
  are 123's `BrewingStandBlockEntity` (a pure, immutable, per-tick `tickBrewing(state, ctx, ticks)`
  state machine with a strict serialize/deserialize envelope) and 149's `SerializedPoi` codec
  (atomic validate-then-commit). 152 combines both shapes: an immutable per-tick raid state plus a
  `version: 1` codec.
- No raider mob types (`pillager`, `vindicator`, `ravager`, `evoker`, `witch`) are registered in
  017's `EntityRegistry`, and no village-boundary concept exists anywhere — both are hard blockers
  for a *live* raid, and both are explicitly out of this change's scope (see the proposal's
  Non-goals). This change therefore ships the lifecycle logic, exactly as 148-151 shipped their
  respective capabilities additively before their real consumers existed.

## Target state
- `src/simulation/RaidStateMachine.ts`: an immutable `RaidState` plus pure transition functions
  (`startRaid`/`spawnWave`/`recordRaiderDeath`/`tickRaid`), a deterministic `waveComposition`
  roster generator, and a strict `version: 1` serialize/deserialize codec.

## Invariants
- `RaidState` is treated as immutable throughout: every transition returns a new object and never
  mutates its input.
- `status` only ever moves `INACTIVE → ACTIVE → (VICTORY | DEFEAT)`; once terminal (`VICTORY`/
  `DEFEAT`), no transition function changes it again — `spawnWave`, `recordRaiderDeath`, and
  `tickRaid` all return their input state unchanged for a terminal raid.
- `waveIndex` is `0` before the first wave spawns and rises to at most `totalWaves`; it never
  exceeds `totalWaves`.
- `raidersRemaining` is always a non-negative integer; `recordRaiderDeath` floors it at `0`.
- `waveComposition(waveIndex, badOmenLevel)` is a pure function of exactly those two inputs — the
  same pair always yields an identical roster (no RNG, no wall-clock, no shared state).
- `totalWaves` is `RAID_BASE_WAVES + max(0, badOmenLevel - 1)`, clamped to `RAID_MAX_WAVES`.
- `serializeRaid`/`deserializeRaid` round-trip losslessly; `deserializeRaid` either produces a fully
  valid state or throws, never a partial one.

## API and data model
```ts
// src/simulation/RaidStateMachine.ts

export type RaidStatus = 'INACTIVE' | 'ACTIVE' | 'VICTORY' | 'DEFEAT';

/** One raider type and count within a wave's roster. */
export interface RaidWaveEntry {
  readonly typeKey: string;   // plain string: no raider entity type is registered yet (Non-goals)
  readonly count: number;
}

export interface RaidState {
  readonly status: RaidStatus;
  readonly centerX: number;
  readonly centerY: number;
  readonly centerZ: number;
  readonly waveIndex: number;      // 0 before the first wave; rises to totalWaves
  readonly totalWaves: number;
  readonly raidersRemaining: number;
  readonly badOmenLevel: number;
  readonly ticks: number;
}

export const RAID_BASE_WAVES = 3;
export const RAID_MAX_WAVES = 7;
export const RAID_TIMEOUT_TICKS = 12000;
export const RAID_RECORD_VERSION = 1;

export interface SerializedRaid {
  readonly schemaVersion: 1;
  readonly status: RaidStatus;
  readonly centerX: number; readonly centerY: number; readonly centerZ: number;
  readonly waveIndex: number;
  readonly totalWaves: number;
  readonly raidersRemaining: number;
  readonly badOmenLevel: number;
  readonly ticks: number;
}

export function startRaid(centerX: number, centerY: number, centerZ: number, badOmenLevel: number): RaidState;
export function waveComposition(waveIndex: number, badOmenLevel: number): RaidWaveEntry[];
export function spawnWave(state: RaidState): { state: RaidState; wave: RaidWaveEntry[] };
export function recordRaiderDeath(state: RaidState): RaidState;
export function tickRaid(state: RaidState): { state: RaidState; spawned: RaidWaveEntry[] | null };
export function serializeRaid(state: RaidState): SerializedRaid;
export function deserializeRaid(input: unknown): RaidState;
```

## Control/data flow
1. **Trigger** (a future settlement/bad-omen change): `startRaid(x, y, z, badOmenLevel)` →
   `{ status: 'ACTIVE', waveIndex: 0, totalWaves: derived, raidersRemaining: 0, ticks: 0 }`.
2. **Per-tick advance** (a future `Game`/simulation tick): `tickRaid(state)`:
   a. Terminal status → return the input state unchanged, `spawned: null`.
   b. `ticks + 1`; if that exceeds `RAID_TIMEOUT_TICKS` → `DEFEAT`, `spawned: null`.
   c. If `raidersRemaining > 0` → just the tick advance, `spawned: null` (the wave is still being
      fought).
   d. Else (the current wave is cleared, or none has spawned yet): if `waveIndex < totalWaves`,
      delegate to `spawnWave` and return its roster as `spawned`; otherwise → `VICTORY`,
      `spawned: null`.
3. **Raider death** (a future mob-death hook, likely 148's `MobDropLootSystem.damageEntity` caller):
   `recordRaiderDeath(state)` → `raidersRemaining - 1`, floored at `0`.
4. **Persistence** (a future store-wiring change): `serializeRaid(state)` / `deserializeRaid(raw)`.

## Detailed behavior
- `waveComposition(waveIndex, badOmenLevel)` builds an escalating roster from a fixed template:
  - `pillager`: `2 + waveIndex` (always present).
  - `vindicator`: `waveIndex` (absent on wave 1, i.e. `waveIndex === 0`; present from wave 2 on).
  - `ravager`: `1` only when `waveIndex >= 2` (from wave 3 on).
  - `witch`: `1` only when `badOmenLevel >= 3`.
  Entries whose computed count is `0` are omitted entirely, so a returned roster never contains a
  zero-count entry. A negative/non-finite `waveIndex` or `badOmenLevel` is clamped to `0` first, so
  the function is total.
- `spawnWave(state)` returns the input state unchanged with `wave: []` when the raid is terminal or
  `waveIndex >= totalWaves` (nothing left to spawn); otherwise it computes
  `waveComposition(state.waveIndex, state.badOmenLevel)`, sets `waveIndex + 1` and
  `raidersRemaining` to that roster's summed count.
  > Note the indexing convention: `waveComposition` is called with the *pre-increment* `waveIndex`,
  > so wave 1's roster is `waveComposition(0, …)`. `waveIndex` after the call is the number of waves
  > *spawned so far*, which is what the `waveIndex < totalWaves` guard and the `VICTORY` check both
  > read.
- `tickRaid`'s `DEFEAT` condition is a plain elapsed-time timeout (`ticks > RAID_TIMEOUT_TICKS`)
  rather than a "villagers all died" condition, because no villager population is tracked by this
  module (and none is spawned anywhere yet) — documented as the deliberate baseline loss condition;
  a future change with real villagers can add a second defeat trigger without changing this
  contract.
- `deserializeRaid` validates: `schemaVersion === RAID_RECORD_VERSION`; `status` is one of the four
  known values; `centerX`/`centerY`/`centerZ`/`ticks` are finite numbers; `waveIndex`/`totalWaves`/
  `raidersRemaining`/`badOmenLevel` are non-negative finite integers; and `waveIndex <= totalWaves`
  (the cross-field invariant). Any failure throws before any value is returned.

## Failure modes
- `deserializeRaid` throws for a malformed/unsupported payload; no partial state is produced.
- No other function throws for well-formed inputs: every "cannot advance" case returns the input
  state unchanged, matching the total/non-throwing convention of 141/147/149/150/151.

## Compatibility/migration
- One new, additive file; no existing module edited; no schema/save-format change (no store is
  wired); no migration.

## Performance/resource constraints
- Every function is O(1) (a fixed four-entry roster template); no unbounded loops.

## Testing seams
- The entire module is tested standalone with plain numbers/objects — zero imports from `World`,
  `EntityManager`, any registry, or `Game`, mirroring 141's `MeleeCombat` (pure math, no imports).

## Observability/debugging
- `RaidState` is a plain, fully-inspectable data object; `serializeRaid` doubles as a debug dump.

## Affected files/symbols
- `src/simulation/RaidStateMachine.ts` (new).
- Tests: `tests/unit/RaidStateMachine.test.ts` (new).

## Rejected alternatives
- **Registering raider entity types (`pillager`/`vindicator`/`ravager`) in 017 as part of this
  change**: rejected — the change's titled outcome is the *state machine*, and adding four entity
  types plus their AI/spawn wiring is a separate scope with its own testing surface; returning plain
  string type keys keeps this module honest about what it does and does not do.
- **Making `tickRaid` spawn *and* return the new state in one combined mutation of a mutable state
  object**: rejected — immutability matches 123's `tickBrewing` precedent exactly and makes every
  transition trivially testable without cloning fixtures.
- **A "villagers remaining" defeat condition**: rejected — this module tracks no villager
  population and none exists in the game; a timeout is the honest, testable baseline, extensible
  later.
- **Randomized wave composition**: rejected — determinism (a pure function of `waveIndex` +
  `badOmenLevel`) makes the whole machine reproducible and matches the codebase's strong
  deterministic-simulation bias (054's seeded-RNG discipline exists precisely so randomness is
  never implicit).

## Downstream dependencies
- A future raider-mob change must register the raider entity types and translate a
  `RaidWaveEntry[]` roster into real `EntityManager.spawn` calls.
- A future settlement/bad-omen change supplies the trigger and center position.
- 153 (`boss-framework`) is independent but structurally similar (a bounded lifecycle with
  phases/events); it may reuse this module's immutable-transition shape as a template.
- A future persistence-wiring change consumes `serializeRaid`/`deserializeRaid`.
