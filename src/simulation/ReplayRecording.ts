/**
 * Replay recording contract (replay-recording spec, 241).
 *
 * A recording is plain, serializable data that fully determines a headless
 * simulation run: the world seed, the `maxTick` to run, the input events applied
 * before each tick, and the named RNG-stream states (`SeedRng.state`) at the
 * start of every tick. `validateReplayRecording` accepts exactly the documented
 * shape and rejects malformed or partial recordings atomically with descriptive
 * `ReplayRecording: <detail>` errors. A `ReplayRecorder` captures inputs and
 * per-tick seed states from a driven scenario and is deterministic.
 *
 * Pure and headless-safe: no DOM, no timers, no IO, no external deps.
 */

const UINT32_MAX = 0xffffffff;

/** JSON-serializable plain-data payload for a replay input event. */
export type ReplayInputPayload = unknown;

/** An input applied before a tick. `tick` 0 = pre-simulation setup; else 1..maxTick. */
export interface ReplayInputEvent {
  readonly tick: number;
  readonly seq: number;
  readonly type: string;
  readonly payload: ReplayInputPayload;
}

/** A named-stream state captured at the start of a tick. */
export interface ReplayTickSeedEntry {
  readonly stream: string;
  readonly state: number;
}

/** Pre-tick named-stream states for one tick. */
export interface ReplayTickSeed {
  readonly tick: number;
  readonly seeds: ReadonlyArray<ReplayTickSeedEntry>;
}

/** A validated, plain-data replay recording. */
export interface ReplayRecording {
  readonly version: number;
  readonly schema: string;
  readonly initialSeed: number;
  readonly maxTick: number;
  readonly inputs: readonly ReplayInputEvent[];
  readonly tickSeeds: readonly ReplayTickSeed[];
}

/** Thrown by validation with a descriptive `ReplayRecording: <detail>` message. */
export class ReplayRecordingError extends Error {
  constructor(detail: string) {
    super(`ReplayRecording: ${detail}`);
    this.name = 'ReplayRecordingError';
  }
}

/** Reject any non-deterministic / non-plain value inside an input payload. */
function assertPlainData(value: unknown, seen: Set<unknown>): void {
  if (value === null || value === undefined) return;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return;
  if (t === 'number') {
    if (!Number.isFinite(value)) {
      throw new ReplayRecordingError(`payload contains non-finite number: ${String(value)}`);
    }
    return;
  }
  if (t === 'bigint') throw new ReplayRecordingError('payload contains bigint');
  if (t === 'symbol') throw new ReplayRecordingError('payload contains symbol');
  if (t === 'function') throw new ReplayRecordingError('payload contains function');
  if (value instanceof Date) throw new ReplayRecordingError('payload contains Date');
  if (value instanceof Map) throw new ReplayRecordingError('payload contains Map');
  if (value instanceof Set) throw new ReplayRecordingError('payload contains Set');
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new ReplayRecordingError('payload contains cyclic structure');
    seen.add(value);
    try {
      for (const item of value) assertPlainData(item, seen);
    } finally {
      seen.delete(value);
    }
    return;
  }
  if (typeof value !== 'object') {
    throw new ReplayRecordingError(`payload contains unsupported value: ${t}`);
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    const name = (value as { constructor?: { name?: string } })?.constructor?.name ?? t;
    throw new ReplayRecordingError(`payload contains non-plain object: ${name}`);
  }
  if (seen.has(value)) throw new ReplayRecordingError('payload contains cyclic structure');
  seen.add(value);
  try {
    for (const k of Object.keys(value as Record<string, unknown>)) {
      assertPlainData((value as Record<string, unknown>)[k], seen);
    }
  } finally {
    seen.delete(value);
  }
}

function isUint32(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) <= UINT32_MAX;
}

/**
 * Validate an unknown value as a `ReplayRecording`. Throws a descriptive
 * `ReplayRecording: <detail>` error on any malformed or partial input and never
 * returns a partial recording (validate-before-emit).
 */
