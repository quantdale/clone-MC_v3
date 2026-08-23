/**
 * Server-owned save lifecycle (234).
 *
 * A `WorldTickProcess` `TickSystem` state machine (`unloaded -> loading -> running -> flushing ->
 * closed`) that owns the persistence of a server's authoritative world state: `load` reads the
 * world through an injected `SaveLoadBoundary` and restores it via the shared `WorldSaveCodec`
 * (all-or-nothing — any decode/validation failure rolls back to `unloaded` and no unit is
 * restored); `markDirty` tracks dirty units de-duplicated by `${kind}|${worldId}|${chunkX}|${chunkZ}`
 * with FIFO preservation; `tick` drains a bounded batch every `autosaveEveryTicks` ticks; `flush`/
 * `saveAndClose` drain to empty with a zero-progress guard; writes are fenced by an injected
 * `storageGate` and failures are recorded as classified `SaveFailure` entries (043 conventions).
 * Pure and headless: no IndexedDB, no DOM, no transport — the persistence primitives (034-043)
 * are consumed through the boundary seam, not referenced directly.
 */
import type { TickSystem } from './WorldTickProcess';
import {
  unitKey,
  validatePersistentUnit,
  type ServerWorldUnit,
  type WorldSaveCodec,
} from './PersistentWorldCodecs';
import { classifyStorageError } from '../storage/StorageHealth';
import type { SaveUnit } from '../storage/DirtySaveQueue';
import type { WorldMetadata } from '../storage/WorldMetadata';
import type { PlayerStateRecord } from '../storage/PlayerStateRecord';
import type { SerializedChunkColumn } from '../world/ChunkColumn';
import type { BlockEntityChunkRecord } from '../storage/BlockEntityRecord';
import type { EntityChunkRecord } from '../storage/EntityRecord';

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

/** Lifecycle states; transitions are exactly `unloaded -> loading -> running -> flushing -> closed`. */
export type ServerSaveState = 'unloaded' | 'loading' | 'running' | 'flushing' | 'closed';

/** All persisted records for one world, as returned by the boundary (de-duplicated by key). */
export interface PersistedWorldSnapshot {
  metadata: WorldMetadata | null;
  playerState: PlayerStateRecord | null;
  columns: readonly SerializedChunkColumn[];
  blockEntityChunks: readonly BlockEntityChunkRecord[];
  entityChunks: readonly EntityChunkRecord[];
}

/** Injected persistence seam; production is backed by the 034-040 repositories. */
export interface SaveLoadBoundary {
  /** Read all persisted records for `worldId`, or null when the world has none. */
  readWorld(worldId: string): Promise<PersistedWorldSnapshot | null>;
  /** Persist one encoded queue-kind unit (world-metadata | chunk-sections | block-entities | entities). */
  write(unit: SaveUnit): Promise<void>;
  /** Persist the world's player-state record. */
  writePlayerState(record: PlayerStateRecord): Promise<void>;
}

/** Classified save failure kinds (043 conventions plus lifecycle-level kinds). */
export type SaveFailureKind =
  | 'storage'
  | 'encode'
  | 'quota'
  | 'private-mode'
  | 'unavailable'
  | 'unknown';

/** A recorded save failure. */
export interface SaveFailure {
  readonly kind: SaveFailureKind;
  readonly message: string;
  /** Epoch millis when the failure was observed. */
  readonly at: number;
  /** Failing unit key, or null for lifecycle-level failures (e.g. storage gate). */
  readonly unitKey: string | null;
}

export interface ServerSaveLifecycleOptions {
  readonly codec: WorldSaveCodec;
  readonly boundary: SaveLoadBoundary;
  readonly storageGate: { canWrite(): boolean };
  /** Drain one batch every N ticks (default 100 = 5s at 20 TPS). */
  readonly autosaveEveryTicks?: number;
  /** Bounded writes per drain (default 64). */
  readonly limitPerDrain?: number;
  /** Zero-progress runs that end a `flush` (default 3). */
  readonly flushZeroProgressLimit?: number;
}

export interface LoadResult {
  readonly worldId: string;
  readonly outcome: 'loaded' | 'created';
  readonly columns: number;
  readonly blockEntityChunks: number;
  readonly entityChunks: number;
  readonly metadata: boolean;
  readonly playerState: boolean;
}

/** Bounded failure log: oldest entries are dropped beyond this cap. */
const MAX_FAILURES = 32;
const DEFAULT_AUTOSAVE_EVERY_TICKS = 100;
const DEFAULT_LIMIT_PER_DRAIN = 64;
const DEFAULT_FLUSH_ZERO_PROGRESS_LIMIT = 3;

// ────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ────────────────────────────────────────────────────────────────────────────

