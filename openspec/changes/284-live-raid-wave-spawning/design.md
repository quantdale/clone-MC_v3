# Design: 284-live-raid-wave-spawning

## Context/current state

`RaidStateMachine` (152) is pure and zero-import. `tickRaid` returns
`{ state, spawned }` where `spawned` is the next wave roster or `null`.
Rosters name plain string keys (`pillager`, `vindicator`, `ravager`, `witch`)
that are **not** in `createDefaultEntityRegistry()`. `EntityManager.spawn`
requires a registered `ResourceId` and finite transform; it has no raid
awareness.

Change 282 is VERIFIED on `main`: Game owns ephemeral `raidState`, one
`tickRaid` per unpaused fixed tick, debug start/clear/replay, and the
feedback projection. Change 283 is VERIFIED and published (`__raid__`
persistence only). This session implements 284 against those live seams.

`HostileMobSystem`/`PassiveMobSystem` each own a private `EntityManager` for
ambient spawns; they are not raid authorities. `MobDropLootSystem.damageEntity`
can remove entities but is not Game-wired for player→mob combat in all paths.
There is no settlement detector and no bad-omen grant path.

## Target state

A narrow live wave-population layer sits **beside** 152/282:

1. **Pure plan** — `planRaidWaveSpawn(center, roster, opts)` produces ordered
   placements without touching Game or entities.
2. **Backend port** — `RaidEntityBackend` isolates spawn/despawn/list so Game
   depends on a port, not `EntityManager` directly.
3. **Game wave controller** — after each 282 raid tick, if `spawned` is a
   non-empty roster, run plan → backend.spawnAll; track handles by
   `waveIndex`; despawn prior wave and terminal/clear/dispose sets.
4. **Death alignment** — tracked entity death → `recordRaiderDeath` once per
   id.
5. **Registry** — four raider types exist so production backend resolution
   succeeds; keys equal roster `typeKey`s exactly.

Headless CI constructs Game (or a focused controller harness) with
`createRecordingRaidBackend()` and asserts spawn/despawn logs without GPU.

## Invariants

- `RaidStateMachine` remains the only mutator of `RaidState` counters/status;
  Game never arithmetic-edits `raidersRemaining` except by calling
  `recordRaiderDeath`.
- At most one raid's wave-entity tracking set exists per Game instance.
- A wave roster is applied at most once per `waveIndex` (duplicate spawn
  request is an identity no-op that does not double-spawn).
- Backend `despawn` is idempotent for unknown/stale handles.
- Spawn plan is a pure function of `(center, roster, options)` — same inputs,
  same ordered placements; no RNG, no `Date.now()`.
- Non-finite center/position, non-positive counts, or unknown `typeKey`
  never throw on the fixed-tick path; they fail closed (skip or abort wave
  apply) and are observable in the result object.
- Partial wave failure leaves zero net new entities for that wave (rollback
  despawns already-spawned partials).
- Death consumption is exactly-once per `(raidGeneration, entityId)`.
- Pause: no spawn/despawn/death consumption driven by raid tick while paused
  (282 already freezes `tickRaid`).
- Dispose/reload: tracking cleared; non-persistent raiders are not written to
  any store; no resurrection.
- No bad-omen acquisition, settlement detection, or new persistence namespace.

## API and data model

```ts
// Pure plan (headless-safe)
export interface RaidSpawnPlacement {
  readonly typeKey: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

export interface RaidWaveSpawnPlan {
  readonly waveIndex: number;
  readonly placements: readonly RaidSpawnPlacement[];
  readonly skipped: readonly { typeKey: string; count: number; reason: 'UNKNOWN_TYPE' | 'INVALID_COUNT' }[];
  readonly ok: boolean;
}

export function planRaidWaveSpawn(
  center: { x: number; y: number; z: number },
  waveIndex: number,
  roster: readonly RaidWaveEntry[],
  resolveType: (typeKey: string) => boolean,
  opts?: { ringRadius?: number; yJitter?: number },
): RaidWaveSpawnPlan;

// Injectable backend port
export interface RaidSpawnRequest {
  readonly typeKey: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly waveIndex: number;
  readonly raidGeneration: number;
}

export interface RaidEntityHandle {
  readonly entityId: number;
  readonly typeKey: string;
  readonly waveIndex: number;
  readonly raidGeneration: number;
}

export interface RaidEntityBackend {
  spawn(req: RaidSpawnRequest): RaidEntityHandle; // throws on hard backend failure
  despawn(handle: RaidEntityHandle): void;        // idempotent
  isAlive(handle: RaidEntityHandle): boolean;
}

export function createRecordingRaidBackend(opts?: {
  failSpawnAfter?: number;
  unknownKeys?: readonly string[];
}): RaidEntityBackend & {
  readonly spawns: readonly RaidSpawnRequest[];
  readonly despawns: readonly RaidEntityHandle[];
};
```

