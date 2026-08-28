import { describe, it, expect } from 'vitest';
import { REPLAY_HASH_VERSION } from '../../src/simulation/StateHasher';
import { runRecording, compareHashes, type ReplayTrace } from '../../src/simulation/ReplayVerifier';
import {
  createDefaultReplayFixtures,
  type ReplayFixture,
} from '../../src/simulation/ReplayFixtures';

function strip(fixtures: ReplayFixture[]) {
  return fixtures.map((f) => ({
    key: f.key,
    version: f.version,
    recording: f.recording,
    expectedHashes: [...f.expectedHashes],
  }));
}

describe('ReplayFixtures: default pinned set', () => {
  it('returns a documented set tagged with REPLAY_HASH_VERSION', () => {
    const fixtures = createDefaultReplayFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(4);
    for (const f of fixtures) {
      expect(f.version).toBe(REPLAY_HASH_VERSION);
      expect(f.expectedHashes.length).toBe(f.recording.maxTick);
    }
  });

  it('every fixture reproduces its expected hashes against the implementation', () => {
    for (const f of createDefaultReplayFixtures()) {
      const trace = runRecording(f.recording, { makeSystems: f.makeSystems, seedStreams: f.seedStreams });
      expect(trace.divergence).toBeNull();
      expect(trace.ticks.map((t) => t.hash)).toEqual([...f.expectedHashes]);
    }
  });

  it('a tampered expected hash reports a mismatch, never a silent pass', () => {
    const f = createDefaultReplayFixtures()[0]!;
    const trace = runRecording(f.recording, { makeSystems: f.makeSystems, seedStreams: f.seedStreams });
    const tampered = [...f.expectedHashes];
    tampered[0] = (tampered[0]! ^ 0xffffffff) >>> 0;
    const expectedTrace: ReplayTrace = {
      version: f.version,
      ticks: trace.ticks.map((t, i) => (i === 0 ? { tick: t.tick, hash: tampered[0]! } : t)),
      divergence: null,
    };
    const cmp = compareHashes(expectedTrace, trace);
    expect(cmp.identical).toBe(false);
    expect(cmp.firstDivergence?.kind).toBe('hash');
  });

  it('repeated construction is equal (deterministic)', () => {
    expect(strip(createDefaultReplayFixtures())).toEqual(strip(createDefaultReplayFixtures()));
  });
});
