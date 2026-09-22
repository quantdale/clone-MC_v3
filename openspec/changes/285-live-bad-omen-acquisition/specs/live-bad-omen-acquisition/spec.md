# Spec: live-bad-omen-acquisition

## Contract

This capability adds session-ephemeral Bad Omen acquisition/clear rules and a
village-omen raid trigger as pure helpers plus Game wiring over the verified
`RaidStateMachine` (152) and the Change 282 raid seams. It does not claim
raider entities, village generation, spatial detection, persistence, a new HUD
element, or status-effect registry changes.

## Definitions

- **Bad Omen level:** an integer in `[0, 5]` owned by Game as
  `BadOmenState.level`.
- **Village context:** `{ centerX, centerY, centerZ, containsPlayer }` supplied
  by an injected query; `null`/`undefined` means no village is known.
- **Trigger decision:** the discriminated result of
  `resolveVillageRaidTrigger` — `START_RAID` with a finite center and clamped
  level, or `NONE` with a skip reason.
- **Successful start:** invoking the 282 raid-start path (state machine
  `startRaid` + first `tickRaid` semantics) without throwing, producing a
  non-null raid state.
- **Consumed omen:** the clear applied only after a successful start.

## Invariants

1. Level is always an integer in `[0, 5]`; helpers never throw and never store
   non-finite values.
2. Omen is ephemeral: no serialize, hydrate, archive, or reset path reads or
   writes it; a fresh Game starts at 0.
3. At most one trigger evaluation runs per unpaused fixed tick; paused,
   loading, and disposed games never evaluate or start raids from this path.
4. `START_RAID` implies level ≥ 1, `containsPlayer === true`, and finite
   centerX/Y/Z; every other input yields `NONE` with the precedence-defined
   reason.
5. The omen is cleared only after a successful start; failed/deferred
   decisions retain the exact prior level.
6. `RaidStateMachine` remains the sole raid lifecycle authority; 285 does not
   mutate raid fields by arithmetic.

## Requirements

### Requirement: total clamp, grant, and clear

`clampBadOmenLevel` MUST map non-finite input to 0, clamp to `[0, 5]`, and
floor finite positive fractions. `grantBadOmen(state, amount?)` MUST default
`amount` to 1, clamp the amount, leave state unchanged for non-positive amounts
or when already at the cap, and otherwise return a new state with
`clampBadOmenLevel(level + amount)`. `clearBadOmen` MUST return level 0 and
MUST NOT throw for any input state.

#### Scenario: invalid grant inputs clamp and never throw

- **GIVEN** a fresh state at level 0
- **WHEN** `grantBadOmen` is called with `NaN`, `Infinity`, `-3`, and `1.9` in
  separate calls starting from the prior result where applicable
- **THEN** no call throws and every resulting level is an integer in `[0, 5]`
- **AND** a `NaN` or non-positive amount leaves the level unchanged.

#### Scenario: stacking grants cap at 5 and clear is idempotent

- **GIVEN** level 4
- **WHEN** `grantBadOmen(state, 3)` is called
- **THEN** the result level is 5
- **AND** a further grant leaves level 5
- **AND** `clearBadOmen` twice yields level 0 both times without throwing.

### Requirement: village trigger is fail-closed and reason-typed

`resolveVillageRaidTrigger(state, village)` MUST be total. It MUST return
`NONE`/`NO_OMEN` when the clamped level is 0, `NONE`/`NO_VILLAGE` when village
is null or undefined, `NONE`/`NOT_INSIDE` when `containsPlayer` is not `true`,
and `NONE`/`INVALID_CENTER` when any center component is non-finite. It MUST
return `START_RAID` with the clamped level and finite center only when level ≥
1, the player is inside, and all center components are finite.

#### Scenario: valid village and omen start a raid decision

- **GIVEN** level 2 and village `{ centerX: 10, centerY: 64, centerZ: -3,
  containsPlayer: true }`
- **WHEN** the trigger is resolved
- **THEN** the decision is `START_RAID` with `badOmenLevel` 2 and center
  `(10, 64, -3)`.

#### Scenario: invalid center retains decision as NONE

- **GIVEN** level 3 and village `{ centerX: NaN, centerY: 64, centerZ: 0,
  containsPlayer: true }`
- **WHEN** the trigger is resolved
- **THEN** the decision is `NONE` with reason `INVALID_CENTER`
- **AND** no center coordinates are emitted for a start.

#### Scenario: reason precedence is stable

- **GIVEN** level 0 and a null village
- **WHEN** the trigger is resolved
- **THEN** the reason is `NO_OMEN`
- **AND** with level 1 and a village whose `containsPlayer` is false the reason
  is `NOT_INSIDE`.

### Requirement: Game owns one ephemeral level with test seams

`Game` MUST expose `getBadOmenLevel()`, `grantBadOmen(amount?)`, and
`clearBadOmen()` operating on a single ephemeral state. `setVillageQuery(fn)`
MUST replace the injected query and `setVillageQuery(null)` MUST restore the
default `() => null`. None of these seams MUST serialize omen data.

