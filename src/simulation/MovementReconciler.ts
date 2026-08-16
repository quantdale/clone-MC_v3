/**
 * Client-side movement prediction and reconciliation (228): holds the client-predicted
 * position, a confirmed authoritative tick, and a bounded buffer of pending movement intents.
 * `predict(position, tick)` advances the predicted position locally and buffers the intent.
 * `reconcile(authoritativePosition, authoritativeTick)` snaps to the server's authoritative
 * position for that tick and replays surviving buffered intents newer than that tick. Stale
 * corrections (authoritativeTick <= confirmedTick) are ignored. Malformed inputs throw a
 * descriptive `MovementReconciler: <detail>` error and change nothing. Pristine state has
 * predicted origin {0,0,0}, confirmedTick 0, and empty buffer. No render interpolation,
 * no IO, no DOM; fully unit-testable headlessly.
 */
export interface Position {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PendingIntent {
  readonly tick: number;
  readonly position: Position;
}

export interface MovementReconcilerOptions {
  /** Bounded pending-intent buffer size; positive integer (default 1024). */
  readonly maxPending?: number;
}

function isFinitePosition(value: unknown): value is Position {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.x === 'number' &&
    Number.isFinite(p.x) &&
    typeof p.y === 'number' &&
    Number.isFinite(p.y) &&
    typeof p.z === 'number' &&
    Number.isFinite(p.z)
  );
}

function validateTick(tick: number, field: string): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error(`MovementReconciler: ${field} must be a non-negative safe integer`);
  }
}

/** Pure headless client-side movement reconciler. */
export class MovementReconciler {
  private readonly maxPending: number;

  private _predicted: Position = { x: 0, y: 0, z: 0 };
  private _confirmedTick = 0;
  private _pending: PendingIntent[] = [];

  constructor(options?: MovementReconcilerOptions) {
    const max = options?.maxPending ?? 1024;
    if (!Number.isSafeInteger(max) || max <= 0) {
      throw new Error('MovementReconciler: maxPending must be a positive integer');
    }
    this.maxPending = max;
  }

  /**
   * Apply a local movement intent at `tick`. Advances the predicted position and buffers the
   * intent for future replay on reconciliation.
   */
  predict(position: Position, tick: number): void {
    if (!isFinitePosition(position)) {
      throw new Error('MovementReconciler: predict position must be finite numbers');
    }
    validateTick(tick, 'predict tick');
    if (tick <= this._confirmedTick) {
      throw new Error('MovementReconciler: predict tick must be greater than confirmed tick');
    }
    if (this._pending.length >= this.maxPending) {
      throw new Error('MovementReconciler: pending buffer full');
    }
    this._predicted = { ...position };
    this._pending.push({ tick, position: { ...position } });
  }

  /**
   * Reconcile against an authoritative server correction/confirmation at `authoritativeTick`.
   * If stale (authoritativeTick <= confirmedTick), it is a silent no-op.
   * Otherwise: advances confirmedTick, snaps predicted to authoritativePosition, drops buffer
   * entries with tick <= authoritativeTick, and replays surviving buffer entries (tick > authoritativeTick)
   * in ascending tick order.
   */
  reconcile(authoritativePosition: Position, authoritativeTick: number): void {
    if (!isFinitePosition(authoritativePosition)) {
      throw new Error('MovementReconciler: authoritative position must be finite numbers');
    }
    validateTick(authoritativeTick, 'authoritative tick');
    if (authoritativeTick <= this._confirmedTick) {
      return;
    }
    this._confirmedTick = authoritativeTick;
    this._predicted = { ...authoritativePosition };
    const surviving: PendingIntent[] = [];
    for (const intent of this._pending) {
      if (intent.tick > authoritativeTick) {
        surviving.push(intent);
        this._predicted = { ...intent.position };
      }
    }
    this._pending = surviving;
  }

  /** The current predicted position (copy). */
  get predicted(): Position {
    return { ...this._predicted };
  }

  /** The newest confirmed authoritative tick. */
  get confirmedTick(): number {
    return this._confirmedTick;
  }

  /** The number of pending unconfirmed intents in the buffer. */
  get pendingCount(): number {
    return this._pending.length;
  }

  /** Snapshot of the pending intents in oldest-first order (copy). */
  get pending(): readonly PendingIntent[] {
    return this._pending.map(intent => ({
      tick: intent.tick,
      position: { ...intent.position },
    }));
  }

  /** Restore pristine pre-prediction state. */
  reset(): void {
    this._predicted = { x: 0, y: 0, z: 0 };
    this._confirmedTick = 0;
    this._pending = [];
  }
}
