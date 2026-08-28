# Design: 153-boss-framework

## Context/current state
- No boss/phase concept exists anywhere. 152's `RaidStateMachine` is the closest structural
  precedent (immutable transitions + a strict `version: 1` codec + a documented terminal-state
  no-op rule), and this change deliberately reuses that exact shape so the two read alike.
- 053's `GameEventBus` exists and would be a natural place to publish "phase changed"/"boss
  defeated" events, but wiring it here would give this module an import and a lifecycle dependency
  for no testing benefit. Instead `damageBoss` *reports* `phaseChanged`/`defeated` booleans and the
  caller decides what to publish — the same "return the outcome, let the caller act" convention
  148's `MobDropLootSystem.damageEntity` uses with its injected spawn sinks.
- 003's `Registry` is used for the boss-definition catalog (as 150's `VillagerProfessionRegistry`
  does), so definitions get validation + finalization + deterministic ordering for free.

## Target state
- `src/simulation/BossFramework.ts`: a validated `BossRegistry` of `BossDefinition`s, an immutable
  `BossState` with pure transitions, a `bossBarSnapshot` HUD projection, and a strict codec.

## Invariants
- Every transition returns a new state and never mutates its input.
- `health` is always within `[0, definition.maxHealth]`.
- `status` progresses `SPAWNING → ACTIVE → DEFEATED` only; a `DEFEATED` boss is never changed again
  by `damageBoss`, `healBoss`, or `tickBossFight` (each returns the input state unchanged).
- `phaseIndex` is always a valid index into `definition.phases` and always equals
  `phaseForHealthFraction(definition, health / maxHealth)` for the current health.
- A registered `BossDefinition` always has: `maxHealth > 0`; at least one phase; every
  `healthThreshold` in `[0, 1]`; thresholds strictly descending; and `phases[0].healthThreshold === 1`
  (so full health always resolves to phase 0).
- `bossBarSnapshot(...).progress` is always in `[0, 1]`.
- `serializeBoss`/`deserializeBoss` round-trip losslessly; `deserializeBoss` either returns a fully
  valid state or throws.

## API and data model
```ts
// src/simulation/BossFramework.ts

export interface BossPhase {
  readonly name: string;
  /** Health fraction at or below which this phase is active. Descending; the first is always 1. */
  readonly healthThreshold: number;
}

export interface BossDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  readonly maxHealth: number;
  readonly phases: readonly BossPhase[];
  readonly barColor: string;
}

export type BossStatus = 'SPAWNING' | 'ACTIVE' | 'DEFEATED';

export interface BossState {
  readonly bossKey: string;
  readonly status: BossStatus;
  readonly health: number;
  readonly phaseIndex: number;
  readonly ticks: number;
}

export interface BossBarSnapshot {
  readonly name: string;
  readonly color: string;
  readonly progress: number;   // [0, 1]
  readonly phaseName: string;
}

export const BOSS_SPAWN_TICKS = 100;
export const BOSS_RECORD_VERSION = 1;

export class BossRegistry {
  constructor(definitions: BossDefinition[]);   // validates then finalizes
  get finalized(): boolean;
  get size(): number;
  get(id: ResourceId): BossDefinition;
  getOptional(id: ResourceId): BossDefinition | undefined;
  has(id: ResourceId): boolean;
  getByKey(key: string): BossDefinition | undefined;
  entries(): readonly BossDefinition[];
}

export function createDefaultBossRegistry(): BossRegistry;

export function startBossFight(definition: BossDefinition): BossState;
export function phaseForHealthFraction(definition: BossDefinition, fraction: number): number;

export interface BossDamageResult {
  readonly state: BossState;
  readonly phaseChanged: boolean;
  readonly defeated: boolean;
}
export function damageBoss(state: BossState, definition: BossDefinition, amount: number): BossDamageResult;
export function healBoss(state: BossState, definition: BossDefinition, amount: number): BossState;
export function tickBossFight(state: BossState): BossState;
export function bossBarSnapshot(state: BossState, definition: BossDefinition): BossBarSnapshot;

export interface SerializedBoss {
  readonly schemaVersion: 1;
  readonly bossKey: string;
  readonly status: BossStatus;
  readonly health: number;
  readonly phaseIndex: number;
  readonly ticks: number;
}
export function serializeBoss(state: BossState): SerializedBoss;
export function deserializeBoss(input: unknown): BossState;
```

## Control/data flow
1. **Summon** (a future 183/Wither change): `startBossFight(definition)` →
   `{ status: 'SPAWNING', health: maxHealth, phaseIndex: 0, ticks: 0 }`.
2. **Per-tick** (a future `Game` tick): `tickBossFight(state)` — advances `ticks`; once
   `ticks >= BOSS_SPAWN_TICKS` and the status is `SPAWNING`, promotes to `ACTIVE`; a `DEFEATED`
   boss is returned unchanged.
