/**
 * Server chunk streaming model (226): a pure headless per-connection chunk interest and
 * snapshot tracker. Interest is the Chebyshev square around a center at a validated view
 * distance; `setCenter` reports exactly which column keys entered and left. Snapshots are
 * validated column envelopes (sections with opaque non-negative payloads and a server tick)
 * kept in a bounded store with oldest-first eviction and dirty tracking. `pendingUpdates`
 * consumes the entered/left/dirty accumulators into key-sorted, exactly-once update sets.
 * No world access, no IO; fully unit-testable headlessly.
 */
export type ChunkKey = string;

/** Column key format: "x,z". */
export function columnKey(x: number, z: number): ChunkKey {
  return `${x},${z}`;
}

export interface ChunkCoord {
  readonly x: number;
  readonly z: number;
}

/** One 16-block vertical section payload: section y index + opaque block-id data. */
export interface SectionSnapshot {
  readonly y: number;
  readonly data: readonly number[];
}

/** A full column snapshot: envelope + sections + the server tick it was captured at. */
export interface ChunkSnapshot {
  /** Must equal columnKey(x, z). */
  readonly key: ChunkKey;
  readonly x: number;
  readonly z: number;
  readonly sections: readonly SectionSnapshot[];
  readonly tick: number;
}

export interface ChunkStreamOptions {
  /** Chebyshev interest radius in columns; positive integer. */
  readonly viewDistance: number;
  /** Bounded snapshot store size; positive integer (default 1024). */
  readonly maxSnapshots?: number;
  /** Max sections per column snapshot (adversarial bound; default 512). */
  readonly maxSectionsPerSnapshot?: number;
  /** Max block-id entries per section `data` array (adversarial bound; default 16384). */
  readonly maxSectionDataLength?: number;
}

/** Result of a center move: key-sorted entered/left column keys (accumulated until consumed). */
export interface InterestDelta {
  readonly entered: readonly ChunkKey[];
  readonly left: readonly ChunkKey[];
}

/** Consumed update set: exactly-once, key-sorted. */
export interface ChunkUpdate {
  readonly tick: number;
  /** Entered columns with a snapshot available. */
  readonly added: readonly ChunkSnapshot[];
  /** Columns that left since the last pendingUpdates. */
  readonly removed: readonly ChunkKey[];
  /** Dirty snapshots inside the current interest. */
  readonly updated: readonly ChunkSnapshot[];
}

const DEFAULT_MAX_SNAPSHOTS = 1024;
const DEFAULT_MAX_SECTIONS_PER_SNAPSHOT = 512;
const DEFAULT_MAX_SECTION_DATA_LENGTH = 16384;

function validateViewDistance(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('ChunkStream: viewDistance must be a positive integer');
  }
  return value;
}

function validateMaxSnapshots(value: number | undefined): number {
  const v = value ?? DEFAULT_MAX_SNAPSHOTS;
  if (!Number.isInteger(v) || v <= 0) {
    throw new Error('ChunkStream: maxSnapshots must be a positive integer');
  }
  return v;
}

function validatePositiveInt(value: number | undefined, fallback: number, label: string): number {
  const v = value ?? fallback;
  if (!Number.isInteger(v) || v <= 0) {
    throw new Error(`ChunkStream: ${label} must be a positive integer`);
  }
  return v;
}

function validateTick(tick: number): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error('ChunkStream: tick must be a non-negative safe integer');
  }
}

