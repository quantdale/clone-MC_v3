import { describe, expect, it } from 'vitest';
import { runStreamingProfile } from '../bench/support/streamingProfile';

/**
 * Permanent streaming-performance safeguard (Change 253 Phase 8).
 *
 * Wall-clock thresholds are not portable across CI hardware, so this gate pins
 * the *work counts* that caused the measured regression instead. They are
 * hardware-independent: if a future change reintroduces redundant column
 * generation or unbounded per-frame streaming work, these fail everywhere.
 *
 * Same-machine wall-clock evidence for the fix that motivated this gate lives in
 * `openspec/changes/253-live-world-architecture-convergence/verification.md`.
 */
describe('spawn streaming stays within its work budget', () => {
  it('performs exactly one column generation per resident column', () => {
    const profile = runStreamingProfile({ renderDistance: 2, frames: 1500 });

    expect(profile.distinctColumns).toBeGreaterThan(0);
    // The dominant Change-253 streaming regression was O(vertical layers)
    // redundant full-column generation. One call per column is the invariant.
    expect(profile.generateColumnCalls).toBe(profile.distinctColumns);
  });

  it('streams the full render distance to residency', () => {
    const profile = runStreamingProfile({ renderDistance: 2, frames: 1500 });

    // renderDistance 2 => 5x5 columns, 6 Overworld vertical layers.
    expect(profile.distinctColumns).toBe(25);
    expect(profile.loadedChunks).toBe(150);
  });

  it('keeps the worst streaming frame bounded relative to the whole pass', () => {
    const profile = runStreamingProfile({ renderDistance: 2, frames: 1500 });

    // A single frame must never dominate the pass. This catches a regression
    // that moves bulk work back into one unsliced frame without depending on
    // absolute machine speed.
    expect(profile.worstMs).toBeLessThan(profile.totalMs * 0.5);
  });
});
