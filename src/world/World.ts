import * as THREE from 'three';
import { CONFIG } from '../config';
import { BlockId, BlockRegistry, RenderCategory } from './BlockRegistry';
import {
  BlockState,
  BlockStateRegistry,
  createDefaultBlockStateRegistry,
} from './BlockStateRegistry';
import { DimensionType } from '../data/DimensionType';
import { OVERWORLD_DIMENSION_TYPE } from '../data/DimensionTypes';
import { CanonicalWorldStorage } from './CanonicalWorldStorage';
import { Chunk, ChunkState } from './Chunk';
import { ChunkManager } from './ChunkManager';
import { ChunkMesher, geometryFromMeshStream } from './ChunkMesher';
import type { TerrainGenerator } from './TerrainGenerator';
import type { WorldStats } from './MeshingTypes';
import type { WorldAccess } from './WorldAccess';
import { RenderSimulationDistance } from './RenderSimulationDistance';
import { FrameWorkBudgetScheduler, type FrameTaskClass } from '../rendering/RenderBudget';
import { WorldLightStorage } from '../rendering/LightStorage';
import { LightUpdateEngine } from '../rendering/LightUpdateEngine';
import {
  CHUNK_PIPELINE_QUEUE_CAPS,
} from './ChunkPipeline';
import {
  ChunkStreamPriority,
  ChunkTicketType,
  createChunkTicket,
} from './ChunkTicket';
import { ChunkLifecycleStage, ChunkStatus, isChunkStatusAtLeast } from './ChunkStatus';
import type { ChunkMeshResult } from './MeshingTypes';
import type { UvRect, MeshStreamName } from './MeshingTypes';
import {
  MeshWorkerClient,
  expandPackedMeshResult,
  packQuadsToTypedArrays,
  type MeshSectionRequestPayload,
  type MeshSectionResultPayload,
  type PackedMeshExpandInfo,
} from '../rendering/WorkerMeshing';
import { WorkerPool, computeWorkerPoolSize } from '../engine/WorkerPool';
import {
  CHUNK_BLOCK_COUNT,
  CHUNK_DIMENSIONS,
  chunkKey,
  keyToChunk,
  localIndex,
  worldToChunk,
  worldToLocal,
} from './WorldCoordinates';
import { localCoord, sectionIndex } from '../math/SectionCoordinate';
import type { SerializedChunkColumns } from './VerticalWorldAccess';
import type { ChunkColumn } from './ChunkColumn';
/** A queued meshing job; carries the meshVersion captured at queue time. */
interface MeshJob {
  key: string;
  cx: number;
  cy: number;
  cz: number;
  version: number;
}

/**
 * Material set World renders chunk meshes with. `opaque`/`transparent` are
 * required (legacy contract); `cutout`/`fluid` are additive opt-ins — when a
 * stream's material is absent its geometry is simply not attached.
 */
export interface WorldMaterials {
  opaque: THREE.MeshLambertMaterial;
  transparent: THREE.MeshLambertMaterial;
  cutout?: THREE.MeshLambertMaterial;
  fluid?: THREE.MeshLambertMaterial;
}

/**
 * Minimal observability handle World feeds per frame (audit 05). Declared
 * locally so World does not import Game-side monitor types.
 */
export interface WorldMonitorHandle {
  setQueueDepth(kind: 'generate' | 'mesh' | 'upload' | 'unload', depth: number): void;
  setOldestJobAgeMs(ageMs: number): void;
  recordUploadBytes(bytes: number): void;
}

/** Luminance (emitted block light, 0-15) of emissive blocks. Registry entries carry no luminance field yet, so the emissive set is this explicit map. */
const BLOCK_LUMINANCE: Readonly<Record<number, number>> = {
  [BlockId.Lava]: 15,
  [BlockId.Fire]: 15,
  [BlockId.RedstoneTorch]: 7,
};

function blockLuminance(id: number): number {
  return BLOCK_LUMINANCE[id] ?? 0;
}

