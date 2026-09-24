/**
 * Injectable raid wave entity backend (284): the port Game uses to spawn and
 * despawn wave raider entities without hard-coding `EntityManager`.
 *
 * - `createRecordingRaidBackend` — headless CI fake with spawn/despawn logs,
 *   optional `failSpawnAfter` partial-failure injection, and idempotent
 *   despawn (second call is a no-op, never throws).
 * - `createEntityManagerRaidBackend` — production adapter over an
 *   `EntityRegistry` + `EntityManager`; refuses unregistered `typeKey`s
 *   before any spawn insert.
 *
 * Zero coupling to `RaidStateMachine` / Game; pure port + adapters.
 */
import type { EntityRegistry } from '../data/EntityType';
import type { ResourceId } from '../data/ResourceId';
import type { EntityManager } from './EntityManager';

/** One spawn request for a wave raider entity. */
export interface RaidSpawnRequest {
  readonly typeKey: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly waveIndex: number;
  readonly raidGeneration: number;
}

/** Stable handle for a spawned wave entity. */
export interface RaidEntityHandle {
  readonly entityId: number;
  readonly typeKey: string;
  readonly waveIndex: number;
  readonly raidGeneration: number;
}

/** Port Game depends on for wave entity I/O. */
export interface RaidEntityBackend {
  /** Spawn one entity; throws on hard backend failure (unknown key, manager reject). */
  spawn(req: RaidSpawnRequest): RaidEntityHandle;
  /** Idempotent despawn: unknown/already-removed handles are no-ops. */
  despawn(handle: RaidEntityHandle): void;
  /** Whether the handle still refers to a live entity. */
  isAlive(handle: RaidEntityHandle): boolean;
}

/** Options for {@link createRecordingRaidBackend}. */
export interface RecordingRaidBackendOptions {
  /** Successful spawns allowed before subsequent spawns throw (partial-failure tests). */
  failSpawnAfter?: number;
  /** Type keys the fake refuses to spawn (unknown-key tests without a registry). */
  unknownKeys?: readonly string[];
}

/** Recording fake plus the public spawn/despawn logs for assertions. */
export interface RecordingRaidBackend extends RaidEntityBackend {
  readonly spawns: readonly RaidSpawnRequest[];
  readonly despawns: readonly RaidEntityHandle[];
}

/**
 * Headless recording backend. Spawn ids are dense and start at 1. Despawn is
 * idempotent: only the first effective removal is logged; repeats never throw.
 */
export function createRecordingRaidBackend(
  opts: RecordingRaidBackendOptions = {},
): RecordingRaidBackend {
  const spawns: RaidSpawnRequest[] = [];
  const despawns: RaidEntityHandle[] = [];
  const live = new Set<number>();
  let nextId = 1;
  const unknown = new Set(opts.unknownKeys ?? []);
  const failAfter = opts.failSpawnAfter;

  return {
    get spawns(): readonly RaidSpawnRequest[] {
      return spawns;
    },
    get despawns(): readonly RaidEntityHandle[] {
      return despawns;
    },
    spawn(req: RaidSpawnRequest): RaidEntityHandle {
      if (unknown.has(req.typeKey)) {
        throw new Error(`RaidEntityBackend: unknown typeKey ${req.typeKey}`);
      }
      if (failAfter !== undefined && spawns.length >= failAfter) {
        throw new Error(`RaidEntityBackend: injected spawn failure after ${failAfter}`);
      }
      const handle: RaidEntityHandle = {
        entityId: nextId++,
        typeKey: req.typeKey,
        waveIndex: req.waveIndex,
        raidGeneration: req.raidGeneration,
      };
      spawns.push(req);
      live.add(handle.entityId);
      return handle;
    },
    despawn(handle: RaidEntityHandle): void {
      if (!live.has(handle.entityId)) return;
      live.delete(handle.entityId);
      despawns.push(handle);
    },
    isAlive(handle: RaidEntityHandle): boolean {
      return live.has(handle.entityId);
    },
  };
}

/** Construction options for the production {@link EntityManager} adapter. */
export interface EntityManagerRaidBackendOptions {
  readonly manager: EntityManager;
  readonly registry: EntityRegistry;
  readonly dimension: ResourceId;
}

/**
 * Production adapter: resolves `typeKey` via the registry (throws for unknown
 * keys before touching the manager) and spawns/removes in a dedicated
 * `EntityManager`. Despawn maps to idempotent `manager.remove`.
 */
export function createEntityManagerRaidBackend(
  opts: EntityManagerRaidBackendOptions,
): RaidEntityBackend {
  const { manager, registry, dimension } = opts;
  return {
    spawn(req: RaidSpawnRequest): RaidEntityHandle {
      const def = registry.getByKey(req.typeKey);
      if (!def) {
        throw new Error(`RaidEntityBackend: unknown typeKey ${req.typeKey}`);
      }
      const instance = manager.spawn(def.id, dimension, {
        x: req.x,
        y: req.y,
        z: req.z,
        yaw: req.yaw,
        pitch: 0,
      });
      return {
        entityId: instance.id,
        typeKey: req.typeKey,
        waveIndex: req.waveIndex,
        raidGeneration: req.raidGeneration,
      };
    },
    despawn(handle: RaidEntityHandle): void {
      manager.remove(handle.entityId);
    },
    isAlive(handle: RaidEntityHandle): boolean {
      return manager.get(handle.entityId)?.state === 'ACTIVE';
    },
  };
}
