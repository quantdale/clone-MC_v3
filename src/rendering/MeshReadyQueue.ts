import {
  DEFAULT_MAX_MESH_RESULT_BYTES,
  typedMeshLayerStreamsByteLength,
  validateTypedMeshLayerStreams,
  type MeshResultCaps,
  type TypedMeshLayerStreams,
} from './TypedMeshStreams';
import {
  validateSectionVersionSnapshot,
  type SectionVersionSnapshot,
} from '../world/SectionVersionSnapshot';

/** Canonical identity of the section represented by a mesh-ready record. */
export interface MeshReadySectionIdentity {
  readonly sectionX: number;
  readonly sectionY: number;
  readonly sectionZ: number;
}

/** A validated worker result waiting for the separate GPU upload stage. */
export interface MeshReadyRecord {
  readonly requestId: string;
  readonly target: MeshReadySectionIdentity;
  readonly generation: number;
  readonly versionSnapshot: SectionVersionSnapshot;
  readonly layers: TypedMeshLayerStreams;
  readonly byteLength: number;
  readonly lod: 0 | 1 | 2 | 3;
}

/** Hard bounds for mesh-ready records held between worker completion and upload. */
export interface MeshReadyQueueConfig extends MeshResultCaps {
  readonly maxRecords: number;
  readonly maxBytes: number;
}

/** Immutable queue metrics suitable for the performance monitor/debug overlay. */
export interface MeshReadyQueueMetrics {
  readonly count: number;
  readonly bytes: number;
  readonly oldestAgeMs: number;
  readonly deferredCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
}

export interface MeshReadyQueueAdmission {
  readonly accepted: boolean;
  readonly reason?: 'duplicate' | 'record-cap' | 'byte-cap' | 'invalid';
}

const DEFAULT_MAX_RECORDS = 64;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`MeshReadyQueue: ${name} must be a positive integer`);
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isSectionIdentity(value: unknown): value is MeshReadySectionIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const raw = value as Record<string, unknown>;
  return Number.isInteger(raw.sectionX) && Number.isInteger(raw.sectionY) && Number.isInteger(raw.sectionZ);
}

function isVersionSnapshot(value: unknown): value is SectionVersionSnapshot {
  return typeof value === 'object' && value !== null && Array.isArray((value as { sections?: unknown }).sections);
}

function isRecord(value: unknown): value is MeshReadyRecord {
  if (typeof value !== 'object' || value === null) return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.requestId === 'string' && raw.requestId.length > 0 &&
    isSectionIdentity(raw.target) && isNonNegativeInteger(raw.generation) &&
    isVersionSnapshot(raw.versionSnapshot) && typeof raw.layers === 'object' && raw.layers !== null &&
    isNonNegativeInteger(raw.byteLength) &&
    (raw.lod === 0 || raw.lod === 1 || raw.lod === 2 || raw.lod === 3);
}

function validateConfig(config: Partial<MeshReadyQueueConfig>): MeshReadyQueueConfig {
  const maxRecords = config.maxRecords ?? DEFAULT_MAX_RECORDS;
  const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES;
  assertPositiveInteger(maxRecords, 'maxRecords');
  assertPositiveInteger(maxBytes, 'maxBytes');
  if (config.maxBytes !== undefined) assertPositiveInteger(config.maxBytes, 'maxBytes');
  if (config.maxRecords !== undefined) assertPositiveInteger(config.maxRecords, 'maxRecords');
  return { ...config, maxRecords, maxBytes };
}

/**
 * Bounded handoff between worker completion and GPU upload.
 *
 * A rejected record is never partially admitted: its typed streams remain owned by the caller,
 * and the queue's counters are unchanged. Dequeue preserves the complete record so a later
 * upload scheduler can defer it without rebuilding or dropping any layer.
 */
export class MeshReadyQueue {
  private readonly config: MeshReadyQueueConfig;
  private readonly now: () => number;
  private readonly records: Array<{ record: MeshReadyRecord; enqueuedAtMs: number }> = [];
  private readonly requestIds = new Set<string>();
  private readonly detachedEnqueueTimes = new WeakMap<MeshReadyRecord, number>();
  private bytes = 0;
  private deferredCount = 0;
  private acceptedCount = 0;
  private rejectedCount = 0;

