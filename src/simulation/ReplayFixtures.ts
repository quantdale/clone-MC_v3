/**
 * Default replay fixtures (241). `ReplayFixture` pins a recording (inputs + per-tick named-stream
 * seeds) together with the authoritative per-tick hashes it must reproduce under
 * `REPLAY_HASH_VERSION = 'v1'`. `createDefaultReplayFixtures` returns a documented pinned set
 * mirroring the 102 `createDefaultGoldenFixtures` pattern; the values were generated once from the
 * verified implementation (never hand-tuned) and any future change to canonicalization, the hash
 * algorithm, or snapshot semantics MUST bump `REPLAY_HASH_VERSION` and deliberately re-pin this set.
 * Pure and headless-safe: no IO, no mutable shared state.
 */

import { REPLAY_HASH_VERSION } from './StateHasher';
import type { ReplayInputEvent, ReplayRecording, ReplayStreamState } from './ReplayRecording';

/** A pinned replay fixture: a recording plus the authoritative per-tick hashes it must reproduce. */
export interface ReplayFixture {
  readonly key: string;
  readonly version: string;
  readonly recording: ReplayRecording;
  /** One hash per tick `1..maxTick`, in tick order. */
  readonly expectedHashes: readonly number[];
}

function event(tick: number, seq: number, type: string, payload: unknown): ReplayInputEvent {
  return { tick, seq, type, payload };
}

function stream(stream: string, state: number): ReplayStreamState {
  return { stream, state };
}

/**
 * The documented v1 default replay fixture set (3 fixtures): a 4-tick multi-input scenario on seed
 * 42, a 3-tick input-heavy scenario on seed 1234, and a 2-tick no-input scenario on seed 7. Each is
 * a deterministic two-system counting world over the `counter` and `ambient` named streams. Values
 * pinned from the verified implementation (see verification.md).
 */
export function createDefaultReplayFixtures(): ReplayFixture[] {
  const multiTick42: ReplayRecording = {
    version: 1,
    schema: 'counter/multi-tick/42',
    initialSeed: 42,
    maxTick: 4,
    inputs: [
      event(1, 0, 'add', { amount: 5 }),
      event(2, 0, 'set', { value: 100 }),
      event(3, 0, 'multiply', { factor: 2 }),
      event(3, 1, 'add', { amount: -3 }),
    ],
    tickSeeds: [
      { tick: 1, seeds: [stream('counter', 2628574729), stream('ambient', 479609025)] },
      { tick: 2, seeds: [stream('counter', 165173246), stream('ambient', 2311174838)] },
      { tick: 3, seeds: [stream('counter', 1996739059), stream('ambient', 4142740651)] },
      { tick: 4, seeds: [stream('counter', 3828304872), stream('ambient', 1679339168)] },
    ],
  };

  const withInputs1234: ReplayRecording = {
    version: 1,
    schema: 'counter/with-inputs/1234',
    initialSeed: 1234,
    maxTick: 3,
    inputs: [
      event(1, 0, 'set', { value: 7 }),
      event(2, 0, 'add', { amount: 10 }),
      event(3, 0, 'multiply', { factor: 3 }),
    ],
    tickSeeds: [
      { tick: 1, seeds: [stream('counter', 2628573937), stream('ambient', 479609913)] },
      { tick: 2, seeds: [stream('counter', 165172454), stream('ambient', 2311175726)] },
      { tick: 3, seeds: [stream('counter', 1996738267), stream('ambient', 4142741539)] },
    ],
  };

  const empty7: ReplayRecording = {
    version: 1,
    schema: 'counter/empty/7',
    initialSeed: 7,
    maxTick: 2,
    inputs: [],
    tickSeeds: [
      { tick: 1, seeds: [stream('counter', 2628574756), stream('ambient', 479609068)] },
      { tick: 2, seeds: [stream('counter', 165173273), stream('ambient', 2311174881)] },
    ],
  };

  return [
    { key: 'counter/multi-tick/42', version: REPLAY_HASH_VERSION, recording: multiTick42, expectedHashes: [1764159730, 3644581465, 173869889, 208820572] },
    { key: 'counter/with-inputs/1234', version: REPLAY_HASH_VERSION, recording: withInputs1234, expectedHashes: [3997301064, 161619589, 3074833933] },
    { key: 'counter/empty/7', version: REPLAY_HASH_VERSION, recording: empty7, expectedHashes: [1095281544, 2912760525] },
  ];
}
