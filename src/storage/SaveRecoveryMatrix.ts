/**
 * Headless, deterministic save-recovery matrix (240). Stresses the persistent world save stack
 * (034-043, and change 234's server save lifecycle by contract) across the five recovery axes of
 * change 240 — abrupt close, partial write, migration, quota, import/export — and reports a
 * machine-readable, reproducible PASS/FAIL result per scenario.
 *
 * The harness consumes only existing persistence contracts; it does not invent new persistence
 * semantics. Failure injection is done at the sink/repository boundary (`createFaultySaveSink`,
 * `withStorageFailure`, `createGatedSaveSink`), and each scenario runs over a fresh in-memory
 * fixture (`SaveRecoveryFixture`) so failures never leak across scenarios. Matrix output is
 * time-stable: no wall-clock or timestamp value enters `RecoveryResult.detail`, so two identical
 * runs produce identical reports.
 *
 * Repositories are supplied by the caller through `SaveRecoveryFixture` (the tests back it with
 * `tests/unit/IdbFactoryMock.ts`); the harness never touches a browser or real IndexedDB.
 */
import { AutosaveCoordinator, type EventTargetLike, type TimerLike } from './AutosaveCoordinator';
import { DirtySaveQueue, type SaveSink, type SaveUnit } from './DirtySaveQueue';
import { RepositorySaveSink } from './RepositorySaveSink';
import {
  StorageHealthMonitor,
  classifyStorageError,
  type StorageFailureKind,
  type StorageProbe,
} from './StorageHealth';
import { WorldArchiver, type WorldArchiverDeps } from './WorldArchiver';
import { validateWorldArchive, type WorldArchive } from './WorldArchive';
import { DataMigrationChain, DataMigrationError, type DataMigrationErrorKind } from './DataMigration';
import { WORLD_DB_VERSION, validateWorldMetadata, type WorldMetadata } from './WorldMetadata';
import type { SerializedChunkColumn } from '../world/ChunkColumn';
import type { PlayerStateRecord } from './PlayerStateRecord';
import type { SerializedBlockEntity } from './BlockEntityRecord';
import type { SerializedEntity } from './EntityRecord';
import {
  ServerSaveLifecycle,
  type SaveLoadBoundary,
} from '../simulation/ServerSaveLifecycle';
import type { ServerWorldUnit, WorldCodecMeta, WorldSaveCodec } from '../simulation/PersistentWorldCodecs';

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

/** One of the five recovery axes of change 240. */
export type RecoveryAxis = 'abrupt-close' | 'partial-write' | 'migration' | 'quota' | 'import-export';

/** The deterministic outcome of a single scenario. */
export interface RecoveryResult {
  /** Stable, unique scenario id, e.g. `abrupt-close.drain-then-kill`. */
  scenarioId: string;
  /** The axis the scenario belongs to. */
  axis: RecoveryAxis;
  outcome: 'pass' | 'fail';
  /** Deterministic, time-stable human-readable evidence. */
  detail: string;
}

/** The machine-readable report produced by `runAll()`. */
export interface RecoveryMatrixReport {
  results: RecoveryResult[];
  /** True iff every `RecoveryResult.outcome === 'pass'`. */
  allPass: boolean;
  /** Always `true`: matrix output is reproducible byte-for-byte per result. */
  deterministic: true;
}

/** Options for {@link createFaultySaveSink}. */
export interface FaultySaveSinkOptions {
  /** The real sink to pass healthy writes through to. */
  sink: SaveSink;
  /** Reject the next `n` writes, then pass through. */
  failNextWrites?: number;
  /** Reject every write. */
  failAllWrites?: boolean;
  /** Reject the next `n` writes (exercise re-queue-and-retry), then pass through. */
  corruptNextWrites?: number;
  /** Unit keys whose writes ALWAYS reject. */
  failKeys?: string[];
}

/** A `SaveSink` with deterministic fault injection. */
export interface FaultySaveSink extends SaveSink {
  /** Number of failing (failNextWrites) writes still to inject; 0 when healthy. */
  remainingFailures(): number;
  /** Number of corrupt (corruptNextWrites) writes still to inject; 0 when healthy. */
  remainingCorrupt(): number;
}

/**
 * A set of five repositories plus the operations the matrix needs. Supplied by the caller (backed
 * by the in-memory mock factory), so the harness stays decoupled from the test double.
 */
export interface SaveRecoveryFixture {
  /** The five repositories for the current scenario. */
  deps: WorldArchiverDeps;
  /** Open all five repositories. */
  openAll(): Promise<void>;
  /** Fresh repository instances over the SAME underlying database (simulates a process restart). */
  reopen(): SaveRecoveryFixture;
  /**
   * Seed a database at an older schema version (`1..WORLD_DB_VERSION-1`) holding one metadata record
   * for `worldId`, then open repositories at the current schema (migrating the older database
   * forward). Prior data must survive and every store must exist on the returned fixture.
   */
  upgradeFromSchema(olderVersion: number, worldId: string): Promise<SaveRecoveryFixture>;
  /** Write a raw, unvalidated metadata record directly into the store (corrupt-record scenarios). */
  putRawMetadata(record: unknown): Promise<void>;
}

/** Constructor dependencies; the caller wires the in-memory fixtures and coordinator. */
export interface SaveRecoveryMatrixDeps {
  /** Fresh in-memory fixture per scenario. */
  makeRepositories: () => SaveRecoveryFixture;
  /** Build a coordinator over a queue/sink; MUST use `limitPerTick = 2` for the bounded-drain scenarios. */
  makeCoordinator: (queue: DirtySaveQueue, sink: SaveSink) => AutosaveCoordinator;
}

// ────────────────────────────────────────────────────────────────────────────
// Failure-injection seams
// ────────────────────────────────────────────────────────────────────────────

