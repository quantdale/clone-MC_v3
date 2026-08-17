/**
 * Replay verifier (241): reproduces authoritative state hashes from a recorded replay. `runRecording`
 * replays a validated recording against a fresh headless world — seeding named streams from the
 * recorded tick seeds and applying recorded inputs at the correct ticks — and produces one
 * `{ tick, hash }` per tick `1..maxTick`. Replaying the same recording twice yields identical traces.
 * `compareHashes` reports the first divergence (hash / seed_mismatch / version_mismatch /
 * system_failure / missing_seed) without throwing on a mismatch and refuses cross-version
 * comparisons. Determinism breaks, system failures, and missing/partial recordings are diagnosed,
 * never silently passed. Pure and headless-safe: no IO, no timers.
 */

import { SimulationHarness, type HarnessSystem } from './SimulationHarness';
import {
  REPLAY_RECORDING_VERSION,
  validateReplayRecording,
  type ReplayInputEvent,
  type ReplayRecording,
} from './ReplayRecording';
import { REPLAY_HASH_VERSION, hashState } from './StateHasher';
import { SeedRng } from './SeedRng';

/** One authoritative state hash at the end of a tick. */
export interface ReplayTraceTick {
  readonly tick: number;
  readonly hash: number;
}

/** A classified first divergence; never thrown from comparison. */
export type ReplayDivergence =
  | { kind: 'hash'; tick: number; expected: number; actual: number }
  | { kind: 'seed_mismatch'; tick: number; stream: string; expected: number; actual: number }
  | { kind: 'version_mismatch'; expected: string; actual: string }
  | { kind: 'system_failure'; tick: number; error: unknown }
  | { kind: 'missing_seed'; tick: number };

/** The failure carried by a trace that stopped mid-replay (seed break or system throw). */
export type ReplayTraceFailure =
  | { kind: 'seed_mismatch'; tick: number; stream: string; expected: number; actual: number }
  | { kind: 'system_failure'; tick: number; error: unknown };

/** The per-tick hash trace produced by `runRecording`. */
export interface ReplayTrace {
  readonly version: string;
  readonly ticks: readonly ReplayTraceTick[];
  /** Present only when the run stopped early due to a seed break or a mid-replay system throw. */
  readonly failure?: ReplayTraceFailure;
}

export interface ReplayRunnerOptions {
  /** Must equal the recording's `initialSeed` (a consistency guard on the world configuration). */
  readonly initialSeed: number;
  /** Fresh world systems whose `snapshot()` is the authoritative state source (055 HarnessSystem). */
  readonly makeSystems: () => Array<HarnessSystem & { applyInput?(event: ReplayInputEvent): void }>;
  /** Returns the named stream at a recorded state; default `new SeedRng(state)`. */
  readonly seedStreams?: (stream: string, state: number) => SeedRng;
}

/** The outcome of comparing two traces. */
export interface ReplayComparison {
  readonly identical: boolean;
  readonly firstDivergence: ReplayDivergence | null;
}

/**
 * Replay a validated recording against a fresh world, seeding named streams from the recorded tick
 * seeds and applying recorded inputs at the correct ticks. Produces one hash per tick in
 * `[1, maxTick]`. Throws on an unsupported recording format `version` or on a missing tick seed
 * (pre-run rejection). A mid-replay system throw is surfaced as `{ kind: 'system_failure' }` on the
 * returned trace (remaining ticks not hashed); a recorded seed that no longer reproduces the derived
 * stream state is surfaced as `{ kind: 'seed_mismatch' }` at the offending tick.
 */
