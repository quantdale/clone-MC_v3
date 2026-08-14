import { describe, it, expect } from 'vitest';
import {
  DimensionType,
  DimensionTypeRegistry,
  createDefaultDimensionTypeRegistry,
} from '../../src/data/DimensionType';
import { createResourceId } from '../../src/data/ResourceId';

describe('DimensionType height model', () => {
  it('derives section layout for the overworld (minY -64, height 384)', () => {
    const dt = new DimensionType({
      id: createResourceId('minecraft', 'overworld'),
      minY: -64,
      height: 384,
      logicalHeight: 384,
      hasSkylight: true,
    });
    expect(dt.minSectionY).toBe(-4);
    expect(dt.sectionCount).toBe(24);
    expect(dt.maxSectionY).toBe(19);
    expect(dt.minY).toBe(-64);
    expect(dt.maxY).toBe(319);
    expect(dt.hasSkylight).toBe(true);
  });

  it('derives section layout for the nether (minY 0, height 128)', () => {
    const dt = new DimensionType({
      id: createResourceId('minecraft', 'the_nether'),
      minY: 0,
      height: 128,
      logicalHeight: 128,
      hasSkylight: false,
      ultrawarm: true,
    });
    expect(dt.minSectionY).toBe(0);
    expect(dt.sectionCount).toBe(8);
    expect(dt.maxY).toBe(127);
    expect(dt.ultrawarm).toBe(true);
    expect(dt.hasSkylight).toBe(false);
  });

  it('derives section layout for the end (height 256)', () => {
    const dt = new DimensionType({
      id: createResourceId('minecraft', 'the_end'),
      minY: 0,
      height: 256,
      logicalHeight: 256,
      hasSkylight: false,
    });
    expect(dt.sectionCount).toBe(16);
    expect(dt.maxY).toBe(255);
  });

  it('rejects a non-positive height', () => {
    expect(
      () =>
        new DimensionType({
          id: createResourceId('minecraft', 'bad'),
          minY: 0,
          height: 0,
          logicalHeight: 0,
          hasSkylight: true,
        }),
    ).toThrow();
  });

  it('rejects a logicalHeight outside [1, height]', () => {
    expect(
      () =>
        new DimensionType({
          id: createResourceId('minecraft', 'bad'),
          minY: 0,
          height: 256,
          logicalHeight: 300,
          hasSkylight: false,
        }),
    ).toThrow();
  });

  it('rejects a non-integer minY', () => {
    expect(
      () =>
        new DimensionType({
          id: createResourceId('minecraft', 'bad'),
          minY: 1.5,
          height: 256,
          logicalHeight: 256,
          hasSkylight: false,
        }),
    ).toThrow();
  });

  it('containsY and sectionIndexForY respect the vertical range', () => {
    const dt = new DimensionType({
      id: createResourceId('minecraft', 'overworld'),
      minY: -64,
      height: 384,
      logicalHeight: 384,
      hasSkylight: true,
    });
    expect(dt.containsY(-64)).toBe(true);
    expect(dt.containsY(319)).toBe(true);
    expect(dt.containsY(320)).toBe(false);
    expect(dt.sectionIndexForY(0)).toBe(4); // floor(0/16) - (-4) = 0 + 4
    expect(dt.sectionIndexForY(-64)).toBe(0);
    expect(dt.sectionIndexForY(319)).toBe(23); // in-column index (0..sectionCount-1)
  });
});

describe('DimensionTypeRegistry', () => {
  it('registers and looks up default dimension types', () => {
    const reg = createDefaultDimensionTypeRegistry();
    expect(reg.size).toBe(3);
    const overworld = reg.get(createResourceId('minecraft', 'overworld'));
    expect(overworld.sectionCount).toBe(24);
    expect(reg.has(createResourceId('minecraft', 'the_nether'))).toBe(true);
  });

  it('rejects unknown and duplicate ids', () => {
    const reg = new DimensionTypeRegistry();
    const id = createResourceId('minecraft', 'custom');
    reg.register({ id, minY: 0, height: 256, logicalHeight: 256, hasSkylight: false });
    expect(() => reg.get(createResourceId('minecraft', 'missing'))).toThrow();
    expect(() =>
      reg.register({ id, minY: 0, height: 256, logicalHeight: 256, hasSkylight: false }),
    ).toThrow();
  });

  it('lists all registered dimension types', () => {
    const reg = createDefaultDimensionTypeRegistry();
    const ids = reg.all().map((d) => d.id.path);
    expect(ids).toContain('overworld');
    expect(ids).toContain('the_nether');
    expect(ids).toContain('the_end');
  });
});