/** Server-owned world save lifecycle, driven as a `WorldTickProcess` `TickSystem`. */
export class ServerSaveLifecycle implements TickSystem {
  /** Autosave cadence: a drain fires when `tick % autosaveEveryTicks === 0`. */
  readonly autosaveEveryTicks: number;
  /** Bounded writes per drain. */
  readonly limitPerDrain: number;
  /** Zero-progress runs that end a `flush`. */
  readonly flushZeroProgressLimit: number;

  private readonly codec: WorldSaveCodec;
  private readonly boundary: SaveLoadBoundary;
  private readonly storageGate: { canWrite(): boolean };
  private currentState: ServerSaveState = 'unloaded';
  private readonly pending = new Map<string, ServerWorldUnit>();
  private failures: SaveFailure[] = [];
  /** Serialized drain chain: autosave drains never interleave out of FIFO order. */
  private drainChain: Promise<void> = Promise.resolve();

  constructor(options: ServerSaveLifecycleOptions) {
    if (
      typeof options.codec !== 'object' ||
      options.codec === null ||
      typeof options.codec.encode !== 'function' ||
      typeof options.codec.decode !== 'function'
    ) {
      throw new Error('ServerSaveLifecycle: codec must provide encode() and decode()');
    }
    if (
      typeof options.boundary !== 'object' ||
      options.boundary === null ||
      typeof options.boundary.readWorld !== 'function' ||
      typeof options.boundary.write !== 'function' ||
      typeof options.boundary.writePlayerState !== 'function'
    ) {
      throw new Error(
        'ServerSaveLifecycle: boundary must provide readWorld(), write(), and writePlayerState()',
      );
    }
    if (
      typeof options.storageGate !== 'object' ||
      options.storageGate === null ||
      typeof options.storageGate.canWrite !== 'function'
    ) {
      throw new Error('ServerSaveLifecycle: storageGate must provide canWrite()');
    }

    const autosaveEveryTicks = options.autosaveEveryTicks ?? DEFAULT_AUTOSAVE_EVERY_TICKS;
    const limitPerDrain = options.limitPerDrain ?? DEFAULT_LIMIT_PER_DRAIN;
    const flushZeroProgressLimit = options.flushZeroProgressLimit ?? DEFAULT_FLUSH_ZERO_PROGRESS_LIMIT;
    if (!Number.isSafeInteger(autosaveEveryTicks) || autosaveEveryTicks <= 0) {
      throw new Error(
        `ServerSaveLifecycle: autosaveEveryTicks must be a positive safe integer (got ${autosaveEveryTicks})`,
      );
    }
    if (!Number.isSafeInteger(limitPerDrain) || limitPerDrain <= 0) {
      throw new Error(
        `ServerSaveLifecycle: limitPerDrain must be a positive safe integer (got ${limitPerDrain})`,
      );
    }
    if (!Number.isSafeInteger(flushZeroProgressLimit) || flushZeroProgressLimit <= 0) {
      throw new Error(
        `ServerSaveLifecycle: flushZeroProgressLimit must be a positive safe integer (got ${flushZeroProgressLimit})`,
      );
    }

    this.codec = options.codec;
    this.boundary = options.boundary;
    this.storageGate = options.storageGate;
    this.autosaveEveryTicks = autosaveEveryTicks;
    this.limitPerDrain = limitPerDrain;
    this.flushZeroProgressLimit = flushZeroProgressLimit;
  }

  /** Current lifecycle state. */
  get state(): ServerSaveState {
    return this.currentState;
  }

  /** Number of pending (not-yet-drained) dirty units. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** Recorded save failures, newest last, bounded at {@link MAX_FAILURES} entries. */
  get lastFailures(): readonly SaveFailure[] {
    return this.failures;
  }

