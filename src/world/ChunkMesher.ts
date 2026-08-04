import * as THREE from 'three';
import { BlockId, BlockRegistry, RenderCategory } from './BlockRegistry';
import { Chunk } from './Chunk';
import { CHUNK_DIMENSIONS } from './WorldCoordinates';
import type { TextureAtlas } from '../rendering/TextureAtlas';
import type { ChunkMeshResult } from './MeshingTypes';

/**
 * A single cube face: its outward direction (used to look up the neighbor),
 * its outward normal (per-vertex), and the four unit corners of the face
 * relative to the block origin. Corners are ordered so that the two triangles
 * (0,1,2) and (0,2,3) wind counter-clockwise when viewed from outside,
 * keeping the normal pointing outward.
 */
interface Face {
  dir: [number, number, number];
  normal: [number, number, number];
  corners: [number, number, number][];
}

const FACES: Face[] = [
  // +X
  { dir: [1, 0, 0], normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  // -X
  { dir: [-1, 0, 0], normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  // +Y (top)
  { dir: [0, 1, 0], normal: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  // -Y (bottom)
  { dir: [0, -1, 0], normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  // +Z
  { dir: [0, 0, 1], normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  // -Z
  { dir: [0, 0, -1], normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

/** Per-face UV corner: c0→(u0,v0), c1→(u1,v0), c2→(u1,v1), c3→(u0,v1). */
const VERTEX_U_INDEX = [0, 1, 1, 0];
const VERTEX_V_INDEX = [0, 0, 1, 1];

/**
 * Builds Indexed BufferGeometry for a chunk's visible faces using
 * face-culled meshing. Produces one opaque geometry and one transparent
 * geometry (each null when the chunk has no faces of that category).
 */
export class ChunkMesher {
  private readonly registry: BlockRegistry;
  private readonly atlas: TextureAtlas;
  private getNeighbor: (cx: number, cy: number, cz: number) => Chunk | undefined = () => undefined;

  constructor(opts: { registry: BlockRegistry; atlas: TextureAtlas }) {
    this.registry = opts.registry;
    this.atlas = opts.atlas;
  }

  mesh(chunk: Chunk, getNeighbor: (cx: number, cy: number, cz: number) => Chunk | undefined): ChunkMeshResult {
    this.getNeighbor = getNeighbor;

    const opaque = {
      positions: [] as number[],
      normals: [] as number[],
      uvs: [] as number[],
      indices: [] as number[],
    };
    const transparent = {
      positions: [] as number[],
      normals: [] as number[],
      uvs: [] as number[],
      indices: [] as number[],
    };

    const { width, height, depth } = CHUNK_DIMENSIONS;

    for (let y = 0; y < height; y++) {
      for (let z = 0; z < depth; z++) {
        for (let x = 0; x < width; x++) {
          const id = chunk.getLocal(x, y, z);
          if (id === BlockId.Air) {
            continue;
          }
          const def = this.registry.get(id);
          const isTransparent = def.renderCategory === RenderCategory.Transparent;

          for (const face of FACES) {
            const neighborId = this.getNeighborBlock(chunk, x, y, z, face.dir[0], face.dir[1], face.dir[2]);
            const neighborDef = this.registry.get(neighborId);

            // Faces are emitted only where the adjacent block does not hide them.
            let emit: boolean;
            if (isTransparent) {
              // Water: emit only against a non-water, non-opaque neighbor (e.g. air).
              emit = !neighborDef.opaque && neighborDef.renderCategory !== RenderCategory.Transparent;
            } else {
              // Opaque solid blocks: emit anywhere the neighbor is not opaque.
              // Leaves are solid but not opaque, so faces stay visible against them.
              emit = !neighborDef.opaque;
            }
            if (!emit) {
              continue;
            }

            const tile = face.dir[1] === 1 ? def.topTile : face.dir[1] === -1 ? def.bottomTile : def.sideTile;
            const uv = this.atlas.uv(tile);
            const target = isTransparent ? transparent : opaque;
            const base = target.positions.length / 3;

            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c]!;
              target.positions.push(x + corner[0], y + corner[1], z + corner[2]);
              target.normals.push(face.normal[0], face.normal[1], face.normal[2]);
              const u = VERTEX_U_INDEX[c] === 1 ? uv.u1 : uv.u0;
              const v = VERTEX_V_INDEX[c] === 1 ? uv.v1 : uv.v0;
              target.uvs.push(u, v);
            }
            target.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
    }

    return {
      opaque: this.buildGeometry(opaque),
      transparent: this.buildGeometry(transparent),
    };
  }

  /** Resolve the block id adjacent to a local block, crossing into neighboring chunks. */
  private getNeighborBlock(chunk: Chunk, x: number, y: number, z: number, dx: number, dy: number, dz: number): number {
    const { width, height, depth } = CHUNK_DIMENSIONS;
    const nx = x + dx;
    const ny = y + dy;
    const nz = z + dz;

    if (nx >= 0 && nx < width && ny >= 0 && ny < height && nz >= 0 && nz < depth) {
      return chunk.getLocal(nx, ny, nz);
    }

    const ncx = chunk.cx + (nx < 0 ? -1 : nx >= width ? 1 : 0);
    const ncy = chunk.cy + (ny < 0 ? -1 : ny >= height ? 1 : 0);
    const ncz = chunk.cz + (nz < 0 ? -1 : nz >= depth ? 1 : 0);
    const lx = nx < 0 ? nx + width : nx >= width ? nx - width : nx;
    const ly = ny < 0 ? ny + height : ny >= height ? ny - height : ny;
    const lz = nz < 0 ? nz + depth : nz >= depth ? nz - depth : nz;

    const neighbor = this.getNeighbor(ncx, ncy, ncz);
    if (!neighbor) {
      return BlockId.Air;
    }
    return neighbor.getLocal(lx, ly, lz);
  }

  /** Build an indexed BufferGeometry, or null when there are no faces. */
  private buildGeometry(data: {
    positions: number[];
    normals: number[];
    uvs: number[];
    indices: number[];
  }): THREE.BufferGeometry | null {
    if (data.indices.length === 0) {
      return null;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.positions), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normals), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uvs), 2));
    geometry.setIndex(data.indices);
    return geometry;
  }
}