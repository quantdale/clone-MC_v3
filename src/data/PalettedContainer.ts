import { SECTION_VOLUME } from '../math/SectionCoordinate';

export const MIN_PALETTE_BITS = 4;
export const MAX_PALETTE_BITS = 16;
export const PALETTED_CONTAINER_VERSION = 1;

/**
 * Options for constructing a {@link PalettedContainer}.
 *
 * `T` is the stored value type. For numeric values (`T = number`) the default
 * `keyOf`/`encode`/`decode` are identity functions and may be omitted. For other
 * value types, an injective `keyOf` (for palette de-duplication) and `encode`/
 * `decode` (for serialization) MUST be supplied.
 */
export interface PalettedContainerOptions<T> {
  capacity?: number;
  defaultValue: T;
  bitsPerEntry?: number;
  keyOf?: (value: T) => string | number;
  encode?: (value: T) => number;
  decode?: (id: number) => T;
}

/** Deterministic, versioned serialization of a {@link PalettedContainer}. */
export interface SerializedPalettedContainer {
  version: number;
  capacity: number;
  bitsPerEntry: number;
  palette: number[];
  storage: number[];
}

/**
 * Bit-packed fixed-width integer array.
 *
 * Packs `capacity` integers, each `bitsPerEntry` wide, into a flat list of
 * 32-bit words. Values up to 16 bits wide (the maximum palette width) fit
 * comfortably inside a single 32-bit word read/write, including cross-word
 * boundaries.
 */
export class PackedIntegerArray {
  bitsPerEntry: number;
  readonly capacity: number;
  private words: number[];

  constructor(bitsPerEntry: number, capacity: number, words?: number[]) {
    this.bitsPerEntry = bitsPerEntry;
    this.capacity = capacity;
    const wordCount = PackedIntegerArray.wordCount(bitsPerEntry, capacity);
    this.words =
      words && words.length === wordCount ? words.slice() : new Array<number>(wordCount).fill(0);
  }

  static wordCount(bits: number, capacity: number): number {
    return Math.ceil((capacity * bits) / 32);
  }

  get(index: number): number {
    if (index < 0 || index >= this.capacity) {
      throw new RangeError(`PackedIntegerArray index out of range: ${index}`);
    }
    const bits = this.bitsPerEntry;
    const startBit = index * bits;
    const wordIndex = startBit >>> 5;
    const bitOffset = startBit & 31;
    const mask = bits >= 32 ? 0xffffffff : (1 << bits) - 1;
    let value = (this.words[wordIndex] ?? 0) >>> bitOffset;
    const bitsRead = 32 - bitOffset;
    if (bitsRead < bits) {
      value |= (this.words[wordIndex + 1] ?? 0) << bitsRead;
    }
    return value & mask;
  }

  set(index: number, value: number): void {
    if (index < 0 || index >= this.capacity) {
      throw new RangeError(`PackedIntegerArray index out of range: ${index}`);
    }
    const bits = this.bitsPerEntry;
    const startBit = index * bits;
    const wordIndex = startBit >>> 5;
    const bitOffset = startBit & 31;
    const mask = bits >= 32 ? 0xffffffff : (1 << bits) - 1;
    value = value & mask;
    const first = this.words[wordIndex] ?? 0;
    const clearedFirst = (first & ~(mask << bitOffset)) >>> 0;
    this.words[wordIndex] = (clearedFirst | (value << bitOffset)) >>> 0;
    const bitsWritten = 32 - bitOffset;
    if (bitsWritten < bits) {
      const second = this.words[wordIndex + 1] ?? 0;
      const lowMask = (mask >>> bitsWritten) >>> 0;
      const clearedSecond = (second & ~lowMask) >>> 0;
      this.words[wordIndex + 1] = (clearedSecond | (value >>> bitsWritten)) >>> 0;
    }
  }

  /** Re-pack every entry into a new bit width without changing values. */
  resize(bitsPerEntry: number): void {
    if (bitsPerEntry === this.bitsPerEntry) return;
    const next = new PackedIntegerArray(bitsPerEntry, this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      next.set(i, this.get(i));
    }
    this.bitsPerEntry = bitsPerEntry;
    this.words = next.words;
  }

  serialize(): number[] {
    return this.words.slice();
  }

