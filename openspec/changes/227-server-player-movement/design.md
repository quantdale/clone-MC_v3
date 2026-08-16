# Design: 227-server-player-movement

## Context/current state

- 224 `WorldTickProcess` — fixed-tick counter (deterministic tick numbers; intents carry a
  tick to order against).
- 225 `ConnectionLifecycle` — `connected` state gates the authority in the future server.
- 226 `ChunkStreaming` — `setCenter` is driven by the authoritative position (`center` is
  chunk coords; the server converts the player's block position to chunk coords for 226).
- Client side: `src/player/Player.ts` holds a `position`; this change does NOT touch it — it
  models only the server's authoritative view, kept dependency-free per 222's boundary.

## Target state

A pure headless server-authoritative movement authority: it owns the authoritative
`Position`, validates each client `submitIntent(position, tick)` against a speed bound and a
tick-ordering rule, updates the authoritative position on acceptance, and returns a
correction (a teleport to the current authoritative position) on violation. Spawn and
server teleports set the position directly; malformed inputs throw.

## Invariants

- The authoritative `position` is always a finite 3D point.
- A well-formed intent is accepted only when `tick > lastTick` AND the Euclidean displacement
  from the authoritative position is `<= maxSpeedPerTick` (inclusive boundary).
- A correction never changes the authoritative position; it reports it.
- An intent is rejected (correction) without throwing on a rule violation; malformed inputs
  (non-finite coordinates, non-integer/negative tick) throw and change nothing.
- `tick` is a non-negative safe integer everywhere; `lastTick` starts at 0 (before spawn,
  intents are rejected as stale against tick 0).
- `reset()` restores the pristine pre-spawn state.

## API and data model

```ts
// src/simulation/MovementAuthority.ts
export interface Position {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MovementAuthorityOptions {
  /** Max acceptable Euclidean displacement (blocks) per tick; positive finite. */
  readonly maxSpeedPerTick: number;
}

export type MovementResult =
  | { readonly accepted: true; readonly position: Position }
  | {
      readonly accepted: false;
      readonly correction: Position;
      readonly reason: 'stale tick' | 'speed limit';
    };

export interface RejectionInfo {
  readonly tick: number;
  readonly reason: 'stale tick' | 'speed limit';
}

export class MovementAuthority {
  constructor(options: MovementAuthorityOptions); // throws MovementAuthority: <detail>

  spawn(position: Position, tick: number): void; // initial placement (teleport-like)
  submitIntent(position: Position, tick: number): MovementResult;
  teleport(position: Position, tick: number): void; // server-initiated reposition

  get position(): Position;       // authoritative (copy)
  get positionRef(): Position;    // live reference (for snapshot transfers)
  get lastTick(): number;
  get acceptedCount(): number;
  get lastRejection(): RejectionInfo | null;
  reset(): void;
}
```

Internal state: `{ pos: Position, lastTick: number, acceptedCount: number,
lastRejection: RejectionInfo | null, spawned: boolean }`.

## Control/data flow

```
spawn(p, t)          validate finite p, non-negative safe-int t
                     → pos = p; lastTick = t; spawned = true; counts 0; lastRejection null

submitIntent(p, t)   validate finite p, non-negative safe-int t (throw on malformed)
                     if !spawned OR t <= lastTick → correction(pos), reason 'stale tick'
                     d = euclidean(pos, p)
                     if d > maxSpeedPerTick → correction(pos), reason 'speed limit'
                     else → pos = p; lastTick = t; acceptedCount++; lastRejection = null
                            → accepted(p)

teleport(p, t)       validate finite p, non-negative safe-int t (throw if t < 0 or non-int)
                     → pos = p; lastTick = t (note: does NOT validate against previous
                       lastTick; a server teleport may reset ordering)
                     (lastRejection unchanged)
```

## Detailed behavior

- **Construction**: `maxSpeedPerTick` must be a positive finite number; rejections throw
  `MovementAuthority: <detail>` naming the field. Pristine: no spawn, `position {0,0,0}`,
  `lastTick 0`, `acceptedCount 0`, `lastRejection null`.
- **`spawn`**: validates finite coords and a non-negative safe-integer tick; sets the
  authoritative position and `lastTick`; resets counters. A second `spawn` re-places (it is
  equivalent to a fresh teleport at the given tick).
- **`submitIntent`**: validates the position (finite) and tick (non-negative safe integer);
  malformed input throws WITHOUT changing state. A non-spawned authority rejects every
  intent as stale (lastTick 0). A stale tick (`t <= lastTick`) returns a `stale tick`
  correction and records `lastRejection`. Displacement exceeding the bound returns a
  `speed limit` correction (position unchanged). Otherwise the intent is accepted: the
  authoritative position becomes the submitted position, `lastTick` advances to `t`,
  `acceptedCount` increments, `lastRejection` clears.
- **`teleport`**: server-initiated reposition; validates finite coords and a non-negative
  safe-integer tick; sets the authoritative position and `lastTick`. `lastRejection` is left
  as-is (a teleport is not an acceptance or rejection of a client intent).
- **Determinism**: identical spawn/teleport/submitIntent sequences on identical authorities
  yield identical `position`/`lastTick`/`acceptedCount`/`lastRejection` at every step.

## Failure modes

- Malformed input (non-finite coords, non-integer/negative tick) → descriptive throw, no
  state change.
- Rule violations (stale tick, speed limit) → correction result, position intact,
  `lastRejection` recorded.

## Compatibility/migration

Additive: new exported names only. No registry, save format, or existing public API
changes. `lastTick` begins at 0 so a fresh authority rejects pre-spawn intents
deterministically.

## Performance/resource constraints

- Each intent is O(1) (one Euclidean distance). No allocation beyond the result objects.
- Memory: O(1) state.

## Testing seams

- Scripted `spawn`/`submitIntent`/`teleport` sequences — no fakes, no timers.
- Small `maxSpeedPerTick` (e.g. 1.0) to pin boundary acceptance/rejection.

## Observability/debugging

- `position`, `lastTick`, `acceptedCount`, `lastRejection` — passive state; exact
  `MovementAuthority: <detail>` error strings.

## Affected files/symbols

- NEW `src/simulation/MovementAuthority.ts` — `Position`, `MovementAuthorityOptions`,
  `MovementResult`, `RejectionInfo`, `MovementAuthority`.
- NEW `tests/unit/MovementAuthority.test.ts`.
- Docs/state: `openspec/PROGRAM_STATE.json`, `openspec/PROGRAM_STATE.md`.

## Rejected alternatives

- **2D horizontal-only speed bound**: rejected — Euclidean 3D is simpler, deterministic,
  and matches the authoritative intent of catching implausible movement.
- **Throw on rule violation**: rejected — a speed/stale violation is normal client jitter,
  not a protocol error; it must yield a correction, not an exception.
- **Reject equal ticks strictly is too strict / accept them**: pinned to "strictly newer"
  (`t > lastTick`) — duplicates are treated as stale to keep tick ordering monotonic and
  deterministic.
- **Integrate world collision here**: rejected — out of scope (non-goals); the speed bound
  is the only movement rule this change owns.

## Downstream dependencies

- 228 `client-prediction-reconciliation` will feed local prediction and consume `correction`.
- 229 `entity-replication` and 230 `block-interaction-networking` will observe the
  authoritative position via `get position`; the future server drives 226's `setCenter`
  from it and ships `submitIntent` over 223's codecs.
