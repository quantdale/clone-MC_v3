/**
 * Live block-entity host (251). Owns the single authoritative runtime store for
 * furnaces placed in the playable world and adapts the verified headless stack —
 * the 052 manager, the 109/110 furnace engine, and the 036 persistence envelope —
 * to the Game lifecycle.
 *
 * Guarantees:
 * - Exactly one `BlockEntityInstance` per position; every view (menu UI, save
 *   payload) derives from its payload and is written back atomically.
 * - Ticking follows the project simulation policy: only chunks reporting
 *   `isChunkSimulating` advance, one canonical tick per fixed tick, so pause,
 *   loading, and render frame rate can never alter smelting speed.
 * - Persistence flows through full-snapshot `block-entities` dirty units keyed
 *   per chunk; a chunk is flushed whenever its content changes and eagerly on
 *   deactivation, so an edit racing an in-flight write keeps the newer snapshot
 *   and a crash after unload loses nothing already simulated.
 * - Stale records (block no longer a furnace) are removed lazily at first tick
 *   in a simulating chunk; malformed payloads are quarantined at hydration with
 *   a visible warning instead of crashing boot.
 */
import { SECTION_SIZE } from '../math/SectionCoordinate';
import { BlockEntityManager } from '../simulation/BlockEntityManager';
import type { SerializedBlockEntity } from '../storage/BlockEntityRecord';
import {
  FURNACE_BLOCK_ID,
  FURNACE_TYPE_KEY,
  createFurnaceBlockEntity,
  createFurnaceState,
  deserializeFurnaceState,
  readFurnaceState,
  tickFurnace,
  updateFurnaceState,
  type FurnaceContext,
  type FurnaceState,
} from '../world/FurnaceBlockEntity';

/** Minimal world surface the host needs (kept narrow for testability). */
export interface HostWorldView {
  /** Whether the chunk containing these world coordinates is simulating. */
  isChunkSimulating(cx: number, cz: number): boolean;
  /** Current block id at world coordinates (air/unloaded reads as non-furnace). */
  getBlock(x: number, y: number, z: number): number;
}

export interface LiveBlockEntityHostDeps {
  world: HostWorldView;
  /** May be null (memory-only play); the game still runs without durability. */
  persistence: {
    saveBlockEntities(cx: number, cz: number, entities: SerializedBlockEntity[]): void;
  } | null;
  furnaceContext: FurnaceContext;
  onQuarantined?: (message: string) => void;
}

function chunkCoords(x: number, z: number): { cx: number; cz: number } {
  return { cx: Math.floor(x / SECTION_SIZE), cz: Math.floor(z / SECTION_SIZE) };
}

function furnaceStateEquals(a: FurnaceState, b: FurnaceState): boolean {
  const slotEquals = (x: FurnaceState['input'], y: FurnaceState['input']) =>
    x.item === y.item && x.count === y.count;
  return (
    slotEquals(a.input, b.input) &&
    slotEquals(a.fuel, b.fuel) &&
    slotEquals(a.output, b.output) &&
    a.burnTime === b.burnTime &&
    a.burnTimeTotal === b.burnTimeTotal &&
    a.smeltTime === b.smeltTime &&
    a.smeltTimeTotal === b.smeltTimeTotal &&
    a.xp === b.xp
  );
}

export class LiveBlockEntityHost {
  private readonly manager = new BlockEntityManager();
  private readonly world: HostWorldView;
  private readonly persistence: LiveBlockEntityHostDeps['persistence'];
  private readonly furnaceContext: FurnaceContext;
  private readonly onQuarantined?: (message: string) => void;

  constructor(deps: LiveBlockEntityHostDeps) {
    this.world = deps.world;
    this.persistence = deps.persistence;
    this.furnaceContext = deps.furnaceContext;
    this.onQuarantined = deps.onQuarantined;
  }

  // ── Composition ────────────────────────────────────────────────────────────

  /** Register a freshly placed furnace. Returns false when the spot is taken. */
  placeFurnace(x: number, y: number, z: number): boolean {
    const added = this.manager.add(createFurnaceBlockEntity(x, y, z));
    if (added) {
      const { cx, cz } = chunkCoords(x, z);
      this.persistChunk(cx, cz);
    }
    return added;
  }

  /**
   * Remove the furnace at `(x, y, z)` exactly once, returning its final state so
   * the caller can drop contents. Null when no instance exists there.
   */
  removeFurnace(x: number, y: number, z: number): FurnaceState | null {
    const instance = this.manager.get(x, y, z);
    if (!instance || instance.typeKey !== FURNACE_TYPE_KEY) return null;
    let state: FurnaceState;
    try {
      state = readFurnaceState(instance);
    } catch {
      state = createFurnaceState();
    }
    this.manager.remove(x, y, z);
    const { cx, cz } = chunkCoords(x, z);
    this.persistChunk(cx, cz);
    return state;
  }

  has(x: number, y: number, z: number): boolean {
    const instance = this.manager.get(x, y, z);
    return instance !== null && instance.typeKey === FURNACE_TYPE_KEY;
  }

  /** Read-only view of the authoritative state, or null when absent/corrupt. */
  getFurnaceState(x: number, y: number, z: number): FurnaceState | null {
    const instance = this.manager.get(x, y, z);
    if (!instance || instance.typeKey !== FURNACE_TYPE_KEY) return null;
    try {
      return readFurnaceState(instance);
    } catch {
      return null;
    }
  }