  /**
   * Load the world `worldId` through the boundary, decode/migrate/validate every record via the
   * codec, then call `restore(unit)` for each decoded unit in a deterministic order (metadata,
   * player-state, then chunk columns / block-entity chunks / entity chunks sorted by key). All or
   * nothing: any decode/validation failure (or a duplicate key within one kind) aborts the load,
   * rolls back to `unloaded`, and calls `restore` for none of the units.
   */
  async load(worldId: string, restore: (unit: ServerWorldUnit) => void): Promise<LoadResult> {
    if (this.currentState !== 'unloaded') {
      throw new Error(`ServerSaveLifecycle: load requires state 'unloaded' (was '${this.currentState}')`);
    }
    if (typeof worldId !== 'string' || worldId.length === 0) {
      throw new Error('ServerSaveLifecycle: worldId must be a non-empty string');
    }
    if (typeof restore !== 'function') {
      throw new Error('ServerSaveLifecycle: restore must be a function');
    }
    this.currentState = 'loading';
    try {
      const snapshot = await this.boundary.readWorld(worldId);
      if (snapshot === null) {
        this.currentState = 'running';
        return {
          worldId,
          outcome: 'created',
          columns: 0,
          blockEntityChunks: 0,
          entityChunks: 0,
          metadata: false,
          playerState: false,
        };
      }

      const columns = this.sortAndCheckUnique(snapshot.columns, worldId, 'columns');
      const blockEntityChunks = this.sortAndCheckUnique(
        snapshot.blockEntityChunks,
        worldId,
        'blockEntityChunks',
      );
      const entityChunks = this.sortAndCheckUnique(snapshot.entityChunks, worldId, 'entityChunks');

      // Decode every record before restoring any of them (all-or-nothing load).
      const units: ServerWorldUnit[] = [];
      let metadata = false;
      let playerState = false;
      if (snapshot.metadata !== null) {
        units.push(
          this.codec.decode(snapshot.metadata, { kind: 'world-metadata', worldId, chunkX: 0, chunkZ: 0 }),
        );
        metadata = true;
      }
      if (snapshot.playerState !== null) {
        units.push(
          this.codec.decode(snapshot.playerState, { kind: 'player-state', worldId, chunkX: 0, chunkZ: 0 }),
        );
        playerState = true;
      }
      for (const column of columns) {
        units.push(
          this.codec.decode(column, {
            kind: 'chunk-sections',
            worldId,
            chunkX: column.chunkX,
            chunkZ: column.chunkZ,
          }),
        );
      }
      for (const record of blockEntityChunks) {
        units.push(
          this.codec.decode(record, {
            kind: 'block-entities',
            worldId,
            chunkX: record.chunkX,
            chunkZ: record.chunkZ,
          }),
        );
      }
      for (const record of entityChunks) {
        units.push(
          this.codec.decode(record, {
            kind: 'entities',
            worldId,
            chunkX: record.chunkX,
            chunkZ: record.chunkZ,
          }),
        );
      }

      for (const unit of units) {
        restore(unit);
      }

      this.currentState = 'running';
      return {
        worldId,
        outcome: 'loaded',
        columns: columns.length,
        blockEntityChunks: blockEntityChunks.length,
        entityChunks: entityChunks.length,
        metadata,
        playerState,
      };
    } catch (err) {
      if (this.currentState === 'loading') this.currentState = 'unloaded';
      if (err instanceof Error) throw err;
      throw new Error(`ServerSaveLifecycle: load failed for world '${worldId}': ${String(err)}`);
    }
  }

