import { describe, it, expect } from 'vitest';
import {
  validateLightSaturationConfig,
  evaluateLightSaturation,
  runLightSaturation,
  runLightEditSaturation,
  type LightEdit,
  type DenseLightWorld,
  type LightSaturationConfig,
} from '../../src/rendering/LightSaturation';
import { computeSkyLight } from '../../src/rendering/SkyLightEngine';
import { computeBlockLight } from '../../src/rendering/BlockLightEngine';

function staticClock(): () => number {
  return () => 0;
}

function config(overrides: Partial<LightSaturationConfig> = {}): LightSaturationConfig {
  return {
    volumeWidth: 16,
    volumeHeight: 16,
    volumeDepth: 16,
    maxFullPassMeanMillis: 1000,
    maxEditMeanMillis: 1000,
    iterations: 4,
    ...overrides,
  };
}

/** A dense 16×16×16 light world: solid rock with a vertical air shaft and a block-light source. */
class DenseGridWorld implements DenseLightWorld {
  readonly minY = 0;
  readonly maxY = 16;
  private readonly opaqueCells = new Set<string>();
  private readonly sources = new Map<string, number>();
  private readonly sky = new Map<string, number>();
  private readonly block = new Map<string, number>();

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  isOpaque(x: number, y: number, z: number): boolean {
    return this.opaqueCells.has(this.key(x, y, z));
  }

  getLuminance(x: number, y: number, z: number): number {
    return this.sources.get(this.key(x, y, z)) ?? 0;
  }

  getSkyLight(x: number, y: number, z: number): number {
    return this.sky.get(this.key(x, y, z)) ?? 0;
  }

  setSkyLight(x: number, y: number, z: number, value: number): void {
    this.sky.set(this.key(x, y, z), value);
  }

  getBlockLight(x: number, y: number, z: number): number {
    return this.block.get(this.key(x, y, z)) ?? 0;
  }

  setBlockLight(x: number, y: number, z: number, value: number): void {
    this.block.set(this.key(x, y, z), value);
  }

  placeBlock(x: number, y: number, z: number): void {
    this.opaqueCells.add(this.key(x, y, z));
  }

  breakBlock(x: number, y: number, z: number): void {
    this.opaqueCells.delete(this.key(x, y, z));
  }

  setSource(x: number, y: number, z: number, luminance: number): void {
    this.sources.set(this.key(x, y, z), luminance);
  }

  removeSource(x: number, y: number, z: number): void {
    this.sources.delete(this.key(x, y, z));
  }

  clearLight(): void {
    this.sky.clear();
    this.block.clear();
  }
}

/** Solid rock with an air shaft at (8,*,8) and a block-light source inside the shaft. */
function denseWorld(): DenseGridWorld {
  const world = new DenseGridWorld();
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 16; y++) {
        if (x === 8 && z === 8) continue; // air shaft column
        world.placeBlock(x, y, z);
      }
    }
  }
  world.setSource(8, 6, 8, 14);
  return world;
}

function place(x: number, y: number, z: number): LightEdit<DenseGridWorld> {
  return { x, y, z, apply: (w) => w.placeBlock(x, y, z) };
}

function breakBlock(x: number, y: number, z: number): LightEdit<DenseGridWorld> {
  return { x, y, z, apply: (w) => w.breakBlock(x, y, z) };
}

function setSource(x: number, y: number, z: number, lum: number): LightEdit<DenseGridWorld> {
  return { x, y, z, apply: (w) => w.setSource(x, y, z, lum) };
}

function removeSource(x: number, y: number, z: number): LightEdit<DenseGridWorld> {
  return { x, y, z, apply: (w) => w.removeSource(x, y, z) };
}

function fullCompute(world: DenseLightWorld): void {
  computeSkyLight(world);
  computeBlockLight(world);
}

function snapshot(world: DenseLightWorld): string {
  const parts: string[] = [];
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = world.minY; y < world.maxY; y++) {
        const sky = world.getSkyLight(x, y, z);
        if (sky > 0) parts.push(`s:${x},${y},${z}:${sky}`);
        const block = world.getBlockLight(x, y, z);
        if (block > 0) parts.push(`b:${x},${y},${z}:${block}`);
      }
    }
  }
  return parts.sort().join('|');
}

const EDIT_SEQUENCE: LightEdit<DenseGridWorld>[] = [
  place(8, 8, 8), // block the shaft
  breakBlock(8, 8, 8), // reopen it
  setSource(8, 4, 8, 14), // add a torch
  removeSource(8, 4, 8), // remove it
  place(8, 5, 8), // block again
  breakBlock(8, 5, 8), // reopen
];

describe('validateLightSaturationConfig', () => {
  it('accepts a valid config', () => {
    expect(validateLightSaturationConfig(config())).toEqual(config());
  });

  it('rejects invalid values naming the field', () => {
    for (const field of [
      'volumeWidth',
      'volumeHeight',
      'volumeDepth',
      'maxFullPassMeanMillis',
      'maxEditMeanMillis',
      'iterations',
    ] as const) {
      for (const bad of [0, -1, NaN, Infinity, '5', null, undefined]) {
        expect(() => validateLightSaturationConfig({ ...config(), [field]: bad } as never)).toThrow(new RegExp(field));
      }
    }
  });

  it('rejects non-object input', () => {
    expect(() => validateLightSaturationConfig('x')).toThrow(/object/i);
  });
});

