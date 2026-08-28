# Spec: clock-and-divider

## Contract

The clock and pulse-divider circuits of change 243. A canonical **clock** is a
torch-and-repeater oscillator whose output produces a rising edge exactly every
`CLOCK_PERIOD_TICKS` ticks, with `CLOCK_PERIOD_TICKS = 16` for the canonical
topology (loop delay 8 ticks × two inversions), chosen so the torch never exceeds
`BURNOUT_TOGGLE_LIMIT` toggles within `BURNOUT_WINDOW_TICKS`. A canonical **pulse
divider** divides that edge stream: a divide-by-`N` divider emits an output rising
edge every `N × CLOCK_PERIOD_TICKS`, with the first output edge exactly
`N × CLOCK_PERIOD_TICKS` after the first input edge. The contract under test is
that the clock period, the divider ratio, and each circuit's phase survive full
save→reload and single-chunk unload→reload with absolute-tick preservation.

## Definitions

- **Rising edge**: the tick at which a circuit's probe output transitions from
  unpowered (0) to powered (>0).
- **Period**: the number of ticks between consecutive rising edges of an
  oscillator output.
- **Phase**: the position of a circuit's output within its period (e.g. the
  clock's current sub-cycle, or a divider's on/off half/quarter), which a
  round-trip must preserve.
- **Absolute-tick preservation**: a scheduled event due at tick `T` before an
  operation fires at tick `T` after it, never at `T ± k`.

## Invariants

- The clock MUST NOT exceed `BURNOUT_TOGGLE_LIMIT` toggles within
  `BURNOUT_WINDOW_TICKS`, so it never burns out mid-run.
- Every timing assertion checks both the not-due tick and the due tick.
- A round-trip MUST preserve the clock's absolute edge schedule and the divider's
  output phase.

## Requirements

### Requirement: clock period
The canonical clock MUST produce a rising edge exactly every `CLOCK_PERIOD_TICKS`
ticks, with `CLOCK_PERIOD_TICKS === 16`. Consecutive rising edges MUST occur at
ticks `0, 16, 32, ...` with no edge at any tick strictly between consecutive
multiples. The clock's torch MUST remain lit-oscillating without burning out over
at least `4 × CLOCK_PERIOD_TICKS` ticks.

#### Scenario: periodic rising edges
- **GIVEN** a built clock with its output probed from tick 0
- **WHEN** the harness steps for `4 × CLOCK_PERIOD_TICKS` ticks
- **THEN** rising edges are observed at ticks `0`, `16`, `32`, and `48`
- **AND** no rising edge is observed at tick `8` (mid-period)
- **AND** the clock's torch is not burnt out at tick `48`

#### Scenario: not-due and due ticks
- **GIVEN** a clock with the next edge expected at tick `16`
- **WHEN** the harness steps to tick `15` and then to tick `16`
- **THEN** no edge fires at tick `15`
- **AND** exactly one edge fires at tick `16`

### Requirement: clock survives save→reload with phase
After a full `saveReload()` mid-cycle, the clock MUST resume so that the next
rising edge fires at the same absolute tick it would have fired at without the
round-trip; the edge schedule MUST NOT be re-anchored relative to the current
tick.

#### Scenario: mid-cycle save→reload preserves the next edge
- **GIVEN** a clock whose next rising edge is due at absolute tick `16`, currently
  stepped to tick `8` (mid-cycle)
- **WHEN** `saveReload()` runs at tick `8`, then the harness steps forward
- **THEN** the next rising edge fires at tick `16`
- **AND** after the edge, the observed period continues at `16` (edges at `32`,
  `48`, ...)

#### Scenario: save→reload does not reset the phase to zero
- **GIVEN** the same clock mid-cycle at tick `8`
- **WHEN** `saveReload()` runs and the next `16` ticks are stepped
- **THEN** the edge count observed over the window matches a run without
  `saveReload()` (no spurious edge, no dropped edge)

