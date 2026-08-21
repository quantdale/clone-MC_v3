import * as THREE from 'three';
import { CONFIG } from '../config';
import { BlockId, BlockRegistry } from './BlockRegistry';
import {
  BlockState,
  BlockStateId,
  BlockStateRegistry,
  createDefaultBlockStateRegistry,
} from './BlockStateRegistry';
import { DimensionType } from '../data/DimensionType';
import { Chunk, ChunkState } from './Chunk';
import { ChunkManager } from './ChunkManager';
import type { ChunkMesher } from './ChunkMesher';
import type { TerrainGenerator } from './TerrainGenerator';
import type { WorldStats } from './MeshingTypes';
import type { WorldAccess } from './WorldAccess';
import { RenderSimulationDistance } from './RenderSimulationDistance';
import {
  CHUNK_BLOCK_COUNT,
  CHUNK_DIMENSIONS,
  chunkKey,
  keyToChunk,
  localIndex,
  worldToChunk,
  worldToLocal,
} from './WorldCoordinates';

/** A queued generation job. */
interface GenJob {
  key: string;
  cx: number;
  cy: number;
  cz: number;
}

/** A queued meshing job; carries the meshVersion captured at queue time. */
interface MeshJob {
  key: string;
  cx: number;
  cy: number;
  cz: number;
  version: number;
}

/** Portable representation of player edits for localStorage or a save file. */
export interface WorldEditSnapshot {
  version: 1;
  seed: number;
  edits: Array<{
    chunk: [number, number, number];
    changes: Array<[number, number]>;
  }>;
}

/**
 * Durable-ownership seam for player edits (DIRTY-1..5). Implementations own the
 * authoritative copy of unsaved edits; World's edit overlay is only a resident
 * cache capped at {@link World.EDIT_OVERLAY_MAX_CHUNKS} entries.
 */
export interface WorldEditDurability {
  /** Called after every committed overlay mutation for the chunk (full latest changes). */
  captureChunkEdits(cx: number, cy: number, cz: number, changes: ReadonlyMap<number, number>): void;
  /** Called just before the LRU evicts a resident overlay entry (safety handoff; idempotent). */
  retainEvictedChunkEdits(cx: number, cy: number, cz: number, changes: ReadonlyMap<number, number>): void;
  /** Synchronous pending-copy lookup used to re-materialize an evicted entry on regeneration. */
  restorePendingChunkEdits(cx: number, cy: number, cz: number): ReadonlyMap<number, number> | null;
  /** Asynchronous committed-copy lookup (IndexedDB) for chunks with no resident/pending copy. */
  loadCommittedChunkEdits(cx: number, cy: number, cz: number): Promise<Array<[number, number]> | null>;
}

/**
 * The chunked, streaming world. Owns chunk storage, the budgeted
 * generation/meshing pipeline, unloading, and the player-edit overlay that
 * survives chunk unload/reload.
 */
export class World implements WorldAccess {
  private readonly registry: BlockRegistry;
  private readonly chunkManager: ChunkManager;
  private readonly scene: THREE.Scene;
  private readonly mesher: ChunkMesher;
  private readonly generator: TerrainGenerator;
  private readonly seed: number;
  private readonly materials: {
    opaque: THREE.MeshLambertMaterial;
    transparent: THREE.MeshLambertMaterial;
  };
  private readonly renderDistance: number;
  private readonly simulationDistance: number;
  /** Classifier for the two independent radii; streaming stays on `renderDistance`. */
  private readonly rsd: RenderSimulationDistance;
  /** Lowest streamed chunk-Y layer (derived from the dimension; 0 by default). */
  private readonly minChunkY: number;
  /** Number of vertical chunk layers streamed around the player (1 by default). */
  private readonly chunkLayerCount: number;

  /** Resident cache of player edits keyed by chunk key → local index → block
   *  id. Survives unload within the LRU cap; the injected durability layer
   *  (DIRTY-1/2) owns the authoritative copy of everything evicted. */
  private readonly editOverlay = new Map<string, Map<number, number>>();
  /** Edit overlay chunk keys ordered least- to most-recently used. Drives LRU
   *  eviction so a chunk the player keeps returning to is never dropped in
   *  favour of one that was edited later but never touched again. */
  private readonly editOverlayAccessOrder: string[] = [];
  /** Maximum distinct chunks tracked in the edit overlay. Prevents unbounded
   *  memory growth over very long sessions. */
  private static readonly EDIT_OVERLAY_MAX_CHUNKS = 10_000;
  /** Durable owner of edits beyond the resident overlay cap (optional; tests
   *  and the persistence facade inject it). Null keeps legacy cache-only
   *  behaviour where eviction discards entries. */
  private readonly editDurability: WorldEditDurability | null;
  /** Chunk keys with an in-flight `loadCommittedChunkEdits` hydration, so
   *  repeated generation cannot double-fire the async lookup (DIRTY-3). */
  private readonly hydrationPending = new Set<string>();

  /**
   * In-memory block-state overrides keyed by chunk key → cell index →
   * BlockStateId, mirroring the edit overlay. Stateful blocks (e.g. wheat) write
   * their resolved state id here on {@link setBlockState}; {@link getBlockState}
   * prefers it over the block's default state. It survives chunk unload/reload
   * within a session but is not yet persisted to the edit snapshot (125 scope).
   */
  private readonly stateOverlay = new Map<string, Map<number, BlockStateId>>();

