/**
 * Recorded input / tick-seed replay recording (241). A `ReplayRecording` is plain, serializable
 * data that fully determines a headless simulation run: the world seed, the `maxTick` to run, the
 * input events applied before each tick, and the named RNG-stream states at the start of every tick.
 * `validateReplayRecording` accepts exactly the documented shape and rejects malformed or partial
 * recordings atomically with descriptive `ReplayRecording: <detail>` errors. A `ReplayRecorder`
 * captures inputs and per-tick seed states from a driven scenario deterministically. Pure and
 * headless-safe: no IO, no mutable shared state beyond a recorder instance.
 */

/** The current replay recording format version. A future format change MUST increment it and the
 *  verifier MUST refuse to run an unsupported version. */
export const REPLAY_RECORDING_VERSION = 1;

/** JSON-serializable plain-data payload carried by an input event. */
export type ReplayInputPayload = unknown;

/** An input event applied before a tick. `tick` 0 means pre-simulation setup before tick 1. */
export interface ReplayInputEvent {
  readonly tick: number;
  /** Non-negative ordering within a tick. */
  readonly seq: number;
  /** Non-empty event type, e.g. 'block_place' | 'block_break' | 'player_move'. */
  readonly type: string;
  readonly payload: ReplayInputPayload;
}

/** One named RNG stream's uint32 state at the start of a tick. */
export interface ReplayStreamState {
  readonly stream: string;
  readonly state: number;
}

/** The named-stream states at the start of one tick. */
export interface ReplayTickSeed {
  readonly tick: number;
  readonly seeds: readonly ReplayStreamState[];
}

/** A validated replay recording. */
export interface ReplayRecording {
  /** Positive integer recording-format version. */
  readonly version: number;
  /** Non-empty scenario identifier (fixture key). */
  readonly schema: string;
  /** uint32 world seed. */
  readonly initialSeed: number;
  /** Positive integer; the recording covers ticks 1..maxTick. */
  readonly maxTick: number;
  /** Sorted ascending by `(tick, seq)`, no duplicates. */
  readonly inputs: readonly ReplayInputEvent[];
  /** Exactly one entry per tick in [1, maxTick], sorted ascending by tick. */
  readonly tickSeeds: readonly ReplayTickSeed[];
}

function isUint32(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
}

/**
 * True when `value` is JSON-serializable plain data: null/undefined/booleans/finite numbers/
 * strings/arrays/plain objects, with functions, symbols, bigint, NaN, ±Infinity, Date/Map/Set,
 * class instances, and cyclic structures rejected.
 */
function isPlainData(value: unknown): boolean {
  const seen = new Set<object>();
  const visit = (v: unknown): boolean => {
    if (v === null || v === undefined) return true;
    const t = typeof v;
    if (t === 'boolean' || t === 'string') return true;
    if (t === 'number') return Number.isFinite(v);
    if (t === 'function' || t === 'symbol' || t === 'bigint') return false;
    if (t !== 'object') return false;
    if (v instanceof Date || v instanceof Map || v instanceof Set) return false;
    if (seen.has(v)) return false; // cycle
    seen.add(v);
    if (Array.isArray(v)) {
      for (const element of v) {
        if (!visit(element)) {
          seen.delete(v);
          return false;
        }
      }
    } else {
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) {
        seen.delete(v);
        return false;
      }
      for (const key of Object.keys(v)) {
        if (!visit((v as Record<string, unknown>)[key])) {
          seen.delete(v);
          return false;
        }
      }
    }
    seen.delete(v);
    return true;
  };
  return visit(value);
}