function validateSnapshot(
  snapshot: ChunkSnapshot,
  maxSectionsPerSnapshot = DEFAULT_MAX_SECTIONS_PER_SNAPSHOT,
  maxSectionDataLength = DEFAULT_MAX_SECTION_DATA_LENGTH,
): void {
  if (typeof snapshot !== 'object' || snapshot === null) {
    throw new Error('ChunkStream: snapshot must be an object');
  }
  const { key, x, z, sections, tick } = snapshot;
  if (!Number.isInteger(x) || !Number.isInteger(z)) {
    throw new Error('ChunkStream: snapshot coordinates must be integers');
  }
  if (typeof key !== 'string' || key !== columnKey(x, z)) {
    throw new Error(`ChunkStream: snapshot key ${String(key)} does not match (${x}, ${z})`);
  }
  validateTick(tick);
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error('ChunkStream: snapshot sections must be a non-empty array');
  }
  if (sections.length > maxSectionsPerSnapshot) {
    throw new Error(
      `ChunkStream: snapshot exceeds maxSectionsPerSnapshot (${maxSectionsPerSnapshot})`,
    );
  }
  const seenY = new Set<number>();
  for (const section of sections) {
    if (typeof section !== 'object' || section === null) {
      throw new Error('ChunkStream: snapshot section must be an object');
    }
    if (!Number.isInteger(section.y)) {
      throw new Error('ChunkStream: section y must be an integer');
    }
    if (seenY.has(section.y)) {
      throw new Error(`ChunkStream: duplicate section y ${section.y}`);
    }
    seenY.add(section.y);
    if (!Array.isArray(section.data) || section.data.length === 0) {
      throw new Error('ChunkStream: section data must be a non-empty array');
    }
    if (section.data.length > maxSectionDataLength) {
      throw new Error(
        `ChunkStream: section data exceeds maxSectionDataLength (${maxSectionDataLength})`,
      );
    }
    for (const value of section.data) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error('ChunkStream: section data must be non-negative safe integers');
      }
    }
  }
}

/** Pure headless per-connection chunk interest + snapshot tracker. */
export class ChunkStreamManager {
  private readonly viewDistance: number;
  private readonly maxSnapshots: number;
  private readonly maxSectionsPerSnapshot: number;
  private readonly maxSectionDataLength: number;

  private center_: ChunkCoord | null = null;
  private readonly store = new Map<ChunkKey, ChunkSnapshot>();
  private readonly dirty = new Set<ChunkKey>();
  private readonly entered = new Set<ChunkKey>();
  private readonly left = new Set<ChunkKey>();

  constructor(options: ChunkStreamOptions) {
    this.viewDistance = validateViewDistance(options.viewDistance);
    this.maxSnapshots = validateMaxSnapshots(options.maxSnapshots);
    this.maxSectionsPerSnapshot = validatePositiveInt(
      options.maxSectionsPerSnapshot,
      DEFAULT_MAX_SECTIONS_PER_SNAPSHOT,
      'maxSectionsPerSnapshot',
    );
    this.maxSectionDataLength = validatePositiveInt(
      options.maxSectionDataLength,
      DEFAULT_MAX_SECTION_DATA_LENGTH,
      'maxSectionDataLength',
    );
  }

  /**
   * Move the interest center. Returns the key-sorted entered/left delta of THIS move
   * against the previous center (the first call enters the whole interest set). The keys
   * also accumulate internally (with any previous moves) until `pendingUpdates` consumes
   * them. Coordinates must be integers.
   */
  setCenter(x: number, z: number): InterestDelta {
    if (!Number.isInteger(x) || !Number.isInteger(z)) {
      throw new Error('ChunkStream: center coordinates must be integers');
    }
    const next = new Set<ChunkKey>();
    for (let dz = -this.viewDistance; dz <= this.viewDistance; dz++) {
      for (let dx = -this.viewDistance; dx <= this.viewDistance; dx++) {
        next.add(columnKey(x + dx, z + dz));
      }
    }
    const freshEntered: ChunkKey[] = [];
    const freshLeft: ChunkKey[] = [];
    if (this.center_ === null) {
      for (const key of next) {
        this.entered.add(key);
        freshEntered.push(key);
      }
    } else {
      const previous = new Set(this.interest());
      for (const key of next) {
        if (!previous.has(key)) {
          this.entered.add(key);
          freshEntered.push(key);
        }
      }
      for (const key of previous) {
        if (!next.has(key)) {
          this.left.add(key);
          freshLeft.push(key);
        }
      }
    }
    this.center_ = { x, z };
    return { entered: freshEntered.sort(), left: freshLeft.sort() };
  }

