# Design: 156-redstone-update-order

## Context/current state
- 155's `computeWirePower` is a pure local rule reading each neighbour's *stored* power. Iterating
  it is exactly what makes a signal travel, and 155 deliberately left that to this change.
- 049's `NeighborUpdateQueue` already provides everything the ordering side needs: FIFO order,
  position deduplication, a per-drain budget, a total cap with a documented drop-newest overflow
  policy, and — critically — an **iterative** drain, so handlers that enqueue during a drain extend
  the same loop instead of recursing. Reusing it means 156 adds no new queue machinery.
- 047's `ScheduledTickQueue` models *delayed* ticks. Vanilla wire propagation is immediate within a
  tick, so 047 is the wrong primitive here; it becomes relevant at 159 (repeater delay). Recorded
  in the proposal's Non-goals so the choice reads as deliberate.
- The termination argument comes free from 155: `computeWirePower` attenuates every neighbour
  contribution by at least 1, so power strictly decreases with distance from a source. A change
  therefore propagates outward a bounded number of steps (≤ 15) before values stop changing, and
  the "only enqueue when the value actually changed" rule turns that into a natural fixed point.

## Target state
- `src/simulation/RedstonePropagation.ts`: `RedstonePropagator`, composing an injected
  `WirePowerStore`, `WireWorld`, and `RedstonePowerSource` with 049's queue and 155's local rule.

## Invariants
- `propagate` writes a wire's power only when the newly computed value differs from the stored one;
  an already-settled circuit produces zero writes.
- A wire's power is enqueued for its neighbours only when its own value changed — this is what
  makes the fixed point terminate rather than cycling.