function validateInputEvent(value: unknown, index: number, maxTick: number): ReplayInputEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`ReplayRecording: inputs ${index} must be an object`);
  }
  const e = value as Record<string, unknown>;
  if (!Number.isInteger(e.tick) || (e.tick as number) < 0 || (e.tick as number) > maxTick) {
    throw new Error(
      `ReplayRecording: inputs ${index}.tick must be an integer in [0, maxTick], got ${String(e.tick)}`,
    );
  }
  if (!Number.isInteger(e.seq) || (e.seq as number) < 0) {
    throw new Error(`ReplayRecording: inputs ${index}.seq must be a non-negative integer, got ${String(e.seq)}`);
  }
  if (typeof e.type !== 'string' || e.type.length === 0) {
    throw new Error(`ReplayRecording: inputs ${index}.type must be a non-empty string`);
  }
  if (!isPlainData(e.payload)) {
    throw new Error(`ReplayRecording: inputs ${index}.payload must be JSON-serializable plain data`);
  }
  return { tick: e.tick as number, seq: e.seq as number, type: e.type, payload: e.payload };
}

function validateTickSeed(value: unknown, index: number, maxTick: number): ReplayTickSeed {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`ReplayRecording: tickSeeds ${index} must be an object`);
  }
  const t = value as Record<string, unknown>;
  if (!Number.isInteger(t.tick) || (t.tick as number) < 1 || (t.tick as number) > maxTick) {
    throw new Error(
      `ReplayRecording: tickSeeds ${index}.tick must be an integer in [1, maxTick], got ${String(t.tick)}`,
    );
  }
  if (!Array.isArray(t.seeds)) {
    throw new Error(`ReplayRecording: tickSeeds ${index}.seeds must be an array`);
  }
  const seeds: ReplayStreamState[] = [];
  const seenStreams = new Set<string>();
  for (let i = 0; i < t.seeds.length; i++) {
    const s = t.seeds[i];
    if (typeof s !== 'object' || s === null || Array.isArray(s)) {
      throw new Error(`ReplayRecording: tickSeeds ${index}.seeds ${i} must be an object`);
    }
    const st = s as Record<string, unknown>;
    if (typeof st.stream !== 'string' || st.stream.length === 0) {
      throw new Error(`ReplayRecording: tickSeeds ${index}.seeds ${i}.stream must be a non-empty string`);
    }
    if (!isUint32(st.state)) {
      throw new Error(
        `ReplayRecording: tickSeeds ${index}.seeds ${i}.state must be a uint32, got ${String(st.state)}`,
      );
    }
    if (seenStreams.has(st.stream)) {
      throw new Error(`ReplayRecording: tickSeeds ${index} has duplicate stream '${st.stream}'`);
    }
    seenStreams.add(st.stream);
    seeds.push({ stream: st.stream, state: st.state });
  }
  return { tick: t.tick as number, seeds };
}

/**
 * Validate an unknown value as a replay recording; throws a descriptive `ReplayRecording: <detail>`
 * error and returns no partial result on any failure. On success returns the recording narrowed to
 * `ReplayRecording`.
 */
