import { describe, it, expect } from 'vitest';
import { isFullCubeModel, meshBlockModel, type OpaqueCellPredicate } from '../../src/rendering/TemplateMesher';
import type { BlockModel } from '../../src/data/BlockModel';

function face(texture = 'all'): { texture: string } {
  return { texture };
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
    const quads = meshBlockModel(fullCubeModel(), 1, 0, 0, 0, emptyNeighbors());

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
    const quads = meshBlockModel(fullCubeModel(), 1, 1, 1, 1, withOpaque([
      [0, 1, 1],
      [2, 1, 1],
      [1, 0, 1],
      [1, 2, 1],
      [1, 1, 0],
      [1, 1, 2],
    ]));
    expect(quads).toEqual([]);
  });

  it('meshes a slab: top at y+0.5, bottom at y, four sides', () => {
    const quads = meshBlockModel(slabModel(), 2, 0, 0, 0, emptyNeighbors());

    const byFace = new Map(quads.map((q) => [q.face, q]));
    expect(byFace.get('up')!.y).toBe(0.5);
    expect(byFace.get('up')!.width).toBe(1);
    expect(byFace.get('up')!.height).toBe(1);
    expect(byFace.get('down')!.y).toBe(0);
    expect(byFace.get('north')!.height).toBe(0.5); // side face spans y 0..0.5
    expect(quads).toHaveLength(6); // top + bottom + four sides
  });

  it('culls only the facing side of a slab against an opaque neighbor', () => {
    const quads = meshBlockModel(slabModel(), 2, 0, 0, 0, withOpaque([[0, 0, -1]]));

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
    const quads = meshBlockModel(model, 3, 0, 0, 0, emptyNeighbors());

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
    const quads = meshBlockModel(model, 4, 0, 0, 0, withOpaque([[0, -1, 0]]));

    expect(quads).toHaveLength(1);
    expect(quads[0]!.face).toBe('down');
    expect(quads[0]!.y).toBe(0.5);
  });
});

describe('isFullCubeModel', () => {
  it('detects the canonical full cube', () => {
    expect(isFullCubeModel(fullCubeModel())).toBe(true);
    expect(isFullCubeModel(slabModel())).toBe(false);
    expect(isFullCubeModel({ textures: {}, elements: [] })).toBe(false);
  });
});
