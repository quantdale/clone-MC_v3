import { describe, it, expect } from 'vitest';
import {
  RELEASE_TIERS,
  DEFAULT_RELEASE_BUDGETS,
  validateReleaseBudgetConfig,
  evaluateReleaseGate,
  syntheticFrameBundle,
  syntheticNetworkBundle,
  NETWORK_MAX_CHUNK_ADDED_PER_CLIENT,
  NETWORK_MAX_ENTITY_SPAWNED_PER_CLIENT,
  NETWORK_MAX_INVENTORY_ACCEPTED_PER_CLIENT,
  type ReleaseBudgetConfig,
  type ReleaseMeasurementBundle,
} from '../../src/simulation/ReleasePerformanceGate';

/** A bundle whose every actual sits exactly at its tier's budget (boundary-equality pass). */
function boundaryBundle(tier: keyof ReleaseBudgetConfig['frame']): ReleaseMeasurementBundle {
  const t = DEFAULT_RELEASE_BUDGETS.tick[tier];
  const l = DEFAULT_RELEASE_BUDGETS.load[tier];
  const s = DEFAULT_RELEASE_BUDGETS.save[tier];
  return {
    tier,
    frame: syntheticFrameBundle(tier),
    tick: {
      sustainedTicksPerSecond: t.minSustainedTicksPerSecond,
      canonicalTickRunMs: t.maxCanonicalTickRunMs,
    },
    load: { loadMs: l.maxLoadMs },
    save: { saveFlushMs: s.maxSaveFlushMs },
    network: syntheticNetworkBundle(tier),
    ...({}) as Record<string, never>,
  } as ReleaseMeasurementBundle;
}

function cloneDefaults(): ReleaseBudgetConfig {
  return JSON.parse(JSON.stringify(DEFAULT_RELEASE_BUDGETS)) as ReleaseBudgetConfig;
}

describe('release-performance-gate: tier set and config validation', () => {
  it('exposes the closed, ordered tier set', () => {
    expect(RELEASE_TIERS).toEqual(['Low', 'Medium', 'High', 'Ultra']);
  });

  it('DEFAULT_RELEASE_BUDGETS passes validation unchanged', () => {
    expect(validateReleaseBudgetConfig(DEFAULT_RELEASE_BUDGETS)).toEqual(DEFAULT_RELEASE_BUDGETS);
  });

  it('rejects a missing domain naming the field', () => {
    const bad = cloneDefaults();
    delete (bad as unknown as Record<string, unknown>).frame;
    expect(() => validateReleaseBudgetConfig(bad)).toThrow(/ReleasePerformanceGate: .*frame/i);
  });

  it('rejects an unknown domain naming the field', () => {
    const bad = cloneDefaults() as unknown as Record<string, unknown>;
    bad.audio = {};
    expect(() => validateReleaseBudgetConfig(bad)).toThrow(/unknown config domain 'audio'/);
  });

  it('rejects a missing tier row naming the field', () => {
    const bad = cloneDefaults();
    delete (bad.tick as unknown as Record<string, unknown>).High;
    expect(() => validateReleaseBudgetConfig(bad)).toThrow(
      /tick\.High must be an object/,
    );
  });

  it('rejects an unknown tier row naming the field', () => {
    const bad = cloneDefaults();
    (bad.load as unknown as Record<string, unknown>).Extreme = { maxLoadMs: 1 };
    expect(() => validateReleaseBudgetConfig(bad)).toThrow(/unknown load tier 'Extreme'/);
  });

  it('rejects a missing dimension naming the full field path', () => {
    const bad = cloneDefaults();
    delete (bad.frame.Medium as unknown as Record<string, unknown>).maxDrawCalls;
    expect(() => validateReleaseBudgetConfig(bad)).toThrow(
      /frame\.Medium\.maxDrawCalls/,
    );
  });

  it('rejects an extra dimension naming the field', () => {
    const bad = cloneDefaults();
    (bad.save.Ultra as unknown as Record<string, unknown>).maxExtraMs = 5;
    expect(() =>
      validateReleaseBudgetConfig(bad),
    ).toThrow(/unknown save dimension 'maxExtraMs'/);
  });

  it('rejects zero, negative, NaN, and Infinity values naming the field', () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const bad = cloneDefaults();
      (bad.network.High as unknown as Record<string, unknown>).maxNetworkRunMs = value;
      expect(() => validateReleaseBudgetConfig(bad)).toThrow(
        /network\.High\.maxNetworkRunMs must be a positive finite number/,
      );
    }
  });
});

