# Proposal: 031-chunk-ticket-model

## Problem

030 gives an explicit per-column generation `status`, but nothing models *why* a column is kept around — the
load/tick pressure that keeps it resident and simulating. Without a ticket model, loading/ticking decisions are
implicit and ad hoc, and later streaming/simulation changes (032 render-vs-simulation distance, 033 vertical
streaming) cannot reason about which chunks must stay loaded or ticking.

## Goals

- Define typed **chunk ticket reasons** (`ChunkTicketType`) with a default hold level per reason.
- Define a **chunk ticket level** scale with load/tick thresholds and pure predicates (`isTickingLevel`,
  `isLoadedLevel`).
- Provide a `ChunkTicket` value type and a `ChunkTicketManager` that aggregates tickets per chunk coordinate into
  an effective level (most-important ticket wins; no ticket ⇒ fully unloaded).

## Non-goals

- No actual loading/streaming/unloading behavior — that is 032/033. This change only models tickets and their
  effective level per chunk.
- No persistence of tickets (runtime coordination state, not world data).
- No coupling to `ChunkColumn.status` (030); tickets answer "keep loaded/ticking?", status answers "how generated?".

## Preconditions

030 is VERIFIED. No new upstream dependency beyond 030's `ChunkStatus` context (kept independent).

## Dependencies

- New `src/world/ChunkTicket.ts` (types + manager).

## Proposed change

- `src/world/ChunkTicket.ts`:
  - `ChunkTicketType` const enum (reasons: `Unknown`, `Player`, `Portal`, `Light`, `Generation`, `Migration`,
    `Structure`).
  - `CHUNK_TICKET_DEFAULT_LEVEL: Record<ChunkTicketType, number>` mapping each reason to its hold level.
  - Level thresholds `TICKING_LEVEL = 31`, `LOADED_LEVEL = 33`, `MAX_TICKET_LEVEL = 44` (lower number = higher
    priority; matches Minecraft's level semantics).
  - `ChunkTicket` interface + `createChunkTicket(type, level?)`.
  - `isTickingLevel(level)`, `isLoadedLevel(level)`, `isHigherPriority(a, b)`.
  - `ChunkTicketManager`: `addTicket(cx, cz, ticket)`, `removeTicket(cx, cz, ticket)`, `getLevel(cx, cz)` (min
    level among tickets, else `MAX_TICKET_LEVEL`), `isLoaded(cx, cz)`, `isTicking(cx, cz)`, `getTickets(cx, cz)`,
    `chunks()`, `clear()`.

## Compatibility and migration

Additive; no persisted-format or call-site changes. Pure runtime coordination model.

## Risks

- Confusing ticket level with generation `status`. Mitigated by keeping the two orthogonal and documenting it.
- Mutable ticket list per chunk. Mitigated by keying on `cx,cz` and replacing/deleting entries cleanly; manager is
  the single owner of ticket state.

## Rollback strategy

Additive types/class; reverting removes them with no downstream impact (032 not yet implemented).

## Definition of Done

`ChunkTicketType` + defaults + level predicates behave; `ChunkTicketManager` aggregates tickets to an effective
level where the most important ticket wins and no ticket means unloaded; tests cover defaults, predicates, multi-ticket
aggregation, removal, and independence; full regression gate is green.

## Advancement gate

032 starts only after 031 is 100% complete and VERIFIED.