#### Scenario: seams mutate and read one level

- **GIVEN** a fresh Game
- **WHEN** `grantBadOmen(2)` then `getBadOmenLevel()` then `clearBadOmen()` run
- **THEN** the observed levels are 0 → 2 → 0
- **AND** no persistence key is written.

### Requirement: fixed-tick trigger starts once and consumes exactly once

While the simulation is running and unpaused, Game MUST evaluate the trigger at
most once per fixed tick. On `START_RAID` it MUST start the raid at the
decision center with the decision level through the Change 282 start path, then
clear the omen. On `NONE` it MUST NOT clear the omen and MUST NOT start a
raid. Paused, loading, and disposed paths MUST NOT evaluate.

#### Scenario: grant plus fixture village starts a raid and clears omen

- **GIVEN** level 1, an injected village containing the player, no active raid
- **WHEN** one unpaused fixed tick runs
- **THEN** `getRaidState()` is an active raid whose `badOmenLevel` is 1 (and
  wave contract follows 152)
- **AND** `getBadOmenLevel()` is 0
- **AND** the next tick is `NO_OMEN` and does not start a second raid.

#### Scenario: no village retains omen across ticks

- **GIVEN** level 2 and the default null query
- **WHEN** any number of unpaused fixed ticks run
- **THEN** `getBadOmenLevel()` remains 2
- **AND** `getRaidState()` is unchanged.

#### Scenario: invalid center fails closed and retains omen

- **GIVEN** level 3 and a fixture village with a non-finite center
- **WHEN** an unpaused fixed tick runs
- **THEN** no raid is started (or prior raid state is unchanged)
- **AND** `getBadOmenLevel()` remains 3.

#### Scenario: pause freezes evaluation

- **GIVEN** level 1 and a valid fixture village
- **WHEN** the Game is paused for several render frames without fixed ticks
- **THEN** the level remains 1 and no new raid state appears
- **AND** the first resumed fixed tick performs the start and clear.

#### Scenario: duplicate trigger in the same tick cannot double-start

- **GIVEN** a successful start and clear on tick N
- **WHEN** tick N+1 runs with the same fixture village
- **THEN** the decision is `NO_OMEN`
- **AND** raid state is not replaced by a second start from this path.

### Requirement: dispose and reload leave no omen or resurrection

Dispose MUST clear the transient omen reference. Reload/reset MUST construct
level 0 and MUST NOT read any omen or raid record written by 285 (285 writes
none). A previously visible raid feedback from a 282-owned raid follows 282's
existing no-resurrection rules.

#### Scenario: reload restores zero with no side effects

- **GIVEN** level 4 and an active raid started earlier
- **WHEN** pagehide and reload complete
- **THEN** `getBadOmenLevel()` is 0
- **AND** no omen record was read or written by 285.

### Requirement: existing systems remain unchanged

This change MUST NOT add a persistence namespace/field, archive row, raider
entity, village detector, status-effect registry edit, new HUD element, or
headed/GPU path, and existing wither/HUD/container/raid-feedback flows MUST
remain green.

#### Scenario: registry and feedback bar are untouched by boot

- **GIVEN** a fresh page load with no grants
- **WHEN** the game boots and idles
- **THEN** `getBadOmenLevel()` is 0, no raid feedback is forced visible by 285,
  and the `bad_omen` registry entry is unchanged
- **AND** existing raid-feedback and wither tests still pass.

## Error and failure behavior

All pure helpers are total: invalid numbers clamp, invalid villages skip with a
typed reason, and nothing throws into the fixed tick. Game treats a missing raid
start seam as failure and retains omen. Missing DOM or absent feedback elements
are presentation-only concerns owned by 282 and must not crash this path.

## Performance and resource bounds

One O(1) decision per unpaused fixed tick, at most one raid start and one clear
per successful decision. No entity scans, spatial structures, timers, workers,
or unbounded loops.

## Compatibility and migration

No stored data or migration. Additive Game seams and a new pure module only.
Existing saves, archives, settings, and visual baselines remain compatible.

## Security and integrity

No HTML interpolation; no new network surface. Debug/test seams stay on the
existing `__voxelGame` handle pattern used by 282. Omen never enters persistent
storage, so malformed save payloads cannot inject levels.

## Observability

`getBadOmenLevel()`, `getRaidState()` (282), and
`evaluateBadOmenVillageTrigger()` (test-visible decision) are the deterministic
observables. No new HUD or log channels.

## Verification mapping

| Requirement | Evidence |
|---|---|
| Clamp/grant/clear totals | `tests/unit/BadOmenRules.test.ts` |
| Trigger fail-closed reasons | `tests/unit/BadOmenRules.test.ts` |
| Game seams and fixed-tick consume | `tests/unit/LiveBadOmen.test.ts` |
| Pause/dispose/replace/reload | `tests/unit/LiveBadOmen.test.ts` |
| Browser grant→feedback→reload | `tests/e2e/bad-omen-acquisition.spec.ts` |
| No persistence/registry/HUD/GPU | file-audit + existing full gates |
