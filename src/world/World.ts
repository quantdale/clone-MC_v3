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
import { SECTION_SIZE } from '../math/SectionCoordinate';
import type { ChunkMeshResult } from './MeshingTypes';
import type { UvRect, MeshStreamName } from './MeshingTypes';
import {
  MeshWorkerClient,
  expandPackedMeshResult,
  packQuadsToTypedArrays,
  type MeshSectionRequestTransport,
  type MeshSectionResultPayload,
  type PackedMeshExpandInfo,
} from '../rendering/WorkerMeshing';
import type { MeshSectionTransferPayload } from '../rendering/MeshSectionTransfer';
import { WorkerPool, computeWorkerPoolSize } from '../engine/WorkerPool';
import { WORKER_PROTOCOL_VERSION } from '../rendering/WorkerJobProtocol';
import {
  createMeshWorkerRegistryTable,
  type MeshWorkerRegistryTable,
} from '../rendering/MeshWorkerRegistry';
import {
  CHUNK_BLOCK_COUNT,
  CHUNK_DIMENSIONS,
  chunkKey,
  decodeLegacySlabIndex,
  floorDiv,
  keyToChunk,
  localIndex,
  worldToChunk,
  worldToLocal,
} from './WorldCoordinates';
import { localCoord, sectionIndex } from '../math/SectionCoordinate';
import type { SerializedChunkColumns } from './VerticalWorldAccess';
import type { ChunkColumn } from './ChunkColumn';
import {
  captureSectionVersionSnapshot,
  isSectionVersionSnapshotCurrent,
  findSectionVersionSnapshot,
  type SectionVersionSnapshot,
} from './SectionVersionSnapshot';
import { extractSectionSnapshot } from './SectionSnapshot';
/** A queued meshing job; carries the meshVersion captured at queue time. */
interface MeshJob {
  key: string;
  cx: number;
  cy: number;
  cz: number;
  version: number;
}

interface WorkerMeshBatch {
  readonly key: string;
  readonly generation: number;
  readonly meshVersion: number;
  readonly chunkY: number;
  readonly versionSnapshot: SectionVersionSnapshot;
  readonly canonical: boolean;
  readonly sectionKeys: Set<string>;
  readonly jobIds: Set<string>;
  readonly geometries: Array<{
    geometry: THREE.BufferGeometry | null;
    material: THREE.MeshLambertMaterial | undefined;
    renderOrder: number;
    castShadow: boolean;
    offsetY: number;
    sectionX: number;
    sectionY: number;
    sectionZ: number;
  }>;
  remaining: number;
  failed: boolean;
  completed: boolean;
}