Game-side controller (sketch; exact methods named at implementation):

```ts
// after 282 tickRaid / debugTickRaid
private applyRaidSpawned(spawned: RaidWaveEntry[] | null, next: RaidState): RaidWaveApplyResult;

// death hook
private onRaidEntityRemoved(entityId: number): void;

// lifecycle
private clearRaidWaveEntities(reason: 'wave' | 'terminal' | 'clear' | 'dispose' | 'replace'): void;
```

`RaidWaveApplyResult` is a plain object:
`{ applied: boolean; spawned: number; skipped: [...]; rolledBack: boolean; error?: string }`.

Registry additions (additive only):

| key | category | health | attackDamage | summonable | persistent |
|---|---|---|---|---|---|
| pillager | MONSTER | 24 | 4 | true | false |
| vindicator | MONSTER | 24 | 6 | true | false |
| ravager | MONSTER | 100 | 12 | true | false |
| witch | MONSTER | 26 | 0 | true | false |

(`isPersistent: false` keeps 131 serializeChunk from writing raiders; values
are vanilla-inspired and MUST be pinned by unit tests.)

## Control/data flow

1. 282 fixed tick → `tickRaid(state)` → `{ state: next, spawned }`.
2. Game stores `next` (282 contract), then if `spawned?.length > 0`:
   - if `plan.waveIndex` already applied → no-op duplicate guard;
   - `clearRaidWaveEntities('wave')` for any leftover handles from prior wave;
   - `planRaidWaveSpawn(...)` with `resolveType = registry.getByKey !== undefined`;
   - if `!plan.ok` or zero placements after skips → structured result, do not
     partially commit;
   - for each placement in order: `backend.spawn`; on throw → despawn all
     spawns from this attempt, set `rolledBack: true`, stop;
   - on success: union handles into tracking; mark wave applied.
3. Terminal `VICTORY`/`DEFEAT` after tick → `clearRaidWaveEntities('terminal')`.
4. `debugClearRaidWave` / replace start / `dispose` → clear with matching
   reason; bump `raidGeneration` on replace/start so stale death callbacks
   cannot decrement the new raid.
5. Entity removal path (combat, debug remove, backend despawn side effect):
   if handle/generation matches tracking, delete from set, then
   `recordRaiderDeath` once; else ignore.
6. Reload/boot: no hydrate of raid entities; 282 already nulls raid state;
   tracking starts empty.

## Detailed behavior

- **Ring placement:** entry `i` in flattened roster order (registration order
  of `waveComposition`) sits at angle `2π * i / total`, radius `ringRadius`
  (default `2 + waveIndex`), `y = center.y` (finite), `yaw` facing center.
  Flattening preserves type-then-count order for determinism.
- **Duplicate wave:** second apply for same `(generation, waveIndex)` returns
  `{ applied: false }` without backend calls.
- **Unknown typeKey:** counted in `skipped`; if any skip occurs the apply is
  fail-closed (`ok: false`) and **no** entities are spawned for that wave
  (all-or-nothing) so `raidersRemaining` never exceeds spawned count by
  silent skips.
- **Backend throw:** rollback partials; `raidersRemaining` still equals the
  machine's post-`tickRaid` value (machine authority). Result exposes
  `rolledBack`; tests pin that a later successful retry is NOT automatic on
  the same tick (next attempt only on a new spawn roster event or explicit
  debug re-apply if added — **not** in scope: no auto-retry loop).
- **Stale despawn:** `despawn` on already-removed entity is a no-op;
  controller ignores unknown ids in death callbacks.
- **Death:** only ids in the current generation's tracking set count.
- **Empty roster:** `spawnWave` can return `[]` only when composition is
  empty (should not happen for real rosters); treat as no-op apply.
- **Feedback:** 282 bar continues to read `RaidState` only; entity counts are
  not a second HUD source.

## Failure modes

