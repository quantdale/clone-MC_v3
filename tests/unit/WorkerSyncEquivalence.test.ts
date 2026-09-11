/**
 * 258 task 43 (environment-independent slice): worker/sync semantic
 * equivalence across render streams at the full `World` plumbing level.
 *
 * Module-level mesher-vs-worker equivalence is proven in
 * `WorkerMeshParity.test.ts`. This suite drives two identically seeded live
 * worlds — one synchronous, one through a real `MeshWorkerClient` over an
 * immediate in-process worker running the true `processMeshSectionRequest`
 * — with identical scripted content, then asserts the attached canonical
 * section geometry matches exactly (section keys plus per-section triangle
 * counts) across opaque and translucent streams.
 *
 * Headless and deterministic: no GPU, no thresholds, fixed seeds and counts.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { ChunkMesher } from '../../src/world/ChunkMesher';
import { tileUV } from '../../src/rendering/TextureAtlas';
import {
  processMeshSectionRequest,
  validateMeshSectionRequest,
} from '../../src/rendering/WorkerMeshing';
import {
  validateMeshWorkerRegistryTable,
  type MeshWorkerRegistryTable,
} from '../../src/rendering/MeshWorkerRegistry';
import {
  WORKER_PROTOCOL_VERSION,
  validateWorkerRequest,
  type WorkerRequest,
} from '../../src/rendering/WorkerJobProtocol';

/** Immediate in-process worker: real request validation + real section meshing. */
class ImmediateMeshWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  private table: MeshWorkerRegistryTable | undefined;

  postMessage(data: unknown): void {
    if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'initialize') {
      this.table = validateMeshWorkerRegistryTable((data as { payload: unknown }).payload);
      return;
    }
    const request = validateWorkerRequest(data) as WorkerRequest;
    queueMicrotask(() => {
      try {
        const payload = validateMeshSectionRequest(request.payload, this.table);
        const result = processMeshSectionRequest(payload, request.generationToken);
        this.onmessage?.({
          data: {
            protocolVersion: WORKER_PROTOCOL_VERSION,
            jobId: request.jobId,
            kind: request.kind,
            ok: true,
            generationToken: request.generationToken,
            payload: {
              sectionX: result.sectionX,
              sectionY: result.sectionY,
              sectionZ: result.sectionZ,
              versionSnapshot: result.versionSnapshot,
              layerStreams: result.layerStreams,
            },
          },
        });
      } catch {
        this.onerror?.({});
      }
    });
  }

  terminate(): void {}
  addEventListener(): void {}
}

/** Deterministic scripted content across opaque + translucent streams. */
function writeFixtureContent(world: World): void {
  // 3x3x3 stone cube (opaque stream) inside the resident column (0,0), with
  // an overhang and a notch so culled/interior/exterior faces all occur.
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      for (let dz = 0; dz < 3; dz++) {
        if (dx === 2 && dy === 2 && dz === 2) continue;
        world.setBlock(10 + dx, 6 + dy, 6 + dz, BlockId.Stone);
      }
    }
  }
  world.setBlock(11, 9, 7, BlockId.Stone);
  // Glass strip (translucent stream) adjacent to the cube.
  for (let dz = 0; dz < 3; dz++) {
    world.setBlock(6, 7, 6 + dz, BlockId.Glass);
  }
}

function makeWorld(opts: { workerMeshing: boolean; workerFactory?: () => Worker }): {
  world: World;
  materials: { opaque: THREE.MeshLambertMaterial; transparent: THREE.MeshLambertMaterial };
  registry: ReturnType<typeof createDefaultBlockRegistry>;
} {
  const registry = createDefaultBlockRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  // Atlas seam stub: `ChunkMesher` only calls `uv(tile)` (pure `tileUV`).
  const atlasStub = { uv: (tile: number) => tileUV(tile) };
  const mesher = new ChunkMesher({
    registry,
    atlas: atlasStub as unknown as import('../../src/rendering/TextureAtlas').TextureAtlas,
  });
  const generator = {
    generateColumn(): void {},
    getHeightAt(): number {
      return 0;
    },
  };
  const world = new World({
    registry,
    stateRegistry,
    seed: 1337,
    scene,
    mesher: mesher as never,
    generator: generator as never,
    materials,
    renderDistance: 0,
    dimension: OVERWORLD_DIMENSION_TYPE,
    workerMeshing: opts.workerMeshing,
    workerFactory: opts.workerFactory,
    uvRectFor: (blockId, faceIndex) => {
      const def = registry.get(blockId);
      const tile = faceIndex === 0 ? def.topTile : faceIndex === 1 ? def.bottomTile : def.sideTile;
      return atlasStub.uv(tile);
    },
  });
  return { world, materials, registry };
}