- Total recomputations in one `propagate` call never exceed `maxUpdates`; when the bound trips,
  `hitLimit` is `true` and the unprocessed remainder stays queued (never silently dropped by this
  module — 049's own `maxQueueSize` overflow remains its documented drop-newest policy).
- Given identical inputs and identical initial dirty sets, two independently-constructed
  propagators produce identical final power maps and identical `PropagationResult` counts.
- `propagate` never recurses; cascade depth is bounded by 049's iterative drain.
- Non-wire positions are visited but never written to the store.

## API and data model
```ts
// src/simulation/RedstonePropagation.ts

/** Caller-supplied mutable store of each wire's current power. */
export interface WirePowerStore {
  getPower(x: number, y: number, z: number): number;
  setPower(x: number, y: number, z: number, power: number): void;
}

export interface PropagationResult {
  /** Positions dequeued and examined. */
  readonly visited: number;
  /** Wires whose stored power actually changed. */
  readonly changed: number;
  /** True when `maxUpdates` stopped the pass with work still queued. */
  readonly hitLimit: boolean;
}

export interface RedstonePropagatorOptions {
  /** Max recomputations per `propagate` call (default 4096). */
  maxUpdates?: number;
  /** Forwarded to 049's queue (default 4096). */
  maxQueueSize?: number;
  /** Max `propagate` rounds `settle` will run (default 64). */
  maxSettleRounds?: number;
}

export class RedstonePropagator {
  constructor(
    world: WireWorld,
    powerSource: RedstonePowerSource,
    store: WirePowerStore,
    opts?: RedstonePropagatorOptions,
  );
  markDirty(x: number, y: number, z: number): boolean;
  markNeighborsDirty(x: number, y: number, z: number): void;
  propagate(): PropagationResult;
  settle(): PropagationResult;
  get pendingCount(): number;
}
```

## Control/data flow
1. **A block edit** (a future wiring change): `markDirty(x, y, z)` on the edited cell, plus
   `markNeighborsDirty(x, y, z)` so wires adjacent to a placed/removed component recompute.
2. **`propagate()`** drains 049's queue with a handler that, per position:
   a. Skips (counting as visited) when `world.isWire` is false — a non-wire cell never gets a
      stored power.
   b. Computes `next = computeWirePower(world, powerSource, x, y, z)` (155).
   c. If `next === store.getPower(...)`, stops here — **no write, no enqueue**. This is the
      fixed-point condition.
   d. Otherwise writes `next` and enqueues every *connected* wire neighbour (resolved via 155's
      `resolveWireConnections`, walking `HORIZONTAL_DIRECTIONS` in its fixed order, resolving the
      correct cell for `'up'`/descent connections) plus the cell above and below, so a vertical
      neighbour that reads this wire also recomputes.
   e. Increments the update counter; when it reaches `maxUpdates`, the drain stops and `hitLimit`
      is reported with the remainder still queued.
3. **`settle()`** calls `propagate()` repeatedly until `pendingCount` is 0 or `maxSettleRounds`
   trips, accumulating the counts. Its `hitLimit` means **"did not converge"** — work still queued
   after all rounds. An intermediate round hitting its own `maxUpdates` is normal chunking, not a
   failure, so it does not by itself set the flag: a caller asking `settle` for a fixed point cares
   only whether it got one.

## Detailed behavior
- The internal 049 queue is constructed with **`maxPerDrain: 1`**, and `propagate` loops `drain`
  itself until the queue empties or `maxUpdates` trips. This makes the bound *exact*: a naive
  larger per-drain budget would let 049 dequeue a batch that this class then refuses to finish,
  silently dropping queued work and violating the "remainder stays queued" guarantee. Handling one
  position per call keeps 049 unmodified, keeps the bound honest, and loses nothing — the loop is
  iterative, so handler-enqueued positions are simply picked up on the next turn (no recursion,
  same cascade safety 049 provides internally).
- The enqueue set in step 2d deliberately includes the vertical neighbours (`y ± 1`) even though
  `resolveWireConnections` is horizontal-only: a wire one block above or below can be *connected to
  this one* from its own perspective (155's climb/descent asymmetry), so it must be given the
  chance to recompute. Missing this is the classic "signal won't climb a staircase" bug.
- Because a value only propagates when it changed, and 155 guarantees strict attenuation, a ring of
  wire settles: the first pass around raises values, each subsequent hop is strictly lower, and
  within ≤ 15 hops every cell reaches its final value and stops enqueueing. The ring test asserts
  this terminates well inside `maxUpdates` rather than merely "does not throw".
- `markDirty` returns 049's own boolean, so a caller can observe queue-full backpressure.

## Failure modes
- No method throws for well-formed inputs. A store or world callback that itself throws propagates
  unmodified (154/155/140's documented convention).
- Exceeding `maxUpdates`/`maxSettleRounds` is reported via `hitLimit`, never thrown and never
  silently swallowed.

## Compatibility/migration
- One new, additive file; no existing module edited (049 is composed, not changed); no
  schema/save-format change.

## Performance/resource constraints
- Bounded by construction: at most `maxUpdates` recomputations per `propagate`, each doing 155's
  constant-cost local rule (≤ ~20 world calls + 154's ≤ 42 source calls). No recursion.

## Testing seams
- Tested with a plain in-memory `Map`-backed `WirePowerStore` and object-literal `WireWorld`/
  `RedstonePowerSource` built over a small fixture grid — no `World`, `BlockRegistry`, or `Game`.

## Observability/debugging
- `PropagationResult` (`visited`/`changed`/`hitLimit`) is the diagnostic surface; `pendingCount`
  exposes backlog.

## Affected files/symbols
- `src/simulation/RedstonePropagation.ts` (new).
- Tests: `tests/unit/RedstonePropagation.test.ts` (new).

## Rejected alternatives
- **Using 047's `ScheduledTickQueue`**: rejected — it models delayed ticks; wire propagation is
  immediate within a tick. 047 becomes correct at 159 (repeater delay).
- **Writing a bespoke queue**: rejected — 049 already provides FIFO order, dedup, budgets, overflow
  policy, and an iterative drain that prevents stack overflow on deep cascades. Reusing it is both
  less code and better tested.
- **Enqueueing neighbours unconditionally (not only on change)**: rejected — that removes the fixed
  point and makes a ring cycle until the bound trips, converting a correct algorithm into one that
  merely terminates by exhaustion.
- **Wiring this into `Game`/`World` in the same change**: rejected — it needs a store backed by
  125's block-state overlay plus a block behavior reacting to edits, a materially larger integration
  surface; 145's precedent (waiting to wire 129-139) applies directly.

## Downstream dependencies
- A future wiring change backs `WirePowerStore` with 125's block-state overlay and calls
  `markDirty`/`settle` from block-edit handling, making live wire carry a signal.
- 157-162's components become power sources feeding the same propagator through
  `RedstonePowerSource`/`connectsToRedstone`.
- 159 (repeater) additionally introduces delayed output, where 047's `ScheduledTickQueue` becomes
  the right primitive alongside this immediate propagator.