| Failure | Behavior |
|---|---|
| Non-finite center | plan `ok: false`, no spawn, no throw |
| Unknown typeKey | all-or-nothing skip list, no spawn |
| Backend spawn throws | despawn partials this attempt, structured error, no throw to tick loop |
| Duplicate wave apply | identity no-op |
| Death for unknown id | identity no-op |
| Death after terminal clear | generation mismatch → no-op |
| Missing registry key in production | treated as unknown type before backend |
| Pause | raid tick not run → no spawn work |
| Dispose mid-wave | clear handles; later callbacks no-op |
| Reload | empty tracking; no store read/write for raiders |

## Compatibility/migration

- Additive registry entries only; no renumber of existing entity runtime ids
  beyond append-order shift — **risk:** dense runtime ids are assignment
  order; appending four types at the end of `createDefaultEntityRegistry`
  keeps prior ids stable. MUST append, never insert in the middle.
- No persistence schema. `isPersistent: false` for raiders.
- No change to 152 exports; no change to 282 projection contract.
- Visual goldens: no new HUD; entity meshes only appear when a raid is
  started in a journey — existing 60-cell matrix fixtures do not start raids,
  so goldens stay stable.

## Performance/resource constraints

- Per wave apply: O(total raiders) spawns, O(1) per entity bookkeeping.
- No per-tick entity scan for raid bookkeeping beyond existing manager ticks.
- No unbounded retry, timer, worker, or GPU path.
- Wave size bounded by 152 composition (small integers; max wave index 7).

## Testing seams

- `planRaidWaveSpawn` pure unit tests (determinism, ring, skips, non-finite).
- `createRecordingRaidBackend` for headless CI: assert spawn order, despawn
  idempotence, `failSpawnAfter` rollback.
- Game/controller unit tests with fake backend: duplicate wave, terminal
  clear, death exactly-once, generation bump on replace, pause, dispose.
- Optional thin adapter test: production backend maps `typeKey` → ResourceId
  via `getByKey` and calls `EntityManager.spawn`/`remove` (manager-level, no
  browser).
- Browser journey optional only if 282 E2E already boots Game; prefer unit +
  adapter tests for this change's mandatory evidence to stay headless-safe.

## Observability/debugging

- `getRaidWaveEntityIds(): readonly number[]` (or equivalent) read-only seam.
- Apply result available on a debug getter for the last wave apply.
- Recording backend exposes `spawns`/`despawns` arrays for assertions.
- No new user-facing UI.

## Affected files/symbols

Intended at implementation time (not edited during this authoring session):

- `src/data/EntityType.ts` — append four raider defs.
- `src/simulation/RaidWaveSpawnPlan.ts` (new) — pure plan.
- `src/simulation/RaidEntityBackend.ts` (new) — port + recording fake +
  EntityManager adapter.
- `src/engine/Game.ts` — wave apply, tracking, death hook, dispose clear
  (depends on 282 raid state fields/methods).
- `tests/unit/RaidWaveSpawnPlan.test.ts`, `tests/unit/RaidEntityBackend.test.ts`,
  `tests/unit/LiveRaidWaveSpawning.test.ts` (names indicative).
- Package docs + `CHANGE_SEQUENCE.md` / `PARITY_MATRIX.md` / program-state
  are updated only for this 284 activation on main (done at T1; C284 matrix
  row lands at T12 VERIFIED).

## Rejected alternatives

- **Spawn inside `RaidStateMachine`:** rejected — 152 is zero-import/pure;
  entity I/O would destroy headless purity and verification boundary.
- **Hard-code `EntityManager` in Game:** rejected — blocks headless CI fake
  and couples raid logic to one manager implementation.
- **Auto-retry failed waves every tick until success:** rejected — unbounded
  hidden loop, duplicates 152 timeout semantics; failure is explicit and
  non-retrying within the same roster event.
- **Skip unknown types and spawn the rest:** rejected — would desync
  `raidersRemaining` from live entities.
- **Persistent raider entities now:** rejected — belongs with 283 persistence
  sequencing, not wave spawning; reload must not resurrect mid-raid.
- **Reuse hostile ambient spawn cycle for raid waves:** rejected — different
  caps, categories, and determinism requirements.

## Downstream dependencies

- 283 `live-raid-persistence` may later serialize raid outcome/entities; it
  MUST NOT assume 284 already wrote a store.
- Future bad-omen/settlement changes supply real `startRaid` triggers; 284
  only consumes rosters from the existing machine + 282 seams.
- Combat systems that remove entities should call the Game death hook (or go
  through a single removal choke) so `recordRaiderDeath` stays exactly-once.
