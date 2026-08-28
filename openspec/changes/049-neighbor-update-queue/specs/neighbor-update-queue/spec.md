# Spec: neighbor-update-queue

## Contract

Immediate block neighbor updates MUST be processed FIFO-ordered, deduplicated by position, bounded per
drain and in total, and safe against handler-recursion cascades. A `NeighborUpdateQueue` MUST enqueue
positions (deduped, capped with a `false` return on overflow), drain at most `maxPerDrain` per call in
FIFO order (including positions enqueued by the handler itself, iteratively), and expose `size`/`has`/
`clear`.

## Definitions

- **Neighbor update**: a pending `(x, y, z)` position whose block change needs notification.
- **maxPerDrain**: positions processed per `drain` call (default 64).
- **maxQueueSize**: pending-position cap; `enqueue` beyond it drops the new entry and returns `false`.

## Invariants

- At most one pending entry per position.
- `drain` processes in FIFO order, at most `maxPerDrain` per call; handler enqueues join the same
  iterative drain (never re-entering `drain`).
- `enqueue` at the cap returns `false` and does not grow the queue.
- `size`/`has` reflect pending state; `clear` empties it.

## Requirements

### Requirement: FIFO processing
`drain` MUST process positions in enqueue order, at most `maxPerDrain` per call.

#### Scenario: order and budget
- **GIVEN** positions `A`, `B`, `C`, `D` enqueued in order with `maxPerDrain = 2`
- **WHEN** `drain` runs twice
- **THEN** the first drain processes `A`, `B` and the second processes `C`, `D`.

### Requirement: position dedupe
Enqueueing an already-pending position MUST NOT create a second entry.

#### Scenario: double enqueue
- **GIVEN** `enqueue(P)` twice
- **WHEN** `drain` runs once
- **THEN** `P` is processed exactly once and `size` is `0`.

### Requirement: handler-enqueue cascade without recursion
Positions enqueued by the handler during a drain MUST be processed in the same drain (up to the
budget), iteratively — never by re-entering `drain`.

#### Scenario: cascade
- **GIVEN** `maxPerDrain = 10`, position `A` enqueued, and a handler that enqueues `B` when processing
  `A` and `C` when processing `B`
- **WHEN** `drain` runs once
- **THEN** `A`, `B`, `C` are all processed in that order within the single call.

### Requirement: overflow protection
`enqueue` at `maxQueueSize` MUST return `false` and MUST NOT grow the queue.

#### Scenario: capped queue
- **GIVEN** `maxQueueSize = 2` and two pending positions
- **WHEN** `enqueue` of a third position runs
- **THEN** it returns `false`, `size` stays `2`, and the third position is not processed by a later
  drain.

### Requirement: state queries and clear
`size`/`has` MUST reflect pending state; `clear` MUST empty the queue.

#### Scenario: queries
- **GIVEN** position `P` enqueued
- **WHEN** `size`, `has(P)`, `clear()`, then `size` are read
- **THEN** the values are `1`, `true`, and `0` respectively.

## Error and failure behavior

- A handler throwing propagates and aborts the drain; already-processed entries stay removed.

## Performance and resource bounds

Enqueue O(1); drain O(processed) bounded by `maxPerDrain`; total pending bounded by `maxQueueSize`.

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Iterative budgeted draining prevents stack overflow and unbounded per-frame work from block cascades.

## Observability

`size`/`has` expose pending work; `drain` returns the processed count.

## Verification mapping

| Requirement | Test |
| --- | --- |
| FIFO processing | order + budget across drains |
| Position dedupe | double enqueue processed once |
| Handler-enqueue cascade without recursion | A→B→C processed in one drain |
| Overflow protection | cap: false return, size stable |
| State queries and clear | size/has/clear |