  /**
   * Mark a unit dirty (running only). De-duplicates by `${kind}|${worldId}|${chunkX}|${chunkZ}`;
   * re-marking an existing key replaces its value while preserving its FIFO position.
   */
  markDirty(unit: ServerWorldUnit): void {
    if (this.currentState !== 'running') {
      throw new Error(`ServerSaveLifecycle: markDirty requires state 'running' (was '${this.currentState}')`);
    }
    let valid: ServerWorldUnit;
    try {
      valid = validatePersistentUnit(unit);
    } catch (err) {
      throw new Error(
        `ServerSaveLifecycle: invalid unit: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.pending.set(unitKey(valid), valid);
  }

  /**
   * Trigger a bounded autosave drain exactly when `tick % autosaveEveryTicks === 0` while
   * `running`; other ticks drain nothing. The drain runs asynchronously (serialized with all other
   * drains); `idle()` awaits everything scheduled so far.
   */
  tick(tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0) {
      throw new Error(`ServerSaveLifecycle: tick must be a non-negative safe integer (got ${tick})`);
    }
    if (this.currentState !== 'running') return;
    if (tick % this.autosaveEveryTicks === 0) {
      this.scheduleDrain();
    }
  }

  /** Await every autosave drain scheduled so far; the lifecycle state is unchanged. */
  async idle(): Promise<void> {
    await this.drainChain;
  }

  /**
   * Drain to empty with a zero-progress guard. Returns the number of units written; leaves the
   * state `flushing` (call `saveAndClose` to finish, or call `flush` again to retry).
   */
  async flush(): Promise<number> {
    if (this.currentState !== 'running' && this.currentState !== 'flushing') {
      throw new Error(
        `ServerSaveLifecycle: flush requires state 'running' or 'flushing' (was '${this.currentState}')`,
      );
    }
    this.currentState = 'flushing';
    // Settle drains scheduled before flushing; no new ones can be scheduled while `flushing`.
    await this.drainChain;
    let total = 0;
    let zeroProgressRuns = 0;
    while (this.pending.size > 0) {
      const written = await this.runDrain(this.limitPerDrain);
      total += written;
      if (written === 0) {
        zeroProgressRuns++;
        if (zeroProgressRuns >= this.flushZeroProgressLimit) break;
      } else {
        zeroProgressRuns = 0;
      }
    }
    return total;
  }

  /**
   * `flush()` then transition to `closed` on success. If the queue could not be emptied (storage
   * gate down or persistently failing units), throws and stays `flushing`.
   */
  async saveAndClose(): Promise<number> {
    const total = await this.flush();
    if (this.pending.size > 0) {
      throw new Error(
        `ServerSaveLifecycle: saveAndClose could not drain the queue; ${this.pending.size} unit(s) still pending after flush`,
      );
    }
    this.currentState = 'closed';
    return total;
  }

  /** Reset to a fresh `unloaded` lifecycle (clears pending units and recorded failures). */
  reset(): void {
    this.currentState = 'unloaded';
    this.pending.clear();
    this.failures = [];
    this.drainChain = Promise.resolve();
  }

  /** Append one drain to the serialized drain chain (FIFO across ticks). */
  private scheduleDrain(): void {
    this.drainChain = this.drainChain
      .then(() => this.runDrain(this.limitPerDrain))
      .then(() => undefined);
  }

  /**
   * Write up to `limit` pending units in FIFO order. A unit leaves the pending set only after its
   * write resolves successfully (and it is still the pending value for its key); failed writes and
   * failed encodes re-queue the pending value at the end (no silent loss). Never throws: failures
   * are recorded as classified `SaveFailure` entries.
   */
  private async runDrain(limit: number): Promise<number> {
    if (this.pending.size === 0) return 0;
    if (!this.storageGate.canWrite()) {
      this.recordFailure('storage', 'ServerSaveLifecycle: storage gate blocks writes', null);
      return 0;
    }
    const batch = [...this.pending.entries()].slice(0, limit);
    let written = 0;
    for (const [key, unit] of batch) {
      let payload: unknown;
      try {
        payload = this.codec.encode(unit);
      } catch (err) {
        this.recordFailure(
          'encode',
          `ServerSaveLifecycle: encode failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
          key,
        );
        this.requeueUnit(key, unit);
        continue;
      }
      try {
        if (unit.kind === 'player-state') {
          await this.boundary.writePlayerState(payload as PlayerStateRecord);
        } else {
          const saveUnit: SaveUnit = {
            key,
            kind: unit.kind,
            worldId: unit.worldId,
            chunkX: unit.chunkX,
            chunkZ: unit.chunkZ,
            payload,
          };
          await this.boundary.write(saveUnit);
        }
        // Remove only if the same unit is still pending: a unit re-marked while the write was in
        // flight stays pending with its newer value (no stale write, no drop).
        if (this.pending.get(key) === unit) this.pending.delete(key);
        written++;
      } catch (err) {
        this.recordFailure(
          classifyStorageError(err),
          `ServerSaveLifecycle: write failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
          key,
        );
        this.requeueUnit(key, unit);
      }
    }
    return written;
  }

  /**
   * Re-queue a failed unit at the end of the pending set (038 semantics). If a different (newer)
   * unit was marked for the same key while the write was in flight, that newer unit stays pending
   * in place.
   */
  private requeueUnit(key: string, unit: ServerWorldUnit): void {
    const current = this.pending.get(key);
    if (current === undefined) {
      this.pending.set(key, unit);
    } else if (current === unit) {
      this.pending.delete(key);
      this.pending.set(key, unit);
    }
  }

  /** Record a classified failure, dropping the oldest entry beyond the cap. */
  private recordFailure(kind: SaveFailureKind, message: string, key: string | null): void {
    this.failures.push({ kind, message, at: Date.now(), unitKey: key });
    if (this.failures.length > MAX_FAILURES) {
      this.failures.splice(0, this.failures.length - MAX_FAILURES);
    }
  }

  /**
   * Validate the snapshot list shape, reject duplicate keys within one kind (ambiguous data), and
   * return the records sorted by key for a deterministic decode/restore order.
   */
  private sortAndCheckUnique<T extends { chunkX: number; chunkZ: number }>(
    list: readonly T[],
    worldId: string,
    label: string,
  ): T[] {
    if (!Array.isArray(list)) {
      throw new Error(
        `ServerSaveLifecycle: snapshot for world '${worldId}' has invalid ${label} (expected an array)`,
      );
    }
    const seen = new Set<string>();
    for (const record of list) {
      const key = `${record.chunkX}|${record.chunkZ}`;
      if (seen.has(key)) {
        throw new Error(
          `ServerSaveLifecycle: snapshot for world '${worldId}' has duplicate ${label} key '${key}'`,
        );
      }
      seen.add(key);
    }
    // Deterministic restore order (hardening 2026-08-23): plain numeric tuple
    // comparison, not localeCompare — ICU locale rules are environment-specific
    // and the module contract pins a machine-independent decode order.
    return [...list].sort((a, b) => {
      if (a.chunkX !== b.chunkX) return a.chunkX - b.chunkX;
      return a.chunkZ - b.chunkZ;
    });
  }
}
