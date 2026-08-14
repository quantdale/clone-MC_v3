import { describe, it, expect } from 'vitest';
import { BlockModelRegistry, validateBlockModel, type BlockModel } from '../../src/data/BlockModel';

function makeModel(overrides: Partial<BlockModel> = {}): BlockModel {
  return {
    textures: { all: 'block/slab' },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 8, 16],
        faces: {
          up: { texture: 'all' },
          down: { texture: 'all', cullface: null },
        },
      },
    ],
    ...overrides,
  };
}

describe('validateBlockModel', () => {
  it('accepts a minimal valid model', () => {
    const model = makeModel();
    expect(validateBlockModel(model)).toEqual(model);
  });

  it('rejects invalid elements', () => {
    expect(() => validateBlockModel(makeModel({ elements: {} as never }))).toThrow();
    expect(() =>
      validateBlockModel(
        makeModel({ elements: [{ from: [16, 0, 0], to: [0, 8, 16], faces: {} }] }),
      ),
    ).toThrow(/from must be less than to/i);
    expect(() =>
      validateBlockModel(
        makeModel({ elements: [{ from: [-1, 0, 0], to: [16, 8, 16], faces: {} }] }),
      ),
    ).toThrow(/within \[0, 16\]/i);
    expect(() =>
      validateBlockModel(
        makeModel({ elements: [{ from: [0, 0, 0], to: [NaN, 8, 16], faces: {} }] }),
      ),
    ).toThrow(/finite/i);
  });

  it('rejects invalid faces', () => {
    expect(() =>
      validateBlockModel(
        makeModel({
          elements: [
            { from: [0, 0, 0], to: [16, 8, 16], faces: { diagonal: { texture: 'all' } } },
          ] as unknown as BlockModel['elements'],
        }),
      ),
    ).toThrow(/invalid face/i);
    expect(() =>
      validateBlockModel(
        makeModel({
          elements: [
            {
              from: [0, 0, 0],
              to: [16, 8, 16],
              faces: { up: { texture: 'all', uv: [0, 0, 16] } },
            },
          ] as unknown as BlockModel['elements'],
        }),
      ),
    ).toThrow(/uv/i);
    expect(() =>
      validateBlockModel(
        makeModel({
          elements: [{ from: [0, 0, 0], to: [16, 8, 16], faces: { up: { texture: '' } } }],
        }),
      ),
    ).toThrow(/texture/i);
  });

  it('accepts optional fields: parent, cullface null/valid, uv', () => {
    const model = makeModel({
      parent: 'minecraft:block/cube',
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 8, 16],
          faces: {
            up: { texture: 'all', uv: [0, 0, 16, 16] },
            down: { texture: 'all', cullface: null },
            north: { texture: 'all', cullface: 'up' },
          },
        },
      ],
    });
    expect(validateBlockModel(model)).toEqual(model);
  });
});

describe('BlockModelRegistry', () => {
  it('registers, gets, checks, sizes, and clears', () => {
    const registry = new BlockModelRegistry();
    const model = makeModel();

    registry.register('minecraft:slab', model);
    expect(registry.get('minecraft:slab')).toEqual(model);
    expect(registry.has('minecraft:slab')).toBe(true);
    expect(registry.has('minecraft:missing')).toBe(false);
    expect(registry.size).toBe(1);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.get('minecraft:slab')).toBeNull();
  });

  it('rejects duplicates and invalid models', () => {
    const registry = new BlockModelRegistry();
    registry.register('minecraft:slab', makeModel());
    expect(() => registry.register('minecraft:slab', makeModel())).toThrow(/duplicate/i);
    expect(() => registry.register('minecraft:bad', makeModel({ elements: {} as never }))).toThrow();
    expect(registry.size).toBe(1);
  });
});