  /**
   * Atomically write menu-derived slots back into the authoritative state.
   * Returns the new state, or null when no live furnace exists at the position.
   */
  applyMenuSlots(
    x: number,
    y: number,
    z: number,
    slots: { input: FurnaceState['input']; fuel: FurnaceState['fuel']; output: FurnaceState['output'] },
  ): FurnaceState | null {
    const instance = this.manager.get(x, y, z);
    if (!instance || instance.typeKey !== FURNACE_TYPE_KEY) return null;
    try {
      const current = readFurnaceState(instance);
      const next = updateFurnaceState(instance, { ...current, ...slots });
      this.manager.replace(next);
      const { cx, cz } = chunkCoords(x, z);
      this.persistChunk(cx, cz);
      return readFurnaceState(next);
    } catch {
      // A rejected write leaves the authoritative state untouched.
      return null;
    }
  }

  /**
   * Drain the integer floor of accumulated experience (110 vanilla-style
   * fractional carry) and persist the remainder. Returns the drained amount.
   */
  takeExperience(x: number, y: number, z: number): number {
    const instance = this.manager.get(x, y, z);
    if (!instance || instance.typeKey !== FURNACE_TYPE_KEY) return 0;
    try {
      const current = readFurnaceState(instance);
      const taken = Math.floor(current.xp);
      if (!(taken > 0)) return 0;
      const next = updateFurnaceState(instance, { ...current, xp: current.xp - taken });
      this.manager.replace(next);
      const { cx, cz } = chunkCoords(x, z);
      this.persistChunk(cx, cz);
      return taken;
    } catch {
      return 0;
    }
  }

  // ── Hydration ──────────────────────────────────────────────────────────────

  /**
   * Restore persisted records into the runtime store before the first frame.
   * Malformed payloads are quarantined (skipped + warned), never fatal. Staleness
   * (block no longer a furnace) cannot be judged before chunks generate, so it is
   * handled lazily by {@link tickFurnaces}. Idempotent per position.
   */
  hydrate(records: ReadonlyArray<SerializedBlockEntity>): { hydrated: number; quarantined: number } {
    let hydrated = 0;
    let quarantined = 0;
    for (const record of records) {
      if (record.typeKey !== FURNACE_TYPE_KEY) continue;
      if (this.manager.get(record.x, record.y, record.z)) continue;
      try {
        const state = deserializeFurnaceState(record.data);
        this.manager.add(createFurnaceBlockEntity(record.x, record.y, record.z, state));
        hydrated++;
      } catch (err) {
        quarantined++;
        this.onQuarantined?.(
          `block-entity record at ${record.x},${record.y},${record.z} failed validation and was skipped`,
        );
        if (this.onQuarantined === undefined) {
          console.warn(`[voxel] furnace record at ${record.x},${record.y},${record.z} was corrupt and was skipped`, err);
        }
      }
    }
    return { hydrated, quarantined };
  }

  // ── Fixed-tick simulation ──────────────────────────────────────────────────

  /**
   * Advance every furnace in a simulating chunk by one canonical tick. Returns
   * the number of furnaces whose observable state changed. A furnace whose block
   * vanished (stale record) is removed lazily here.
   */
  tickFurnaces(): number {
    let changed = 0;
    const dirtyChunks = new Set<string>();
    for (const instance of this.manager.all()) {
      if (instance.typeKey !== FURNACE_TYPE_KEY) continue;
      const { cx, cz } = chunkCoords(instance.x, instance.z);
      if (!this.world.isChunkSimulating(cx, cz)) continue;

      // Lazy staleness cleanup: once the chunk actually simulates we can trust
      // the block query; a missing furnace block invalidates the record.
      if (this.world.getBlock(instance.x, instance.y, instance.z) !== FURNACE_BLOCK_ID) {
        this.manager.remove(instance.x, instance.y, instance.z);
        dirtyChunks.add(`${cx},${cz}`);
        continue;
      }

      let current: FurnaceState;
      try {
        current = readFurnaceState(instance);
      } catch {
        // Corrupt runtime payload (should not happen): drop the instance rather
        // than ticking garbage forever.
        this.manager.remove(instance.x, instance.y, instance.z);
        dirtyChunks.add(`${cx},${cz}`);
        continue;
      }
      const next = tickFurnace(current, this.furnaceContext, 1);
      if (!furnaceStateEquals(current, next)) {
        this.manager.replace(updateFurnaceState(instance, next));
        changed++;
        dirtyChunks.add(`${cx},${cz}`);
      }
    }
    for (const key of dirtyChunks) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      this.persistChunk(cx, cz);
    }
    return changed;
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  /** Serialize one chunk's instances into the 036 envelope. */
  serializeChunkForSave(cx: number, cz: number): SerializedBlockEntity[] {
    return this.manager.serializeChunk(cx, cz);
  }

  /** Number of live instances (observability/tests). */
  get size(): number {
    return this.manager.size;
  }

  /**
   * Flush a chunk's snapshot now (chunk deactivation / explicit checkpoint).
   * Safe to call when nothing is resident: an empty snapshot overwrites any
   * stale persisted rows for that chunk.
   */
  persistChunk(cx: number, cz: number): void {
    this.persistence?.saveBlockEntities(cx, cz, this.serializeChunkForSave(cx, cz));
  }
}
