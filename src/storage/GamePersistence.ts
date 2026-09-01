/**
 * Production persistence facade — the single composition root for the live durable stack
 * (249-DL-001 / 249-DL-005; design addendum §E, PERSIST-LIVE-1..5, SAVE-FAIL-1..5).
 *
 * The constructor performs NO I/O: it only wires the six repositories (034-040/v6), one shared
 * `DirtySaveQueue`, a monitoring `SaveSink` wrapper around `RepositorySaveSink`, an
 * `AutosaveCoordinator` (periodic tick + pagehide/visibilitychange flush), a
 * `StorageHealthMonitor` over the real five-repository probe, and (unless overridden) a
 * `LegacyLocalStorageMigrator`. All async work happens in {@link GamePersistence.open}.
 *
 * Every dependency is constructor-injectable (`GamePersistenceOptions`), which is the
 * PERSIST-LIVE-5 testability seam: deterministic tests and fault injection without any global
 * mutable state or release-bundle test hooks.
 *
 * Failure semantics (SAVE-FAIL-1..4):
 * - No silent failure: every load/migration/write failure is classified and surfaced through
 *   `open()` results, `flush()` results, `health`, and the bounded internal error log.
 * - Retryable data is preserved: failed units stay in the queue (dedup by key = full-snapshot
 *   replacement, DIRTY-3); when the monitor reports `failed`, writes are gated off and re-queue
 *   without touching storage; retry resumes automatically on verified recovery.
 * - Health warnings clear only after a later verified durable commit/probe success
 *   (SAVE-FAIL-3); while unhealthy a slow recovery probe runs on the injected timer — a single
 *   interval, never stacked (SAVE-FAIL-4 bounded bookkeeping).
 */
import { DirtySaveQueue, type SaveSink, type SaveUnit } from './DirtySaveQueue';
import { AutosaveCoordinator, type EventTargetLike, type TimerLike } from './AutosaveCoordinator';
import { RepositorySaveSink } from './RepositorySaveSink';
import {
  StorageHealthMonitor,
  classifyStorageError,
  createWorldStorageProbe,
  type StorageFailure,
  type StorageStatus,
} from './StorageHealth';
import { WorldMetadataRepository, type IdbFactoryLike } from './WorldMetadataRepository';
import type { WorldMetadata } from './WorldMetadata';
import { ChunkSectionRepository } from './ChunkSectionRepository';
import { BlockEntityRepository } from './BlockEntityRepository';
import { EntityRepository } from './EntityRepository';
import { PlayerStateRepository } from './PlayerStateRepository';
import { validatePlayerStateRecord, type PlayerStateRecord } from './PlayerStateRecord';
import { ChunkEditRepository } from './ChunkEditRepository';
import type { SerializedBlockEntity } from './BlockEntityRecord';
import type { SerializedEntity } from './EntityRecord';
import {
  LegacyLocalStorageMigrator,
  type LegacyMigrationReport,
  type StorageLike,
} from './LegacyLocalStorageMigrator';
import type { ChunkColumn, SerializedChunkColumn } from '../world/ChunkColumn';
import type { WorldEditDurability, WorldEditSnapshot, WorldGenerationBaseline } from '../world/World';
import { WORLDGEN_MATRIX_VERSION } from '../worldgen/WorldgenRegressionMatrix';
import {
  assessWorldStartup,
  type WorldStartupAssessment,
} from './WorldStartupAssessment';
import { WorldArchiver } from './WorldArchiver';

/** The currently executable generated-world baseline. */
export const CURRENT_WORLDGEN_VERSION = WORLDGEN_MATRIX_VERSION;

/** The game-level player snapshot the facade persists/restores (see `Game.savePlayerState`). */
export interface GamePlayerSnapshot {
  version: 1;
  seed: number;
  player: { position: [number, number, number]; yaw: number; pitch: number };
  inventory: unknown;
  survival: unknown;
  experience: unknown;
}

/** Result of {@link GamePersistence.open}. */
export interface GamePersistenceOpenResult {
  /** `ok` clean boot; `degraded` when errors were collected but the game can run; `failed` when storage is unusable. */
  status: 'ok' | 'degraded' | 'failed';
  /** Bulk-loaded committed edits for this world (`null` when none exist). */
  initialEdits: WorldEditSnapshot | null;
  /** Bulk-loaded committed player state (`null` when none exists). */
  initialPlayerState: GamePlayerSnapshot | null;
  /** Bulk-loaded persisted block-entity records for this world (251 hydration source; empty when none). */
  initialBlockEntities: SerializedBlockEntity[];
  /** Bulk-loaded wither records for this world (252 hydration; empty when none). */
  initialWithers: unknown[];
  /** Bulk-loaded canonical columns used to restore existing terrain before streaming. */
  initialColumns: SerializedChunkColumn[];
  /** World generation baseline compatibility classification. */
  generationBaseline: 'current' | 'legacy-unknown' | 'unsupported';
  /**
   * The single authoritative startup compatibility decision (257): `current`,
   * safe `preserved`, or `recovery-required` with a deterministic reason.
   */
  startupAssessment: WorldStartupAssessment;
  /** Migration audit trail; `null` when migration was skipped (marker present or no legacy source). */
  migrationReport: LegacyMigrationReport | null;
  /** Migration + load failures, user-observable; empty on a fully clean boot. */
  errors: string[];
}

/** Result of {@link GamePersistence.flush} (SAVE-FAIL-5: no false success). */
export interface GamePersistenceFlushResult {
  /** Units durably written by this flush (sink-accepted only). */
  committed: number;
  /** Units still pending after the flush (write rejected/gated). */
  failed: number;
  /** Health status after the flush's post-write verification. */
  health: StorageStatus;
}

