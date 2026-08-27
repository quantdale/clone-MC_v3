/**
 * Voxel light storage (066). A `NibbleArray` stores 4096 4-bit values in 2048 bytes (low nibble of
 * byte `i` = cell `2i`, high nibble = cell `2i + 1`), with bounds/value validation and deterministic
 * serialization. A `SectionLightStorage` wraps sky and block light nibble arrays with per-coordinate
 * accessors, `fill`, and serialization. `WorldLightStorage` is the authoritative per-section map with
 * world-coordinate accessors, section-border slice accessors for cross-section propagation, and
 * typed-array snapshot/restore for persistence/worker transport. Propagation (067/068) and meshing
 * (070) consume these.
 */
import { SECTION_VOLUME } from '../math/SectionCoordinate';

/** Bytes backing one 4096-cell nibble array. */
const NIBBLE_BYTES = SECTION_VOLUME / 2;

/** 4-bit-per-cell array (4096 cells, 2048 bytes). */
export class NibbleArray {
  private data: Uint8Array;

  constructor(data?: Uint8Array) {
    if (data !== undefined && data.length !== NIBBLE_BYTES) {
      throw new RangeError(`NibbleArray: expected ${NIBBLE_BYTES} bytes, got ${data.length}`);
    }
    this.data = data ? data.slice() : new Uint8Array(NIBBLE_BYTES);
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= SECTION_VOLUME) {
      throw new RangeError(`NibbleArray: index out of range [0, ${SECTION_VOLUME}): ${index}`);
    }
  }

  /** The value at `index` (0-15). */
  get(index: number): number {
    this.assertIndex(index);
    const byte = this.data[index >> 1]!;
    return (index & 1) === 0 ? byte & 0x0f : (byte >> 4) & 0x0f;
  }

  /** Set the value at `index`; values > 15 throw. */
  set(index: number, value: number): void {
    this.assertIndex(index);
    if (!Number.isInteger(value) || value < 0 || value > 15) {
      throw new RangeError(`NibbleArray: value out of range [0, 15]: ${value}`);
    }
    const byteIndex = index >> 1;
    const byte = this.data[byteIndex]!;
    this.data[byteIndex] = (index & 1) === 0 ? (byte & 0xf0) | value : (byte & 0x0f) | (value << 4);
  }

  /** Number of cells (4096). */
  get size(): number {
    return SECTION_VOLUME;
  }

  /** A copy of the backing bytes. */
  serialize(): Uint8Array {
    return this.data.slice();
  }

  /** Build from serialized bytes (exactly 2048). */
  static deserialize(data: Uint8Array): NibbleArray {
    return new NibbleArray(data);
  }

  /** Replace the backing bytes (used by SectionLightStorage.fill); length-checked. */
  replaceBytes(bytes: Uint8Array): void {
    if (bytes.length !== NIBBLE_BYTES) {
      throw new RangeError(`NibbleArray: expected ${NIBBLE_BYTES} bytes, got ${bytes.length}`);
    }
    this.data = bytes.slice();
  }
}

/** Serialized form of a section's light. */
export interface SectionLightData {
  sky: Uint8Array;
  block: Uint8Array;
}

/** Sky + block light for one 16³ section. */
export class SectionLightStorage {
  private readonly sky: NibbleArray;
  private readonly block: NibbleArray;

  constructor(sky?: Uint8Array, block?: Uint8Array) {
    this.sky = new NibbleArray(sky);
    this.block = new NibbleArray(block);
  }

  private indexFor(x: number, y: number, z: number): number {
    // Ordered validation mirrors the historical assertCoord: first failure of
    // x, then y, then z throws with that axis's value; non-integers rejected.
    if (!Number.isInteger(x) || x < 0 || x >= 16) {
      throw new RangeError(`SectionLightStorage: local coordinates must be in [0, 16): ${x}`);
    }
    if (!Number.isInteger(y) || y < 0 || y >= 16) {
      throw new RangeError(`SectionLightStorage: local coordinates must be in [0, 16): ${y}`);
    }
    if (!Number.isInteger(z) || z < 0 || z >= 16) {
      throw new RangeError(`SectionLightStorage: local coordinates must be in [0, 16): ${z}`);
    }
    return x + (y << 4) + (z << 8);
  }