  static deserialize(bitsPerEntry: number, capacity: number, words: number[]): PackedIntegerArray {
    return new PackedIntegerArray(bitsPerEntry, capacity, words);
  }
}

/**
 * Compact paletted storage for a fixed number of slots.
 *
 * Values are de-duplicated into a runtime palette; each slot stores the ordinal
 * of its value. The backing {@link PackedIntegerArray} widens its bit width
 * automatically as the palette grows (from {@link MIN_PALETTE_BITS} up to
 * {@link MAX_PALETTE_BITS}). Serialization is deterministic and round-trips
 * exactly through {@link serialize}/{@link deserialize}.
 */
export class PalettedContainer<T> {
  readonly capacity: number;
  private readonly defaultValue: T;
  private readonly keyOf: (value: T) => string | number;
  private readonly encode: (value: T) => number;
  private palette: T[];
  private keyToOrdinal: Map<string | number, number>;
  private bits: number;
  private storage: PackedIntegerArray;

  constructor(options: PalettedContainerOptions<T>) {
    this.capacity = options.capacity ?? SECTION_VOLUME;
    this.defaultValue = options.defaultValue;
    this.keyOf = options.keyOf ?? ((v: T) => v as unknown as string | number);
    this.encode = options.encode ?? ((v: T) => v as unknown as number);
    this.bits = options.bitsPerEntry ?? MIN_PALETTE_BITS;
    if (this.bits < MIN_PALETTE_BITS) this.bits = MIN_PALETTE_BITS;
    if (this.bits > MAX_PALETTE_BITS) this.bits = MAX_PALETTE_BITS;
    this.palette = [];
    this.keyToOrdinal = new Map();
    this.storage = new PackedIntegerArray(this.bits, this.capacity);
    this.registerValue(this.defaultValue);
    for (let i = 0; i < this.capacity; i++) {
      this.storage.set(i, 0);
    }
  }

  private registerValue(value: T): number {
    const key = this.keyOf(value);
    const existing = this.keyToOrdinal.get(key);
    if (existing !== undefined) return existing;
    const ordinal = this.palette.length;
    this.palette.push(value);
    this.keyToOrdinal.set(key, ordinal);
    this.ensureBitsForPalette();
    return ordinal;
  }

  private ensureBitsForPalette(): void {
    let required = MIN_PALETTE_BITS;
    const size = this.palette.length;
    while ((1 << required) < size) {
      required++;
      if (required >= MAX_PALETTE_BITS) {
        required = MAX_PALETTE_BITS;
        break;
      }
    }
    if (required > this.bits) {
      this.bits = required;
      this.storage.resize(this.bits);
    }
  }

  get(index: number): T {
    const ordinal = this.storage.get(index);
    return this.palette[ordinal] ?? this.defaultValue;
  }

  set(index: number, value: T): void {
    const ordinal = this.registerValue(value);
    this.storage.set(index, ordinal);
  }

  get bitsPerEntry(): number {
    return this.bits;
  }

  get paletteSize(): number {
    return this.palette.length;
  }

  serialize(): SerializedPalettedContainer {
    return {
      version: PALETTED_CONTAINER_VERSION,
      capacity: this.capacity,
      bitsPerEntry: this.bits,
      palette: this.palette.map((v) => this.encode(v)),
      storage: this.storage.serialize(),
    };
  }

  static deserialize<T>(
    data: SerializedPalettedContainer,
    options: PalettedContainerOptions<T>,
  ): PalettedContainer<T> {
    const container = new PalettedContainer<T>(options);
    if (data.version !== PALETTED_CONTAINER_VERSION) {
      throw new Error(`Unsupported paletted container version: ${data.version}`);
    }
    if (data.capacity !== container.capacity) {
      throw new Error(`Paletted container capacity mismatch: ${data.capacity} vs ${container.capacity}`);
    }
    const decode = options.decode ?? ((n: number) => n as unknown as T);
    const keyOf = options.keyOf ?? ((v: T) => v as unknown as string | number);
    container.bits = data.bitsPerEntry;
    container.palette = data.palette.map((id) => decode(id));
    container.keyToOrdinal = new Map();
    container.palette.forEach((v, i) => container.keyToOrdinal.set(keyOf(v), i));
    container.storage = PackedIntegerArray.deserialize(data.bitsPerEntry, data.capacity, data.storage);
    return container;
  }
}
