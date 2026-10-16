/**
 * Ordered, typed data-version migration framework (041). Persisted records carry data versions
 * (`SerializedChunkColumn.version`, `WorldMetadata.schemaVersion`); a `DataMigrationChain<T>` owns
 * contiguous `fromVersion → toVersion` steps and applies them in ascending order when a record is
 * loaded. Registration is validated eagerly (gaps/duplicates/non-contiguous steps throw) and
 * `migrate` refuses downgrades and unknown versions, so mis-versioned records are never silently
 * misread. Migration is pure: the chain never mutates its input.
 *
 * IndexedDB *schema* versioning (`WORLD_DB_VERSION` + `ensureWorldStores`) is orthogonal and handled
 * by 034-040; this framework migrates record *data* versions at load time.
 */
import type { WorldMetadata } from './WorldMetadata';
import type { SerializedChunkColumn } from '../world/ChunkColumn';

/** One ordered data-migration step: transform a record at `fromVersion` to `toVersion`. */
export interface DataMigration<T> {
  /** Version the input record carries. */
  fromVersion: number;
  /** Version of the output record; must be `fromVersion + 1`. */
  toVersion: number;
  /** Pure transformation; MUST NOT mutate `record`. */
  migrate(record: T): T;
}

/** Structural/unsafe conditions the chain refuses. */
export type DataMigrationErrorKind = 'GAP' | 'DUPLICATE' | 'DOWNGRADE' | 'UNKNOWN_VERSION';

/** Thrown for structurally invalid chains or unsafe migration requests. */
export class DataMigrationError extends Error {
  constructor(
    readonly kind: DataMigrationErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'DataMigrationError';
  }
}

/** Result of a chain migration. */
export interface MigrationResult<T> {
  /** The migrated record (the input when no steps applied). */
  record: T;
  /** Versions reached by the applied steps, in order. */
  appliedSteps: number[];
}

/**
 * An ordered chain of contiguous data migrations from `baseVersion` upward. Steps are keyed by
 * `fromVersion`; `currentVersion` is the highest `toVersion` registered so far.
 */
export class DataMigrationChain<T> {
  private readonly stepsByFrom = new Map<number, DataMigration<T>>();
  private readonly ordered: DataMigration<T>[] = [];
  private latestVersion: number;

  constructor(readonly baseVersion: number) {
    this.latestVersion = baseVersion;
  }

  /** Register the next contiguous step. Rejects gaps, duplicates, and non-contiguous ranges. */
  register(migration: DataMigration<T>): void {
    if (this.stepsByFrom.has(migration.fromVersion)) {
      throw new DataMigrationError(
        'DUPLICATE',
        `DataMigrationChain: duplicate step from version ${migration.fromVersion}`,
      );
    }
    if (migration.toVersion !== migration.fromVersion + 1) {
      throw new DataMigrationError(
        'GAP',
        `DataMigrationChain: step ${migration.fromVersion}->${migration.toVersion} must be contiguous (+1)`,
      );
    }
    if (migration.fromVersion !== this.latestVersion) {
      throw new DataMigrationError(
        'GAP',
        `DataMigrationChain: expected step from ${this.latestVersion}, got ${migration.fromVersion}`,
      );
    }
    this.stepsByFrom.set(migration.fromVersion, migration);
    this.ordered.push(migration);
    this.latestVersion = migration.toVersion;
  }

  /** The highest data version this chain can produce. */
  get currentVersion(): number {
    return this.latestVersion;
  }

  /** The registered steps in order (read-only view). */
  get steps(): readonly DataMigration<T>[] {
    return this.ordered;
  }

  /** True when `record` is not at `currentVersion` and therefore needs migration. */
  needsMigration(record: T, getVersion: (record: T) => number): boolean {
    return getVersion(record) !== this.latestVersion;
  }

  /**
   * Migrate `record` from its current version up to `currentVersion`. Pure: the input is never
   * mutated; a throwing step aborts with the caller's record untouched.
   */
  migrate(record: T, getVersion: (record: T) => number): MigrationResult<T> {
    let current = getVersion(record);
    if (current < this.baseVersion) {
      throw new DataMigrationError(
        'UNKNOWN_VERSION',
        `DataMigrationChain: version ${current} is below base version ${this.baseVersion}`,
      );
    }
    if (current > this.latestVersion) {
      throw new DataMigrationError(
        'DOWNGRADE',
        `DataMigrationChain: cannot downgrade record version ${current} to ${this.latestVersion}`,
      );
    }

    const appliedSteps: number[] = [];
    let out = record;
    while (current < this.latestVersion) {
      const step = this.stepsByFrom.get(current);
      if (!step) {
        throw new DataMigrationError(
          'UNKNOWN_VERSION',
          `DataMigrationChain: no step registered from version ${current}`,
        );
      }
      out = step.migrate(out);
      current = step.toVersion;
      appliedSteps.push(current);
    }
    return { record: out, appliedSteps };
  }
}

/**
 * The WorldMetadata migration chain (base `schemaVersion = 1`). Currently empty — every persisted
 * record is already current, so migration is identity. Future shape changes register steps here.
 */
export const WORLD_METADATA_MIGRATIONS = new DataMigrationChain<WorldMetadata>(1);

/** Migrate a `WorldMetadata` record to the latest `schemaVersion` (identity today). */
export function migrateWorldMetadata(record: WorldMetadata): WorldMetadata {
  return WORLD_METADATA_MIGRATIONS.migrate(record, (r) => r.schemaVersion).record;
}

/**
 * The chunk-column migration chain (base `version = 1`). Currently empty — every persisted record is
 * already current, so migration is identity. Future shape changes register steps here.
 */
export const CHUNK_COLUMN_MIGRATIONS = new DataMigrationChain<SerializedChunkColumn>(1);

/** Migrate a `SerializedChunkColumn` record to the latest `version` (identity today). */
export function migrateChunkColumn(record: SerializedChunkColumn): SerializedChunkColumn {
  return CHUNK_COLUMN_MIGRATIONS.migrate(record, (r) => r.version).record;
}
