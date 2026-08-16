import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MEMORY_RESOURCE_BUDGET,
  deriveMemoryResourceBudget,
  computeRingCardinality,
  validateMemoryResourceConfig,
  evaluateResourceBudget,
  MAX_QUEUE_SIZE,
  EDIT_OVERLAY_MAX_CHUNKS,
  GEOMETRY_FIXED_ALLOWANCE,
  type MemoryResourceConfig,
  type LiveResourceSnapshot,
} from '../../src/rendering/MemoryResourceBudget';
import {
  BlockEntityInstance,
  BlockEntityManager,
} from '../../src/simulation/BlockEntityManager';

function config(overrides: Partial<MemoryResourceConfig> = {}): MemoryResourceConfig {
  return { ...DEFAULT_MEMORY_RESOURCE_BUDGET, ...overrides };
}

function snapshot(overrides: Partial<LiveResourceSnapshot> = {}): LiveResourceSnapshot {
  return {
    loadedChunks: 10,
    pendingJobs: 0,
    meshGeometries: 30,
    editOverlayChunks: 0,
    blockEntities: 0,
    activeEntities: 0,
    itemEntities: 0,
    ...overrides,
  };
}

describe('computeRingCardinality / deriveMemoryResourceBudget', () => {
  it('computes the interest-ring cardinality (2R+1)^2 x layerCount', () => {
    expect(computeRingCardinality(6)).toBe(169);
    expect(computeRingCardinality(2)).toBe(25);
    expect(computeRingCardinality(0)).toBe(1);
    expect(computeRingCardinality(2, 3)).toBe(75);
    expect(() => computeRingCardinality(-1)).toThrow(/renderDistance/);
    expect(() => computeRingCardinality(2.5)).toThrow(/renderDistance/);
    expect(() => computeRingCardinality(2, 0)).toThrow(/layerCount/);
  });

  it('derives the documented desktop (R=6) ceilings from the runtime caps', () => {
    const d = deriveMemoryResourceBudget(6);
    expect(d.maxLoadedChunks).toBe(169); // max(6, preloadRadius 3)=6
    expect(d.maxPendingJobs).toBe(MAX_QUEUE_SIZE + 169); // 512 + 169
    expect(d.maxMeshGeometries).toBe(2 * 169 + GEOMETRY_FIXED_ALLOWANCE); // 378
    expect(d.maxEditOverlayChunks).toBe(EDIT_OVERLAY_MAX_CHUNKS); // 10_000
    expect(d.maxBlockEntities).toBe(4_096);
    expect(d.maxActiveEntities).toBe(12 + 256); // SPAWN_CAP + 256
    expect(d.maxItemEntities).toBe(1_024);
  });

  it('derives the documented headless (R=2) ceilings from the runtime caps', () => {
    // The boot preload radius (3) exceeds the headless streaming ring (2), and
    // preloaded chunks are retained up to the unload limit (R+1=3), so the
    // residency ceiling is the radius-3 ring (49), not the R=2 ring (25).
    const h = deriveMemoryResourceBudget(2);
    expect(h.maxLoadedChunks).toBe(49);
    expect(h.maxPendingJobs).toBe(MAX_QUEUE_SIZE + 49); // 561
    expect(h.maxMeshGeometries).toBe(2 * 49 + GEOMETRY_FIXED_ALLOWANCE); // 138
  });

  it('honors explicit derivation overrides', () => {
    const d = deriveMemoryResourceBudget(2, { spawnCap: 8, maxQueueSize: 64, layerCount: 2 });
    expect(d.maxLoadedChunks).toBe(49 * 2); // preload radius 3 ring, 2 layers
    expect(d.maxPendingJobs).toBe(64 + 49 * 2);
    expect(d.maxActiveEntities).toBe(8 + 256);
    // A preload radius below the render distance yields the R ring.
    const desktop = deriveMemoryResourceBudget(6, { preloadRadius: 0 });
    expect(desktop.maxLoadedChunks).toBe(169);
  });

  it('DEFAULT_MEMORY_RESOURCE_BUDGET matches the desktop derivation', () => {
    expect(DEFAULT_MEMORY_RESOURCE_BUDGET).toEqual(deriveMemoryResourceBudget(6));
  });
});