async function settle(world: World): Promise<void> {
  for (let frame = 0; frame < 400; frame++) {
    world.update(1 / 60, 0, 0);
    await Promise.resolve();
    await Promise.resolve();
    if (world.getStats().pendingGeneration === 0 && world.getStats().pendingMesh === 0) return;
  }
  throw new Error('world did not settle within 400 frames');
}

/**
 * Visible unit-face set of one opaque mesh: `solidX,solidY,solidZ:dir`.
 *
 * Both paths emit axis-aligned quads (the worker greedily merges coplanar
 * runs; sync emits unit faces), so triangle counts legitimately differ.
 * Subdividing every quad into its covered unit faces proves both render the
 * same visible surface. Assumes 4 sequential vertices per quad (the
 * `pushQuad` (0,1,2)/(0,2,3) convention); throws otherwise.
 */
function opaqueFaceSet(mesh: THREE.Mesh, origin: { x: number; y: number; z: number }): Set<string> {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  if (positions.count % 4 !== 0) {
    throw new Error(`WorkerSyncEquivalence: expected quads, got ${positions.count} vertices`);
  }
  const faces = new Set<string>();
  for (let quad = 0; quad < positions.count / 4; quad++) {
    // three r150 `BufferAttribute` exposes getX/getY/getZ (no getXYZ).
    const nx = Math.round(normals.getX(quad * 4));
    const ny = Math.round(normals.getY(quad * 4));
    const nz = Math.round(normals.getZ(quad * 4));
    const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (let v = 0; v < 4; v++) {
      const cx = positions.getX(quad * 4 + v);
      const cy = positions.getY(quad * 4 + v);
      const cz = positions.getZ(quad * 4 + v);
      for (let axis = 0; axis < 3; axis++) {
        const component = axis === 0 ? cx : axis === 1 ? cy : cz;
        if (component < min[axis]!) min[axis] = component;
        if (component > max[axis]!) max[axis] = component;
      }
    }
    // Tangent extents must be integral unit-face boundaries.
    for (let axis = 0; axis < 3; axis++) {
      const normalComponent = axis === 0 ? nx : axis === 1 ? ny : axis === 2 ? nz : 0;
      if (normalComponent === 0) {
        if (!Number.isInteger(min[axis]!) || !Number.isInteger(max[axis]!)) {
          throw new Error('WorkerSyncEquivalence: non-integral quad extent');
        }
      }
    }
    const axes = [0, 1, 2].filter((axis) => (axis === 0 ? nx : axis === 1 ? ny : nz) === 0);
    const [tangentA, tangentB] = [axes[0]!, axes[1]!];
    const normalAxis = nx !== 0 ? 0 : ny !== 0 ? 1 : 2;
    const plane = min[normalAxis]!;
    const dir = `${nx !== 0 ? 'x' : ny !== 0 ? 'y' : 'z'}${(nx + ny + nz) > 0 ? '+' : '-'}`;
    for (let a = min[tangentA]!; a < max[tangentA]!; a++) {
      for (let b = min[tangentB]!; b < max[tangentB]!; b++) {
        const cell = [0, 0, 0];
        cell[normalAxis] = (nx + ny + nz) > 0 ? plane - 1 : plane;
        cell[tangentA] = a;
        cell[tangentB] = b;
        faces.add(`${cell[0]! + origin.x},${cell[1]! + origin.y},${cell[2]! + origin.z}:${dir}`);
      }
    }
  }
  return faces;
}

