# Design: 285-live-bad-omen-acquisition

## Context/current state

- `RaidStateMachine` (152, VERIFIED) is a pure immutable machine: `startRaid`
  clamps omen non-negative and sets
  `totalWaves = min(7, 3 + max(0, omen - 1))`; it has no village detection and
  no Game consumer of its own.
- The status-effect registry declares `bad_omen` (`HARMFUL`,
  `DURATION_BASED`, `defaultDuration: 100`, `maxAmplifier: 0`) at
  `src/data/StatusEffect.ts:287`. Nothing grants or reads it for gameplay.
- Change 282 (ACTIVE on main at T3) adds `RaidFeedbackView` and, when complete,
  Game-owned ephemeral `raidState` with `debugStartRaid` / `getRaidState` /
  fixed-tick `tickRaid` and `#raid-feedback`.
- `Game` currently has no raid methods, no Bad Omen field, and no village or
  settlement boundary query anywhere in `src/`.
- Sequence: 282 is active; 283 is reserved (`live-raid-persistence`); 284 is
  reserved and not yet authored; 285 is this package.

## Target state

`Game` owns one ephemeral `BadOmenState` (integer level 0..5). Pure helpers
clamp, grant, clear, and decide whether the current (omen, village context)
pair should start a raid. Each unpaused fixed tick, Game resolves an injected
`VillageQuery` (default `() => null`), runs `resolveVillageRaidTrigger`, and on
`START_RAID` starts the 282 raid at the village center with the clamped omen
level, then clears the omen exactly once. No persistence, HUD, entity, or
registry change ships with 285.

## Invariants

- Level is always an integer in `[0, BAD_OMEN_MAX_LEVEL]` (5); non-finite or
  fractional inputs clamp; helpers never throw.
- `grantBadOmen` and `clearBadOmen` are total; clear on level 0 is an identity
  no-op; grant at the cap is an identity no-op.
- `resolveVillageRaidTrigger` returns `START_RAID` only when level ≥ 1,
  `containsPlayer` is true, and center X/Y/Z are all finite; otherwise `NONE`
  with a reason (`NO_OMEN`, `NO_VILLAGE`, `NOT_INSIDE`, `INVALID_CENTER`).
- Omen is consumed only after a successful raid start; a failed or deferred
  decision retains the level.
- At most one trigger evaluation per unpaused fixed tick; paused, loading, and
  disposed paths never evaluate.
- Reload/reset/dispose leave level 0; no omen or raid record is read or written
  by 285.
- `RaidStateMachine` remains the sole raid lifecycle authority; 285 never
  mutates `RaidState` fields directly.

## API and data model

Pure module `src/simulation/BadOmenRules.ts` (no imports beyond types):

```ts
export const BAD_OMEN_MAX_LEVEL = 5;

export interface BadOmenState {
  readonly level: number; // integer 0..BAD_OMEN_MAX_LEVEL
}

export interface VillageContext {
  readonly centerX: number;
  readonly centerY: number;
  readonly centerZ: number;
  readonly containsPlayer: boolean;
}

export type OmenTriggerDecision =
  | {
      readonly kind: 'START_RAID';
      readonly centerX: number;
      readonly centerY: number;
      readonly centerZ: number;
      readonly badOmenLevel: number;
    }
  | { readonly kind: 'NONE'; readonly reason: OmenTriggerSkipReason };

export type OmenTriggerSkipReason =
  | 'NO_OMEN'
  | 'NO_VILLAGE'
  | 'NOT_INSIDE'
  | 'INVALID_CENTER';

export function clampBadOmenLevel(level: number): number;
export function createBadOmen(level?: number): BadOmenState;
export function grantBadOmen(state: BadOmenState, amount?: number): BadOmenState;
export function clearBadOmen(state: BadOmenState): BadOmenState;
export function resolveVillageRaidTrigger(
  state: BadOmenState,
  village: VillageContext | null | undefined,
): OmenTriggerDecision;
```

Game seams (wired when 285 implementation runs, after 282):

```ts
type VillageQuery = () => VillageContext | null;

getBadOmenLevel(): number;
grantBadOmen(amount?: number): void;
clearBadOmen(): void;
setVillageQuery(query: VillageQuery | null): void;
// internal, once per unpaused fixed tick:
evaluateBadOmenVillageTrigger(): OmenTriggerDecision;
```

Default village query is `() => null`. `setVillageQuery(null)` restores the
default. The Game holds `badOmen: BadOmenState` and replaces it immutably.

## Control/data flow

1. A future source (or test/debug seam) calls `Game.grantBadOmen(amount?)`;
   Game replaces `badOmen` with `grantBadOmen(prev, amount)`.