describe('validateMemoryResourceConfig', () => {
  it('accepts a valid config and returns it narrowed', () => {
    const c = config();
    expect(validateMemoryResourceConfig(c)).toEqual(c);
  });

  it('rejects non-object input', () => {
    for (const bad of [null, 42, 'x', undefined]) {
      expect(() => validateMemoryResourceConfig(bad)).toThrow(/must be an object/);
    }
    // An array is a JS object with no config fields, so it fails field validation
    // naming the first expected field rather than the "must be an object" check.
    expect(() => validateMemoryResourceConfig([])).toThrow(/maxLoadedChunks/);
  });

  it('rejects invalid field values naming the field', () => {
    const fields = [
      'maxLoadedChunks',
      'maxPendingJobs',
      'maxMeshGeometries',
      'maxEditOverlayChunks',
      'maxBlockEntities',
      'maxActiveEntities',
      'maxItemEntities',
    ] as const;
    for (const field of fields) {
      for (const bad of [0, -1, 1.5, NaN, Infinity, '5', null, undefined]) {
        expect(() => validateMemoryResourceConfig({ ...config(), [field]: bad } as never)).toThrow(
          new RegExp(field),
        );
      }
    }
  });

  it('rejects an extra unknown key', () => {
    expect(() => validateMemoryResourceConfig({ ...config(), extraKey: 1 } as never)).toThrow(
      /unknown key "extraKey"/,
    );
  });
});

describe('evaluateResourceBudget', () => {
  it('reports every dimension within budget when all actuals are at or below', () => {
    const report = evaluateResourceBudget(config(), snapshot());
    expect(report.withinBudget).toBe(true);
    expect(report.entries).toHaveLength(7);
    expect(report.entries.every((e) => e.withinBudget)).toBe(true);
  });

  it('flags a single dimension violation and fails the overall verdict', () => {
    const report = evaluateResourceBudget(config(), snapshot({ loadedChunks: 500 }));
    expect(report.withinBudget).toBe(false);
    const entry = report.entries.find((e) => e.dimension === 'loadedChunks')!;
    expect(entry.withinBudget).toBe(false);
    expect(entry.budget).toBe(DEFAULT_MEMORY_RESOURCE_BUDGET.maxLoadedChunks);
    expect(entry.actual).toBe(500);
    expect(report.entries.filter((e) => e.dimension !== 'loadedChunks').every((e) => e.withinBudget)).toBe(true);
  });

  it('treats boundary equality (actual === budget) as within budget', () => {
    const report = evaluateResourceBudget(config(), snapshot({ loadedChunks: DEFAULT_MEMORY_RESOURCE_BUDGET.maxLoadedChunks }));
    expect(report.withinBudget).toBe(true);
    expect(report.entries.find((e) => e.dimension === 'loadedChunks')!.withinBudget).toBe(true);
  });

  it('treats malformed actuals (negative/NaN/Infinity/missing/non-numeric) as violations without throwing', () => {
    const bads: Array<[string, unknown]> = [
      ['negative', -1],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['missing', undefined],
      ['non-numeric', '7'],
      ['null', null],
    ];
    for (const [, bad] of bads) {
      const report = evaluateResourceBudget(config(), snapshot({ activeEntities: bad as number }));
      expect(report.withinBudget).toBe(false);
      expect(report.entries.find((e) => e.dimension === 'activeEntities')!.withinBudget).toBe(false);
      // Other dimensions still pass.
      expect(
        report.entries.filter((e) => e.dimension !== 'activeEntities').every((e) => e.withinBudget),
      ).toBe(true);
    }
  });

  it('emits entries in the fixed normative order', () => {
    const report = evaluateResourceBudget(config(), snapshot());
    expect(report.entries.map((e) => e.dimension)).toEqual([
      'loadedChunks',
      'pendingJobs',
      'meshGeometries',
      'editOverlayChunks',
      'blockEntities',
      'activeEntities',
      'itemEntities',
    ]);
  });

  it('is deterministic: identical config + snapshot produce deeply equal reports', () => {
    const c = config();
    const s = snapshot({ loadedChunks: 40, meshGeometries: 75 });
    expect(evaluateResourceBudget(c, s)).toEqual(evaluateResourceBudget(c, s));
  });
});

describe('block-entity accumulation invariant (long-session-leak-validation, headless)', () => {
  it('returns the live count to baseline when owning chunks unload across repeated away-and-back cycles', () => {
    const manager = new BlockEntityManager();
    // Away-and-back cycles: each cycle adds a fixed number of block entities in
    // region chunks, then unloads those chunks; the retained live count must
    // never grow beyond what remains in the re-loaded region.
    const baseline = 0;
    for (let cycle = 0; cycle < 4; cycle++) {
      const placedPerCycle = 12;
      for (let i = 0; i < placedPerCycle; i++) {
        // Spread across chunks (cx,cz) 0..3 at chunk-0 Y layer.
        const cx = i % 4;
        const cz = Math.floor(i / 4);
        manager.add(new BlockEntityInstance({ typeKey: 'minecraft:chest', x: cx * 16, y: 0, z: cz * 16 }));
      }
      expect(manager.size).toBe(baseline + placedPerCycle);
      // "Away": unload every chunk in the region — count returns to baseline.
      for (let cx = 0; cx < 4; cx++) {
        for (let cz = 0; cz < 4; cz++) {
          manager.removeChunk(cx, cz);
        }
      }
      expect(manager.size).toBe(baseline);
    }
  });
});
