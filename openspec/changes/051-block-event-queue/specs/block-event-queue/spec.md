# Spec: block-event-queue

## Contract

Local block events MUST be queued and delivered deterministically: FIFO order, deduplicated per
`(position, eventId)` with newest-param-wins, bounded per drain and in total. A `BlockEventQueue`
MUST accept `add(x, y, z, blockId, eventId, param)` (returning `false` at the cap), deliver at most
`maxPerDrain` events per `drain`, and expose `size`/`clear`.

## Definitions

- **BlockEvent**: `{ x, y, z, blockId, eventId, param }`.
- **Event key**: `(position, eventId)`; at most one pending event per key.

## Invariants

- Re-adding a pending key updates `param` (and `blockId`) in place, keeping its FIFO position.
- Different `eventId`s at one position are independent entries.
- `drain` delivers in FIFO order, at most `maxPerDrain` per call.
- `add` at `maxQueueSize` returns `false` and does not grow the queue.
- `size`/`clear` reflect pending events.

## Requirements

### Requirement: FIFO delivery
`drain` MUST deliver events in add order, at most `maxPerDrain` per call.

#### Scenario: order and budget
- **GIVEN** four events added in order with `maxPerDrain = 2`
- **WHEN** `drain` runs twice
- **THEN** the first drain delivers the first two and the second delivers the last two.

### Requirement: per-key dedupe with newest-param-wins
Re-adding a pending `(position, eventId)` MUST update `param` in place and MUST NOT create a second
delivery.

#### Scenario: param update
- **GIVEN** `add(P, id, 1)` then `add(P, id, 9)` (same position and eventId)
- **WHEN** `drain` runs
- **THEN** exactly one event is delivered with `param = 9`.

### Requirement: eventId coexistence
Different `eventId`s at the same position MUST be delivered as separate events.

#### Scenario: two events at one position
- **GIVEN** `add(P, 1, 10)` and `add(P, 2, 20)`
- **WHEN** `drain` runs
- **THEN** two events are delivered, one with `eventId = 1`/`param = 10` and one with
  `eventId = 2`/`param = 20`.

### Requirement: overflow protection
`add` at `maxQueueSize` MUST return `false` and MUST NOT grow the queue.

#### Scenario: capped queue
- **GIVEN** `maxQueueSize = 2` with two pending events
- **WHEN** a third `add` runs
- **THEN** it returns `false`, `size` stays `2`, and the third event is never delivered.

### Requirement: state queries and clear
`size` MUST reflect pending events; `clear` MUST empty the queue.

#### Scenario: queries
- **GIVEN** one event added
- **WHEN** `size`, `clear()`, then `size` are read
- **THEN** the values are `1` and `0`.

## Error and failure behavior

- A handler throwing propagates and aborts the drain; already-delivered events stay removed.

## Performance and resource bounds

`add` O(1); `drain` O(processed) bounded by `maxPerDrain`; total bounded by `maxQueueSize`.

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Bounded delivery prevents unbounded per-frame event work; dedupe prevents duplicate processing.

## Observability

`size` exposes pending events; `drain` returns the delivered count.

## Verification mapping

| Requirement | Test |
| --- | --- |
| FIFO delivery | order + budget across drains |
| Per-key dedupe with newest-param-wins | single delivery with updated param |
| EventId coexistence | two eventIds at one position |
| Overflow protection | cap: false return, size stable, never delivered |
| State queries and clear | size/clear |
