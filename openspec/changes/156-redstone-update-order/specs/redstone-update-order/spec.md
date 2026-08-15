# Spec: redstone-update-order

## Contract
This capability adds deterministic, bounded, loop-protected propagation of wire power: a
`RedstonePropagator` composing 049's `NeighborUpdateQueue` with 155's local `computeWirePower` rule,
iterating to a fixed point. No `Game`/`World` wiring, no `BlockBehavior`, no components, no delayed
ticks, no chunk awareness — see the proposal's Non-goals.

## Definitions
- **Dirty**: a position queued for recomputation.
- **Settled**: a state in which recomputing every wire yields its stored value (no writes).
- **Fixed point**: the settled state a `propagate`/`settle` pass converges to.
- **hitLimit**: for `propagate`, a pass stopped by `maxUpdates` with work still queued; for
  `settle`, simply **did not converge** (work remains after all rounds). An intermediate round
  hitting `maxUpdates` is normal chunking and does not by itself make `settle` report `hitLimit`.

## Invariants
- A wire's power is written only when the recomputed value differs from the stored one.
- Neighbours are enqueued only when the recomputing wire's own value changed.
- Recomputations in one `propagate` never exceed `maxUpdates`; on trip, `hitLimit` is `true` and
  the remainder stays queued.
- Identical inputs and identical initial dirty sets yield identical final power maps and identical
  result counts.
- Propagation never recurses.
- Non-wire positions are never written to the store.

## Requirements

### Requirement: a signal propagates along a wire run with attenuation
`propagate`/`settle` MUST drive each wire in a connected run to the value 155's local rule
prescribes, so power falls by one per block from the source.

#### Scenario: a straight run attenuates from the source
- **GIVEN** a straight line of wires with a source supplying external power 15 at the first cell
- **WHEN** `settle` runs
- **THEN** successive wires hold 15, 14, 13, … in order

#### Scenario: the signal stops at zero
- **GIVEN** a run longer than 15 wires from a single power-15 source
- **WHEN** `settle` runs
- **THEN** every wire beyond the 15th holds `MIN_SIGNAL_STRENGTH`

### Requirement: removing a source drains the run back to zero
When the external power disappears, a subsequent `settle` MUST return every wire in the run to
`MIN_SIGNAL_STRENGTH`.

#### Scenario: a powered run drains after the source is removed
- **GIVEN** a settled, powered wire run
- **WHEN** the source stops emitting, the run's cells are marked dirty, and `settle` runs
- **THEN** every wire holds `MIN_SIGNAL_STRENGTH`

### Requirement: propagation terminates on a wire ring
A closed loop of wires MUST settle without exhausting `maxUpdates`.

#### Scenario: a wire ring settles
- **GIVEN** a closed rectangular ring of wires with one powered cell
- **WHEN** `settle` runs
- **THEN** it completes with `hitLimit` false and every wire holds a value in the signal domain

### Requirement: propagation is deterministic
Two independently-constructed propagators over identical inputs and identical initial dirty sets
MUST produce identical final power maps and identical result counts.

#### Scenario: two independent runs agree
- **GIVEN** the same circuit fixture built twice
- **WHEN** each is settled
- **THEN** both final power maps are equal and both `visited`/`changed` counts match

### Requirement: an already-settled circuit produces no writes
Re-settling a settled circuit MUST report `changed: 0` and perform no store writes.

#### Scenario: re-settling is idempotent
- **GIVEN** a settled circuit
- **WHEN** every cell is marked dirty and `settle` runs again
- **THEN** `changed` is `0` and the store recorded no writes

### Requirement: exceeding maxUpdates is reported, not silently dropped
When a pass reaches `maxUpdates`, `propagate` MUST return `hitLimit: true` and leave the
unprocessed remainder queued.

#### Scenario: a tight update bound trips and preserves the backlog
- **GIVEN** a propagator with a very small `maxUpdates` and a long dirty run
- **WHEN** `propagate` runs once
- **THEN** it returns `hitLimit: true` and `pendingCount` is greater than zero

### Requirement: settle converges across rounds despite a tight per-pass bound
`settle` MUST keep running `propagate` rounds until the queue empties or `maxSettleRounds` trips,
and MUST report `hitLimit: false` whenever it converged — even if individual rounds hit their own
`maxUpdates` bound along the way.

#### Scenario: a tight per-pass bound still converges over multiple rounds
- **GIVEN** a long wire run and a propagator whose `maxUpdates` is far smaller than the work
  required, but with ample `maxSettleRounds`
- **WHEN** `settle` runs
- **THEN** it reports `hitLimit: false`, `pendingCount` is `0`, and the run holds its fully
  attenuated values

### Requirement: non-wire positions are examined but never written
`propagate` MUST count a non-wire position as visited and MUST NOT write power for it.

#### Scenario: a dirty non-wire position writes nothing
- **GIVEN** a dirty position that is not a wire
- **WHEN** `propagate` runs
- **THEN** `visited` is at least 1, `changed` is 0, and the store recorded no writes

### Requirement: markNeighborsDirty enqueues the surrounding cells
`markNeighborsDirty` MUST enqueue the six axis neighbours of the given position.

#### Scenario: the six neighbours become pending
- **GIVEN** an empty propagator
- **WHEN** `markNeighborsDirty` is called for a position
- **THEN** `pendingCount` is `6`

## Error and failure behavior
- No method throws for well-formed inputs. Store/world callbacks that throw propagate unmodified.
- Bound exhaustion is reported via `hitLimit`, never thrown.

## Performance and resource bounds
- At most `maxUpdates` recomputations per `propagate`, each at 155's constant cost. No recursion.

## Compatibility and migration
- One new, additive file; 049 is composed, not modified; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied coordinates and injected interfaces; power values flow through
  154's clamping.

## Observability
- `PropagationResult` (`visited`/`changed`/`hitLimit`) and `pendingCount`.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 run attenuation | `tests/unit/RedstonePropagation.test.ts` straight-run cases |
| REQ-2 drain on source removal | drain case |
| REQ-3 ring termination | ring case |
| REQ-4 determinism | two-independent-runs case |
| REQ-5 settled idempotence | re-settle case |
| REQ-6 hitLimit reporting | bounded-pass case |
| REQ-7 settle converges across rounds | multi-round convergence case |
| REQ-8 non-wire positions | non-wire case |
| REQ-9 markNeighborsDirty | neighbours case |