  /** The current interest center, or null before the first move. */
  get center(): ChunkCoord | null {
    return this.center_ === null ? null : { ...this.center_ };
  }

  /** True when (x, z) is inside the Chebyshev interest square; false without a center. */
  isInterested(x: number, z: number): boolean {
    if (this.center_ === null) return false;
    const c = this.center_;
    return Math.abs(x - c.x) <= this.viewDistance && Math.abs(z - c.z) <= this.viewDistance;
  }

  /** The current interest set, key-sorted. */
  interest(): readonly ChunkKey[] {
    if (this.center_ === null) return [];
    const keys: ChunkKey[] = [];
    for (let dz = -this.viewDistance; dz <= this.viewDistance; dz++) {
      for (let dx = -this.viewDistance; dx <= this.viewDistance; dx++) {
        keys.push(columnKey(this.center_.x + dx, this.center_.z + dz));
      }
    }
    return keys.sort();
  }

  /** Validate and store a snapshot; replaces any previous snapshot for the key and marks
   *  it dirty. Evicts the oldest-inserted snapshot when the store is full. */
  putSnapshot(snapshot: ChunkSnapshot): void {
    validateSnapshot(snapshot, this.maxSectionsPerSnapshot, this.maxSectionDataLength);
    if (!this.store.has(snapshot.key) && this.store.size >= this.maxSnapshots) {
      const oldest = this.store.keys().next().value as ChunkKey;
      this.store.delete(oldest);
      this.dirty.delete(oldest);
    }
    this.store.set(snapshot.key, snapshot);
    this.dirty.add(snapshot.key);
  }

  /** The stored snapshot for a key, or null. */
  getSnapshot(key: ChunkKey): ChunkSnapshot | null {
    return this.store.get(key) ?? null;
  }

  /** True when a snapshot is stored for the key. */
  hasSnapshot(key: ChunkKey): boolean {
    return this.store.has(key);
  }

  /** Delete the snapshot and its dirty flag (accumulators untouched). */
  removeSnapshot(key: ChunkKey): void {
    this.store.delete(key);
    this.dirty.delete(key);
  }

  /**
   * Consume the accumulators into a key-sorted update set. `added` = entered columns with
   * snapshots; `removed` = left columns; `updated` = dirty snapshots inside the current
   * interest that are not already covered by `added` (so each column is sent exactly once).
   * After the call the accumulators are empty. Rejects invalid ticks.
   */
  pendingUpdates(tick: number): ChunkUpdate {
    validateTick(tick);
    const added = [...this.entered]
      .filter((key) => this.store.has(key))
      .sort()
      .map((key) => this.store.get(key)!);
    const removed = this.sortedLeft();
    const updated = [...this.dirty]
      .filter(
        (key) => !this.entered.has(key) && this.isInterestedKey(key) && this.store.has(key),
      )
      .sort()
      .map((key) => this.store.get(key)!);
    this.entered.clear();
    this.left.clear();
    this.dirty.clear();
    return { tick, added, removed, updated };
  }

  /** Restore the pristine construction state. */
  reset(): void {
    this.center_ = null;
    this.store.clear();
    this.dirty.clear();
    this.entered.clear();
    this.left.clear();
  }

  private isInterestedKey(key: ChunkKey): boolean {
    if (this.center_ === null) return false;
    const parts = key.split(',');
    const x = Number(parts[0]);
    const z = Number(parts[1]);
    return Math.abs(x - this.center_.x) <= this.viewDistance && Math.abs(z - this.center_.z) <= this.viewDistance;
  }

  private sortedLeft(): readonly ChunkKey[] {
    return [...this.left].sort();
  }
}
