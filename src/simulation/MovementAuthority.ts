/**
 * Server-authoritative movement authority (227): the server's trusted view of a player's
 * position. It validates each client intent against a per-tick Euclidean speed bound and a
 * strict tick-ordering rule, accepting plausible intents (updating the authoritative
 * position) and returning a teleport correction on violation (stale tick or speed limit) —
 * without changing the authoritative position. Spawn and server teleports set the position
 * directly. Malformed inputs (non-finite coordinates, non-integer/negative ticks) throw a
 * descriptive `MovementAuthority: <detail>` error and change nothing. No world collision, no
 * IO; fully unit-testable headlessly.
 */
export interface Position {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MovementAuthorityOptions {
  /** Max acceptable Euclidean displacement (blocks) per tick; positive finite. */
  readonly maxSpeedPerTick: number;
}

export type MovementRejectionReason = 'stale tick' | 'speed limit';

export type MovementResult =
  | { readonly accepted: true; readonly position: Position }
  | {
      readonly accepted: false;
      readonly correction: Position;
      readonly reason: MovementRejectionReason;
    };

export interface RejectionInfo {
  readonly tick: number;
  readonly reason: MovementRejectionReason;
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
    throw new Error(`MovementAuthority: ${field} must be a non-negative safe integer`);
  }
}

/** Pure headless server-authoritative movement validator. */
export class MovementAuthority {
  private readonly maxSpeedPerTick: number;

  private pos: Position = { x: 0, y: 0, z: 0 };
  private _lastTick = 0;
  private _acceptedCount = 0;
  private _lastRejection: RejectionInfo | null = null;
  private spawned = false;

  constructor(options: MovementAuthorityOptions) {
    const v = options.maxSpeedPerTick;
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error('MovementAuthority: maxSpeedPerTick must be a positive finite number');
    }
    this.maxSpeedPerTick = v;
  }

  /** Initial placement of the player (equivalent to a teleport at the given tick). */
  spawn(position: Position, tick: number): void {
    if (!isFinitePosition(position)) {
      throw new Error('MovementAuthority: spawn position must be finite numbers');
    }
    validateTick(tick, 'spawn tick');
    this.pos = { ...position };
    this._lastTick = tick;
    this._acceptedCount = 0;
    this._lastRejection = null;
    this.spawned = true;
  }

  /**
   * Validate a client movement intent. Malformed inputs throw. A stale tick (<= lastTick)
   * or a displacement exceeding `maxSpeedPerTick` returns a correction equal to the current
   * authoritative position (state unchanged). Otherwise the intent is accepted and the
   * authoritative position advances.
   */
  submitIntent(position: Position, tick: number): MovementResult {
    if (!isFinitePosition(position)) {
      throw new Error('MovementAuthority: intent position must be finite numbers');
    }
    validateTick(tick, 'intent tick');
    if (!this.spawned || tick <= this._lastTick) {
      this._lastRejection = { tick, reason: 'stale tick' };
      return { accepted: false, correction: { ...this.pos }, reason: 'stale tick' };
    }
    const dx = position.x - this.pos.x;
    const dy = position.y - this.pos.y;
    const dz = position.z - this.pos.z;
    const displacement = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (displacement > this.maxSpeedPerTick) {
      this._lastRejection = { tick, reason: 'speed limit' };
      return { accepted: false, correction: { ...this.pos }, reason: 'speed limit' };
    }
    this.pos = { ...position };
    this._lastTick = tick;
    this._acceptedCount++;
    this._lastRejection = null;
    return { accepted: true, position: { ...this.pos } };
  }

  /** Server-initiated reposition; sets the authoritative position and tick. */
  teleport(position: Position, tick: number): void {
    if (!isFinitePosition(position)) {
      throw new Error('MovementAuthority: teleport position must be finite numbers');
    }
    validateTick(tick, 'teleport tick');
    this.pos = { ...position };
    this._lastTick = tick;
  }

  /** The authoritative position (copy). */
  get position(): Position {
    return { ...this.pos };
  }

  /** The last accepted tick (0 before spawn). */
  get lastTick(): number {
    return this._lastTick;
  }

  /** Number of accepted intents since the last spawn/reset. */
  get acceptedCount(): number {
    return this._acceptedCount;
  }

  /** The most recent rejection (tick + reason), or null. */
  get lastRejection(): RejectionInfo | null {
    return this._lastRejection === null ? null : { ...this._lastRejection };
  }

  /** Restore the pristine pre-spawn state. */
  reset(): void {
    this.pos = { x: 0, y: 0, z: 0 };
    this._lastTick = 0;
    this._acceptedCount = 0;
    this._lastRejection = null;
    this.spawned = false;
  }
}