### Requirement: clock survives single-chunk unload→reload
When the chunk containing the clock (or its timing loop) is cycled mid-cycle, the
clock MUST resume with the next edge at its original absolute tick and must not
burn out from the cycle.

#### Scenario: mid-cycle chunk cycle preserves the next edge
- **GIVEN** a clock in chunk `(cx, cz)` whose next edge is due at tick `16`,
  currently at tick `8`
- **WHEN** `cycleChunk(cx, cz)` runs at tick `8`, then the harness steps forward
- **THEN** the next rising edge fires at tick `16`
- **AND** the clock's stored wire powers and torch lit flags at tick `16` match a
  run without the cycle

### Requirement: pulse divider ratio
A divide-by-`N` pulse divider driven by the clock MUST emit an output rising edge
every `N × CLOCK_PERIOD_TICKS`, with the first output edge exactly
`N × CLOCK_PERIOD_TICKS` after the first input edge. The contract MUST be verified
for `N = 2` and `N = 4`.

#### Scenario: divide-by-2 output edges
- **GIVEN** a built ÷2 divider whose first input edge arrives at tick `0`
- **WHEN** the harness steps for `4 × CLOCK_PERIOD_TICKS` ticks
- **THEN** output rising edges are observed at ticks `32` and `64` (every
  `2 × 16` ticks)
- **AND** no output edge is observed at tick `16`

#### Scenario: divide-by-4 output edges
- **GIVEN** a built ÷4 divider whose first input edge arrives at tick `0`
- **WHEN** the harness steps for `8 × CLOCK_PERIOD_TICKS` ticks
- **THEN** output rising edges are observed at ticks `64` and `128` (every
  `4 × 16` ticks)
- **AND** no output edge is observed at tick `32` or `48`

### Requirement: divider survives round-trips with phase
A full `saveReload()` or single-chunk `cycleChunk` mid-divider-cycle MUST preserve
the divider's output phase and its next output edge at the original absolute tick.

#### Scenario: divider phase preserved across save→reload
- **GIVEN** a ÷2 divider mid-cycle with its next output edge due at tick `32`,
  currently at tick `24`
- **WHEN** `saveReload()` runs at tick `24`, then the harness steps forward
- **THEN** the next output edge fires at tick `32`
- **AND** the divider's output state (on/off half) at tick `24` after the
  round-trip matches the pre-round-trip state

#### Scenario: divider phase preserved across chunk cycle
- **GIVEN** the same ÷2 divider mid-cycle in chunk `(cx, cz)` with its next output
  edge due at tick `32`
- **WHEN** `cycleChunk(cx, cz)` runs at tick `24`, then the harness steps forward
- **THEN** the next output edge fires at tick `32`

## Error and failure behavior

- A cycle or save→reload that would drop or re-anchor a scheduled edge MUST be
  detected as a mismatch against the expected absolute-tick schedule and fail the
  test; it is never silently accepted.
- The clock MUST NOT burn out during the observed run; a burnt-out clock (which
  would stall the edges) is a failure.

## Performance and resource bounds

- Each clock/divider scenario runs under a bounded `maxSteps` budget on the order
  of `8 × CLOCK_PERIOD_TICKS` ticks (a few hundred ticks); no scenario runs
  unboundedly.

## Compatibility and migration

Test-only; the circuits use the real 158/159/160/161/162 modules and the 047 queue.
No stored format changes; no migration.

## Security and integrity

No external input surface beyond the round-trip payloads handled by the
`automation-harness` spec's atomic-rejection contract.

## Observability

- Probed rising-edge ticks and the not-due/due assertions localize whether the
  clock period, divider ratio, or phase broke.
- A burnt-out torch is observable as a stalled edge schedule.

## Verification mapping

- `tests/unit/RedstoneAutomationCircuits.test.ts`: `clock period`, `clock
  save→reload phase`, `clock chunk-cycle phase`, `divider ÷2`, `divider ÷4`,
  `divider save→reload phase`, `divider chunk-cycle phase`.