  getSkyLight(x: number, y: number, z: number): number {
    return this.sky.get(this.indexFor(x, y, z));
  }

  setSkyLight(x: number, y: number, z: number, value: number): void {
    this.sky.set(this.indexFor(x, y, z), value);
  }

  getBlockLight(x: number, y: number, z: number): number {
    return this.block.get(this.indexFor(x, y, z));
  }

  setBlockLight(x: number, y: number, z: number, value: number): void {
    this.block.set(this.indexFor(x, y, z), value);
  }

  /** Set every sky and block light cell to `value`. */
  fill(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 15) {
      throw new RangeError(`SectionLightStorage.fill: value out of range [0, 15]: ${value}`);
    }
    const byte = value * 0x11;
    const filled = new Uint8Array(NIBBLE_BYTES).fill(byte);
    this.sky.replaceBytes(filled);
    this.block.replaceBytes(filled);
  }

  /** Serialized sky/block bytes (copies). */
  serialize(): SectionLightData {
    return { sky: this.sky.serialize(), block: this.block.serialize() };
  }

  /** Build from serialized data (copies). */
  static deserialize(data: SectionLightData): SectionLightStorage {
    return new SectionLightStorage(data.sky, data.block);
  }
}

/** One of the six section faces, named by the neighbor's direction. */
export type LightFace = 'up' | 'down' | 'north' | 'south' | 'west' | 'east';

/** Cells per border slice (16×16). */
export const BORDER_SLICE_LENGTH = 256;

/** Which light channel a slice accessor addresses. */
export type LightChannel = 'sky' | 'block';

/**
 * Deterministic in-slice index layout per face:
 * - `west`/`east` (fixed localX): `localY * 16 + localZ`
 * - `down`/`up` (fixed localY): `localZ * 16 + localX`
 * - `north`/`south` (fixed localZ): `localY * 16 + localX`
 */

function assertFace(face: LightFace): void {
  switch (face) {
    case 'up':
    case 'down':
    case 'north':
    case 'south':
    case 'west':
    case 'east':
      return;
    default:
      throw new RangeError(`WorldLightStorage: unknown face ${String(face)}`);
  }
}

function assertSliceLength(length: number, label: string): void {
  if (length !== BORDER_SLICE_LENGTH) {
    throw new RangeError(`WorldLightStorage: slice ${label} must hold ${BORDER_SLICE_LENGTH} values`);
  }
}

/** World-coordinate position of cell `i` of a face's border slice. */
export function borderSliceCell(face: LightFace, i: number): { x: number; y: number; z: number } {
  const fixed = face === 'west' || face === 'down' || face === 'north' ? 0 : 15;
  const a = Math.floor(i / 16); // localY for side faces, localZ for horizontal faces
  const b = i % 16;
  switch (face) {
    case 'west':
    case 'east':
      return { x: fixed, y: a, z: b };
    case 'down':
    case 'up':
      return { x: b, y: fixed, z: a };
    case 'north':
    case 'south':
      return { x: b, y: a, z: fixed };
  }
}

/** Serialized form of one section's position and light. */
export interface SerializedSectionLight {
  readonly sectionX: number;
  readonly sectionY: number;
  readonly sectionZ: number;
  readonly sky: Uint8Array;
  readonly block: Uint8Array;
}

/** Snapshot of all sections' light; plain typed arrays, structured-clone safe. */
export interface WorldLightSnapshot {
  readonly sections: readonly SerializedSectionLight[];
}

/**
 * Authoritative packed-light store across sections. World-coordinate accessors route through a
 * one-entry section cache (propagation is strongly section-local); missing sections read as 0.
 * Writes auto-create the target section. Only malformed coordinates or slice buffers throw.
 */