2. On each unpaused fixed tick (same gate as 282's `tickRaid`):
   a. if disposed/loading/paused → skip;
   b. `village = villageQuery()`; `decision = resolveVillageRaidTrigger(badOmen, village)`;
   c. if `NONE` → done (omen retained);
   d. if `START_RAID` → invoke the 282 raid-start path at the decision center
      with `decision.badOmenLevel` (equivalent to `debugStartRaid` semantics:
      `startRaid` + first `tickRaid`), then `badOmen = clearBadOmen(badOmen)`.
3. `getBadOmenLevel()` returns `badOmen.level` for tests and E2E.
4. Dispose clears the transient field; reload constructs a fresh Game with
   level 0.

## Detailed behavior

- `clampBadOmenLevel`: non-finite → 0; `< 0` → 0; `> 5` → 5; otherwise
  `Math.floor` toward 0 for finite positives (so 1.9 → 1, −0.4 → 0 after the
  negative clamp).
- `grantBadOmen(state, amount = 1)`: clamps `amount`; if `amount ≤ 0` or level
  already at cap, returns `state` unchanged (same reference allowed); else
  returns `{ level: clampBadOmenLevel(level + amount) }`.
- `clearBadOmen`: always `{ level: 0 }` (identity when already 0 is allowed).
- `resolveVillageRaidTrigger` reason precedence: no/invalid state level first
  (`NO_OMEN` when clamped level < 1), then null/undefined village
  (`NO_VILLAGE`), then `containsPlayer === false` (`NOT_INSIDE`), then any
  non-finite center component (`INVALID_CENTER`), else `START_RAID` with the
  clamped level and finite center.
- Starting a new raid while one is already active or terminal replaces state
  atomically via the existing 282 contract; 285 does not special-case prior
  raids beyond calling that path once per successful decision.
- Duplicate grants stack up to 5; duplicate clear is a no-op; a decision that
  does not start consumes nothing, so the next tick can retry.

## Failure modes

- Invalid omen numbers are clamped inside pure helpers; no exception reaches
  Game or the state machine.
- Invalid village center → `INVALID_CENTER`, omen retained, no `startRaid`
  call, no clear.
- Missing/absent village query result → `NO_VILLAGE`, silent no-op each tick.
- If the 282 start path were unavailable (raid seam missing), Game MUST NOT
  clear the omen; treat as failure and retain (fail closed). Implementation
  orders the clear strictly after a successful start invocation.
- Dispose during evaluation is impossible in the single-threaded fixed tick;
  post-dispose ticks never enter the gate.
- Repeated terminal raid ticks are already idempotent in 152/282; 285 adds no
  second terminal writer.

## Compatibility/migration

No persistence key, codec, registry entry, or archive field. Existing saves,
`GamePersistence`, `WorldArchiver`, pause, reset, and reload paths are
untouched. No DOM is added, so visual goldens are unaffected by boot state.
`bad_omen` / `hero_of_the_village` registry rows remain byte-identical.

## Performance/resource constraints

One O(1) pure decision plus at most one raid-start call and one clear per
unpaused fixed tick. No entity iteration, spatial index, unbounded loop,
worker, timer, texture, or GPU work. Village query cost is whatever the
injected callback costs; the default is a constant `null` return.

## Testing seams

- Unit: pure `BadOmenRules` (clamp/grant/clear/trigger matrix including
  invalid centers and reason precedence); Game integration with an injected
  fixture `VillageQuery` covering grant → trigger → raid active + omen 0,
  no-village retention, invalid-center retention, pause freeze, dispose,
  active-raid replacement, and reload level 0.
- Browser: `__voxelGame` grant + fixture query (test-only setter) →
  `#raid-feedback` becomes active → clear/inspect omen via
  `getBadOmenLevel()` → reload shows level 0 and no raid/omen resurrection.

## Observability/debugging

`getBadOmenLevel()` and the decision return value of the internal evaluate
seam (exposed for tests as `evaluateBadOmenVillageTrigger()`) are the only
observables. No new HUD, log spam, or ARIA nodes.

## Affected files/symbols

- `src/simulation/BadOmenRules.ts` (new pure module).
- `src/engine/Game.ts` (badOmen field, seams, fixed-tick evaluate, dispose).
- `tests/unit/BadOmenRules.test.ts`, `tests/unit/LiveBadOmen.test.ts`,
  `tests/e2e/bad-omen-acquisition.spec.ts`.
- This package; `OVERRIDE_DRAFT.md` (draft sequence/override addendum for a
  later control-plane session — live `CHANGE_SEQUENCE_OVERRIDES.md` and
  `PROGRAM_STATE*` are not edited on this branch).

## Rejected alternatives

- Persisting `__badomen__` was rejected: vanilla-like cross-session omen is a
  later concern; 285 is explicitly ephemeral to avoid colliding with 283's raid
  persistence scope.
- Granting via status-effect amplifier was rejected: `maxAmplifier` is 0 in
  the registry and changing it would edit shared effect data outside this
  change's scope; level lives in Game state instead.
- Building village boundary detection here was rejected: no structure/village
  generation exists; detection belongs to a later dedicated change (284+).
- Auto-starting raids from the raw status-effect manager was rejected: it would
  couple 285 to effect ticking order and entity holders; the pure decision +
  injected village query keeps tests deterministic.

## Downstream dependencies

- 283 raid persistence may later serialize active raids started through this
  path; 285 does not depend on that serialization.
- A future village detector (284+) injects a real `VillageQuery` without
  changing the pure contract.
- A future captain/raider kill source calls `Game.grantBadOmen()` at its death
  choke point without changing trigger rules.
- 282's feedback bar becomes player-visible automatically when a trigger fires.