/** Constructor options; every seam is injectable for deterministic tests / fault injection. */
export interface GamePersistenceOptions {
  seed: number;
  /** IndexedDB factory; default `browserIdbFactory()`. */
  factory?: IdbFactoryLike;
  /** Legacy migration source; default guarded `window.localStorage`; `null` disables migration. */
  legacyStorage?: StorageLike | null;
  /** Timer for the coordinator tick + recovery probe; default `globalThis`. */
  timer?: TimerLike;
  /** Flush event target; default `window`; `null` disables pagehide/visibilitychange flush. */
  flushTarget?: EventTargetLike | null;
  /** Coordinator tick interval in ms; default 5000. */
  intervalMs?: number;
  /** Map a seed to its world id; default `` `world-${seed}` ``. */
  worldIdForSeed?: (seed: number) => string;
  /** Test override for the legacy migrator; default composed internally. */
  migrator?: LegacyLocalStorageMigrator;
}

/** Cap on the internal user-observable error log (SAVE-FAIL-4: bounded bookkeeping). */
const MAX_RECORDED_ERRORS = 50;

/** Minimum period (ms) between recovery probes while unhealthy. */
const MIN_RECOVERY_PROBE_MS = 15000;

/**
 * Guarded default legacy source: `window.localStorage` when it exists and is readable
 * (private-mode Safari throws on access); otherwise `null` (migration disabled).
 */
