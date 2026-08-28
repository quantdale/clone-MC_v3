/**
 * Replay verification (replay-verification spec, 241).
 *
 * `runRecording` replays a validated recording against a fresh headless world and
 * reproduces an authoritative state hash for every tick `1..maxTick`, seeding the
 * named RNG streams from the recorded pre-tick seeds and applying recorded inputs
 * at the correct ticks. `compareHashes` reports the first divergence (hash,
 * seed_mismatch, version_mismatch, system_failure, missing_seed) without throwing
 * on a mismatch, and refuses cross-version comparisons.
 *
 * Pure and headless-safe: no DOM, no timers, no IO, no external deps.
 */

import { SeedRng } from './SeedRng';
import { SimulationHarness, type HarnessSystem } from './SimulationHarness';
import { hashState, REPLAY_HASH_VERSION } from './StateHasher';
import {
  validateReplayRecording,
  type ReplayInputEvent,
  type ReplayRecording,
  type ReplayTickSeed,
} from './ReplayRecording';

/** One reproduced authoritative hash for a tick. */
export interface ReplayTraceTick {
  readonly tick: number;
  readonly hash: number;
}

/** A replay trace or failure outcome. `divergence` is null on a clean full run. */
export interface ReplayTrace {
  readonly version: string;
  readonly ticks: readonly ReplayTraceTick[];
  readonly divergence: ReplayDivergence | null;
}

/** A first-divergence diagnosis. Never thrown by `compareHashes`. */
export type ReplayDivergence =
  | { kind: 'hash'; tick: number; expected: number; actual: number }
  | { kind: 'seed_mismatch'; tick: number; stream: string; expected: number; actual: number }
  | { kind: 'version_mismatch'; expected: string; actual: string }
  | { kind: 'system_failure'; tick: number; error: unknown }
  | { kind: 'missing_seed'; tick: number };

/** Gives simulation systems access to the per-tick governed named streams. */
export interface ReplayStreamRegistry {
  get(name: string): SeedRng;
}

/** A comparison result: identical, or the first divergence. */
export interface ReplayComparison {
  readonly identical: boolean;
  readonly firstDivergence: ReplayDivergence | null;
}

/** Options controlling a replay run. */
export interface ReplayRunnerOptions {
  /**
   * Build the systems under replay. Receives the governed stream registry so the
   * systems obtain their named streams from the same source the verifier uses.
   */
  readonly makeSystems: (
    streams: ReplayStreamRegistry,
  ) => ReadonlyArray<HarnessSystem & { applyInput?(event: ReplayInputEvent): void }>;
  /** Injectable seed factory (the single governed stream source). Defaults to `new SeedRng(state)`. */
  readonly seedStreams?: (stream: string, state: number) => SeedRng;
}

/** The only recording format version understood by this verifier. */
export const SUPPORTED_RECORDING_VERSION = 1;

function defaultSeedStreams(_stream: string, state: number): SeedRng {
  return new SeedRng(state);
}

function groupInputsByTick(recording: ReplayRecording): Map<number, ReplayInputEvent[]> {
  const map = new Map<number, ReplayInputEvent[]>();
  for (const e of recording.inputs) {
    const arr = map.get(e.tick) ?? [];
    arr.push(e);
    map.set(e.tick, arr);
  }
  return map;
}

function indexTickSeeds(recording: ReplayRecording): Map<number, ReplayTickSeed> {
  const map = new Map<number, ReplayTickSeed>();
  for (const ts of recording.tickSeeds) map.set(ts.tick, ts);
  return map;
}

/**
 * Replay a validated recording against a fresh headless world and reproduce the
 * authoritative hash for every tick. Returns a `ReplayTrace` whose `divergence`
 * is null on a clean full run, or a structured diagnosis for a determinism break
 * (seed_mismatch) or mid-replay system failure (system_failure). A malformed or
 * partial recording (e.g. a missing tick seed) is rejected before any tick runs.
 */
