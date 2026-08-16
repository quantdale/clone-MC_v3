/**
 * Network adversarial validation guard (237): a pure, headless, transport-agnostic
 * cross-cutting adversarial contract over the 223 wire envelope and per-connection
 * message dispatch. It composes:
 *
 *   - `MessageSequenceGuard` — per-connection monotonic message-sequence replay/ordering
 *     detection ('duplicate' / 'out_of_order'), reset on disconnect/reconnect so a
 *     post-reconnect sequence restarts from 0 (aligned with 225 `ConnectionLifecycle.reset()`).
 *   - `MessageRateLimiter` — per-message-kind tick-window rate policy ('rate_limited'),
 *     deterministic on the fixed 20 TPS tick clock.
 *   - bounded-domain helpers — `boundedString` / `boundedArray` / `boundedCollection`
 *     enforce `maxStringLength` / `maxArrayLength` / `maxCollectionItems` bounds
 *     ('oversized_field').
 *
 * `AdversarialMessageGuard.inspectIncoming` composes 223 `decodeMessage` + sequence +
 * domain + rate checks into a typed `InspectResult`. It is the dispatch gate: when the
 * result carries `dispatch: true`, the caller routes `name`/`values` to the appropriate
 * typed validator (227/230/231/232/233, etc.). It does NOT replace the typed validators'
 * documented rejection reasons; it adds new guard-only reasons
 * ('duplicate_message' / 'out_of_order' / 'rate_limited' / 'oversized_field') for checks no
 * module performs uniformly.
 *
 * The guard is scalar-field aware at the wire layer (223 `WireValue` is boolean|number|
 * string; numeric fields are already validated for safe-int/finite by the codec). Array
 * bounds for typed request collections (229 `trackedData`, 226 `sections`/`data`) are
 * enforced by those modules' own additive, configurable caps (see those modules).
 *
 * No DOM, THREE, transport, timers, or IO; time is tick-based. Fully unit-testable headlessly.
 */

import {
  decodeMessage,
  type NetworkProtocol,
  type WireEnvelope,
  type WireValue,
} from './NetworkProtocol';

// ────────────────────────────────────────────────────────────────────────────
// MessageSequenceGuard
// ────────────────────────────────────────────────────────────────────────────

export type SequenceResult = 'accept' | 'duplicate' | 'out_of_order';

/**
 * Per-connection monotonic message-sequence tracker. `track(sequence)` returns
 * 'duplicate' for a replayed (equal) sequence, 'out_of_order' for a lower sequence, and
 * 'accept' for a strictly greater sequence (advancing `lastAccepted`). `reset()` returns
 * `lastAccepted` to 0 so a reconnect starts a fresh sequence epoch.
 */
export class MessageSequenceGuard {
  private lastAccepted_ = 0;

  /** The last accepted sequence (0 before any accept). */
  get lastAccepted(): number {
    return this.lastAccepted_;
  }

  /** Track a sequence. Requires a non-negative safe integer; malformed input throws. */
  track(sequence: number): SequenceResult {
    if (!Number.isSafeInteger(sequence) || sequence < 0) {
      throw new Error('NetworkAdversarial: sequence must be a non-negative safe integer');
    }
    if (sequence === this.lastAccepted_) {
      return 'duplicate';
    }
    if (sequence < this.lastAccepted_) {
      return 'out_of_order';
    }
    this.lastAccepted_ = sequence;
    return 'accept';
  }