  constructor(config: Partial<MeshReadyQueueConfig> = {}, now: () => number = () => performance.now()) {
    this.config = validateConfig(config);
    this.now = now;
  }

  /** Validate and admit one complete record, or reject it without changing queue state. */
  enqueue(input: unknown): MeshReadyQueueAdmission {
    let record: MeshReadyRecord;
    try {
      record = this.validateRecord(input);
    } catch {
      this.rejectedCount += 1;
      return { accepted: false, reason: 'invalid' };
    }
    if (this.requestIds.has(record.requestId)) {
      this.rejectedCount += 1;
      return { accepted: false, reason: 'duplicate' };
    }
    if (this.records.length >= this.config.maxRecords) {
      this.rejectedCount += 1;
      return { accepted: false, reason: 'record-cap' };
    }
    if (this.bytes + record.byteLength > this.config.maxBytes) {
      this.rejectedCount += 1;
      return { accepted: false, reason: 'byte-cap' };
    }
    this.records.push({ record, enqueuedAtMs: this.now() });
    this.requestIds.add(record.requestId);
    this.bytes += record.byteLength;
    this.acceptedCount += 1;
    return { accepted: true };
  }

  /** Remove and return the oldest complete record for upload. */
  dequeue(): MeshReadyRecord | undefined {
    const entry = this.records.shift();
    if (entry === undefined) return undefined;
    this.requestIds.delete(entry.record.requestId);
    this.bytes -= entry.record.byteLength;
    this.detachedEnqueueTimes.set(entry.record, entry.enqueuedAtMs);
    return entry.record;
  }

  /** Return a record to the front intact after an upload-budget deferral. */
  defer(record: MeshReadyRecord): void {
    const validated = this.validateRecord(record);
    if (this.requestIds.has(validated.requestId)) {
      throw new Error(`MeshReadyQueue: cannot defer duplicate request ${validated.requestId}`);
    }
    if (this.records.length >= this.config.maxRecords || this.bytes + validated.byteLength > this.config.maxBytes) {
      throw new RangeError('MeshReadyQueue: deferred record exceeds queue cap');
    }
    this.records.unshift({
      record: validated,
      enqueuedAtMs: this.detachedEnqueueTimes.get(record) ?? this.now(),
    });
    this.detachedEnqueueTimes.delete(record);
    this.requestIds.add(validated.requestId);
    this.bytes += validated.byteLength;
    this.deferredCount += 1;
  }

  /** Remove all records, returning their complete ownership-bearing records. */
  drain(): MeshReadyRecord[] {
    const drained: MeshReadyRecord[] = [];
    while (this.records.length > 0) {
      drained.push(this.dequeue()!);
    }
    return drained;
  }

  peek(): MeshReadyRecord | undefined {
    return this.records[0]?.record;
  }

  get size(): number {
    return this.records.length;
  }

  get byteLength(): number {
    return this.bytes;
  }

  metrics(): MeshReadyQueueMetrics {
    const oldest = this.records[0];
    const age = oldest === undefined ? 0 : Math.max(0, this.now() - oldest.enqueuedAtMs);
    return {
      count: this.records.length,
      bytes: this.bytes,
      oldestAgeMs: age,
      deferredCount: this.deferredCount,
      acceptedCount: this.acceptedCount,
      rejectedCount: this.rejectedCount,
    };
  }

  private validateRecord(input: unknown): MeshReadyRecord {
    if (!isRecord(input)) throw new TypeError('MeshReadyQueue: invalid mesh-ready record');
    const layers = validateTypedMeshLayerStreams(input.layers, {
      maxBytes: DEFAULT_MAX_MESH_RESULT_BYTES,
      maxQuads: this.config.maxQuads,
      maxVertices: this.config.maxVertices,
    });
    const versionSnapshot = validateSectionVersionSnapshot(input.versionSnapshot);
    const target = Object.freeze({ ...input.target });
    const byteLength = typedMeshLayerStreamsByteLength(layers);
    if (input.byteLength !== byteLength) {
      throw new Error('MeshReadyQueue: byteLength does not match layer streams');
    }
    return Object.freeze({ ...input, target, versionSnapshot, layers, byteLength });
  }
}

export const DEFAULT_MESH_READY_QUEUE_CONFIG: MeshReadyQueueConfig = Object.freeze({
  maxRecords: DEFAULT_MAX_RECORDS,
  maxBytes: DEFAULT_MAX_BYTES,
});
