/**
 * Default replay fixtures (241). Mirrors the 102 golden-fixture pattern: a
 * documented, pinned set of multi-tick replay scenarios whose expected
 * per-tick authoritative hashes are reproduced by the implementation.
 *
 * Each fixture bundles its recording (with pre-tick named-stream states), the
 * expected per-tick hashes, and the replay scenario (`makeSystems`/`seedStreams`)
 * needed to reproduce them. The hash scheme is pinned by `REPLAY_HASH_VERSION`;
 * any change to what is hashed or how MUST bump that version and re-pin here.
 *
 * Pure and headless-safe: no DOM, no timers, no IO, no external deps.
 */

import type { HarnessSystem } from './SimulationHarness';
import { REPLAY_HASH_VERSION } from './StateHasher';
import {
  validateReplayRecording,
  type ReplayRecording,
  type ReplayTickSeed,
} from './ReplayRecording';
import {
  runRecording,
  type ReplayRunnerOptions,
  type ReplayStreamRegistry,
} from './ReplayVerifier';

/** A documented, pinned replay fixture. */
export interface ReplayFixture {
  readonly key: string;
  readonly version: string;
  readonly recording: ReplayRecording;
  readonly expectedHashes: readonly number[];
  readonly makeSystems: ReplayRunnerOptions['makeSystems'];
  readonly seedStreams?: ReplayRunnerOptions['seedStreams'];
}

/** One mulberry32 draw advances the state by this constant. */
const SEED_ADVANCE = 0x6d2b79f5;

class CounterSystem implements HarnessSystem {
  n = 0;
  tick(): void {
    this.n += 1;
  }
  snapshot(): unknown {
    return { n: this.n };
  }
  restore(state: unknown): void {
    this.n = (state as { n: number }).n;
  }
}

class RngSystem implements HarnessSystem {
  draws: number[] = [];
  constructor(private readonly streams: ReplayStreamRegistry) {}
  tick(): void {
    const rng = this.streams.get('alpha');
    this.draws.push(rng.nextInt(100));
  }
  snapshot(): unknown {
    return { draws: [...this.draws] };
  }
  restore(state: unknown): void {
    this.draws = [...(state as { draws: number[] }).draws];
  }
}

class InputSystem implements HarnessSystem {
  value = 0;
  applyInput(event: { payload: unknown }): void {
    this.value = (event.payload as { v: number }).v;
  }
  tick(): void {}
  snapshot(): unknown {
    return { value: this.value };
  }
  restore(state: unknown): void {
    this.value = (state as { value: number }).value;
  }
}

/** A single unconstrained sentinel stream seeded with a constant state every tick. */
function sentinelSeeds(stream: string, maxTick: number, state: number): ReplayTickSeed[] {
  const out: ReplayTickSeed[] = [];
  for (let t = 1; t <= maxTick; t++) out.push({ tick: t, seeds: [{ stream, state }] });
  return out;
}

/**
 * Pre-tick states for a stream that draws `drawsPerTick` times per tick. The
 * recorded state at tick T+1 equals the stream state after running tick T, which
 * advances the mulberry32 state by `SEED_ADVANCE` per draw.
 */
function streamSeeds(
  stream: string,
  maxTick: number,
  startState: number,
  drawsPerTick: number,
): ReplayTickSeed[] {
  const out: ReplayTickSeed[] = [];
  let s = startState >>> 0;
  for (let t = 1; t <= maxTick; t++) {
    out.push({ tick: t, seeds: [{ stream, state: s }] });
    for (let d = 0; d < drawsPerTick; d++) s = (s + SEED_ADVANCE) >>> 0;
  }
  return out;
}

/** Combine a drawn stream with an unconstrained sentinel stream every tick. */
function mixedSeeds(
  stream: string,
  maxTick: number,
  startState: number,
  drawsPerTick: number,
  sentinel: string,
  sentinelState: number,
): ReplayTickSeed[] {
  const drawn = streamSeeds(stream, maxTick, startState, drawsPerTick);
  const sentinelTicks = sentinelSeeds(sentinel, maxTick, sentinelState);
  return drawn.map((ts, i) => ({ tick: ts.tick, seeds: [...ts.seeds, ...sentinelTicks[i]!.seeds] }));
}

interface FixtureDef {
  recording: ReplayRecording;
  makeSystems: ReplayRunnerOptions['makeSystems'];
  seedStreams?: ReplayRunnerOptions['seedStreams'];
}

/** Build a fixture, reproducing its expected hashes from the implementation (integrity-checked). */
function compileFixture(def: FixtureDef): ReplayFixture {
  const trace = runRecording(def.recording, {
    makeSystems: def.makeSystems,
    seedStreams: def.seedStreams,
  });
  if (trace.divergence !== null) {
    throw new Error(
      `ReplayFixtures: fixture ${def.recording.schema} diverged during build: ${JSON.stringify(trace.divergence)}`,
    );
  }
  return {
    key: def.recording.schema,
    version: REPLAY_HASH_VERSION,
    recording: validateReplayRecording(def.recording),
    expectedHashes: trace.ticks.map((t) => t.hash),
    makeSystems: def.makeSystems,
    seedStreams: def.seedStreams,
  };
}

/**
 * The documented v1 default replay fixture set: a pure counter world, an RNG-driven
 * world, a mixed RNG + counter world, and an input-driven world. Expected hashes are
 * pinned from the verified implementation (never hand-tuned) and reproduced on demand.
 */
export function createDefaultReplayFixtures(): ReplayFixture[] {
  return [
    compileFixture({
      recording: {
        version: 1,
        schema: 'replay/counter/3',
        initialSeed: 42,
        maxTick: 3,
        inputs: [],
        tickSeeds: sentinelSeeds('s0', 3, 0),
      },
      makeSystems: () => [new CounterSystem()],
    }),
    compileFixture({
      recording: {
        version: 1,
        schema: 'replay/rng/4',
        initialSeed: 7,
        maxTick: 4,
        inputs: [],
        tickSeeds: streamSeeds('alpha', 4, 123456789, 1),
      },
      makeSystems: (streams) => [new RngSystem(streams)],
    }),
    compileFixture({
      recording: {
        version: 1,
        schema: 'replay/mixed/3',
        initialSeed: 99,
        maxTick: 3,
        inputs: [],
        tickSeeds: mixedSeeds('alpha', 3, 555, 1, 's0', 0),
      },
      makeSystems: (streams) => [new RngSystem(streams), new CounterSystem()],
    }),
    compileFixture({
      recording: {
        version: 1,
        schema: 'replay/input/2',
        initialSeed: 1,
        maxTick: 2,
        inputs: [
          { tick: 0, seq: 0, type: 'set', payload: { v: 5 } },
          { tick: 1, seq: 0, type: 'set', payload: { v: 9 } },
        ],
        tickSeeds: sentinelSeeds('s0', 2, 0),
      },
      makeSystems: () => [new InputSystem()],
    }),
  ];
}
