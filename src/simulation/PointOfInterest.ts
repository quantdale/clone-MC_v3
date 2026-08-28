/**
 * Point-of-interest system (149): a chunk-scoped, in-memory registry of typed, claimable block
 * positions ("this block is a bed" / "this block is a workstation") for future villager-like AI.
 * `PointOfInterestManager` mirrors 129's `EntityManager` shape (strict add validation, chunk-scoped
 * `serializeChunk`/`deserializeChunk`/`forgetChunk` via 021 `sectionIndex`) applied to a stationary
 * position with a single claimed/unclaimed boolean instead of a moving entity's lifecycle state.
 *
 * No real IndexedDB persistence store (no existing store to bridge into, unlike 131's bridge into
 * 037's already-existing entity store — deferred to a future persistence-wiring change), no
 * villager entity/profession catalog, no multi-claimant "free ticket count" model, no spatial
 * acceleration structure — see `openspec/changes/149-point-of-interest-system/design.md`.
 */
import { type ResourceId, resourceIdToString, tryParseResourceId } from '../data/ResourceId';
import { sectionIndex } from '../math/SectionCoordinate';

/** One point-of-interest record: a type, an integer block position, and claim state. */
export interface PointOfInterestRecord {
  readonly type: ResourceId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly claimed: boolean;
}

/** Current schema version for {@link SerializedPoi}. */
export const POI_RECORD_VERSION = 1;

/** The persisted-envelope shape for one POI record. */
export interface SerializedPoi {
  readonly schemaVersion: 1;
  readonly typeKey: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly claimed: boolean;
}

function isFiniteInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && Number.isFinite(v);
}

/** Validate and narrow `input` to a well-formed {@link SerializedPoi}. Throws on any defect. */
export function validateSerializedPoi(input: unknown): SerializedPoi {
  if (typeof input !== 'object' || input === null) {
    throw new Error('PointOfInterest: malformed record payload');
  }
  const r = input as Record<string, unknown>;
  if (r.schemaVersion !== POI_RECORD_VERSION) {
    throw new Error(`PointOfInterest: unsupported schemaVersion ${String(r.schemaVersion)}`);
  }
  if (typeof r.typeKey !== 'string' || !tryParseResourceId(r.typeKey)) {
    throw new Error('PointOfInterest: malformed or unparsable typeKey');
  }
  if (!isFiniteInteger(r.x) || !isFiniteInteger(r.y) || !isFiniteInteger(r.z)) {
    throw new Error('PointOfInterest: x/y/z must be finite integers');
  }
  if (typeof r.claimed !== 'boolean') {
    throw new Error('PointOfInterest: claimed must be a boolean');
  }
  return {
    schemaVersion: POI_RECORD_VERSION,
    typeKey: r.typeKey,
    x: r.x,
    y: r.y,
    z: r.z,
    claimed: r.claimed,
  };
}

function positionKey(x: number, y: number, z: number): string {
  return `${x}|${y}|${z}`;
}

function distance3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Chunk-scoped, in-memory store of {@link PointOfInterestRecord}s keyed by integer block position. */
export class PointOfInterestManager {
  private readonly byPosition = new Map<string, PointOfInterestRecord>();
  private readonly order: string[] = [];

  /**
   * Register a new, unclaimed POI of `type` at `(x, y, z)`. Throws (manager unchanged) when a
   * record already exists at that exact position, or when any coordinate is not a finite integer.
   */
  add(type: ResourceId, x: number, y: number, z: number): PointOfInterestRecord {
    if (!isFiniteInteger(x) || !isFiniteInteger(y) || !isFiniteInteger(z)) {
      throw new Error('PointOfInterestManager: x/y/z must be finite integers');
    }
    const key = positionKey(x, y, z);
    if (this.byPosition.has(key)) {
      throw new Error(`PointOfInterestManager: a POI already exists at ${key}`);
    }
    const record: PointOfInterestRecord = { type, x, y, z, claimed: false };
    this.byPosition.set(key, record);
    this.order.push(key);
    return record;
  }

  /** Remove the POI at `(x, y, z)`, if any. Returns whether one existed. */
  remove(x: number, y: number, z: number): boolean {
    const key = positionKey(x, y, z);
    if (!this.byPosition.has(key)) return false;
    this.byPosition.delete(key);
    const index = this.order.indexOf(key);
    if (index >= 0) this.order.splice(index, 1);
    return true;
  }

  /** The POI at `(x, y, z)`, or `undefined` if none is registered there. */
  get(x: number, y: number, z: number): PointOfInterestRecord | undefined {
    return this.byPosition.get(positionKey(x, y, z));
  }

  /** Every registered POI, in registration order. */
  getAll(): readonly PointOfInterestRecord[] {
    return this.order.map((key) => this.byPosition.get(key)!);
  }

