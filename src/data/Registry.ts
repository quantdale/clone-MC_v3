import { type ResourceId, resourceIdToString } from './ResourceId';

/** Stable failure category for registry operations. */
export type RegistryErrorReason =
  | 'DUPLICATE_ID'
  | 'MISSING_ID'
  | 'INVALID_RUNTIME_ID'
  | 'FINALIZED'
  | 'CYCLE'
  | 'NOT_FINALIZED';

export class RegistryError extends Error {
  readonly reason: RegistryErrorReason;
  readonly identifier: string | undefined;

  constructor(reason: RegistryErrorReason, identifier: string | undefined, detail: string) {
    super(`Registry error (${reason}): ${detail}`);
    this.name = 'RegistryError';
    this.reason = reason;
    this.identifier = identifier;
  }
}

/** Immutable association of one ResourceId with one typed value. */
export interface RegistryEntry<T> {
  readonly runtimeId: number;
  readonly id: ResourceId;
  readonly value: T;
}

function isValidRuntimeId(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Generic typed registry keyed by 002 ResourceId with dense deterministic runtime IDs.
 *
 * Runtime IDs are process/data-set local and MUST NOT be treated as persistent
 * external identity. Registration order is the source of truth for ID assignment.
 * After finalize, mutation is forbidden but lookups and iteration remain available.
 */
export class Registry<T> {
  private readonly byKey = new Map<string, RegistryEntry<T>>();
  private readonly byRuntimeId: RegistryEntry<T>[] = [];
  private isFinalized = false;

  /** Whether the registry has been finalized and can no longer accept mutations. */
  get finalized(): boolean {
    return this.isFinalized;
  }

  /** Number of registered entries; also the next runtime ID that would be assigned. */
  get size(): number {
    return this.byRuntimeId.length;
  }

  /**
   * Register a previously absent ResourceId. Assigns runtime ID equal to the
   * current size. Fails without mutation when finalized or when the id exists.
   */
  register(id: ResourceId, value: T): RegistryEntry<T> {
    if (this.isFinalized) {
      throw new RegistryError('FINALIZED', resourceIdToString(id), 'cannot register after finalize');
    }
    const key = resourceIdToString(id);
    if (this.byKey.has(key)) {
      throw new RegistryError('DUPLICATE_ID', key, 'identifier already registered');
    }
    const entry: RegistryEntry<T> = Object.freeze({
      runtimeId: this.byRuntimeId.length,
      id,
      value,
    });
    this.byKey.set(key, entry);
    this.byRuntimeId.push(entry);
    return entry;
  }

  /** One-way finalization. Repeated calls are safe and change nothing. */
  finalize(): void {
    this.isFinalized = true;
  }

  /** Strict lookup by ResourceId. Throws MISSING_ID when absent. */
  get(id: ResourceId): T {
    const entry = this.byKey.get(resourceIdToString(id));
    if (entry === undefined) {
      throw new RegistryError('MISSING_ID', resourceIdToString(id), 'identifier not registered');
    }
    return entry.value;
  }

  /** Optional lookup by ResourceId. Returns undefined when absent. */
  getOptional(id: ResourceId): T | undefined {
    return this.byKey.get(resourceIdToString(id))?.value;
  }

  /** Whether a ResourceId is registered. */
  has(id: ResourceId): boolean {
    return this.byKey.has(resourceIdToString(id));
  }

  /** Strict runtime-ID lookup. Rejects negative, fractional, non-finite, or out-of-range ids. */
  getByRuntimeId(runtimeId: number): T {
    return this.getEntryByRuntimeId(runtimeId).value;
  }

  /** Strict runtime-ID entry lookup. Throws INVALID_RUNTIME_ID for invalid ids. */
  getEntryByRuntimeId(runtimeId: number): RegistryEntry<T> {
    if (!isValidRuntimeId(runtimeId) || runtimeId >= this.byRuntimeId.length) {
      throw new RegistryError('INVALID_RUNTIME_ID', undefined, `runtime id out of range: ${String(runtimeId)}`);
    }
    const entry = this.byRuntimeId[runtimeId];
    if (entry === undefined) {
      throw new RegistryError('INVALID_RUNTIME_ID', undefined, `runtime id out of range: ${String(runtimeId)}`);
    }
    return entry;
  }

  /** Resolve the runtime ID assigned to a registered ResourceId. Throws MISSING_ID when absent. */
  getRuntimeId(id: ResourceId): number {
    const entry = this.byKey.get(resourceIdToString(id));
    if (entry === undefined) {
      throw new RegistryError('MISSING_ID', resourceIdToString(id), 'identifier not registered');
    }
    return entry.runtimeId;
  }

  /** All entries in ascending runtime-ID / registration order. */
  entries(): readonly RegistryEntry<T>[] {
    return this.byRuntimeId;
  }
}