3. **Damage** (a future player→boss combat path — the same still-unscheduled gap 146/148 flagged):
   `damageBoss(state, definition, amount)` → new health, recomputed phase, `DEFEATED` at 0, plus
   `phaseChanged`/`defeated` flags for the caller to translate into 053 events / 205 HUD updates.
4. **Heal** (e.g. dragon-crystal regeneration): `healBoss(state, definition, amount)`.
5. **HUD** (205): `bossBarSnapshot(state, definition)`.
6. **Persistence** (a future store-wiring change): `serializeBoss`/`deserializeBoss`.

## Detailed behavior
- `phaseForHealthFraction` clamps `fraction` into `[0, 1]`, then scans `definition.phases` in order
  and returns the **last** index whose `healthThreshold >= fraction`. Because thresholds are
  validated strictly descending starting at `1`, this always resolves to exactly one phase: at full
  health (fraction `1`) only phase 0 qualifies; as health falls, later phases progressively qualify
  and the last qualifying one wins.
- `damageBoss` ignores a non-positive or non-finite `amount` (returns the input state with both
  flags `false`), matching 148's `MobHealthTracker.damage` no-op convention.
- `damageBoss` sets `status: 'DEFEATED'` exactly when the new health reaches `0`, and reports
  `defeated: true` only on the call that first does so — a second `damageBoss` on a defeated boss
  returns the input state with `defeated: false` (so a caller cannot double-fire a death event).
- `healBoss` caps at `maxHealth`, recomputes `phaseIndex` (so healing back above a threshold
  restores the earlier phase), ignores non-positive/non-finite amounts, and returns a `DEFEATED`
  boss unchanged — resurrection is explicitly not a thing this framework supports.
- `createDefaultBossRegistry()` seeds two definitions:
  - `ender_dragon`: `maxHealth 200`, phases `perching (1.0)` → `strafing (0.6)` → `enraged (0.25)`,
    bar color `#c060ff`.
  - `wither`: `maxHealth 300`, phases `ranged (1.0)` → `armored (0.5)`, bar color `#303030`.
  These are representative, not an exhaustive or exactly-vanilla catalog; 183 and the later Wither
  change may extend or replace them.
- `BossRegistry`'s constructor validates each definition before registering it (see Invariants) and
  throws on the first defect, so no invalid definition ever becomes reachable.

## Failure modes
- `BossRegistry`'s constructor throws for an invalid definition (non-positive `maxHealth`, empty
  phases, a threshold outside `[0, 1]`, non-descending thresholds, or a first threshold below `1`).
- `deserializeBoss` throws for a malformed/unsupported payload.
- No other function throws for well-formed inputs; every "cannot advance" case returns the input
  state unchanged.

## Compatibility/migration
- One new, additive file; no existing module edited; no schema/save-format change (codec only, no
  store wired); no migration.

## Performance/resource constraints
- Every function is O(phases) at worst (a 2-3 entry list); no unbounded loops.

## Testing seams
- Everything is tested standalone with plain definitions/states — no `World`, `EntityManager`,
  `Game`, or event-bus dependency.

## Observability/debugging
- `bossBarSnapshot` doubles as a human-readable state dump; `serializeBoss` as a machine-readable
  one.

## Affected files/symbols
- `src/simulation/BossFramework.ts` (new).
- Tests: `tests/unit/BossFramework.test.ts` (new).

## Rejected alternatives
- **Publishing 053 `GameEventBus` events directly from `damageBoss`**: rejected — it would couple a
  pure state machine to an event-bus instance and complicate testing, for no gain over returning
  explicit `phaseChanged`/`defeated` flags the caller can translate. Matches 148's injected-sink
  convention.
- **Registering boss entity types in 017 here**: rejected — 183's scope, and the End dimension a
  dragon needs (180/181) does not exist; a plain `bossKey` string keeps this framework honest about
  what it does not do (152's identical `typeKey`-as-string decision).
- **Storing `phaseIndex` implicitly (deriving it on every read instead of in state)**: rejected —
  keeping it in state lets `damageBoss` report `phaseChanged` cheaply and makes a serialized state
  self-describing; the invariant "`phaseIndex` always equals the derived value" is asserted in tests
  instead.
- **Ascending phase thresholds** (phase 0 at the *lowest* fraction): rejected — descending order
  reads naturally as "the fight progresses downward through health", and validating strict descent
  makes the lookup unambiguous.

## Downstream dependencies
- 183 (`ender-dragon-boss`) is the first real consumer: it supplies the dragon definition, drives
  `damageBoss` from its crystal/attack logic, and translates the returned flags into events.
- 205 (`hud-parity`) renders `bossBarSnapshot`.
- A future Wither change reuses the same framework with the `wither` definition.
- A future persistence-wiring change consumes `serializeBoss`/`deserializeBoss`.