/** Rough GPU upload cost of one geometry: sum of its attribute + index buffers. */
function estimateGeometryBytes(geometry: THREE.BufferGeometry): number {
  let bytes = 0;
  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.attributes[name];
    // ArrayBufferView is type-only; `ArrayBuffer.isView` is its runtime check.
    if (attribute?.array !== undefined && ArrayBuffer.isView(attribute.array)) {
      bytes += attribute.array.byteLength;
    }
  }
  if (geometry.index?.array !== undefined && ArrayBuffer.isView(geometry.index.array)) {
    bytes += geometry.index.array.byteLength;
  }
  return bytes;
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
  readonly dimension: DimensionType;
  readonly storage: CanonicalWorldStorage;
  private readonly registry: BlockRegistry;
  private readonly chunkManager: ChunkManager;
  private readonly scene: THREE.Scene;
  private readonly mesher: ChunkMesher;
  private readonly generator: TerrainGenerator;
  private readonly seed: number;
  private readonly materials: WorldMaterials;
  private readonly renderDistance: number;
  private readonly simulationDistance: number;
  /** Classifier for the two independent radii; streaming stays on `renderDistance`. */
  private readonly rsd: RenderSimulationDistance;
  /** Lowest streamed chunk-Y layer (derived from the dimension; 0 by default). */
  private readonly minChunkY: number;
  /** Number of vertical chunk layers streamed around the player (1 by default). */
  private readonly chunkLayerCount: number;

  /**
   * PROJECTION_ONLY — bounded LRU cache of player edits (chunkKey → localIndex → blockId).
   * Not authoritative: the single writable truth is `this.storage` (`CanonicalWorldStorage` →
   * `VerticalWorldAccess` → `ChunkColumn` dirty sections). This map exists only as a
   * legacy compatibility projection for `exportEdits`/`importEdits`, the `WorldEditDurability`
   * bridge, and fast generation-time re-application. It is bounded to
   * `EDIT_OVERLAY_MAX_CHUNKS` entries with LRU expiry; eviction is safe because the
   * dirty column in `storage` retains the edit. New persistence code MUST use
   * `storage.serialize()` / `storage.dirtyColumns()` and `GamePersistence.saveChunkColumn`
   * instead of this overlay. Removal criteria: delete this field once `exportEdits`
   * callers and `WorldEditDurability` are fully cut over to column storage.
   */
  private readonly editOverlay = new Map<string, Map<number, number>>();
  /** LRU order for the projection-only overlay; drives eviction. */
  private readonly editOverlayAccessOrder: string[] = [];
  /** Maximum distinct chunks tracked in the projection overlay. */
  private static readonly EDIT_OVERLAY_MAX_CHUNKS = 10_000;
  /** Durable owner of edits beyond the resident overlay cap (optional; tests
   *  and the persistence facade inject it). Null keeps cache-only
   *  behaviour where eviction would otherwise drop the projection entry
   *  (canonical storage still retains the edit via its dirty column). */
  private readonly editDurability: WorldEditDurability | null;
  /** Chunk keys with an in-flight `loadCommittedChunkEdits` hydration, so
   *  repeated generation cannot double-fire the async lookup (DIRTY-3). */
  private readonly hydrationPending = new Set<string>();

  /** Block-state registry used to resolve/read canonical block states. */
  private readonly stateRegistry: BlockStateRegistry;


  /** Per-frame time-budget scheduler over the four chunk-task classes (audit 04).
   *  Class budgets derive from CONFIG.budgets; count caps stay as hard limits. */
  private readonly budgets = new FrameWorkBudgetScheduler({
    generateMs: CONFIG.budgets.mainThreadChunkMs,
    meshUploadMs: CONFIG.budgets.uploadMsPerFrame,
    lightMs: CONFIG.budgets.lightDrainMs,
    unloadMs: CONFIG.budgets.mainThreadChunkMs / 2,
  });
  /** Conservative first-frame cost estimates (ms) per task class, used until the
   *  scheduler's EMA has data (tryAcquire trusts a 0 estimate otherwise). */
  private static readonly TASK_ESTIMATE_MS: Readonly<Record<FrameTaskClass, number>> = {
    generate: 0.5,
    'mesh-upload': 1,
    light: 0.25,
    unload: 0.25,
  };

  /** Authoritative voxel light field (world coordinates, per 16³ section). */
  private readonly lightStorage = new WorldLightStorage();
  /** Incremental sky/block light engine over {@link lightStorage}. */
  private readonly lightEngine: LightUpdateEngine;
  /** Chunk keys whose light was invalidated since the last productive drain;
   *  promoted to remesh jobs when propagation actually changes values. */
  private readonly lightDirtyChunks = new Set<string>();
  /** World-coordinate light sampler handed to the mesher (070 shading). */
  private readonly mesherLightSampler = {
    inBounds: (x: number, y: number, z: number): boolean =>
      Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) &&
      this.dimension.containsY(y),
    isOpaque: (x: number, y: number, z: number): boolean => this.registry.isOpaque(this.getBlock(x, y, z)),
    getSkyLight: (x: number, y: number, z: number): number => this.lightStorage.getSkyLight(x, y, z),
    getBlockLight: (x: number, y: number, z: number): number => this.lightStorage.getBlockLight(x, y, z),
  };
  /** 16³ light sections per chunk column (chunk height / section size). */
  private readonly sectionsPerChunk: number;

  // ── Worker meshing plumbing (toggleable; OFF until validated) ──────────────
  /**
   * Worker meshing switch. DEFAULTS TO FALSE: the synchronous ChunkMesher stays
   * the active path. Flipping this flag awaits the worker-meshing validation
   * campaign (golden-image + parity checks) — do not enable it in production
   * before then. When true, mesh jobs are submitted as per-section requests and
   * consumed through the same stale-check + attach path as sync results.
   */
  private readonly useWorkers = false;
  private workerPool: WorkerPool | null = null;
  private workerClient: MeshWorkerClient | null = null;
  /** Optional atlas UV lookup for the worker path's packed-result expansion.
   *  Without it, worker results cannot be textured and are dropped. */
  private readonly uvRectFor: ((blockId: number, faceIndex: number) => UvRect) | null;

  /** GPU bytes attached this frame, fed to the monitor at end of update. */
  private uploadBytesThisFrame = 0;
  /** Optional observability feeder (audit 05); null keeps World headless. */
  private readonly monitor: WorldMonitorHandle | null;

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
    materials: WorldMaterials;
    renderDistance?: number;
    /** Ticking/simulation radius; defaults to CONFIG.simulationDistance (== render by default). */
    simulationDistance?: number;
    /** Active dimension; derives the streamed vertical chunk-layer window. Omit for single-layer. */
    dimension?: DimensionType;
    /** Block-state registry for reading/writing canonical block states. Omit for the default. */
    stateRegistry?: BlockStateRegistry;
    /** Durable owner of unsaved edits (DIRTY-1..5). Omit for cache-only behaviour. */
    editDurability?: WorldEditDurability;
    /** Observability feeder (queue depths, job age, upload bytes). Omit for none. */
    monitor?: WorldMonitorHandle;
    /**
     * Atlas UV lookup used only by the worker-meshing path to expand packed
     * results. Omit unless `useWorkers` is being enabled.
     */
    uvRectFor?: (blockId: number, faceIndex: number) => UvRect;
  }) {
    this.registry = opts.registry;
    this.seed = opts.seed >>> 0;
    this.scene = opts.scene;
    this.mesher = opts.mesher;
    this.generator = opts.generator;
    this.materials = opts.materials;
    this.stateRegistry = opts.stateRegistry ?? createDefaultBlockStateRegistry();
    this.dimension = opts.dimension ?? OVERWORLD_DIMENSION_TYPE;
    this.storage = new CanonicalWorldStorage({
      dimension: this.dimension,
      blockRegistry: this.registry,
      stateRegistry: this.stateRegistry,
    });
    this.editDurability = opts.editDurability ?? null;
    this.renderDistance = opts.renderDistance ?? CONFIG.renderDistance;
    this.simulationDistance = opts.simulationDistance ?? CONFIG.simulationDistance;
    this.rsd = new RenderSimulationDistance(this.renderDistance, this.simulationDistance);
    // Vertical window: 64-block chunk layers derived from the dimension's block extent.
    this.minChunkY = opts.dimension ? Math.floor(opts.dimension.minY / CHUNK_DIMENSIONS.height) : 0;
    this.chunkLayerCount = opts.dimension ? Math.ceil(opts.dimension.height / CHUNK_DIMENSIONS.height) : 1;
    this.sectionsPerChunk = CHUNK_DIMENSIONS.height / 16;
    this.chunkManager = new ChunkManager(opts.registry);
    this.monitor = opts.monitor ?? null;
    this.uvRectFor = opts.uvRectFor ?? null;
    this.lightEngine = new LightUpdateEngine(
      this.lightStorage,
      {
        isOpaque: (x, y, z) => this.registry.isOpaque(this.getBlock(x, y, z)),
        getLuminance: (x, y, z) => blockLuminance(this.getBlock(x, y, z)),
      },
      { minY: this.dimension.minY, maxY: this.dimension.minY + this.dimension.height },
    );
  }

  // ── WorldAccess ────────────────────────────────────────────────────────────

  /** Revision of the chunk map when the one-entry lookup cache was filled. */
  private memoRevision = -1;
  /** Cached lookup coordinates (NaN when unset). */
  private memoCx = NaN;
  private memoCy = NaN;
  private memoCz = NaN;
  /** Cached chunk (or undefined for a cached miss). Valid only while
   *  `memoRevision === chunkManager.revision`. Hot block reads hit the same
   *  chunk repeatedly, so this avoids per-call string-key map hashing. */
  private memoChunk: Chunk | undefined;

  /** Allocation-friendly chunk resolution: numeric compare against the
   *  revision-guarded one-entry cache, falling back to the string-keyed map on
   *  a miss and repopulating the cache. Any chunk-map mutation bumps the
   *  revision, invalidating the cache wholesale. */
  private chunkAt(cx: number, cy: number, cz: number): Chunk | undefined {
    const manager = this.chunkManager;
    if (
      this.memoRevision === manager.revision &&
      this.memoCx === cx &&
      this.memoCy === cy &&
      this.memoCz === cz
    ) {
      return this.memoChunk;
    }
    const chunk = manager.getChunk(cx, cy, cz);
    this.memoRevision = manager.revision;
    this.memoCx = cx;
    this.memoCy = cy;
    this.memoCz = cz;
    this.memoChunk = chunk;
    return chunk;
  }
  getBlock(x: number, y: number, z: number): number {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      return BlockId.Air;
    }
    // Inline floor-div/floor-mod (identical to worldToChunk/worldToLocal for
    // integer inputs) so the hottest engine path allocates nothing.
    const cx = Math.floor(x / CHUNK_DIMENSIONS.width);
    const cy = Math.floor(y / CHUNK_DIMENSIONS.height);
    const cz = Math.floor(z / CHUNK_DIMENSIONS.depth);
    const chunk = this.chunkAt(cx, cy, cz);
    if (!chunk) {
      return BlockId.Air;
    }
    return chunk.getLocal(
      x - cx * CHUNK_DIMENSIONS.width,
      y - cy * CHUNK_DIMENSIONS.height,
      z - cz * CHUNK_DIMENSIONS.depth,
    );
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    // Guard against invalid/out-of-bounds coordinates. The valid Y window is
    // the chunk residency derived from the dimension (single-layer 0..63 for
    // legacy test worlds, 6-layer -64..319 for the live Overworld). Out-of-range
    // writes are no-ops and must not allocate storage or overlay entries.
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      return;
    }
    const minY = this.minChunkY * CHUNK_DIMENSIONS.height;
    const maxYExclusive = (this.minChunkY + this.chunkLayerCount) * CHUNK_DIMENSIONS.height;
    if (y < minY || y >= maxYExclusive) {
      return;
    }
    if (!Number.isInteger(id) || !this.registry.has(id)) {
      return;
    }

    const [cx, cy, cz] = worldToChunk(x, y, z);
    const [lx, ly, lz] = worldToLocal(x, y, z);
    const index = localIndex(lx, ly, lz);
    const key = chunkKey(cx, cy, cz);

    const chunk = this.chunkManager.getChunk(cx, cy, cz);

    // No-op write: skip remeshing and avoid growing the overlay projection.
    if (chunk && chunk.getLocal(lx, ly, lz) === id) {
      return;
    }
    if (!chunk && this.storage.getBlock(x, y, z) === id) {
      return;
    }

    // Canonical write: storage is the single writable truth (also for
    // not-yet-loaded chunks). Materializes column/section lazily and marks
    // dirty for `dirtyColumns()` persistence. For unloaded chunks this is the
    // durable truth even without a resident chunk.
    this.storage.setBlock(x, y, z, id);

    // Projection-only overlay: mirrors the canonical edit for legacy
    // `exportEdits`/`applyEditOverlay`/`WorldEditDurability` consumers. Not
    // authoritative; eviction is safe because `storage` retains the dirty
    // column.
    let overlay = this.editOverlay.get(key);
    if (!overlay) {
      overlay = new Map<number, number>();
      this.editOverlay.set(key, overlay);
    }
    this.touchEditOverlay(key);
    overlay.set(index, id);
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

    // A block on a chunk/section boundary changes the faces of the neighbouring
    // section, so mark that neighbour dirty too. Horizontal invalidation covers
    // x/z section faces (local 0/15); vertical invalidation uses section-local
    // y (y % 16) so interior edits at y 10 do not dirty neighbor sections at
    // same cx/cz different sy, while a face at ly 15/0 still dirties the
    // face-sharing vertical neighbor (including slab boundaries ly 0/63 which
    // correspond to section-local 0/15). Only the face-sharing neighbor is
    // dirtied — interior edits invalidate only the affected section.
    const lxSec = localCoord(x);
    const lzSec = localCoord(z);
    const lySec = localCoord(y);
    if (lxSec === 0) this.markNeighborDirty(cx - 1, cy, cz);
    if (lxSec === 15) this.markNeighborDirty(cx + 1, cy, cz);
    if (lzSec === 0) this.markNeighborDirty(cx, cy, cz - 1);
    if (lzSec === 15) this.markNeighborDirty(cx, cy, cz + 1);
    if (lySec === 0) {
      const ncy = sectionIndex(y - 1) !== sectionIndex(y) ? Math.floor((y - 1) / CHUNK_DIMENSIONS.height) : cy;
      if (ncy !== cy) this.markNeighborDirty(cx, ncy, cz);
    }
    if (lySec === 15) {
      const ncy = sectionIndex(y + 1) !== sectionIndex(y) ? Math.floor((y + 1) / CHUNK_DIMENSIONS.height) : cy;
      if (ncy !== cy) this.markNeighborDirty(cx, ncy, cz);
    }
    // Voxel lighting: queue minimal invalidation for both channels (the engine
    // reads the NEW opacity/luminance through its accessors), and remember the
    // affected chunks so a productive drain remeshes them.
    this.lightEngine.onBlockChanged(x, y, z);

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
    const minY = this.minChunkY * CHUNK_DIMENSIONS.height;
    const maxYExclusive = (this.minChunkY + this.chunkLayerCount) * CHUNK_DIMENSIONS.height;
    if (y < minY || y >= maxYExclusive) {
      return;
    }
    if (!Number.isInteger(blockId) || !this.registry.has(blockId)) {
      return;
    }
    this.setBlock(x, y, z, blockId);
    this.storage.setBlockState(x, y, z, blockId, properties);
  }


  /**
   * The block state at (x, y, z): the canonical live state from dimension-aware
   * storage. Out-of-bounds coordinates resolve to the air default state.
   */
  getBlockState(x: number, y: number, z: number): BlockState {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      return this.stateRegistry.getDefaultState(BlockId.Air);
    }
    if (!this.dimension.containsY(y)) {
      return this.stateRegistry.getDefaultState(BlockId.Air);
    }
    return this.storage.getBlockState(x, y, z);
  }

  /**
   * Iterate every loaded chunk's coordinates. Used by the simulation loop (125)
   * to dispatch random ticks per 16×16×16 section.
   */
  forEachLoadedChunk(fn: (cx: number, cy: number, cz: number) => void): void {
    this.chunkManager.forEachChunk((chunk) => fn(chunk.cx, chunk.cy, chunk.cz));
  }

  /**
   * Whether the block at world coordinates is solid (collidable).
   *
   * Uses the dimension-derived bottom (`minChunkY * CHUNK_SLAB_HEIGHT`) as the
   * invisible floor: any `y` below the streamed vertical window returns `true`
   * so the player cannot fall forever while chunks are un-generated. Inside the
   * window, solidity is read from the live block id via `getBlock`, whose slab
   * routing (`Math.floor(y/64)` / `x - cx*16`) is correct for negative Y/Z/X
   * via `Math.floor` (not truncation). The chunk height appears only as
   * the slab height constant (`CHUNK_DIMENSIONS.height = 64`), never as a world
   * bound — world bounds are `dimension.minY`/`dimension.maxY` (`-64..319`).
   */
  isSolid(x: number, y: number, z: number): boolean {
    // An invisible solid floor below the world prevents the player from
    // falling forever if a chunk is momentarily un-generated or unloaded.
    const bottomY = this.minChunkY * CHUNK_DIMENSIONS.height;
    if (y < bottomY) {
      return true;
    }
    return this.registry.isSolid(this.getBlock(x, y, z));
  }
  /**
   * Export the sparse edit overlay as a versioned, JSON-safe snapshot.
   * Legacy read-old path: iterates the projection-only overlay. New saves
   * MUST use `storage.serialize()` / `GamePersistence.saveChunkColumn` (column
   * serialization) as the write-new path; this method remains for backward
   * compatibility and for tests that round-trip the legacy snapshot format.
   * The overlay is a projection of canonical `storage`; dirty columns in
   * `storage` are the durable truth and survive unload even after overlay
   * LRU eviction.
   */
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

  /** Export canonical column state for new saves (write-new path). */
  exportColumns(): SerializedChunkColumns {
    return this.storage.serialize();
  }

  /**
   * Import canonical column state (write-new path). Returns true when the
   * serialized layout matches this world's dimension. Idempotent: repeated
   * imports of the same payload do not duplicate columns.
   */
  importColumns(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) return false;
    const candidate = data as SerializedChunkColumns;
    if (
      typeof candidate.version !== 'number' ||
      typeof candidate.minSectionY !== 'number' ||
      typeof candidate.sectionCount !== 'number' ||
      !Array.isArray(candidate.columns)
    ) {
      return false;
    }
    try {
      const restored = CanonicalWorldStorage.deserialize(
        candidate,
        this.dimension,
        this.registry,
        this.stateRegistry,
      );
      for (const col of restored.vwa.columns()) {
        this.storage.importColumn(col);
        for (let cy = this.minChunkY; cy < this.minChunkY + this.chunkLayerCount; cy++) {
          const chunk = this.chunkManager.getChunk(col.chunkX, cy, col.chunkZ);
          if (chunk) {
            this.syncChunkFromStorage(chunk);
            this.refreshChunkVoxelCount(chunk);
            chunk.markDirty();
            this.enqueueMeshWithRetry(chunk);
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }


  /**
   * Import a validated edit snapshot. Invalid or foreign entries are ignored,
   * so a corrupt browser save cannot poison chunk storage or the mesher.
   * Returns the number of accepted cell edits.
   * Read-old/write-new: accepts the legacy `WorldEditSnapshot` format, writes
   * through canonical `storage` (dirty columns) and mirrors into the
   * projection overlay idempotently. Repeated imports of the same snapshot
   * do not duplicate entries.
   */
  importEdits(snapshot: unknown): number {
    if (!this.isEditSnapshot(snapshot) || snapshot.seed !== this.seed) {
      return 0;
    }

    let accepted = 0;
    for (const entry of snapshot.edits) {
      const [cx, cy, cz] = entry.chunk;
      if (cy < this.minChunkY || cy >= this.minChunkY + this.chunkLayerCount) {
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
        // Idempotent: only count when overlay or canonical storage actually changes
        const prevOverlay = overlay.get(index);
        const lx = index % 16;
        const lz = Math.floor(index / 16) % 16;
        const ly = Math.floor(index / 256);
        const wx = cx * CHUNK_DIMENSIONS.width + lx;
        const wy = cy * CHUNK_DIMENSIONS.height + ly;
        const wz = cz * CHUNK_DIMENSIONS.depth + lz;
        const canonicalId = this.storage.getBlock(wx, wy, wz);
        const needsOverlay = prevOverlay !== id;
        const needsCanonical = canonicalId !== id;
        if (!needsOverlay && !needsCanonical) {
          continue;
        }
        if (needsOverlay) {
          overlay.set(index, id);
        }
        if (needsCanonical) {
          // Write canonical truth (marks dirty column/section, idempotent)
          this.storage.setBlock(wx, wy, wz, id);
        }
        accepted++;
      }
      if (overlay.size > 0) {
        this.touchEditOverlay(key);
        const chunk = this.chunkManager.getChunk(cx, cy, cz);
        if (chunk?.generated) {
          this.applyEditOverlay(chunk);
          // Ensure canonical edits are reflected in the live chunk even when
          // the overlay projection was stale (read-old path writes canonical)
          this.syncChunkFromStorage(chunk);
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
    this.budgets.beginFrame();
    this.uploadBytesThisFrame = 0;
    this.ensureChunks(playerChunkX, playerChunkZ);
    this.processGeneration();
    this.processMeshing();
    this.processFallingBlocks();
    this.processLightUpdates();
    if (this.needsUnload) {
      this.needsUnload = this.unloadChunks(playerChunkX, playerChunkZ);
    }
    this.feedMonitor();
  }

  /**
   * Streaming priority for a chunk offset from the stream center (audit 04
   * tiers). Approximated by Chebyshev distance — front-facing refinement needs
   * a movement vector World does not track. Lower value dispatches first.
   */
  private streamPriorityFor(dx: number, dz: number): ChunkStreamPriority {
    const r = Math.max(Math.abs(dx), Math.abs(dz));
    if (r <= 1) return ChunkStreamPriority.VisibleNear;
    if (r <= 2) return ChunkStreamPriority.Simulation;
    if (r <= 3) return ChunkStreamPriority.Interaction;
    if (r <= 5) return ChunkStreamPriority.ForwardCorridor;
    return ChunkStreamPriority.Rings;
  }

  /** Render distance the cached scan offsets were built for, or -1 when unbuilt. */
  private streamScanOffsetsRd = -1;
  /** Cached `[dx, dz]` column offsets, nearest-first (see {@link streamScanOffsets}). */
  private streamScanOffsetsCache: readonly (readonly [number, number])[] = [];

  /**
   * Column offsets for {@link ensureChunks}, ordered nearest-first by Chebyshev
   * distance (matching {@link streamPriorityFor}'s tiers).
   *
   * The scan aborts as soon as the bounded generate queue is full, so scan
   * order — not job priority — decides what actually gets queued: a raster
   * `dx = -rd..rd` walk fills the queue from the far corner of the render
   * distance and strands the boot-critical spawn ring at `getReadyProgress`
   * below 1, holding the loading screen up until the far rings happen to
   * drain. Nearest-first queues the spawn ring first.
   *
   * Cached per render distance; a quality-tier change rebuilds it.
   */
  private streamScanOffsets(rd: number): readonly (readonly [number, number])[] {
    if (this.streamScanOffsetsRd === rd) return this.streamScanOffsetsCache;
    const offsets: [number, number][] = [];
    for (let dx = -rd; dx <= rd; dx++) {
      for (let dz = -rd; dz <= rd; dz++) {
        offsets.push([dx, dz]);
      }
    }
    offsets.sort((a, b) => {
      const ra = Math.max(Math.abs(a[0]), Math.abs(a[1]));
      const rb = Math.max(Math.abs(b[0]), Math.abs(b[1]));
      if (ra !== rb) return ra - rb;
      if (a[0] !== b[0]) return a[0] - b[0];
      return a[1] - b[1];
    });
    this.streamScanOffsetsCache = offsets;
    this.streamScanOffsetsRd = rd;
    return this.streamScanOffsetsCache;
  }

  /** Create and queue generation for every missing chunk around the player. */
  private ensureChunks(playerChunkX: number, playerChunkZ: number): boolean {
    const centerChanged = this.streamCenterX !== playerChunkX || this.streamCenterZ !== playerChunkZ;
    if (centerChanged) {
      this.streamCenterX = playerChunkX;
      this.streamCenterZ = playerChunkZ;
      this.needsEnsure = true;
      this.needsUnload = true;
    }
    if (!centerChanged && !this.needsEnsure) {
      return false;
    }

    const rd = this.renderDistance;
    const pipeline = this.chunkManager.pipeline;
    let queueFull = false;
    scan:
    for (const [dx, dz] of this.streamScanOffsets(rd)) {
      const cx = playerChunkX + dx;
      const cz = playerChunkZ + dz;
      for (let cy = this.minChunkY; cy < this.minChunkY + this.chunkLayerCount; cy++) {
        const existing = this.chunkManager.getChunk(cx, cy, cz);
        if (!existing) {
          // Hard safety cap: don't create a chunk whose generation job cannot
          // be queued — it would sit as an un-generated void. ensureChunks
          // runs every frame, so the area is retried once the queue drains.
          // The cap is the pipeline's own generate bound (the old
          // CONFIG.maxQueueSize guard could never trip before it).
          if (pipeline.queueDepth('generate') >= CHUNK_PIPELINE_QUEUE_CAPS.generate) {
            queueFull = true;
            break scan;
          }
          const chunk = this.chunkManager.createChunk(cx, cy, cz);
          // Player ticket: the reason this chunk is kept resident at all.
          this.chunkManager.acquireTicket(cx, cy, cz, createChunkTicket(ChunkTicketType.Player));
          if (!this.enqueueGeneration(chunk, this.streamPriorityFor(dx, dz))) {
            queueFull = true; // rejected at cap: retry on the next scan
            break scan;
          }
        } else if (!existing.generated) {
          // A chunk created earlier whose generation job was dropped or
          // displaced re-queues here; enqueue deduplicates per stage.
          if (!this.enqueueGeneration(existing, this.streamPriorityFor(dx, dz))) {
            queueFull = true;
            break scan;
          }
        }
      }
    }
    // Any displacement means some resident chunk lost its only queued copy —
    // force a re-scan so it is re-queued instead of stranding as a void.
    if (pipeline.takeDisplacedCount() > 0) {
      queueFull = true;
    }
    this.needsEnsure = queueFull;
    return centerChanged;
  }

  private processGeneration(): void {
    const pipeline = this.chunkManager.pipeline;
    let done = 0;
    for (;;) {
      if (done >= CONFIG.budgets.generatePerFrame) break;
      const job = pipeline.dequeue('generate');
      if (!job) break;
      // Time budget: put the job back and stop when this frame's slice is spent.
      if (!this.budgets.tryAcquire('generate', World.TASK_ESTIMATE_MS.generate)) {
        pipeline.enqueue('generate', job.cx, job.cy, job.cz, job.priority);
        break;
      }
      const t0 = performance.now();

      const record = pipeline.getRecord(job.key);
      if (!record) continue;
      // Version token: a job captured before a reset/failure is stale.
      if (pipeline.beginStage(job.key, 'generate', job.version).ok === false) {
        continue;
      }
      const chunk = this.chunkManager.getChunk(job.cx, job.cy, job.cz);
      if (!chunk) {
        pipeline.failStage(job.key, 'generate');
        continue;
      }

      // Missing-column generation populates canonical BlockStates across the full
      // Overworld range (-64..319). The legacy slab path (generateChunk 16x64x16)
      // is no longer authoritative: a missing column is filled via
      // TerrainGenerator.generateColumn(column, stateRegistry) which writes
      // directly into the column's 24 sections (air stays lazy, only touched
      // sections allocate - verified via getSectionIfExists vs getSection).
      // Durable edits are applied AFTER the baseline so regen never overwrites them.
      //
      // Generation is keyed on the *column*, not on this vertical chunk layer.
      // Whether a layer owns an allocated section is not a sound proxy for
      // "generated": every layer above terrain is legitimately all air and never
      // allocates one, so that proxy re-ran the full 384-block column generation
      // once per empty layer (measured 845 calls for 169 columns) and re-stamped
      // terrain over columns restored from persistence. `ChunkColumn.status` is
      // the canonical lifecycle flag; `Full` means terrain exists for the whole
      // column. Persistence marks restored columns `Full` on import.
      const hasGenerateColumn =
        typeof (this.generator as unknown as { generateColumn?: unknown }).generateColumn ===
        'function';

      if (hasGenerateColumn) {
        const column = this.storage.vwa.ensureColumn(job.cx, job.cz);
        if (!isChunkStatusAtLeast(column.getStatus(), ChunkStatus.Full)) {
          (
            this.generator as unknown as {
              generateColumn: (c: ChunkColumn, r: BlockStateRegistry) => void;
            }
          ).generateColumn(column, this.stateRegistry);
          column.advanceStatusTo(ChunkStatus.Full);
        }
        this.syncChunkFromStorage(chunk);
        // `applyEditOverlay` is the only writer that can make this slab diverge
        // from the column it was just synced from, so reconciling its reported
        // cells replaces the previous full 16x16x64 comparison sweep.
        const applied = this.applyEditOverlay(chunk);
        chunk.generated = true;
        chunk.state = ChunkState.Generated;
        this.countChunkVoxels(chunk);
        this.reconcileEditedCellsIntoColumn(chunk, column, applied);
      } else {
        this.generator.generateChunk(chunk);
        this.applyEditOverlay(chunk);
        chunk.generated = true;
        chunk.state = ChunkState.Generated;
        this.countChunkVoxels(chunk);
        const firstId = chunk.blocks[0]!;
        let uniform = true;
        for (let i = 1; i < CHUNK_BLOCK_COUNT; i++) {
          if (chunk.blocks[i] !== firstId) {
            uniform = false;
            break;
          }
        }
        if (uniform) {
          if (firstId !== BlockId.Air) {
            const column = this.storage.vwa.ensureColumn(chunk.cx, chunk.cz);
            const state = this.stateRegistry.getDefaultState(firstId);
            for (let syOffset = 0; syOffset < CHUNK_DIMENSIONS.height / 16; syOffset++) {
              const globalSectionY = chunk.cy * (CHUNK_DIMENSIONS.height / 16) + syOffset;
              const inColumnSy = globalSectionY - this.dimension.minSectionY;
              column.getSection(inColumnSy).fill(state);
              column.markSectionDirty(inColumnSy);
            }
          }
        } else {
          for (let lz = 0; lz < 16; lz++) {
            const wz = chunk.cz * 16 + lz;
            for (let lx = 0; lx < 16; lx++) {
              const wx = chunk.cx * 16 + lx;
              for (let ly = 0; ly < CHUNK_DIMENSIONS.height; ly++) {
                const wy = chunk.cy * CHUNK_DIMENSIONS.height + ly;
                const blockId = chunk.getLocal(lx, ly, lz);
                if (blockId !== BlockId.Air) {
                  this.storage.vwa.setBlockState(
                    wx,
                    wy,
                    wz,
                    this.stateRegistry.getDefaultState(blockId),
                  );
                }
              }
            }
          }
        }
      }

            // Bookkeeping advance through the features/light stages: terrain,
      // overlay application and light seeding all happened above.
      pipeline.completeStage(job.key, 'generate', job.version);
      const features = pipeline.beginStage(job.key, 'features', job.version);
      if (features.ok) {
        this.seedChunkLight(chunk);
        pipeline.completeStage(job.key, 'features', job.version);
        const light = pipeline.beginStage(job.key, 'light', job.version);
        if (light.ok) {
          pipeline.completeStage(job.key, 'light', job.version);
        }
      }

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

      this.enqueueMeshWithRetry(chunk);
      this.budgets.recordActual('generate', performance.now() - t0);
      done++;
    }
  }

  /**
   * Seed the voxel light field for a freshly generated chunk: full-pass skylight
   * column seeding (15 from the top down to the first opaque block) plus block
   * light emitters. Border propagation then happens incrementally through the
   * light engine as edits arrive.
   */
  private seedChunkLight(chunk: Chunk): void {
    const ox = chunk.cx * CHUNK_DIMENSIONS.width;
    const oy = chunk.cy * CHUNK_DIMENSIONS.height;
    const oz = chunk.cz * CHUNK_DIMENSIONS.depth;
    const { width, height, depth } = CHUNK_DIMENSIONS;
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        let sky = 15;
        for (let y = height - 1; y >= 0; y--) {
          const id = chunk.getLocal(x, y, z);
          if (sky > 0 && this.registry.isOpaque(id)) {
            sky = 0;
          }
          if (sky > 0) {
            this.lightStorage.setSkyLight(ox + x, oy + y, oz + z, sky);
          }
          const luminance = blockLuminance(id);
          if (luminance > 0) {
            this.lightStorage.setBlockLight(ox + x, oy + y, oz + z, Math.min(15, luminance));
          }
        }
      }
    }
  }

  /** Budgeted drain of pending light propagation; remeshes affected chunks on change. */
  private processLightUpdates(): void {
    if (this.lightEngine.idle) {
      this.lightDirtyChunks.clear();
      return;
    }
    if (!this.budgets.tryAcquire('light', World.TASK_ESTIMATE_MS.light)) {
      return;
    }
    const t0 = performance.now();
    const result = this.lightEngine.drain({ budgetMs: CONFIG.budgets.lightDrainMs });
    this.budgets.recordActual('light', performance.now() - t0);
    if (result.opsUsed > 0) {
      // Light values changed: every chunk whose cells were invalidated (plus
      // the border neighbours registered alongside them) must re-mesh so the
      // new vertex shading reaches the GPU.
      for (const key of this.lightDirtyChunks) {
        const [cx, cy, cz] = keyToChunk(key);
        const chunk = this.chunkManager.getChunk(cx, cy, cz);
        if (chunk?.generated) {
          chunk.markDirty();
          this.enqueueMeshWithRetry(chunk);
        }
      }
    }
    if (result.completed) {
      this.lightDirtyChunks.clear();
    }
  }

  private processMeshing(): void {
    const pipeline = this.chunkManager.pipeline;
    // Re-admit mesh jobs that were parked while the queue was at capacity.
    // Bounded by the parked count on entry: a job that still cannot be admitted
    // re-parks at the tail via `enqueueMeshWithRetry`, so draining until the
    // queue is empty never terminates once the bounded mesh queue is saturated
    // — which the dimension-aware vertical column reaches on the very first
    // spawn preload (13x13x6 chunks against a 96-job mesh cap).
    for (let remaining = this.retryMeshQueue.length; remaining > 0; remaining--) {
      const job = this.retryMeshQueue.shift();
      if (!job) break;
      this.retryMeshSet.delete(job.key);
      const chunk = this.chunkManager.getChunk(job.cx, job.cy, job.cz);
      if (!chunk) continue;
      const parked = this.retryMeshQueue.length;
      this.enqueueMeshWithRetry(chunk);
      if (this.retryMeshQueue.length > parked) {
        // Re-parked at the tail: the mesh queue has no room for this priority,
        // so the rest of the parked set cannot be admitted this frame either.
        // Stopping here costs one probe per frame instead of one per parked job
        // (each probe resets the chunk's pipeline record, so a saturated queue
        // would otherwise thrash every resident chunk every frame). Shifting
        // before re-parking rotates the head, so no job is starved.
        break;
      }
    }

    let done = 0;
    for (;;) {
      if (done >= CONFIG.budgets.meshPerFrame) break;
      const job = pipeline.dequeue('mesh');
      if (!job) break;
      if (!this.budgets.tryAcquire('mesh-upload', World.TASK_ESTIMATE_MS['mesh-upload'])) {
        pipeline.enqueue('mesh', job.cx, job.cy, job.cz, job.priority);
        break;
      }
      const t0 = performance.now();
      const record = pipeline.getRecord(job.key);
      if (!record) continue;
      if (pipeline.beginStage(job.key, 'mesh', job.version).ok === false) {
        continue; // stale token or unknown chunk
      }
      const chunk = this.chunkManager.getChunk(job.cx, job.cy, job.cz);
      if (!chunk || !chunk.generated) {
        // Generation has not caught up with this entry (defensive: neighbours
        // are only mesh-dirtied once generated). Defer it intact instead of
        // failing — a failed stage would bump the generation token and strand
        // the queued job as stale — and stop draining so a not-yet-generatable
        // entry cannot starve the frame's mesh budget.
        pipeline.enqueue('mesh', job.cx, job.cy, job.cz, job.priority);
        break;
      }

      if (this.useWorkers) {
        this.submitWorkerMeshJob(chunk, record.generation, chunk.meshVersion);
      } else {
        const result = this.mesher.mesh(chunk, (cx, cy, cz) => this.chunkManager.getChunk(cx, cy, cz), {
          inputVersion: record.generation,
          lightSampler: this.mesherLightSampler,
        });
        // Stale rejection: drop results built against a superseded generation. Legacy
        // mesher results carry no `streams` stamp and cannot be staleness-checked;
        // they attach unconditionally (pre-wave behavior).
        const builtVersion = result.streams?.inputVersion;
        if (builtVersion !== undefined && builtVersion !== record.generation) {
          pipeline.failStage(job.key, 'mesh');
          continue;
        }
        this.attach(chunk, result);
        chunk.dirty = false;
        chunk.state = ChunkState.Visible;
        pipeline.completeStage(job.key, 'mesh', job.version);
        // Upload bookkeeping: scene attachment is synchronous here, so the
        // upload stage begins and completes in the same step.
        pipeline.beginStage(job.key, 'upload');
        pipeline.completeStage(job.key, 'upload');
      }
      this.budgets.recordActual('mesh-upload', performance.now() - t0);
      done++;
    }
  }

  private unloadChunks(playerChunkX: number, playerChunkZ: number): boolean {
    // Hysteresis: chunks unload one ring beyond the load radius so a player
    // oscillating around the boundary cannot churn allocations.
    const candidates: Chunk[] = [];
    this.chunkManager.forEachChunk((chunk) => {
      if (
        this.chunkManager.pipeline.shouldUnload(
          chunk.cx - playerChunkX,
          chunk.cz - playerChunkZ,
          this.renderDistance,
        )
      ) {
        candidates.push(chunk);
      }
    });

    let unloaded = 0;
    for (const chunk of candidates) {
      if (unloaded >= CONFIG.budgets.unloadPerFrame) break;
      if (!this.budgets.tryAcquire('unload', World.TASK_ESTIMATE_MS.unload)) break;
      const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);

      this.removeMeshesForChunk(chunk);

      const voxelCount = this.chunkVoxelCounts.get(key);
      if (voxelCount) {
        this.voxels -= voxelCount;
      }
      this.chunkVoxelCounts.delete(key);

      // Drop any parked retry job for this chunk; pipeline queues are purged by
      // markEvicting → cancelForKey inside removeChunk.
      for (let i = this.retryMeshQueue.length - 1; i >= 0; i--) {
        const job = this.retryMeshQueue[i];
        if (job && job.key === key) {
          this.retryMeshQueue.splice(i, 1);
        }
      }
      this.retryMeshSet.delete(key);

      // Drop the chunk's light sections so a reload reseeds them fresh.
      const baseSy = chunk.cy * this.sectionsPerChunk;
      for (let sy = baseSy; sy < baseSy + this.sectionsPerChunk; sy++) {
        this.lightStorage.deleteSection(chunk.cx, sy, chunk.cz);
      }
      this.lightDirtyChunks.delete(key);

      // Dirty unload semantics: canonical storage (Column/Section dirty sets)
      // retains unsaved edits across chunk unload. Do NOT call
      // `storage.clearDirty()` or `removeColumn` here; the column remains
      // in `storage.vwa` with `isDirty`/`dirtyColumns()` visible to the
      // persistence layer (`GamePersistence.saveChunkColumn`). Eviction of
      // the projection-only `editOverlay` entry is safe because the dirty
      // column is the durable truth. The edit overlay is intentionally kept
      // so edits survive reload (until LRU expiry, still safe).
      // removeChunk runs the authoritative eviction flow (markEvicting before
      // release) and cancels outstanding pipeline work.
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
        y <= this.dimension.minY ||
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
    if (y <= this.dimension.minY || !this.dimension.containsY(y) || !Number.isInteger(x) || !Number.isInteger(z)) {
      return;
    }
    const key = `${x},${y},${z}`;
    if (this.fallingSet.has(key)) return;
    this.fallingSet.add(key);
    this.fallingQueue.push([x, y, z]);
  }

  /**
   * Whether the chunk containing `(x,y,z)` is present and generated.
   *
   * Y is gated by `dimension.containsY(y)` (`-64..319` for Overworld) — not by
   * the slab height. Chunk identity for Y uses slab stride
   * `Math.floor(y / CHUNK_DIMENSIONS.height)` (`/64`) with `Math.floor` so
   * negative Y (-1..-64 -> cy -1) routes correctly (not truncated toward zero).
   * Horizontal X/Z likewise use `Math.floor(x/16)` / `floorMod` symmetry with
   * `worldToChunk`/`worldToLocal`, guaranteeing -17 maps to chunk -2 local 15.
   */
  private isLoadedAt(x: number, y: number, z: number): boolean {
    if (!this.dimension.containsY(y)) return false;
    const cx = Math.floor(x / CHUNK_DIMENSIONS.width);
    const cy = Math.floor(y / CHUNK_DIMENSIONS.height);
    const cz = Math.floor(z / CHUNK_DIMENSIONS.depth);
    return this.chunkAt(cx, cy, cz)?.generated === true;
  }

  // ── Queues ─────────────────────────────────────────────────────────────────

  private enqueueGeneration(chunk: Chunk, priority: ChunkStreamPriority): boolean {
    // Deduplicated per stage by the pipeline; displaced only by more urgent
    // work when the bounded queue is full. A `false` return leaves the chunk
    // ungenerated; ensureChunks flags a re-scan so it is retried next frame.
    const ok = this.chunkManager.pipeline.enqueue('generate', chunk.cx, chunk.cy, chunk.cz, priority);
    if (ok) chunk.state = ChunkState.Generating;
    return ok;
  }
  /** Queue a mesh job through the pipeline's bounded mesh stage. */
  private enqueueMesh(chunk: Chunk): boolean {
    this.ensureMeshableRecord(chunk);
    const record = this.chunkManager.pipeline.getRecordByCoords(chunk.cx, chunk.cy, chunk.cz);
    if (!record) {
      return false;
    }
    const priority = this.streamPriorityFor(
      chunk.cx - (this.streamCenterX ?? chunk.cx),
      chunk.cz - (this.streamCenterZ ?? chunk.cz),
    );
    const ok = this.chunkManager.pipeline.enqueue('mesh', chunk.cx, chunk.cy, chunk.cz, priority);
    if (ok) {
      chunk.state = ChunkState.Meshing;
    }
    return ok;
  }

  /**
   * The pipeline state machine is monotonic (`ActiveGpu` only leaves via
   * `Evicting`), but World re-meshes live chunks on every edit and boundary
   * update. For a record already at or past `MeshQueued`, reset it with a new
   * generation (invalidating any stale in-flight results — exactly what we
   * want for a fresh build) and fast-forward the completed worldgen stages;
   * chunk data is unchanged, so no work or light reseeding happens here.
   */
  private ensureMeshableRecord(chunk: Chunk): void {
    const pipeline = this.chunkManager.pipeline;
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    const record = pipeline.getRecord(key);
    if (!record || record.status < ChunkLifecycleStage.MeshQueued) {
      return; // Fresh flow advances stage by stage during generation.
    }
    const reset = (() => {
      // Cancel any queued/in-flight work first: enqueue() deduplicates by
      // keeping the earliest queued job, so a superseded entry must be removed
      // or its captured (now-stale) version would block the fresh one.
      pipeline.cancelForKey(key);
      return pipeline.resetForRegeneration(key);
    })();
    if (!reset) return;
    for (const stage of ['generate', 'features', 'light'] as const) {
      pipeline.beginStage(key, stage, reset.generation);
      pipeline.completeStage(key, stage, reset.generation);
    }
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
    // The pipeline mesh queue is bounded, and the retry queue is bounded by the
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
   * Final fallback: canonical storage column (single writable truth). If a
   * column exists for this (cx,cz), its sections are scanned and any non-air
   * blocks that differ from freshly generated terrain are copied into the
   * chunk and into the projection overlay, so an evicted overlay does not
   * lose edits after the overlay LRU discards them — the dirty column retains
   * them.
   */
  private applyEditOverlay(chunk: Chunk): ReadonlyMap<number, number> | undefined {
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    let overlay = this.editOverlay.get(key);
    if (!overlay) {
      const pending = this.editDurability?.restorePendingChunkEdits(chunk.cx, chunk.cy, chunk.cz);
      if (pending && pending.size > 0) {
        overlay = new Map<number, number>(pending);
        this.editOverlay.set(key, overlay);
        this.touchEditOverlay(key);
      } else if (this.editDurability?.loadCommittedChunkEdits) {
        this.beginEditHydration(chunk.cx, chunk.cy, chunk.cz, key);
      }
      // Final fallback: canonical storage. Covers both evicted-overlay and
      // pure column-persistence cases (negative-Y edits, property edits).
      if (!overlay) {
        const column = this.storage.getColumn(chunk.cx, chunk.cz);
        if (column) {
          let found = false;
          const cy = chunk.cy;
          for (let ly = 0; ly < CHUNK_DIMENSIONS.height; ly++) {
            const wy = cy * CHUNK_DIMENSIONS.height + ly;
            if (!this.dimension.containsY(wy)) continue;
            for (let lz = 0; lz < 16; lz++) {
              for (let lx = 0; lx < 16; lx++) {
                const id = column.getBlockState(lx, wy, lz).blockId;
                if (id === BlockId.Air) continue;
                // Only materialize non-air that differs from generated chunk;
                // air reads are already correct and scanning air is skipped
                // to avoid allocating overlay entries for empty space.
                const idx = localIndex(lx, ly, lz);
                if (chunk.blocks[idx] !== id) {
                  if (!overlay) {
                    overlay = new Map<number, number>();
                    this.editOverlay.set(key, overlay);
                  }
                  overlay.set(idx, id);
                  chunk.blocks[idx] = id;
                  found = true;
                }
              }
            }
          }
          if (found && overlay) {
            this.touchEditOverlay(key);
            return undefined;
          }
          if (!overlay) {
            return undefined;
          }
        } else {
          if (!overlay) return undefined;
        }
      }
      if (!overlay) {
        return undefined;
      }
    }
    this.touchEditOverlay(key);
    for (const [index, id] of overlay) {
      chunk.blocks[index] = id;
    }
    // Reported so generation can reconcile exactly these cells back into the
    // canonical column instead of re-comparing all 16x16x64 slab cells.
    return overlay;
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

  private attach(chunk: Chunk, result: ChunkMeshResult): void {
    this.attachGeometries(chunk, [
      { geometry: result.opaque, material: this.materials.opaque, renderOrder: 0, castShadow: true },
      { geometry: result.cutout, material: this.materials.cutout, renderOrder: 0, castShadow: true },
      // `translucent` is the canonical translucent stream (`transparent`
      // aliases it in legacy results); attach exactly one mesh for it.
      { geometry: result.translucent ?? result.transparent, material: this.materials.transparent, renderOrder: 1, castShadow: false },
      // Fluid renders last; depthWrite behaviour is owned by the fluid material.
      { geometry: result.fluid, material: this.materials.fluid, renderOrder: 2, castShadow: false },
    ]);
  }

  /**
   * Swap a chunk's scene meshes for the given stream entries. Render order:
   * opaque/cutout 0, translucent 1, fluid 2. Entries with no geometry or no
   * material (optional cutout/fluid) are skipped; replaced geometries are
   * disposed as before.
   */
  private attachGeometries(
    chunk: Chunk,
    entries: ReadonlyArray<{
      geometry: THREE.BufferGeometry | null;
      material: THREE.MeshLambertMaterial | undefined;
      renderOrder: number;
      castShadow: boolean;
    }>,
  ): void {
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    this.removeMeshesForChunk(chunk);

    const meshes: THREE.Mesh[] = [];
    let tris = 0;
    const px = chunk.cx * CHUNK_DIMENSIONS.width;
    const py = chunk.cy * CHUNK_DIMENSIONS.height;
    const pz = chunk.cz * CHUNK_DIMENSIONS.depth;

    for (const entry of entries) {
      if (!entry.geometry || !entry.material) continue;
      const mesh = new THREE.Mesh(entry.geometry, entry.material);
      mesh.position.set(px, py, pz);
      mesh.renderOrder = entry.renderOrder;
      mesh.castShadow = entry.castShadow;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      meshes.push(mesh);
      tris += this.triangleCount(entry.geometry);
      this.uploadBytesThisFrame += estimateGeometryBytes(entry.geometry);
    }

    this.meshGroups.set(key, meshes);
    this.chunkTriangles.set(key, tris);
    this.triangles += tris;
  }

  // ── Worker meshing path (inert while `useWorkers` is false) ────────────────

  /**
   * Lazily construct the shared worker pool + mesh client. Returns false when
   * workers cannot be used (flag off or no UV lookup for result expansion).
   */
  private ensureWorkerMeshing(): boolean {
    if (!this.useWorkers) return false;
    if (this.workerClient) return true;
    const size = CONFIG.budgets.workerPoolSize > 0 ? CONFIG.budgets.workerPoolSize : computeWorkerPoolSize();
    this.workerPool = new WorkerPool({
      size,
      spawn: () => new Worker(new URL('../rendering/MeshWorkerEntry.ts', import.meta.url), { type: 'module' }),
    });
    this.workerClient = new MeshWorkerClient({ pool: this.workerPool });
    return true;
  }

  /**
   * Submit one per-section meshing job for a chunk (worker path). Results are
   * consumed through the same stale-check + attach path as sync builds.
   */
  private submitWorkerMeshJob(chunk: Chunk, generation: number, meshVersion: number): void {
    if (!this.ensureWorkerMeshing() || !this.workerClient) {
      // Workers unavailable (e.g. no uvRectFor): fall back to the sync mesher
      // so the chunk never strands unmeshed.
      const record = this.chunkManager.pipeline.getRecordByCoords(chunk.cx, chunk.cy, chunk.cz);
      if (!record) return;
      const result = this.mesher.mesh(chunk, (cx, cy, cz) => this.chunkManager.getChunk(cx, cy, cz), {
        inputVersion: generation,
        lightSampler: this.mesherLightSampler,
      });
      // Legacy results without a streams stamp attach unconditionally (see sync path).
      const builtVersion = result.streams?.inputVersion;
      if (builtVersion === undefined || builtVersion === generation) {
        this.attach(chunk, result);
        chunk.dirty = false;
        chunk.state = ChunkState.Visible;
      }
      return;
    }

    const sectionsY = CHUNK_DIMENSIONS.height / 16;
    for (let sy = 0; sy < sectionsY; sy++) {
      const payload = this.buildSectionPayload(chunk, sy);
      if (!payload) continue;
      this.workerClient.setGenerationToken(generation);
      this.workerClient.requestSection(payload, (result) => {
        this.consumeWorkerMeshResult(chunk.cx, chunk.cy, chunk.cz, generation, meshVersion, result);
      });
    }
  }

  /** Build the structured-clone payload for one 16³ section, or null when empty. */
  private buildSectionPayload(chunk: Chunk, sectionIndex: number): MeshSectionRequestPayload | null {
    const baseX = chunk.cx * CHUNK_DIMENSIONS.width;
    const baseY = chunk.cy * CHUNK_DIMENSIONS.height + sectionIndex * 16;
    const baseZ = chunk.cz * CHUNK_DIMENSIONS.depth;
    const cells: Array<number | null> = new Array(4096);
    let nonAir = 0;
    for (let y = 0; y < 16; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const id = this.getBlock(baseX + x, baseY + y, baseZ + z);
          if (id !== BlockId.Air) nonAir++;
          cells[x + y * 16 + z * 256] = id;
        }
      }
    }
    if (nonAir === 0) return null;
    const skyLight: number[] = new Array(4096);
    const blockLight: number[] = new Array(4096);
    for (let y = 0; y < 16; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const wx = baseX + x;
          const wy = baseY + y;
          const wz = baseZ + z;
          const i = x + y * 16 + z * 256;
          skyLight[i] = this.lightStorage.getSkyLight(wx, wy, wz);
          blockLight[i] = this.lightStorage.getBlockLight(wx, wy, wz);
        }
      }
    }
    const opaqueIds: number[] = [];
    for (const def of this.registry.all()) {
      if (def.opaque) opaqueIds.push(def.id);
    }
    return {
      sectionX: chunk.cx * (CHUNK_DIMENSIONS.width / 16),
      sectionY: chunk.cy * this.sectionsPerChunk + sectionIndex,
      sectionZ: chunk.cz * (CHUNK_DIMENSIONS.depth / 16),
      cells,
      opaqueIds,
      skyLight,
      blockLight,
    };
  }

  /**
   * Stale-check + attach for one finished worker section. The whole chunk
   * re-meshes through the sync path if any section arrives stale.
   */
  private consumeWorkerMeshResult(
    cx: number,
    cy: number,
    cz: number,
    generation: number,
    meshVersion: number,
    result: MeshSectionResultPayload,
  ): void {
    const pipeline = this.chunkManager.pipeline;
    const record = pipeline.getRecord(chunkKey(cx, cy, cz));
    // Stale rejection: chunk gone or regenerated since submission.
    if (!record || record.generation !== generation) return;
    // Same-generation edits are caught by the legacy meshVersion guard.
    const chunk = this.chunkManager.getChunk(cx, cy, cz);
    if (!chunk || chunk.meshVersion !== meshVersion) return;
    if (!this.uvRectFor) return; // cannot texture packed quads without atlas UVs

    const info: PackedMeshExpandInfo = {
      uvFor: (blockId, faceIndex) => this.uvRectFor!(blockId, faceIndex),
      renderLayerOf: (blockId) =>
        this.registry.get(blockId).renderCategory === RenderCategory.Transparent
          ? ('translucent' as MeshStreamName)
          : ('opaque' as MeshStreamName),
      buildGeometry: geometryFromMeshStream,
    };
    // Both transport forms share one expansion route: quad results pack here, packed
    // worker-entry results arrive pre-packed; either way the stride-22 buffer decodes
    // into four-stream geometries.
    const packed = result.packed ?? packQuadsToTypedArrays(result.quads);
    const geometries = expandPackedMeshResult(packed, info);
    this.attachGeometries(chunk, [
      { geometry: geometries.opaque, material: this.materials.opaque, renderOrder: 0, castShadow: true },
      { geometry: geometries.cutout, material: this.materials.cutout, renderOrder: 0, castShadow: true },
      { geometry: geometries.translucent, material: this.materials.transparent, renderOrder: 1, castShadow: false },
      { geometry: geometries.fluid, material: this.materials.fluid, renderOrder: 2, castShadow: false },
    ]);
  }

  // ── Observability ──────────────────────────────────────────────────────────

  /** Push queue depths / job age / upload bytes to the optional monitor. */
  private feedMonitor(): void {
    if (!this.monitor) return;
    const pipeline = this.chunkManager.pipeline;
    this.monitor.setQueueDepth('generate', pipeline.queueDepth('generate'));
    this.monitor.setQueueDepth('mesh', pipeline.queueDepth('mesh') + this.retryMeshQueue.length);
    this.monitor.setQueueDepth('upload', pipeline.queueDepth('upload'));
    this.monitor.setQueueDepth('unload', 0);
    this.monitor.setOldestJobAgeMs(pipeline.oldestJobAgeMs());
    this.monitor.recordUploadBytes(this.uploadBytesThisFrame);
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
    // Only generated neighbours can remesh: an ungenerated one has no buildable
    // state, and queueing mesh work for it would burn slots on invalid
    // transitions. When it generates, its own pass re-meshes this boundary.
    if (neighbor?.generated) {
      neighbor.markDirty();
      // Light (like faces) crosses chunk borders; a border edit's propagation
      // can change the neighbour's shading, so track it for drain remeshing.
      this.lightDirtyChunks.add(chunkKey(cx, cy, cz));
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

  /** Copy canonical column state into a loaded chunk's block array (storage → chunk). */
  /**
   * Push the cells that {@link applyEditOverlay} wrote into a freshly generated
   * slab back into the canonical column.
   *
   * After `syncChunkFromStorage`, the slab equals the column by construction, so
   * the overlay is the only source of divergence. Reconciling just those cells
   * replaces a full 16x16x64 (16384-cell) `getBlockState` comparison sweep that
   * ran for every generated chunk.
   */
  private reconcileEditedCellsIntoColumn(
    chunk: Chunk,
    column: ChunkColumn,
    applied: ReadonlyMap<number, number> | undefined,
  ): void {
    if (applied === undefined || applied.size === 0) return;
    const { width, height, depth } = CHUNK_DIMENSIONS;
    const baseY = chunk.cy * height;
    const baseX = chunk.cx * width;
    const baseZ = chunk.cz * depth;
    for (const [index, id] of applied) {
      // Inverse of `localIndex(lx, ly, lz)` = `lx + lz * width + ly * width * depth`.
      const lx = index % width;
      const lz = Math.floor(index / width) % depth;
      const ly = Math.floor(index / (width * depth));
      const wy = baseY + ly;
      if (!this.dimension.containsY(wy)) continue;
      if (column.getBlockState(lx, wy, lz).blockId === id) continue;
      if (id === BlockId.Air) {
        // Air is the implicit default: only write it when the section is already
        // materialized, so reconciliation never forces a lazy section to allocate.
        const sy = column.sectionIndexForY(wy);
        if (!column.getSectionIfExists(sy)) continue;
      }
      this.storage.vwa.setBlockState(
        baseX + lx,
        wy,
        baseZ + lz,
        this.stateRegistry.getDefaultState(id),
      );
    }
  }

  private syncChunkFromStorage(chunk: Chunk): void {
    const column = this.storage.getColumn(chunk.cx, chunk.cz);
    if (!column) return;
    for (let ly = 0; ly < CHUNK_DIMENSIONS.height; ly++) {
      const wy = chunk.cy * CHUNK_DIMENSIONS.height + ly;
      if (!this.dimension.containsY(wy)) continue;
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          const id = column.getBlockState(lx, wy, lz).blockId;
          const idx = localIndex(lx, ly, lz);
          chunk.blocks[idx] = id;
        }
      }
    }
  }

  /** Dirty columns tracked by canonical storage (single writable truth). */
  getDirtyColumns(): ChunkColumn[] {
    return this.storage.dirtyColumns();
  }

  /** Whether canonical storage has unsaved changes. */
  get isStorageDirty(): boolean {
    return this.storage.isDirty;
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
      pendingGeneration: this.chunkManager.pipeline.queueDepth('generate'),
      pendingMesh:
        this.chunkManager.pipeline.queueDepth('mesh') +
        this.chunkManager.pipeline.queueDepth('upload') +
        this.retryMeshQueue.length,
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
        // Overworld has 6 vertical slabs ( -1..4 ). Checking only the bottom
        // slab (-1) is not where the player spawns (surface at cy 0). Check
        // the surface slab (cy 0) where the spawn height (~32) lives; for
        // single-layer legacy worlds minChunkY is 0 so this is still correct.
        // A generated surface chunk is sufficient to hide the loading screen;
        // its mesh will attach within a few frames.
        const surfaceCy = 0;
        const chunk = this.chunkManager.getChunk(playerChunkX + dx, surfaceCy, playerChunkZ + dz);
        if (chunk?.generated) {
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
            this.chunkManager.acquireTicket(cx, cy, cz, createChunkTicket(ChunkTicketType.Player));
          }
          if (!chunk.generated) {
            // Spawn-area preloads are the boot-critical set, so they take the
            // normal distance tiers (center = VisibleNear), not the speculative
            // Preload tier — otherwise the player's own chunk generates last.
            this.enqueueGeneration(chunk, this.streamPriorityFor(dx, dz));
          } else if (chunk.state !== ChunkState.Visible) {
            this.enqueueMeshWithRetry(chunk);
          }
        }
      }
    }
    this.needsEnsure = true;
  }

  dispose(): void {
    this.chunkManager.forEachChunk((chunk) => this.removeMeshesForChunk(chunk));
    // Outstanding jobs fail through pool.dispose → onFailure, which cancels
    // the client's pending entries; late results resolve as stale.
    this.workerClient = null;
    if (this.workerPool) {
      this.workerPool.dispose();
      this.workerPool = null;
    }
    this.chunkManager.dispose();
    this.lightEngine.clearPending();
    this.lightStorage.clear();
    this.lightDirtyChunks.clear();
    this.retryMeshQueue.length = 0;
    this.retryMeshSet.clear();
    this.fallingQueue.length = 0;
    this.fallingSet.clear();
    this.meshGroups.clear();
    this.chunkTriangles.clear();
    this.chunkVoxelCounts.clear();
    this.editOverlay.clear();
    this.editOverlayAccessOrder.length = 0;
    this.streamCenterX = null;
    this.streamCenterZ = null;
    this.needsEnsure = true;
    this.needsUnload = false;
    this.triangles = 0;
    this.voxels = 0;
  }
}
