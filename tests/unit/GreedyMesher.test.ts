import { describe, it, expect } from 'vitest';
import {
  enumerateOpaqueFacesNaive,
  greedyMergeOpaqueFaces,
  type FaceCellSampler,
  type OpaqueFaceQuad,
} from '../../src/rendering/GreedyMesher';
import type { ModelFace } from '../../src/data/BlockModel';

function sampler(cells: Record<string, number>): FaceCellSampler {
  return (x, y, z) => cells[`${x},${y},${z}`] ?? null;
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
    expect(greedyMergeOpaqueFaces(sampler({}), isOpaque, faceKey)).toEqual([]);
  });

  it('produces six 1x1 quads for a single opaque cube', () => {
    const quads = greedyMergeOpaqueFaces(sampler({ '0,0,0': 1 }), isOpaque, faceKey);

    expect(quads).toHaveLength(6);
    const byFace = new Map(quads.map((q) => [q.face, q]));
    expect(byFace.size).toBe(6);
    for (const q of quads) {
      expect(q.width).toBe(1);
      expect(q.height).toBe(1);
      expect(q.blockId).toBe(1);
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
    const quads = greedyMergeOpaqueFaces(sampler({ '0,0,0': 1, '1,0,0': 1 }), isOpaque, faceKey);

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
    const quads = greedyMergeOpaqueFaces(sampler({ '0,0,0': 1, '1,0,0': 2 }), isOpaque, faceKey);

    const north = quads.filter((q) => q.face === 'north');
    expect(north).toHaveLength(2);
    expect(north.every((q) => q.width === 1)).toBe(true);
  });

  it('merges a full plain into one quad per exposed face kind', () => {
    const quads = greedyMergeOpaqueFaces(sampler(makePlain()), isOpaque, faceKey);

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
      const merged = greedyMergeOpaqueFaces(sampler(cells), isOpaque, faceKey);
      const naive = enumerateOpaqueFacesNaive(sampler(cells), isOpaque, faceKey);

      expect(area(merged)).toBe(area(naive)); // same coverage
      expect(merged.length).toBeLessThanOrEqual(naive.length);
      expect(merged).toEqual(greedyMergeOpaqueFaces(sampler(cells), isOpaque, faceKey)); // deterministic
      expect(name).toBeTruthy();
    }
  });
});
