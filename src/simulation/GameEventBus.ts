/**
 * Generic gameplay event bus (053). Producers `emit` typed `GameEvent`s; consumers subscribe per type
 * or via the `'*'` wildcard — producers and consumers never know each other. Delivery is synchronous,
 * in subscription order (typed listeners first, then wildcard), with per-listener defensive isolation
 * so one throwing listener cannot break the rest. Events emitted during a delivery are queued on a
 * shared in-flight queue and delivered after the current batch in the same synchronous call (no
 * recursion).
 */

/** Wildcard type: listeners subscribed here receive every event. */
export const WILDCARD_EVENT_TYPE = '*';

export interface GameEventPosition {
  x: number;
  y: number;
  z: number;
}

/** A gameplay occurrence broadcast through the bus. */
export interface GameEvent {
  /** Event type, e.g. `'block-broken'`. */
  type: string;
  /** Game tick at which the event occurred. */
  tick: number;
  /** Optional world position. */
  position?: GameEventPosition;
  /** Optional opaque payload. */
  data?: unknown;
}

export type GameEventListener = (event: GameEvent) => void;

/** A subscription entry with its one-shot flag. */
interface Subscription {
  listener: GameEventListener;
  once: boolean;
}

/** Synchronous, decoupled gameplay event broadcast. */
export class GameEventBus {
  private readonly byType = new Map<string, Subscription[]>();
  private readonly dispatchQueue: GameEvent[] = [];
  private dispatching = false;

  /**
   * Broadcast an event: typed listeners first, then wildcard, each in subscription order. Nested
   * emits (from listeners) are queued and delivered after the current batch, in order.
   */
  emit(event: GameEvent): void {
    this.dispatchQueue.push(event);
    if (this.dispatching) return; // nested emit: queued for after the current batch

    this.dispatching = true;
    try {
      while (this.dispatchQueue.length > 0) {
        const current = this.dispatchQueue.shift()!;
        this.deliver(this.byType.get(current.type), current);
        this.deliver(this.byType.get(WILDCARD_EVENT_TYPE), current);
      }
    } finally {
      this.dispatching = false;
      this.dispatchQueue.length = 0;
    }
  }

  /** Subscribe to `type` (or `'*'`); returns an unsubscribe function. */
  on(type: string, listener: GameEventListener): () => void {
    return this.subscribe(type, listener, false);
  }

  /** Subscribe for a single delivery; auto-unsubscribes before invocation. */
  once(type: string, listener: GameEventListener): () => void {
    return this.subscribe(type, listener, true);
  }

  /** Remove every subscription. */
  clear(): void {
    this.byType.clear();
  }

  private subscribe(type: string, listener: GameEventListener, once: boolean): () => void {
    let subscriptions = this.byType.get(type);
    if (!subscriptions) {
      subscriptions = [];
      this.byType.set(type, subscriptions);
    }
    const entry: Subscription = { listener, once };
    subscriptions.push(entry);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.removeEntry(type, entry);
    };
  }

  private deliver(subscriptions: Subscription[] | undefined, event: GameEvent): void {
    if (!subscriptions) return;
    for (const entry of [...subscriptions]) {
      if (entry.once) {
        // One-shot: unsubscribe before invocation.
        this.removeEntry(event.type === WILDCARD_EVENT_TYPE ? WILDCARD_EVENT_TYPE : event.type, entry);
        entry.once = false;
      }
      try {
        entry.listener(event);
      } catch {
        // Defensive isolation: one throwing listener must not break the rest.
      }
    }
  }

  private removeEntry(type: string, entry: Subscription): void {
    const list = this.byType.get(type);
    if (!list) return;
    const index = list.indexOf(entry);
    if (index >= 0) list.splice(index, 1);
  }
}