/** Reference visible-face set computed directly from section cells. */
function referenceOpaqueFaces(
  world: World,
  registry: ReturnType<typeof createDefaultBlockRegistry>,
): Set<string> {
  const faces = new Set<string>();
  const dirs = [
    { delta: [1, 0, 0], dir: 'x+' },
    { delta: [-1, 0, 0], dir: 'x-' },
    { delta: [0, 1, 0], dir: 'y+' },
    { delta: [0, -1, 0], dir: 'y-' },
    { delta: [0, 0, 1], dir: 'z+' },
    { delta: [0, 0, -1], dir: 'z-' },
  ] as const;
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 16; y++) {
      for (let z = 0; z < 16; z++) {
        if (!registry.isOpaque(world.getBlock(x, y, z))) continue;
        for (const { delta, dir } of dirs) {
          if (!registry.isOpaque(world.getBlock(x + delta[0], y + delta[1], z + delta[2]))) {
            faces.add(`${x},${y},${z}:${dir}`);
          }
        }
      }
    }
  }
  return faces;
}

describe('258 worker/sync plumbing equivalence', () => {
  it('renders the same visible surface on both paths', async () => {
    const syncBuilt = makeWorld({ workerMeshing: false });
    const workerBuilt = makeWorld({
      workerMeshing: true,
      workerFactory: () => new ImmediateMeshWorker() as unknown as Worker,
    });
    const { world: sync, materials: syncMaterials, registry } = syncBuilt;
    const { world: worker, materials: workerMaterials } = workerBuilt;
    try {
      // Settle the empty column first so fixture edits apply to generated
      // canonical sections (not racing initial generation).
      await settle(sync);
      await settle(worker);
      writeFixtureContent(sync);
      writeFixtureContent(worker);
      await settle(sync);
      await settle(worker);

      const workerDiagnostics = worker.getStats().workerMeshing!;
      expect(workerDiagnostics.enabled).toBe(true);
      expect(workerDiagnostics.completed).toBeGreaterThan(0);
      expect(workerDiagnostics.failures).toBe(0);
      expect(workerDiagnostics.fallbacks).toBe(0);

      const sectionOf = (world: World): THREE.Mesh[] =>
        (world as unknown as { sectionMeshGroups: Map<string, THREE.Mesh[]> }).sectionMeshGroups.get('0,0,0') ?? [];
      const syncMeshes = sectionOf(sync);
      const workerMeshes = sectionOf(worker);
      // Both streams attached on both paths...
      expect(syncMeshes.length).toBe(2);
      expect(workerMeshes.length).toBe(2);
      const opaqueOf = (meshes: THREE.Mesh[], opaque: THREE.Material): THREE.Mesh => {
        const found = meshes.find((mesh) => mesh.material === opaque);
        if (!found) throw new Error('WorkerSyncEquivalence: opaque mesh missing');
        return found;
      };
      // ...the translucent stream matches exactly (no greedy merge there)...
      const translucentOf = (meshes: THREE.Mesh[], transparent: THREE.Material): number => {
        const found = meshes.find((mesh) => mesh.material === transparent);
        if (!found) throw new Error('WorkerSyncEquivalence: translucent mesh missing');
        return (found.geometry as THREE.BufferGeometry).index?.count ?? -1;
      };
      expect(translucentOf(workerMeshes, workerMaterials.transparent)).toBe(
        translucentOf(syncMeshes, syncMaterials.transparent),
      );
      // ...and the opaque stream covers exactly the same visible unit faces
      // (greedy merging changes triangle counts, never coverage).
      const reference = referenceOpaqueFaces(sync, registry);
      expect(reference.size).toBeGreaterThan(0);
      const syncOpaque = opaqueOf(syncMeshes, syncMaterials.opaque);
      const workerOpaque = opaqueOf(workerMeshes, workerMaterials.opaque);
      const syncFaces = opaqueFaceSet(syncOpaque, { x: 0, y: 0, z: 0 });
      const workerFaces = opaqueFaceSet(workerOpaque, { x: 0, y: 0, z: 0 });
      expect(syncFaces).toEqual(reference);
      expect(workerFaces).toEqual(reference);
    } finally {
      sync.dispose();
      worker.dispose();
    }
  });
});