export function validateReplayRecording(input: unknown): ReplayRecording {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ReplayRecordingError('recording must be an object');
  }
  const r = input as Record<string, unknown>;

  if (!Number.isInteger(r.version) || (r.version as number) <= 0) {
    throw new ReplayRecordingError(`version must be a positive integer (got ${String(r.version)})`);
  }
  if (typeof r.schema !== 'string' || (r.schema as string).length === 0) {
    throw new ReplayRecordingError('schema must be a non-empty string');
  }
  if (!isUint32(r.initialSeed)) {
    throw new ReplayRecordingError(`initialSeed must be a uint32 (got ${String(r.initialSeed)})`);
  }
  if (!Number.isInteger(r.maxTick) || (r.maxTick as number) <= 0) {
    throw new ReplayRecordingError(`maxTick must be a positive integer (got ${String(r.maxTick)})`);
  }

  const version = r.version as number;
  const schema = r.schema as string;
  const initialSeed = r.initialSeed as number;
  const maxTick = r.maxTick as number;

  if (!Array.isArray(r.inputs)) {
    throw new ReplayRecordingError('inputs must be an array');
  }
  const inputs: ReplayInputEvent[] = [];
  r.inputs.forEach((raw, idx) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new ReplayRecordingError(`inputs[${idx}] must be an object`);
    }
    const e = raw as Record<string, unknown>;
    if (!Number.isInteger(e.tick) || (e.tick as number) < 0 || (e.tick as number) > maxTick) {
      throw new ReplayRecordingError(
        `inputs[${idx}].tick must be an integer in [0, maxTick=${maxTick}] (got ${String(e.tick)})`,
      );
    }
    if (!Number.isInteger(e.seq) || (e.seq as number) < 0) {
      throw new ReplayRecordingError(`inputs[${idx}].seq must be a non-negative integer (got ${String(e.seq)})`);
    }
    if (typeof e.type !== 'string' || (e.type as string).length === 0) {
      throw new ReplayRecordingError(`inputs[${idx}].type must be a non-empty string (got ${String(e.type)})`);
    }
    assertPlainData(e.payload, new Set());
    inputs.push({ tick: e.tick as number, seq: e.seq as number, type: e.type as string, payload: e.payload });
  });

  if (!Array.isArray(r.tickSeeds)) {
    throw new ReplayRecordingError('tickSeeds must be an array');
  }
  const tickSeeds: ReplayTickSeed[] = [];
  r.tickSeeds.forEach((raw, idx) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new ReplayRecordingError(`tickSeeds[${idx}] must be an object`);
    }
    const ts = raw as Record<string, unknown>;
    if (!Number.isInteger(ts.tick) || (ts.tick as number) < 1 || (ts.tick as number) > maxTick) {
      throw new ReplayRecordingError(
        `tickSeeds[${idx}].tick must be an integer in [1, maxTick=${maxTick}] (got ${String(ts.tick)})`,
      );
    }
    if (!Array.isArray(ts.seeds)) {
      throw new ReplayRecordingError(`tickSeeds[${idx}].seeds must be an array`);
    }
    const seeds: ReplayTickSeedEntry[] = [];
    const seenStreams = new Set<string>();
    (ts.seeds as unknown[]).forEach((sraw, sidx) => {
      if (typeof sraw !== 'object' || sraw === null || Array.isArray(sraw)) {
        throw new ReplayRecordingError(`tickSeeds[${idx}].seeds[${sidx}] must be an object`);
      }
      const s = sraw as Record<string, unknown>;
      if (typeof s.stream !== 'string' || (s.stream as string).length === 0) {
        throw new ReplayRecordingError(`tickSeeds[${idx}].seeds[${sidx}].stream must be a non-empty string`);
      }
      if (!isUint32(s.state)) {
        throw new ReplayRecordingError(`tickSeeds[${idx}].seeds[${sidx}].state must be a uint32 (got ${String(s.state)})`);
      }
      const stream = s.stream as string;
      if (seenStreams.has(stream)) {
        throw new ReplayRecordingError(`tickSeeds[${idx}] has duplicate stream '${stream}'`);
      }
      seenStreams.add(stream);
      seeds.push({ stream, state: s.state as number });
    });
    tickSeeds.push({ tick: ts.tick as number, seeds });
  });

  // Full tick-seed coverage: exactly one entry per tick in [1, maxTick], sorted ascending.
  const seenTicks = new Set<number>();
  let prevTick = 0;
  for (const ts of tickSeeds) {
    if (seenTicks.has(ts.tick)) {
      throw new ReplayRecordingError(`duplicate tick seed at tick ${ts.tick}`);
    }
    if (ts.tick <= prevTick) {
      throw new ReplayRecordingError(`tickSeeds must be sorted ascending by tick (saw ${ts.tick} after ${prevTick})`);
    }
    prevTick = ts.tick;
    seenTicks.add(ts.tick);
  }
  for (let t = 1; t <= maxTick; t++) {
    if (!seenTicks.has(t)) {
      throw new ReplayRecordingError(`missing_seed: tick ${t} has no tick seed (need ticks 1..${maxTick})`);
    }
  }

  // Inputs sorted ascending by (tick, seq); no duplicate (tick, seq, type, payload).
  for (let i = 1; i < inputs.length; i++) {
    const a = inputs[i - 1]!;
    const b = inputs[i]!;
    if (b.tick < a.tick || (b.tick === a.tick && b.seq < a.seq)) {
      throw new ReplayRecordingError(`inputs must be sorted ascending by (tick, seq) at index ${i}`);
    }
  }
  const seenInputs = new Set<string>();
  for (const e of inputs) {
    const key = JSON.stringify([e.tick, e.seq, e.type, e.payload]);
    if (seenInputs.has(key)) {
      throw new ReplayRecordingError(`duplicate input at tick ${e.tick} seq ${e.seq} type ${e.type}`);
    }
    seenInputs.add(key);
  }

  return {
    version,
    schema,
    initialSeed,
    maxTick,
    inputs: inputs.map((e) => ({ tick: e.tick, seq: e.seq, type: e.type, payload: e.payload })),
    tickSeeds: tickSeeds.map((ts) => ({
      tick: ts.tick,
      seeds: ts.seeds.map((s) => ({ stream: s.stream, state: s.state })),
    })),
  };
}

