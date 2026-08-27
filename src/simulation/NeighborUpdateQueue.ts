/**
 * Ordered, bounded neighbor-update queue (049). Block changes cascade: breaking a block notifies its
 * neighbors, which may react and notify further. This queue processes those immediate updates FIFO
 * with per-drain budget (`maxPerDrain`) and a total cap (`maxQueueSize`, dropping the newest with a
 * `false` return). Handlers that enqueue during a drain append to the same *iterative* loop — `drain`
 * is never re-entered, so deep cascades cannot overflow the call stack.
 */
export type NeighborUpdateHandler = (x: number, y: number, z: number) => void;

export interface NeighborUpdateQueueOptions {
  /** Positions processed per `drain` call (default 64). */
  maxPerDrain?: number;
  /** Pending-position cap; enqueue beyond it drops the new entry (default 4096). */
  maxQueueSize?: number;
}

function positionKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** FIFO, deduplicated, budgeted queue for immediate block neighbor updates. */
export class NeighborUpdateQueue {
  private readonly maxPerDrain: number;
  private readonly maxQueueSize: number;
  private readonly pending = new Map<string, [number, number, number]>();
  private order: string[] = [];
  private head = 0;

  constructor(opts: NeighborUpdateQueueOptions = {}) {
    this.maxPerDrain = opts.maxPerDrain ?? 64;
    this.maxQueueSize = opts.maxQueueSize ?? 4096;
  }

  /**
   * Queue a position for notification. Returns `false` (without adding) when the queue is at
   * `maxQueueSize` — the documented drop-newest overflow policy.
   */
  enqueue(x: number, y: number, z: number): boolean {
    const key = positionKey(x, y, z);
    if (this.pending.has(key)) return true;
    if (this.pending.size >= this.maxQueueSize) return false;
    this.pending.set(key, [x, y, z]);
    this.order.push(key);
    return true;
  }

  /**
   * Process up to `maxPerDrain` pending positions in FIFO order. Positions enqueued by `handler` are
   * processed within the same call (iteratively), so cascades never recurse. Returns the processed
   * count.
   */
  drain(handler: NeighborUpdateHandler): number {
    let processed = 0;
    while (this.head < this.order.length && processed < this.maxPerDrain) {
      const key = this.order[this.head++]!;
      const position = this.pending.get(key);
      if (position === undefined) continue; // already processed (defensive)
      this.pending.delete(key);
      handler(position[0], position[1], position[2]);
      processed++;
    }
    if (this.head >= this.order.length) {
      this.order.length = 0;
      this.head = 0;
    } else if (this.head > 128 && this.head * 2 >= this.order.length) {
      this.order = this.order.slice(this.head);
      this.head = 0;
    }
    return processed;
  }

  /** Number of pending positions. */
  get size(): number {
    return this.pending.size;
  }

  /** Whether `(x, y, z)` is pending. */
  has(x: number, y: number, z: number): boolean {
    return this.pending.has(positionKey(x, y, z));
  }

  /** Remove all pending positions. */
  clear(): void {
    this.pending.clear();
    this.order.length = 0;
    this.head = 0;
  }
}
