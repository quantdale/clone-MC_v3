/**
 * Connection lifecycle state machine (225): a pure, headless model of a client/server
 * connection — connect, transport-up, handshake with login-like local profile, keepalive,
 * graceful and remote disconnect, and phase timeouts evaluated on scripted wall time.
 * Strict per-event source-state validation throws descriptive `ConnectionLifecycle: ...`
 * errors and changes nothing. Every state-changing transition is recorded in a bounded
 * log with its scripted timestamp. No transport, no timers, no IO; fully unit-testable
 * headlessly with scripted time.
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'handshaking'
  | 'connected'
  | 'disconnecting';

export interface ConnectionLifecycleOptions {
  /** Connect phase timeout ms (default 10000). */
  readonly connectTimeoutMs?: number;
  /** Handshake phase timeout ms (default 10000). */
  readonly handshakeTimeoutMs?: number;
  /** Keepalive timeout ms while connected (default 30000). */
  readonly keepAliveTimeoutMs?: number;
  /** Bounded transition-log size (default 32; oldest records are dropped). */
  readonly historyLimit?: number;
}

export interface TransitionRecord {
  /** Scripted ms when the transition applied (0 before any `update` was fed). */
  readonly at: number;
  readonly from: ConnectionState;
  readonly to: ConnectionState;
  readonly reason?: string;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10000;
const DEFAULT_KEEPALIVE_TIMEOUT_MS = 30000;
const DEFAULT_HISTORY_LIMIT = 32;

function validateDuration(value: number | undefined, field: string, fallback: number): number {
  const v = value ?? fallback;
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`ConnectionLifecycle: ${field} must be a positive finite number`);
  }
  return v;
}

