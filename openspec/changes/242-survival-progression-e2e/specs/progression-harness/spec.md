# Spec: progression-harness

## Contract

The headless execution seam for change 242. A `ProgressionHarness` composes the
real production progression modules over an in-memory `WorldAccess` fixture and
a seed-derived RNG stream, and drives the full survival chain
(0 fresh-world → 6 boss-complete) deterministically and headlessly. It must
report per-stage completion, support snapshot/restore mid-progression, abort
atomically on failure, and produce a deterministic state hash. This spec is the
shared contract every stage spec (`survival-progression`, `nether-progression`,
`end-progression`) builds on. It is test-support infrastructure under `tests/`;
it is not shipped game code.

## Definitions

- **Progression stage**: one of `fresh-world | tools | food | shelter | nether
  | end | boss-complete` (0-6).
- **Progression script**: an ordered sequence of actions (break, place, craft,
  eat, light portal, teleport, damage boss) that advances the chain.
- **State hash**: a deterministic string over the serialized progression state
  (tick, player position, player dimension, survival, experience, inventory,
  world edits, boss record, dragon completion record, advancement progress).
- **Typed abort error**: an error with a stable machine-readable `code` plus a
  human message, used for precondition failures.

## Invariants

- The harness MUST drive the real production modules (not re-implementations).
- All random draws MUST come from `SeedRng` streams derived from the harness
  `worldSeed`; `Math.random` MUST NOT be used.
- A failed action MUST leave progression state unchanged (atomicity).
- A stage MUST report complete only when its concrete completion assertion holds.
- Snapshot/restore MUST be a faithful state round-trip: stepping forward after
  restore equals stepping forward from that point in a fresh run.
- Scenarios MUST run under a bounded step budget; exceeding it is a
  budget-exceeded result, never success.

## Requirements

### Requirement: deterministic construction
The harness MUST accept a `worldSeed` and derive every RNG stream it uses from
that seed via `SeedRng.createNamedRng(worldSeed, streamName)`. Two harnesses
with the same `worldSeed` and the same script MUST produce identical state.

#### Scenario: same-seed construction yields same state
- **GIVEN** a `worldSeed` value `S` and a progression script `P`
- **WHEN** two harnesses are constructed with `S` and run `P` to completion
- **THEN** both report the same `isChainComplete()` value
- **AND** both `stateHash()` values are identical

#### Scenario: different seeds are permitted to differ
- **GIVEN** two distinct `worldSeed` values `S1` and `S2`
- **WHEN** each harness runs the same script to completion
- **THEN** each produces a valid state hash
- **AND** the two hashes need not be equal (no assertion that they match)

### Requirement: bounded deterministic stepping
The harness MUST provide `step(times)` and `stepUntil(stage, maxSteps)` with
`SimulationHarness` semantics. `stepUntil` MUST return `true` only when the
target stage completed within `maxSteps`; otherwise it MUST return `false`
without throwing and without reporting the stage complete.

#### Scenario: stage completes within budget
- **GIVEN** a harness at the start of a stage whose actions complete in `n` steps
- **WHEN** `stepUntil(stage, maxSteps)` is called with `maxSteps >= n`
- **THEN** it returns `true`
- **AND** `isStageComplete(stage)` is `true`

#### Scenario: budget exceeded is not success
- **GIVEN** a harness at the start of a stage that requires `n` steps
- **WHEN** `stepUntil(stage, maxSteps)` is called with `maxSteps < n`
- **THEN** it returns `false`
- **AND** `isStageComplete(stage)` remains `false`
- **AND** the harness state is not silently advanced past the budget

### Requirement: snapshot and restore mid-progression
The harness MUST support `snapshot()` capturing the full progression state
(tick, player position, player dimension, survival, experience, inventory,
world edits, boss record, dragon completion record, advancement progress) and
`restore(snapshot)` returning it to that exact point. `restore` MUST validate
the whole payload first and reject a malformed payload atomically (harness
unchanged).

#### Scenario: restore-then-step equals fresh run
- **GIVEN** a harness run to a stage boundary `B` with snapshot `b = snapshot()`
- **WHEN** the harness is `reset()` to a fresh state and then `restore(b)`, and
  the script continues from `B` to completion
