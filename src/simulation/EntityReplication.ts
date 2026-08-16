/**
 * Pure headless entity replication framework (229).
 *
 * Provides server-side observer interest tracking, entity registration,
 * and delta replication batch generation (spawn, despawn, transform, and
 * tracked-data updates) along with a client-side entity replica store.
 * Zero DOM or external dependencies; fully deterministic and unit-testable.
 */

export type EntityId = number;

export interface EntityPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface EntityRotation {
  readonly yaw: number;
  readonly pitch: number;
}

export interface EntityVelocity {
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
}

export interface TrackedDataValue {
  readonly id: number;
  readonly value: unknown;
}

export interface EntitySpawnDescriptor {
  readonly id: EntityId;
  readonly type: string;
  readonly position: EntityPosition;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly velocity?: EntityVelocity;
  readonly trackedData?: readonly TrackedDataValue[];
}

export interface EntityTransformUpdate {
  readonly id: EntityId;
  readonly position?: EntityPosition;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly velocity?: EntityVelocity;
}

export interface EntityDataUpdate {
  readonly id: EntityId;
  readonly entries: readonly TrackedDataValue[];
}

export interface EntityReplicationBatch {
  readonly tick: number;
  readonly spawned: readonly EntitySpawnDescriptor[];
  readonly despawned: readonly EntityId[];
  readonly transforms: readonly EntityTransformUpdate[];
  readonly trackedData: readonly EntityDataUpdate[];
}

export interface EntityReplicationOptions {
  /** Radius in blocks within which entities are replicated (default 64). */
  readonly trackingRange?: number;
  /** Maximum number of entities tracked simultaneously (default 1024). */
  readonly maxTracked?: number;
}

export interface ClientEntityState {
  readonly id: EntityId;
  readonly type: string;
  readonly position: EntityPosition;
  readonly yaw: number;
  readonly pitch: number;
  readonly velocity: EntityVelocity;
  readonly trackedData: ReadonlyMap<number, unknown>;
}

const DEFAULT_TRACKING_RANGE = 64;
const DEFAULT_MAX_TRACKED = 1024;

function validateEntityId(id: unknown): EntityId {
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0) {
    throw new Error('EntityReplication: id must be a non-negative safe integer');
  }
  return id;
}

function validateType(type: unknown): string {
  if (typeof type !== 'string' || type.trim().length === 0) {
    throw new Error('EntityReplication: type must be a non-empty string');
  }
  return type;
}

function validatePosition(pos: unknown): EntityPosition {
  if (
    typeof pos !== 'object' ||
    pos === null ||
    typeof (pos as EntityPosition).x !== 'number' ||
    !Number.isFinite((pos as EntityPosition).x) ||
    typeof (pos as EntityPosition).y !== 'number' ||
    !Number.isFinite((pos as EntityPosition).y) ||
    typeof (pos as EntityPosition).z !== 'number' ||
    !Number.isFinite((pos as EntityPosition).z)
  ) {
    throw new Error('EntityReplication: coordinates must be finite numbers');
  }
  return {
    x: (pos as EntityPosition).x,
    y: (pos as EntityPosition).y,
    z: (pos as EntityPosition).z,
  };
}

function validateRotation(yaw?: unknown, pitch?: unknown): { yaw: number; pitch: number } {
  const y = yaw ?? 0;
  const p = pitch ?? 0;
  if (typeof y !== 'number' || !Number.isFinite(y) || typeof p !== 'number' || !Number.isFinite(p)) {
    throw new Error('EntityReplication: rotation angles must be finite numbers');
  }
  return { yaw: y, pitch: p };
}