export function runRecording(recording: ReplayRecording, options: ReplayRunnerOptions): ReplayTrace {
  const validated = validateReplayRecording(recording);
  if (validated.version !== SUPPORTED_RECORDING_VERSION) {
    throw new Error(
      `ReplayVerifier: unsupported recording version ${validated.version} (supported: ${SUPPORTED_RECORDING_VERSION})`,
    );
  }

  const seedStreams = options.seedStreams ?? defaultSeedStreams;
  const registry = new Map<string, SeedRng>();
  const streams: ReplayStreamRegistry = { get: (name) => registry.get(name) as SeedRng };

  const makeSystems = options.makeSystems;
  const systems = [
    ...makeSystems(streams),
  ] as Array<HarnessSystem & { applyInput?(event: ReplayInputEvent): void }>;
  const harness = new SimulationHarness({ systems });

  const inputByTick = groupInputsByTick(validated);
  const seedByTick = indexTickSeeds(validated);
  const ticks: ReplayTraceTick[] = [];

  for (let t = 1; t <= validated.maxTick; t++) {
    const ts = seedByTick.get(t);
    if (!ts) {
      // Rejected before any tick runs (validateReplayRecording already enforces this,
      // but guard defensively so a missing seed never silently passes).
      return {
        version: REPLAY_HASH_VERSION,
        ticks,
        divergence: { kind: 'missing_seed', tick: t },
      };
    }

    // Seed every named stream from its recorded pre-tick state for this tick.
    for (const s of ts.seeds) {
      registry.set(s.stream, seedStreams(s.stream, s.state));
    }

    // Apply this tick's recorded inputs in ascending seq order.
    for (const ev of inputByTick.get(t) ?? []) {
      for (const sys of systems) sys.applyInput?.(ev);
    }

    // Step one authoritative tick. Convert a system throw into a system_failure.
    try {
      harness.step(1);
    } catch (err) {
      return {
        version: REPLAY_HASH_VERSION,
        ticks,
        divergence: { kind: 'system_failure', tick: t, error: err },
      };
    }

    // Hash the authoritative snapshot for tick t.
    ticks.push({ tick: t, hash: hashState(harness.snapshot()) });

    // Determinism-break check: the recorded pre-tick state for the next tick must
    // equal the stream state actually derived by running this tick.
    if (t + 1 <= validated.maxTick) {
      const next = seedByTick.get(t + 1);
      if (next) {
        for (const s of ts.seeds) {
          const nextEntry = next.seeds.find((x) => x.stream === s.stream);
          if (!nextEntry) continue; // stream unconstrained at the next tick
          const actual = registry.get(s.stream)?.state ?? -1;
          if (actual !== nextEntry.state) {
            return {
              version: REPLAY_HASH_VERSION,
              ticks,
              divergence: { kind: 'seed_mismatch', tick: t + 1, stream: s.stream, expected: nextEntry.state, actual },
            };
          }
        }
      }
    }
  }

  return { version: REPLAY_HASH_VERSION, ticks, divergence: null };
}

function divergenceEquals(a: ReplayDivergence, b: ReplayDivergence): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'hash' && b.kind === 'hash') {
    return a.tick === b.tick && a.expected === b.expected && a.actual === b.actual;
  }
  if (a.kind === 'seed_mismatch' && b.kind === 'seed_mismatch') {
    return a.tick === b.tick && a.stream === b.stream && a.expected === b.expected && a.actual === b.actual;
  }
  if (a.kind === 'version_mismatch' && b.kind === 'version_mismatch') {
    return a.expected === b.expected && a.actual === b.actual;
  }
  if (a.kind === 'system_failure' && b.kind === 'system_failure') {
    return a.tick === b.tick;
  }
  if (a.kind === 'missing_seed' && b.kind === 'missing_seed') {
    return a.tick === b.tick;
  }
  return false;
}

function divergenceTick(d: ReplayDivergence): number {
  return d.kind === 'version_mismatch' ? 0 : d.tick;
}

/**
 * Compare an expected and an actual replay trace. Reports the first divergence
 * without throwing, refuses cross-version comparisons, and distinguishes a
 * failure outcome from a successful one (outcome class) even when hashes align.
 */
export function compareHashes(expected: ReplayTrace, actual: ReplayTrace): ReplayComparison {
  if (expected.version !== actual.version) {
    return {
      identical: false,
      firstDivergence: { kind: 'version_mismatch', expected: expected.version, actual: actual.version },
    };
  }

  const eDiv = expected.divergence;
  const aDiv = actual.divergence;

  if (eDiv === null && aDiv === null) {
    const n = Math.min(expected.ticks.length, actual.ticks.length);
    for (let i = 0; i < n; i++) {
      const et = expected.ticks[i]!;
      const at = actual.ticks[i]!;
      if (et.hash !== at.hash) {
        return {
          identical: false,
          firstDivergence: { kind: 'hash', tick: et.tick, expected: et.hash, actual: at.hash },
        };
      }
    }
    if (expected.ticks.length !== actual.ticks.length) {
      const longer = expected.ticks.length > actual.ticks.length ? expected : actual;
      const idx = n;
      const t = longer.ticks[idx]?.tick ?? idx + 1;
      const eH = expected.ticks[idx]?.hash ?? 0;
      const aH = actual.ticks[idx]?.hash ?? 0;
      return { identical: false, firstDivergence: { kind: 'hash', tick: t, expected: eH, actual: aH } };
    }
    return { identical: true, firstDivergence: null };
  }

  if (eDiv !== null && aDiv !== null) {
    if (divergenceEquals(eDiv, aDiv)) {
      return { identical: true, firstDivergence: null };
    }
    return { identical: false, firstDivergence: divergenceTick(eDiv) <= divergenceTick(aDiv) ? eDiv : aDiv };
  }

  // Exactly one side has a divergence: outcome class differs.
  return { identical: false, firstDivergence: eDiv ?? aDiv };
}