/** Build a DOMException-like error that `classifyStorageError` recognizes by name and code. */
function makeStorageError(kind: StorageFailureKind): Error {
  const e = new Error(`injected ${kind} storage failure`) as Error & { name: string; code?: number };
  switch (kind) {
    case 'quota':
      e.name = 'QuotaExceededError';
      e.code = 22;
      break;
    case 'private-mode':
      e.name = 'SecurityError';
      e.code = 18;
      break;
    case 'unavailable':
      e.name = 'UnknownError';
      break;
    default:
      e.name = 'UnknownError';
  }
  return e;
}

/** Create a sink that injects fail/corrupt/failKeys conditions over a real sink, deterministically. */
export function createFaultySaveSink(opts: FaultySaveSinkOptions): FaultySaveSink {
  const failKeys = new Set(opts.failKeys ?? []);
  let failRemaining = opts.failNextWrites ?? 0;
  let corruptRemaining = opts.corruptNextWrites ?? 0;

  return {
    async write(unit: SaveUnit): Promise<void> {
      if (failKeys.has(unit.key)) {
        throw new Error(`FaultySaveSink: key '${unit.key}' always fails`);
      }
      if (opts.failAllWrites) {
        throw new Error('FaultySaveSink: failAllWrites');
      }
      if (failRemaining > 0) {
        failRemaining--;
        throw new Error('FaultySaveSink: injected write failure');
      }
      if (corruptRemaining > 0) {
        corruptRemaining--;
        throw new Error('FaultySaveSink: injected corrupt write');
      }
      await opts.sink.write(unit);
    },
    remainingFailures(): number {
      return failRemaining;
    },
    remainingCorrupt(): number {
      return corruptRemaining;
    },
  };
}

/**
 * Wrap `deps` so every repository `put*` rejects with a classified storage error. Reads and opens are
 * inherited from the healthy repositories, so the 043 probe round-trip (write/read/delete) surfaces the
 * injected failure as a classified probe rejection.
 */
export function withStorageFailure(
  deps: WorldArchiverDeps,
  failure: 'quota' | 'private-mode' | 'unavailable',
): WorldArchiverDeps {
  const err = makeStorageError(failure);
  const reject = async (): Promise<never> => {
    throw err;
  };
  const metadata = Object.create(deps.metadata) as WorldArchiverDeps['metadata'];
  metadata.putMetadata = reject;
  const chunkSections = Object.create(deps.chunkSections) as WorldArchiverDeps['chunkSections'];
  chunkSections.putColumn = reject;
  const blockEntities = Object.create(deps.blockEntities) as WorldArchiverDeps['blockEntities'];
  blockEntities.putChunkEntities = reject;
  const entities = Object.create(deps.entities) as WorldArchiverDeps['entities'];
  entities.putChunkEntities = reject;
  const playerStates = Object.create(deps.playerStates) as WorldArchiverDeps['playerStates'];
  playerStates.putPlayerState = reject;
  return { metadata, chunkSections, blockEntities, entities, playerStates };
}

/**
 * Gate a sink by a 043 storage monitor: while `canWrite()` is false, `write` rejects without calling the
 * inner sink, so the 038 queue re-queues the unit (no repository write occurs, no unit is dropped). This
 * is the write-gate seam for the quota axis.
 */