export function runRecording(recording: ReplayRecording, options: ReplayRunnerOptions): ReplayTrace {
  const validated = validateReplayRecording(recording);
  if (validated.version !== REPLAY_RECORDING_VERSION) {
    throw new Error(
      `ReplayVerifier: unsupported recording version ${validated.version} (supported: ${REPLAY_RECORDING_VERSION})`,
    );
  }
  if (options.initialSeed !== validated.initialSeed) {
    throw new Error(
      `ReplayVerifier: runner initialSeed ${options.initialSeed} does not match recording initialSeed ${validated.initialSeed}`,
    );
  }
  const maxTick = validated.maxTick;
  const seedStreams = options.seedStreams ?? ((_stream: string, state: number) => new SeedRng(state));

  const systems = options.makeSystems();
  const harness = new SimulationHarness({ systems });
  const streams = new Map<string, SeedRng>();

  const seedTick = (tick: number): void => {
    const entry = validated.tickSeeds.find((t) => t.tick === tick);
    if (!entry) return; // validation guarantees full coverage
    for (const s of entry.seeds) {
      if (!streams.has(s.stream)) streams.set(s.stream, seedStreams(s.stream, s.state));
    }
  };

  const applyInput = (event: ReplayInputEvent): void => {
    for (const system of systems) {
      if (system.applyInput) system.applyInput(event);
    }
  };

  // Seed streams for tick 1, then apply tick-0 setup inputs once before tick 1.
  seedTick(1);
  for (const event of validated.inputs) {
    if (event.tick === 0) applyInput(event);
  }

  const ticks: ReplayTraceTick[] = [];
  let failure: ReplayTraceFailure | undefined;

  for (let tick = 1; tick <= maxTick; tick++) {
    // Inputs are validated sorted ascending by (tick, seq), so filtering preserves seq order.
    for (const event of validated.inputs) {
      if (event.tick === tick) applyInput(event);
    }

    try {
      harness.step(1);
    } catch (error) {
      failure = { kind: 'system_failure', tick, error };
      break;
    }

    ticks.push({ tick, hash: hashState(harness.snapshot()) });

    // Verify the derived stream states against the next tick's recorded seeds (seed_mismatch on a
    // determinism break), then seed any newly introduced streams.
    const nextEntry = validated.tickSeeds.find((t) => t.tick === tick + 1);
    if (nextEntry) {
      for (const s of nextEntry.seeds) {
        const live = streams.get(s.stream);
        if (live && live.state !== s.state) {
          failure = { kind: 'seed_mismatch', tick: tick + 1, stream: s.stream, expected: s.state, actual: live.state };
          break;
        }
      }
      if (failure) break;
      for (const s of nextEntry.seeds) {
        if (!streams.has(s.stream)) streams.set(s.stream, seedStreams(s.stream, s.state));
      }
    }
  }

  return failure ? { version: REPLAY_HASH_VERSION, ticks, failure } : { version: REPLAY_HASH_VERSION, ticks };
}

/**
 * Compare an expected trace to an actual trace, reporting the first divergence. Never throws on a
 * mismatch. Cross-version comparison yields a `version_mismatch` and does not attempt a hash
 * comparison. Identical and empty traces report `identical: true` with no divergence.
 */
export function compareHashes(expected: ReplayTrace, actual: ReplayTrace): ReplayComparison {
  if (expected.version !== actual.version) {
    return {
      identical: false,
      firstDivergence: { kind: 'version_mismatch', expected: expected.version, actual: actual.version },
    };
  }

  const shared = Math.min(expected.ticks.length, actual.ticks.length);
  for (let i = 0; i < shared; i++) {
    const e = expected.ticks[i] as ReplayTraceTick;
    const a = actual.ticks[i] as ReplayTraceTick;
    if (e.hash !== a.hash) {
      return {
        identical: false,
        firstDivergence: { kind: 'hash', tick: e.tick, expected: e.hash, actual: a.hash },
      };
    }
  }

  // The actual run stopped early with a diagnosed failure (seed break or system throw).
  if (actual.failure) {
    return { identical: false, firstDivergence: actual.failure };
  }

  if (expected.ticks.length !== actual.ticks.length) {
    const missing = expected.ticks[actual.ticks.length];
    if (missing) {
      // Expected produced a tick the actual run did not: a missing/partial recording diagnosis.
      return { identical: false, firstDivergence: { kind: 'missing_seed', tick: missing.tick } };
    }
    // Defensive: the expected trace is truncated relative to actual; report the first extra tick.
    const extra = actual.ticks[expected.ticks.length] as ReplayTraceTick;
    return {
      identical: false,
      firstDivergence: { kind: 'hash', tick: extra.tick, expected: -1, actual: extra.hash },
    };
  }

  return { identical: true, firstDivergence: null };
}
