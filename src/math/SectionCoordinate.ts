/**
 * Section coordinate model (change 021).
 *
 * Deterministic conversion between world coordinates and 16×16×16 section coordinates, correct for
 * negative, zero, and positive coordinates. Provides world↔section and world↔local conversion, plus
 * in-section local index packing/unpacking. This is the coordinate math foundation for the planned
 * paletted/section/column storage (023/024) and vertical world access (026). Pure and storage-free.
 */

/** Edge length of a cubic 16×16×16 section. */
export const SECTION_SIZE = 16;

/** Number of block slots in one section (16³). */
export const SECTION_VOLUME = SECTION_SIZE * SECTION_SIZE * SECTION_SIZE;

/** Integer section index for a world coordinate (floor division, correct for negatives). */
export function sectionIndex(coord: number): number {
  return Math.floor(coord / SECTION_SIZE);
}

/** In-section local coordinate in `[0, 16)` for a world coordinate (correct for negatives). */
export function localCoord(coord: number): number {
  return ((coord % SECTION_SIZE) + SECTION_SIZE) % SECTION_SIZE;
}

/** Split a world coordinate into its section index and local offset. */
export function worldToSectionLocal(coord: number): { section: number; local: number } {
  const section = sectionIndex(coord);
  return { section, local: coord - section * SECTION_SIZE };
}

/** Section indices for a world position. */
export interface SectionCoord {
  readonly sectionX: number;
  readonly sectionY: number;
  readonly sectionZ: number;
}

/** In-section local coordinates, each in `[0, 16)`. */
export interface LocalCoord {
  readonly localX: number;
  readonly localY: number;
  readonly localZ: number;
}

/** Map a world position to its containing section indices. */
export function worldToSection(x: number, y: number, z: number): SectionCoord {
  return {
    sectionX: sectionIndex(x),
    sectionY: sectionIndex(y),
    sectionZ: sectionIndex(z),
  };
}

/** Map a world position to in-section local coordinates. */
export function worldToLocal(x: number, y: number, z: number): LocalCoord {
  return {
    localX: localCoord(x),
    localY: localCoord(y),
    localZ: localCoord(z),
  };
}

/** Pack in-section local coordinates into a single index in `[0, SECTION_VOLUME)`. */
export function localIndex(localX: number, localY: number, localZ: number): number {
  return localX + (localY << 4) + (localZ << 8);
}

/** Inverse of {@link localIndex}. */
export function localFromIndex(index: number): LocalCoord {
  const localZ = index >> 8;
  const localY = (index >> 4) & 15;
  const localX = index & 15;
  return { localX, localY, localZ };
}

/** A section's integer coordinates, with a convenience local-index helper. */
export class SectionCoordinates {
  constructor(
    public readonly sectionX: number,
    public readonly sectionY: number,
    public readonly sectionZ: number,
  ) {}

  /** Local block index within this section for the given in-section local coordinates. */
  localIndexAt(localX: number, localY: number, localZ: number): number {
    return localIndex(localX, localY, localZ);
  }
}
