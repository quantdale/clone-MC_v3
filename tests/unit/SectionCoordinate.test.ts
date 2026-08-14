import { describe, expect, it } from 'vitest';
import {
  SECTION_SIZE,
  SECTION_VOLUME,
  sectionIndex,
  localCoord,
  worldToSectionLocal,
  worldToSection,
  worldToLocal,
  localIndex,
  localFromIndex,
  SectionCoordinates,
} from '../../src/math/SectionCoordinate';

describe('section index for negative coordinates', () => {
  it('maps -1 to section -1 (not 0)', () => {
    expect(sectionIndex(-1)).toBe(-1);
  });

  it('maps -16 to section -1 with local 0', () => {
    expect(sectionIndex(-16)).toBe(-1);
    expect(localCoord(-16)).toBe(0);
  });

  it('maps -17 to section -2 with local 15', () => {
    expect(sectionIndex(-17)).toBe(-2);
    expect(localCoord(-17)).toBe(15);
  });
});

describe('local coordinate is always non-negative', () => {
  it('maps -1 to local 15', () => {
    expect(localCoord(-1)).toBe(15);
  });

  it('maps positive and zero correctly', () => {
    expect(localCoord(0)).toBe(0);
    expect(localCoord(15)).toBe(15);
    expect(localCoord(16)).toBe(0);
    expect(localCoord(17)).toBe(1);
  });
});

describe('world-to-section/local round-trip identity', () => {
  it('satisfies section*16 + local === coord across a sweep', () => {
    const coords = [-33, -17, -16, -1, 0, 1, 15, 16, 17, 31, 32, 100, 4095];
    for (const c of coords) {
      const { section, local } = worldToSectionLocal(c);
      expect(section * SECTION_SIZE + local).toBe(c);
      expect(local).toBeGreaterThanOrEqual(0);
      expect(local).toBeLessThan(SECTION_SIZE);
    }
  });

  it('worldToSection and worldToLocal agree with the per-axis helpers', () => {
    const x = -5, y = 33, z = -200;
    const section = worldToSection(x, y, z);
    const local = worldToLocal(x, y, z);
    expect(section.sectionX).toBe(sectionIndex(x));
    expect(section.sectionY).toBe(sectionIndex(y));
    expect(section.sectionZ).toBe(sectionIndex(z));
    expect(local.localX).toBe(localCoord(x));
    expect(local.localY).toBe(localCoord(y));
    expect(local.localZ).toBe(localCoord(z));
  });
});

describe('local index packing', () => {
  it('packs corner and center positions in range', () => {
    expect(localIndex(0, 0, 0)).toBe(0);
    expect(localIndex(15, 15, 15)).toBe(SECTION_VOLUME - 1);
    expect(localIndex(8, 8, 8)).toBe(8 + 8 * 16 + 8 * 256);
    expect(localIndex(15, 15, 15)).toBeLessThan(SECTION_VOLUME);
  });

  it('unpacks back to the original triple', () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 0],
      [15, 15, 15],
      [8, 8, 8],
      [3, 11, 7],
    ];
    for (const [lx, ly, lz] of cases) {
      expect(localFromIndex(localIndex(lx, ly, lz))).toEqual({ localX: lx, localY: ly, localZ: lz });
    }
  });

  it('SectionCoordinates.localIndexAt matches localIndex', () => {
    const sc = new SectionCoordinates(2, -1, 5);
    expect(sc.localIndexAt(4, 2, 9)).toBe(localIndex(4, 2, 9));
  });
});