describe('evaluateLightSaturation', () => {
  it('reports both dimensions within budget when all actuals are at or below', () => {
    const report = evaluateLightSaturation(config(), { fullPassMeanMillis: 1, editMeanMillis: 1 });
    expect(report.withinBudget).toBe(true);
    expect(report.entries).toHaveLength(2);
    expect(report.entries.map((e) => e.dimension)).toEqual(['full-pass', 'edit-pass']);
    expect(report.entries.every((e) => e.withinBudget)).toBe(true);
  });

  it('flags a full-pass violation and fails the overall verdict', () => {
    const report = evaluateLightSaturation(config({ maxFullPassMeanMillis: 2 }), {
      fullPassMeanMillis: 20,
      editMeanMillis: 1,
    });
    expect(report.withinBudget).toBe(false);
    const full = report.entries.find((e) => e.dimension === 'full-pass')!;
    expect(full.withinBudget).toBe(false);
    expect(full.budget).toBe(2);
    expect(full.actual).toBe(20);
  });

  it('flags an edit-pass violation', () => {
    const report = evaluateLightSaturation(config({ maxEditMeanMillis: 2 }), {
      fullPassMeanMillis: 1,
      editMeanMillis: 20,
    });
    expect(report.entries.find((e) => e.dimension === 'edit-pass')!.withinBudget).toBe(false);
    expect(report.withinBudget).toBe(false);
  });

  it('treats malformed actuals as violations', () => {
    for (const bad of [-1, NaN, Infinity] as const) {
      const report = evaluateLightSaturation(config(), { fullPassMeanMillis: bad, editMeanMillis: 0 });
      expect(report.withinBudget).toBe(false);
    }
  });
});

describe('runLightSaturation (full pass)', () => {
  it('runs full sky+block passes within budget over the dense volume', () => {
    const report = runLightSaturation(denseWorld(), config({ iterations: 4 }), staticClock());
    expect(report.withinBudget).toBe(true);
    expect(report.entries[0]!.dimension).toBe('full-pass');
    expect(report.entries[0]!.withinBudget).toBe(true);
    expect(report.fullPassVisits).toBeGreaterThan(0);
  });

  it('keeps per-pass cell visits bounded (linear in passes, not super-linear)', () => {
    const one = runLightSaturation(denseWorld(), config({ iterations: 1 }), staticClock());
    const two = runLightSaturation(denseWorld(), config({ iterations: 2 }), staticClock());
    expect(two.fullPassVisits).toBeGreaterThan(one.fullPassVisits);
    expect(two.fullPassVisits).toBeLessThanOrEqual(one.fullPassVisits * 2);
  });

  it('is deterministic for identical worlds and scripted clocks', () => {
    const run = () => {
      const world = denseWorld();
      const report = runLightSaturation(world, config({ iterations: 3 }), staticClock());
      return { visits: report.fullPassVisits, mean: report.entries[0]!.actual };
    };
    expect(run()).toEqual(run());
  });
});

describe('runLightEditSaturation (incremental edits)', () => {
  it('runs the edit sequence within the edit-pass budget', () => {
    const world = denseWorld();
    fullCompute(world);
    const report = runLightEditSaturation(world, EDIT_SEQUENCE, config({ iterations: 8 }), staticClock());
    expect(report.withinBudget).toBe(true);
    expect(report.entries[0]!.dimension).toBe('edit-pass');
    expect(report.entries[0]!.withinBudget).toBe(true);
  });

  it('preserves 069 equivalence: incremental edits equal a full recompute of the edited world', () => {
    const incremental = denseWorld();
    fullCompute(incremental);
    runLightEditSaturation(incremental, EDIT_SEQUENCE, config({ iterations: 8 }), staticClock());

    const fresh = denseWorld();
    for (const edit of EDIT_SEQUENCE) edit.apply(fresh);
    fullCompute(fresh);

    expect(snapshot(incremental)).toBe(snapshot(fresh));
  });

  // 1000 incremental edits through the BFS engines are legitimately heavy;
  // 90 s accommodates coverage-instrumented runs (~5x slowdown) without
  // weakening any assertion.
  it('preserves 069 equivalence across a 1000-edit sequence', { timeout: 90000 }, () => {
    const world = denseWorld();
    fullCompute(world);
    const edits: LightEdit<DenseGridWorld>[] = [];
    for (let i = 0; i < 500; i++) {
      const y = 4 + (i % 8);
      edits.push(place(8, y, 8), breakBlock(8, y, 8)); // toggle a shaft cell: place then break
    }
    runLightEditSaturation(world, edits, config({ iterations: 1000 }), staticClock());

    const fresh = denseWorld();
    fullCompute(fresh);
    expect(snapshot(world)).toBe(snapshot(fresh));
  });

  it('rejects out-of-volume edits without corrupting in-range cells', () => {
    const world = denseWorld();
    fullCompute(world);
    const before = snapshot(world);

    runLightEditSaturation(world, [place(20, 0, 20), setSource(30, 5, 30, 15)], config({ iterations: 8 }), staticClock());

    expect(snapshot(world)).toBe(before);
  });

  it('is deterministic for identical worlds, edits, and scripted clocks', () => {
    const run = () => {
      const world = denseWorld();
      fullCompute(world);
      const report = runLightEditSaturation(world, EDIT_SEQUENCE, config({ iterations: 8 }), staticClock());
      return { visits: report.editVisits, mean: report.entries[0]!.actual, light: snapshot(world) };
    };
    expect(run()).toEqual(run());
  });
});