  /** Registered POIs whose position falls in chunk `(cx, cz)`, in registration order. */
  getInChunk(cx: number, cz: number): readonly PointOfInterestRecord[] {
    return this.getAll().filter((r) => sectionIndex(r.x) === cx && sectionIndex(r.z) === cz);
  }

  /** Mark the POI at `(x, y, z)` claimed. Returns `true` only if it exists and was unclaimed. */
  claim(x: number, y: number, z: number): boolean {
    const key = positionKey(x, y, z);
    const record = this.byPosition.get(key);
    if (!record || record.claimed) return false;
    this.byPosition.set(key, { ...record, claimed: true });
    return true;
  }

  /** Mark the POI at `(x, y, z)` unclaimed. Returns `true` only if it exists and was claimed. */
  release(x: number, y: number, z: number): boolean {
    const key = positionKey(x, y, z);
    const record = this.byPosition.get(key);
    if (!record || !record.claimed) return false;
    this.byPosition.set(key, { ...record, claimed: false });
    return true;
  }

  /**
   * The nearest unclaimed POI of `type` within `maxDistance` of `(x, y, z)`, or `null` if none
   * qualifies. Ties (equal distance) break by registration order. Pure: never mutates state.
   */
  findNearestUnclaimed(
    type: ResourceId,
    x: number,
    y: number,
    z: number,
    maxDistance: number,
  ): PointOfInterestRecord | null {
    const typeKey = resourceIdToString(type);
    let best: PointOfInterestRecord | null = null;
    let bestDistance = Infinity;
    for (const record of this.getAll()) {
      if (record.claimed || resourceIdToString(record.type) !== typeKey) continue;
      const dist = distance3(x, y, z, record.x, record.y, record.z);
      if (dist > maxDistance) continue;
      if (dist < bestDistance) {
        best = record;
        bestDistance = dist;
      }
    }
    return best;
  }

  /** Serialize every POI in chunk `(cx, cz)` to the {@link SerializedPoi} envelope. Pure. */
  serializeChunk(cx: number, cz: number): SerializedPoi[] {
    return this.getInChunk(cx, cz).map((r) => ({
      schemaVersion: POI_RECORD_VERSION,
      typeKey: resourceIdToString(r.type),
      x: r.x,
      y: r.y,
      z: r.z,
      claimed: r.claimed,
    }));
  }

  /**
   * Restore chunk `(cx, cz)`'s POIs from {@link SerializedPoi}-shaped payloads. The whole batch is
   * validated first (envelope, chunk membership, no duplicate position within the batch or against
   * the manager); on any rejection the manager is left unchanged and an `Error` is thrown. Returns
   * the number of POIs added.
   */
  deserializeChunk(cx: number, cz: number, records: unknown[]): number {
    const parsed = records.map((r) => validateSerializedPoi(r));

    interface Pending {
      type: ResourceId;
      x: number;
      y: number;
      z: number;
      claimed: boolean;
      key: string;
    }
    const pending: Pending[] = [];
    const seenKeys = new Set<string>();

    for (const record of parsed) {
      if (sectionIndex(record.x) !== cx || sectionIndex(record.z) !== cz) {
        throw new Error(`PointOfInterestManager: POI at ${record.x},${record.z} is outside chunk ${cx},${cz}`);
      }
      const type = tryParseResourceId(record.typeKey);
      if (!type) {
        throw new Error(`PointOfInterestManager: malformed typeKey ${record.typeKey}`);
      }
      const key = positionKey(record.x, record.y, record.z);
      if (seenKeys.has(key) || this.byPosition.has(key)) {
        throw new Error(`PointOfInterestManager: duplicate POI position ${key}`);
      }
      seenKeys.add(key);
      pending.push({ type, x: record.x, y: record.y, z: record.z, claimed: record.claimed, key });
    }

    for (const p of pending) {
      this.byPosition.set(p.key, { type: p.type, x: p.x, y: p.y, z: p.z, claimed: p.claimed });
      this.order.push(p.key);
    }
    return pending.length;
  }

  /** Permanently evict every POI whose position falls in chunk `(cx, cz)`. Returns the count removed. */
  forgetChunk(cx: number, cz: number): number {
    let removed = 0;
    for (const key of [...this.order]) {
      const record = this.byPosition.get(key)!;
      if (sectionIndex(record.x) !== cx || sectionIndex(record.z) !== cz) continue;
      this.byPosition.delete(key);
      const index = this.order.indexOf(key);
      if (index >= 0) this.order.splice(index, 1);
      removed++;
    }
    return removed;
  }

  /** Remove every registered POI. */
  clear(): void {
    this.byPosition.clear();
    this.order.length = 0;
  }
}