export class WorldLightStorage {
  private readonly sections = new Map<string, SectionLightStorage>();
  /** One-entry lookup cache keyed by numeric section coords (propagation is
   *  strongly section-local); the string map key is built only on a miss. */
  private cacheValid = false;
  private cacheSx = 0;
  private cacheSy = 0;
  private cacheSz = 0;
  private cacheSection: SectionLightStorage | null = null;
  /** Per-section light version: bumped on every write, used to reject stale async light applications. */
  private readonly sectionVersions = new Map<string, number>();

  /** Number of stored sections. */
  get size(): number {
    return this.sections.size;
  }

  private key(sx: number, sy: number, sz: number): string {
    return `${sx},${sy},${sz}`;
  }

  private bumpVersion(sx: number, sy: number, sz: number): void {
    const k = this.key(sx, sy, sz);
    this.sectionVersions.set(k, (this.sectionVersions.get(k) ?? 0) + 1);
  }

  /** Current version of a light section; 0 for absent. */
  getSectionVersion(sx: number, sy: number, sz: number): number {
    return this.sectionVersions.get(this.key(sx, sy, sz)) ?? 0;
  }

  /** True when the section's version differs from a captured version. */
  isSectionStale(sx: number, sy: number, sz: number, capturedVersion: number): boolean {
    return this.getSectionVersion(sx, sy, sz) !== capturedVersion;
  }


  private sectionFor(sx: number, sy: number, sz: number): SectionLightStorage | undefined {
    if (this.cacheValid && this.cacheSx === sx && this.cacheSy === sy && this.cacheSz === sz) {
      return this.cacheSection!;
    }
    const section = this.sections.get(this.key(sx, sy, sz));
    if (section !== undefined) {
      this.cacheSx = sx;
      this.cacheSy = sy;
      this.cacheSz = sz;
      this.cacheSection = section;
      this.cacheValid = true;
    }
    return section;
  }

  /** The section's storage, creating zero-filled storage when absent. */
  getOrCreateSection(sx: number, sy: number, sz: number): SectionLightStorage {
    const key = this.key(sx, sy, sz);
    let section = this.sections.get(key);
    if (section === undefined) {
      section = new SectionLightStorage();
      this.sections.set(key, section);
    }
    this.cacheSx = sx;
    this.cacheSy = sy;
    this.cacheSz = sz;
    this.cacheSection = section;
    this.cacheValid = true;
    return section;
  }

  /** The section's storage, or `undefined`. */
  getSection(sx: number, sy: number, sz: number): SectionLightStorage | undefined {
    return this.sectionFor(sx, sy, sz);
  }

  /** Drop one section's light. */
  deleteSection(sx: number, sy: number, sz: number): boolean {
    const k = this.key(sx, sy, sz);
    const removed = this.sections.delete(k);
    if (removed) {
      this.cacheValid = false;
      this.cacheSection = null;
      this.sectionVersions.delete(k);
    }
    return removed;
  }

  /** Remove every section. */
  clear(): void {
    this.sections.clear();
    this.sectionVersions.clear();
    this.cacheValid = false;
    this.cacheSection = null;
  }

  private assertWorldCoord(value: number, label: string): void {
    if (!Number.isInteger(value)) {
      throw new RangeError(`WorldLightStorage: ${label} must be an integer: ${value}`);
    }
  }

  /** Sky light at world coordinates; 0 outside any known section. */
  getSkyLight(x: number, y: number, z: number): number {
    this.assertWorldCoord(x, 'x');
    this.assertWorldCoord(y, 'y');
    this.assertWorldCoord(z, 'z');
    const section = this.sectionFor(x >> 4, y >> 4, z >> 4);
    return section ? section.getSkyLight(x & 15, y & 15, z & 15) : 0;
  }

  /** Set sky light at world coordinates, creating the section when absent. */
  setSkyLight(x: number, y: number, z: number, value: number): void {
    this.assertWorldCoord(x, 'x');
    this.assertWorldCoord(y, 'y');
    this.assertWorldCoord(z, 'z');
    const sx = x >> 4;
    const sy = y >> 4;
    const sz = z >> 4;
    this.getOrCreateSection(sx, sy, sz).setSkyLight(x & 15, y & 15, z & 15, value);
    this.bumpVersion(sx, sy, sz);
  }