- **THEN** the resulting state is identical to a fresh run from `B` to completion
- **AND** both runs produce the same `stateHash()`

#### Scenario: malformed snapshot is rejected atomically
- **GIVEN** a harness in some state `X` (nonzero, non-fresh)
- **WHEN** `restore()` is called with a payload that is not a valid
  `ProgressionStateSnapshot` (wrong version, missing field, or malformed nested
  state)
- **THEN** the call throws a descriptive error
- **AND** the harness state is unchanged from `X`

### Requirement: atomic failure and abort
When an action's precondition is violated, the harness MUST abort the scenario
atomically: it MUST throw a typed `ProgressionError` with a stable `code`, MUST
leave progression state unchanged, and MUST NOT advance any stage. Partial work
from the failed action MUST NOT be credited.

#### Scenario: precondition violation aborts without side effects
- **GIVEN** a harness at a point where the script attempts a forbidden action
  (e.g., breaking a `miningLevel >= 1` block with a hand or a wrong-tier tool)
- **WHEN** the action is attempted
- **THEN** a typed error with a stable `code` is thrown
- **AND** survival, experience, inventory, dimension, and advancement state are
  unchanged
- **AND** `isStageComplete(stage)` for every stage remains false unless already
  true before the attempt

### Requirement: per-stage and chain completion reporting
The harness MUST expose `isStageComplete(stage)` and `isChainComplete()`.
`isStageComplete(stage)` MUST be `true` only when the stage's concrete assertion
(defined in the stage specs) holds. `isChainComplete()` MUST be `true` only when
all stages 0-6 are complete.

#### Scenario: partial chain reports incomplete
- **GIVEN** a harness that has completed stages 0-4 but not yet entered the End
- **WHEN** `isStageComplete('end')` and `isChainComplete()` are queried
- **THEN** `isStageComplete('end')` is `false`
- **AND** `isChainComplete()` is `false`

### Requirement: deterministic state hash
The harness MUST compute `stateHash()` deterministically over the serialized
progression state. Identical serialized state MUST yield an identical hash;
hash output MUST be stable across repeated calls for unchanged state.

#### Scenario: hash is stable for unchanged state
- **GIVEN** a harness in a fixed state
- **WHEN** `stateHash()` is called twice without intervening mutation
- **THEN** both calls return the identical string

## Error and failure behavior

- Precondition violations throw a typed error with a stable `code`; the code set
  includes at least: `wrong_tool_for_mining_level`, `not_enough_eyes_of_ender`,
  `invalid_portal_frame`, `portal_teleport_on_cooldown`, `not_fed` (starvation),
  and `budget_exceeded`. The implementing agent MAY add more codes but MUST NOT
  remove these.
- `stepUntil` budget exhaustion returns `false` and does not throw.
- Malformed `restore` input throws and is atomic.
- An already-complete advancement re-triggered is a no-op (returns the same
  object), per `AdvancementFramework.applyAdvancementTrigger`; the harness MUST
  NOT treat this as a failure.

## Performance and resource bounds

- Each scenario MUST run under a bounded `maxSteps` budget (the full chain is a
  fixed script on the order of hundreds of ticks, not tens of thousands).
- `stateHash()` MUST be computed once per completed run, not per tick.
- Flood-fill enclosure checks (shelter stage) MUST be bounded by the fixture's
  bounds.

## Compatibility and migration

The harness round-trips module state only through the modules' existing versioned
snapshot/serialize contracts. It introduces no stored/public data format and
requires no migration.

## Security and integrity

The harness is local test-support infrastructure with no external input surface;
the only untrusted-shaped input is the `restore` payload, which MUST be validated
atomically (never partially accepted) before committing any field.

## Observability

- `stateHash()` provides a single reproducible fingerprint per run.
- Per-stage completion flags plus the ordered advancement `achievedTick` values
  localize a broken link in the chain.
- Typed abort errors carry a stable `code` for automated triage.

## Verification mapping

- `tests/unit/ProgressionHarness.test.ts`: construction/determinism, bounded
  stepping, snapshot/restore round-trip and atomic rejection, atomic abort,
  completion reporting, state-hash stability.
