/**
 * Storage health detection, classification, and user-safe policy (043). A `StorageHealthMonitor`
 * probes storage on demand and derives a status from consecutive probe outcomes: 0 failures → `ok`,
 * exactly 1 → `degraded` (warning; writes still allowed), ≥2 consecutive → `failed` (`canWrite()`
 * false — the save layer should stop writing). A successful probe recovers to `ok`. `check()` never
 * throws; failures are classified (`quota`, `private-mode`, `unavailable`, `unknown`) and recorded
 * with a timestamp.
 *
 * `createWorldStorageProbe` exercises the real five-repository path (034-040) with a tiny
 * reserved-key write/read/delete round-trip, so quota and private-mode failures surface as classified
 * errors; the probe record is deleted in `finally` in all paths.
 */
import { WorldMetadataRepository } from './WorldMetadataRepository';
import type { WorldMetadata } from './WorldMetadata';
import { ChunkSectionRepository } from './ChunkSectionRepository';
import { BlockEntityRepository } from './BlockEntityRepository';
import { EntityRepository } from './EntityRepository';
import { PlayerStateRepository } from './PlayerStateRepository';

/** Health of the storage layer. */
export type StorageStatus = 'ok' | 'degraded' | 'failed';

/** Classified storage failure. */
export type StorageFailureKind = 'quota' | 'private-mode' | 'unavailable' | 'unknown';

/** A recorded storage failure. */
export interface StorageFailure {
  kind: StorageFailureKind;
  message: string;
  /** Epoch millis when the failure was observed. */
  at: number;
}

/** An injectable storage probe: resolves when healthy, rejects when unhealthy. */
export interface StorageProbe {
  probe(): Promise<void>;
}

/** Classify an error from a storage operation by name and numeric code (DOMException conventions). */
export function classifyStorageError(error: unknown): StorageFailureKind {
  if (typeof error !== 'object' || error === null) return 'unknown';
  const e = error as { name?: unknown; code?: unknown };
  const name = typeof e.name === 'string' ? e.name : '';
  const code = typeof e.code === 'number' ? e.code : NaN;

  if (name === 'QuotaExceededError' || code === 22) return 'quota';
  if (name === 'SecurityError' || code === 18) return 'private-mode';
  if (name === 'UnknownError' || name === 'InvalidStateError') return 'unavailable';
  return 'unknown';
}

/**
 * Health monitor over an injected probe. Derives `ok → degraded → failed` from consecutive probe
 * failures and recovers to `ok` on success.
 */
export class StorageHealthMonitor {
  private readonly probe: StorageProbe;
  private consecutiveFailures = 0;
  private currentStatus: StorageStatus = 'ok';
  private currentFailure: StorageFailure | null = null;
  private readonly listeners = new Set<(status: StorageStatus) => void>();

  constructor(opts: { probe: StorageProbe }) {
    this.probe = opts.probe;
  }

  /** Run the probe and update status/failure state. Never throws. Returns the resulting status. */
  async check(): Promise<StorageStatus> {
    let next: StorageStatus;
    try {
      await this.probe.probe();
      this.consecutiveFailures = 0;
      this.currentFailure = null;
      next = 'ok';
    } catch (e) {
      this.consecutiveFailures++;
      this.currentFailure = {
        kind: classifyStorageError(e),
        message: e instanceof Error ? e.message : String(e),
        at: Date.now(),
      };
      next = this.consecutiveFailures >= 2 ? 'failed' : 'degraded';
    }

    if (next !== this.currentStatus) {
      this.currentStatus = next;
      for (const listener of this.listeners) {
        listener(next);
      }
    }
    return this.currentStatus;
  }

  /** Current derived status. */
  get status(): StorageStatus {
    return this.currentStatus;
  }

  /** The most recent probe failure, or `null` when healthy. */
  get lastFailure(): StorageFailure | null {
    return this.currentFailure;
  }

  /** Whether the save layer may keep writing: false only when status is `failed`. */
  canWrite(): boolean {
    return this.currentStatus !== 'failed';
  }

  /** Subscribe to status changes; returns an unsubscribe function. */
  onStatusChange(listener: (status: StorageStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Restore the initial healthy state (listeners are kept). */
  reset(): void {
    this.consecutiveFailures = 0;
    this.currentFailure = null;
    const previous = this.currentStatus;
    this.currentStatus = 'ok';
    if (previous !== 'ok') {
      for (const listener of this.listeners) {
        listener('ok');
      }
    }
  }
}

/** The five repositories the world probe exercises. */
export interface WorldStorageProbeDeps {
  metadata: WorldMetadataRepository;
  chunkSections: ChunkSectionRepository;
  blockEntities: BlockEntityRepository;
  entities: EntityRepository;
  playerStates: PlayerStateRepository;
}

/** Reserved world id for the probe record; always deleted after a probe. */
export const WORLD_PROBE_WORLD_ID = '__probe__';

/**
 * A real end-to-end storage probe: opens all five repositories and performs a tiny
 * write/read/delete round-trip on the metadata store with a reserved key. The probe record is deleted
 * in `finally` in all paths (success or failure).
 */
export function createWorldStorageProbe(deps: WorldStorageProbeDeps): StorageProbe {
  return {
    async probe(): Promise<void> {
      const { metadata, chunkSections, blockEntities, entities, playerStates } = deps;
      await metadata.open();
      await chunkSections.open();
      await blockEntities.open();
      await entities.open();
      await playerStates.open();

      const probeRecord: WorldMetadata = {
        schemaVersion: 1,
        worldId: WORLD_PROBE_WORLD_ID,
        seed: 0,
        dimensionId: 'minecraft:overworld',
        minY: -64,
        height: 384,
        createdAt: 0,
        updatedAt: 0,
      };

      try {
        await metadata.putMetadata(probeRecord);
        const read = await metadata.getMetadata(WORLD_PROBE_WORLD_ID);
        if (read === null) {
          throw new Error('Storage probe: probe record was not readable');
        }
      } finally {
        try {
          await metadata.deleteMetadata(WORLD_PROBE_WORLD_ID);
        } catch {
          // Best-effort cleanup; a failed delete must not mask the probe outcome.
        }
      }
    },
  };
}