  /** Block light at world coordinates; 0 outside any known section. */
  getBlockLight(x: number, y: number, z: number): number {
    this.assertWorldCoord(x, 'x');
    this.assertWorldCoord(y, 'y');
    this.assertWorldCoord(z, 'z');
    const section = this.sectionFor(x >> 4, y >> 4, z >> 4);
    return section ? section.getBlockLight(x & 15, y & 15, z & 15) : 0;
  }

  /** Set block light at world coordinates, creating the section when absent. */
  setBlockLight(x: number, y: number, z: number, value: number): void {
    this.assertWorldCoord(x, 'x');
    this.assertWorldCoord(y, 'y');
    this.assertWorldCoord(z, 'z');
    const sx = x >> 4;
    const sy = y >> 4;
    const sz = z >> 4;
    this.getOrCreateSection(sx, sy, sz).setBlockLight(x & 15, y & 15, z & 15, value);
    this.bumpVersion(sx, sy, sz);
  }


  /**
   * Read a section-border slice into `dest` (or a fresh array). Missing sections yield zeros.
   * Layout per {@link borderSliceCell}.
   */
  readBorderSlice(
    sx: number,
    sy: number,
    sz: number,
    face: LightFace,
    channel: LightChannel,
    dest?: Uint8Array,
  ): Uint8Array {
    assertFace(face);
    const out = dest ?? new Uint8Array(BORDER_SLICE_LENGTH);
    assertSliceLength(out.length, 'destination');
    out.fill(0);
    const section = this.sectionFor(sx, sy, sz);
    if (!section) return out;
    for (let i = 0; i < BORDER_SLICE_LENGTH; i++) {
      const { x, y, z } = borderSliceCell(face, i);
      out[i] = channel === 'sky' ? section.getSkyLight(x, y, z) : section.getBlockLight(x, y, z);
    }
    return out;
  }

  /**
   * Write a 256-value slice onto a section border, creating the section when absent. Mirrors
   * {@link readBorderSlice}'s layout; values must be in [0, 15].
   */
  writeBorderSlice(
    sx: number,
    sy: number,
    sz: number,
    face: LightFace,
    channel: LightChannel,
    src: Uint8Array,
  ): void {
    assertFace(face);
    assertSliceLength(src.length, 'source');
    const section = this.getOrCreateSection(sx, sy, sz);
    for (let i = 0; i < BORDER_SLICE_LENGTH; i++) {
      const v = src[i]!;
      if (!Number.isInteger(v) || v < 0 || v > 15) {
        throw new RangeError(`WorldLightStorage: slice value out of range [0, 15]: ${v}`);
      }
      const { x, y, z } = borderSliceCell(face, i);
      if (channel === 'sky') section.setSkyLight(x, y, z, v);
      else section.setBlockLight(x, y, z, v);
    }
    this.bumpVersion(sx, sy, sz);
  }

  /** Deep snapshot as plain typed arrays (copies; safe to structured-clone). */
  snapshot(): WorldLightSnapshot {
    const sections: SerializedSectionLight[] = [];
    for (const [key, section] of this.sections) {
      const parts = key.split(',');
      const data = section.serialize();
      sections.push({
        sectionX: Number(parts[0]),
        sectionY: Number(parts[1]),
        sectionZ: Number(parts[2]),
        sky: data.sky,
        block: data.block,
      });
    }
    return { sections };
  }

  /** Replace all stored light from a snapshot (copies). */
  restore(snapshot: WorldLightSnapshot): void {
    this.clear();
    for (const entry of snapshot.sections) {
      const section = new SectionLightStorage(entry.sky, entry.block);
      this.sections.set(this.key(entry.sectionX, entry.sectionY, entry.sectionZ), section);
    }
  }
}

