# Design: 226-server-chunk-streaming

## Context/current state

- 223 `NetworkProtocol` — wire codecs (no chunk concept).
- 224 `WorldTickProcess` — headless tick driver (no world payloads).
- 225 `ConnectionLifecycle` — connection states (streaming will be gated on `connected` by
  the future server assembly, not by this module).
- Client side: `src/world/World.ts` streams/generates chunks around the player; its
  `chunkKey` is the 3D section key `${cx},${cy},${cz}` — different granularity from this
  change's column interest keys, and `world/` is outside the 222 shareable simulation
  package. This change defines its own column key to stay dependency-free.

## Target state

A pure headless per-connection chunk streaming model: interest (center + viewDistance →
Chebyshev column set), snapshots (validated column envelopes with section payloads and a
server tick), and consumed updates (added/removed/updated, key-sorted, exactly-once).

## Invariants

- Interest is the Chebyshev square `|x - cx| <= viewDistance && |z - cz| <= viewDistance`.
- `interest()` and every update list are sorted by column key (string order) — deterministic
  output.
- A chunk column in `entered` stays in the entered accumulator until the next
  `pendingUpdates` consumes it; same for `left` and `dirty`.
- `pendingUpdates` sends `added` only for entered columns that already have a snapshot;
  entered columns without one are sent later as `updated` once their snapshot arrives.
- `updated` contains dirty snapshots currently inside the interest set only.
- The snapshot store is bounded (`maxSnapshots`); the oldest-inserted snapshot is evicted
  when full. Eviction never corrupts the accumulators.
- `putSnapshot` replaces an existing snapshot (the update path) and marks the column dirty.
- Every validation failure throws and changes nothing.

## API and data model

```ts
// src/simulation/ChunkStreaming.ts
export type ChunkKey = string; // "x,z"
export function columnKey(x: number, z: number): ChunkKey;

export interface SectionSnapshot {
  readonly y: number;              // section y index (integer)
  readonly data: readonly number[]; // opaque non-negative integer payload (palette later)
}

export interface ChunkSnapshot {
  readonly key: ChunkKey;          // must equal columnKey(x, z)
  readonly x: number;              // integer
  readonly z: number;              // integer
  readonly sections: readonly SectionSnapshot[]; // unique y's
  readonly tick: number;           // server tick (non-negative safe integer)
}

export interface ChunkStreamOptions {
  readonly viewDistance: number;   // Chebyshev radius, positive integer
  readonly maxSnapshots?: number;  // bounded store, positive integer (default 1024)
}

export interface InterestDelta {
  readonly entered: readonly ChunkKey[]; // key-sorted
  readonly left: readonly ChunkKey[];
}

export interface ChunkUpdate {
  readonly tick: number;
  readonly added: readonly ChunkSnapshot[];   // entered + snapshot available
  readonly removed: readonly ChunkKey[];      // left since last update
  readonly updated: readonly ChunkSnapshot[]; // dirty ∩ interest, key-sorted
}

export class ChunkStreamManager {
  constructor(options: ChunkStreamOptions);  // throws ChunkStream: <detail>

  setCenter(x: number, z: number): InterestDelta; // throws on non-integer coords
  get center(): ChunkCoord;
  isInterested(x: number, z: number): boolean;
  interest(): readonly ChunkKey[];               // key-sorted

  putSnapshot(snapshot: ChunkSnapshot): void;    // validates; marks dirty
  getSnapshot(key: ChunkKey): ChunkSnapshot | null;
  hasSnapshot(key: ChunkKey): boolean;
  removeSnapshot(key: ChunkKey): void;

  pendingUpdates(tick: number): ChunkUpdate;     // consumes accumulators
  reset(): void;                                 // pristine state
}
```

Internal state: `{ center: ChunkCoord | null, viewDistance, maxSnapshots,
store: Map<ChunkKey, ChunkSnapshot>, dirty: Set<ChunkKey>,
entered: Set<ChunkKey>, left: Set<ChunkKey> }`.

## Control/data flow

```
setCenter(x,z) ──► new interest set (Chebyshev)
                   entered = newSet - oldSet   (or all of newSet when center was null)
                   left    = oldSet - newSet   (empty when center was null)
                   accumulate into entered/left sets; store center

putSnapshot ──► validate ──► store.set(key) (evict oldest if full) ──► dirty.add(key)

pendingUpdates(tick) ──► added    = snapshots for entered  (entered ∩ store, key-sorted)
                         removed  = left (key-sorted)
                         updated  = snapshots for dirty ∩ interest (key-sorted)
                         clear entered/left/dirty ──► return { tick, added, removed, updated }
```

