/**
 * Voxel light storage (066). A `NibbleArray` stores 4096 4-bit values in 2048 bytes (low nibble of
 * byte `i` = cell `2i`, high nibble = cell `2i + 1`), with bounds/value validation and deterministic
 * serialization. A `SectionLightStorage` wraps sky and block light nibble arrays with per-coordinate
 * accessors, `fill`, and serialization. Propagation (067/068) and meshing (070) consume these.
 */
import { localIndex, SECTION_VOLUME, type LocalCoord } from '../math/SectionCoordinate';

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
    return index % 2 === 0 ? byte & 0x0f : (byte >> 4) & 0x0f;
  }

  /** Set the value at `index`; values > 15 throw. */
  set(index: number, value: number): void {
    this.assertIndex(index);
    if (!Number.isInteger(value) || value < 0 || value > 15) {
      throw new RangeError(`NibbleArray: value out of range [0, 15]: ${value}`);
    }
    const byteIndex = index >> 1;
    const byte = this.data[byteIndex]!;
    this.data[byteIndex] = index % 2 === 0 ? (byte & 0xf0) | value : (byte & 0x0f) | (value << 4);
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

function assertCoord(coord: LocalCoord): void {
  for (const axis of [coord.localX, coord.localY, coord.localZ]) {
    if (!Number.isInteger(axis) || axis < 0 || axis >= 16) {
      throw new RangeError(`SectionLightStorage: local coordinates must be in [0, 16): ${axis}`);
    }
  }
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
    const coord = { localX: x, localY: y, localZ: z };
    assertCoord(coord);
    return localIndex(coord.localX, coord.localY, coord.localZ);
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
