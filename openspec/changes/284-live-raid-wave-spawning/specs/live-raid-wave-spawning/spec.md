# Spec: live-raid-wave-spawning

## Contract

This capability turns verified `RaidStateMachine` wave spawn events into live
raider entities through an injectable backend, and despawns them on wave
replacement, terminal outcome, clear, dispose, and reload. It does not grant
bad omen, detect settlements, or add a persistence namespace. `RaidStateMachine`
remains the sole authority for raid status and counters; 282 remains the sole
authority for ephemeral raid state ownership and feedback presentation.

## Definitions

- **Wave spawn event:** the non-null, non-empty `spawned: RaidWaveEntry[]`
  returned by `tickRaid` (or an equivalent 282 debug tick) together with the
  post-transition `RaidState`.
- **Raid generation:** a monotonically increasing Game-local token bumped on
  raid start/replacement and cleared on dispose; death/despawn callbacks from
  an old generation are stale.
- **Tracked wave entity:** an entity handle recorded by the wave controller
  for the current generation.
- **Recording backend:** the headless `RaidEntityBackend` fake that logs
  spawn/despawn calls for CI.
- **All-or-nothing wave apply:** either every planned placement for a roster
  succeeds, or the controller leaves zero net newly spawned entities for that
  roster and returns a structured failure/rollback result.

## Invariants

1. Game never mutates `RaidState` fields by arithmetic; only 152 transition
   functions change status/wave/remaining/ticks.
2. At most one generation's tracking set is live; replace clears the previous
   set before the new generation accepts spawns.
3. Spawn plans are pure and deterministic for equal inputs.
4. Raider entity keys match roster `typeKey`s exactly and are appended to the
   default registry without reordering existing entries.
5. Raider types used by this change are non-persistent (`isPersistent` false).
6. No raid entity records are written to or read from GamePersistence /
   WorldArchiver by this capability.
7. The fixed-tick raid path does not throw for plan/backend/death edge cases.

## Requirements

### Requirement: Register raider types matching roster keys

The default entity registry MUST include entity types with keys `pillager`,
`vindicator`, `ravager`, and `witch`, each with category `MONSTER`, finite
health > 0, finite attack damage >= 0, `isSummonable` true, and
`isPersistent` false. Existing registry entries MUST keep their prior keys;
new entries MUST be appended so prior registration order and dense runtime
ids of existing types remain unchanged.

#### Scenario: keys resolve for every roster type

- **GIVEN** `createDefaultEntityRegistry()`
- **WHEN** `getByKey` is called for each of `pillager`, `vindicator`,
  `ravager`, `witch`
- **THEN** each returns a definition with `category === 'MONSTER'` and
  `isPersistent === false`
- **AND** a pre-existing key such as `zombie` still resolves with unchanged
  fields.

#### Scenario: wave roster keys are fully resolvable

- **GIVEN** `waveComposition(waveIndex, badOmenLevel)` for wave indices
  `0..RAID_MAX_WAVES-1` and omen levels `1` and `3`
- **WHEN** every returned `typeKey` is looked up in the default registry
- **THEN** every key resolves (no `UNKNOWN_TYPE` skips for valid rosters).

### Requirement: Pure deterministic wave spawn plan

`planRaidWaveSpawn` MUST be pure: no RNG, no wall clock, no mutation of
inputs. It MUST emit exactly one placement per positive roster count, in
flattened roster order, with finite coordinates derived only from the center
and options. It MUST set `ok: false` when the center is non-finite, when any
`typeKey` fails `resolveType`, or when any count is non-positive/non-finite
after normalization; in those cases `placements` MUST be empty. Zero-count
roster entries MUST be omitted without failing the plan.

#### Scenario: identical inputs yield identical plans

- **GIVEN** the same center, waveIndex, roster, resolver, and options
- **WHEN** `planRaidWaveSpawn` is called twice
- **THEN** both results have deeply equal `placements` and `ok`.

#### Scenario: non-finite center fails closed

- **GIVEN** center `{ x: NaN, y: 64, z: 0 }`
- **WHEN** the plan is computed for a non-empty roster
- **THEN** `ok` is false and `placements` is empty
- **AND** the function does not throw.

#### Scenario: unknown typeKey fails the whole plan

- **GIVEN** a roster containing `{ typeKey: 'not_a_raider', count: 1 }` and a
  resolver that returns false for that key
- **WHEN** the plan is computed
- **THEN** `ok` is false, `placements` is empty, and `skipped` records the
  unknown key.