function validateVelocity(vel?: unknown): EntityVelocity {
  if (vel === undefined || vel === null) {
    return { vx: 0, vy: 0, vz: 0 };
  }
  if (
    typeof vel !== 'object' ||
    typeof (vel as EntityVelocity).vx !== 'number' ||
    !Number.isFinite((vel as EntityVelocity).vx) ||
    typeof (vel as EntityVelocity).vy !== 'number' ||
    !Number.isFinite((vel as EntityVelocity).vy) ||
    typeof (vel as EntityVelocity).vz !== 'number' ||
    !Number.isFinite((vel as EntityVelocity).vz)
  ) {
    throw new Error('EntityReplication: velocity components must be finite numbers');
  }
  return {
    vx: (vel as EntityVelocity).vx,
    vy: (vel as EntityVelocity).vy,
    vz: (vel as EntityVelocity).vz,
  };
}

function validateTrackedData(entries?: unknown): TrackedDataValue[] {
  if (entries === undefined || entries === null) {
    return [];
  }
  if (!Array.isArray(entries)) {
    throw new Error('EntityReplication: trackedData must be an array');
  }
  const result: TrackedDataValue[] = [];
  for (const entry of entries) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof entry.id !== 'number' ||
      !Number.isSafeInteger(entry.id) ||
      entry.id < 0
    ) {
      throw new Error('EntityReplication: trackedData entry id must be a non-negative safe integer');
    }
    result.push({ id: entry.id, value: entry.value });
  }
  return result;
}

function validateTick(tick: unknown): number {
  if (typeof tick !== 'number' || !Number.isSafeInteger(tick) || tick < 0) {
    throw new Error('EntityReplication: tick must be a non-negative safe integer');
  }
  return tick;
}

function validateTrackingRange(range?: number): number {
  const r = range ?? DEFAULT_TRACKING_RANGE;
  if (typeof r !== 'number' || !Number.isFinite(r) || r <= 0) {
    throw new Error('EntityReplication: trackingRange must be a positive finite number');
  }
  return r;
}

function validateMaxTracked(max?: number): number {
  const m = max ?? DEFAULT_MAX_TRACKED;
  if (typeof m !== 'number' || !Number.isSafeInteger(m) || m <= 0) {
    throw new Error('EntityReplication: maxTracked must be a positive integer');
  }
  return m;
}

interface ServerEntityRecord {
  id: EntityId;
  type: string;
  position: EntityPosition;
  yaw: number;
  pitch: number;
  velocity: EntityVelocity;
  trackedData: Map<number, unknown>;
}

/**
 * Server-side entity interest and replication manager.
 */
export class EntityReplicationManager {
  private readonly trackingRange: number;
  private readonly maxTracked: number;

  private center_: EntityPosition | null = null;
  private readonly entities = new Map<EntityId, ServerEntityRecord>();
  private readonly currentlyTracked = new Set<EntityId>();

  private readonly dirtyTransforms = new Map<EntityId, EntityTransformUpdate>();
  private readonly dirtyTrackedData = new Map<EntityId, Map<number, unknown>>();
  private readonly removedEntities = new Set<EntityId>();

  constructor(options: EntityReplicationOptions = {}) {
    this.trackingRange = validateTrackingRange(options.trackingRange);
    this.maxTracked = validateMaxTracked(options.maxTracked);
  }