  /** Block-state registry used to resolve/read canonical block states. */
  private readonly stateRegistry: BlockStateRegistry;

  private genQueue: GenJob[] = [];
  private readonly genSet = new Set<string>();
  private meshQueue: MeshJob[] = [];
  private readonly meshSet = new Set<string>();
  /** Set when an item is pushed onto a queue; the queue is reordered only once
   *  in the next update, avoiding a sort every frame. */
  private genQueueDirty = false;
  private meshQueueDirty = false;
  /** Mesh jobs dropped while the mesh queue was at capacity, retried once it drains. */
  private readonly retryMeshQueue: MeshJob[] = [];
  private readonly retryMeshSet = new Set<string>();
  /** Sand/gravel cells waiting to resolve after a supporting block changes. */
  private readonly fallingQueue: Array<[number, number, number]> = [];
  private readonly fallingSet = new Set<string>();

  /** Last chunk center that was scanned for streaming work. */
  private streamCenterX: number | null = null;
  private streamCenterZ: number | null = null;
  /** True while a bounded queue prevented the complete area scan. */
  private needsEnsure = true;
  /** True while budgeted unloading still has out-of-range chunks to remove. */
  private needsUnload = false;

  /** Live scene meshes per chunk key (for disposal on unload / re-mesh). */
  private readonly meshGroups = new Map<string, THREE.Mesh[]>();
  /** Triangles per chunk key, for incremental stats. */
  private readonly chunkTriangles = new Map<string, number>();
  /** Non-air voxel count per chunk key, for incremental stats and unload. */
  private readonly chunkVoxelCounts = new Map<string, number>();

  private triangles = 0;
  private voxels = 0;

  constructor(opts: {
    registry: BlockRegistry;
    seed: number;
    scene: THREE.Scene;
    mesher: ChunkMesher;
    generator: TerrainGenerator;
    materials: { opaque: THREE.MeshLambertMaterial; transparent: THREE.MeshLambertMaterial };
    renderDistance?: number;
    /** Ticking/simulation radius; defaults to CONFIG.simulationDistance (== render by default). */
    simulationDistance?: number;
    /** Active dimension; derives the streamed vertical chunk-layer window. Omit for single-layer. */
    dimension?: DimensionType;
    /** Block-state registry for reading/writing canonical block states. Omit for the default. */
    stateRegistry?: BlockStateRegistry;
    /** Durable owner of unsaved edits (DIRTY-1..5). Omit for cache-only behaviour. */
    editDurability?: WorldEditDurability;
  }) {
    this.registry = opts.registry;
    this.seed = opts.seed >>> 0;
    this.scene = opts.scene;
    this.mesher = opts.mesher;
    this.generator = opts.generator;
    this.materials = opts.materials;
    this.stateRegistry = opts.stateRegistry ?? createDefaultBlockStateRegistry();
    this.editDurability = opts.editDurability ?? null;
    this.renderDistance = opts.renderDistance ?? CONFIG.renderDistance;
    this.simulationDistance = opts.simulationDistance ?? CONFIG.simulationDistance;
    this.rsd = new RenderSimulationDistance(this.renderDistance, this.simulationDistance);
    // Vertical window: 64-block chunk layers derived from the dimension's block extent.
    this.minChunkY = opts.dimension ? Math.floor(opts.dimension.minY / CHUNK_DIMENSIONS.height) : 0;
    this.chunkLayerCount = opts.dimension ? Math.ceil(opts.dimension.height / CHUNK_DIMENSIONS.height) : 1;
    this.chunkManager = new ChunkManager(opts.registry);
  }

  // ── WorldAccess ────────────────────────────────────────────────────────────

