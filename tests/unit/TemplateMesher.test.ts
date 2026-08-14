import { describe, it, expect } from 'vitest';
import { isFullCubeModel, meshBlockModel, type OpaqueCellPredicate } from '../../src/rendering/TemplateMesher';
import type { BlockModel } from '../../src/data/BlockModel';
import type { LightSampler } from '../../src/rendering/GreedyMesher';

function face(texture = 'all'): { texture: string } {
  return { texture };
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

function fullCubeModel(): BlockModel {
  return {
    textures: { all: 'block/cube' },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: {
          up: face(),
          down: face(),
          north: face(),
          south: face(),
          east: face(),
          west: face(),
        },
      },
    ],
  };
}

function slabModel(): BlockModel {
  return {
    textures: { all: 'block/slab' },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 8, 16],
        faces: {
          up: face(),
          down: face(),
          north: face(),
          south: face(),
          east: face(),
          west: face(),
        },
      },
    ],
  };
}

function emptyNeighbors(): OpaqueCellPredicate {
  return () => false;
}

function withOpaque(cells: Array<[number, number, number]>): OpaqueCellPredicate {
  const set = new Set(cells.map(([x, y, z]) => `${x},${y},${z}`));
  return (x, y, z) => set.has(`${x},${y},${z}`);
}

describe('meshBlockModel', () => {
  it('meshes an isolated full cube to six 1x1 boundary quads', () => {
    const quads = meshBlockModel(fullCubeModel(), 1, 0, 0, 0, emptyNeighbors(), noLight());

    expect(quads).toHaveLength(6);
    const byFace = new Map(quads.map((q) => [q.face, q]));
    expect(byFace.get('down')!.y).toBe(0);
    expect(byFace.get('up')!.y).toBe(1);
    expect(byFace.get('north')!.z).toBe(0);
    expect(byFace.get('south')!.z).toBe(1);
    expect(byFace.get('east')!.x).toBe(1);
    expect(byFace.get('west')!.x).toBe(0);
    for (const q of quads) {
      expect(q.width).toBe(1);
      expect(q.height).toBe(1);
      expect(q.blockId).toBe(1);
    }
  });

  it('culls every face of a fully buried cube', () => {
    const quads = meshBlockModel(
      fullCubeModel(),
      1,
      1,
      1,
      1,
      withOpaque([
        [0, 1, 1],
        [2, 1, 1],
        [1, 0, 1],
        [1, 2, 1],
        [1, 1, 0],
        [1, 1, 2],
      ]),
      noLight(),
    );
    expect(quads).toEqual([]);
  });

  it('meshes a slab: top at y+0.5, bottom at y, four sides', () => {
    const quads = meshBlockModel(slabModel(), 2, 0, 0, 0, emptyNeighbors(), noLight());

    const byFace = new Map(quads.map((q) => [q.face, q]));
    expect(byFace.get('up')!.y).toBe(0.5);
    expect(byFace.get('up')!.width).toBe(1);
    expect(byFace.get('up')!.height).toBe(1);
    expect(byFace.get('down')!.y).toBe(0);
    expect(byFace.get('north')!.height).toBe(0.5); // side face spans y 0..0.5
    expect(quads).toHaveLength(6); // top + bottom + four sides
  });

  it('culls only the facing side of a slab against an opaque neighbor', () => {
    const quads = meshBlockModel(slabModel(), 2, 0, 0, 0, withOpaque([[0, 0, -1]]), noLight());

    const faces = quads.map((q) => q.face);
    expect(faces).not.toContain('north');
    expect(faces).toContain('south');
    expect(faces).toContain('up');
    expect(faces).toContain('down');
    expect(quads).toHaveLength(5); // six faces minus the culled north
  });

  it('emits quads from every element of a multi-element model', () => {
    const model: BlockModel = {
      textures: { all: 'block/stair' },
      elements: [
        { from: [0, 0, 0], to: [16, 8, 16], faces: { up: face() } },
        { from: [0, 8, 0], to: [8, 16, 16], faces: { up: face() } },
      ],
    };
    const quads = meshBlockModel(model, 3, 0, 0, 0, emptyNeighbors(), noLight());

    expect(quads).toHaveLength(2);
    expect(quads.some((q) => q.y === 0.5)).toBe(true);
    expect(quads.some((q) => q.y === 1 && q.width === 0.5)).toBe(true);
  });

  it('never culls interior faces', () => {
    const model: BlockModel = {
      textures: { all: 'block/x' },
      elements: [
        { from: [0, 8, 0], to: [16, 16, 16], faces: { down: face() } }, // interior underside at y=0.5
      ],
    };
    const quads = meshBlockModel(model, 4, 0, 0, 0, withOpaque([[0, -1, 0]]), noLight());

    expect(quads).toHaveLength(1);
    expect(quads[0]!.face).toBe('down');
    expect(quads[0]!.y).toBe(0.5);
  });

  it('samples light from the outward layer (slab top samples the cell above)', () => {
    // Slab top face at y=0.5 (fractional) → outward layer y = cellY + 1 = 1.
    const light: LightSampler = {
      inBounds: () => true,
      isOpaque: () => false,
      getSkyLight: (_x, y, _z) => (y === 1 ? 9 : 0),
      getBlockLight: () => 0,
    };
    const quads = meshBlockModel(slabModel(), 2, 0, 0, 0, emptyNeighbors(), light);

    const up = quads.find((q) => q.face === 'up')!;
    expect(up.vertexLights).toEqual([
      { sky: 9, block: 0 },
      { sky: 9, block: 0 },
      { sky: 9, block: 0 },
      { sky: 9, block: 0 },
    ]);
    // Nothing occludes the slab's up-face corners.
    expect(up.vertexAO).toEqual([3, 3, 3, 3]);
  });

  it('darkens the corner beside an occluding block in the outward layer (071)', () => {
    // Full cube at (0,0,0); an occluder at (0,1,1) lies in the up face's outward layer (y=1) as
    // the side1 cell of corner (1,1) → AO 2 there; the other corners stay 3.
    const light: LightSampler = {
      inBounds: () => true,
      isOpaque: (x, y, z) => x === 0 && y === 1 && z === 1,
      getSkyLight: () => 0,
      getBlockLight: () => 0,
    };
    const quads = meshBlockModel(fullCubeModel(), 1, 0, 0, 0, emptyNeighbors(), light);

    const up = quads.find((q) => q.face === 'up')!;
    expect(up.vertexAO).toEqual([3, 3, 3, 2]);
  });
});

describe('isFullCubeModel', () => {
  it('detects the canonical full cube', () => {
    expect(isFullCubeModel(fullCubeModel())).toBe(true);
    expect(isFullCubeModel(slabModel())).toBe(false);
    expect(isFullCubeModel({ textures: {}, elements: [] })).toBe(false);
  });
});
