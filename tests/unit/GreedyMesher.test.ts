import { describe, it, expect } from 'vitest';
import {
  enumerateOpaqueFacesNaive,
  greedyMergeOpaqueFaces,
  type FaceCellSampler,
  type LightSampler,
  type OpaqueFaceQuad,
} from '../../src/rendering/GreedyMesher';
import type { ModelFace } from '../../src/data/BlockModel';

function sampler(cells: Record<string, number>): FaceCellSampler {
  return (x, y, z) => cells[`${x},${y},${z}`] ?? null;
}

/** A light sampler that reports everything out of bounds → all corners are (0, 0). */
function noLight(): LightSampler {
  return {
    inBounds: () => false,
    isOpaque: () => false,
    getSkyLight: () => 0,
    getBlockLight: () => 0,
  };
}

/** Sky light equals the cell's x coordinate; everything in bounds, nothing opaque. */
function gradientLight(): LightSampler {
  return {
    inBounds: (x, y, z) => x >= 0 && x < 16 && y >= 0 && y < 16 && z >= 0 && z < 16,
    isOpaque: () => false,
    getSkyLight: (x) => x,
    getBlockLight: () => 0,
  };
}

/** Opacity from a cells map (nonzero id = opaque); no light. */
function cellOpaqueLight(cells: Record<string, number>): LightSampler {
  return {
    inBounds: (x, y, z) => x >= 0 && x < 16 && y >= 0 && y < 16 && z >= 0 && z < 16,
    isOpaque: (x, y, z) => (cells[`${x},${y},${z}`] ?? 0) > 0,
    getSkyLight: () => 0,
    getBlockLight: () => 0,
  };
}

const isOpaque = (id: number): boolean => id > 0;
const faceKey = (id: number, face: ModelFace): string => `${id}:${face}`;

function area(quads: OpaqueFaceQuad[]): number {
  return quads.reduce((sum, q) => sum + q.width * q.height, 0);
}

function makePlain(): Record<string, number> {
  const cells: Record<string, number> = {};
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      cells[`${x},0,${z}`] = 1;
    }
  }
  return cells;
}

function makeCheckerboard(): Record<string, number> {
  const cells: Record<string, number> = {};
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 16; y++) {
      for (let z = 0; z < 16; z++) {
        if ((x + y + z) % 2 === 0) cells[`${x},${y},${z}`] = 1;
      }
    }
  }
  return cells;
}

