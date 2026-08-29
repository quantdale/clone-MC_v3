import { describe, expect, it } from 'vitest';
import {
  extractSectionSnapshot,
  SAMPLE_ABSENT,
  SAMPLE_OUT_OF_BOUNDS,
  SAMPLE_PRESENT,
  type SectionSnapshotLookup,
} from '../../src/world/SectionSnapshot';

interface Cell {
  id: number;
  sky: number;
  block: number;
}

function fixtureLookup(cells: ReadonlyMap<string, Cell>): SectionSnapshotLookup {
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  return {
    getBlock: (x, y, z) => cells.get(key(x, y, z))?.id ?? 0,
    getSkyLight: (x, y, z) => cells.get(key(x, y, z))?.sky ?? 0,
    getBlockLight: (x, y, z) => cells.get(key(x, y, z))?.block ?? 0,
    containsY: (y) => y >= -64 && y <= 319,
    hasStorage: (x, y, z) => cells.has(key(x, y, z)),
  };
}

describe('SectionSnapshot halo extraction', () => {
  it('uses canonical 16-block coordinates for negative sections and preserves a horizontal neighbor', () => {
    const cells = new Map<string, Cell>();
    // Target section (-1,-4,-1) starts at (-16,-64,-16).
    cells.set('-16,-64,-16', { id: 5, sky: 15, block: 2 });
    // Its east halo is world x=0, not x=-16 or the next legacy 64-block slab.
    cells.set('0,-64,-16', { id: 7, sky: 11, block: 4 });

    const snapshot = extractSectionSnapshot(-1, -4, -1, -64, 319, fixtureLookup(cells));

    expect(snapshot.cells[0]).toBe(5);
    expect(snapshot.skyLight[0]).toBe(15);
    expect(snapshot.halos.east.cells[0]).toBe(7);
    expect(snapshot.halos.east.skyLight[0]).toBe(11);
    expect(snapshot.halos.east.blockLight[0]).toBe(4);
    expect(snapshot.halos.east.availability[0]).toBe(SAMPLE_PRESENT);
  });

  it('distinguishes an absent neighbor from an in-range air cell', () => {
    const cells = new Map<string, Cell>();
    // The target is materialized and the west coordinate is in range but absent.
    cells.set('0,0,0', { id: 3, sky: 15, block: 0 });
    // A different halo coordinate is explicitly materialized as air.
    cells.set('16,0,0', { id: 0, sky: 15, block: 0 });

    const snapshot = extractSectionSnapshot(0, 0, 0, -64, 319, fixtureLookup(cells));

    expect(snapshot.halos.west.cells[0]).toBe(0);
    expect(snapshot.halos.west.availability[0]).toBe(SAMPLE_ABSENT);
    expect(snapshot.halos.east.cells[0]).toBe(0);
    expect(snapshot.halos.east.availability[0]).toBe(SAMPLE_PRESENT);
    expect(snapshot.halos.west.availability[0]).not.toBe(SAMPLE_OUT_OF_BOUNDS);
  });

  it('marks the lower and upper dimension halos out of bounds without querying storage', () => {
    const queried: string[] = [];
    const lookup = fixtureLookup(new Map());
    const bounded: SectionSnapshotLookup = {
      ...lookup,
      containsY: (y) => y >= -64 && y <= 319,
      getBlock: (x, y, z) => {
        queried.push(`${x},${y},${z}`);
        return lookup.getBlock(x, y, z);
      },
    };

    const bottom = extractSectionSnapshot(0, -4, 0, -64, 319, bounded);
    const top = extractSectionSnapshot(0, 19, 0, -64, 319, bounded);

    expect([...bottom.halos.down.availability]).toEqual(new Array(256).fill(SAMPLE_OUT_OF_BOUNDS));
    expect([...top.halos.up.availability]).toEqual(new Array(256).fill(SAMPLE_OUT_OF_BOUNDS));
    expect(bottom.halos.up.availability[0]).toBe(SAMPLE_ABSENT);
    expect(top.halos.down.availability[0]).toBe(SAMPLE_ABSENT);
    expect(queried).not.toContain('0,-65,0');
    expect(queried).not.toContain('0,320,0');
  });

  it('rejects non-integral section coordinates and inverted dimension bounds', () => {
    const lookup = fixtureLookup(new Map());
    expect(() => extractSectionSnapshot(0.5, 0, 0, -64, 319, lookup)).toThrow(/sectionX/);
    expect(() => extractSectionSnapshot(0, 0, 0, 10, 9, lookup)).toThrow(/maxY/);
  });
});
