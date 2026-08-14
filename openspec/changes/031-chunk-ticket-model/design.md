# Design: 031-chunk-ticket-model

## Context / current state

030 `ChunkColumn` carries a generation `status` (Empty..Full). There is no concept of *load/tick pressure*: what is
keeping a column resident and simulating. Streaming (033) and render-vs-simulation distance (032) need a first-class
notion of tickets — typed reasons a chunk must stay loaded or ticking, each holding the chunk at a level.

## Target state

A `ChunkTicket` model (reason + level) and a `ChunkTicketManager` that, per chunk coordinate, reduces the current
tickets to an effective level: the minimum level among them (most important wins), or `MAX_TICKET_LEVEL` when there
are no tickets (fully unloaded). Level thresholds expose `isLoadedLevel`/`isTickingLevel`.

## Invariants

- `ChunkTicketType` is a finite set of reasons; each has a default hold level in `CHUNK_TICKET_DEFAULT_LEVEL`.
- Lower level = higher priority. `getLevel(cx, cz)` MUST equal `min(ticket.level)` over tickets at that chunk, or
  `MAX_TICKET_LEVEL` when none.
- `isTickingLevel(level)` MUST equal `level <= TICKING_LEVEL`; `isLoadedLevel(level)` MUST equal `level <= LOADED_LEVEL`.
- `isHigherPriority(a, b)` MUST equal `a.level < b.level`.
- Tickets are independent per chunk coordinate; adding/removing at one coordinate MUST NOT affect another.

## API and data model

```ts
export const enum ChunkTicketType { Unknown, Player, Portal, Light, Generation, Migration, Structure }
export const CHUNK_TICKET_DEFAULT_LEVEL: Record<ChunkTicketType, number>;
export const TICKING_LEVEL = 31;
export const LOADED_LEVEL = 33;
export const MAX_TICKET_LEVEL = 44;
export interface ChunkTicket { type: ChunkTicketType; level: number }
export function createChunkTicket(type: ChunkTicketType, level?: number): ChunkTicket;
export function isTickingLevel(level: number): boolean;
export function isLoadedLevel(level: number): boolean;
export function isHigherPriority(a: ChunkTicket, b: ChunkTicket): boolean;

export class ChunkTicketManager {
  addTicket(cx: number, cz: number, ticket: ChunkTicket): void;
  removeTicket(cx: number, cz: number, ticket: ChunkTicket): void;
  getLevel(cx: number, cz: number): number;
  isLoaded(cx: number, cz: number): boolean;
  isTicking(cx: number, cz: number): boolean;
  getTickets(cx: number, cz: number): readonly ChunkTicket[];
  chunks(): IterableIterator<[number, number]>;
  clear(): void;
}
```

## Control / data flow

A system that wants a chunk kept around calls `addTicket(cx, cz, createChunkTicket(Player))`. Streaming/simulation
queries `getLevel`/`isLoaded`/`isTicking` to decide residency. When the reason lapses it calls `removeTicket`; the
effective level recomputes from the remaining tickets. `removeTicket` matches on `type` and `level` (first match).

## Detailed behavior

- `createChunkTicket(type)` uses `CHUNK_TICKET_DEFAULT_LEVEL[type]` when no explicit level is given.
- `getLevel` with no tickets returns `MAX_TICKET_LEVEL` (unloaded). `isLoaded`/`isTicking` then return false.
- `removeTicket` for an absent ticket is a no-op (no throw). Removing the last ticket leaves the chunk unloaded.
- `chunks()` yields `[cx, cz]` for coordinates that currently hold at least one ticket.

## Failure modes

- `removeTicket` of a missing ticket → no-op.
- Querying a never-seen coordinate → `getLevel` returns `MAX_TICKET_LEVEL`, `isLoaded`/`isTicking` false (safe default).

## Compatibility / migration

Additive; no persisted or call-site changes.

## Performance / resource constraints

O(T) per coordinate for level computation where T = tickets at that chunk (typically tiny); `Map` keyed by `cx,cz`.
No allocation on read beyond the result.

## Testing seams

`tests/unit/ChunkTicket.test.ts` covers: default levels, level predicates, `createChunkTicket` default override,
`addTicket`/`getLevel`/`isLoaded`/`isTicking`, multi-ticket aggregation (most important wins), removal (including
last-ticket ⇒ unloaded), absent-removal no-op, and per-chunk independence.

## Affected files / symbols

- `src/world/ChunkTicket.ts` (new)
- `tests/unit/ChunkTicket.test.ts` (new)

## Rejected alternatives

- **Fold tickets into `ChunkColumn`**: tickets are cross-column coordination state (player at one column keeps
  neighbors loaded), not column content; a coordinate-keyed manager fits better and stays independent of 024/030.
- **Persist tickets**: they are transient runtime coordination; persisting would add migration for zero benefit.
- **Stringly-typed reasons**: an enum gives exhaustiveness and default levels cleanly.

## Downstream dependencies

032 (`render-vs-simulation-distance`) and 033 (`vertical-streaming`) consume `ChunkTicketManager` to decide which
chunks stay loaded/ticking and at what level.
