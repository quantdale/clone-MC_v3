# Spec: item-sorter-chain

## Contract

The item-pipeline circuit of change 243. A canonical **item-sorter-like hopper
chain** is a hopper→hopper→chest (or hopper→dropper) pipeline, timed by 047
scheduled ticks: a hopper transfer is due exactly `HOPPER_TRANSFER_COOLDOWN_TICKS`
(8) after its last attempt and moves exactly one item via `transferOneItem`; a
dropper ejection is due exactly `DROPPER_EJECT_COOLDOWN_TICKS` (8) later and moves
one item via `ejectFromDropper` (a `drop` when facing air, a `container` push
otherwise). The contract under test is that exact per-stage item counts, the
pending scheduled transfer ticks, and in-flight (queued-but-not-yet-fired)
transfers all survive full save→reload and single-chunk unload→reload with no item
loss or duplication.

## Definitions

- **Stage**: one container in the chain (hopper source, intermediate hopper,
  dropper, or chest), whose inventory is a `MenuSlot[]`.
- **Stage count**: the total number of a given item across a stage's `MenuSlot[]`
  (the sum of `count` for matching `item`).
- **Pending transfer**: a scheduled 047 entry for a hopper/dropper/dispenser
  position that has not yet fired.
- **No-loss/no-duplication**: the multiset of items across all stages before and
  after a round-trip (and the items moved by a pending transfer when it fires)
  is identical.

## Invariants

- A transfer attempt moves at most one item unit; a full destination yields
  `moved: false` and never partially depletes the source.
- The total item multiset across the chain is conserved across every step and
  every round-trip.
- Every timing assertion checks both the not-due and due tick.
- Pending transfer ticks MUST be preserved at their absolute value across a
  round-trip; a pending transfer MUST fire exactly once when due.

## Requirements

### Requirement: one-item cadence
A hopper transfer scheduled at tick `T` MUST be due at tick `T + 8` (not `T + 7`)
and MUST move exactly one item. A dropper ejection scheduled at tick `T` MUST be
due at tick `T + 8` and MUST move exactly one item (a `drop` when facing air).

#### Scenario: hopper→dropper pipeline cadence
- **GIVEN** a chain with a hopper holding 5 stone and a dropper holding 4 stone
  facing air, with the hopper transfer scheduled at tick `0`
- **WHEN** the harness steps from tick `0` through the transfer and then the
  dropper ejection
- **THEN** the hopper transfer is not due at tick `7`, is due and moves exactly one
  item at tick `8`
- **AND** the dropper ejection is due at tick `16` and produces exactly one `drop`

#### Scenario: full destination does not spill
- **GIVEN** a hopper facing a chest whose slots are all full
- **WHEN** the hopper transfer is due and processed
- **THEN** the transfer reports `moved: false`
- **AND** the source hopper count is unchanged (no partial depletion, no spill)

### Requirement: item counts survive save→reload
A full `saveReload()` at any point MUST preserve the exact per-stage `MenuSlot[]`
counts across the chain. A pending transfer that was due to fire later MUST still
fire at its original absolute tick and move exactly one item (not zero, not two).

#### Scenario: counts and a pending transfer survive save→reload
- **GIVEN** a chain with the hopper holding 5 stone, one item already moved to the
  dropper (dropper holding 1), and a transfer pending at tick `16`
- **WHEN** `saveReload()` runs at tick `8`, then the harness steps to tick `16`
- **THEN** immediately after `saveReload()` the hopper still holds 5 and the
  dropper still holds 1
- **AND** at tick `16` exactly one item moves (not zero, not two)
- **AND** the total item multiset across the chain is unchanged from a run without
  `saveReload()`

### Requirement: item counts survive single-chunk unload→reload
A `cycleChunk` over the chunk(s) containing the chain MUST preserve the per-stage
counts and any pending transfer, and the transfer MUST fire exactly once at its
original absolute tick.

#### Scenario: counts and a pending transfer survive chunk cycle
- **GIVEN** a chain in chunk `(cx, cz)` with the hopper holding 5 stone, the
  dropper holding 1, and a transfer pending at tick `16`
- **WHEN** `cycleChunk(cx, cz)` runs at tick `8`, then the harness steps to tick
  `16`
- **THEN** immediately after the cycle the hopper holds 5 and the dropper holds 1
- **AND** at tick `16` exactly one item moves
- **AND** no item is lost or duplicated across the cycle

### Requirement: multi-item run conserves the item multiset
Over a run of many scheduled transfers, the multiset of items across all stages
MUST be conserved at every observation point (a strict no-loss/no-duplication
contract).

#### Scenario: long-run conservation
- **GIVEN** a chain with an initial total of `M` items across all stages
- **WHEN** the harness steps through a run of transfers that moves `k` items and
  includes a `saveReload()` and a `cycleChunk` at two chosen points
- **THEN** the sum of all stage counts plus any in-flight pending-transfer items
  equals `M` at every observation point
- **AND** no stage count goes negative

## Error and failure behavior

- A round-trip that drops a pending transfer (so it never fires) or duplicates it
  (so it fires twice) is a failure caught by the exact once-at-absolute-tick
  assertions.
- A transfer into a full destination that partially depletes the source is a
  failure (`moved: false` with an untouched source is required).
- A negative stage count is a failure.

## Performance and resource bounds

- Each item-sorter scenario runs under a bounded `maxSteps` budget (a few hundred
  ticks); no unbounded stepping.

## Compatibility and migration

Test-only; the circuit uses the real 166/167/168 modules, the `MenuSlot[]` shape,
and the 047 queue. The block-entity payload (hopper/dropper/dispenser inventories)
round-trips via the 036 envelope in the harness. No stored format changes; no
migration.

## Security and integrity

No external input surface beyond the round-trip payloads handled by the
`automation-harness` spec's atomic-rejection contract; the item multiset
conservation is the integrity invariant under test.

## Observability

- Per-stage counts and the exact pending-transfer tick localize whether a failure
  is a loss, a duplication, a timing shift, or a partial-depletion bug.

## Verification mapping

- `tests/unit/RedstoneAutomationCircuits.test.ts`: `hopper→dropper one-item
  cadence`, `full destination no-spill`, `counts + pending transfer survive
  save→reload`, `counts + pending transfer survive chunk cycle`, `multi-item
  conservation`.