function defaultLegacyStorage(): StorageLike | null {
  try {
    const g = globalThis as { window?: { localStorage?: StorageLike } };
    return g.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Monitoring `SaveSink` wrapper (SAVE-FAIL-1..4). Gates writes while `canWrite()` is false
 * (units re-queue without touching storage), classifies every rejection, records the last
 * failure with a bounded counter, and fires fire-and-forget health checks so status changes are
 * observed. A successful write clears the recorded failure and triggers a verification check so
 * the warning clears only on real recovery (SAVE-FAIL-3).
 */
class MonitoredSaveSink implements SaveSink {
  private readonly inner: SaveSink;
  private readonly monitor: StorageHealthMonitor;
  private currentFailure: StorageFailure | null = null;
  private failureCount = 0;
  private checkSeq = 0;
  private pendingCheck: Promise<StorageStatus> | null = null;

  constructor(inner: SaveSink, monitor: StorageHealthMonitor) {
    this.inner = inner;
    this.monitor = monitor;
  }

  async write(unit: SaveUnit): Promise<void> {
    // Gate: while the monitor says storage is unusable, reject immediately WITHOUT touching
    // storage; the queue retains the unit and retries after verified recovery (bounded churn).
    if (!this.monitor.canWrite()) {
      throw new Error('GamePersistence: storage unhealthy (canWrite()=false); write gated');
    }
    try {
      await this.inner.write(unit);
    } catch (e) {
      this.currentFailure = {
        kind: classifyStorageError(e),
        message: e instanceof Error ? e.message : String(e),
        at: Date.now(),
      };
      this.failureCount++;
      this.scheduleCheck(); // fire-and-forget classification of the failure
      throw e;
    }
    if (this.currentFailure !== null) {
      // A sink-accepted durable commit happened after a failure: clear the warning state and
      // verify via the probe (the check result drives the status back to 'ok').
      this.currentFailure = null;
      this.scheduleCheck();
    }
  }

  get lastFailure(): StorageFailure | null {
    return this.currentFailure;
  }

  get failures(): number {
    return this.failureCount;
  }

  /** Monotonic count of health checks this sink has scheduled (flush coordination). */
  get checks(): number {
    return this.checkSeq;
  }

  /**
   * Schedule a coalesced fire-and-forget `monitor.check()` (SAVE-FAIL-4: at most one probe in
   * flight regardless of how many writes fail).
   */
  private scheduleCheck(): void {
    this.checkSeq++;
    if (this.pendingCheck !== null) return;
    const p = this.monitor
      .check()
      .catch(() => this.monitor.status)
      .finally(() => {
        this.pendingCheck = null;
      });
    this.pendingCheck = p;
  }

  /**
   * Await any check scheduled since `seqBefore`; returns whether at least one ran, so the caller
   * can probe explicitly only when the sink did not already classify the outcome.
   */
  async settleChecks(seqBefore: number): Promise<boolean> {
    while (this.pendingCheck !== null) {
      await this.pendingCheck;
    }
    return this.checkSeq > seqBefore;
  }
}

/**
 * The production persistence facade. Implements `WorldEditDurability` so `World` can hand every
 * committed overlay mutation to the durable layer (DIRTY-1/2).
 */
export class GamePersistence implements WorldEditDurability {
  private readonly seed: number;
  private readonly worldIdValue: string;
  private readonly timer: TimerLike;
  private readonly intervalMs: number;

  private readonly metadata: WorldMetadataRepository;
  private readonly chunkSections: ChunkSectionRepository;
  private readonly blockEntities: BlockEntityRepository;
  private readonly entities: EntityRepository;
  private readonly playerStates: PlayerStateRepository;
  private readonly chunkEdits: ChunkEditRepository;

  private readonly queue = new DirtySaveQueue();
  private readonly coordinator: AutosaveCoordinator;
  private readonly healthMonitor: StorageHealthMonitor;
  private readonly monitoredSink: MonitoredSaveSink;
  private readonly migrator: LegacyLocalStorageMigrator | null;

  /** Pending full-snapshot edit overlays by `${cx},${cy},${cz}` (bounded by distinct dirty chunks). */
  private readonly pendingEdits = new Map<string, { unitKey: string; map: Map<number, number> }>();

  private readonly errors: string[] = [];
  private recoveryTimerId: unknown | null = null;
  private disposed = false;
  private opened = false;
  private lastResult: GamePersistenceOpenResult | null = null;
  private initialEditsValue: WorldEditSnapshot | null = null;
  private initialPlayerStateValue: GamePlayerSnapshot | null = null;
  private initialBlockEntitiesValue: SerializedBlockEntity[] = [];
  private initialWithersValue: unknown[] = [];
  private initialColumnsValue: SerializedChunkColumn[] = [];
  /** World generation baseline compatibility classification. */
  private generationBaselineValue: WorldGenerationBaseline = 'current';
  /** Authoritative startup compatibility decision (257); computed at the end of `open()`. */
  private startupAssessmentValue: WorldStartupAssessment | null = null;
  /**
   * Set once the user confirms a successful world-scoped reset (257): every
   * capture/save path becomes a no-op so no record for the reset world can be
   * re-written between the reset and the page reload that boots the fresh world.
   */
  private resetCompleted = false;

  constructor(opts: GamePersistenceOptions) {
    this.seed = opts.seed;
    this.worldIdValue = opts.worldIdForSeed?.(opts.seed) ?? `world-${opts.seed}`;
    this.timer = opts.timer ?? (globalThis as TimerLike);
    this.intervalMs = opts.intervalMs ?? 5000;

    const factory = opts.factory;
    this.metadata = new WorldMetadataRepository({ factory });
    this.chunkSections = new ChunkSectionRepository({ factory });
    this.blockEntities = new BlockEntityRepository({ factory });
    this.entities = new EntityRepository({ factory });
    this.playerStates = new PlayerStateRepository({ factory });
    this.chunkEdits = new ChunkEditRepository({ factory });

    const sink = new RepositorySaveSink({
      metadata: this.metadata,
      chunkSections: this.chunkSections,
      blockEntities: this.blockEntities,
      entities: this.entities,
      chunkEdits: this.chunkEdits,
      playerStates: this.playerStates,
    });
    this.healthMonitor = new StorageHealthMonitor({
      probe: createWorldStorageProbe({
        metadata: this.metadata,
        chunkSections: this.chunkSections,
        blockEntities: this.blockEntities,
        entities: this.entities,
        playerStates: this.playerStates,
        chunkEdits: this.chunkEdits,
      }),
    });
    this.monitoredSink = new MonitoredSaveSink(sink, this.healthMonitor);

    this.coordinator = new AutosaveCoordinator({
      queue: this.queue,
      sink: this.monitoredSink,
      limitPerTick: 32,
      intervalMs: this.intervalMs,
      timer: this.timer,
      flushTarget: opts.flushTarget === undefined ? undefined : opts.flushTarget,
      // Release pending overlay copies as soon as their unit durably commits
      // (hardening 2026-08-23): previously they were pruned only by facade
      // flush(), so the periodic coordinator tick left one full overlay copy
      // per distinct edited chunk resident for the whole session.
      onUnitsCommitted: (keys) => this.releaseCommittedPendingEdits(keys),
    });

    // Single-instance slow recovery probe: started on transition-to-unhealthy, cleared on 'ok'.
    this.healthMonitor.onStatusChange((status) => {
      if (status === 'ok') {
        this.stopRecoveryTimer();
      } else if (this.recoveryTimerId === null && !this.disposed) {
        this.recoveryTimerId = this.timer.setInterval(
          () => void this.healthMonitor.check().catch(() => undefined),
          Math.max(this.intervalMs, MIN_RECOVERY_PROBE_MS),
        );
      }
    });

    if (opts.migrator) {
      this.migrator = opts.migrator;
    } else {
      const legacy =
        opts.legacyStorage === undefined ? defaultLegacyStorage() : opts.legacyStorage;
      this.migrator = legacy
        ? new LegacyLocalStorageMigrator({
            storage: legacy,
            chunkSections: this.chunkSections,
            chunkEdits: this.chunkEdits,
            playerStates: this.playerStates,
            worldIdForSeed: opts.worldIdForSeed,
          })
        : null;
    }
  }

  // -------------------------------------------------------------------------------------
  // Composition convenience
  // -------------------------------------------------------------------------------------

  /**
   * Build the default production composition for `seed` (browser IndexedDB, window flush target,
   * localStorage migration source). Kept thin: all defaults live in the constructor.
   */
  static createProductionGamePersistence(seed: number): GamePersistence {
    return new GamePersistence({ seed });
  }

  // -------------------------------------------------------------------------------------
  // Open / lifecycle
  // -------------------------------------------------------------------------------------

  /**
   * Open all repositories, verify storage health, run the copy-then-verify legacy migration
   * (idempotent via the `__migration__:${worldId}` marker record), bulk-load committed edits +
   * player state, write/refresh the world metadata header, and start the autosave coordinator.
   *
   * Never throws (offline-first): every failure is caught into `errors` and reflected in
   * `status`. Safe to call once per instance; repeat calls return the first result.
   */
  async open(): Promise<GamePersistenceOpenResult> {
    if (this.opened && this.lastResult) return this.lastResult;

    let fatal = false;
    let health: StorageStatus = this.healthMonitor.status;
    let migrationReport: LegacyMigrationReport | null = null;
    let existingWorldMetadata: WorldMetadata | null = null;
    let initialColumns: SerializedChunkColumn[] = [];
    let metadataReadSucceeded = false;
    let columnsReadSucceeded = false;
    let durableEditsReadSucceeded = false;
    let hasDurableEdits = false;

    // 1. Open all six repositories.
    try {
      await this.metadata.open();
      await this.chunkSections.open();
      await this.blockEntities.open();
      await this.entities.open();
      await this.playerStates.open();
      await this.chunkEdits.open();
    } catch (e) {
      fatal = true;
      this.recordError(`open repositories: ${errorMessage(e)}`);
    }

    // 2. Classify early unavailability with one real probe.
    if (!fatal) {
      try {
        health = await this.healthMonitor.check();
      } catch (e) {
        this.recordError(`health check: ${errorMessage(e)}`);
      }
    }

    // 3. Copy-then-verify legacy migration (MIGRATE-1..5), gated by the durable completion marker.
    if (!fatal) {
      const markerKey = `__migration__:${this.worldIdValue}`;
      let marker: WorldMetadata | null = null;
      try {
        marker = await this.metadata.getMetadata(markerKey);
      } catch (e) {
        this.recordError(`migration marker read: ${errorMessage(e)}`);
      }

      if (marker === null && !this.migrator) {
        // No legacy source at all: nothing to migrate, but mark completion so a source that
        // appears later cannot regress newer durable data.
        try {
          await this.writeMigrationMarker(markerKey);
        } catch (e) {
          this.recordError(`migration marker write: ${errorMessage(e)}`);
        }
      } else if (marker === null && this.migrator) {
        // Marker absent → migrate. NOTE (MIGRATE-4 edge): until a fully verified migration
        // completes, legacy input remains authoritative — durable records derived from a FAILED
        // migration attempt may be overwritten on the next boot's retry. That is why the marker
        // is written ONLY when `report.errors` is empty.
        //
        // Exception (interim-progress protection): if a previous attempt FAILED and durable
        // state now exists anyway, that state was written by real gameplay after the failed
        // boot and is NEWER than the stale legacy snapshot. Re-migrating would silently revert
        // it, so the retry is skipped, the failure stays observable via the degraded status,
        // and legacy localStorage remains untouched on disk (MIGRATE-2/3/4).
        const attemptedKey = `__migration_attempted__:${this.worldIdValue}`;
        let attempted = false;
        try {
          attempted = (await this.metadata.getMetadata(attemptedKey)) !== null;
        } catch (e) {
          this.recordError(`migration attempt marker read: ${errorMessage(e)}`);
        }
        let hasDurableState = false;
        if (attempted) {
          try {
            const [records, playerRecord] = await Promise.all([
              this.chunkEdits.listChunkEdits(this.worldIdValue),
              this.playerStates.getPlayerState(this.worldIdValue),
            ]);
            hasDurableState =
              records.some((r) => r.changes.length > 0) || playerRecord !== null;
          } catch (e) {
            this.recordError(`durable-state probe: ${errorMessage(e)}`);
          }
        }

        if (attempted && hasDurableState) {
          this.recordError(
            'migration: a previous attempt failed and newer durable progress exists; legacy localStorage was left untouched to protect it',
          );
        } else {
          try {
            migrationReport = await this.migrator.migrate(this.seed);
            if (migrationReport.errors.length > 0) {
              for (const err of migrationReport.errors) this.recordError(`migration: ${err}`);
              // Record the attempt so a later boot with interim durable progress
              // never regresses it (see above).
              try {
                await this.writeMigrationMarker(attemptedKey);
              } catch (e) {
                this.recordError(`migration attempt marker write: ${errorMessage(e)}`);
              }
            } else {
              // Write the completion marker even when no legacy data existed, so a legacy-less
              // boot does not rescan forever. After this point durable state is authoritative.
              await this.writeMigrationMarker(markerKey);
            }
          } catch (e) {
            this.recordError(`migration: ${errorMessage(e)}`);
            try {
              await this.writeMigrationMarker(attemptedKey);
            } catch (e2) {
              this.recordError(`migration attempt marker write: ${errorMessage(e2)}`);
            }
          }
        }
      }
    }

    // 4. Classify the persisted generation baseline before any live world can regenerate a column.
    if (!fatal) {
      try {
        existingWorldMetadata = await this.metadata.getMetadata(this.worldIdValue);
        metadataReadSucceeded = true;
      } catch (e) {
        this.generationBaselineValue = 'legacy-unknown';
        this.recordError(`world metadata read: ${errorMessage(e)}`);
      }
      try {
        initialColumns = await this.chunkSections.listColumns(this.worldIdValue);
        columnsReadSucceeded = true;
      } catch (e) {
        this.recordError(`load committed columns: ${errorMessage(e)}`);
      }
      try {
        const records = await this.chunkEdits.listChunkEdits(this.worldIdValue);
        hasDurableEdits = records.some((record) => record.changes.length > 0);
        durableEditsReadSucceeded = true;
      } catch (e) {
        this.recordError(`load committed edits: ${errorMessage(e)}`);
      }
      if (!metadataReadSucceeded || !columnsReadSucceeded || !durableEditsReadSucceeded) {
        this.generationBaselineValue = 'legacy-unknown';
      } else if (existingWorldMetadata === null) {
        this.generationBaselineValue =
          initialColumns.length === 0 && !hasDurableEdits ? 'current' : 'legacy-unknown';
      } else if (
        existingWorldMetadata.seed !== this.seed ||
        existingWorldMetadata.dimensionId !== 'minecraft:overworld' ||
        existingWorldMetadata.minY !== -64 ||
        existingWorldMetadata.height !== 384
      ) {
        this.generationBaselineValue = 'unsupported';
      } else if (existingWorldMetadata.generationVersion === undefined) {
        this.generationBaselineValue = 'legacy-unknown';
      } else if (existingWorldMetadata.generationVersion === CURRENT_WORLDGEN_VERSION) {
        this.generationBaselineValue = 'current';
      } else {
        this.generationBaselineValue = 'unsupported';
      }
    }
    // A successful legacy localStorage migration is an existing world even when it had no
    // prior IndexedDB header. Do not stamp it with the current generator by omission.
    if (
      existingWorldMetadata === null &&
      migrationReport !== null &&
      (migrationReport.importedColumns > 0 ||
        (migrationReport.importedEditRecords ?? 0) > 0 ||
        migrationReport.playerStateImported)
    ) {
      this.generationBaselineValue = 'legacy-unknown';
    }
    if (this.generationBaselineValue === 'unsupported') {
      this.recordError(
        `world generation baseline ${this.generationBaselineValue}: existing terrain will not be regenerated without an explicit compatible generator`,
      );
    }

    // 5. Bulk-load committed state (never silent).
    let initialEdits: WorldEditSnapshot | null = null;
    let initialPlayerState: GamePlayerSnapshot | null = null;
    const initialBlockEntities: SerializedBlockEntity[] = [];
    if (!fatal) {
      try {
        const records = await this.chunkEdits.listChunkEdits(this.worldIdValue);
        const edits = records
          .filter((r) => r.changes.length > 0)
          .map((r) => ({ chunk: [r.chunkX, r.chunkY, r.chunkZ] as [number, number, number], changes: r.changes }));
        initialEdits = edits.length > 0 ? { version: 1, seed: this.seed, edits } : null;
      } catch (e) {
        this.recordError(`load committed edits: ${errorMessage(e)}`);
      }
      try {
        const record = await this.playerStates.getPlayerState(this.worldIdValue);
        initialPlayerState = record ? playerRecordToSnapshot(record) : null;
      } catch (e) {
        this.recordError(`load player state: ${errorMessage(e)}`);
      }
      // 251 hydration source: every persisted block-entity record for this world.
      try {
        initialBlockEntities.push(...(await this.listAllBlockEntities()));
      } catch (e) {
        this.recordError(`load block entities: ${errorMessage(e)}`);
      }
      // 252 hydration: wither records stored via raw wither data
      let initialWithers: unknown[] = [];
      try {
        const data = await this.metadata.getWitherData(this.worldIdValue);
        if (Array.isArray(data)) initialWithers = data;
      } catch (e) {
        this.recordError(`load withers: ${errorMessage(e)}`);
      }
      this.initialWithersValue = initialWithers;
    }

    // 5.5 Authoritative startup compatibility decision (257). Computed after the
    // bulk load so the persisted player snapshot can anchor the bounded coverage
    // neighborhood. Read uncertainty on an existing (non-fatal) world is
    // conservative: an empty partial read never classifies a world as current.
    const readUncertain =
      !fatal &&
      (!metadataReadSucceeded || !columnsReadSucceeded || !durableEditsReadSucceeded);
    const playerStateForAssessment = fatal ? null : initialPlayerState;
    const playerChunk = playerStateForAssessment
      ? {
          chunkX: Math.floor(playerStateForAssessment.player.position[0] / 16),
          chunkZ: Math.floor(playerStateForAssessment.player.position[2] / 16),
        }
      : null;
    this.startupAssessmentValue = assessWorldStartup({
      baseline: this.generationBaselineValue,
      readUncertain,
      canonicalColumns: fatal ? [] : initialColumns.map((c) => ({ chunkX: c.chunkX, chunkZ: c.chunkZ })),
      playerStatePresent: playerStateForAssessment !== null,
      playerChunk,
    });

    // 6. Write/refresh the world's own metadata header (read-modify-write preserves createdAt).
    // Existing legacy/unsupported headers are deliberately preserved: writing the current
    // version here would falsely authorize a materially different baseline on the next boot.
    if (!fatal) {
      try {
        const metadata: WorldMetadata = {
          schemaVersion: 1,
          worldId: this.worldIdValue,
          seed: this.seed,
          dimensionId: 'minecraft:overworld',
          minY: -64,
          height: 384,
          createdAt: existingWorldMetadata?.createdAt ?? Date.now(),
          updatedAt: existingWorldMetadata?.updatedAt ?? Date.now(),
          ...(this.generationBaselineValue === 'current'
            ? { generationVersion: CURRENT_WORLDGEN_VERSION }
            : existingWorldMetadata?.generationVersion === undefined
              ? {}
              : { generationVersion: existingWorldMetadata.generationVersion }),
        };
        await this.metadata.putMetadata(metadata);
      } catch (e) {
        this.recordError(`write world metadata: ${errorMessage(e)}`);
      }
    }

    // 6. Start periodic autosave + pagehide/visibilitychange flush. Guarded so a
    // dispose() that raced a still-pending open() cannot re-arm timers/listeners
    // after teardown (repositories would already be closed).
    if (!this.disposed) {
      this.coordinator.start();
    }

    // 7. Classify overall status.
    health = this.healthMonitor.status;
    const status: GamePersistenceOpenResult['status'] =
      fatal || health === 'failed'
        ? 'failed'
        : this.errors.length > 0 || health === 'degraded'
          ? 'degraded'
          : 'ok';

    this.initialEditsValue = initialEdits;
    this.initialPlayerStateValue = initialPlayerState;
    this.initialBlockEntitiesValue = initialBlockEntities;
    this.initialColumnsValue = initialColumns;
    // initialWithers already set above; fallback to empty if fatal
    if (fatal) {
      this.initialWithersValue = [];
      this.initialColumnsValue = [];
    }
    this.opened = true;
    this.lastResult = {
      status,
      initialEdits,
      initialPlayerState,
      initialBlockEntities,
      initialWithers: this.initialWithersValue,
      initialColumns: this.initialColumnsValue,
      generationBaseline: this.generationBaselineValue,
      startupAssessment: this.startupAssessmentValue as WorldStartupAssessment,
      migrationReport,
      errors: [...this.errors],
    };
    return this.lastResult;
  }

  /**
   * World-scoped reset for the current `worldId` (257). Deletes ONLY the
   * selected world's records. Atomic via snapshot-restore: a full snapshot of
   * every world-owned record is captured BEFORE the first destructive delete.
   * If any delete fails, every record from the snapshot is restored before
   * returning failure, so `Your saved world was kept` remains true. After a
   * successful reset the facade becomes inert (`resetCompleted`) so later
   * capture/save calls cannot re-create records before the page reloads into
   * the fresh world.
   *
   * Failure behavior: the first store failure aborts the sequence and is
   * reported; the method NEVER reports success after a partial failure, and
   * the previous world is restored to observably equivalent state.
   */
  async resetCurrentWorld(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!this.opened || this.disposed) {
      return { ok: false, error: 'reset failed: persistence is not open' };
    }
    // Stop scheduled autosave + recovery probes and drop every pending dirty
    // unit so nothing can write between/after the deletions.
    this.stopRecoveryTimer();
    this.coordinator.stop();
    this.queue.clear();
    this.pendingEdits.clear();
    const worldId = this.worldIdValue;
    // Snapshot every world-owned record BEFORE any destructive mutation.
    let snapshot: {
      metadata: WorldMetadata | null;
      witherData: unknown[] | null;
      columns: SerializedChunkColumn[];
      edits: Array<{ chunkX: number; chunkY: number; chunkZ: number; changes: Array<[number, number]> }>;
      playerState: PlayerStateRecord | null;
      blockEntityChunks: Array<{ chunkX: number; chunkZ: number; entities: SerializedBlockEntity[] }>;
      entityChunks: Array<{ chunkX: number; chunkZ: number; entities: SerializedEntity[] }>;
    } | null = null;
    try {
      const [metadata, witherData, columns, editRecords, playerState, blockEntityChunks, entityChunks] = await Promise.all([
        this.metadata.getMetadata(worldId),
        this.metadata.getWitherData(worldId).catch(() => null as unknown[] | null),
        this.chunkSections.listColumns(worldId),
        this.chunkEdits.listChunkEdits(worldId),
        this.playerStates.getPlayerState(worldId),
        this.blockEntities.listChunks(worldId),
        this.entities.listChunks(worldId),
      ]);
      snapshot = {
        metadata,
        witherData,
        columns: [...columns],
        edits: editRecords.map((r) => ({ chunkX: r.chunkX, chunkY: r.chunkY, chunkZ: r.chunkZ, changes: [...r.changes] })),
        playerState,
        blockEntityChunks: blockEntityChunks.map((c) => ({ chunkX: c.chunkX, chunkZ: c.chunkZ, entities: [...c.entities] })),
        entityChunks: entityChunks.map((c) => ({ chunkX: c.chunkX, chunkZ: c.chunkZ, entities: [...c.entities] })),
      };
    } catch (e) {
      return { ok: false, error: `reset failed: snapshot failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    try {
      // Destructive phase: every world-owned store/key for this worldId.
      // Idempotent on absent records: try/catch swallows the "not found" error.
      if (snapshot.metadata !== null) {
        await this.metadata.deleteMetadata(worldId);
      } else {
        try { await this.metadata.deleteMetadata(worldId); } catch (e) { void e; }
      }
      await this.metadata.deleteRaw(`__wither__:${worldId}`);
      for (const column of snapshot.columns) {
        await this.chunkSections.deleteColumn(worldId, column.chunkX, column.chunkZ);
      }
      for (const record of snapshot.edits) {
        await this.chunkEdits.deleteChunkEdits(worldId, record.chunkX, record.chunkY, record.chunkZ);
      }
      if (snapshot.playerState !== null) {
        await this.playerStates.deletePlayerState(worldId);
      } else {
        try { await this.playerStates.deletePlayerState(worldId); } catch (e) { void e; }
      }
      for (const record of snapshot.blockEntityChunks) {
        await this.blockEntities.deleteChunkEntities(worldId, record.chunkX, record.chunkZ);
      }
      for (const record of snapshot.entityChunks) {
        await this.entities.deleteChunkEntities(worldId, record.chunkX, record.chunkZ);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        if (snapshot.metadata) await this.metadata.putMetadata(snapshot.metadata);
        if (snapshot.witherData !== null) await this.metadata.putWitherData(worldId, snapshot.witherData);
        for (const col of snapshot.columns) await this.chunkSections.putColumn(worldId, col);
        for (const rec of snapshot.edits) await this.chunkEdits.putChunkEdits(worldId, rec.chunkX, rec.chunkY, rec.chunkZ, rec.changes);
        if (snapshot.playerState) await this.playerStates.putPlayerState(snapshot.playerState);
        for (const rec of snapshot.blockEntityChunks) await this.blockEntities.putChunkEntities(worldId, rec.chunkX, rec.chunkZ, rec.entities);
        for (const rec of snapshot.entityChunks) await this.entities.putChunkEntities(worldId, rec.chunkX, rec.chunkZ, rec.entities);
      } catch (restoreErr) {
        const restoreMsg = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
        return { ok: false, error: `reset failed: ${msg}; rollback incomplete: ${restoreMsg}` };
      }
      return { ok: false, error: `reset failed: ${msg}` };
    }
    this.resetCompleted = true;
    return { ok: true };
  }

  /**
   * Export the selected world's records as a validated JSON archive string (257
   * backup action). Read-only: export NEVER mutates the persisted world.
   */
  async exportWorldBackup(): Promise<{ ok: true; json: string } | { ok: false; error: string }> {
    if (!this.opened || this.disposed) {
      return { ok: false, error: 'backup failed: persistence is not open' };
    }
    try {
      const archiver = new WorldArchiver({
        metadata: this.metadata,
        chunkSections: this.chunkSections,
        blockEntities: this.blockEntities,
        entities: this.entities,
        playerStates: this.playerStates,
        chunkEdits: this.chunkEdits,
      });
      const archive = await archiver.exportWorld(this.worldIdValue);
      return { ok: true, json: JSON.stringify(archive) };
    } catch (e) {
      return { ok: false, error: `backup failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /**
   * Stop the recovery probe and coordinator, best-effort flush remaining units, and close all six
   * repositories. Idempotent. After dispose, `captureChunkEdits`/`savePlayerState` are safe no-ops
   * (documented choice: dropping in-memory marks is preferable to throwing mid-teardown).
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.stopRecoveryTimer();
    this.coordinator.stop();
    try {
      await this.coordinator.flush();
    } catch {
      // Best-effort final flush; never throws out of dispose.
    }
    for (const repo of [
      this.metadata,
      this.chunkSections,
      this.blockEntities,
      this.entities,
      this.playerStates,
      this.chunkEdits,
    ]) {
      try {
        repo.close();
      } catch {
        // Best-effort close.
      }
    }
  }

  // -------------------------------------------------------------------------------------
  // WorldEditDurability (type-checked against src/world/World.ts below)
  // -------------------------------------------------------------------------------------

  /** Capture a committed overlay mutation as a full-snapshot dirty unit (dedup by key, DIRTY-3). */
  captureChunkEdits(cx: number, cy: number, cz: number, changes: ReadonlyMap<number, number>): void {
    if (this.disposed || this.resetCompleted || changes.size === 0) return;
    const payload = [...changes.entries()].sort((a, b) => a[0] - b[0]);
    const unitKey = `chunk-edits|${this.worldIdValue}|${cx}|${cy}|${cz}`;
    this.coordinator.markDirty({
      key: unitKey,
      kind: 'chunk-edits',
      worldId: this.worldIdValue,
      chunkX: cx,
      chunkY: cy,
      chunkZ: cz,
      payload,
    });
    this.pendingEdits.set(`${cx},${cy},${cz}`, { unitKey, map: new Map(payload) });
  }

  /**
   * Defensive re-capture before LRU eviction (DIRTY-1/2): identical to capture — the pending unit
   * is a full snapshot, so re-capture is idempotent under dedup-by-key.
   */
  retainEvictedChunkEdits(cx: number, cy: number, cz: number, changes: ReadonlyMap<number, number>): void {
    this.captureChunkEdits(cx, cy, cz, changes);
  }

  /** Synchronous lookup of the still-pending overlay copy, or `null` once committed/absent. */
  restorePendingChunkEdits(cx: number, cy: number, cz: number): ReadonlyMap<number, number> | null {
    return this.pendingEdits.get(`${cx},${cy},${cz}`)?.map ?? null;
  }

  // -------------------------------------------------------------------------------------
  // Block entities (251)
  // -------------------------------------------------------------------------------------

  /**
   * Enqueue a chunk's block entities as a full-snapshot deduplicated dirty unit.
   * An empty snapshot is meaningful: it overwrites stale persisted rows after the
   * last furnace in a chunk is removed. No-op after dispose.
   */
  saveBlockEntities(cx: number, cz: number, entities: SerializedBlockEntity[]): void {
    if (this.disposed) return;
    this.coordinator.markDirty({
      key: `block-entities|${this.worldIdValue}|${cx}|${cz}`,
      kind: 'block-entities',
      worldId: this.worldIdValue,
      chunkX: cx,
      chunkZ: cz,
      payload: entities,
    });
  }

  /**
   * Committed-copy lookup for one chunk. NEVER throws: a failure is recorded and
   * triggers a health check; the caller receives `null` (treated as "no data").
   */
  async loadBlockEntities(cx: number, cz: number): Promise<SerializedBlockEntity[] | null> {
    try {
      return await this.blockEntities.getChunkEntities(this.worldIdValue, cx, cz);
    } catch (e) {
      this.recordError(`load block entities (${cx},${cz}): ${errorMessage(e)}`);
      void this.healthMonitor.check().catch(() => undefined);
      return null;
    }
  }

  /**
   * Enqueue a canonical chunk column's sections as a full-snapshot deduplicated dirty unit.
   * Idempotent: the DirtySaveQueue deduplicates by `key` (`chunk-sections|worldId|cx|cz`),
   * so repeated `saveChunkColumn` calls for the same column before flush coalesce
   * to the latest serialized snapshot. Negative-Y sections (e.g., y=-10 → sy=-1)
   * and high-Y (y=310 → sy=19) are preserved because `ChunkColumn.serialize`
   * includes all dirty sections across the dimension's 24-section height.
   */
  saveChunkColumn(column: ChunkColumn): void {
    if (this.disposed) return;
    const serialized = column.serialize();
    this.coordinator.markDirty({
      key: `chunk-sections|${this.worldIdValue}|${column.chunkX}|${column.chunkZ}`,
      kind: 'chunk-sections',
      worldId: this.worldIdValue,
      chunkX: column.chunkX,
      chunkZ: column.chunkZ,
      payload: serialized,
    });
  }

  /**
   * Committed-copy lookup for a serialized chunk column. NEVER throws: a failure is
   * recorded internally and triggers a health check; the caller receives `null`.
   */
  async loadChunkColumn(chunkX: number, chunkZ: number): Promise<SerializedChunkColumn | null> {
    try {
      return await this.chunkSections.getColumn(this.worldIdValue, chunkX, chunkZ);
    } catch (e) {
      this.recordError(`load chunk column (${chunkX},${chunkZ}): ${errorMessage(e)}`);
      void this.healthMonitor.check().catch(() => undefined);
      return null;
    }
  }

  /**
   * Asynchronous committed-copy lookup. NEVER throws: a failure is recorded internally and
   * triggers a health check; the caller receives `null`.
   */
  async loadCommittedChunkEdits(cx: number, cy: number, cz: number): Promise<Array<[number, number]> | null> {
    try {
      return await this.chunkEdits.getChunkEdits(this.worldIdValue, cx, cy, cz);
    } catch (e) {
      this.recordError(`load committed chunk edits (${cx},${cy},${cz}): ${errorMessage(e)}`);
      void this.healthMonitor.check().catch(() => undefined);
      return null;
    }
  }

  /**
   * List every persisted block-entity record for this world across all chunks
   * (251 boot hydration; also usable by tests/tooling). Throws on repository
   * failure — callers decide degradation policy (`open()` records + degrades).
   */
  async listAllBlockEntities(): Promise<SerializedBlockEntity[]> {
    const out: SerializedBlockEntity[] = [];
    const chunkRecords = await this.blockEntities.listChunks(this.worldIdValue);
    for (const chunkRecord of chunkRecords) {
      const entities = await this.blockEntities.getChunkEntities(
        this.worldIdValue,
        chunkRecord.chunkX,
        chunkRecord.chunkZ,
      );
      if (entities && entities.length > 0) out.push(...entities);
    }
    return out;
  }

  // -------------------------------------------------------------------------------------
  // Player state
  // -------------------------------------------------------------------------------------

  /**
   * Enqueue the latest player state as a deduplicated `player-state` unit. Throws on an invalid
   * snapshot (programmer error; validated via `validatePlayerStateRecord`); no-op after dispose.
   */
  savePlayerState(snapshot: GamePlayerSnapshot): void {
    if (this.disposed || this.resetCompleted) return;
    const record = validatePlayerStateRecord({
      worldId: this.worldIdValue,
      seed: snapshot.seed,
      position: snapshot.player.position,
      yaw: snapshot.player.yaw,
      pitch: snapshot.player.pitch,
      inventory: snapshot.inventory,
      survival: snapshot.survival,
      experience: snapshot.experience,
    });
    this.coordinator.markDirty({
      key: `player-state|${this.worldIdValue}`,
      kind: 'player-state',
      worldId: this.worldIdValue,
      chunkX: 0,
      chunkY: 0,
      chunkZ: 0,
      payload: record,
    });
  }

  // -------------------------------------------------------------------------------------
  // Flush + observability surface
  // -------------------------------------------------------------------------------------

  /**
   * Drain the queue to empty (bounded by the coordinator's zero-progress guard) and report the
   * truthful outcome (SAVE-FAIL-5): `committed` counts only sink-accepted writes; `failed` is the
   * queue size still pending afterwards. Post-flush health is re-probed when anything failed, or
   * when something committed while unhealthy (verified-recovery clearing, SAVE-FAIL-3).
   */
  async flush(): Promise<GamePersistenceFlushResult> {
    const seqBefore = this.monitoredSink.checks;
    const committed = await this.coordinator.flush();
    const failed = this.queue.size;
    this.prunePendingEdits();

    let health = this.healthMonitor.status;
    if (failed > 0 || (committed > 0 && health !== 'ok')) {
      // Prefer the sink-driven check (one probe failure per rejected write keeps the first
      // failure classified as 'degraded', not 'failed'); probe explicitly only when the sink
      // did not schedule one (e.g. a gated write never touched storage).
      const sinkChecked = await this.monitoredSink.settleChecks(seqBefore);
      if (!sinkChecked) {
        await this.healthMonitor.check().catch(() => undefined);
      }
      health = this.healthMonitor.status;
    }
    return { committed, failed, health };
  }

  /** This world's stable identifier (`world-${seed}` by default). */
  get worldId(): string {
    return this.worldIdValue;
  }

  /** Current storage health as classified by the monitor + probe. */
  get health(): StorageStatus {
    return this.healthMonitor.status;
  }

  /** Number of dirty units awaiting a durable write. */
  get pendingCount(): number {
    return this.queue.size;
  }

  /** Committed edits bulk-loaded at `open()` (null before open / when none exist). */
  get initialEdits(): WorldEditSnapshot | null {
    return this.initialEditsValue;
  }

  /** Player state bulk-loaded at `open()` (null before open / when none exists). */
  get initialPlayerState(): GamePlayerSnapshot | null {
    return this.initialPlayerStateValue;
  }

  /** Bulk-loaded persisted block-entity records for this world (251 hydration). */
  get initialBlockEntities(): SerializedBlockEntity[] {
    return this.initialBlockEntitiesValue;
  }

  /** Bulk-loaded wither records (252). */
  get initialWithers(): unknown[] {
    return this.initialWithersValue;
  }

  /** Bulk-loaded persisted canonical columns for this world. */
  get initialColumns(): SerializedChunkColumn[] {
    return this.initialColumnsValue;
  }

  /** Baseline compatibility selected during open. */
  get generationBaseline(): WorldGenerationBaseline {
    return this.generationBaselineValue;
  }

  /**
   * The authoritative startup compatibility decision (257); `null` only before
   * `open()` resolves. Game consumes this instead of scattering ad-hoc baseline
   * checks across startup, spawn, readiness and UI.
   */
  get startupAssessment(): WorldStartupAssessment | null {
    return this.startupAssessmentValue;
  }

  /** Whether a user-confirmed world-scoped reset completed (257 debug surface). */
  get isResetCompleted(): boolean {
    return this.resetCompleted;
  }

  /** Persist wither list via raw wither data (252). */
  saveWithers(payload: unknown[]): void {
    if (this.disposed || this.resetCompleted) return;
    void this.metadata.putWitherData(this.worldIdValue, payload).catch((e) => this.recordError(`save withers: ${errorMessage(e)}`));
  }

  /** Last classified write failure observed by the monitoring sink, or `null` (debug surface). */
  get lastFailure(): StorageFailure | null {
    return this.monitoredSink.lastFailure ?? this.healthMonitor.lastFailure;
  }

  /** Kind of the last classified write failure, or `null` (debug surface, SAVE-FAIL-1). */
  get lastFailureKind(): string | null {
    return this.lastFailure?.kind ?? null;
  }

  /** Bounded count of write failures observed by the monitoring sink (debug surface). */
  get failureCount(): number {
    return this.monitoredSink.failures;
  }

  /** Subscribe to health-status changes; returns an unsubscribe function (bounded listener set). */
  onHealthChange(cb: (status: StorageStatus) => void): () => void {
    return this.healthMonitor.onStatusChange(cb);
  }

  // -------------------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------------------

  /** Write the durable migration-completion marker record for `markerKey`. */
  private async writeMigrationMarker(markerKey: string): Promise<void> {
    await this.metadata.putMetadata({
      schemaVersion: 1,
      worldId: markerKey,
      seed: this.seed,
      dimensionId: 'minecraft:overworld',
      minY: -64,
      height: 384,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  /** Record a user-observable error into the bounded log (oldest dropped past the cap). */
  private recordError(message: string): void {
    this.errors.push(message);
    if (this.errors.length > MAX_RECORDED_ERRORS) {
      this.errors.splice(0, this.errors.length - MAX_RECORDED_ERRORS);
    }
  }

  /** Drop pending-overlay copies whose unit has left the queue (i.e. was durably committed). */
  private prunePendingEdits(): void {
    for (const [key, entry] of this.pendingEdits) {
      if (!this.queue.has(entry.unitKey)) {
        this.pendingEdits.delete(key);
      }
    }
  }

  /**
   * Release the pending-overlay copies whose units just committed durably
   * (coordinator hook). A key may still be pending when a newer markDirty
   * landed during the write; only keys absent from the queue are released.
   */
  private releaseCommittedPendingEdits(committedKeys: readonly string[]): void {
    for (const unitKey of committedKeys) {
      for (const [chunkKey, entry] of this.pendingEdits) {
        if (entry.unitKey === unitKey && !this.queue.has(unitKey)) {
          this.pendingEdits.delete(chunkKey);
        }
      }
    }
  }

  private stopRecoveryTimer(): void {
    if (this.recoveryTimerId !== null) {
      this.timer.clearInterval(this.recoveryTimerId);
      this.recoveryTimerId = null;
    }
  }
}

/** Convert a stored `PlayerStateRecord` into the game-level snapshot shape. */
function playerRecordToSnapshot(record: PlayerStateRecord): GamePlayerSnapshot {
  return {
    version: 1,
    seed: record.seed,
    player: { position: record.position, yaw: record.yaw, pitch: record.pitch },
    inventory: record.inventory,
    survival: record.survival,
    experience: record.experience,
  };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Type-level guarantee: GamePersistence must remain structurally assignable to
// WorldEditDurability so `World` can consume it directly; signature drift fails compilation.
const _durabilityCheck: WorldEditDurability = null as unknown as GamePersistence;
void _durabilityCheck;