#### Scenario: zero-count entries are omitted without failure

- **GIVEN** roster `[{ typeKey: 'vindicator', count: 0 }, { typeKey:
  'pillager', count: 2 }]` and a resolver that accepts both keys
- **WHEN** the plan is computed
- **THEN** `ok` is true and there are exactly 2 placements, all `pillager`.

### Requirement: Injectable backend isolates entity I/O

Game wave application MUST depend on a `RaidEntityBackend` port (spawn,
idempotent despawn, liveness query) rather than constructing entity-manager
calls inline. A recording fake MUST be available for headless tests. The
production adapter MUST resolve `typeKey` through the entity registry and
MUST NOT spawn unknown types.

#### Scenario: recording backend logs spawn and despawn

- **GIVEN** `createRecordingRaidBackend()`
- **WHEN** two spawn requests succeed and `despawn` is called twice on the
  same handle
- **THEN** `spawns` has length 2 and `despawns` records one effective removal
  semantics with no throw on the second despawn.

#### Scenario: production adapter refuses unknown keys before spawn

- **GIVEN** the production adapter and a request with an unregistered
  `typeKey`
- **WHEN** `spawn` is called
- **THEN** it throws a documented error and does not insert an entity
- **AND** the Game controller treats this as a failed wave apply (rollback),
  not a partial success.

### Requirement: Wave spawn events apply at most once

When a wave spawn event occurs, the controller MUST apply the roster at most
once per `(raidGeneration, waveIndex)`. A duplicate apply MUST be an identity
no-op that performs zero backend spawns. Before committing a new wave, the
controller MUST despawn leftover tracked entities from the prior wave of the
same generation (normally empty when counts are aligned).

#### Scenario: first wave spawns the full roster count

- **GIVEN** a started raid at wave 1 with roster sum N and a recording backend
- **WHEN** the wave spawn event is applied
- **THEN** `spawns.length === N` and each handle's `waveIndex === 1`
- **AND** tracking contains N ids.

#### Scenario: duplicate apply does not double-spawn

- **GIVEN** wave 1 already applied for the current generation
- **WHEN** the same spawn event is applied again
- **THEN** the result has `applied === false`
- **AND** the recording backend's spawn count is unchanged.

#### Scenario: generation bump invalidates the previous wave tracking

- **GIVEN** tracked entities from generation G1
- **WHEN** a new raid starts (generation becomes G2)
- **THEN** prior handles are despawned/cleared
- **AND** a stale despawn or death callback tagged G1 is ignored.

### Requirement: Partial backend failure rolls back the wave

If any `spawn` throws during a wave apply, the controller MUST despawn every
entity successfully spawned during that attempt, MUST NOT throw out of the
fixed-tick/apply entry point, MUST return a structured result with
`rolledBack: true`, and MUST NOT automatically retry the same roster on
subsequent ticks without a new wave spawn event.

#### Scenario: mid-wave failure leaves no partial wave

- **GIVEN** a roster of 3 and a backend that throws on the second spawn
- **WHEN** the wave is applied
- **THEN** the first spawned entity is despawned
- **AND** tracking gains no new ids for that wave
- **AND** the result reports `rolledBack === true` and `spawned === 0`
  (zero net new wave entities committed).

#### Scenario: failure does not crash the tick loop

- **GIVEN** the same failing backend during a fixed tick
- **WHEN** the raid tick and wave apply run
- **THEN** no exception escapes to the caller of the tick helper
- **AND** 282's stored `RaidState` is still the state returned by `tickRaid`.

### Requirement: Terminal, clear, replace, and dispose despawn idempotently

On transition to `VICTORY` or `DEFEAT`, on debug clear, on raid replacement
start, and on Game dispose, the controller MUST attempt despawn of all
tracked handles for the active generation and then clear tracking. Repeated
clear calls MUST NOT throw and MUST NOT despawn entities belonging to a
different generation.

#### Scenario: victory clears wave entities

- **GIVEN** tracked wave entities and a tick that returns `VICTORY`
- **WHEN** terminal handling runs
- **THEN** all current-generation handles are despawned and tracking is empty.

#### Scenario: double dispose is safe

- **GIVEN** dispose already cleared tracking
- **WHEN** dispose/clear runs again
- **THEN** no throw and no backend despawn calls for empty tracking.

### Requirement: Raider deaths decrement remaining exactly once