## Detailed behavior

- **Construction**: `viewDistance` must be a positive integer, `maxSnapshots` a positive
  integer (default 1024); rejections throw `ChunkStream: <detail>` naming the field.
  Pristine: no center, empty store/accumulators.
- **`setCenter`**: coords must be integers (throw otherwise). First call returns the whole
  interest set as `entered` (and empty `left`). Subsequent calls diff against the previous
  set. Entered/left accumulate across calls until consumed by `pendingUpdates`.
- **`putSnapshot`**: validates the envelope (key must equal `columnKey(x, z)`, integer
  coords, sections with unique integer `y`, each `data` a non-empty array of non-negative
  safe integers, `tick` a non-negative safe integer). Replaces any existing snapshot for
  the key and marks it dirty. When the store is full, the oldest-inserted snapshot is
  evicted first.
- **`pendingUpdates(tick)`**: `tick` must be a non-negative safe integer. Returns the
  consumed update (added = entered columns with snapshots, removed = left columns, updated
  = dirty columns inside the current interest that have snapshots; all lists key-sorted;
  snapshots listed in key order). Afterwards the entered/left/dirty accumulators are empty.
- **`removeSnapshot`**: drops the snapshot from the store and from `dirty` (a removed
  snapshot cannot be sent as updated); it does not touch the entered/left accumulators.
- **`reset()`**: clears center, store, and all accumulators.
- **Interest without snapshots**: entered columns lacking a snapshot are simply absent from
  `added`; once their snapshot arrives (putSnapshot → dirty) and they are still inside the
  interest set, they surface in `updated` on the next `pendingUpdates`.

## Failure modes

- Invalid options/coords/snapshot/update-tick → descriptive throw, no state change.
- Eviction drops the oldest snapshot (documented; callers can re-put after `left` if needed).

## Compatibility/migration

Additive: new exported names only. Own column-key format (`"x,z"`) is documented; the
client-side 3D `world/WorldCoordinates.chunkKey` is untouched.

## Performance/resource constraints

- `setCenter`: O(viewDistance²) for the interest set diff; `pendingUpdates`: O(store) for
  added/updated lookups; `putSnapshot`: O(sections) validation; store bounded by
  `maxSnapshots` with O(1) amortized eviction via insertion order.
- Memory: O(maxSnapshots) snapshots plus accumulator sets ≤ O(viewDistance² + maxSnapshots).

## Testing seams

- Scripted `setCenter`/`putSnapshot`/`pendingUpdates` sequences — no fakes, no timers.
- Small `viewDistance` (1-2) and `maxSnapshots` (2-3) to pin deltas, bounds, and eviction.

## Observability/debugging

- `center`, `interest()`, `hasSnapshot`/`getSnapshot` — passive state reads; exact
  `ChunkStream: <detail>` error strings.

## Affected files/symbols

- NEW `src/simulation/ChunkStreaming.ts` — `ChunkKey`, `columnKey`, `ChunkCoord`,
  `SectionSnapshot`, `ChunkSnapshot`, `ChunkStreamOptions`, `InterestDelta`, `ChunkUpdate`,
  `ChunkStreamManager`.
- NEW `tests/unit/ChunkStreaming.test.ts`.
- Docs/state: `openspec/PROGRAM_STATE.json`, `openspec/PROGRAM_STATE.md`.

## Rejected alternatives

- **Reuse `world/WorldCoordinates.chunkKey`**: rejected — that is the 3D section key and
  lives outside the 222 shareable simulation package; a self-contained `columnKey` keeps
  this module dependency-free.
- **Snapshots referencing live world objects**: rejected — envelopes are plain validated
  data; no object identity crosses the model boundary.
- **Immediate-send (no accumulator consumption)**: rejected — exactly-once semantics
  require explicit consumption, which is what `pendingUpdates` provides.
- **Unbounded store**: rejected — bounded `maxSnapshots` matches the arc's resource
  discipline.
- **Dirty-flag setters on snapshots**: rejected — the manager owns dirty state; callers
  just `putSnapshot`.

## Downstream dependencies

- 227 `server-player-movement` will move the center per tick via `setCenter`.
- 229 `entity-replication` and 230 `block-interaction-networking` will `putSnapshot` on
  world changes and ship `pendingUpdates` output over 223's codecs.
- The future server assembly gates calls on `ConnectionLifecycle.state === 'connected'`
  (225) and drives them from `WorldTickProcess` (224).
