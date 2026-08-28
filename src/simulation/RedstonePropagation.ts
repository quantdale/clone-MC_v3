/**
 * Redstone update order (156): deterministic, bounded, loop-protected propagation of wire power.
 * `RedstonePropagator` composes 049's `NeighborUpdateQueue` (FIFO, deduplicated, budgeted, and
 * crucially *iterative* — deep cascades never recurse) with 155's local `computeWirePower` rule,
 * iterating it to a fixed point.
 *
 * Termination comes from two properties working together: 155 guarantees every neighbour
 * contribution is attenuated by at least 1 (so power strictly decreases with distance from a
 * source), and this module enqueues neighbours **only when a wire's value actually changed**. A
 * ring of wire therefore settles within a bounded number of hops rather than cycling.
 *
 * No `Game`/`World` wiring or `BlockBehavior` (a future wiring change backs `WirePowerStore` with
 * 125's block-state overlay), no components (157-161), no delayed ticks (047's `ScheduledTickQueue`
 * models those and becomes right at 159), no chunk awareness — see
 * `openspec/changes/156-redstone-update-order/design.md`.
 */
import { NeighborUpdateQueue } from './NeighborUpdateQueue';
import { offsetInDirection, type RedstonePowerSource } from './RedstoneSignal';
import {
  computeWirePower,
  resolveWireConnections,
  HORIZONTAL_DIRECTIONS,
  type WireWorld,
} from './RedstoneWire';

/** Caller-supplied mutable store of each wire's current power. */
export interface WirePowerStore {
  getPower(x: number, y: number, z: number): number;
  setPower(x: number, y: number, z: number, power: number): void;
}

/** What one propagation pass did. */
export interface PropagationResult {
  /** Positions dequeued and examined. */
  readonly visited: number;
  /** Wires whose stored power actually changed. */
  readonly changed: number;
  /** True when a bound stopped the pass with work still queued. */
  readonly hitLimit: boolean;
}

/** Tuning bounds for {@link RedstonePropagator}. */
export interface RedstonePropagatorOptions {
  /** Max recomputations per `propagate` call. Default 4096. */
  maxUpdates?: number;
  /** Forwarded to 049's queue: pending-position cap. Default 4096. */
  maxQueueSize?: number;
  /** Max `propagate` rounds `settle` will run. Default 64. */
  maxSettleRounds?: number;
}

/**
 * Iterates 155's local wire rule to a fixed point over a dirty set, with deterministic FIFO
 * ordering and explicit bounds.
 */
export class RedstonePropagator {
  private readonly world: WireWorld;
  private readonly powerSource: RedstonePowerSource;
  private readonly store: WirePowerStore;
  private readonly queue: NeighborUpdateQueue;
  private readonly maxUpdates: number;
  private readonly maxSettleRounds: number;

  constructor(
    world: WireWorld,
    powerSource: RedstonePowerSource,
    store: WirePowerStore,
    opts: RedstonePropagatorOptions = {},
  ) {
    this.world = world;
    this.powerSource = powerSource;
    this.store = store;
    this.maxUpdates = opts.maxUpdates ?? 4096;
    this.maxSettleRounds = opts.maxSettleRounds ?? 64;
    // `maxPerDrain: 1` makes the `maxUpdates` bound exact: this class's own loop decides how many
    // positions to process, so a bound trip can never dequeue a position it then refuses to
    // handle (which would silently drop queued work). Cascade safety is unaffected — the loop
    // below is iterative, so handler-enqueued positions are simply picked up on the next turn.
    this.queue = new NeighborUpdateQueue({
      maxPerDrain: 1,
      maxQueueSize: opts.maxQueueSize ?? 4096,
    });
  }

  /** Queue one position for recomputation. Returns 049's queue-full backpressure signal. */
  markDirty(x: number, y: number, z: number): boolean {
    return this.queue.enqueue(x, y, z);
  }

  /** Queue the six axis neighbours of a position (e.g. after a block edit at its centre). */
  markNeighborsDirty(x: number, y: number, z: number): void {
    this.markDirty(x + 1, y, z);
    this.markDirty(x - 1, y, z);
    this.markDirty(x, y + 1, z);
    this.markDirty(x, y - 1, z);
    this.markDirty(x, y, z + 1);
    this.markDirty(x, y, z - 1);
  }

  /** Positions still queued for recomputation. */
  get pendingCount(): number {
    return this.queue.size;
  }

  /**
   * Drain the dirty set toward a fixed point. For each position: a non-wire is examined and
   * skipped; a wire is recomputed via 155 and, **only when its value changed**, written and its
   * connected neighbours enqueued. Stops at `maxUpdates`, reporting `hitLimit` with the remainder
   * still queued.
   */
  propagate(): PropagationResult {
    let visited = 0;
    let changed = 0;

    while (this.queue.size > 0 && visited < this.maxUpdates) {
      // The queue is constructed with `maxPerDrain: 1`, so each call handles exactly one position
      // and the bound above is exact — no position is ever dequeued and then dropped unhandled.
      const processed = this.queue.drain((x, y, z) => {
        visited++;
        if (!this.world.isWire(x, y, z)) return;

        const next = computeWirePower(this.world, this.powerSource, x, y, z);
        if (next === this.store.getPower(x, y, z)) return;

        this.store.setPower(x, y, z, next);
        changed++;
        this.enqueueConnected(x, y, z);
      });
      if (processed === 0) break; // defensive: nothing left to do
    }

    return { visited, changed, hitLimit: this.queue.size > 0 };
  }

  /**
   * Repeatedly `propagate` until the queue empties or `maxSettleRounds` trips, accumulating counts.
   *
   * `hitLimit` here means **"did not converge"** — work is still queued after all rounds. An
   * intermediate round hitting its own `maxUpdates` is normal chunking, not a failure, so it does
   * not by itself set this flag; a caller asking `settle` for a fixed point cares only whether it
   * got one.
   */
  settle(): PropagationResult {
    let visited = 0;
    let changed = 0;

    for (let round = 0; round < this.maxSettleRounds; round++) {
      if (this.queue.size === 0) break;
      const result = this.propagate();
      visited += result.visited;
      changed += result.changed;
      if (result.visited === 0) break;
    }
    return { visited, changed, hitLimit: this.queue.size > 0 };
  }

  /**
   * Enqueue every wire that could read this one: each connected horizontal neighbour (resolving the
   * correct cell for a climb or descent) plus the cells directly above and below. The vertical pair
   * matters even though connections are horizontal-only — a wire one block up or down may be
   * connected to this one *from its own perspective* (155's climb/descent asymmetry), and omitting
   * them is the classic "signal won't climb a staircase" bug.
   */
  private enqueueConnected(x: number, y: number, z: number): void {
    const connections = resolveWireConnections(this.world, x, y, z);
    for (const direction of HORIZONTAL_DIRECTIONS) {
      const connection = connections[direction];
      if (connection === 'none') continue;
      const [nx, ny, nz] = offsetInDirection(x, y, z, direction);

      let wy = ny;
      if (connection === 'up') {
        wy = ny + 1;
      } else if (!this.world.isWire(nx, ny, nz) && this.world.isWire(nx, ny - 1, nz)) {
        wy = ny - 1;
      }
      this.markDirty(nx, wy, nz);
    }
    this.markDirty(x, y + 1, z);
    this.markDirty(x, y - 1, z);
  }
}