  /** Reset to a fresh sequence epoch (called on disconnect/reconnect, matching 225 reset). */
  reset(): void {
    this.lastAccepted_ = 0;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MessageRateLimiter
// ────────────────────────────────────────────────────────────────────────────

/** A tick-window rate policy: at most `maxPerWindow` submissions within `windowTicks`. */
export interface RateLimit {
  readonly maxPerWindow: number;
  readonly windowTicks: number;
}

const DEFAULT_RATE_LIMIT: RateLimit = { maxPerWindow: 40, windowTicks: 20 };

function validateRateLimit(limit: unknown, label: string): RateLimit {
  if (typeof limit !== 'object' || limit === null) {
    throw new Error(`NetworkAdversarial: ${label} must be an object`);
  }
  const l = limit as Record<string, unknown>;
  if (!Number.isSafeInteger(l.maxPerWindow) || (l.maxPerWindow as number) <= 0) {
    throw new Error(`NetworkAdversarial: ${label}.maxPerWindow must be a positive integer`);
  }
  if (!Number.isSafeInteger(l.windowTicks) || (l.windowTicks as number) <= 0) {
    throw new Error(`NetworkAdversarial: ${label}.windowTicks must be a positive integer`);
  }
  return { maxPerWindow: l.maxPerWindow as number, windowTicks: l.windowTicks as number };
}

/**
 * Per-message-kind tick-window rate limiter. `submit(kind, tick)` returns `true` while the
 * count of `kind` in the last `windowTicks` ticks is below `maxPerWindow`, and `false`
 * (mapped to 'rate_limited') once the window is full, WITHOUT incrementing the count.
 * Windows slide with tick so a burst followed by quiescence re-opens. Unconfigured kinds
 * use `defaultLimit`; per-kind overrides are applied on top.
 */
export class MessageRateLimiter {
  private readonly defaultLimit: RateLimit;
  private readonly limits: ReadonlyMap<string, RateLimit>;
  private readonly submissions = new Map<string, number[]>();

  constructor(
    limits: Partial<Record<string, RateLimit>> = {},
    defaultLimit: RateLimit = DEFAULT_RATE_LIMIT,
  ) {
    this.defaultLimit = validateRateLimit(defaultLimit, 'defaultLimit');
    if (typeof limits !== 'object' || limits === null) {
      throw new Error('NetworkAdversarial: limits must be an object');
    }
    const map = new Map<string, RateLimit>();
    for (const [kind, limit] of Object.entries(limits)) {
      if (kind.length === 0) {
        throw new Error('NetworkAdversarial: rate-limit kind must be a non-empty string');
      }
      map.set(kind, validateRateLimit(limit, `limits.${kind}`));
    }
    this.limits = map;
  }

  /**
   * Record a submission of `kind` at `tick`. Returns `true` when allowed, `false` when the
   * window is full (rate-limited). A rejected submission is not counted. Malformed input
   * (non-string/empty kind, non-negative-integer-unsafe tick) throws.
   */
  submit(kind: string, tick: number): boolean {
    if (typeof kind !== 'string' || kind.length === 0) {
      throw new Error('NetworkAdversarial: kind must be a non-empty string');
    }
    if (!Number.isSafeInteger(tick) || tick < 0) {
      throw new Error('NetworkAdversarial: tick must be a non-negative safe integer');
    }
    const limit = this.limits.get(kind) ?? this.defaultLimit;
    let window = this.submissions.get(kind);
    if (window === undefined) {
      window = [];
      this.submissions.set(kind, window);
    }
    // Prune submissions outside the last `windowTicks` ticks (exclusive lower bound).
    const threshold = tick - limit.windowTicks;
    while (window.length > 0 && window[0]! <= threshold) {
      window.shift();
    }
    if (window.length >= limit.maxPerWindow) {
      return false;
    }
    window.push(tick);
    return true;
  }

  /** The current per-kind window count (for diagnostics/tests). */
  count(kind: string): number {
    return this.submissions.get(kind)?.length ?? 0;
  }

  /** Clear every counter (fresh epoch). */
  reset(): void {
    this.submissions.clear();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Bounded-domain helpers
// ────────────────────────────────────────────────────────────────────────────

/** True when the string is within the `max` length bound. */
export function boundedString(value: string, max: number): boolean {
  return typeof value === 'string' && value.length <= max;
}

/** True when the array is within the `max` length bound. */
export function boundedArray(value: readonly unknown[], max: number): boolean {
  return Array.isArray(value) && value.length <= max;
}

/** True when the total items across a collection do not exceed `max`. */
export function boundedCollection(items: readonly unknown[], max: number): boolean {
  return Array.isArray(items) && items.length <= max;
}

// ────────────────────────────────────────────────────────────────────────────
// AdversarialMessageGuard
// ────────────────────────────────────────────────────────────────────────────

export interface AdversarialGuardOptions {
  /** Default per-kind rate limit (default `{ maxPerWindow: 40, windowTicks: 20 }`). */
  readonly defaultLimit?: RateLimit;
  /** Per-message-kind rate-limit overrides. */
  readonly limits?: Partial<Record<string, RateLimit>>;
  /** Max decoded string field length (default 4096). */
  readonly maxStringLength?: number;
  /** Max array length for array-valued request fields (default 1024). */
  readonly maxArrayLength?: number;
  /** Max total nested collection items (default 65536). */
  readonly maxCollectionItems?: number;
}

export type InspectRejectReason =
  | 'unknown_message_id'
  | 'malformed_fields'
  | 'oversized_field'
  | 'duplicate_message'
  | 'out_of_order'
  | 'rate_limited';

export type InspectResult =
  | {
      readonly dispatch: true;
      readonly name: string;
      readonly values: Readonly<Record<string, WireValue>>;
    }
  | { readonly dispatch: false; readonly reason: InspectRejectReason };

const DEFAULT_MAX_STRING_LENGTH = 4096;
const DEFAULT_MAX_ARRAY_LENGTH = 1024;
const DEFAULT_MAX_COLLECTION_ITEMS = 65536;

function validateNonNegSafeInt(value: number | undefined, fallback: number, label: string): number {
  const v = value ?? fallback;
  if (!Number.isSafeInteger(v) || v <= 0) {
    throw new Error(`NetworkAdversarial: ${label} must be a positive integer`);
  }
  return v;
}

/**
 * Composed adversarial guard: sequence + 223 decode + domain bounds + rate limiting over an
 * incoming wire envelope at a given tick. Transport-agnostic; `sequence` is supplied by the
 * dispatch layer (undefined disables the sequence check).
 */
export class AdversarialMessageGuard {
  private readonly maxStringLength: number;
  private readonly maxArrayLength: number;
  private readonly maxCollectionItems: number;
  private readonly rateLimiter: MessageRateLimiter;
  private readonly sequenceGuard = new MessageSequenceGuard();

  constructor(options: AdversarialGuardOptions = {}) {
    this.maxStringLength = validateNonNegSafeInt(
      options.maxStringLength,
      DEFAULT_MAX_STRING_LENGTH,
      'maxStringLength',
    );
    this.maxArrayLength = validateNonNegSafeInt(
      options.maxArrayLength,
      DEFAULT_MAX_ARRAY_LENGTH,
      'maxArrayLength',
    );
    this.maxCollectionItems = validateNonNegSafeInt(
      options.maxCollectionItems,
      DEFAULT_MAX_COLLECTION_ITEMS,
      'maxCollectionItems',
    );
    this.rateLimiter = new MessageRateLimiter(options.limits, options.defaultLimit);
  }

  /** The composed per-kind rate limiter (for diagnostics/tests). */
  get rateLimits(): MessageRateLimiter {
    return this.rateLimiter;
  }

  /** The connection-scoped message-sequence guard (for diagnostics/tests). */
  get sequence(): MessageSequenceGuard {
    return this.sequenceGuard;
  }

  /** The configured max string field length. */
  get maxString(): number {
    return this.maxStringLength;
  }

  /** The configured max array length. */
  get maxArray(): number {
    return this.maxArrayLength;
  }

  /** The configured max total collection items. */
  get maxCollection(): number {
    return this.maxCollectionItems;
  }

  /**
   * Inspect an incoming wire envelope. Check order: sequence (when `sequence` is provided)
   * -> 223 decode -> domain bounds -> rate limit -> dispatch. Returns `dispatch: true` with
   * the decoded typed record when every check passes; otherwise `dispatch: false` with the
   * guard-only reason. No authoritative state is mutated by any rejected inspection.
   */
  inspectIncoming(
    protocol: NetworkProtocol,
    envelope: WireEnvelope,
    tick: number,
    sequence?: number,
  ): InspectResult {
    if (!Number.isSafeInteger(tick) || tick < 0) {
      throw new Error('NetworkAdversarial: tick must be a non-negative safe integer');
    }
    if (sequence !== undefined) {
      const seqResult = this.sequenceGuard.track(sequence);
      if (seqResult === 'duplicate') {
        return { dispatch: false, reason: 'duplicate_message' };
      }
      if (seqResult === 'out_of_order') {
        return { dispatch: false, reason: 'out_of_order' };
      }
    }

    const known = protocol.messages.some((m) => m.id === envelope.messageId);
    if (!known) {
      return { dispatch: false, reason: 'unknown_message_id' };
    }
    const decoded = decodeMessage(protocol, envelope);
    if (decoded === null) {
      return { dispatch: false, reason: 'malformed_fields' };
    }

    for (const value of Object.values(decoded.values)) {
      if (typeof value === 'string' && !boundedString(value, this.maxStringLength)) {
        return { dispatch: false, reason: 'oversized_field' };
      }
      if (Array.isArray(value) && !boundedArray(value, this.maxArrayLength)) {
        return { dispatch: false, reason: 'oversized_field' };
      }
    }

    if (!this.rateLimiter.submit(decoded.name, tick)) {
      return { dispatch: false, reason: 'rate_limited' };
    }

    return { dispatch: true, name: decoded.name, values: decoded.values };
  }

  /** Reset the sequence guard and every rate counter (fresh connection epoch). */
  reset(): void {
    this.sequenceGuard.reset();
    this.rateLimiter.reset();
  }
}