When a tracked entity of the current generation is removed by death (or an
equivalent removal choke), the controller MUST call `recordRaiderDeath` once
for that entity id. Subsequent callbacks for the same id MUST be identity
no-ops. Deaths for unknown ids, stale generations, or non-active raids MUST
NOT change counters incorrectly (non-active: 152 already no-ops).

#### Scenario: one death decrements once

- **GIVEN** active raid remaining 4 and one tracked entity id E
- **WHEN** E's death callback runs twice
- **THEN** `raidersRemaining` is 3 after both calls
- **AND** the second call does not change state.

#### Scenario: unknown id death is ignored

- **GIVEN** active raid remaining 4
- **WHEN** a death callback arrives for an id never tracked this generation
- **THEN** `raidersRemaining` stays 4.

### Requirement: Pause freezes spawn/despawn driven by raid ticks

While the Game is paused, 282 MUST NOT advance `tickRaid`; therefore this
capability MUST NOT spawn or despawn wave entities as a result of raid tick
work. Explicit debug seams that 282 already exposes may still run only under
the same pause rules 282 defines (paused fixed tick does not call them).

#### Scenario: paused frames do not spawn a pending wave

- **GIVEN** an active raid with a cleared wave awaiting the next spawn event
  and Game paused
- **WHEN** multiple render frames elapse
- **THEN** recording backend spawn count is unchanged
- **AND** `RaidState` is unchanged from before the pause.

### Requirement: Reload does not resurrect raid entities

Raid wave entities MUST NOT be persisted by this capability. After pagehide
and reload, tracking MUST be empty, `getRaidState()` remains null under 282's
contract, and no entity store row for raiders is required or written.

#### Scenario: reload clears live wave population

- **GIVEN** an active raid with spawned wave entities
- **WHEN** pagehide and reload complete
- **THEN** no wave entity tracking exists
- **AND** no new raid entity records appear in persistence dumps for this
  change's namespace (there is none).

### Requirement: No bad omen, settlement detection, or unrelated systems

This capability MUST NOT implement bad-omen acquisition, raid-captain effects,
village boundary detection, structure generation, a new HUD, a new
persistence namespace, or any Change 258 headed/GPU work. Existing wither
HUD, 282 feedback bar, and container one-container rules MUST remain
unmodified by wave spawning.

#### Scenario: scope audit finds no omen/settlement/GPU edits

- **GIVEN** the implemented diff for this change
- **WHEN** reviewers search for bad-omen effect grants, settlement detectors,
  new save keys, and 258 performance certification edits
- **THEN** none are present outside explicitly non-goals documentation.

## Error and failure behavior

- Plan validation failures → `ok: false`, empty placements, no throw.
- Backend spawn throw → rollback partials, structured `rolledBack`, no throw
  across the tick boundary.
- Idempotent despawn for missing handles.
- Death callbacks for unknown/stale ids ignored.
- Registry append validation failures (invalid health/category) throw at
  registry construction time (existing `EntityError` contract), failing fast
  in tests.

## Performance and resource bounds

O(R) work per wave apply for roster size R; O(1) bookkeeping per death; no
per-tick full entity rescans beyond existing manager updates; no unbounded
retry; no new workers/textures required by the controller itself.

## Compatibility and migration

Additive registry entries appended to `createDefaultEntityRegistry`. No save
migration. No change to `SerializedRaid` schema. Non-persistent raiders keep
131 serialization from emitting them. Visual matrix fixtures do not start
raids.

## Security and integrity

Debug/backend seams remain behind existing test/`__voxelGame` patterns used
by 282. No HTML interpolation. Fail-closed plan/apply prevents unregistered
types from entering the world through this path.

## Observability

Read-only `getRaidWaveEntityIds`, last `RaidWaveApplyResult`, and recording
backend logs are the test observables. 282's `#raid-feedback[data-status]`
remains the player-facing status source.

## Verification mapping

| Requirement | Evidence |
|---|---|
| Raider registry keys/append stability | `tests/unit/EntityType.test.ts` (extended) or dedicated registry test |
| Pure plan determinism/fail-closed | `tests/unit/RaidWaveSpawnPlan.test.ts` |
| Backend port + recording fake + adapter refusal | `tests/unit/RaidEntityBackend.test.ts` |
| Duplicate apply / rollback / terminal clear / death once / generation | `tests/unit/LiveRaidWaveSpawning.test.ts` |
| Pause + reload non-resurrection | LiveRaidWaveSpawning unit cases + existing 282 reload journey regression |
| No omen/settlement/persistence/258 scope | file-audit + diff review + full unit/build/E2E gates |