function canonicalSectionKey(sectionX: number, sectionY: number, sectionZ: number): string {
  return `${sectionX},${sectionY},${sectionZ}`;
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

/** Persisted worldgen baseline compatibility used to protect existing-world regeneration. */
export type WorldGenerationBaseline = 'current' | 'legacy-unknown' | 'unsupported';

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
  /** Lowest streamed chunk-Y layer (derived from the explicit dimension when supplied). */
  private readonly minChunkY: number;
  /** Number of vertical chunk layers streamed around the player (1 by default). */
  private readonly chunkLayerCount: number;
  /** Omitted dimensions retain the narrow legacy fixture contract; live Game always supplies one. */
  private readonly usesExplicitDimension: boolean;
  /** Generator contract selected by persistence; non-current existing worlds never regenerate. */
  private generationBaseline: WorldGenerationBaseline;

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
  /** Canonical columns whose initial light field was seeded for the current residency. */
  private readonly seededLightColumns = new Set<string>();
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
  private useWorkers: boolean;
  private workerPool: WorkerPool | null = null;
  private workerClient: MeshWorkerClient | null = null;
  /** Optional test/integration seam; production defaults to the Vite module worker below. */
  private readonly workerFactory: (() => Worker) | null;
  private workerCompletedCount = 0;
  private workerFailureCount = 0;
  private workerFallbackCount = 0;
  /** Immutable registry-derived classification shared with every mesh worker. */
  private readonly meshRegistryTable: MeshWorkerRegistryTable;
  private readonly workerMeshBatches = new Map<string, WorkerMeshBatch>();
  /** Optional atlas UV lookup for the worker path's packed-result expansion.
   *  Without it, worker results cannot be textured and are dropped. */
  private readonly uvRectFor: ((blockId: number, faceIndex: number) => UvRect) | null;

  /** GPU bytes attached this frame, fed to the monitor at end of update. */
  private uploadBytesThisFrame = 0;
  /** Context-loss gate: no worker result or scene replacement may publish while lost. */
  private contextLost = false;
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
  /** Number of out-of-range resident slabs remaining after the last unload pass. */
  private pendingUnloadValue = 0;

  /** Live scene meshes per chunk key (for disposal on unload / re-mesh). */
  private readonly meshGroups = new Map<string, THREE.Mesh[]>();
  /** Canonical explicit-dimension section meshes, keyed by section coordinates. */
  private readonly sectionMeshGroups = new Map<string, THREE.Mesh[]>();
  /** Geometry identities already released by this World; prevents duplicate disposal across stale paths. */
  private readonly disposedGeometries = new WeakSet<THREE.BufferGeometry>();
  /** Triangles per canonical section mesh group. */
  private readonly sectionTriangles = new Map<string, number>();
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
    /** Optional worker constructor seam for deterministic integration tests. */
    workerFactory?: () => Worker;
    /** Explicit opt-in for validated worker section meshing; defaults to synchronous fallback. */
    workerMeshing?: boolean;
    /**
     * Atlas UV lookup used only by the worker-meshing path to expand packed
     * results. Omit unless `useWorkers` is being enabled.
     */
    uvRectFor?: (blockId: number, faceIndex: number) => UvRect;
  }) {
    this.registry = opts.registry;
    this.meshRegistryTable = createMeshWorkerRegistryTable(
      this.registry.all(),
      [BlockId.Water, BlockId.Lava],
    );
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
    // Explicit live dimensions cover every slab intersecting [minY, maxY].
    // Omitted dimensions retain the narrow legacy fixture contract; the
    // production Game composition always supplies a dimension.
    this.usesExplicitDimension = opts.dimension !== undefined;
    this.generationBaseline = 'current';
    if (this.usesExplicitDimension) {
      this.minChunkY = floorDiv(this.dimension.minY, CHUNK_DIMENSIONS.height);
      const maxChunkY = floorDiv(this.dimension.maxY, CHUNK_DIMENSIONS.height);
      this.chunkLayerCount = maxChunkY - this.minChunkY + 1;
    } else {
      this.minChunkY = 0;
      this.chunkLayerCount = 1;
    }
    this.sectionsPerChunk = CHUNK_DIMENSIONS.height / 16;
    this.chunkManager = new ChunkManager(opts.registry);
    this.monitor = opts.monitor ?? null;
    this.workerFactory = opts.workerFactory ?? null;
    this.useWorkers = opts.workerMeshing ?? false;
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

  /** Select the persisted generator contract before streaming starts. */
  setGenerationBaseline(baseline: WorldGenerationBaseline): void {
    this.generationBaseline = baseline;
  }

  /** Whether this world may create a new generated baseline. */
  get canGenerateBaseline(): boolean {
    return this.generationBaseline === 'current';
  }

  // ── WorldAccess ────────────────────────────────────────────────────────────

  /** Reused per-(x,z) skylight carry buffer for {@link seedChunkLight}; avoids a
   *  256-entry allocation per generated chunk. */
  private readonly skySeedScratch = new Uint8Array(
    CHUNK_DIMENSIONS.width * CHUNK_DIMENSIONS.depth,
  );

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
    if (this.usesExplicitDimension && !this.dimension.containsY(y)) {
      return BlockId.Air;
    }
    // ID reads are a projection of canonical storage. Resident `Chunk.blocks`
    // remains a meshing projection only; consulting it here would make an edit
    // disappear as soon as its slab unloads.
    return this.storage.getBlock(x, y, z);
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    if (!Number.isInteger(id) || !this.registry.has(id)) {
      return;
    }
    this.applyCanonicalState(x, y, z, this.stateRegistry.getDefaultState(id));
  }

  /**
   * Write a resolved canonical state and update the resident compatibility
   * projection, invalidation, lighting, and edit bridge exactly once.
   */
  private applyCanonicalState(x: number, y: number, z: number, state: BlockState): void {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      return;
    }
    const minY = this.usesExplicitDimension
      ? this.dimension.minY
      : this.minChunkY * CHUNK_DIMENSIONS.height;
    const maxYExclusive = this.usesExplicitDimension
      ? this.dimension.maxY + 1
      : (this.minChunkY + this.chunkLayerCount) * CHUNK_DIMENSIONS.height;
    if (y < minY || y >= maxYExclusive || !this.registry.has(state.blockId)) {
      return;
    }

    const [cx, cy, cz] = worldToChunk(x, y, z);
    const [lx, ly, lz] = worldToLocal(x, y, z);
    const index = localIndex(lx, ly, lz);
    const key = chunkKey(cx, cy, cz);
    const chunk = this.chunkManager.getChunk(cx, cy, cz);
    const oldState = this.storage.getBlockState(x, y, z);

    // Compare the canonical state id, not just blockId: property-bearing state
    // changes must invalidate and remesh even when the block type is unchanged.
    if (oldState.id === state.id) {
      return;
    }

    // Canonical write: this is the single writable mutation path. It updates
    // section version, dirty section/column state, and heightmaps once.
    this.storage.setCanonicalState(x, y, z, state);

    // Projection-only overlay: mirrors the canonical edit for legacy
    // `exportEdits`/`applyEditOverlay`/`WorldEditDurability` consumers.
    let overlay = this.editOverlay.get(key);
    if (!overlay) {
      overlay = new Map<number, number>();
      this.editOverlay.set(key, overlay);
    }
    this.touchEditOverlay(key);
    overlay.set(index, state.blockId);
    this.editDurability?.captureChunkEdits(cx, cy, cz, overlay);

    if (!chunk) {
      return;
    }

    const oldId = oldState.blockId;
    // The legacy slab is a bounded render/compatibility projection only. Keep
    // it coherent for the current slab mesher, but never consult it for world
    // truth and never let it become an independent edit authority.
    chunk.setProjectionLocal(lx, ly, lz, state.blockId);
    if (!this.usesExplicitDimension) {
      chunk.markDirty();
    }
    if (chunk.generated && oldId !== state.blockId) {
      const delta = (state.blockId !== BlockId.Air ? 1 : 0) - (oldId !== BlockId.Air ? 1 : 0);
      if (delta !== 0) {
        this.voxels += delta;
        this.chunkVoxelCounts.set(key, (this.chunkVoxelCounts.get(key) ?? 0) + delta);
      }
    }
    const lxSec = localCoord(x);
    const lzSec = localCoord(z);
    const lySec = localCoord(y);
    if (this.usesExplicitDimension) {
      this.enqueueCanonicalSectionDependency(cx, sectionIndex(y), cz);
    }
    if (lxSec === 0) {
      if (this.usesExplicitDimension) this.enqueueCanonicalSectionDependency(sectionIndex(x) - 1, sectionIndex(y), sectionIndex(z));
      else this.markNeighborDirty(cx - 1, cy, cz);
    }
    if (lxSec === 15) {
      if (this.usesExplicitDimension) this.enqueueCanonicalSectionDependency(sectionIndex(x) + 1, sectionIndex(y), sectionIndex(z));
      else this.markNeighborDirty(cx + 1, cy, cz);
    }
    if (lzSec === 0) {
      if (this.usesExplicitDimension) this.enqueueCanonicalSectionDependency(sectionIndex(x), sectionIndex(y), sectionIndex(z) - 1);
      else this.markNeighborDirty(cx, cy, cz - 1);
    }
    if (lzSec === 15) {
      if (this.usesExplicitDimension) this.enqueueCanonicalSectionDependency(sectionIndex(x), sectionIndex(y), sectionIndex(z) + 1);
      else this.markNeighborDirty(cx, cy, cz + 1);
    }
    if (lySec === 0) {
      if (this.usesExplicitDimension) this.enqueueCanonicalSectionDependency(sectionIndex(x), sectionIndex(y) - 1, sectionIndex(z));
      else {
        const ncy = sectionIndex(y - 1) !== sectionIndex(y) ? floorDiv(y - 1, CHUNK_DIMENSIONS.height) : cy;
        if (ncy !== cy) this.markNeighborDirty(cx, ncy, cz);
      }
    }
    if (lySec === 15) {
      if (this.usesExplicitDimension) this.enqueueCanonicalSectionDependency(sectionIndex(x), sectionIndex(y) + 1, sectionIndex(z));
      else {
        const ncy = sectionIndex(y + 1) !== sectionIndex(y) ? floorDiv(y + 1, CHUNK_DIMENSIONS.height) : cy;
        if (ncy !== cy) this.markNeighborDirty(cx, ncy, cz);
      }
    }
    this.lightEngine.onBlockChanged(x, y, z);
    this.enqueueMeshWithRetry(chunk);
    if (state.blockId === BlockId.Sand || state.blockId === BlockId.Gravel) {
      this.enqueueFalling(x, y, z);
    }
    this.enqueueFalling(x, y + 1, z);
  }

  /**
   * Write the canonical block state for `blockId` with the given property values
   * at (x, y, z). Resolve before mutation so invalid assignments cannot partially
   * alter the world, and route the resolved state through one mutation path.
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
    const minY = this.usesExplicitDimension
      ? this.dimension.minY
      : this.minChunkY * CHUNK_DIMENSIONS.height;
    const maxYExclusive = this.usesExplicitDimension
      ? this.dimension.maxY + 1
      : (this.minChunkY + this.chunkLayerCount) * CHUNK_DIMENSIONS.height;
    if (y < minY || y >= maxYExclusive) {
      return;
    }
    if (!Number.isInteger(blockId) || !this.registry.has(blockId)) {
      return;
    }
    const state = this.stateRegistry.lookup(blockId, { ...properties });
    this.applyCanonicalState(x, y, z, state);
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
   * Iterate materialized canonical sections in resident columns. This is the
   * authoritative section projection for simulation/debug consumers; it never
   * derives Y from the legacy 64-block slab coordinate.
   */
  forEachLoadedSection(fn: (sectionX: number, sectionY: number, sectionZ: number) => void): void {
    for (const column of this.storage.columns()) {
      for (let sectionIndexInColumn = 0; sectionIndexInColumn < column.sectionCount; sectionIndexInColumn++) {
        if (!column.hasSection(sectionIndexInColumn)) continue;
        fn(
          column.chunkX,
          column.minSectionY + sectionIndexInColumn,
          column.chunkZ,
        );
      }
    }
  }

  /**
   * Iterate every loaded chunk's coordinates. Used by compatibility consumers
   * that still require the bounded 64-high slab projection.
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
    const bottomY = this.usesExplicitDimension
      ? this.dimension.minY
      : this.minChunkY * CHUNK_DIMENSIONS.height;
    if (y < bottomY) {
      return true;
    }
    if (this.usesExplicitDimension && y > this.dimension.maxY) {
      return false;
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
        col.markMaterializedSectionsMeshDirty();
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
        const local = decodeLegacySlabIndex(index);
        if (!local) continue;
        const wx = cx * CHUNK_DIMENSIONS.width + local.lx;
        const wy = cy * CHUNK_DIMENSIONS.height + local.ly;
        const wz = cz * CHUNK_DIMENSIONS.depth + local.lz;
        // Legacy slab payloads may straddle a dimension boundary (for example
        // cy=-1 contains -64..-1 when minY=-1). Validate the actual cell Y,
        // not only the slab coordinate, before touching the projection or
        // canonical storage.
        if (!this.dimension.containsY(wy)) {
          continue;
        }
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
    if (this.contextLost) return;
    this.budgets.beginFrame();
    this.uploadBytesThisFrame = 0;
    this.ensureChunks(playerChunkX, playerChunkZ);
    this.processGeneration();
    this.processMeshing();
    this.processFallingBlocks();
    this.processLightUpdates();
    // Generation, meshing, and light propagation can all enqueue work after
    // ensureChunks() has scanned the resident area. A higher-priority enqueue
    // may displace a queued mesh job in any of those stages; defer the rescan
    // until the next frame so the displaced generated chunk is re-admitted.
    if (this.chunkManager.pipeline.takeDisplacedCount() > 0) {
      this.needsEnsure = true;
    }
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
        } else if (existing.state !== ChunkState.Visible || existing.dirty) {
          // Mesh jobs can be displaced by a more urgent boundary remesh. The
          // pipeline reports that displacement, but the compatibility chunk is
          // already generated, so generation-only rescans would leave it
          // permanently Meshing/dirty with no queued work.
          this.enqueueMeshWithRetry(existing);
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

      if (!this.canGenerateBaseline) {
        // Existing worlds with an unknown/unsupported baseline are protected from silent terrain
        // replacement regardless of which generator API a compatibility adapter exposes.
        // Persisted columns were imported before this job; an absent column remains canonical air
        // until an explicit compatible generator/upgrade is supplied.
        const column = this.storage.vwa.ensureColumn(job.cx, job.cz);
        column.advanceStatusTo(ChunkStatus.Full);
        this.syncChunkFromStorage(chunk);
        const applied = this.applyEditOverlay(chunk, true);
        chunk.generated = true;
        chunk.state = ChunkState.Generated;
        this.countChunkVoxels(chunk);
        this.reconcileEditedCellsIntoColumn(chunk, column, applied);
      } else if (hasGenerateColumn) {
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
        // A compatibility slab may have been evicted while its canonical column
        // and sections remained resident. Rebuild every materialized canonical
        // section when that projection returns; otherwise its previous mesh-dirty
        // flags were cleared by the old geometry and the reloaded slab became a
        // visible no-geometry projection.
        column.markMaterializedSectionsMeshDirty();
        // `applyEditOverlay` is the only writer that can make this slab diverge
        // from the column it was just synced from, so reconciling its reported
        // cells replaces the previous full 16x16x64 comparison sweep.
        const applied = this.applyEditOverlay(chunk, true);
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
   * Seed initial light for one generated residency. Explicit-dimension worlds
   * seed the canonical horizontal column once; compatibility fixtures retain
   * the legacy slab projection path.
   */
  private seedChunkLight(chunk: Chunk): void {
    if (this.usesExplicitDimension) {
      this.seedCanonicalColumnLight(chunk.cx, chunk.cz);
      return;
    }

    const ox = chunk.cx * CHUNK_DIMENSIONS.width;
    const oy = chunk.cy * CHUNK_DIMENSIONS.height;
    const oz = chunk.cz * CHUNK_DIMENSIONS.depth;
    const { width, height, depth } = CHUNK_DIMENSIONS;
    const sky = this.skySeedScratch;
    sky.fill(15);

    for (let sectionBase = height - SECTION_SIZE; sectionBase >= 0; sectionBase -= SECTION_SIZE) {
      for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
          const columnIndex = x + z * width;
          let cellSky = sky[columnIndex]!;
          for (let y = sectionBase + SECTION_SIZE - 1; y >= sectionBase; y--) {
            const id = chunk.getLocal(x, y, z);
            if (cellSky > 0 && this.registry.isOpaque(id)) {
              cellSky = 0;
            }
            if (cellSky > 0) {
              this.lightStorage.setSkyLight(ox + x, oy + y, oz + z, cellSky);
            }
            const luminance = blockLuminance(id);
            if (luminance > 0) {
              this.lightStorage.setBlockLight(ox + x, oy + y, oz + z, Math.min(15, luminance));
            }
          }
          sky[columnIndex] = cellSky;
        }
      }
    }
  }

  /** Seed canonical light across the active dimension without allocating absent block sections. */
  private seedCanonicalColumnLight(chunkX: number, chunkZ: number): void {
    const column = this.storage.getColumn(chunkX, chunkZ);
    if (!column) return;
    const key = `${chunkX},${chunkZ}`;
    if (this.seededLightColumns.has(key)) return;

    // Re-seeding is authoritative for a fresh column residency. Clear all
    // section light first so reloads cannot retain values from a prior edit.
    for (let sectionY = this.dimension.minSectionY; sectionY <= this.dimension.maxSectionY; sectionY++) {
      this.lightStorage.deleteSection(chunkX, sectionY, chunkZ);
    }

    const sky = this.skySeedScratch;
    sky.fill(this.dimension.hasSkylight ? 15 : 0);
    const width = CHUNK_DIMENSIONS.width;
    const depth = CHUNK_DIMENSIONS.depth;
    let openColumns = width * depth;
    const originX = chunkX * width;
    const originZ = chunkZ * depth;

    for (let sectionY = this.dimension.maxSectionY; sectionY >= this.dimension.minSectionY; sectionY--) {
      const section = column.getSectionIfExists(sectionY - this.dimension.minSectionY);
      const sectionMinY = Math.max(this.dimension.minY, sectionY * SECTION_SIZE);
      const sectionMaxY = Math.min(this.dimension.maxY, (sectionY + 1) * SECTION_SIZE - 1);
      if (sectionMinY > sectionMaxY) continue;

      if (this.dimension.hasSkylight && section === undefined && openColumns === width * depth &&
          sectionMinY === sectionY * SECTION_SIZE && sectionMaxY === (sectionY + 1) * SECTION_SIZE - 1) {
        this.lightStorage.fillSectionSky(originX, sectionMinY, originZ, 15);
        continue;
      }

      for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
          const columnIndex = x + z * width;
          let cellSky = sky[columnIndex]!;
          for (let worldY = sectionMaxY; worldY >= sectionMinY; worldY--) {
            const id = section === undefined
              ? BlockId.Air
              : section.getStateAt(x, worldY & (SECTION_SIZE - 1), z).blockId;
            if (this.dimension.hasSkylight && cellSky > 0 && this.registry.isOpaque(id)) {
              cellSky = 0;
              openColumns--;
            }
            if (this.dimension.hasSkylight && cellSky > 0) {
              this.lightStorage.setSkyLight(originX + x, worldY, originZ + z, cellSky);
            }
            const luminance = blockLuminance(id);
            if (luminance > 0) {
              this.lightStorage.setBlockLight(originX + x, worldY, originZ + z, Math.min(15, luminance));
            }
          }
          sky[columnIndex] = cellSky;
        }
      }
    }
    this.seededLightColumns.add(key);
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
      // Light values changed: invalidate canonical sections in every affected
      // resident slab. The legacy chunk dirty bit is only a scheduling bridge;
      // canonical section mesh ownership must be invalidated explicitly.
      for (const key of this.lightDirtyChunks) {
        const [cx, cy, cz] = keyToChunk(key);
        const chunk = this.chunkManager.getChunk(cx, cy, cz);
        if (chunk?.generated) {
          this.markCanonicalSectionsMeshDirtyForChunk(cx, cy, cz);
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

      const versionSnapshot = this.captureSectionVersions(chunk);
      if (this.supportsCanonicalSectionMeshing()) {
        if (this.useWorkers) {
          this.submitWorkerMeshJob(chunk, record.generation, chunk.meshVersion, versionSnapshot, true);
        } else {
          this.processCanonicalSectionMeshing(chunk, record.generation, versionSnapshot);
        }
        this.budgets.recordActual('mesh-upload', performance.now() - t0);
        done++;
        continue;
      }
      if (this.useWorkers) {
        this.submitWorkerMeshJob(chunk, record.generation, chunk.meshVersion, versionSnapshot, false);
      } else {
        const result = this.mesher.mesh(chunk, (cx, cy, cz) => this.chunkManager.getChunk(cx, cy, cz), {
          inputVersion: record.generation,
          versionSnapshot,
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

  private supportsCanonicalSectionMeshing(): boolean {
    return this.usesExplicitDimension &&
      typeof (this.mesher as unknown as { meshSection?: unknown }).meshSection === 'function';
  }

  /**
   * Mesh only canonical sections whose contents or face dependencies changed. The
   * legacy Chunk remains the bounded scheduling projection; section geometry is
   * owned independently by canonical `(sectionX, sectionY, sectionZ)` keys.
   */
  private processCanonicalSectionMeshing(
    chunk: Chunk,
    generation: number,
    versionSnapshot: SectionVersionSnapshot,
  ): void {
    const column = this.storage.getColumn(chunk.cx, chunk.cz);
    const record = this.chunkManager.pipeline.getRecordByCoords(chunk.cx, chunk.cy, chunk.cz);
    if (!column || !record || record.generation !== generation) {
      return;
    }

    const firstSectionY = chunk.cy * this.sectionsPerChunk;
    const lastSectionY = firstSectionY + this.sectionsPerChunk;
    const dirtySections = column.meshDirtySectionIndices().filter((sy) => {
      const sectionY = sy + this.dimension.minSectionY;
      return sectionY >= firstSectionY && sectionY < lastSectionY;
    });

    for (const sy of dirtySections) {
      const sectionY = sy + this.dimension.minSectionY;
      const section = column.getSectionIfExists(sy);
      const key = canonicalSectionKey(chunk.cx, sectionY, chunk.cz);
      if (!section) {
        this.removeMeshesForSection(key);
        column.clearMeshDirty(sy);
        continue;
      }
      const result = this.mesher.meshSection(
        chunk.cx,
        sectionY,
        chunk.cz,
        section,
        (wx, wy, wz) => this.storage.getBlockState(wx, wy, wz),
        {
          inputVersion: generation,
          versionSnapshot,
          lightSampler: this.mesherLightSampler,
        },
      );
      if (
        result.streams.inputVersion !== generation ||
        !this.isSectionVersionSnapshotCurrent(versionSnapshot)
      ) {
        // The mesh stage is still in flight here. Roll it back before retrying;
        // enqueueing while it remains in-flight lets retry admission reset the
        // record and can strand the replacement job in the Lighted state.
        this.chunkManager.pipeline.failStage(
          chunkKey(chunk.cx, chunk.cy, chunk.cz),
          'mesh',
        );
        chunk.markDirty();
        this.enqueueMeshWithRetry(chunk);
        return;
      }
      this.attachCanonicalSection(key, chunk.cx, sectionY, chunk.cz, result);
      column.clearMeshDirty(sy);
    }

    chunk.dirty = false;
    chunk.state = ChunkState.Visible;
    this.chunkManager.pipeline.completeStage(chunkKey(chunk.cx, chunk.cy, chunk.cz), 'mesh', generation);
    this.chunkManager.pipeline.beginStage(chunkKey(chunk.cx, chunk.cy, chunk.cz), 'upload', generation);
    this.chunkManager.pipeline.completeStage(chunkKey(chunk.cx, chunk.cy, chunk.cz), 'upload', generation);
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

      this.cancelWorkerMeshBatch(key);
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
      if (this.usesExplicitDimension) {
        let columnStillResident = false;
        for (let cy = this.minChunkY; cy < this.minChunkY + this.chunkLayerCount; cy++) {
          if (this.chunkManager.getChunk(chunk.cx, cy, chunk.cz)) {
            columnStillResident = true;
            break;
          }
        }
        if (!columnStillResident) {
          this.seededLightColumns.delete(`${chunk.cx},${chunk.cz}`);
          this.lightEngine.pruneColumn(chunk.cx, chunk.cz);
        }
      }
      unloaded++;
    }
    this.needsUnload = candidates.length > unloaded;
    this.pendingUnloadValue = candidates.length - unloaded;
    return this.needsUnload;
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
    const cx = floorDiv(x, CHUNK_DIMENSIONS.width);
    const cy = floorDiv(y, CHUNK_DIMENSIONS.height);
    const cz = floorDiv(z, CHUNK_DIMENSIONS.depth);
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
      // Cancel worker transport and temporary geometry before invalidating the
      // pipeline record, so a late result cannot touch replacement residency.
      this.cancelWorkerMeshBatch(key);
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
  private applyEditOverlay(
    chunk: Chunk,
    slabMatchesColumn = false,
  ): ReadonlyMap<number, number> | undefined {
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
      //
      // `slabMatchesColumn` is set by callers that have just run
      // `syncChunkFromStorage` on this slab. The rescue below only reports cells
      // where the column and the slab disagree, so when the slab was copied from
      // that column moments ago it cannot find anything — skipping it avoids a
      // dead 16x16x64 `getBlockState` scan on every generated chunk.
      if (!overlay && !slabMatchesColumn) {
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
                  chunk.setProjectionLocal(lx, ly, lz, id);
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
      const local = decodeLegacySlabIndex(index);
      if (local) {
        chunk.setProjectionLocal(local.lx, local.ly, local.lz, id);
      }
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
        // Legacy committed edits are read-old input. Convert them into the
        // canonical column before retaining the bounded compatibility
        // projection, so eviction/unload cannot make hydration lossy.
        for (const [index, id] of overlay) {
          const local = decodeLegacySlabIndex(index);
          if (!local) continue;
          const worldX = cx * CHUNK_DIMENSIONS.width + local.lx;
          const worldY = cy * CHUNK_DIMENSIONS.height + local.ly;
          const worldZ = cz * CHUNK_DIMENSIONS.depth + local.lz;
          if (this.dimension.containsY(worldY)) {
            this.storage.setBlock(worldX, worldY, worldZ, id);
          }
        }
        this.editOverlay.set(key, overlay);
        this.touchEditOverlay(key);
        const chunk = this.chunkManager.getChunk(cx, cy, cz);
        if (chunk?.generated) {
          for (const [index, id] of overlay) {
            const local = decodeLegacySlabIndex(index);
            if (local) {
              chunk.setProjectionLocal(local.lx, local.ly, local.lz, id);
            }
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

  private disposeGeometry(geometry: THREE.BufferGeometry | null | undefined): void {
    if (!geometry || this.disposedGeometries.has(geometry)) return;
    this.disposedGeometries.add(geometry);
    geometry.dispose();
  }

  /** Replace one canonical section's worker-produced render streams atomically. */
  private attachCanonicalWorkerSection(
    key: string,
    sectionX: number,
    sectionY: number,
    sectionZ: number,
    entries: ReadonlyArray<{
      geometry: THREE.BufferGeometry | null;
      material: THREE.MeshLambertMaterial | undefined;
      renderOrder: number;
      castShadow: boolean;
    }>,
  ): void {
    const meshes: THREE.Mesh[] = [];
    let triangles = 0;
    let uploadBytes = 0;
    try {
      for (const entry of entries) {
        if (!entry.geometry) continue;
        if (!entry.material) {
          this.disposeGeometry(entry.geometry);
          continue;
        }
        const mesh = new THREE.Mesh(entry.geometry, entry.material);
        mesh.position.set(sectionX * SECTION_SIZE, sectionY * SECTION_SIZE, sectionZ * SECTION_SIZE);
        mesh.renderOrder = entry.renderOrder;
        mesh.castShadow = entry.castShadow;
        mesh.receiveShadow = true;
        meshes.push(mesh);
        triangles += this.triangleCount(entry.geometry);
        uploadBytes += estimateGeometryBytes(entry.geometry);
      }
    } catch {
      for (const entry of entries) this.disposeGeometry(entry.geometry);
      return;
    }
    this.removeMeshesForSection(key);
    for (const mesh of meshes) this.scene.add(mesh);
    this.sectionMeshGroups.set(key, meshes);
    this.sectionTriangles.set(key, triangles);
    this.triangles += triangles;
    this.uploadBytesThisFrame += uploadBytes;
  }
  /** Replace one canonical section's render streams without touching sibling sections. */
  private attachCanonicalSection(
    key: string,
    sectionX: number,
    sectionY: number,
    sectionZ: number,
    result: ChunkMeshResult,
  ): void {
    const translucent = result.translucent ?? result.transparent;
    if (result.translucent && result.transparent && result.translucent !== result.transparent) {
      // `translucent` is the canonical stream. A distinct legacy transparent
      // geometry is an unowned compatibility duplicate and must not leak.
      this.disposeGeometry(result.transparent);
    }
    const entries = [
      { geometry: result.opaque, material: this.materials.opaque, renderOrder: 0, castShadow: true },
      { geometry: result.cutout, material: this.materials.cutout, renderOrder: 0, castShadow: true },
      { geometry: translucent, material: this.materials.transparent, renderOrder: 1, castShadow: false },
      { geometry: result.fluid, material: this.materials.fluid, renderOrder: 2, castShadow: false },
    ] as const;
    this.attachCanonicalWorkerSection(
      key,
      sectionX,
      sectionY,
      sectionZ,
      entries,
    );
  }

  private removeMeshesForSection(key: string): void {
    const meshes = this.sectionMeshGroups.get(key);
    if (meshes) {
      for (const mesh of meshes) {
        this.scene.remove(mesh);
        this.disposeGeometry(mesh.geometry);
      }
      this.sectionMeshGroups.delete(key);
    }
    const triangles = this.sectionTriangles.get(key);
    if (triangles !== undefined) {
      this.triangles -= triangles;
      this.sectionTriangles.delete(key);
    }
  }

  private attach(chunk: Chunk, result: ChunkMeshResult): void {
    const translucent = result.translucent ?? result.transparent;
    if (result.translucent && result.transparent && result.translucent !== result.transparent) {
      this.disposeGeometry(result.transparent);
    }
    this.attachGeometries(chunk, [
      { geometry: result.opaque, material: this.materials.opaque, renderOrder: 0, castShadow: true },
      { geometry: result.cutout, material: this.materials.cutout, renderOrder: 0, castShadow: true },
      // `translucent` is the canonical translucent stream (`transparent`
      // aliases it in legacy results); attach exactly one mesh for it.
      { geometry: translucent, material: this.materials.transparent, renderOrder: 1, castShadow: false },
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
      offsetY?: number;
    }>,
  ): void {
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    const meshes: THREE.Mesh[] = [];
    let tris = 0;
    let uploadBytes = 0;
    const px = chunk.cx * CHUNK_DIMENSIONS.width;
    const py = chunk.cy * CHUNK_DIMENSIONS.height;
    const pz = chunk.cz * CHUNK_DIMENSIONS.depth;

    // Build the replacement completely before removing the currently attached
    // group. Readiness can therefore remain true while a visible chunk is being
    // re-meshed; a failed/partial build never creates a visible gap.
    try {
      for (const entry of entries) {
        if (!entry.geometry) continue;
        if (!entry.material) {
          this.disposeGeometry(entry.geometry);
          continue;
        }
        const mesh = new THREE.Mesh(entry.geometry, entry.material);
        mesh.position.set(px, py + (entry.offsetY ?? 0), pz);
        mesh.renderOrder = entry.renderOrder;
        mesh.castShadow = entry.castShadow;
        mesh.receiveShadow = true;
        meshes.push(mesh);
        tris += this.triangleCount(entry.geometry);
        uploadBytes += estimateGeometryBytes(entry.geometry);
      }
    } catch {
      for (const entry of entries) this.disposeGeometry(entry.geometry);
      return;
    }

    this.removeMeshesForChunk(chunk);
    for (const mesh of meshes) {
      this.scene.add(mesh);
    }
    this.meshGroups.set(key, meshes);
    this.chunkTriangles.set(key, tris);
    this.triangles += tris;
    this.uploadBytesThisFrame += uploadBytes;
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
      spawn: () => this.workerFactory
        ? this.workerFactory()
        : new Worker(new URL('../rendering/MeshWorkerEntry.ts', import.meta.url), { type: 'module' }),
      initialize: () => ({
        protocolVersion: WORKER_PROTOCOL_VERSION,
        type: 'initialize',
        kind: 'mesh-section',
        payload: this.meshRegistryTable,
      }),
    });
    this.workerClient = new MeshWorkerClient({ pool: this.workerPool });
    return true;
  }

  /**
   * Capture canonical mesh/light versions for this legacy projection without
   * materializing absent columns or sections. The projection's target sections
   * and their face-sharing neighbors are included for the later stale-result
   * gate; task 76 records only, task 77 enforces.
   */
  private captureSectionVersions(chunk: Chunk): SectionVersionSnapshot {
    return captureSectionVersionSnapshot(
      chunk.cx,
      chunk.cy,
      chunk.cz,
      this.sectionsPerChunk,
      {
        meshVersionAt: (sectionX, sectionY, sectionZ) => {
          const column = this.storage.getColumn(sectionX, sectionZ);
          if (!column) return 0;
          const inColumnSection = sectionY - this.dimension.minSectionY;
          if (inColumnSection < 0 || inColumnSection >= column.sectionCount) return 0;
          return column.sectionMeshVersion(inColumnSection);
        },
        lightVersionAt: (sectionX, sectionY, sectionZ) =>
          this.lightStorage.getSectionVersion(sectionX, sectionY, sectionZ),
      },
    );
  }

  /**
   * Submit one per-section meshing job for a chunk (worker path). Results are
   * consumed through the same stale-check + attach path as sync builds.
   */
  private submitWorkerMeshJob(
    chunk: Chunk,
    generation: number,
    meshVersion: number,
    versionSnapshot: SectionVersionSnapshot,
    canonical: boolean,
  ): void {
    let workerAvailable = false;
    try {
      workerAvailable = this.ensureWorkerMeshing();
    } catch {
      this.disableWorkerMeshingForFallback();
    }
    if (!workerAvailable || !this.workerClient) {
      this.fallbackToSynchronousMeshing(chunk, generation, versionSnapshot, canonical);
      return;
    }

    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    const batch: WorkerMeshBatch = {
      key,
      generation,
      meshVersion,
      versionSnapshot,
      chunkY: chunk.cy,
      canonical,
      sectionKeys: new Set(),
      jobIds: new Set(),
      geometries: [],
      remaining: 0,
      failed: false,
      completed: false,
    };
    this.cancelWorkerMeshBatch(key);
    this.workerMeshBatches.set(key, batch);

    const sectionsY = CHUNK_DIMENSIONS.height / 16;
    const column = canonical ? this.storage.getColumn(chunk.cx, chunk.cz) : undefined;
    const sectionSlots = canonical
      ? (column?.meshDirtySectionIndices() ?? [])
        .map((sy) => sy + this.dimension.minSectionY - chunk.cy * this.sectionsPerChunk)
        .filter((sy) => sy >= 0 && sy < sectionsY)
      : Array.from({ length: sectionsY }, (_, sy) => sy);
    try {
      for (const sy of sectionSlots) {
        const sectionY = chunk.cy * this.sectionsPerChunk + sy;
        const sectionKey = canonicalSectionKey(chunk.cx, sectionY, chunk.cz);
        const payload = this.buildSectionPayload(chunk, sy, versionSnapshot);
        if (!payload) {
          if (canonical && column) {
            this.removeMeshesForSection(sectionKey);
            column.clearMeshDirty(sectionY - this.dimension.minSectionY);
          }
          continue;
        }
        batch.sectionKeys.add(sectionKey);
        this.workerClient.setGenerationToken(generation);
        const jobId = this.workerClient.requestSection(
          payload,
          (result) => this.consumeWorkerMeshResult(
            batch,
            jobId,
            payload.sectionX,
            payload.sectionY,
            payload.sectionZ,
            result,
          ),
          () => this.failWorkerBatch(batch),
        );
        batch.jobIds.add(jobId);
        batch.remaining++;
      }
    } catch {
      this.failWorkerBatch(batch);
    }

    if (batch.remaining === 0) this.completeWorkerMeshBatch(batch);
  }

  /** Build the structured-clone payload for one 16³ section, or null when empty. */
  private buildSectionPayload(
    chunk: Chunk,
    sectionSlotIndex: number,
    versionSnapshot: SectionVersionSnapshot,
  ): MeshSectionRequestTransport | null {
    const sectionX = chunk.cx;
    const sectionY = chunk.cy * this.sectionsPerChunk + sectionSlotIndex;
    const sectionZ = chunk.cz;
    const lookup = {
      getBlock: (x: number, y: number, z: number): number => this.getBlock(x, y, z),
      getSkyLight: (x: number, y: number, z: number): number => this.lightStorage.getSkyLight(x, y, z),
      getBlockLight: (x: number, y: number, z: number): number => this.lightStorage.getBlockLight(x, y, z),
      containsY: (y: number): boolean => this.dimension.containsY(y),
      hasStorage: (x: number, y: number, z: number): boolean => {
        if (!this.dimension.containsY(y)) return false;
        const column = this.storage.getColumn(sectionIndex(x), sectionIndex(z));
        if (!column) return false;
        const inColumnSection = sectionIndex(y) - this.dimension.minSectionY;
        return inColumnSection >= 0 && inColumnSection < column.sectionCount && column.hasSection(inColumnSection);
      },
    };
    const snapshot = extractSectionSnapshot(
      sectionX,
      sectionY,
      sectionZ,
      this.dimension.minY,
      this.dimension.maxY,
      lookup,
    );
    let nonAir = 0;
    for (const id of snapshot.cells) {
      if (id !== BlockId.Air) nonAir++;
    }
    if (nonAir === 0) return null;

    const fluidLevels = new Int8Array(snapshot.cells.length);
    fluidLevels.fill(-1);
    for (let i = 0; i < snapshot.cells.length; i++) {
      const id = snapshot.cells[i]!;
      if (id === BlockId.Water || id === BlockId.Lava) fluidLevels[i] = 0;
    }
    const halo = {} as MeshSectionTransferPayload['halo'];
    for (const face of ['west', 'east', 'down', 'up', 'north', 'south'] as const) {
      const data = snapshot.halos[face];
      const haloFluidLevels = new Int8Array(data.cells.length);
      haloFluidLevels.fill(-1);
      for (let i = 0; i < data.cells.length; i++) {
        const id = data.cells[i]!;
        if (id === BlockId.Water || id === BlockId.Lava) haloFluidLevels[i] = 0;
      }
      halo[face] = {
        availability: data.availability,
        cells: data.cells,
        skyLight: data.skyLight,
        blockLight: data.blockLight,
        fluidLevels: haloFluidLevels,
      };
    }
    const transferData: MeshSectionTransferPayload = {
      cells: snapshot.cells,
      skyLight: snapshot.skyLight,
      blockLight: snapshot.blockLight,
      fluidLevels,
      halo,
    };
    // Registry classification is initialized once per worker; section jobs carry only its identity.
    // All section/halo bulk data is typed and transferred without structured-clone array copies.
    return {
      sectionX,
      sectionY,
      sectionZ,
      versionSnapshot,
      registryTableId: this.meshRegistryTable.tableId,
      transferData,
    };
  }

  /**
   * Reject a worker batch exactly once, canceling sibling section jobs and requeueing the
   * chunk against a new pipeline generation. A late result can therefore never attach to a
   * replacement chunk or leave the mesh stage permanently in flight.
   */
  private rejectWorkerMeshBatch(batch: WorkerMeshBatch): void {
    if (batch.failed || batch.completed) return;
    batch.failed = true;
    if (this.workerMeshBatches.get(batch.key) === batch) {
      this.workerMeshBatches.delete(batch.key);
    }
    if (this.workerClient) {
      for (const jobId of batch.jobIds) this.workerClient.cancel(jobId);
    }
    this.disposeWorkerMeshBatchGeometries(batch);
    const record = this.chunkManager.pipeline.getRecord(batch.key);
    if (record?.generation === batch.generation) {
      this.chunkManager.pipeline.failStage(batch.key, 'mesh');
      const chunk = this.chunkManager.getChunk(record.cx, record.cy, record.cz);
      if (chunk?.generated) {
        chunk.markDirty();
        this.enqueueMeshWithRetry(chunk);
      }
    }
    batch.jobIds.clear();
    batch.remaining = 0;
  }

  private disableWorkerMeshingForFallback(): void {
    this.useWorkers = false;
    this.workerFailureCount++;
  }

  private fallbackToSynchronousMeshing(
    chunk: Chunk,
    generation: number,
    versionSnapshot: SectionVersionSnapshot,
    canonical: boolean,
  ): void {
    this.workerFallbackCount++;
    if (canonical) {
      this.processCanonicalSectionMeshing(chunk, generation, versionSnapshot);
      return;
    }
    const result = this.mesher.mesh(chunk, (cx, cy, cz) => this.chunkManager.getChunk(cx, cy, cz), {
      inputVersion: generation,
      versionSnapshot,
      lightSampler: this.mesherLightSampler,
    });
    const builtVersion = result.streams?.inputVersion;
    if (builtVersion !== undefined && builtVersion !== generation) return;
    this.attach(chunk, result);
    chunk.dirty = false;
    chunk.state = ChunkState.Visible;
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    this.chunkManager.pipeline.completeStage(key, 'mesh', generation);
    this.chunkManager.pipeline.beginStage(key, 'upload', generation);
    this.chunkManager.pipeline.completeStage(key, 'upload', generation);
  }

  /** Re-admit one active worker batch to the bounded synchronous mesh queue. */
  private requeueWorkerBatch(batch: WorkerMeshBatch): void {
    if (batch.failed || batch.completed) return;
    batch.failed = true;
    if (this.workerMeshBatches.get(batch.key) === batch) this.workerMeshBatches.delete(batch.key);
    for (const jobId of batch.jobIds) this.workerClient?.cancel(jobId);
    this.disposeWorkerMeshBatchGeometries(batch);
    const record = this.chunkManager.pipeline.getRecord(batch.key);
    if (record?.generation === batch.generation) {
      this.chunkManager.pipeline.failStage(batch.key, 'mesh');
      const chunk = this.chunkManager.getChunk(record.cx, record.cy, record.cz);
      if (chunk?.generated) {
        chunk.markDirty();
        this.enqueueMeshWithRetry(chunk);
      }
    }
    batch.jobIds.clear();
    batch.remaining = 0;
  }

  /**
   * Disable workers after a real transport failure, cancel all outstanding batches,
   * and re-admit every affected chunk to the bounded synchronous fallback path.
   */
  private failWorkerBatch(batch: WorkerMeshBatch): void {
    if (batch.failed || batch.completed) return;
    this.workerFailureCount++;
    this.useWorkers = false;
    const batches = [...this.workerMeshBatches.values()];
    if (!batches.includes(batch)) batches.push(batch);
    this.workerFallbackCount += batches.length;
    for (const active of batches) this.requeueWorkerBatch(active);
  }
  /** Dispose temporary geometry that has not yet been transferred to the scene. */
  private disposeWorkerMeshBatchGeometries(batch: WorkerMeshBatch): void {
    for (const entry of batch.geometries) {
      this.disposeGeometry(entry.geometry);
    }
    batch.geometries.length = 0;
  }

  /** Cancel a worker batch because its residency is being replaced or unloaded. */
  private cancelWorkerMeshBatch(key: string): void {
    const batch = this.workerMeshBatches.get(key);
    if (!batch) return;
    batch.failed = true;
    this.workerMeshBatches.delete(key);
    if (this.workerClient) {
      for (const jobId of batch.jobIds) this.workerClient.cancel(jobId);
    }
    this.disposeWorkerMeshBatchGeometries(batch);
    batch.jobIds.clear();
    batch.remaining = 0;
  }

  /** Complete the batch only after every section result passed all stale checks. */
  private completeWorkerMeshBatch(batch: WorkerMeshBatch): void {
    if (batch.failed || batch.completed || batch.remaining !== 0) return;
    const pipeline = this.chunkManager.pipeline;
    const record = pipeline.getRecord(batch.key);
    const chunk = record && this.chunkManager.getChunk(record.cx, record.cy, record.cz);
    if (
      !record ||
      record.generation !== batch.generation ||
      !chunk ||
      chunk.meshVersion !== batch.meshVersion ||
      !this.isSectionVersionSnapshotCurrent(batch.versionSnapshot)
    ) {
      this.rejectWorkerMeshBatch(batch);
      return;
    }
    batch.completed = true;
    if (this.workerMeshBatches.get(batch.key) === batch) {
      this.workerMeshBatches.delete(batch.key);
    }
    if (batch.canonical) {
      const grouped = new Map<string, typeof batch.geometries>();
      for (const entry of batch.geometries) {
        const sectionKey = canonicalSectionKey(entry.sectionX, entry.sectionY, entry.sectionZ);
        const entries = grouped.get(sectionKey);
        if (entries) entries.push(entry);
        else grouped.set(sectionKey, [entry]);
      }
      for (const [sectionKey, entries] of grouped) {
        const first = entries[0]!;
        this.attachCanonicalWorkerSection(sectionKey, first.sectionX, first.sectionY, first.sectionZ, entries);
        const column = this.storage.getColumn(first.sectionX, first.sectionZ);
        const inColumnSection = first.sectionY - this.dimension.minSectionY;
        if (column && inColumnSection >= 0 && inColumnSection < column.sectionCount) {
          column.clearMeshDirty(inColumnSection);
        }
      }
    } else {
      this.attachGeometries(chunk, batch.geometries);
    }
    batch.geometries.length = 0;
    this.workerCompletedCount++;
    chunk.dirty = false;
    chunk.state = ChunkState.Visible;
    pipeline.completeStage(batch.key, 'mesh', batch.generation);
    pipeline.beginStage(batch.key, 'upload', batch.generation);
    pipeline.completeStage(batch.key, 'upload', batch.generation);
  }

  /** Read current canonical mesh/light versions without materializing absent sections. */
  private isSectionVersionSnapshotCurrent(snapshot: SectionVersionSnapshot): boolean {
    return isSectionVersionSnapshotCurrent(snapshot, {
      meshVersionAt: (sectionX, sectionY, sectionZ) => {
        const column = this.storage.getColumn(sectionX, sectionZ);
        if (!column) return 0;
        const inColumnSection = sectionY - this.dimension.minSectionY;
        if (inColumnSection < 0 || inColumnSection >= column.sectionCount) return 0;
        return column.sectionMeshVersion(inColumnSection);
      },
      lightVersionAt: (sectionX, sectionY, sectionZ) =>
        this.lightStorage.getSectionVersion(sectionX, sectionY, sectionZ),
    });
  }

  /**
   * Stale-check + attach for one finished worker section. The result must belong to the
   * submitted target section and all captured canonical versions must still match.
   */
  private consumeWorkerMeshResult(
    batch: WorkerMeshBatch,
    jobId: string,
    sectionX: number,
    sectionY: number,
    sectionZ: number,
    result: MeshSectionResultPayload,
  ): void {
    if (this.contextLost) {
      this.cancelWorkerMeshBatch(batch.key);
      return;
    }
    if (batch.failed || batch.completed) return;
    const entry = result.versionSnapshot && findSectionVersionSnapshot(
      result.versionSnapshot,
      result.sectionX,
      result.sectionY,
      result.sectionZ,
    );
    const record = this.chunkManager.pipeline.getRecord(batch.key);
    const chunk = record && this.chunkManager.getChunk(record.cx, record.cy, record.cz);
    if (
      result.sectionX !== sectionX ||
      result.sectionY !== sectionY ||
      result.sectionZ !== sectionZ ||
      !entry?.target ||
      !record ||
      record.generation !== batch.generation ||
      !chunk ||
      chunk.meshVersion !== batch.meshVersion ||
      !this.isSectionVersionSnapshotCurrent(batch.versionSnapshot)
    ) {
      this.rejectWorkerMeshBatch(batch);
      return;
    }
    let geometries: {
      opaque: THREE.BufferGeometry | null;
      cutout: THREE.BufferGeometry | null;
      translucent: THREE.BufferGeometry | null;
      fluid: THREE.BufferGeometry | null;
    } | null;
    const allocated = new Set<THREE.BufferGeometry>();
    const buildGeometry = (stream: Parameters<typeof geometryFromMeshStream>[0]): THREE.BufferGeometry | null => {
      const geometry = geometryFromMeshStream(stream);
      if (geometry) allocated.add(geometry);
      return geometry;
    };
    try {
      geometries = result.layerStreams !== undefined
        ? {
            opaque: buildGeometry(result.layerStreams.opaque),
            cutout: buildGeometry(result.layerStreams.cutout),
            translucent: buildGeometry(result.layerStreams.translucent),
            fluid: buildGeometry(result.layerStreams.fluid),
          }
        : (() => {
            if (!this.uvRectFor) {
              this.failWorkerBatch(batch);
              return null;
            }
            const info: PackedMeshExpandInfo = {
              uvFor: (blockId, faceIndex) => this.uvRectFor!(blockId, faceIndex),
              renderLayerOf: (blockId) =>
                this.registry.get(blockId).renderCategory === RenderCategory.Transparent
                  ? ('translucent' as MeshStreamName)
                  : ('opaque' as MeshStreamName),
              buildGeometry,
            };
            const packed = result.packed ?? packQuadsToTypedArrays(result.quads);
            return expandPackedMeshResult(packed, info);
          })();
    } catch {
      for (const geometry of allocated) this.disposeGeometry(geometry);
      this.failWorkerBatch(batch);
      return;
    }
    if (geometries === null) return;
    const offsetY = (sectionY - batch.chunkY * this.sectionsPerChunk) * 16;
    const entries = [
      {
        geometry: geometries.opaque,
        material: this.materials.opaque,
        renderOrder: 0,
        castShadow: true,
        offsetY,
        sectionX,
        sectionY,
        sectionZ,
      },
      {
        geometry: geometries.cutout,
        material: this.materials.cutout,
        renderOrder: 0,
        castShadow: true,
        offsetY,
        sectionX,
        sectionY,
        sectionZ,
      },
      {
        geometry: geometries.translucent,
        material: this.materials.transparent,
        renderOrder: 1,
        castShadow: false,
        offsetY,
        sectionX,
        sectionY,
        sectionZ,
      },
      {
        geometry: geometries.fluid,
        material: this.materials.fluid,
        renderOrder: 2,
        castShadow: false,
        offsetY,
        sectionX,
        sectionY,
        sectionZ,
      },
    ];
    batch.geometries.push(...entries);
    batch.jobIds.delete(jobId);
    batch.remaining--;
    this.completeWorkerMeshBatch(batch);
  }

  // ── Observability ──────────────────────────────────────────────────────────

  /** Push queue depths / job age / upload bytes to the optional monitor. */
  private feedMonitor(): void {
    if (!this.monitor) return;
    const pipeline = this.chunkManager.pipeline;
    this.monitor.setQueueDepth('generate', pipeline.queueDepth('generate'));
    this.monitor.setQueueDepth('mesh', pipeline.queueDepth('mesh') + this.retryMeshQueue.length);
    this.monitor.setQueueDepth('upload', pipeline.queueDepth('upload'));
    this.monitor.setQueueDepth('unload', this.pendingUnloadValue);
    this.monitor.setOldestJobAgeMs(pipeline.oldestJobAgeMs());
    this.monitor.recordUploadBytes(this.uploadBytesThisFrame);
  }

  private removeMeshesForChunk(chunk: Chunk): void {
    if (this.usesExplicitDimension) {
      const firstSectionY = chunk.cy * this.sectionsPerChunk;
      for (let offset = 0; offset < this.sectionsPerChunk; offset++) {
        this.removeMeshesForSection(canonicalSectionKey(chunk.cx, firstSectionY + offset, chunk.cz));
      }
    }
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    const meshes = this.meshGroups.get(key);
    if (meshes) {
      for (const mesh of meshes) {
        this.scene.remove(mesh);
        this.disposeGeometry(mesh.geometry);
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

  /** Invalidate every materialized canonical section projected by one resident chunk slab. */
  private markCanonicalSectionsMeshDirtyForChunk(cx: number, cy: number, cz: number): void {
    if (!this.usesExplicitDimension) return;
    const column = this.storage.getColumn(cx, cz);
    if (!column) return;
    const firstSectionY = cy * this.sectionsPerChunk;
    const lastSectionY = firstSectionY + this.sectionsPerChunk;
    for (let sectionY = firstSectionY; sectionY < lastSectionY; sectionY++) {
      const inColumnSy = sectionY - this.dimension.minSectionY;
      if (inColumnSy < 0 || inColumnSy >= column.sectionCount) continue;
      column.markSectionMeshDirty(inColumnSy);
    }
  }

  /**
   * Queue only the resident compatibility projection containing one canonical section.
   * The canonical column remains the render dependency authority; this method merely
   * bridges a section dependency into the bounded slab pipeline.
   */
  private enqueueCanonicalSectionDependency(
    sectionX: number,
    sectionY: number,
    sectionZ: number,
    markMeshDirty = true,
  ): void {
    if (
      sectionY < this.dimension.minSectionY ||
      sectionY >= this.dimension.minSectionY + this.dimension.sectionCount
    ) {
      return;
    }
    const column = this.storage.getColumn(sectionX, sectionZ);
    if (!column) return;
    const inColumnSy = sectionY - this.dimension.minSectionY;
    if (markMeshDirty) column.markSectionMeshDirty(inColumnSy);
    const chunkY = floorDiv(sectionY, this.sectionsPerChunk);
    const chunk = this.chunkManager.getChunk(sectionX, chunkY, sectionZ);
    if (!chunk?.generated) return;
    if (!this.usesExplicitDimension) {
      this.markNeighborDirty(sectionX, chunkY, sectionZ);
      return;
    }
    chunk.markDirty();
    this.lightDirtyChunks.add(chunkKey(sectionX, chunkY, sectionZ));
    this.enqueueMeshWithRetry(chunk);
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
      const local = decodeLegacySlabIndex(index);
      if (!local) continue;
      const lx = local.lx;
      const lz = local.lz;
      const ly = local.ly;
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
    const { width, height, depth } = CHUNK_DIMENSIONS;
    const layer = width * depth;
    const baseY = chunk.cy * height;

    // Section-wise rather than cell-wise. `localIndex` is
    // `lx + lz * width + ly * width * depth`, so the `SECTION_SIZE` Y-levels of
    // one section occupy a contiguous index range — an absent (lazy air) section
    // is a single typed-array fill instead of 4096 lookups, and a present one
    // resolves its section once instead of per cell.
    for (let sectionBase = 0; sectionBase < height; sectionBase += SECTION_SIZE) {
      const worldY = baseY + sectionBase;
      const from = sectionBase * layer;
      const to = (sectionBase + SECTION_SIZE) * layer;
      if (!this.dimension.containsY(worldY)) continue;
      const section = column.getSectionIfExists(column.sectionIndexForY(worldY));
      if (section === undefined) {
        chunk.clearProjectionRange(from, to);
        continue;
      }
      for (let ly = sectionBase; ly < sectionBase + SECTION_SIZE; ly++) {
        const sectionLocalY = ly & (SECTION_SIZE - 1);
        for (let lz = 0; lz < depth; lz++) {
          for (let lx = 0; lx < width; lx++) {
            chunk.setProjectionLocal(lx, ly, lz, section.getStateAt(lx, sectionLocalY, lz).blockId);
          }
        }
      }
    }
  }

  /**
   * Return the canonical motion-blocking surface Y for a world column.
   * Existing columns use their maintained heightmap; an absent column falls
   * back to deterministic generation without allocating canonical storage.
   * The result is bounded to the active dimension and may be `minY - 1` for
   * an empty column.
   */
  getMotionBlockingHeight(worldX: number, worldZ: number): number {
    if (!Number.isInteger(worldX) || !Number.isInteger(worldZ)) {
      return this.dimension.minY - 1;
    }
    const chunkX = sectionIndex(worldX);
    const chunkZ = sectionIndex(worldZ);
    const column = this.storage.getColumn(chunkX, chunkZ);
    const height =
      column === undefined
        ? this.generator.getHeightAt(worldX, worldZ)
        : column.getMotionBlockingHeight(localCoord(worldX), localCoord(worldZ));
    return Math.max(this.dimension.minY - 1, Math.min(this.dimension.maxY, height));
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

  /** Enable/disable worker meshing at runtime; disabling cancels in-flight work and requeues safely. */
  setWorkerMeshingEnabled(enabled: boolean): void {
    if (enabled === this.useWorkers) return;
    if (!enabled) {
      for (const batch of [...this.workerMeshBatches.values()]) this.requeueWorkerBatch(batch);
      this.useWorkers = false;
      return;
    }
    this.useWorkers = true;
  }

  /** Whether worker meshing is currently enabled for this world. */
  isWorkerMeshingEnabled(): boolean {
    return this.useWorkers;
  }

  getStats(): WorldStats {
    let allocatedSections = 0;
    let dirtyColumns = 0;
    let dirtySections = 0;
    for (const column of this.storage.columns()) {
      allocatedSections += column.allocatedSectionCount();
      const sectionDirty = column.dirtySectionIndices();
      if (sectionDirty.length > 0) dirtyColumns++;
      dirtySections += sectionDirty.length;
    }
    let geometries = 0;
    for (const meshes of this.meshGroups.values()) {
      geometries += meshes.length;
    }
    if (this.usesExplicitDimension) {
      for (const meshes of this.sectionMeshGroups.values()) {
        geometries += meshes.length;
      }
    }
    return {
      // `residentColumns` is the canonical horizontal ownership metric. Keep
      // `loadedChunks` as a compatibility projection count until all render,
      // simulation and debug consumers use section/column identity directly.
      residentColumns: this.chunkManager.columnCount,
      loadedChunks: this.chunkManager.size,
      allocatedSections,
      dirtyColumns,
      dirtySections,
      geometries,
      pendingLight: this.lightEngine.pendingCounts().total,
      // Persistence owns save scheduling; World only exposes canonical dirty
      // ownership above, so there is no world-local save queue to count.
      pendingSave: 0,
      pendingGeneration: this.chunkManager.pipeline.queueDepth('generate'),
      pendingMesh:
        this.chunkManager.pipeline.queueDepth('mesh') +
        this.chunkManager.pipeline.queueDepth('upload') +
        this.retryMeshQueue.length,
      pendingUnload: this.pendingUnloadValue,
      workerMeshing: {
        enabled: this.useWorkers,
        pendingJobs: this.workerClient?.pendingCount ?? 0,
        activeBatches: this.workerMeshBatches.size,
        completed: this.workerCompletedCount,
        failures: this.workerFailureCount,
        fallbacks: this.workerFallbackCount,
      },
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
        // Readiness follows the generated surface slab instead of assuming
        // `cy=0`. Explicit dimensions may place the playable surface in any
        // slab (including dimensions whose minY is positive or negative).
        const worldX = (playerChunkX + dx) * CHUNK_DIMENSIONS.width + Math.floor(CHUNK_DIMENSIONS.width / 2);
        const worldZ = (playerChunkZ + dz) * CHUNK_DIMENSIONS.depth + Math.floor(CHUNK_DIMENSIONS.depth / 2);
        const legacyMinY = this.minChunkY * CHUNK_DIMENSIONS.height;
        const legacyMaxY = (this.minChunkY + this.chunkLayerCount) * CHUNK_DIMENSIONS.height - 1;
        const minY = this.usesExplicitDimension ? this.dimension.minY : legacyMinY;
        const maxY = this.usesExplicitDimension ? this.dimension.maxY : legacyMaxY;
        const surfaceY = Math.max(minY, Math.min(maxY, this.generator.getHeightAt(worldX, worldZ)));
        const surfaceCy = floorDiv(surfaceY, CHUNK_DIMENSIONS.height);
        const chunk = this.chunkManager.getChunk(playerChunkX + dx, surfaceCy, playerChunkZ + dz);
        const hasAttachedMesh = this.supportsCanonicalSectionMeshing()
          ? this.sectionMeshGroups.has(canonicalSectionKey(
            playerChunkX + dx,
            sectionIndex(surfaceY),
            playerChunkZ + dz,
          ))
          : chunk !== undefined && this.meshGroups.has(chunkKey(chunk.cx, chunk.cy, chunk.cz));
        if (chunk?.generated && (chunk.state === ChunkState.Visible || (chunk.state === ChunkState.Meshing && hasAttachedMesh))) {
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
    // Match the live streaming scan order: nearest columns must enter the
    // bounded generation queue before far preload columns, otherwise a full
    // preload can strand the readiness ring behind work that is not needed to
    // hide the loading screen.
    for (const [dx, dz] of this.streamScanOffsets(radius)) {
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
    this.needsEnsure = true;
  }

  /** Release scene/worker GPU ownership after WebGL context loss without dropping canonical state. */
  handleContextLost(): void {
    if (this.contextLost) return;
    this.contextLost = true;
    for (const key of this.workerMeshBatches.keys()) this.cancelWorkerMeshBatch(key);
    this.chunkManager.forEachChunk((chunk) => {
      this.removeMeshesForChunk(chunk);
      if (chunk.generated) {
        this.markCanonicalSectionsMeshDirtyForChunk(chunk.cx, chunk.cy, chunk.cz);
        chunk.markDirty();
      }
    });
    for (const key of this.sectionMeshGroups.keys()) this.removeMeshesForSection(key);
    this.uploadBytesThisFrame = 0;
  }

  /** Rebuild resident generated geometry after a successful WebGL context restore. */
  handleContextRestored(): void {
    if (!this.contextLost) return;
    this.contextLost = false;
    this.chunkManager.forEachChunk((chunk) => {
      if (chunk.generated) {
        chunk.markDirty();
        this.enqueueMeshWithRetry(chunk);
      }
    });
    this.needsEnsure = true;
  }

  get isContextLost(): boolean {
    return this.contextLost;
  }

  dispose(): void {
    for (const key of this.workerMeshBatches.keys()) this.cancelWorkerMeshBatch(key);
    this.chunkManager.forEachChunk((chunk) => this.removeMeshesForChunk(chunk));
    // Outstanding jobs fail through pool.dispose → onFailure, which cancels
    // the client's pending entries; late results resolve as stale.
    this.workerClient = null;
    if (this.workerPool) {
      this.workerPool.dispose();
      this.workerPool = null;
    }
    this.chunkManager.dispose();
    // Canonical section meshes may outlive their compatibility slab projection
    // after a partial unload. Sweep the authoritative section map independently
    // so no geometry depends on a loaded Chunk for final release.
    for (const key of this.sectionMeshGroups.keys()) {
      this.removeMeshesForSection(key);
    }
    this.lightEngine.clearPending();
    this.lightStorage.clear();
    this.lightDirtyChunks.clear();
    this.seededLightColumns.clear();
    this.retryMeshQueue.length = 0;
    this.retryMeshSet.clear();
    this.fallingQueue.length = 0;
    this.fallingSet.clear();
    this.meshGroups.clear();
    this.sectionMeshGroups.clear();
    this.sectionTriangles.clear();
    this.chunkTriangles.clear();
    this.chunkVoxelCounts.clear();
    this.editOverlay.clear();
    this.editOverlayAccessOrder.length = 0;
    this.hydrationPending.clear();
    this.streamCenterX = null;
    this.streamCenterZ = null;
    this.needsEnsure = true;
    this.needsUnload = false;
    this.triangles = 0;
    this.voxels = 0;
  }
}
