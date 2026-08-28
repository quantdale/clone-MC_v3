/**
 * Local block event queue (051) — Minecraft's `addBlockEvent` mechanism. A `BlockEvent` is a typed
 * `(blockId, eventId, param)` event delivered at a block's position, independent of scheduled/random
 * ticks. Events are delivered FIFO, deduplicated per `(position, eventId)` with newest-param-wins
 * (Java parity), bounded per drain (`maxPerDrain`) and in total (`maxQueueSize`, drop-newest with a
 * `false` return).
 */
export interface BlockEvent {
  x: number;
  y: number;
  z: number;
  blockId: number;
  eventId: number;
  param: number;
}

export type BlockEventHandler = (event: BlockEvent) => void;

export interface BlockEventQueueOptions {
  /** Events delivered per `drain` call (default 64). */
  maxPerDrain?: number;
  /** Pending-event cap; `add` beyond it drops the new event (default 4096). */
  maxQueueSize?: number;
}

function eventKey(x: number, y: number, z: number, eventId: number): string {
  return `${x},${y},${z}:${eventId}`;
}

/** FIFO, deduplicated, budgeted local block event queue. */
export class BlockEventQueue {
  private readonly maxPerDrain: number;
  private readonly maxQueueSize: number;
  private readonly pending = new Map<string, BlockEvent>();
  private readonly order: string[] = [];

  constructor(opts: BlockEventQueueOptions = {}) {
    this.maxPerDrain = opts.maxPerDrain ?? 64;
    this.maxQueueSize = opts.maxQueueSize ?? 4096;
  }

  /**
   * Queue a block event. Re-adding a pending `(position, eventId)` updates `param`/`blockId` in
   * place (newest wins). Returns `false` (without adding) when the queue is at `maxQueueSize`.
   */
  add(x: number, y: number, z: number, blockId: number, eventId: number, param: number): boolean {
    const key = eventKey(x, y, z, eventId);
    const existing = this.pending.get(key);
    if (existing) {
      existing.blockId = blockId;
      existing.param = param;
      return true;
    }
    if (this.pending.size >= this.maxQueueSize) return false;
    this.pending.set(key, { x, y, z, blockId, eventId, param });
    this.order.push(key);
    return true;
  }

  /** Deliver up to `maxPerDrain` events in FIFO order. Returns the delivered count. */
  drain(handler: BlockEventHandler): number {
    let delivered = 0;
    while (this.order.length > 0 && delivered < this.maxPerDrain) {
      const key = this.order.shift()!;
      const event = this.pending.get(key);
      if (event === undefined) continue; // already delivered (defensive)
      this.pending.delete(key);
      handler(event);
      delivered++;
    }
    return delivered;
  }

  /** Number of pending events. */
  get size(): number {
    return this.pending.size;
  }

  /** Remove all pending events. */
  clear(): void {
    this.pending.clear();
    this.order.length = 0;
  }
}