  /**
   * Set the observer center (e.g. player position).
   */
  setCenter(x: number, y: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error('EntityReplication: coordinates must be finite numbers');
    }
    this.center_ = { x, y, z };
  }

  /** Current observer center or null if not set. */
  get center(): EntityPosition | null {
    return this.center_ === null ? null : { ...this.center_ };
  }

  /** Number of authoritative entities registered with the manager. */
  get authoritativeCount(): number {
    return this.entities.size;
  }

  /** Number of entities currently tracked (replicated) to the observer. */
  get trackedCount(): number {
    return this.currentlyTracked.size;
  }

  /** Whether the entity is currently tracked by the observer. */
  isTracking(id: EntityId): boolean {
    return this.currentlyTracked.has(id);
  }

  /** Whether the entity exists in the authoritative registry. */
  hasEntity(id: EntityId): boolean {
    return this.entities.has(id);
  }

  /** Get snapshot of an authoritative entity or null if not found. */
  getEntity(id: EntityId): EntitySpawnDescriptor | null {
    const record = this.entities.get(id);
    if (!record) return null;
    const trackedData: TrackedDataValue[] = [];
    for (const [propId, value] of [...record.trackedData.entries()].sort((a, b) => a[0] - b[0])) {
      trackedData.push({ id: propId, value });
    }
    return {
      id: record.id,
      type: record.type,
      position: { ...record.position },
      yaw: record.yaw,
      pitch: record.pitch,
      velocity: { ...record.velocity },
      trackedData,
    };
  }

  /**
   * Register or update an entity in the authoritative pool.
   */
  upsertEntity(descriptor: EntitySpawnDescriptor): void {
    if (typeof descriptor !== 'object' || descriptor === null) {
      throw new Error('EntityReplication: descriptor must be an object');
    }
    const id = validateEntityId(descriptor.id);
    const type = validateType(descriptor.type);
    const position = validatePosition(descriptor.position);
    const { yaw, pitch } = validateRotation(descriptor.yaw, descriptor.pitch);
    const velocity = validateVelocity(descriptor.velocity);
    const trackedDataList = validateTrackedData(descriptor.trackedData);

    if (!this.entities.has(id) && this.entities.size >= this.maxTracked) {
      throw new Error('EntityReplication: maxTracked limit exceeded');
    }

    const trackedDataMap = new Map<number, unknown>();
    for (const entry of trackedDataList) {
      trackedDataMap.set(entry.id, entry.value);
    }

    const existing = this.entities.get(id);
    this.entities.set(id, {
      id,
      type,
      position,
      yaw,
      pitch,
      velocity,
      trackedData: trackedDataMap,
    });

    this.removedEntities.delete(id);

    if (existing) {
      this.dirtyTransforms.set(id, { id, position, yaw, pitch, velocity });
      if (trackedDataMap.size > 0) {
        this.dirtyTrackedData.set(id, new Map(trackedDataMap));
      }
    }
  }

  /**
   * Update transform of an authoritative entity.
   */
  updateTransform(id: EntityId, update: Omit<EntityTransformUpdate, 'id'>): void {
    validateEntityId(id);
    const entity = this.entities.get(id);
    if (!entity) {
      throw new Error(`EntityReplication: entity ${id} does not exist`);
    }
    if (typeof update !== 'object' || update === null) {
      throw new Error('EntityReplication: update must be an object');
    }

    let pos: EntityPosition | undefined;
    if (update.position !== undefined) {
      pos = validatePosition(update.position);
      entity.position = pos;
    }

    let rot: { yaw: number; pitch: number } | undefined;
    if (update.yaw !== undefined || update.pitch !== undefined) {
      rot = validateRotation(update.yaw ?? entity.yaw, update.pitch ?? entity.pitch);
      entity.yaw = rot.yaw;
      entity.pitch = rot.pitch;
    }

    let vel: EntityVelocity | undefined;
    if (update.velocity !== undefined) {
      vel = validateVelocity(update.velocity);
      entity.velocity = vel;
    }

    const existingDelta = this.dirtyTransforms.get(id) ?? { id };
    this.dirtyTransforms.set(id, {
      id,
      position: pos ?? existingDelta.position ?? entity.position,
      yaw: rot ? rot.yaw : existingDelta.yaw ?? entity.yaw,
      pitch: rot ? rot.pitch : existingDelta.pitch ?? entity.pitch,
      velocity: vel ?? existingDelta.velocity ?? entity.velocity,
    });
  }

  /**
   * Update tracked data of an authoritative entity.
   */
  updateTrackedData(id: EntityId, entries: readonly TrackedDataValue[]): void {
    validateEntityId(id);
    const entity = this.entities.get(id);
    if (!entity) {
      throw new Error(`EntityReplication: entity ${id} does not exist`);
    }
    const validatedEntries = validateTrackedData(entries);
    if (validatedEntries.length === 0) return;

    let deltaMap = this.dirtyTrackedData.get(id);
    if (!deltaMap) {
      deltaMap = new Map<number, unknown>();
      this.dirtyTrackedData.set(id, deltaMap);
    }

    for (const entry of validatedEntries) {
      entity.trackedData.set(entry.id, entry.value);
      deltaMap.set(entry.id, entry.value);
    }
  }

  /**
   * Remove an entity from the authoritative world.
   */
  removeEntity(id: EntityId): void {
    validateEntityId(id);
    if (this.entities.has(id)) {
      this.entities.delete(id);
      this.removedEntities.add(id);
      this.dirtyTransforms.delete(id);
      this.dirtyTrackedData.delete(id);
    }
  }

  /**
   * Collect replication updates for the observer for the given tick.
   */
  collectUpdates(tick: number): EntityReplicationBatch {
    validateTick(tick);

    const inRangeIds = new Set<EntityId>();
    if (this.center_ !== null) {
      const cx = this.center_.x;
      const cy = this.center_.y;
      const cz = this.center_.z;
      const maxDistSq = this.trackingRange * this.trackingRange;

      for (const [id, entity] of this.entities.entries()) {
        const dx = entity.position.x - cx;
        const dy = entity.position.y - cy;
        const dz = entity.position.z - cz;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq <= maxDistSq) {
          inRangeIds.add(id);
        }
      }
    }

    const spawned: EntitySpawnDescriptor[] = [];
    const despawned: EntityId[] = [];
    const transforms: EntityTransformUpdate[] = [];
    const trackedData: EntityDataUpdate[] = [];

    // Check newly in-range entities -> spawned
    for (const id of [...inRangeIds].sort((a, b) => a - b)) {
      if (!this.currentlyTracked.has(id)) {
        const desc = this.getEntity(id);
        if (desc) {
          spawned.push(desc);
          this.currentlyTracked.add(id);
        }
      }
    }

    // Check entities that were tracked but are no longer in range or were removed -> despawned
    for (const id of [...this.currentlyTracked].sort((a, b) => a - b)) {
      if (!inRangeIds.has(id) || this.removedEntities.has(id)) {
        despawned.push(id);
        this.currentlyTracked.delete(id);
      }
    }

    // Transform updates for entities that are currently tracked and were not just spawned in this batch
    const newlySpawnedSet = new Set(spawned.map((s) => s.id));
    for (const [id, transform] of [...this.dirtyTransforms.entries()].sort((a, b) => a[0] - b[0])) {
      if (this.currentlyTracked.has(id) && !newlySpawnedSet.has(id)) {
        transforms.push({
          id,
          position: transform.position ? { ...transform.position } : undefined,
          yaw: transform.yaw,
          pitch: transform.pitch,
          velocity: transform.velocity ? { ...transform.velocity } : undefined,
        });
      }
    }

    // Tracked data updates for entities that are currently tracked and were not just spawned in this batch
    for (const [id, deltaMap] of [...this.dirtyTrackedData.entries()].sort((a, b) => a[0] - b[0])) {
      if (this.currentlyTracked.has(id) && !newlySpawnedSet.has(id)) {
        const entries: TrackedDataValue[] = [];
        for (const [propId, value] of [...deltaMap.entries()].sort((a, b) => a[0] - b[0])) {
          entries.push({ id: propId, value });
        }
        if (entries.length > 0) {
          trackedData.push({ id, entries });
        }
      }
    }

    // Clear accumulated dirty state
    this.dirtyTransforms.clear();
    this.dirtyTrackedData.clear();
    this.removedEntities.clear();

    return {
      tick,
      spawned,
      despawned,
      transforms,
      trackedData,
    };
  }

  /**
   * Reset manager to initial empty state.
   */
  reset(): void {
    this.center_ = null;
    this.entities.clear();
    this.currentlyTracked.clear();
    this.dirtyTransforms.clear();
    this.dirtyTrackedData.clear();
    this.removedEntities.clear();
  }
}

