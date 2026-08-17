/**
 * Shared headless replay scenario used by the 241 tests: a deterministic world of two
 * `CountingSystem`s that each draw from a named `SeedRng` stream every tick and accept plain-data
 * input events. The same world can be driven natively (recording) or replayed via `runRecording`,
 * whose `seedStreams` populates the same stream holder the systems read from, so recorded seeds
 * reproduce the authoritative run.
 */
import { SeedRng, createNamedRng } from '../../src/simulation/SeedRng';
import { SimulationHarness, type HarnessSystem } from '../../src/simulation/SimulationHarness';
import {
  ReplayRecorder,
  type ReplayInputEvent,
  type ReplayRecording,
} from '../../src/simulation/ReplayRecording';
import { hashState } from '../../src/simulation/StateHasher';

/** Holds the live named streams shared between a recording driver and `runRecording`'s seeding. */
export interface StreamHolder {
  readonly map: Map<string, SeedRng>;
  seedStreams(stream: string, state: number): SeedRng;
  rngFor(stream: string, worldSeed: number): SeedRng;
}

/** A holder whose `seedStreams` both returns the seeded stream and stores it for the systems. */
export function createStreamHolder(worldSeed: number): StreamHolder {
  const map = new Map<string, SeedRng>();
  return {
    map,
    seedStreams(stream: string, state: number): SeedRng {
      const rng = new SeedRng(state);
      map.set(stream, rng);
      return rng;
    },
    rngFor(stream: string, worldSeedArg: number): SeedRng {
      let rng = map.get(stream);
      if (!rng) {
        rng = createNamedRng(worldSeedArg, stream);
        map.set(stream, rng);
      }
      return rng;
    },
  };
}

/** A deterministic system that draws from a named stream each tick and applies plain-data inputs. */
export class CountingSystem implements HarnessSystem {
  count = 0;
  constructor(
    private readonly holder: StreamHolder,
    private readonly stream: string,
    private readonly worldSeed: number,
  ) {}

  tick(): void {
    const rng = this.holder.rngFor(this.stream, this.worldSeed);
    this.count += 1 + rng.nextInt(4); // 1..4 per tick
  }

  applyInput(event: ReplayInputEvent): void {
    if (event.type === 'add') this.count += (event.payload as { amount: number }).amount;
    else if (event.type === 'set') this.count = (event.payload as { value: number }).value;
    else if (event.type === 'multiply') this.count *= (event.payload as { factor: number }).factor;
  }

  snapshot(): unknown {
    return { count: this.count };
  }

  restore(state: unknown): void {
    this.count = (state as { count: number }).count;
  }
}

/** The default two-system world over the `counter` and `ambient` named streams. */
export function makeCountingSystems(holder: StreamHolder, worldSeed: number): CountingSystem[] {
  return [
    new CountingSystem(holder, 'counter', worldSeed),
    new CountingSystem(holder, 'ambient', worldSeed),
  ];
}

/** Apply an input event to every system in a world. */
export function applyInputToSystems(systems: Array<{ applyInput(event: ReplayInputEvent): void }>, event: ReplayInputEvent): void {
  for (const system of systems) system.applyInput(event);
}

/**
 * Drive the counting world natively for `maxTick` ticks, recording the input events and per-tick
 * stream states via a `ReplayRecorder`, and computing the authoritative per-tick hashes.
 * `inputsByTick[t]` are the seq-ordered events applied before tick `t`.
 */
export function driveScenario(options: {
  worldSeed: number;
  maxTick: number;
  schema: string;
  inputsByTick: Array<Array<ReplayInputEvent>>;
}): { recording: ReplayRecording; expectedHashes: number[] } {
  const holder = createStreamHolder(options.worldSeed);
  const systems = makeCountingSystems(holder, options.worldSeed);
  const harness = new SimulationHarness({ systems });
  const recorder = new ReplayRecorder({
    initialSeed: options.worldSeed,
    maxTick: options.maxTick,
    schema: options.schema,
  });
  const expectedHashes: number[] = [];

  for (let tick = 1; tick <= options.maxTick; tick++) {
    // Record the named-stream states at the start of this tick.
    recorder.recordTickSeed(tick, [
      { stream: 'counter', state: holder.rngFor('counter', options.worldSeed).state },
      { stream: 'ambient', state: holder.rngFor('ambient', options.worldSeed).state },
    ]);
    // Record and apply this tick's inputs (assumed seq-ordered).
    const events = options.inputsByTick[tick] ?? [];
    for (const event of events) {
      recorder.recordInput(event);
      applyInputToSystems(systems, event);
    }
    harness.step(1);
    expectedHashes.push(hashState(harness.snapshot()));
  }

  return { recording: recorder.capture(), expectedHashes };
}