export function validateReplayRecording(input: unknown): ReplayRecording {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('ReplayRecording: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (!Number.isInteger(r.version) || (r.version as number) <= 0) {
    throw new Error(`ReplayRecording: version must be a positive integer, got ${String(r.version)}`);
  }
  if (typeof r.schema !== 'string' || r.schema.length === 0) {
    throw new Error('ReplayRecording: schema must be a non-empty string');
  }
  if (!isUint32(r.initialSeed)) {
    throw new Error(`ReplayRecording: initialSeed must be a uint32, got ${String(r.initialSeed)}`);
  }
  if (!Number.isInteger(r.maxTick) || (r.maxTick as number) <= 0) {
    throw new Error(`ReplayRecording: maxTick must be a positive integer, got ${String(r.maxTick)}`);
  }
  if (!Array.isArray(r.inputs)) {
    throw new Error('ReplayRecording: inputs must be an array');
  }
  if (!Array.isArray(r.tickSeeds)) {
    throw new Error('ReplayRecording: tickSeeds must be an array');
  }
  const maxTick = r.maxTick as number;

  // Validate inputs (event shape, plain-data payload, no duplicates, sorted ascending by (tick, seq)).
  const inputs: ReplayInputEvent[] = [];
  const seenInputs = new Set<string>();
  for (let i = 0; i < r.inputs.length; i++) {
    const event = validateInputEvent(r.inputs[i], i, maxTick);
    const key = `${event.tick}|${event.seq}|${event.type}|${JSON.stringify(event.payload)}`;
    if (seenInputs.has(key)) {
      throw new Error(`ReplayRecording: duplicate input event at index ${i}`);
    }
    seenInputs.add(key);
    inputs.push(event);
  }
  for (let i = 1; i < inputs.length; i++) {
    const prev = inputs[i - 1] as ReplayInputEvent;
    const cur = inputs[i] as ReplayInputEvent;
    if (cur.tick < prev.tick || (cur.tick === prev.tick && cur.seq < prev.seq)) {
      throw new Error(
        `ReplayRecording: inputs must be sorted ascending by (tick, seq); index ${i} is out of order`,
      );
    }
  }

  // Validate tick seeds (shape, full coverage of [1, maxTick], unique ticks, unique streams per tick).
  const tickSeeds: ReplayTickSeed[] = [];
  for (let i = 0; i < r.tickSeeds.length; i++) {
    tickSeeds.push(validateTickSeed(r.tickSeeds[i], i, maxTick));
  }
  const seenTicks = new Set<number>();
  for (const ts of tickSeeds) {
    if (seenTicks.has(ts.tick)) {
      throw new Error(`ReplayRecording: duplicate tick seed for tick ${ts.tick}`);
    }
    seenTicks.add(ts.tick);
  }
  for (let tick = 1; tick <= maxTick; tick++) {
    if (!seenTicks.has(tick)) {
      throw new Error(`ReplayRecording: missing_seed — no tick seed for tick ${tick}`);
    }
  }
  for (let i = 1; i < tickSeeds.length; i++) {
    if ((tickSeeds[i] as ReplayTickSeed).tick < (tickSeeds[i - 1] as ReplayTickSeed).tick) {
      throw new Error('ReplayRecording: tickSeeds must be sorted ascending by tick');
    }
  }

  return {
    version: r.version as number,
    schema: r.schema,
    initialSeed: r.initialSeed as number,
    maxTick,
    inputs,
    tickSeeds,
  };
}

/**
 * Captures inputs and per-tick named-stream states from a driven scenario. `capture()` validates
 * the accumulated state (throwing rather than emitting a malformed recording) and freezes it into a
 * `ReplayRecording`. Capturing the same scenario twice yields structurally equal recordings.
 */
export class ReplayRecorder {
  private readonly initialSeed: number;
  private readonly maxTick: number;
  private readonly schema: string;
  private readonly inputs: ReplayInputEvent[] = [];
  private readonly tickSeeds: ReplayTickSeed[] = [];

  constructor(options: { initialSeed: number; maxTick: number; schema: string }) {
    if (!isUint32(options.initialSeed)) {
      throw new Error(`ReplayRecorder: initialSeed must be a uint32, got ${String(options.initialSeed)}`);
    }
    if (!Number.isInteger(options.maxTick) || options.maxTick <= 0) {
      throw new Error(`ReplayRecorder: maxTick must be a positive integer, got ${String(options.maxTick)}`);
    }
    if (typeof options.schema !== 'string' || options.schema.length === 0) {
      throw new Error('ReplayRecorder: schema must be a non-empty string');
    }
    this.initialSeed = options.initialSeed;
    this.maxTick = options.maxTick;
    this.schema = options.schema;
  }

  /** Record an input event as applied to the scenario. */
  recordInput(event: ReplayInputEvent): void {
    this.inputs.push({ ...event });
  }

  /** Record the named-stream states at the start of `tick`. */
  recordTickSeed(tick: number, seeds: ReadonlyArray<ReplayStreamState>): void {
    this.tickSeeds.push({ tick, seeds: seeds.map((s) => ({ ...s })) });
  }

  /** Validate and return the accumulated recording; throws on invalid accumulated state. */
  capture(): ReplayRecording {
    return validateReplayRecording({
      version: REPLAY_RECORDING_VERSION,
      schema: this.schema,
      initialSeed: this.initialSeed,
      maxTick: this.maxTick,
      inputs: this.inputs,
      tickSeeds: this.tickSeeds,
    });
  }
}