/**
 * Client-side entity replica store.
 */
export class ClientEntityStore {
  private readonly entities = new Map<EntityId, {
    id: EntityId;
    type: string;
    position: EntityPosition;
    yaw: number;
    pitch: number;
    velocity: EntityVelocity;
    trackedData: Map<number, unknown>;
  }>();

  /** Number of active entity replicas. */
  get size(): number {
    return this.entities.size;
  }

  /** Check if an entity replica exists. */
  hasEntity(id: EntityId): boolean {
    return this.entities.has(id);
  }

  /** Get snapshot of an entity replica or null if not present. */
  getEntity(id: EntityId): ClientEntityState | null {
    const record = this.entities.get(id);
    if (!record) return null;
    return {
      id: record.id,
      type: record.type,
      position: { ...record.position },
      yaw: record.yaw,
      pitch: record.pitch,
      velocity: { ...record.velocity },
      trackedData: new Map(record.trackedData),
    };
  }

  /** Get all entity replicas sorted by id ascending. */
  getAll(): readonly ClientEntityState[] {
    const list: ClientEntityState[] = [];
    for (const id of [...this.entities.keys()].sort((a, b) => a - b)) {
      const e = this.getEntity(id);
      if (e) list.push(e);
    }
    return list;
  }

  /**
   * Apply an incoming replication batch.
   */
  applyBatch(batch: EntityReplicationBatch): void {
    if (typeof batch !== 'object' || batch === null) {
      throw new Error('EntityReplication: batch must be an object');
    }
    validateTick(batch.tick);

    // 1. Process spawns
    if (Array.isArray(batch.spawned)) {
      for (const desc of batch.spawned) {
        if (typeof desc !== 'object' || desc === null) continue;
        const id = validateEntityId(desc.id);
        const type = validateType(desc.type);
        const position = validatePosition(desc.position);
        const { yaw, pitch } = validateRotation(desc.yaw, desc.pitch);
        const velocity = validateVelocity(desc.velocity);
        const trackedDataList = validateTrackedData(desc.trackedData);

        const trackedMap = new Map<number, unknown>();
        for (const entry of trackedDataList) {
          trackedMap.set(entry.id, entry.value);
        }

        this.entities.set(id, {
          id,
          type,
          position,
          yaw,
          pitch,
          velocity,
          trackedData: trackedMap,
        });
      }
    }

    // 2. Process transforms
    if (Array.isArray(batch.transforms)) {
      for (const transform of batch.transforms) {
        if (typeof transform !== 'object' || transform === null) continue;
        const id = validateEntityId(transform.id);
        const existing = this.entities.get(id);
        if (!existing) continue;

        if (transform.position !== undefined) {
          existing.position = validatePosition(transform.position);
        }
        if (transform.yaw !== undefined || transform.pitch !== undefined) {
          const rot = validateRotation(transform.yaw ?? existing.yaw, transform.pitch ?? existing.pitch);
          existing.yaw = rot.yaw;
          existing.pitch = rot.pitch;
        }
        if (transform.velocity !== undefined) {
          existing.velocity = validateVelocity(transform.velocity);
        }
      }
    }

    // 3. Process tracked data
    if (Array.isArray(batch.trackedData)) {
      for (const update of batch.trackedData) {
        if (typeof update !== 'object' || update === null) continue;
        const id = validateEntityId(update.id);
        const existing = this.entities.get(id);
        if (!existing) continue;
        const entries = validateTrackedData(update.entries);
        for (const entry of entries) {
          existing.trackedData.set(entry.id, entry.value);
        }
      }
    }

    // 4. Process despawns
    if (Array.isArray(batch.despawned)) {
      for (const id of batch.despawned) {
        const validatedId = validateEntityId(id);
        this.entities.delete(validatedId);
      }
    }
  }

  /**
   * Reset store to empty.
   */
  reset(): void {
    this.entities.clear();
  }
}