export function createGatedSaveSink(inner: SaveSink, gate: { canWrite(): boolean }): SaveSink {
  return {
    async write(unit: SaveUnit): Promise<void> {
      if (!gate.canWrite()) {
        throw new Error(`SaveRecoveryMatrix: storage gate blocks writes (${unit.key})`);
      }
      await inner.write(unit);
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Internal test doubles (deterministic, time-stable)
// ────────────────────────────────────────────────────────────────────────────

/** A probe whose outcomes are a scripted list (null = success, else error to throw). */
class ScriptedProbe implements StorageProbe {
  private readonly outcomes: Array<unknown | null>;
  private index = 0;

  constructor(outcomes: Array<unknown | null>) {
    this.outcomes = outcomes;
  }

  async probe(): Promise<void> {
    const outcome = this.index < this.outcomes.length ? this.outcomes[this.index++] : null;
    if (outcome !== null && outcome !== undefined) throw outcome;
  }
}

/** A timer double that counts active intervals (039 test seam). */
class CountingTimer implements TimerLike {
  private active = 0;
  setInterval(): unknown {
    this.active++;
    return this.active;
  }
  clearInterval(): void {
    this.active = Math.max(0, this.active - 1);
  }
  get count(): number {
    return this.active;
  }
}

/** An event-target double that counts registrations per type (039 test seam). */
class CountingTarget implements EventTargetLike {
  private readonly counts = new Map<string, number>();
  addEventListener(type: string): void {
    this.counts.set(type, (this.counts.get(type) ?? 0) + 1);
  }
  removeEventListener(type: string): void {
    this.counts.set(type, Math.max(0, (this.counts.get(type) ?? 0) - 1));
  }
  count(type: string): number {
    return this.counts.get(type) ?? 0;
  }
  get total(): number {
    let total = 0;
    for (const n of this.counts.values()) total += n;
    return total;
  }
}

/** A sink that always resolves (for lifecycle/timer-count scenarios). */
const NOOP_SINK: SaveSink = {
  async write(): Promise<void> {
    /* no-op */
  },
};

/** An identity codec for driving 234's `ServerSaveLifecycle` over in-memory repositories. */
function createIdentityCodec(): WorldSaveCodec {
  return {
    encode(unit: ServerWorldUnit): unknown {
      return unit.value;
    },
    decode(payload: unknown, meta: WorldCodecMeta): ServerWorldUnit {
      return { kind: meta.kind, worldId: meta.worldId, chunkX: meta.chunkX, chunkZ: meta.chunkZ, value: payload };
    },
  };
}

/** Build a `SaveLoadBoundary` over real 034-040 repositories (234's production seam). */
function boundaryOver(deps: WorldArchiverDeps): SaveLoadBoundary {
  return {
    async readWorld(worldId: string) {
      const metadata = await deps.metadata.getMetadata(worldId);
      const playerState = await deps.playerStates.getPlayerState(worldId);
      const columns = await deps.chunkSections.listColumns(worldId);
      const blockEntityChunks = await deps.blockEntities.listChunks(worldId);
      const entityChunks = await deps.entities.listChunks(worldId);
      if (
        metadata === null &&
        playerState === null &&
        columns.length === 0 &&
        blockEntityChunks.length === 0 &&
        entityChunks.length === 0
      ) {
        return null;
      }
      return { metadata, playerState, columns, blockEntityChunks, entityChunks };
    },
    async write(unit: SaveUnit): Promise<void> {
      await new RepositorySaveSink(deps).write(unit);
    },
    async writePlayerState(record: PlayerStateRecord): Promise<void> {
      await deps.playerStates.putPlayerState(record);
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Assertion helpers
// ────────────────────────────────────────────────────────────────────────────

function assertThat(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

/** Resolve `true` if `fn` rejects; `false` if it resolves. */
async function rejects(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

/** Assert `fn` throws a `DataMigrationError` of exactly `kind`. */
function assertChainError(fn: () => void, kind: DataMigrationErrorKind): void {
  try {
    fn();
  } catch (err) {
    if (err instanceof DataMigrationError) {
      if (err.kind !== kind) {
        throw new Error(`expected DataMigrationError kind '${kind}', got '${err.kind}'`);
      }
      return;
    }
    throw err;
  }
  throw new Error(`expected DataMigrationError '${kind}', but no error was thrown`);
}

/** Run one scenario; a thrown assertion becomes a `fail` result with the message as `detail`. */
async function runScenario(
  id: string,
  axis: RecoveryAxis,
  run: () => Promise<string>,
): Promise<RecoveryResult> {
  try {
    const detail = await run();
    return { scenarioId: id, axis, outcome: 'pass', detail };
  } catch (err) {
    return {
      scenarioId: id,
      axis,
      outcome: 'fail',
      detail: `${id}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Matrix
// ────────────────────────────────────────────────────────────────────────────

/**
 * Headless, deterministic save-recovery matrix. Each public `run*` method executes the scenarios for one
 * axis over fresh fixtures and returns per-scenario results; `runAll()` runs all five axes in a fixed order
 * and reports `allPass`. A failing scenario is always reported (with `detail`), never swallowed.
 */
export class SaveRecoveryMatrix {
  private readonly makeRepositories: () => SaveRecoveryFixture;
  private readonly makeCoordinator: (queue: DirtySaveQueue, sink: SaveSink) => AutosaveCoordinator;

  constructor(deps: SaveRecoveryMatrixDeps) {
    if (typeof deps.makeRepositories !== 'function') {
      throw new Error('SaveRecoveryMatrix: makeRepositories must be a function');
    }
    if (typeof deps.makeCoordinator !== 'function') {
      throw new Error('SaveRecoveryMatrix: makeCoordinator must be a function');
    }
    this.makeRepositories = deps.makeRepositories;
    this.makeCoordinator = deps.makeCoordinator;
  }

  /** Run every axis scenario in the fixed order and report the combined result. */
  async runAll(): Promise<RecoveryMatrixReport> {
    const results: RecoveryResult[] = [
      ...(await this.runAbruptClose()),
      ...(await this.runPartialWrite()),
      ...(await this.runMigration()),
      ...(await this.runQuota()),
      ...(await this.runImportExport()),
    ];
    const allPass = results.every((r) => r.outcome === 'pass');
    return { results, allPass, deterministic: true };
  }

  /** Abrupt-close axis: acknowledged writes survive, no partial records, graceful/pagehide flush, lifecycle. */
  async runAbruptClose(): Promise<RecoveryResult[]> {
    const axis: RecoveryAxis = 'abrupt-close';
    return [
      await runScenario('abrupt-close.drain-then-kill', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        const queue = new DirtySaveQueue();
        const sink = new RepositorySaveSink(fixture.deps);
        const coord = this.makeCoordinator(queue, sink);
        for (let i = 0; i < 5; i++) coord.markDirty(this.metadataUnit(`w${i}`));
        const w1 = await coord.tick();
        const w2 = await coord.tick();
        coord.stop(); // abrupt close: NO flush()
        const reopened = fixture.reopen();
        await reopened.openAll();
        let present = 0;
        let absent = 0;
        for (let i = 0; i < 5; i++) {
          const rec = await reopened.deps.metadata.getMetadata(`w${i}`);
          if (rec !== null) present++;
          else absent++;
        }
        assertThat(
          w1 + w2 === 4 && present === 4 && absent === 1,
          `expected 4 acknowledged writes (${w1}+${w2}), found ${present} present / ${absent} absent after reopen`,
        );
        return `acknowledged=${w1 + w2} persisted=${present} absent=${absent}`;
      }),

      await runScenario('abrupt-close.no-partial-on-kill', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        const queue = new DirtySaveQueue();
        const sink = new RepositorySaveSink(fixture.deps);
        const coord = this.makeCoordinator(queue, sink);
        coord.markDirty(this.metadataUnit('kill-w'));
        coord.stop(); // killed before any drain
        const reopened = fixture.reopen();
        await reopened.openAll();
        const rec = await reopened.deps.metadata.getMetadata('kill-w');
        assertThat(rec === null, 'pending-at-kill unit was partially persisted');
        return 'pending-at-kill record absent after reopen';
      }),

      await runScenario('abrupt-close.pagehide-flush', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        const queue = new DirtySaveQueue();
        const sink = new RepositorySaveSink(fixture.deps);
        const coord = this.makeCoordinator(queue, sink);
        for (let i = 0; i < 5; i++) coord.markDirty(this.metadataUnit(`g${i}`));
        const written = await coord.flush(); // the pagehide flush path
        coord.stop();
        const reopened = fixture.reopen();
        await reopened.openAll();
        let present = 0;
        for (let i = 0; i < 5; i++) {
          const rec = await reopened.deps.metadata.getMetadata(`g${i}`);
          if (rec !== null) present++;
        }
        assertThat(written === 5 && present === 5, `expected 5 written/present, got written=${written} present=${present}`);
        return `written=${written} persisted=${present}`;
      }),

      await runScenario('abrupt-close.stuck-flush', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        const queue = new DirtySaveQueue();
        const realSink = new RepositorySaveSink(fixture.deps);
        const sink = createFaultySaveSink({ sink: realSink, failKeys: ['bad'] });
        const coord = this.makeCoordinator(queue, sink);
        coord.markDirty(this.columnUnit('w', 'a', 1, 2));
        coord.markDirty(this.columnUnit('w', 'b', 3, 4));
        coord.markDirty(this.columnUnit('w', 'c', 5, 6));
        coord.markDirty(this.columnUnit('w', 'bad', 7, 8));
        const written = await coord.flush();
        coord.stop();
        assertThat(
          written === 3 && coord.size === 1 && queue.has('bad'),
          `stuck flush: expected 3 written and 'bad' pending, got written=${written} pending=${coord.size}`,
        );
        return `written=${written} pending=${coord.size}`;
      }),

      await runScenario('abrupt-close.lifecycle-clean', axis, async () => {
        const timer = new CountingTimer();
        const target = new CountingTarget();
        const queue = new DirtySaveQueue();
        const coord = new AutosaveCoordinator({
          queue,
          sink: NOOP_SINK,
          intervalMs: 1000,
          timer,
          flushTarget: target,
        });
        coord.start();
        coord.start(); // idempotent
        assertThat(timer.count === 1, `expected 1 interval, got ${timer.count}`);
        assertThat(
          target.count('pagehide') === 1 && target.count('visibilitychange') === 1,
          `expected one listener per event, got pagehide=${target.count('pagehide')} visibilitychange=${target.count('visibilitychange')}`,
        );
        coord.stop();
        assertThat(timer.count === 0 && target.total === 0, 'expected zero timers/listeners after stop');
        coord.markDirty(this.metadataUnit('rearm')); // wake-on-dirty re-arms
        assertThat(timer.count === 1, 'expected re-arm after markDirty');
        coord.stop();
        return `interval=1 listeners=pagehide:1,visibilitychange:1 stop=0 rearm=1`;
      }),

      await runScenario('abrupt-close.server-save-lifecycle', axis, async () => {
        // Change 234 reconciliation: a server-owned save must also survive abrupt termination.
        const fixture = this.makeRepositories();
        await fixture.openAll();
        const codec = createIdentityCodec();
        const gate = { canWrite: (): boolean => true };
        const l1 = new ServerSaveLifecycle({
          codec,
          boundary: boundaryOver(fixture.deps),
          storageGate: gate,
          autosaveEveryTicks: 1,
          limitPerDrain: 2,
        });
        const created = await l1.load('world-srv', () => undefined);
        assertThat(created.outcome === 'created', `expected created, got ${created.outcome}`);
        l1.markDirty(this.serverMetadataUnit('world-srv'));
        l1.markDirty(this.serverColumnUnit('world-srv', 1, 2));
        l1.markDirty(this.serverColumnUnit('world-srv', 3, 4));
        l1.markDirty(this.serverColumnUnit('world-srv', 5, 6));
        l1.tick(1); // drains 2 (metadata + column 1,2)
        await l1.idle();
        // abrupt termination: drop l1 without flush()/saveAndClose()

        const reopened = fixture.reopen();
        await reopened.openAll();
        let restored = 0;
        const l2 = new ServerSaveLifecycle({
          codec,
          boundary: boundaryOver(reopened.deps),
          storageGate: gate,
          autosaveEveryTicks: 1,
          limitPerDrain: 2,
        });
        const loaded = await l2.load('world-srv', () => {
          restored++;
        });
        assertThat(
          loaded.outcome === 'loaded' && loaded.metadata === true && loaded.columns === 1 && restored === 2,
          `expected 2 restored (metadata + 1 column), got outcome=${loaded.outcome} metadata=${loaded.metadata} columns=${loaded.columns} restored=${restored}`,
        );
        return `created; drained=2 restored=${restored} columns=${loaded.columns} pending-at-kill absent`;
      }),
    ];
  }

  /** Partial-write axis: re-queue/retry, invalid-payload rejection, corrupt-read rejection, atomic write. */
  async runPartialWrite(): Promise<RecoveryResult[]> {
    const axis: RecoveryAxis = 'partial-write';
    return [
      await runScenario('partial-write.requeue-retry', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        const queue = new DirtySaveQueue();
        const realSink = new RepositorySaveSink(fixture.deps);
        const faulty = createFaultySaveSink({ sink: realSink, failNextWrites: 1 });
        queue.markDirty(this.columnUnit('w', 'a', 1, 2)); // fails once
        queue.markDirty(this.columnUnit('w', 'b', 3, 4));
        const d1 = await queue.drain(faulty, 10); // writes b, re-queues a
        assertThat(d1 === 1 && queue.size === 1, `expected d1=1 pending=1, got d1=${d1} pending=${queue.size}`);
        const d2 = await queue.drain(faulty, 10); // writes a
        assertThat(d2 === 1 && queue.size === 0, `expected d2=1 pending=0, got d2=${d2} pending=${queue.size}`);
        const cols = await fixture.deps.chunkSections.listColumns('w');
        assertThat(cols.length === 2, `expected 2 columns persisted, got ${cols.length}`);
        return `drain1=1 drain2=1 persisted=2 pending=0`;
      }),

      await runScenario('partial-write.invalid-payload-rejected', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        const sink = new RepositorySaveSink(fixture.deps);
        const bad: SaveUnit = {
          key: 'bad-col',
          kind: 'chunk-sections',
          worldId: 'w',
          chunkX: 1,
          chunkZ: 2,
          payload: { version: 'x', chunkX: 1, chunkZ: 2, sectionCount: 1, minSectionY: 0, sections: {} },
        };
        const rejected = await rejects(() => sink.write(bad));
        assertThat(rejected, 'invalid column payload was not rejected');
        const cols = await fixture.deps.chunkSections.listColumns('w');
        assertThat(cols.length === 0, `store not clean after rejection, found ${cols.length} columns`);
        return 'invalid column rejected; store clean';
      }),

      await runScenario('partial-write.corrupt-read-rejected', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        const corrupt = {
          schemaVersion: 'x',
          worldId: 'corrupt',
          seed: 0,
          dimensionId: 'd',
          minY: -64,
          height: 384,
          createdAt: 0,
          updatedAt: 0,
        };
        await fixture.putRawMetadata(corrupt); // seed a genuinely corrupt stored record
        const raw = await fixture.deps.metadata.getMetadata('corrupt'); // unvalidated passthrough
        assertThat(raw !== null, 'seeded corrupt record was not readable');
        const rejected = await rejects(() => {
          validateWorldMetadata(raw);
          return Promise.resolve();
        });
        assertThat(rejected, 'corrupt stored record was accepted as valid WorldMetadata');
        return 'corrupt stored record rejected by validateWorldMetadata (trusting read path)';
      }),

      await runScenario('partial-write.atomic-per-unit', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        const queue = new DirtySaveQueue();
        const realSink = new RepositorySaveSink(fixture.deps);
        const faulty = createFaultySaveSink({ sink: realSink, failNextWrites: 1 });
        queue.markDirty(this.columnUnit('w', 'x', 1, 2));
        const d = await queue.drain(faulty, 10);
        assertThat(d === 0 && queue.size === 1, `expected no write + pending, got d=${d} pending=${queue.size}`);
        const cols = await fixture.deps.chunkSections.listColumns('w');
        assertThat(cols.length === 0, `partial record persisted, found ${cols.length} columns`);
        return 'rejected column write left no partial record; unit pending';
      }),
    ];
  }

  /** Migration axis: schema upgrades, idempotent reopen, chain refusals, unsupported archive version. */
  async runMigration(): Promise<RecoveryResult[]> {
    const axis: RecoveryAxis = 'migration';
    return [
      await runScenario('migration.schema-upgrade', axis, async () => {
        for (let v = 1; v < WORLD_DB_VERSION; v++) {
          const fixture = this.makeRepositories();
          const migrated = await fixture.upgradeFromSchema(v, `mig-${v}`);
          const meta = await migrated.deps.metadata.getMetadata(`mig-${v}`);
          assertThat(meta !== null, `v${v}: prior metadata lost after upgrade`);
          await this.assertStoresUsable(migrated.deps, `mig-${v}`);
        }
        return `upgraded v1..${WORLD_DB_VERSION - 1} -> v${WORLD_DB_VERSION}; prior data preserved; all stores created`;
      }),

      await runScenario('migration.idempotent', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        await this.populate(fixture.deps, 'idem');
        const reopened = fixture.reopen();
        await reopened.openAll();
        assertThat((await reopened.deps.metadata.getMetadata('idem')) !== null, 'metadata lost on reopen');
        assertThat((await reopened.deps.chunkSections.listColumns('idem')).length === 2, 'columns lost on reopen');
        assertThat((await reopened.deps.blockEntities.listChunks('idem')).length === 1, 'block-entities lost on reopen');
        assertThat((await reopened.deps.entities.listChunks('idem')).length === 1, 'entities lost on reopen');
        assertThat((await reopened.deps.playerStates.getPlayerState('idem')) !== null, 'player state lost on reopen');
        return 'reopen at current version: no data loss, idempotent';
      }),

      await runScenario('migration.chain-refused-register', axis, async () => {
        const chain = new DataMigrationChain<WorldMetadata>(1);
        chain.register({ fromVersion: 1, toVersion: 2, migrate: (r) => r }); // valid
        assertChainError(
          () => chain.register({ fromVersion: 1, toVersion: 2, migrate: (r) => r }),
          'DUPLICATE',
        );
        assertChainError(
          () => chain.register({ fromVersion: 2, toVersion: 4, migrate: (r) => r }),
          'GAP',
        );
        assertChainError(
          () => chain.register({ fromVersion: 3, toVersion: 4, migrate: (r) => r }),
          'GAP',
        );
        assertThat(chain.steps.length === 1, 'invalid step was recorded');
        return 'GAP + DUPLICATE register calls threw; chain unchanged';
      }),

      await runScenario('migration.chain-refused-migrate', axis, async () => {
        const chain = new DataMigrationChain<WorldMetadata>(1);
        chain.register({
          fromVersion: 1,
          toVersion: 2,
          migrate: (r) => ({ ...r, schemaVersion: 2 }),
        });
        assertChainError(
          () => chain.migrate(this.metadataWithVersion(3, 'down'), (r) => r.schemaVersion),
          'DOWNGRADE',
        );
        assertChainError(
          () => chain.migrate(this.metadataWithVersion(0, 'unknown'), (r) => r.schemaVersion),
          'UNKNOWN_VERSION',
        );
        const input = this.metadataWithVersion(1, 'up');
        const result = chain.migrate(input, (r) => r.schemaVersion);
        assertThat(result.record.schemaVersion === 2 && result.appliedSteps.join(',') === '2', 'v1 record did not migrate to v2');
        assertThat(input.schemaVersion === 1, 'input was mutated by migrate');
        return 'DOWNGRADE + UNKNOWN_VERSION threw; input untouched; v1->v2 ok';
      }),

      await runScenario('migration.unsupported-archive-version', axis, async () => {
        const archive = {
          format: 'voxel-world',
          version: 2,
          exportedAt: 0,
          worldId: 'w',
          metadata: null,
          playerState: null,
          columns: [],
          blockEntityChunks: [],
          entityChunks: [],
        } as unknown as WorldArchive;
        const rejected = await rejects(() => {
          validateWorldArchive(archive);
          return Promise.resolve();
        });
        assertThat(rejected, 'unsupported archive version was accepted');
        return 'version-2 archive rejected by validateWorldArchive';
      }),
    ];
  }

  /** Quota axis: classification, transitions/recovery, write gate, pause/resume, listeners/reset. */
  async runQuota(): Promise<RecoveryResult[]> {
    const axis: RecoveryAxis = 'quota';
    return [
      await runScenario('quota.failure-classification', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        const quotaDeps = withStorageFailure(fixture.deps, 'quota');
        const quotaRejected = await rejects(() => quotaDeps.metadata.putMetadata(this.makeMetadata('q')));
        assertThat(quotaRejected, 'quota-injected write did not reject');
        let quotaKind: StorageFailureKind | null = null;
        try {
          await quotaDeps.metadata.putMetadata(this.makeMetadata('q'));
        } catch (e) {
          quotaKind = classifyStorageError(e);
        }
        assertThat(quotaKind === 'quota', `expected kind 'quota', got '${quotaKind}'`);

        const privDeps = withStorageFailure(fixture.deps, 'private-mode');
        let privKind: StorageFailureKind | null = null;
        try {
          await privDeps.metadata.putMetadata(this.makeMetadata('p'));
        } catch (e) {
          privKind = classifyStorageError(e);
        }
        assertThat(privKind === 'private-mode', `expected kind 'private-mode', got '${privKind}'`);
        return `quota->${quotaKind} private-mode->${privKind}`;
      }),

      await runScenario('quota.status-transitions', axis, async () => {
        const probe = new ScriptedProbe([null, makeStorageError('quota'), makeStorageError('quota')]);
        const monitor = new StorageHealthMonitor({ probe });
        const s1 = await monitor.check(); // ok (no failure consumed)
        const s2 = await monitor.check(); // degraded
        const s3 = await monitor.check(); // failed
        const s4 = await monitor.check(); // ok
        assertThat(
          s1 === 'ok' && s2 === 'degraded' && s3 === 'failed' && s4 === 'ok' && monitor.canWrite() && monitor.lastFailure === null,
          `expected ok->degraded->failed->ok, got ${s1}->${s2}->${s3}->${s4}`,
        );
        return `ok->degraded->failed->ok; canWrite=${monitor.canWrite()} lastFailure=null`;
      }),

      await runScenario('quota.write-gate', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        const probe = new ScriptedProbe([makeStorageError('quota'), makeStorageError('quota')]);
        const monitor = new StorageHealthMonitor({ probe });
        await monitor.check();
        await monitor.check(); // failed
        assertThat(monitor.canWrite() === false, 'expected canWrite false in failed');
        const realSink = new RepositorySaveSink(fixture.deps);
        let repoWrites = 0;
        const recording: SaveSink = {
          async write(unit: SaveUnit): Promise<void> {
            repoWrites++;
            await realSink.write(unit);
          },
        };
        const gate = createGatedSaveSink(recording, monitor);
        const queue = new DirtySaveQueue();
        queue.markDirty(this.columnUnit('wg', '0', 1, 2));
        queue.markDirty(this.columnUnit('wg', '1', 3, 4));
        const d = await queue.drain(gate, 10);
        assertThat(d === 0 && queue.size === 2 && repoWrites === 0, `gate failed: d=${d} pending=${queue.size} repoWrites=${repoWrites}`);
        return `drain=0 repoWrites=0 pending=2`;
      }),

      await runScenario('quota.pause-resume', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        const probe = new ScriptedProbe([makeStorageError('quota'), makeStorageError('quota')]);
        const monitor = new StorageHealthMonitor({ probe });
        await monitor.check();
        await monitor.check(); // failed
        const realSink = new RepositorySaveSink(fixture.deps);
        let repoWrites = 0;
        const recording: SaveSink = {
          async write(unit: SaveUnit): Promise<void> {
            repoWrites++;
            await realSink.write(unit);
          },
        };
        const gate = createGatedSaveSink(recording, monitor);
        const queue = new DirtySaveQueue();
        queue.markDirty(this.columnUnit('pr', '0', 1, 2));
        queue.markDirty(this.columnUnit('pr', '1', 3, 4));
        queue.markDirty(this.columnUnit('pr', '2', 5, 6));
        const pre = await queue.drain(gate, 10);
        assertThat(pre === 0 && queue.size === 3 && repoWrites === 0, `pre-recovery drain wrote: pre=${pre} pending=${queue.size} repoWrites=${repoWrites}`);
        await monitor.check(); // 3rd probe succeeds -> ok
        assertThat(monitor.canWrite() === true, 'expected canWrite true after recovery');
        const post = await queue.drain(gate, 10);
        assertThat(post === 3 && queue.size === 0 && repoWrites === 3, `post-recovery drain failed: post=${post} pending=${queue.size} repoWrites=${repoWrites}`);
        const cols = await fixture.deps.chunkSections.listColumns('pr');
        assertThat(cols.length === 3, `expected 3 columns persisted, got ${cols.length}`);
        return `pre=0 (no writes) post=3 persisted=3`;
      }),

      await runScenario('quota.listeners-reset', axis, async () => {
        const probe = new ScriptedProbe([
          null,
          makeStorageError('private-mode'),
          makeStorageError('private-mode'),
          null,
          makeStorageError('private-mode'),
        ]);
        const monitor = new StorageHealthMonitor({ probe });
        const seen: string[] = [];
        const unsubscribe = monitor.onStatusChange((s) => seen.push(s));
        await monitor.check(); // ok (no fire)
        await monitor.check(); // degraded (fire)
        await monitor.check(); // failed (fire)
        await monitor.check(); // ok (fire)
        assertThat(seen.join(',') === 'degraded,failed,ok', `expected fires degraded,failed,ok, got ${seen.join(',')}`);
        unsubscribe();
        await monitor.check(); // degraded, but unsubscribed -> no fire
        assertThat(seen.join(',') === 'degraded,failed,ok', 'unsubscribe did not stop delivery');
        monitor.reset();
        assertThat(monitor.status === 'ok' && monitor.lastFailure === null, 'reset did not restore ok/null');
        return `fires=degraded,failed,ok unsubscribed-ok reset=ok`;
      }),
    ];
  }

  /** Import/export axis: complete export, round-trip stability, atomic rejection, normalization, read-only. */
  async runImportExport(): Promise<RecoveryResult[]> {
    const axis: RecoveryAxis = 'import-export';
    return [
      await runScenario('import-export.export-complete', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        await this.populate(fixture.deps, 'x');
        const archive = await new WorldArchiver(fixture.deps).exportWorld('x');
        assertThat(archive.format === 'voxel-world' && archive.version === 1, 'archive format/version not current');
        assertThat(archive.worldId === 'x', 'archive worldId mismatch');
        assertThat(archive.metadata !== null, 'metadata missing from export');
        assertThat(archive.columns.length === 2, `expected 2 columns, got ${archive.columns.length}`);
        assertThat(archive.blockEntityChunks.length === 1, 'block-entity chunk missing from export');
        assertThat(archive.entityChunks.length === 1, 'entity chunk missing from export');
        assertThat(archive.playerState !== null, 'player state missing from export');
        let validated = false;
        try {
          validateWorldArchive(archive);
          validated = true;
        } catch {
          validated = false;
        }
        assertThat(validated, 'exported archive failed validateWorldArchive');
        return 'metadata=1 columns=2 beChunks=1 eChunks=1 playerState=1 valid=1';
      }),

      await runScenario('import-export.round-trip-stable', axis, async () => {
        const source = this.makeRepositories();
        await source.openAll();
        await this.populate(source.deps, 'x');
        const first = await new WorldArchiver(source.deps).exportWorld('x');
        const target = this.makeRepositories();
        await target.openAll();
        await new WorldArchiver(target.deps).importWorld(first);
        const second = await new WorldArchiver(target.deps).exportWorld('x');
        assertThat(
          JSON.stringify(this.stripArchive(second)) === JSON.stringify(this.stripArchive(first)),
          'round-trip archive unstable after stripping exportedAt/updatedAt',
        );
        assertThat((await target.deps.metadata.getMetadata('x')) !== null, 'metadata not imported');
        assertThat((await target.deps.chunkSections.listColumns('x')).length === 2, 'columns not imported');
        assertThat((await target.deps.blockEntities.listChunks('x')).length === 1, 'block-entities not imported');
        assertThat((await target.deps.entities.listChunks('x')).length === 1, 'entities not imported');
        assertThat((await target.deps.playerStates.getPlayerState('x')) !== null, 'player state not imported');
        return 'round-trip stable (mod timestamps); all 5 stores restored';
      }),

      await runScenario('import-export.atomic-rejection', axis, async () => {
        const source = this.makeRepositories();
        await source.openAll();
        await this.populate(source.deps, 'x');
        const exported = await new WorldArchiver(source.deps).exportWorld('x');
        const corruptions: WorldArchive[] = [
          { ...exported, format: 'nope' } as unknown as WorldArchive,
          { ...exported, columns: [{ ...exported.columns[0]!, version: 'x' }] } as unknown as WorldArchive,
          { ...exported, playerState: { ...exported.playerState!, position: [1, 2] } } as unknown as WorldArchive,
        ];
        for (let i = 0; i < corruptions.length; i++) {
          const target = this.makeRepositories();
          await target.openAll();
          const rejected = await rejects(() => new WorldArchiver(target.deps).importWorld(corruptions[i]!));
          assertThat(rejected, `corruption #${i} was not rejected`);
          assertThat((await target.deps.metadata.listMetadata()).length === 0, `metadata polluted by corruption #${i}`);
          assertThat((await target.deps.chunkSections.listColumns('x')).length === 0, `columns polluted by corruption #${i}`);
          assertThat((await target.deps.blockEntities.listChunks('x')).length === 0, `block-entities polluted by corruption #${i}`);
          assertThat((await target.deps.entities.listChunks('x')).length === 0, `entities polluted by corruption #${i}`);
          assertThat((await target.deps.playerStates.listPlayerStates()).length === 0, `player-state polluted by corruption #${i}`);
        }
        return 'format/column/player-state corruptions each rejected; all 5 stores empty';
      }),

      await runScenario('import-export.worldid-normalization', axis, async () => {
        const source = this.makeRepositories();
        await source.openAll();
        await this.populate(source.deps, 'x');
        const exported = await new WorldArchiver(source.deps).exportWorld('x');
        const tampered: WorldArchive = {
          ...exported,
          playerState: { ...exported.playerState!, key: 'other', worldId: 'other' },
        };
        const target = this.makeRepositories();
        await target.openAll();
        await new WorldArchiver(target.deps).importWorld(tampered);
        assertThat((await target.deps.playerStates.getPlayerState('x')) !== null, 'player state not under archive worldId');
        assertThat((await target.deps.playerStates.getPlayerState('other')) === null, 'player state leaked under mismatched key');
        return 'playerState.worldId normalized to archive worldId; no mismatch leak';
      }),

      await runScenario('import-export.export-read-only', axis, async () => {
        const fixture = this.makeRepositories();
        await fixture.openAll();
        await this.populate(fixture.deps, 'x');
        const metaCount = (await fixture.deps.metadata.listMetadata()).length;
        const colCount = (await fixture.deps.chunkSections.listColumns('x')).length;
        const beCount = (await fixture.deps.blockEntities.listChunks('x')).length;
        const eCount = (await fixture.deps.entities.listChunks('x')).length;
        const psCount = (await fixture.deps.playerStates.listPlayerStates()).length;
        await new WorldArchiver(fixture.deps).exportWorld('x');
        await new WorldArchiver(fixture.deps).exportWorld('x');
        assertThat((await fixture.deps.metadata.listMetadata()).length === metaCount, 'metadata mutated by export');
        assertThat((await fixture.deps.chunkSections.listColumns('x')).length === colCount, 'columns mutated by export');
        assertThat((await fixture.deps.blockEntities.listChunks('x')).length === beCount, 'block-entities mutated by export');
        assertThat((await fixture.deps.entities.listChunks('x')).length === eCount, 'entities mutated by export');
        assertThat((await fixture.deps.playerStates.listPlayerStates()).length === psCount, 'player-state mutated by export');
        return 'two exports left all 5 stores unchanged';
      }),
    ];
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Fixture / record helpers
  // ────────────────────────────────────────────────────────────────────────────

  private makeMetadata(worldId: string): WorldMetadata {
    return {
      schemaVersion: 1,
      worldId,
      seed: 0,
      dimensionId: 'minecraft:overworld',
      minY: -64,
      height: 384,
      createdAt: 1,
      updatedAt: 1,
    };
  }

  private metadataWithVersion(version: number, worldId: string): WorldMetadata {
    return { ...this.makeMetadata(worldId), schemaVersion: version };
  }

  private makeColumn(cx: number, cz: number): SerializedChunkColumn {
    return {
      version: 1,
      chunkX: cx,
      chunkZ: cz,
      sectionCount: 1,
      minSectionY: 0,
      sections: { 0: { version: 1, capacity: 4096, bitsPerEntry: 4, palette: [0, 1], storage: [0] } },
    };
  }

  private makePlayerState(worldId: string): PlayerStateRecord {
    return {
      key: worldId,
      worldId,
      seed: 0,
      position: [0, 64, 0],
      yaw: 0,
      pitch: 0,
      inventory: {},
      survival: {},
      experience: {},
    };
  }

  private makeBlockEntity(): SerializedBlockEntity {
    return { schemaVersion: 1, typeKey: 'minecraft:chest', x: 16, y: 64, z: 32, data: { items: [] } };
  }

  private makeEntity(): SerializedEntity {
    return { schemaVersion: 1, typeKey: 'minecraft:zombie', x: 16, y: 65, z: 32, data: { health: 20 } };
  }

  private metadataUnit(worldId: string): SaveUnit {
    return {
      key: `world-metadata|${worldId}|0|0`,
      kind: 'world-metadata',
      worldId,
      chunkX: 0,
      chunkZ: 0,
      payload: this.makeMetadata(worldId),
    };
  }

  private columnUnit(worldId: string, key: string, cx: number, cz: number): SaveUnit {
    return {
      key,
      kind: 'chunk-sections',
      worldId,
      chunkX: cx,
      chunkZ: cz,
      payload: this.makeColumn(cx, cz),
    };
  }

  private serverMetadataUnit(worldId: string): ServerWorldUnit {
    return { kind: 'world-metadata', worldId, chunkX: 0, chunkZ: 0, value: this.makeMetadata(worldId) };
  }

  private serverColumnUnit(worldId: string, cx: number, cz: number): ServerWorldUnit {
    return { kind: 'chunk-sections', worldId, chunkX: cx, chunkZ: cz, value: this.makeColumn(cx, cz) };
  }

  /** Write one record to every store for `worldId` (a fully populated world). */
  private async populate(deps: WorldArchiverDeps, worldId: string): Promise<void> {
    await deps.metadata.putMetadata(this.makeMetadata(worldId));
    await deps.chunkSections.putColumn(worldId, this.makeColumn(1, 2));
    await deps.chunkSections.putColumn(worldId, this.makeColumn(3, 4));
    await deps.blockEntities.putChunkEntities(worldId, 1, 2, [this.makeBlockEntity()]);
    await deps.entities.putChunkEntities(worldId, 1, 2, [this.makeEntity()]);
    await deps.playerStates.putPlayerState(this.makePlayerState(worldId));
  }

  /** Assert every store can be written and read (proves the store exists and is usable). */
  private async assertStoresUsable(deps: WorldArchiverDeps, worldId: string): Promise<void> {
    await deps.chunkSections.putColumn(worldId, this.makeColumn(9, 9));
    const col = await deps.chunkSections.getColumn(worldId, 9, 9);
    assertThat(col !== null, 'chunk-sections store unusable');
    await deps.blockEntities.putChunkEntities(worldId, 9, 9, []);
    const be = await deps.blockEntities.getChunkEntities(worldId, 9, 9);
    assertThat(be !== null, 'block-entities store unusable');
    await deps.entities.putChunkEntities(worldId, 9, 9, []);
    const en = await deps.entities.getChunkEntities(worldId, 9, 9);
    assertThat(en !== null, 'entities store unusable');
    await deps.playerStates.putPlayerState(this.makePlayerState(worldId));
    const ps = await deps.playerStates.getPlayerState(worldId);
    assertThat(ps !== null, 'player-state store unusable');
  }

  private stripArchive(archive: WorldArchive): WorldArchive {
    return {
      ...archive,
      exportedAt: 0,
      metadata: archive.metadata ? { ...archive.metadata, updatedAt: 0 } : null,
    };
  }
}
