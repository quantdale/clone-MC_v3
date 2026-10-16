import { describe, it, expect } from 'vitest';
import {
  applyStructureTransform,
  MAX_TEMPLATE_EXTENT,
  StructureTemplateRegistry,
  validateStructureTemplate,
  validateStructureTransform,
  type StructureTemplate,
} from '../../src/worldgen/StructureTemplate';

const baseTemplate: StructureTemplate = {
  key: 'test/hut',
  size: { width: 2, height: 1, depth: 3 },
  blocks: [
    { x: 1, y: 0, z: 0, blockId: 7 },
    { x: 0, y: 0, z: 2, blockId: 8 },
  ],
  entities: [{ x: 1, y: 0, z: 1, entityKey: 'minecraft:villager' }],
  connectors: [
    { key: 'door', x: 1, y: 0, z: 0, facing: 'north' },
    { key: 'side', x: 0, y: 0, z: 0, facing: 'east' },
  ],
};

describe('validateStructureTemplate', () => {
  it('accepts a valid template and a template with empty collections', () => {
    expect(validateStructureTemplate(baseTemplate)).toEqual(baseTemplate);
    const empty: StructureTemplate = { key: 'a', size: { width: 1, height: 1, depth: 1 }, blocks: [], entities: [], connectors: [] };
    expect(validateStructureTemplate(empty)).toEqual(empty);
  });

  it('rejects bad keys, sizes, coordinates, duplicates, ids, keys and facings', () => {
    const withSize = (size: unknown): unknown => ({ ...baseTemplate, size });
    expect(() => validateStructureTemplate({ ...baseTemplate, key: '' })).toThrow(/key/i);
    expect(() => validateStructureTemplate(withSize({ width: 0, height: 1, depth: 1 }))).toThrow(/size\.width/i);
    expect(() => validateStructureTemplate(withSize({ width: -1, height: 1, depth: 1 }))).toThrow(/size\.width/i);
    expect(() => validateStructureTemplate(withSize({ width: 1.5, height: 1, depth: 1 }))).toThrow(/size\.width/i);
    expect(() => validateStructureTemplate(withSize({ width: MAX_TEMPLATE_EXTENT + 1, height: 1, depth: 1 }))).toThrow(/size\.width/i);
    expect(() => validateStructureTemplate({ ...baseTemplate, size: { width: 1 } })).toThrow(/size/i);

    expect(() => validateStructureTemplate({ ...baseTemplate, blocks: [{ x: 2, y: 0, z: 0, blockId: 7 }] })).toThrow(/blocks/i);
    expect(() => validateStructureTemplate({ ...baseTemplate, blocks: [{ x: 0, y: -1, z: 0, blockId: 7 }] })).toThrow(/blocks/i);
    expect(() => validateStructureTemplate({ ...baseTemplate, blocks: [{ x: 0, y: 0, z: 3, blockId: 7 }] })).toThrow(/blocks/i);
    expect(() =>
      validateStructureTemplate({
        ...baseTemplate,
        blocks: [
          { x: 1, y: 0, z: 0, blockId: 7 },
          { x: 1, y: 0, z: 0, blockId: 8 },
        ],
      }),
    ).toThrow(/duplicate block position/i);
    expect(() => validateStructureTemplate({ ...baseTemplate, blocks: [{ x: 0, y: 0, z: 0, blockId: -1 }] })).toThrow(/blockId/i);

    expect(() => validateStructureTemplate({ ...baseTemplate, entities: [{ x: 0, y: 0, z: 5, entityKey: 'e' }] })).toThrow(/entities/i);
    expect(() => validateStructureTemplate({ ...baseTemplate, entities: [{ x: 0, y: 0, z: 0, entityKey: '' }] })).toThrow(/entityKey/i);

    expect(() =>
      validateStructureTemplate({
        ...baseTemplate,
        connectors: [
          { key: 'door', x: 1, y: 0, z: 0, facing: 'north' },
          { key: 'door', x: 0, y: 0, z: 0, facing: 'east' },
        ],
      }),
    ).toThrow(/duplicate connector key/i);
    expect(() => validateStructureTemplate({ ...baseTemplate, connectors: [{ key: 'c', x: 0, y: 0, z: 0, facing: 'diagonal' }] })).toThrow(/facing/i);
    expect(() => validateStructureTemplate({ ...baseTemplate, connectors: [{ key: 'c', x: 9, y: 0, z: 0, facing: 'north' }] })).toThrow(/connectors/i);
    expect(() => validateStructureTemplate(null)).toThrow(/object/i);
  });
});

describe('validateStructureTransform', () => {
  it('accepts every documented transform', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const mirror of ['none', 'x', 'z'] as const) {
        expect(validateStructureTransform({ rotation, mirror })).toEqual({ rotation, mirror });
      }
    }
  });

  it('rejects unknown rotations and mirrors', () => {
    expect(() => validateStructureTransform({ rotation: 45, mirror: 'none' })).toThrow(/rotation/i);
    expect(() => validateStructureTransform({ rotation: 0, mirror: 'y' })).toThrow(/mirror/i);
    expect(() => validateStructureTransform(null)).toThrow(/object/i);
  });
});

