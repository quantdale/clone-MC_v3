# Spec: chunk-ticket-model

## Contract

`chunk-ticket-model` adds a typed chunk-ticket model answering *why* a chunk column is kept resident and simulating.
A ticket is a `(type, level)` pair: `type` is the reason (player, portal, light, generation, migration, structure,
unknown) and `level` is how strongly the chunk is held (lower = more loaded/ticking). `ChunkTicketManager` aggregates
tickets per chunk coordinate into an effective level — the most-important (lowest-level) ticket wins; a chunk with no
tickets is fully unloaded. It is independent of `ChunkColumn.status` (030) and not persisted.

## Definitions

- **ChunkTicketType**: finite set of reasons a chunk is kept loaded/ticking.
- **ChunkTicketLevel**: a number in `[0, MAX_TICKET_LEVEL]`; lower is higher priority. `TICKING_LEVEL = 31` and
  `LOADED_LEVEL = 33` delimit behavior.
- **Effective level** of a chunk: `min(ticket.level)` over its tickets, or `MAX_TICKET_LEVEL` when it has none.

## Invariants

- Every `ChunkTicketType` has a default hold level in `CHUNK_TICKET_DEFAULT_LEVEL`.
- `getLevel(cx, cz)` MUST equal `min(level)` over that chunk's tickets, or `MAX_TICKET_LEVEL` when there are none.
- `isTickingLevel(level)` MUST equal `level <= TICKING_LEVEL`; `isLoadedLevel(level)` MUST equal `level <= LOADED_LEVEL`.
- `isHigherPriority(a, b)` MUST equal `a.level < b.level` (lower level wins).
- Tickets are independent per chunk coordinate.

## Requirements

### Requirement: ticket types have default hold levels and level predicates classify them
Each `ChunkTicketType` MUST map to a default level; `isTickingLevel`/`isLoadedLevel` MUST classify by the thresholds.

#### Scenario: default levels are present and ordered by intent
- **GIVEN** the ticket types
- **THEN** `createChunkTicket(Player).level` equals `31` and `createChunkTicket(Unknown).level` equals `44`

#### Scenario: level predicates respect thresholds
- **GIVEN** levels `31`, `32`, `33`, `34`
- **THEN** `isTickingLevel(31)` is `true` and `isTickingLevel(32)` is `false`
- **AND** `isLoadedLevel(33)` is `true` and `isLoadedLevel(34)` is `false`

### Requirement: a ticket can be created with an explicit override
`createChunkTicket(type, level)` MUST use `level` when provided, else the default.

#### Scenario: explicit level overrides default
- **GIVEN** `createChunkTicket(Player, 10)`
- **THEN** its `level` is `10`

### Requirement: the manager aggregates tickets to an effective level per chunk
`ChunkTicketManager` MUST reduce a chunk's tickets to the minimum level (highest priority) and treat no tickets as
fully unloaded.

#### Scenario: a single ticket sets the level
- **GIVEN** a manager with `addTicket(0, 0, createChunkTicket(Player))`
- **THEN** `getLevel(0, 0)` is `31`, `isTicking(0, 0)` is `true`, `isLoaded(0, 0)` is `true`

#### Scenario: most-important ticket wins
- **GIVEN** `addTicket(0, 0, createChunkTicket(Player))` (31) then `addTicket(0, 0, createChunkTicket(Light))` (33)
- **THEN** `getLevel(0, 0)` is `31` (the lower level wins)

#### Scenario: no tickets means unloaded
- **GIVEN** a manager with no tickets at `(5,5)`
- **THEN** `getLevel(5, 5)` is `MAX_TICKET_LEVEL`, `isLoaded(5, 5)` is `false`, `isTicking(5, 5)` is `false`

### Requirement: removing tickets recomputes and respects per-chunk independence
`removeTicket` MUST drop a ticket; removing the last returns the chunk to unloaded. Coordinates MUST stay independent.

#### Scenario: remove the only ticket
- **GIVEN** a manager with `addTicket(0, 0, createChunkTicket(Player))` then `removeTicket(0, 0, createChunkTicket(Player))`
- **THEN** `getLevel(0, 0)` is `MAX_TICKET_LEVEL` and `isTicking(0, 0)` is `false`

#### Scenario: removing an absent ticket is a no-op
- **GIVEN** a manager with a player ticket at `(0,0)` and no ticket at `(1,1)`
- **WHEN** `removeTicket(1, 1, createChunkTicket(Player))` is called
- **THEN** `getLevel(0, 0)` is unchanged (`31`) and no error is thrown

#### Scenario: coordinates are independent
- **GIVEN** a player ticket at `(0,0)` and a light ticket at `(2,2)`
- **THEN** `getLevel(0, 0)` is `31` and `getLevel(2, 2)` is `33`

## Error and failure behavior

- `removeTicket` for a missing ticket is a no-op (no throw).
- Querying a never-seen coordinate yields `MAX_TICKET_LEVEL` (unloaded) for `getLevel` and `false` for `isLoaded`/`isTicking`.

## Performance and resource bounds

O(T) per coordinate for level computation (T = tickets there, typically tiny); `Map` keyed by `cx,cz`. No allocation
on read beyond the returned value/array.

## Compatibility and migration

Additive; no persisted or call-site changes. Tickets are runtime coordination state.

## Security and integrity

No external input; tickets are local coordination state.

## Observability

`getLevel`/`isLoaded`/`isTicking`/`getTickets`/`chunks` give streaming/simulation code a clear view of hold pressure.

## Verification mapping

- All scenarios → `tests/unit/ChunkTicket.test.ts`
- Full gate → typecheck, lint, unit, build, e2e