describe('release-performance-gate: evaluation', () => {
  it('passes when every actual sits exactly at its budget (boundary equality)', () => {
    for (const tier of RELEASE_TIERS) {
      const report = evaluateReleaseGate(DEFAULT_RELEASE_BUDGETS, tier, boundaryBundle(tier));
      expect(report.tier).toBe(tier);
      expect(report.entries).toHaveLength(14);
      expect(report.withinBudget).toBe(true);
      for (const entry of report.entries) expect(entry.withinBudget).toBe(true);
    }
  });

  it('fails on a single violation and names budget vs actual', () => {
    const bundle = boundaryBundle('Medium');
    bundle.frame.drawCalls = DEFAULT_RELEASE_BUDGETS.frame.Medium.maxDrawCalls + 1;
    const report = evaluateReleaseGate(DEFAULT_RELEASE_BUDGETS, 'Medium', bundle);
    expect(report.withinBudget).toBe(false);
    const failing = report.entries.find((e) => e.dimension === 'maxDrawCalls');
    expect(failing?.withinBudget).toBe(false);
    expect(failing?.budget).toBe(DEFAULT_RELEASE_BUDGETS.frame.Medium.maxDrawCalls);
    expect(failing?.actual).toBe(DEFAULT_RELEASE_BUDGETS.frame.Medium.maxDrawCalls + 1);
    // Every other entry still within.
    expect(report.entries.filter((e) => !e.withinBudget)).toHaveLength(1);
  });

  it('treats sustained-rate budgets as minimums (below fails, above passes)', () => {
    const bundle = boundaryBundle('Ultra');
    bundle.tick.sustainedTicksPerSecond =
      DEFAULT_RELEASE_BUDGETS.tick.Ultra.minSustainedTicksPerSecond - 1;
    expect(
      evaluateReleaseGate(DEFAULT_RELEASE_BUDGETS, 'Ultra', bundle).withinBudget,
    ).toBe(false);
    bundle.tick.sustainedTicksPerSecond =
      DEFAULT_RELEASE_BUDGETS.tick.Ultra.minSustainedTicksPerSecond + 10;
    expect(
      evaluateReleaseGate(DEFAULT_RELEASE_BUDGETS, 'Ultra', bundle).withinBudget,
    ).toBe(true);
  });

  it('reports violations for missing, non-numeric, non-finite, and negative actuals without throwing', () => {
    const base = boundaryBundle('Low');
    const cases: Array<Record<string, unknown>> = [
      { drawCalls: undefined },
      { drawCalls: 'many' },
      { drawCalls: Number.NaN },
      { drawCalls: Number.POSITIVE_INFINITY },
      { drawCalls: -5 },
    ];
    for (const override of cases) {
      const bundle: ReleaseMeasurementBundle = {
        ...base,
        frame: { ...base.frame, ...override } as ReleaseMeasurementBundle['frame'],
      };
      const report = evaluateReleaseGate(DEFAULT_RELEASE_BUDGETS, 'Low', bundle);
      const entry = report.entries.find((e) => e.dimension === 'maxDrawCalls');
      expect(entry?.withinBudget).toBe(false);
      expect(report.withinBudget).toBe(false);
    }
  });

  it('isolates tiers: a Low failure does not affect the Ultra verdict', () => {
    const lowBundle = boundaryBundle('Low');
    lowBundle.frame.drawCalls =
      DEFAULT_RELEASE_BUDGETS.frame.Low.maxDrawCalls + 1000;
    expect(evaluateReleaseGate(DEFAULT_RELEASE_BUDGETS, 'Low', lowBundle).withinBudget).toBe(
      false,
    );
    // The same-shaped numbers evaluated against Ultra's larger ceilings may pass; either way
    // the Low verdict does not leak into the Ultra report.
    const ultraReport = evaluateReleaseGate(
      DEFAULT_RELEASE_BUDGETS,
      'Ultra',
      boundaryBundle('Ultra'),
    );
    expect(ultraReport.tier).toBe('Ultra');
    expect(ultraReport.withinBudget).toBe(true);
  });

  it('is deterministic: identical inputs produce deep-equal reports', () => {
    const a = evaluateReleaseGate(DEFAULT_RELEASE_BUDGETS, 'High', boundaryBundle('High'));
    const b = evaluateReleaseGate(DEFAULT_RELEASE_BUDGETS, 'High', boundaryBundle('High'));
    expect(a).toEqual(b);
  });

  it('throws for an unknown tier before producing entries', () => {
    expect(() =>
      evaluateReleaseBudgetsGuard(DEFAULT_RELEASE_BUDGETS, 'Extreme' as never, boundaryBundle('Medium')),
    ).toThrow(/unknown tier 'Extreme'/);
  });

  it('synthetic bundles sit at their tier boundaries and violate when raised', () => {
    const frame = syntheticFrameBundle('Low');
    expect(frame.drawCalls).toBe(DEFAULT_RELEASE_BUDGETS.frame.Low.maxDrawCalls);
    const network = syntheticNetworkBundle('High', {
      maxChunkAddedPerClient: NETWORK_MAX_CHUNK_ADDED_PER_CLIENT + 1,
    });
    expect(network.maxEntitySpawnedPerClient).toBe(NETWORK_MAX_ENTITY_SPAWNED_PER_CLIENT);
    expect(network.maxInventoryAcceptedPerClient).toBe(
      NETWORK_MAX_INVENTORY_ACCEPTED_PER_CLIENT,
    );
    const report = evaluateReleaseGate(DEFAULT_RELEASE_BUDGETS, 'High', {
      tier: 'High',
      frame: syntheticFrameBundle('High'),
      tick: {
        sustainedTicksPerSecond:
          DEFAULT_RELEASE_BUDGETS.tick.High.minSustainedTicksPerSecond,
        canonicalTickRunMs: DEFAULT_RELEASE_BUDGETS.tick.High.maxCanonicalTickRunMs,
      },
      load: { loadMs: DEFAULT_RELEASE_BUDGETS.load.High.maxLoadMs },
      save: { saveFlushMs: DEFAULT_RELEASE_BUDGETS.save.High.maxSaveFlushMs },
      network,
    });
    expect(report.withinBudget).toBe(false);
    expect(report.entries.find((e) => e.dimension === 'maxChunkAddedPerClient')?.withinBudget).toBe(
      false,
    );
  });
});

/** Guard helper so the unknown-tier test throws through the public API. */
function evaluateReleaseBudgetsGuard(
  config: ReleaseBudgetConfig,
  tier: never,
  bundle: ReleaseMeasurementBundle,
): ReturnType<typeof evaluateReleaseGate> {
  return evaluateReleaseGate(config, tier, bundle);
}