  getBlock(x: number, y: number, z: number): number {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      return BlockId.Air;
    }
    const [cx, cy, cz] = worldToChunk(x, y, z);
    const chunk = this.chunkManager.getChunk(cx, cy, cz);
    if (!chunk) {
      return BlockId.Air;
    }
    const [lx, ly, lz] = worldToLocal(x, y, z);
    return chunk.getLocal(lx, ly, lz);
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    // Guard against invalid/out-of-bounds coordinates. The world occupies a
    // single vertical slab (cy === 0), so y must fall within the chunk height;
    // anything outside would write an overlay entry for a chunk that never
    // loads (unbounded dead entries), or read/write an invalid cell.
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      return;
    }
    if (y < 0 || y >= CHUNK_DIMENSIONS.height) {
      return;
    }
    if (!Number.isInteger(id) || !this.registry.has(id)) {
      return;
    }

    const [cx, cy, cz] = worldToChunk(x, y, z);
    const [lx, ly, lz] = worldToLocal(x, y, z);
    const index = localIndex(lx, ly, lz);
    const key = chunkKey(cx, cy, cz);

    // A plain block-id write invalidates any recorded state for this cell so a
    // stale state never outlives the block it described (125).
    const stateLayer = this.stateOverlay.get(key);
    if (stateLayer) {
      stateLayer.delete(index);
      if (stateLayer.size === 0) {
        this.stateOverlay.delete(key);
      }
    }

    const chunk = this.chunkManager.getChunk(cx, cy, cz);

    // No-op write: skip remeshing and avoid growing the edit overlay.
    if (chunk && chunk.getLocal(lx, ly, lz) === id) {
      return;
    }

    // Record the edit so it survives chunk unload/reload.
    let overlay = this.editOverlay.get(key);
    if (!overlay) {
      overlay = new Map<number, number>();
      this.editOverlay.set(key, overlay);
    }
    this.touchEditOverlay(key);
    overlay.set(localIndex(lx, ly, lz), id);
    // DIRTY-1/2: every committed live edit is handed to the durability layer
    // (full latest changes), so the resident overlay is never the sole copy.
    // importEdits deliberately does NOT capture: boot-time bulk imports are
    // already durable and must not be re-enqueued.
    this.editDurability?.captureChunkEdits(cx, cy, cz, overlay);

    if (!chunk) {
      return; // Not loaded yet; the edit is applied when the chunk generates.
    }

    const oldId = chunk.getLocal(lx, ly, lz);
    chunk.setLocal(lx, ly, lz, id);
    chunk.markDirty();

    // Keep the voxel tally accurate for already-generated chunks.
    if (chunk.generated && oldId !== id) {
      const delta = (id !== BlockId.Air ? 1 : 0) - (oldId !== BlockId.Air ? 1 : 0);
      if (delta !== 0) {
        this.voxels += delta;
        this.chunkVoxelCounts.set(key, (this.chunkVoxelCounts.get(key) ?? 0) + delta);
      }
    }

    // A block on a horizontal chunk boundary changes the faces of the
    // neighbouring chunk, so mark that neighbour dirty too.
    if (lx === 0) this.markNeighborDirty(cx - 1, cy, cz);
    if (lx === CHUNK_DIMENSIONS.width - 1) this.markNeighborDirty(cx + 1, cy, cz);
    if (lz === 0) this.markNeighborDirty(cx, cy, cz - 1);
    if (lz === CHUNK_DIMENSIONS.depth - 1) this.markNeighborDirty(cx, cy, cz + 1);

    this.enqueueMeshWithRetry(chunk);
    if (id === BlockId.Sand || id === BlockId.Gravel) {
      this.enqueueFalling(x, y, z);
    }
    this.enqueueFalling(x, y + 1, z);
  }

  /**
   * Write the canonical block state for `blockId` with the given property values
   * at (x, y, z). Resolves the state through the {@link BlockStateRegistry},
   * writes the block id via {@link setBlock} (edits/dirty/mesh), and records the
   * resolved state id so {@link getBlockState} returns it. Invalid coordinates or
   * an unregistered block id are a no-op; an illegal property assignment throws
   * from the registry's `lookup`.
   */
  setBlockState(
    x: number,
    y: number,
    z: number,
    blockId: number,
    properties: Readonly<Record<string, boolean | number | string>>,
  ): void {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      return;
    }
    if (y < 0 || y >= CHUNK_DIMENSIONS.height) {
      return;
    }
    if (!Number.isInteger(blockId) || !this.registry.has(blockId)) {
      return;
    }
    const state = this.stateRegistry.lookup(blockId, { ...properties });
    this.setBlock(x, y, z, blockId);

    const [cx, cy, cz] = worldToChunk(x, y, z);
    const [lx, ly, lz] = worldToLocal(x, y, z);
    const index = localIndex(lx, ly, lz);
    const key = chunkKey(cx, cy, cz);
    let layer = this.stateOverlay.get(key);
    if (!layer) {
      layer = new Map<number, BlockStateId>();
      this.stateOverlay.set(key, layer);
    }
    layer.set(index, state.id);
  }

  /**
   * The block state at (x, y, z): the recorded state from a prior
   * {@link setBlockState}, or the block's default state when none is recorded.
   * Out-of-bounds coordinates resolve to the air default state.
   */
  getBlockState(x: number, y: number, z: number): BlockState {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      return this.stateRegistry.getDefaultState(BlockId.Air);
    }
    const [cx, cy, cz] = worldToChunk(x, y, z);
    const [lx, ly, lz] = worldToLocal(x, y, z);
    const index = localIndex(lx, ly, lz);
    const key = chunkKey(cx, cy, cz);
    const stateId = this.stateOverlay.get(key)?.get(index);
    if (stateId !== undefined) {
      return this.stateRegistry.getState(stateId);
    }
    return this.stateRegistry.getDefaultState(this.getBlock(x, y, z));
  }

  /**
   * Iterate every loaded chunk's coordinates. Used by the simulation loop (125)
   * to dispatch random ticks per 16×16×16 section.
   */
  forEachLoadedChunk(fn: (cx: number, cy: number, cz: number) => void): void {
    this.chunkManager.forEachChunk((chunk) => fn(chunk.cx, chunk.cy, chunk.cz));
  }

  isSolid(x: number, y: number, z: number): boolean {
    // An invisible solid floor below the world prevents the player from
    // falling forever if a chunk is momentarily un-generated or unloaded.
    if (y < CONFIG.bedrockY) {
      return true;
    }
    return this.registry.isSolid(this.getBlock(x, y, z));
  }

  /** Export the sparse edit overlay as a versioned, JSON-safe snapshot. */
  exportEdits(): WorldEditSnapshot {
    const edits: WorldEditSnapshot['edits'] = [];
    for (const [key, overlay] of this.editOverlay) {
      const parts = key.split(',').map(Number);
      if (parts.length !== 3 || parts.some((value) => !Number.isInteger(value))) {
        continue;
      }
      const [cx, cy, cz] = parts as [number, number, number];
      const changes: Array<[number, number]> = [];
      for (const [index, id] of overlay) {
        changes.push([index, id]);
      }
      if (changes.length > 0) {
        edits.push({ chunk: [cx, cy, cz], changes });
      }
    }
    return { version: 1, seed: this.seed, edits };
  }

  /**
   * Import a validated edit snapshot. Invalid or foreign entries are ignored,
   * so a corrupt browser save cannot poison chunk storage or the mesher.
   * Returns the number of accepted cell edits.
   */
  importEdits(snapshot: unknown): number {
    if (!this.isEditSnapshot(snapshot) || snapshot.seed !== this.seed) {
      return 0;
    }

    let accepted = 0;
    for (const entry of snapshot.edits) {
      const [cx, cy, cz] = entry.chunk;
      if (cy !== 0) {
        continue;
      }
      const key = chunkKey(cx, cy, cz);
      let overlay = this.editOverlay.get(key);
      if (!overlay) {
        overlay = new Map<number, number>();
        this.editOverlay.set(key, overlay);
      }

      for (const [index, id] of entry.changes) {
        if (
          index < 0 ||
          index >= CHUNK_DIMENSIONS.width * CHUNK_DIMENSIONS.height * CHUNK_DIMENSIONS.depth ||
          !this.registry.has(id)
        ) {
          continue;
        }
        if (overlay.get(index) !== id) {
          overlay.set(index, id);
          accepted++;
        }
      }
      if (overlay.size > 0) {
        this.touchEditOverlay(key);
        const chunk = this.chunkManager.getChunk(cx, cy, cz);
        if (chunk?.generated) {
          this.applyEditOverlay(chunk);
          this.refreshChunkVoxelCount(chunk);
          chunk.markDirty();
          this.enqueueMeshWithRetry(chunk);
        }
      } else {
        this.editOverlay.delete(key);
      }
    }
    return accepted;
  }

  /** Number of distinct chunks currently tracked in the edit overlay. */
  getEditOverlayChunkCount(): number {
    return this.editOverlay.size;
  }

  /** Number of sparse edit cells currently retained in memory. */
  getEditCount(): number {
    let count = 0;
    for (const overlay of this.editOverlay.values()) {
      count += overlay.size;
    }
    return count;
  }

  private isEditSnapshot(value: unknown): value is WorldEditSnapshot {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const candidate = value as { version?: unknown; seed?: unknown; edits?: unknown };
    if (candidate.version !== 1 || !Number.isInteger(candidate.seed) || !Array.isArray(candidate.edits)) {
      return false;
    }
    return candidate.edits.every((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) {
        return false;
      }
      const edit = entry as { chunk?: unknown; changes?: unknown };
      return (
        Array.isArray(edit.chunk) &&
        edit.chunk.length === 3 &&
        edit.chunk.every((part: unknown) => Number.isInteger(part)) &&
        Array.isArray(edit.changes) &&
        edit.changes.every(
          (change: unknown) =>
            Array.isArray(change) &&
            change.length === 2 &&
            Number.isInteger(change[0]) &&
            Number.isInteger(change[1]),
        )
      );
    });
  }

  // ── Streaming ──────────────────────────────────────────────────────────────

  update(_dt: number, playerChunkX: number, playerChunkZ: number): void {
    this.ensureChunks(playerChunkX, playerChunkZ);
    // Prioritize the queue by distance to the player so the nearest chunks
    // (and the player's own chunk) generate and mesh first. Only re-sort when
    // something was added since the last sort.
    if (this.genQueueDirty) {
      this.prioritizeQueue(this.genQueue, playerChunkX, playerChunkZ);
      this.genQueueDirty = false;
    }
    if (this.meshQueueDirty) {
      this.prioritizeQueue(this.meshQueue, playerChunkX, playerChunkZ);
      this.meshQueueDirty = false;
    }
    this.processGeneration();
    this.processMeshing();
    this.processFallingBlocks();
    if (this.needsUnload) {
      this.needsUnload = this.unloadChunks(playerChunkX, playerChunkZ);
    }
  }

  /** Reorder a job queue by Chebyshev distance to the player chunk. */
  private prioritizeQueue(queue: { cx: number; cz: number }[], pcx: number, pcz: number): void {
    if (queue.length < 2) {
      return;
    }
    queue.sort((a, b) => {
      const da = Math.max(Math.abs(a.cx - pcx), Math.abs(a.cz - pcz));
      const db = Math.max(Math.abs(b.cx - pcx), Math.abs(b.cz - pcz));
      return da - db;
    });
  }

  /** Create and queue generation for every missing chunk around the player. */
  private ensureChunks(playerChunkX: number, playerChunkZ: number): boolean {
    const centerChanged = this.streamCenterX !== playerChunkX || this.streamCenterZ !== playerChunkZ;
    if (centerChanged) {
      this.streamCenterX = playerChunkX;
      this.streamCenterZ = playerChunkZ;
      this.needsEnsure = true;
      // A moving player changes the nearest chunk ordering even when no new job
      // was added, so the next pass must re-prioritize existing work.
      this.genQueueDirty = true;
      this.meshQueueDirty = true;
      this.needsUnload = true;
    }
    if (!centerChanged && !this.needsEnsure) {
      return false;
    }

    const rd = this.renderDistance;
    let queueFull = false;
    scan:
    for (let dx = -rd; dx <= rd; dx++) {
      for (let dz = -rd; dz <= rd; dz++) {
        const cx = playerChunkX + dx;
        const cz = playerChunkZ + dz;
        for (let cy = this.minChunkY; cy < this.minChunkY + this.chunkLayerCount; cy++) {
          const key = chunkKey(cx, cy, cz);
          const existing = this.chunkManager.getChunk(cx, cy, cz);
          if (!existing) {
            if (this.genQueue.length >= CONFIG.maxQueueSize) {
              // The queue is at capacity. Don't create a chunk we can't queue —
              // it would sit in the manager forever as an un-generated void.
              // ensureChunks runs every frame, so the area is retried once the
              // queue drains.
              queueFull = true;
              break scan;
            }
            const chunk = this.chunkManager.createChunk(cx, cy, cz);
            this.enqueueGeneration(chunk);
          } else if (!existing.generated && !this.genSet.has(key)) {
            // A chunk was created earlier but its generation job was dropped
            // (queue overflow). Re-queue it now that (or when) there is room, so
            // it cannot be stranded.
            if (this.genQueue.length < CONFIG.maxQueueSize) {
              this.enqueueGeneration(existing);
            }
          }
        }
      }
    }
    this.needsEnsure = queueFull;
    return centerChanged;
  }

  private processGeneration(): void {
    let done = 0;
    while (done < CONFIG.budgets.generatePerFrame && this.genQueue.length > 0) {
      const job = this.genQueue.shift()!;
      this.genSet.delete(job.key);

      const chunk = this.chunkManager.getChunk(job.cx, job.cy, job.cz);
      if (!chunk) {
        continue;
      }

      this.generator.generateChunk(chunk);
      this.applyEditOverlay(chunk);
      chunk.generated = true;
      chunk.state = ChunkState.Generated;
      this.countChunkVoxels(chunk);

      // This chunk now has real geometry data. Any already-visible neighbour
      // that was meshed while this chunk was still absent may have emitted
      // boundary faces against air; re-mesh those neighbours so the seam stays
      // culled/correct. (markNeighborDirty no-ops for neighbours that don't
      // exist yet; when they generate, their own generation re-meshes us.)
      const { cx, cy, cz } = chunk;
      this.markNeighborDirty(cx - 1, cy, cz);
      this.markNeighborDirty(cx + 1, cy, cz);
      this.markNeighborDirty(cx, cy, cz - 1);
      this.markNeighborDirty(cx, cy, cz + 1);

      // If the mesh queue is full, park the job and retry once it drains. This
      // also covers edits and boundary-neighbor remeshes, not only generation.
      this.enqueueMeshWithRetry(chunk);
      done++;
    }
  }

  private processMeshing(): void {
    // Re-admit mesh jobs that were parked while the queue was at capacity.
    while (this.retryMeshQueue.length > 0 && this.meshQueue.length < CONFIG.maxQueueSize) {
      const job = this.retryMeshQueue.shift()!;
      this.retryMeshSet.delete(job.key);
      const chunk = this.chunkManager.getChunk(job.cx, job.cy, job.cz);
      if (chunk) {
        this.enqueueMeshWithRetry(chunk);
      }
    }

    let done = 0;
    while (done < CONFIG.budgets.meshPerFrame && this.meshQueue.length > 0) {
      const job = this.meshQueue.shift()!;
      this.meshSet.delete(job.key);

      const chunk = this.chunkManager.getChunk(job.cx, job.cy, job.cz);
      if (!chunk) {
        continue;
      }

      // Stale guard: skip if the chunk was modified since this job was queued.
      if (job.version !== chunk.meshVersion) {
        continue;
      }

      const result = this.mesher.mesh(chunk, (cx, cy, cz) => this.chunkManager.getChunk(cx, cy, cz));
      this.attach(chunk, result);
      chunk.dirty = false;
      chunk.state = ChunkState.Visible;
      done++;
    }
  }

  private unloadChunks(playerChunkX: number, playerChunkZ: number): boolean {
    const limit = this.renderDistance + 1;
    const candidates: Chunk[] = [];
    this.chunkManager.forEachChunk((chunk) => {
      if (Math.abs(chunk.cx - playerChunkX) > limit || Math.abs(chunk.cz - playerChunkZ) > limit) {
        candidates.push(chunk);
      }
    });

    let unloaded = 0;
    for (const chunk of candidates) {
      if (unloaded >= CONFIG.budgets.unloadPerFrame) {
        break;
      }
      const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);

      this.removeMeshesForChunk(chunk);

      const voxelCount = this.chunkVoxelCounts.get(key);
      if (voxelCount) {
        this.voxels -= voxelCount;
      }
      this.chunkVoxelCounts.delete(key);

      // Drop any pending jobs for this chunk. Each set mirrors its queue, so an
      // O(1) miss skips the scan entirely and no queue is ever reallocated.
      if (this.genSet.delete(key)) {
        for (let i = this.genQueue.length - 1; i >= 0; i--) {
          if (this.genQueue[i]?.key === key) {
            this.genQueue.splice(i, 1);
          }
        }
      }
      if (this.meshSet.delete(key)) {
        for (let i = this.meshQueue.length - 1; i >= 0; i--) {
          if (this.meshQueue[i]?.key === key) {
            this.meshQueue.splice(i, 1);
          }
        }
      }
      // In-place filter on the readonly retry queue (no reassignment).
      for (let i = this.retryMeshQueue.length - 1; i >= 0; i--) {
        const job = this.retryMeshQueue[i];
        if (job && job.key === key) {
          this.retryMeshQueue.splice(i, 1);
        }
      }
      this.retryMeshSet.delete(key);

      // The edit overlay is intentionally kept so edits survive reload.
      this.chunkManager.removeChunk(chunk.cx, chunk.cy, chunk.cz);
      unloaded++;
    }
    return candidates.length > unloaded;
  }

  /** Resolve a bounded number of unsupported sand/gravel cells per frame. */
  private processFallingBlocks(): void {
    let processed = 0;
    while (processed < 8 && this.fallingQueue.length > 0) {
      const [x, y, z] = this.fallingQueue.shift()!;
      this.fallingSet.delete(`${x},${y},${z}`);
      if (
        y <= CONFIG.bedrockY ||
        !this.isLoadedAt(x, y, z) ||
        !this.isLoadedAt(x, y - 1, z)
      ) {
        continue;
      }
      const id = this.getBlock(x, y, z);
      if ((id !== BlockId.Sand && id !== BlockId.Gravel) || this.getBlock(x, y - 1, z) !== BlockId.Air) {
        continue;
      }
      this.setBlock(x, y, z, BlockId.Air);
      this.setBlock(x, y - 1, z, id);
      processed++;
    }
  }

  private enqueueFalling(x: number, y: number, z: number): void {
    if (y <= CONFIG.bedrockY || y >= CHUNK_DIMENSIONS.height || !Number.isInteger(x) || !Number.isInteger(z)) {
      return;
    }
    const key = `${x},${y},${z}`;
    if (this.fallingSet.has(key)) return;
    this.fallingSet.add(key);
    this.fallingQueue.push([x, y, z]);
  }

  private isLoadedAt(x: number, y: number, z: number): boolean {
    if (y < 0 || y >= CHUNK_DIMENSIONS.height) return false;
    const [cx, cy, cz] = worldToChunk(x, y, z);
    return this.chunkManager.getChunk(cx, cy, cz)?.generated === true;
  }

  // ── Queues ─────────────────────────────────────────────────────────────────

  private enqueueGeneration(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    if (this.genSet.has(key)) {
      return;
    }
    if (this.genQueue.length >= CONFIG.maxQueueSize) {
      return; // Drop beyond the bound.
    }
    this.genQueue.push({ key, cx: chunk.cx, cy: chunk.cy, cz: chunk.cz });
    this.genQueueDirty = true;
    this.genSet.add(key);
    chunk.state = ChunkState.Generating;
  }

  private enqueueMesh(chunk: Chunk): boolean {
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    if (this.meshSet.has(key)) {
      // Already queued — refresh the captured version so the job reflects the
      // latest data and isn't discarded as stale.
      const existing = this.meshQueue.find((j) => j.key === key);
      if (existing) {
        existing.version = chunk.meshVersion;
      }
      return true;
    }
    if (this.meshQueue.length >= CONFIG.maxQueueSize) {
      return false; // Queue is at capacity; caller may retry later.
    }
    this.meshQueue.push({ key, cx: chunk.cx, cy: chunk.cy, cz: chunk.cz, version: chunk.meshVersion });
    this.meshQueueDirty = true;
    this.meshSet.add(key);
    chunk.state = ChunkState.Meshing;
    return true;
  }

  /** Queue a mesh job, retaining it when the active queue is temporarily full. */
  private enqueueMeshWithRetry(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    if (this.enqueueMesh(chunk)) {
      // A later edit may have made a previously parked job active. Remove the
      // stale parked copy so it cannot enqueue a duplicate mesh after this job.
      if (this.retryMeshSet.delete(key)) {
        for (let i = this.retryMeshQueue.length - 1; i >= 0; i--) {
          if (this.retryMeshQueue[i]?.key === key) {
            this.retryMeshQueue.splice(i, 1);
          }
        }
      }
      return;
    }

    const existing = this.retryMeshQueue.find((job) => job.key === key);
    if (existing) {
      existing.version = chunk.meshVersion;
      return;
    }
    // The active mesh queue is bounded, and the retry queue is bounded by the
    // loaded chunk set (which is itself bounded by render distance). Keeping a
    // parked entry here guarantees that edits are never silently stranded.
    this.retryMeshSet.add(key);
    this.retryMeshQueue.push({ key, cx: chunk.cx, cy: chunk.cy, cz: chunk.cz, version: chunk.meshVersion });
  }

  /**
   * Re-apply the player's edits for a chunk after regeneration. Fallback chain
   * when the resident overlay misses (DIRTY-1..3): a synchronous pending copy
   * from the durability layer re-materializes the overlay entry immediately;
   * otherwise an async committed-copy hydration is fired (de-duplicated per
   * chunk key) which applies, remeshes, and populates the overlay on resolve.
   */
  private applyEditOverlay(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    let overlay = this.editOverlay.get(key);
    if (!overlay) {
      const pending = this.editDurability?.restorePendingChunkEdits(chunk.cx, chunk.cy, chunk.cz);
      if (pending && pending.size > 0) {
        // Copy into a fresh resident entry; the durability layer keeps its own.
        overlay = new Map<number, number>(pending);
        this.editOverlay.set(key, overlay);
        this.touchEditOverlay(key);
      } else if (this.editDurability?.loadCommittedChunkEdits) {
        this.beginEditHydration(chunk.cx, chunk.cy, chunk.cz, key);
      }
      if (!overlay) {
        return;
      }
    }
    // Reading the overlay counts as a use: a chunk that keeps reloading around
    // the player must not be evicted before chunks edited once and abandoned.
    this.touchEditOverlay(key);
    for (const [index, id] of overlay) {
      chunk.blocks[index] = id;
    }
  }

  /**
   * Fire-and-forget async hydration of committed edits for a chunk with no
   * resident/pending copy. Resolved entries are validated like importEdits
   * (index bounds + registered id), written into a fresh overlay entry, and
   * applied to the live chunk with a voxel-count refresh and remesh. Errors are
   * swallowed here — failures surface through the durability layer's health,
   * not exceptions. The pending set prevents double-fires while one is in
   * flight.
   */
  private beginEditHydration(cx: number, cy: number, cz: number, key: string): void {
    if (this.hydrationPending.has(key)) {
      return;
    }
    this.hydrationPending.add(key);
    this.editDurability!
      .loadCommittedChunkEdits(cx, cy, cz)
      .then((changes) => {
        if (!changes || changes.length === 0) {
          return;
        }
        const overlay = new Map<number, number>();
        for (const [index, id] of changes) {
          if (index < 0 || index >= CHUNK_BLOCK_COUNT || !this.registry.has(id)) {
            continue;
          }
          overlay.set(index, id);
        }
        if (overlay.size === 0) {
          return;
        }
        // A resident entry may have appeared while hydration was in flight (a
        // live edit or a pending-copy restore); it is newer than the committed
        // copy, so leave it untouched rather than visually reverting it.
        if (this.editOverlay.has(key)) {
          return;
        }
        this.editOverlay.set(key, overlay);
        this.touchEditOverlay(key);
        const chunk = this.chunkManager.getChunk(cx, cy, cz);
        if (chunk?.generated) {
          for (const [index, id] of overlay) {
            chunk.blocks[index] = id;
          }
          this.refreshChunkVoxelCount(chunk);
          chunk.markDirty();
          this.enqueueMeshWithRetry(chunk);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        this.hydrationPending.delete(key);
      });
  }

  /**
   * Mark an edit-overlay chunk key as most-recently used and enforce the size
   * cap by evicting least-recently-used keys. Eviction only discards the
   * resident copy: the latest state is handed to the durability layer first,
   * so the authoritative record of unsaved edits is never destroyed
   * (DIRTY-1/2/4). Without an injected durability layer the legacy
   * drop-on-evict behaviour remains.
   */
  private touchEditOverlay(key: string): void {
    const index = this.editOverlayAccessOrder.indexOf(key);
    if (index !== -1) {
      this.editOverlayAccessOrder.splice(index, 1);
    }
    this.editOverlayAccessOrder.push(key);

    while (this.editOverlay.size > World.EDIT_OVERLAY_MAX_CHUNKS) {
      const lruKey = this.editOverlayAccessOrder.shift();
      if (lruKey === undefined) {
        break; // Access order exhausted; nothing left to evict.
      }
      const evicted = this.editOverlay.get(lruKey);
      if (evicted && this.editDurability) {
        const [cx, cy, cz] = keyToChunk(lruKey);
        this.editDurability.retainEvictedChunkEdits(cx, cy, cz, evicted);
      }
      this.editOverlay.delete(lruKey);
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private attach(chunk: Chunk, result: { opaque: THREE.BufferGeometry | null; transparent: THREE.BufferGeometry | null }): void {
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    this.removeMeshesForChunk(chunk);

    const meshes: THREE.Mesh[] = [];
    let tris = 0;
    const px = chunk.cx * CHUNK_DIMENSIONS.width;
    const py = chunk.cy * CHUNK_DIMENSIONS.height;
    const pz = chunk.cz * CHUNK_DIMENSIONS.depth;

    if (result.opaque) {
      const mesh = new THREE.Mesh(result.opaque, this.materials.opaque);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      meshes.push(mesh);
      tris += this.triangleCount(result.opaque);
    }
    if (result.transparent) {
      const mesh = new THREE.Mesh(result.transparent, this.materials.transparent);
      mesh.position.set(px, py, pz);
      mesh.renderOrder = 1;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      meshes.push(mesh);
      tris += this.triangleCount(result.transparent);
    }

    this.meshGroups.set(key, meshes);
    this.chunkTriangles.set(key, tris);
    this.triangles += tris;
  }

  private removeMeshesForChunk(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    const meshes = this.meshGroups.get(key);
    if (meshes) {
      for (const mesh of meshes) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
      }
      this.meshGroups.delete(key);
    }
    const tris = this.chunkTriangles.get(key);
    if (tris) {
      this.triangles -= tris;
      this.chunkTriangles.delete(key);
    }
  }

  private triangleCount(geometry: THREE.BufferGeometry): number {
    const index = geometry.index;
    if (index) {
      return index.count / 3;
    }
    const position = geometry.attributes.position;
    return position ? position.count / 3 : 0;
  }

  private markNeighborDirty(cx: number, cy: number, cz: number): void {
    const neighbor = this.chunkManager.getChunk(cx, cy, cz);
    if (neighbor) {
      neighbor.markDirty();
      this.enqueueMeshWithRetry(neighbor);
    }
  }

  // ── Stats / lifecycle ──────────────────────────────────────────────────────

  private countChunkVoxels(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    let count = 0;
    for (let i = 0; i < chunk.blocks.length; i++) {
      if (chunk.blocks[i] !== BlockId.Air) {
        count++;
      }
    }
    this.voxels += count;
    this.chunkVoxelCounts.set(key, count);
  }

  /** Reconcile stats after an edit snapshot is loaded into a live chunk. */
  private refreshChunkVoxelCount(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    let count = 0;
    for (let i = 0; i < chunk.blocks.length; i++) {
      if (chunk.blocks[i] !== BlockId.Air) {
        count++;
      }
    }
    this.voxels += count - (this.chunkVoxelCounts.get(key) ?? 0);
    this.chunkVoxelCounts.set(key, count);
  }

  /** Rendering radius (chunks loaded/generated/meshed/unloaded around the player). */
  getRenderDistance(): number {
    return this.renderDistance;
  }

  /** Simulation/ticking radius (chunks actively ticked around the player). */
  getSimulationDistance(): number {
    return this.simulationDistance;
  }

  /** Lowest streamed chunk-Y layer (0 for the default single-layer world). */
  getMinChunkY(): number {
    return this.minChunkY;
  }

  /** Number of vertical chunk layers streamed around the player (1 by default). */
  getChunkLayerCount(): number {
    return this.chunkLayerCount;
  }

  /**
   * Whether chunk (cx,cz) is within the simulation/ticking radius of the current
   * streaming center. False before the first `update` sets a center.
   */
  isChunkSimulating(cx: number, cz: number): boolean {
    if (this.streamCenterX === null || this.streamCenterZ === null) return false;
    return this.rsd.isWithinSimulationDistance(cx, cz, this.streamCenterX, this.streamCenterZ);
  }

  getStats(): WorldStats {
    return {
      loadedChunks: this.chunkManager.size,
      pendingGeneration: this.genQueue.length,
      pendingMesh: this.meshQueue.length + this.retryMeshQueue.length,
      triangles: this.triangles,
      voxels: this.voxels,
    };
  }

  isReady(playerChunkX = 0, playerChunkZ = 0): boolean {
    return this.getReadyProgress(playerChunkX, playerChunkZ) >= 1;
  }

  /** Fraction of the safety ring that has generated and attached visible meshes. */
  getReadyProgress(playerChunkX = 0, playerChunkZ = 0): number {
    const radius = Math.min(2, this.renderDistance);
    const diameter = radius * 2 + 1;
    const total = diameter * diameter;
    let ready = 0;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const chunk = this.chunkManager.getChunk(playerChunkX + dx, this.minChunkY, playerChunkZ + dz);
        if (chunk?.state === ChunkState.Visible) {
          ready++;
        }
      }
    }
    return ready / total;
  }

  /**
   * Queue the chunks around the spawn point for prioritized generation. Work is
   * intentionally processed by the normal per-frame budgets so the loading UI
   * can paint immediately and the main thread never stalls on a large preload.
   */
  preloadChunks(playerChunkX: number, playerChunkZ: number, radius = 3): void {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = playerChunkX + dx;
        const cz = playerChunkZ + dz;
        for (let cy = this.minChunkY; cy < this.minChunkY + this.chunkLayerCount; cy++) {
          let chunk = this.chunkManager.getChunk(cx, cy, cz);
          if (!chunk) {
            chunk = this.chunkManager.createChunk(cx, cy, cz);
          }
          if (!chunk.generated) {
            this.enqueueGeneration(chunk);
          } else if (chunk.state !== ChunkState.Visible) {
            this.enqueueMeshWithRetry(chunk);
          }
        }
      }
    }
    this.needsEnsure = true;
    this.genQueueDirty = true;
    this.meshQueueDirty = true;
  }

  dispose(): void {
    this.chunkManager.forEachChunk((chunk) => this.removeMeshesForChunk(chunk));
    this.chunkManager.dispose();
    this.genQueue = [];
    this.genSet.clear();
    this.meshQueue = [];
    this.meshSet.clear();
    this.retryMeshQueue.length = 0;
    this.retryMeshSet.clear();
    this.fallingQueue.length = 0;
    this.fallingSet.clear();
    this.meshGroups.clear();
    this.chunkTriangles.clear();
    this.chunkVoxelCounts.clear();
    this.editOverlay.clear();
    this.editOverlayAccessOrder.length = 0;
    this.stateOverlay.clear();
    this.streamCenterX = null;
    this.streamCenterZ = null;
    this.needsEnsure = true;
    this.needsUnload = false;
    this.triangles = 0;
    this.voxels = 0;
  }
}
