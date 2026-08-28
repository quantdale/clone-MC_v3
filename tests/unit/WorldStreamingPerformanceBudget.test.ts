import { describe, expect, it } from 'vitest';
import { runResourceChurnProfile, runStreamingProfile } from '../bench/support/streamingProfile';

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
  it('keeps exploration churn and dense vertical edits bounded', () => {
    const profile = runResourceChurnProfile();
    console.log(`[253 resource baseline] ${JSON.stringify(profile)}`);

    // The render window is 3x3 columns. Unload hysteresis may retain a bounded
    // nearby set during center changes, but it must not grow with each teleport.
    expect(profile.peakResidentColumns).toBeLessThanOrEqual(9 + 8 * 2);
    expect(profile.peakLoadedChunks).toBeLessThanOrEqual((9 + 8 * 2) * 6);
    expect(profile.finalAllocatedSections).toBeGreaterThan(0);
    // All eight edits target one horizontal column, while repeated section
    // boundaries may dirty at most the eight touched canonical sections.
    expect(profile.editedDirtyColumns).toBe(1);
    expect(profile.editedDirtySections).toBeLessThanOrEqual(8);
    expect(profile.pendingLight).toBe(0);
  });

  it('captures bounded canonical resource ownership after a settled spawn pass', () => {
    const profile = runStreamingProfile({ renderDistance: 1, frames: 1200 });

    // renderDistance 1 => 3x3 horizontal columns and six compatibility slabs
    // per column. Canonical sections remain lazy: generated terrain may touch
    // several sections, but a column must never allocate all 24 by default.
    expect(profile.distinctColumns).toBe(9);
    expect(profile.residentColumns).toBe(9);
    expect(profile.loadedChunks).toBe(54);
    expect(profile.generateColumnCalls).toBe(9);
    expect(profile.allocatedSections).toBeGreaterThan(0);
    expect(profile.allocatedSections).toBeLessThan(9 * 24);
    expect(profile.dirtyColumns).toBe(9);
    expect(profile.dirtySections).toBeGreaterThan(0);
    expect(profile.dirtySections).toBeLessThanOrEqual(profile.allocatedSections);
    expect(profile.geometries).toBe(0); // the profile intentionally uses a stub mesher
    expect(profile.pendingLight).toBe(0);
    expect(profile.pendingSave).toBe(0); // save scheduling belongs to GamePersistence
  });

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
    expect(profile.residentColumns).toBe(25);
    // Six materialized 64-block projections remain a compatibility view over
    // each canonical horizontal column in the -64..319 Overworld.
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
