# Spec: t-flip-flop

## Contract

The latching toggle circuit of change 243. A canonical **T-flip-flop** has a probe
output and an input edge stream: each input edge toggles the output, so after an
even number of edges the output is off and after an odd number it is on. Between
input edges the output MUST be stable (it must not self-oscillate). The contract
under test is that the latched output state survives full save→reload and
single-chunk unload→reload, and that a cycle preserves the latch so the next input
edge toggles it correctly rather than resetting it.

## Definitions

- **Input edge**: a rising transition on the circuit's input probe.
- **Output on/off**: the boolean powered state of the circuit's output probe.
- **Latched state**: the output's powered state that persists across input-edge
  gaps; a round-trip must preserve it.
- **Toggle correctness**: each input edge flips the output exactly once; two
  consecutive edges return the output to its prior state.

## Invariants

- The output MUST change only in response to an input edge; it MUST NOT change
  spontaneously between edges.
- The latched output MUST be preserved losslessly across save→reload and chunk
  cycling.
- Every timing assertion checks both the not-due and due tick.

## Requirements

### Requirement: toggle behavior
Each input edge MUST toggle the output exactly once. Starting from an off output,
the 1st edge MUST turn it on, the 2nd edge off, the 3rd on, and so on. After an
even number of edges the output MUST be off; after an odd number it MUST be on.

#### Scenario: alternating toggles
- **GIVEN** a built T-flip-flop with its output off
- **WHEN** four input edges are applied over successive ticks
- **THEN** the output is on after the 1st edge, off after the 2nd, on after the
  3rd, and off after the 4th
- **AND** the output after the 4th edge is off (even edge count)

#### Scenario: output is stable with no input
- **GIVEN** a T-flip-flop with its output on (odd edge count reached)
- **WHEN** the harness steps for `8 × CLOCK_PERIOD_TICKS` ticks with no further
  input edges
- **THEN** the output remains on throughout
- **AND** the output does not self-oscillate (no spurious toggles)

### Requirement: latch survives save→reload
A full `saveReload()` while the output is latched on (odd edge count) MUST
preserve the output on. After the round-trip, the next input edge MUST toggle the
output off (not reset it and not leave it double-toggled).

#### Scenario: latched-on output preserved across save→reload
- **GIVEN** a T-flip-flop with its output latched on and the harness at tick `t0`
- **WHEN** `saveReload()` runs at `t0`, then a further input edge is applied
- **THEN** immediately after `saveReload()` the output is still on
- **AND** after the further edge the output is off (one toggle, not reset)

#### Scenario: latched-off output preserved across save→reload
- **GIVEN** a T-flip-flop with its output latched off and the harness at tick `t0`
- **WHEN** `saveReload()` runs at `t0`, then a further input edge is applied
- **THEN** immediately after `saveReload()` the output is still off
- **AND** after the further edge the output is on (one toggle)

### Requirement: latch survives single-chunk unload→reload
A `cycleChunk` over the chunk containing the T-flip-flop's latch MUST preserve the
latched output and its block states; the next input edge MUST toggle it correctly.

#### Scenario: chunk cycle preserves a latched-on flip-flop
- **GIVEN** a T-flip-flop in chunk `(cx, cz)` with its output latched on
- **WHEN** `cycleChunk(cx, cz)` runs, then a further input edge is applied
- **THEN** the output is on immediately after the cycle
- **AND** after the further edge the output is off
- **AND** the flip-flop's stored block states at the latch position match the
  pre-cycle states

## Error and failure behavior

- A round-trip that resets the latch (output flips back) or double-toggles on the
  next edge is a failure and MUST be caught by the not-due/due assertions.
- A latch that self-oscillates between edges (output changes with no input) is a
  failure.

## Performance and resource bounds

- Each T-flip-flop scenario runs under a bounded `maxSteps` budget on the order of
  `8 × CLOCK_PERIOD_TICKS` ticks; no unbounded stepping.

## Compatibility and migration

Test-only; the circuit uses the real 158/159 modules and the 047 queue. No stored
format changes; no migration.

## Security and integrity

No external input surface beyond the round-trip payloads handled by the
`automation-harness` spec's atomic-rejection contract.

## Observability

- The output probe read after each edge and the stability window localize whether
  a failure is a wrong toggle count, a reset latch, or self-oscillation.

## Verification mapping

- `tests/unit/RedstoneAutomationCircuits.test.ts`: `t-flip-flop alternating
  toggles`, `t-flip-flop stable with no input`, `t-flip-flop latch survives
  save→reload (on)`, `t-flip-flop latch survives save→reload (off)`, `t-flip-flop
  latch survives chunk cycle`.
