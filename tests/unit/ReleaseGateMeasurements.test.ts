import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RELEASE_BUDGETS,
  evaluateReleaseGate,
  measureCanonicalTickRun,
  measureCanonicalLoad,
  measureCanonicalSaveFlush,
  syntheticFrameBundle,
  syntheticNetworkBundle,
  type ReleaseMeasurementBundle,
} from '../../src/simulation/ReleasePerformanceGate';

/**
 * Per-domain measurement fixtures (247 tasks 3.1-3.4, 4.1). The tick/load/save drivers run the
 * REAL 224/234 seams headlessly; frame/network use the contract fixture builders (the network
 * harness is wired by name once 236 lands — see the 247 design's task-3.4 note).
 */
describe('release-performance-gate: canonical measurements', () => {
  it('measures CANONICAL_SIM (289 columns, 64 entities, 1200 ticks) without stopping', () => {
    const m = measureCanonicalTickRun();
    expect(m.stopped).toBe(false);
    expect(m.canonicalTickRunMs).toBeGreaterThan(0);
    expect(m.sustainedTicksPerSecond).toBeGreaterThan(0);
  }, 30_000);

  it('measures the canonical world-snapshot load through the real lifecycle', async () => {
    const m = await measureCanonicalLoad();
    expect(m.outcome).toBe('loaded');
    expect(m.loadMs).toBeGreaterThan(0);
  }, 30_000);

  it('measures the canonical dirty-set flush to a closed, drained lifecycle', async () => {
    const m = await measureCanonicalSaveFlush();
    expect(m.drained).toBe(true);
    expect(m.saveFlushMs).toBeGreaterThan(0);
  }, 30_000);

  it('produces a complete 14-entry gate report for a real Medium-tier bundle', async () => {
    const tick = measureCanonicalTickRun();
    const load = await measureCanonicalLoad();
    const save = await measureCanonicalSaveFlush();

    // Real tick/load/save actuals + contract fixture frame/network for the Medium tier.
    const bundle: ReleaseMeasurementBundle = {
      tier: 'Medium',
      frame: syntheticFrameBundle('Medium'),
      tick: {
        sustainedTicksPerSecond: tick.sustainedTicksPerSecond,
        canonicalTickRunMs: tick.canonicalTickRunMs,
      },
      load: { loadMs: load.loadMs },
      save: { saveFlushMs: save.saveFlushMs },
      network: syntheticNetworkBundle('Medium'),
    };

    const report = evaluateReleaseGate(DEFAULT_RELEASE_BUDGETS, 'Medium', bundle);
    expect(report.entries).toHaveLength(14);
    expect(report.tier).toBe('Medium');
    // The recorded host actuals for this run (verification.md records them too).
    const byDimension = new Map(report.entries.map((e) => [e.dimension, e]));
    expect(byDimension.get('minSustainedTicksPerSecond')?.actual).toBe(
      tick.sustainedTicksPerSecond,
    );
    expect(byDimension.get('maxLoadMs')?.actual).toBe(load.loadMs);
    expect(byDimension.get('maxSaveFlushMs')?.actual).toBe(save.saveFlushMs);
    // Structural network ceilings are tier-independent constants.
    expect(byDimension.get('maxChunkAddedPerClient')?.budget).toBe(81);
  }, 60_000);

  it('demonstrates per-domain verdicts: a violated domain fails while others stay within', async () => {
    // All inputs are synthetic/budget-exact so the verdict-classification
    // assertions are deterministic even under coverage instrumentation or a
    // slow host: only the deliberately-violated frame domain may fail.
    const bundle: ReleaseMeasurementBundle = {
      tier: 'Ultra',
      frame: syntheticFrameBundle('Ultra', { frameTimeMillis: 999 }),
      tick: {
        sustainedTicksPerSecond:
          DEFAULT_RELEASE_BUDGETS.tick.Ultra.minSustainedTicksPerSecond,
        canonicalTickRunMs: DEFAULT_RELEASE_BUDGETS.tick.Ultra.maxCanonicalTickRunMs,
      },
      load: { loadMs: DEFAULT_RELEASE_BUDGETS.load.Ultra.maxLoadMs },
      save: { saveFlushMs: DEFAULT_RELEASE_BUDGETS.save.Ultra.maxSaveFlushMs },
      network: syntheticNetworkBundle('Ultra'),
    };
    const report = evaluateReleaseGate(DEFAULT_RELEASE_BUDGETS, 'Ultra', bundle);
    const frameTime = report.entries.find((e) => e.dimension === 'maxFrameTimeMillis');
    expect(frameTime?.withinBudget).toBe(false); // 999 > the Ultra 16.7 ceiling
    expect(report.entries.filter((e) => e.dimension !== 'maxFrameTimeMillis').every((e) => e.withinBudget)).toBe(true);
    expect(report.withinBudget).toBe(false);
  }, 60_000);
});
