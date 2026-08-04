import * as THREE from 'three';
import { CONFIG } from '../config';
import { BlockId, BlockRegistry } from './BlockRegistry';
import { Chunk, ChunkState } from './Chunk';
import { ChunkManager } from './ChunkManager';
import type { ChunkMesher } from './ChunkMesher';
import type { TerrainGenerator } from './TerrainGenerator';
import type { WorldStats } from './MeshingTypes';
import type { WorldAccess } from './WorldAccess';
import { CHUNK_DIMENSIONS, chunkKey, localIndex, worldToChunk, worldToLocal } from './WorldCoordinates';

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
  private readonly materials: {
    opaque: THREE.MeshLambertMaterial;
    transparent: THREE.MeshLambertMaterial;
  };
  private readonly renderDistance: number;

  /** Player edits keyed by chunk key → local index → block id. Survives unload. */
  private readonly editOverlay = new Map<string, Map<number, number>>();

  private genQueue: GenJob[] = [];
  private readonly genSet = new Set<string>();
  private meshQueue: MeshJob[] = [];
  private readonly meshSet = new Set<string>();
  /** Mesh jobs dropped while the mesh queue was at capacity, retried once it drains. */
  private readonly retryMeshQueue: MeshJob[] = [];
  private readonly retryMeshSet = new Set<string>();

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
  }) {
    this.registry = opts.registry;
    this.scene = opts.scene;
    this.mesher = opts.mesher;
    this.generator = opts.generator;
    this.materials = opts.materials;
    this.renderDistance = opts.renderDistance ?? CONFIG.renderDistance;
    this.chunkManager = new ChunkManager(opts.registry);
  }

  // ── WorldAccess ────────────────────────────────────────────────────────────

  getBlock(x: number, y: number, z: number): number {
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
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return;
    }
    if (y < 0 || y >= CHUNK_DIMENSIONS.height) {
      return;
    }

    const [cx, cy, cz] = worldToChunk(x, y, z);
    const [lx, ly, lz] = worldToLocal(x, y, z);
    const key = chunkKey(cx, cy, cz);

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
    overlay.set(localIndex(lx, ly, lz), id);

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

    this.enqueueMesh(chunk);
  }

  isSolid(x: number, y: number, z: number): boolean {
    // An invisible solid floor below the world prevents the player from
    // falling forever if a chunk is momentarily un-generated or unloaded.
    if (y < CONFIG.bedrockY) {
      return true;
    }
    return this.registry.isSolid(this.getBlock(x, y, z));
  }

  // ── Streaming ──────────────────────────────────────────────────────────────

  update(_dt: number, playerChunkX: number, playerChunkZ: number): void {
    this.ensureChunks(playerChunkX, playerChunkZ);
    // Prioritize the queue by distance to the player so the nearest chunks
    // (and the player's own chunk) generate and mesh first.
    this.prioritizeQueue(this.genQueue, playerChunkX, playerChunkZ);
    this.prioritizeQueue(this.meshQueue, playerChunkX, playerChunkZ);
    this.processGeneration();
    this.processMeshing();
    this.unloadChunks(playerChunkX, playerChunkZ);
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
  private ensureChunks(playerChunkX: number, playerChunkZ: number): void {
    const rd = this.renderDistance;
    for (let dx = -rd; dx <= rd; dx++) {
      for (let dz = -rd; dz <= rd; dz++) {
        const cx = playerChunkX + dx;
        const cz = playerChunkZ + dz;
        const existing = this.chunkManager.getChunk(cx, 0, cz);
        if (!existing) {
          if (this.genQueue.length >= CONFIG.maxQueueSize) {
            // The queue is at capacity. Don't create a chunk we can't queue —
            // it would sit in the manager forever as an un-generated void.
            // ensureChunks runs every frame, so the area is retried once the
            // queue drains.
            return;
          }
          const chunk = this.chunkManager.createChunk(cx, 0, cz);
          this.enqueueGeneration(chunk);
        } else if (!existing.generated && !this.genSet.has(chunkKey(cx, 0, cz))) {
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

      // If the mesh queue is full, don't drop the job permanently — retry once
      // it drains. Without this the chunk would stay generated-but-invisible.
      if (!this.enqueueMesh(chunk)) {
        const key = chunkKey(cx, cy, cz);
        if (!this.retryMeshSet.has(key)) {
          this.retryMeshSet.add(key);
          this.retryMeshQueue.push({ key, cx, cy, cz, version: chunk.meshVersion });
        }
      }
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
        this.enqueueMesh(chunk);
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

  private unloadChunks(playerChunkX: number, playerChunkZ: number): void {
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

      // Drop any pending jobs for this chunk.
      this.genQueue = this.genQueue.filter((j) => j.key !== key);
      this.genSet.delete(key);
      this.meshQueue = this.meshQueue.filter((j) => j.key !== key);
      this.meshSet.delete(key);
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
    this.meshSet.add(key);
    chunk.state = ChunkState.Meshing;
    return true;
  }

  /** Re-apply the player's edits for a chunk after regeneration. */
  private applyEditOverlay(chunk: Chunk): void {
    const overlay = this.editOverlay.get(chunkKey(chunk.cx, chunk.cy, chunk.cz));
    if (!overlay) {
      return;
    }
    for (const [index, id] of overlay) {
      chunk.blocks[index] = id;
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
      this.scene.add(mesh);
      meshes.push(mesh);
      tris += this.triangleCount(result.opaque);
    }
    if (result.transparent) {
      const mesh = new THREE.Mesh(result.transparent, this.materials.transparent);
      mesh.position.set(px, py, pz);
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
      this.enqueueMesh(neighbor);
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

  getStats(): WorldStats {
    return {
      loadedChunks: this.chunkManager.size,
      pendingGeneration: this.genQueue.length,
      pendingMesh: this.meshQueue.length,
      triangles: this.triangles,
      voxels: this.voxels,
    };
  }

  isReady(playerChunkX = 0, playerChunkZ = 0): boolean {
    const radius = 2;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const chunk = this.chunkManager.getChunk(playerChunkX + dx, 0, playerChunkZ + dz);
        if (!chunk || chunk.state !== ChunkState.Visible) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Synchronously generate, mesh, and attach the chunks within `radius` of the
   * given player chunk. Called once at boot so the spawn area is guaranteed to
   * be solid before the first frame — no falling through un-generated terrain.
   */
  preloadChunks(playerChunkX: number, playerChunkZ: number, radius = 3): void {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = playerChunkX + dx;
        const cz = playerChunkZ + dz;
        const key = chunkKey(cx, 0, cz);
        // Skip chunks already being generated/visible.
        if (this.genSet.has(key) || this.meshSet.has(key)) {
          continue;
        }
        let chunk = this.chunkManager.getChunk(cx, 0, cz);
        if (!chunk) {
          chunk = this.chunkManager.createChunk(cx, 0, cz);
        }
        if (!chunk.generated) {
          this.generator.generateChunk(chunk);
          this.applyEditOverlay(chunk);
          chunk.generated = true;
          chunk.state = ChunkState.Generated;
          this.countChunkVoxels(chunk);
        }
        const result = this.mesher.mesh(chunk, (ncx, ncy, ncz) => this.chunkManager.getChunk(ncx, ncy, ncz));
        this.attach(chunk, result);
        chunk.dirty = false;
        chunk.state = ChunkState.Visible;
      }
    }
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
    this.meshGroups.clear();
    this.chunkTriangles.clear();
    this.chunkVoxelCounts.clear();
    this.editOverlay.clear();
    this.triangles = 0;
    this.voxels = 0;
  }
}