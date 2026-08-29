import { SECTION_SIZE, SECTION_VOLUME, localIndex } from '../math/SectionCoordinate';

/** Boundary classification for a sampled halo cell. */
export type SectionSampleAvailability = 'present' | 'absent' | 'out-of-bounds';

/** The six one-voxel face directions around a canonical 16³ section. */
export type SectionHaloFace = 'west' | 'east' | 'down' | 'up' | 'north' | 'south';

export const SECTION_HALO_FACE_AREA = SECTION_SIZE * SECTION_SIZE;

/** Plain canonical lookup used by snapshot extraction; implementations MUST NOT allocate on reads. */
export interface SectionSnapshotLookup {
  getBlock(x: number, y: number, z: number): number;
  getSkyLight(x: number, y: number, z: number): number;
  getBlockLight(x: number, y: number, z: number): number;
  containsY(y: number): boolean;
  /** Distinguishes an absent column/section from a materialized air cell. */
  hasStorage(x: number, y: number, z: number): boolean;
}

/** One face's 16×16 halo data in deterministic row-major face coordinates. */
export interface SectionHaloFaceSnapshot {
  readonly availability: Readonly<Uint8Array>;
  readonly cells: Readonly<Uint16Array>;
  readonly skyLight: Readonly<Uint8Array>;
  readonly blockLight: Readonly<Uint8Array>;
}

/** Immutable data-only snapshot for one canonical section and its six face halos. */
export interface SectionSnapshot {
  readonly sectionX: number;
  readonly sectionY: number;
  readonly sectionZ: number;
  readonly minY: number;
  readonly maxY: number;
  readonly cells: Readonly<Uint16Array>;
  readonly skyLight: Readonly<Uint8Array>;
  readonly blockLight: Readonly<Uint8Array>;
  readonly halos: Readonly<Record<SectionHaloFace, SectionHaloFaceSnapshot>>;
}

export const SAMPLE_PRESENT = 0;
export const SAMPLE_ABSENT = 1;
export const SAMPLE_OUT_OF_BOUNDS = 2;

function assertCoordinate(value: number, name: string): void {
  if (!Number.isInteger(value)) throw new RangeError(`SectionSnapshot: ${name} must be an integer`);
}

function faceCoordinates(face: SectionHaloFace, index: number): [number, number, number] {
  const a = index & 15;
  const b = index >> 4;
  switch (face) {
    case 'west': return [-1, b, a];
    case 'east': return [SECTION_SIZE, b, a];
    case 'down': return [a, -1, b];
    case 'up': return [a, SECTION_SIZE, b];
    case 'north': return [a, b, -1];
    case 'south': return [a, b, SECTION_SIZE];
  }
}

function sample(
  lookup: SectionSnapshotLookup,
  x: number,
  y: number,
  z: number,
): { availability: number; cell: number; sky: number; block: number } {
  if (!lookup.containsY(y)) {
    return { availability: SAMPLE_OUT_OF_BOUNDS, cell: 0, sky: 0, block: 0 };
  }
  const availability = lookup.hasStorage(x, y, z) ? SAMPLE_PRESENT : SAMPLE_ABSENT;
  return {
    availability,
    cell: lookup.getBlock(x, y, z),
    sky: lookup.getSkyLight(x, y, z),
    block: lookup.getBlockLight(x, y, z),
  };
}

/** Extract one canonical section plus explicit six-face halo data. */
export function extractSectionSnapshot(
  sectionX: number,
  sectionY: number,
  sectionZ: number,
  minY: number,
  maxY: number,
  lookup: SectionSnapshotLookup,
): SectionSnapshot {
  for (const [value, name] of [[sectionX, 'sectionX'], [sectionY, 'sectionY'], [sectionZ, 'sectionZ'], [minY, 'minY'], [maxY, 'maxY']] as const) {
    assertCoordinate(value, name);
  }
  if (maxY < minY) throw new RangeError('SectionSnapshot: maxY must be >= minY');

  const cells = new Uint16Array(SECTION_VOLUME);
  const skyLight = new Uint8Array(SECTION_VOLUME);
  const blockLight = new Uint8Array(SECTION_VOLUME);
  const baseX = sectionX * SECTION_SIZE;
  const baseY = sectionY * SECTION_SIZE;
  const baseZ = sectionZ * SECTION_SIZE;
  for (let y = 0; y < SECTION_SIZE; y++) {
    for (let z = 0; z < SECTION_SIZE; z++) {
      for (let x = 0; x < SECTION_SIZE; x++) {
        const i = localIndex(x, y, z);
        const value = sample(lookup, baseX + x, baseY + y, baseZ + z);
        cells[i] = value.cell;
        skyLight[i] = value.sky;
        blockLight[i] = value.block;
      }
    }
  }

  const halos = {} as Record<SectionHaloFace, SectionHaloFaceSnapshot>;
  for (const face of ['west', 'east', 'down', 'up', 'north', 'south'] as const) {
    const availability = new Uint8Array(SECTION_HALO_FACE_AREA);
    const faceCells = new Uint16Array(SECTION_HALO_FACE_AREA);
    const faceSky = new Uint8Array(SECTION_HALO_FACE_AREA);
    const faceBlock = new Uint8Array(SECTION_HALO_FACE_AREA);
    for (let i = 0; i < SECTION_HALO_FACE_AREA; i++) {
      const [dx, dy, dz] = faceCoordinates(face, i);
      const value = sample(lookup, baseX + dx, baseY + dy, baseZ + dz);
      availability[i] = value.availability;
      faceCells[i] = value.cell;
      faceSky[i] = value.sky;
      faceBlock[i] = value.block;
    }
    halos[face] = { availability, cells: faceCells, skyLight: faceSky, blockLight: faceBlock };
  }

  return { sectionX, sectionY, sectionZ, minY, maxY, cells, skyLight, blockLight, halos };
}