/** Options for constructing a `ReplayRecorder`. */
export interface ReplayRecorderOptions {
  readonly initialSeed: number;
  readonly maxTick: number;
  readonly schema: string;
  /** Recording format version; defaults to 1. */
  readonly version?: number;
}

/**
 * Captures inputs and per-tick named-stream states from a driven scenario and
 * produces a validated `ReplayRecording` via `capture()`. Deterministic: the same
 * scenario captured twice yields structurally equal recordings.
 */
export class ReplayRecorder {
  private readonly initialSeed: number;
  private readonly maxTick: number;
  private readonly schema: string;
  private readonly version: number;
  private readonly recordedInputs: ReplayInputEvent[] = [];
  private readonly recordedTickSeeds: ReplayTickSeed[] = [];

  constructor(opts: ReplayRecorderOptions) {
    this.initialSeed = opts.initialSeed;
    this.maxTick = opts.maxTick;
    this.schema = opts.schema;
    this.version = opts.version ?? 1;
  }

  recordInput(event: ReplayInputEvent): void {
    this.recordedInputs.push(event);
  }

  recordTickSeed(tick: number, seeds: ReadonlyArray<ReplayTickSeedEntry>): void {
    this.recordedTickSeeds.push({ tick, seeds: seeds.map((s) => ({ stream: s.stream, state: s.state })) });
  }

  /** Validate and freeze the accumulated recording (atomic; throws on invalid state). */
  capture(): ReplayRecording {
    const recording: ReplayRecording = {
      version: this.version,
      schema: this.schema,
      initialSeed: this.initialSeed,
      maxTick: this.maxTick,
      inputs: [...this.recordedInputs],
      tickSeeds: this.recordedTickSeeds.map((ts) => ({
        tick: ts.tick,
        seeds: ts.seeds.map((s) => ({ stream: s.stream, state: s.state })),
      })),
    };
    return validateReplayRecording(recording);
  }
}