function validateLimit(value: number | undefined): number {
  const v = value ?? DEFAULT_HISTORY_LIMIT;
  if (!Number.isInteger(v) || v <= 0) {
    throw new Error('ConnectionLifecycle: historyLimit must be a positive integer');
  }
  return v;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Pure headless connection lifecycle state machine. */
export class ConnectionLifecycle {
  private readonly connectTimeoutMs: number;
  private readonly handshakeTimeoutMs: number;
  private readonly keepAliveTimeoutMs: number;
  private readonly historyLimit: number;

  private state_: ConnectionState = 'disconnected';
  private profile_: string | null = null;
  private reason_: string | null = null;
  private keepAliveCount_ = 0;
  private history_: TransitionRecord[] = [];
  private connectAt = 0;
  private handshakeAt = 0;
  private lastKeepAliveAt = 0;
  private lastNow = 0;
  private timeFed = false;

  constructor(options: ConnectionLifecycleOptions = {}) {
    this.connectTimeoutMs = validateDuration(
      options.connectTimeoutMs,
      'connectTimeoutMs',
      DEFAULT_CONNECT_TIMEOUT_MS,
    );
    this.handshakeTimeoutMs = validateDuration(
      options.handshakeTimeoutMs,
      'handshakeTimeoutMs',
      DEFAULT_HANDSHAKE_TIMEOUT_MS,
    );
    this.keepAliveTimeoutMs = validateDuration(
      options.keepAliveTimeoutMs,
      'keepAliveTimeoutMs',
      DEFAULT_KEEPALIVE_TIMEOUT_MS,
    );
    this.historyLimit = validateLimit(options.historyLimit);
  }

  /** disconnected -> connecting. Arms the connect timeout. Optional non-empty profile. */
  connect(profile?: string): void {
    if (this.state_ !== 'disconnected') {
      throw new Error(`ConnectionLifecycle: cannot connect from ${this.state_}`);
    }
    if (profile !== undefined && !isNonEmptyString(profile)) {
      throw new Error('ConnectionLifecycle: profile must be a non-empty string');
    }
    this.transition('connecting');
    this.reason_ = null;
    this.profile_ = profile ?? null;
    this.keepAliveCount_ = 0;
    this.connectAt = this.now();
  }

  /** connecting -> handshaking. Transport established; arms the handshake timeout. */
  connected(): void {
    if (this.state_ !== 'connecting') {
      throw new Error(`ConnectionLifecycle: cannot connected from ${this.state_}`);
    }
    this.transition('handshaking');
    this.handshakeAt = this.now();
  }

  /** handshaking -> connected. Accepts the handshake; arms the keepalive timeout. */
  handshakeAccepted(profile?: string): void {
    if (this.state_ !== 'handshaking') {
      throw new Error(`ConnectionLifecycle: cannot handshakeAccepted from ${this.state_}`);
    }
    if (profile !== undefined && !isNonEmptyString(profile)) {
      throw new Error('ConnectionLifecycle: profile must be a non-empty string');
    }
    this.transition('connected');
    this.lastKeepAliveAt = this.now();
    if (profile !== undefined) {
      this.profile_ = profile;
    }
  }

  /** handshaking -> disconnected. Rejects the handshake with a non-empty reason. */
  handshakeRejected(reason: string): void {
    if (this.state_ !== 'handshaking') {
      throw new Error(`ConnectionLifecycle: cannot handshakeRejected from ${this.state_}`);
    }
    if (!isNonEmptyString(reason)) {
      throw new Error('ConnectionLifecycle: reason must be a non-empty string');
    }
    this.transition('disconnected', reason);
  }

  /** connected -> connected (refresh). Increments the keepalive counter and deadline. */
  keepAliveReceived(): void {
    if (this.state_ !== 'connected') {
      throw new Error(`ConnectionLifecycle: cannot keepAliveReceived from ${this.state_}`);
    }
    this.keepAliveCount_++;
    this.lastKeepAliveAt = this.now();
  }

  /** connecting/handshaking/connected -> disconnecting (graceful; then disconnectComplete). */
  disconnect(): void {
    if (
      this.state_ !== 'connecting' &&
      this.state_ !== 'handshaking' &&
      this.state_ !== 'connected'
    ) {
      throw new Error(`ConnectionLifecycle: cannot disconnect from ${this.state_}`);
    }
    this.transition('disconnecting', 'local disconnect');
  }

  /** disconnecting -> disconnected. Completes a graceful disconnect. */
  disconnectComplete(): void {
    if (this.state_ !== 'disconnecting') {
      throw new Error(`ConnectionLifecycle: cannot disconnectComplete from ${this.state_}`);
    }
    this.transition('disconnected', 'disconnected');
  }

  /** Any active state -> disconnected. Records the given non-empty reason. */
  remoteDisconnect(reason: string): void {
    if (
      this.state_ !== 'connecting' &&
      this.state_ !== 'handshaking' &&
      this.state_ !== 'connected' &&
      this.state_ !== 'disconnecting'
    ) {
      throw new Error(`ConnectionLifecycle: cannot remoteDisconnect from ${this.state_}`);
    }
    if (!isNonEmptyString(reason)) {
      throw new Error('ConnectionLifecycle: reason must be a non-empty string');
    }
    this.transition('disconnected', reason);
  }

  /**
   * Evaluate phase timeouts with scripted wall time. Expires `connecting` (connect timeout),
   * `handshaking` (handshake timeout), and `connected` (keepalive timeout) at the inclusive
   * `nowMs - deadline >= timeoutMs` boundary. Non-finite or backward timestamps are a no-op.
   */
  update(nowMs: number): void {
    if (!Number.isFinite(nowMs)) return;
    if (this.timeFed && nowMs < this.lastNow) return;
    this.lastNow = nowMs;
    this.timeFed = true;
    if (this.state_ === 'connecting' && nowMs - this.connectAt >= this.connectTimeoutMs) {
      this.transition('disconnected', 'connect timeout');
    } else if (
      this.state_ === 'handshaking' &&
      nowMs - this.handshakeAt >= this.handshakeTimeoutMs
    ) {
      this.transition('disconnected', 'handshake timeout');
    } else if (
      this.state_ === 'connected' &&
      nowMs - this.lastKeepAliveAt >= this.keepAliveTimeoutMs
    ) {
      this.transition('disconnected', 'keepalive timeout');
    }
  }

  /** Restore the pristine disconnected state (state, profile, reason, counters, history,
   *  and fed-time all cleared). */
  reset(): void {
    this.state_ = 'disconnected';
    this.profile_ = null;
    this.reason_ = null;
    this.keepAliveCount_ = 0;
    this.history_ = [];
    this.connectAt = 0;
    this.handshakeAt = 0;
    this.lastKeepAliveAt = 0;
    this.lastNow = 0;
    this.timeFed = false;
  }

  /** The current connection state. */
  get state(): ConnectionState {
    return this.state_;
  }

  /** The reason of the last disconnect (timeout, remote, or completed graceful), if any. */
  get reason(): string | null {
    return this.reason_;
  }

  /** The active profile label, if any. */
  get profile(): string | null {
    return this.profile_;
  }

  /** Keepalives received since the last `connect()`. */
  get keepAliveCount(): number {
    return this.keepAliveCount_;
  }

  /** Snapshot of the bounded transition log, oldest first. */
  get history(): readonly TransitionRecord[] {
    return [...this.history_];
  }

  /** Scripted current time (0 until the first `update`). */
  private now(): number {
    return this.timeFed ? this.lastNow : 0;
  }

  /** Append a bounded history record and apply the new state. A transition with a reason
   *  updates `reason`; reaching `disconnected` clears the active profile. */
  private transition(to: ConnectionState, reason?: string): void {
    const record: TransitionRecord = {
      at: this.now(),
      from: this.state_,
      to,
      ...(reason !== undefined ? { reason } : {}),
    };
    this.history_.push(record);
    if (this.history_.length > this.historyLimit) {
      this.history_.shift();
    }
    this.state_ = to;
    if (reason !== undefined) {
      this.reason_ = reason;
    }
    if (to === 'disconnected') {
      this.profile_ = null;
    }
  }
}