describe('applyStructureTransform', () => {
  it('rotates 90 degrees clockwise (footprint transposed, facings rotate)', () => {
    const out = applyStructureTransform(baseTemplate, { rotation: 90, mirror: 'none' });
    expect(out.size).toEqual({ width: 3, height: 1, depth: 2 });
    expect(out.blocks).toEqual([
      { x: 2, y: 0, z: 1, blockId: 7 },
      { x: 0, y: 0, z: 0, blockId: 8 },
    ]);
    expect(out.entities).toEqual([{ x: 1, y: 0, z: 1, entityKey: 'minecraft:villager' }]);
    expect(out.connectors).toEqual([
      { key: 'door', x: 2, y: 0, z: 1, facing: 'east' },
      { key: 'side', x: 2, y: 0, z: 0, facing: 'south' },
    ]);
  });

  it('rotates 180 degrees (footprint unchanged)', () => {
    const out = applyStructureTransform(baseTemplate, { rotation: 180, mirror: 'none' });
    expect(out.size).toEqual({ width: 2, height: 1, depth: 3 });
    expect(out.blocks).toEqual([
      { x: 0, y: 0, z: 2, blockId: 7 },
      { x: 1, y: 0, z: 0, blockId: 8 },
    ]);
    expect(out.connectors).toEqual([
      { key: 'door', x: 0, y: 0, z: 2, facing: 'south' },
      { key: 'side', x: 1, y: 0, z: 2, facing: 'west' },
    ]);
  });

  it('rotates 270 degrees (footprint transposed)', () => {
    const out = applyStructureTransform(baseTemplate, { rotation: 270, mirror: 'none' });
    expect(out.size).toEqual({ width: 3, height: 1, depth: 2 });
    expect(out.blocks).toEqual([
      { x: 0, y: 0, z: 0, blockId: 7 },
      { x: 2, y: 0, z: 1, blockId: 8 },
    ]);
    expect(out.connectors).toEqual([
      { key: 'door', x: 0, y: 0, z: 0, facing: 'west' },
      { key: 'side', x: 0, y: 0, z: 1, facing: 'north' },
    ]);
  });

  it('mirrors on x and z with facing swaps', () => {
    const mx = applyStructureTransform(baseTemplate, { rotation: 0, mirror: 'x' });
    expect(mx.blocks).toEqual([
      { x: 0, y: 0, z: 0, blockId: 7 },
      { x: 1, y: 0, z: 2, blockId: 8 },
    ]);
    expect(mx.connectors).toEqual([
      { key: 'door', x: 0, y: 0, z: 0, facing: 'north' },
      { key: 'side', x: 1, y: 0, z: 0, facing: 'west' },
    ]);

    const mz = applyStructureTransform(baseTemplate, { rotation: 0, mirror: 'z' });
    expect(mz.blocks).toEqual([
      { x: 1, y: 0, z: 2, blockId: 7 },
      { x: 0, y: 0, z: 0, blockId: 8 },
    ]);
    expect(mz.connectors).toEqual([
      { key: 'door', x: 1, y: 0, z: 2, facing: 'south' },
      { key: 'side', x: 0, y: 0, z: 2, facing: 'east' },
    ]);
  });

  it('composes mirror first, then rotation', () => {
    // block (1,0,0): mirror x -> (0,0,0); 90 -> (D-1-0, 0, 0) = (2,0,0).
    const out = applyStructureTransform(baseTemplate, { rotation: 90, mirror: 'x' });
    expect(out.blocks[0]).toEqual({ x: 2, y: 0, z: 0, blockId: 7 });
    // door facing: north (x-mirror keeps it) -> east (90).
    expect(out.connectors[0]).toEqual({ key: 'door', x: 2, y: 0, z: 0, facing: 'east' });
  });

  it('identity transform returns the original data', () => {
    const out = applyStructureTransform(baseTemplate, { rotation: 0, mirror: 'none' });
    expect(out.size).toEqual(baseTemplate.size);
    expect(out.blocks).toEqual(baseTemplate.blocks);
    expect(out.entities).toEqual(baseTemplate.entities);
    expect(out.connectors).toEqual(baseTemplate.connectors);
  });

  it('is deterministic for identical inputs', () => {
    const a = applyStructureTransform(baseTemplate, { rotation: 90, mirror: 'z' });
    const b = applyStructureTransform(baseTemplate, { rotation: 90, mirror: 'z' });
    expect(b).toEqual(a);
  });
});

describe('StructureTemplateRegistry', () => {
  it('registers, gets, checks, sizes, and clears', () => {
    const registry = new StructureTemplateRegistry();
    registry.register(baseTemplate);
    expect(registry.get('test/hut')).toEqual(baseTemplate);
    expect(registry.has('test/hut')).toBe(true);
    expect(registry.has('missing')).toBe(false);
    expect(registry.size).toBe(1);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.get('test/hut')).toBeNull();
  });

  it('rejects duplicates and invalid templates atomically', () => {
    const registry = new StructureTemplateRegistry();
    registry.register(baseTemplate);

    expect(() => registry.register(baseTemplate)).toThrow(/duplicate/i);
    expect(() =>
      registry.register({
        key: 'test/bad',
        size: { width: 2, height: 1, depth: 3 },
        blocks: [
          { x: 1, y: 0, z: 0, blockId: 7 },
          { x: 1, y: 0, z: 0, blockId: 8 },
        ],
        entities: [],
        connectors: [],
      }),
    ).toThrow(/duplicate block position/i);
    expect(registry.size).toBe(1);
    expect(registry.has('test/bad')).toBe(false);
  });
});