describe('greedyMergeOpaqueFaces', () => {
  it('produces no quads for an empty section', () => {
    expect(greedyMergeOpaqueFaces(sampler({}), isOpaque, faceKey, noLight())).toEqual([]);
  });

  it('produces six 1x1 quads for a single opaque cube', () => {
    const quads = greedyMergeOpaqueFaces(sampler({ '0,0,0': 1 }), isOpaque, faceKey, noLight());

    expect(quads).toHaveLength(6);
    const byFace = new Map(quads.map((q) => [q.face, q]));
    expect(byFace.size).toBe(6);
    for (const q of quads) {
      expect(q.width).toBe(1);
      expect(q.height).toBe(1);
      expect(q.blockId).toBe(1);
      expect(q.vertexLights).toHaveLength(4); // 070: every quad carries per-corner light
      expect(q.vertexAO).toHaveLength(4); // 071: every quad carries per-corner AO
    }
    // Face planes.
    expect(byFace.get('down')!.y).toBe(0);
    expect(byFace.get('up')!.y).toBe(1);
    expect(byFace.get('north')!.z).toBe(0);
    expect(byFace.get('south')!.z).toBe(1);
    expect(byFace.get('east')!.x).toBe(1);
    expect(byFace.get('west')!.x).toBe(0);
  });

  it('merges adjacent faces of a 2x1x1 slab into 6 quads', () => {
    const quads = greedyMergeOpaqueFaces(sampler({ '0,0,0': 1, '1,0,0': 1 }), isOpaque, faceKey, noLight());

    expect(quads).toHaveLength(6);
    const byFace = new Map(quads.map((q) => [q.face, q]));
    for (const face of ['up', 'down', 'north', 'south'] as ModelFace[]) {
      expect(byFace.get(face)!.width).toBe(2);
      expect(byFace.get(face)!.height).toBe(1);
    }
    expect(byFace.get('east')!.x).toBe(2);
    expect(byFace.get('west')!.x).toBe(0);
    expect(area(quads)).toBe(10); // equals the 10 exposed faces
  });

  it('does not merge faces with different keys', () => {
    const quads = greedyMergeOpaqueFaces(sampler({ '0,0,0': 1, '1,0,0': 2 }), isOpaque, faceKey, noLight());

    const north = quads.filter((q) => q.face === 'north');
    expect(north).toHaveLength(2);
    expect(north.every((q) => q.width === 1)).toBe(true);
  });

  it('merges a full plain into one quad per exposed face kind', () => {
    const quads = greedyMergeOpaqueFaces(sampler(makePlain()), isOpaque, faceKey, noLight());

    const up = quads.filter((q) => q.face === 'up');
    expect(up).toHaveLength(1);
    expect(up[0]!.width).toBe(16);
    expect(up[0]!.height).toBe(16);
  });

  it('is equivalent to the naive enumeration on a fixture matrix and deterministic', () => {
    const fixtures: Record<string, Record<string, number>> = {
      empty: {},
      single: { '0,0,0': 1 },
      slab: { '0,0,0': 1, '1,0,0': 1 },
      plain: makePlain(),
      checkerboard: makeCheckerboard(),
    };

    for (const [name, cells] of Object.entries(fixtures)) {
      const merged = greedyMergeOpaqueFaces(sampler(cells), isOpaque, faceKey, noLight());
      const naive = enumerateOpaqueFacesNaive(sampler(cells), isOpaque, faceKey, noLight());

      expect(area(merged)).toBe(area(naive)); // same coverage
      expect(merged.length).toBeLessThanOrEqual(naive.length);
      expect(merged).toEqual(greedyMergeOpaqueFaces(sampler(cells), isOpaque, faceKey, noLight())); // deterministic
      expect(name).toBeTruthy();
    }
  });

  it('attaches per-corner light sampled from the light sampler (070)', () => {
    // A 2x2 block at (5..6, y=0, 5..6): its up face is a merged 2x2 quad whose corners sample the
    // outward layer y=1 (sky = x).
    const cells: Record<string, number> = {};
    for (let x = 5; x <= 6; x++) {
      for (let z = 5; z <= 6; z++) {
        cells[`${x},0,${z}`] = 1;
      }
    }
    const quads = greedyMergeOpaqueFaces(sampler(cells), isOpaque, faceKey, gradientLight());

    const up = quads.filter((q) => q.face === 'up');
    expect(up).toHaveLength(1);
    // Corners (5,5), (7,5), (5,7), (7,7): x∈{4,5}→5, x∈{6,7}→7 (rounded averages).
    expect(up[0]!.vertexLights.map((l) => l.sky)).toEqual([5, 7, 5, 7]);
    expect(up[0]!.vertexLights.every((l) => l.block === 0)).toBe(true);
    // Nothing occludes the up-face corners → full AO.
    expect(up[0]!.vertexAO).toEqual([3, 3, 3, 3]);
  });

  it('darkens the corner next to an occluding block (071)', () => {
    // A 2x2 block at (5..6, y=0, 5..6) plus an occluder at (4, 1, 5) — in the up face's outward
    // layer (y=1), beside corner (5,5): side1 of that corner is opaque → AO 2; all other
    // corners are unoccluded.
    const cells: Record<string, number> = { '4,1,5': 1 };
    for (let x = 5; x <= 6; x++) {
      for (let z = 5; z <= 6; z++) {
        cells[`${x},0,${z}`] = 1;
      }
    }
    const quads = greedyMergeOpaqueFaces(sampler(cells), isOpaque, faceKey, cellOpaqueLight(cells));

    const up = quads.filter((q) => q.face === 'up' && q.y === 1); // the 2x2 block's up face (the occluder at y=1 has its own up face at y=2)
    expect(up).toHaveLength(1);
    expect(up[0]!.vertexAO).toEqual([2, 3, 3, 3]);
  });
});
