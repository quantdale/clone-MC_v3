import * as THREE from 'three';
import { BlockId, BlockRegistry, RenderCategory } from './BlockRegistry';
import type { BlockState } from './BlockStateRegistry';
import type { ChunkSection } from './ChunkSection';
import { Chunk } from './Chunk';
import { CHUNK_DIMENSIONS } from './WorldCoordinates';
import type { TextureAtlas } from '../rendering/TextureAtlas';
import type { LightSampler, VertexLight } from '../rendering/GreedyMesher';
import { quadVertexAOInto } from '../rendering/AmbientOcclusion';
import { inPlaneAxes, quadVertexLightsInto } from '../rendering/VertexLighting';
import {
  MeshBuildResultBuilder,
  emitQuad,
  emptyMeshBuildResult,
  emptyMeshStream,
  type MeshStreamName,
  type UvRect,
  type ChunkMeshResult,
  type MeshBuildResult,
  type MeshStreamData,
} from './MeshingTypes';
import type { SectionVersionSnapshot } from './SectionVersionSnapshot';

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

/** Normal axis of a face: x/y/z → 0/1/2. */
function faceAxis(face: Face): 0 | 1 | 2 {
  if (face.dir[0] !== 0) return 0;
  if (face.dir[1] !== 0) return 1;
  return 2;
}

/**
 * Optional per-build extensions. All fields are optional so existing callers
 * (`Game.ts`, `World.ts`) keep working unchanged:
 *
 * - `inputVersion`: version token stamped onto `streams.inputVersion` for
 *   stale-result rejection at integration time (audit 04 "Meshing strategy");
 * - `renderLayerOf`: block id → stream override; defaults to
 *   `RenderCategory.Transparent ? 'translucent' : 'opaque'` and may route any
 *   block to `'cutout'` or `'fluid'`;
 * - `lightSampler`: world-coordinate sky/block-light + opacity sampler (the
 *   same interface the greedy path uses). When omitted, neutral shading
 *   (sky 15, block 0, AO 3) is emitted so geometry stays valid;
 * - `tintRgbOf`: block id → linear RGB tint (0-1 per channel); default white.
 */
export interface ChunkMeshOptions {
  inputVersion?: number;
  /** Canonical target/neighbor mesh and light versions captured at submission. */
  versionSnapshot?: SectionVersionSnapshot;
  renderLayerOf?(id: number): MeshStreamName;
  lightSampler?: LightSampler;
  tintRgbOf?(id: number): [number, number, number];
}

// Grow-only shared scratch: one builder set reused across every mesh() call so
// steady-state chunk remeshing allocates only the frozen output snapshots.
const SCRATCH = new MeshBuildResultBuilder();
const SCRATCH_LIGHTS: VertexLight[] = [
  { sky: 15, block: 0 },
  { sky: 15, block: 0 },
  { sky: 15, block: 0 },
  { sky: 15, block: 0 },
];
const SCRATCH_AO: (0 | 1 | 2 | 3)[] = [3, 3, 3, 3];
// Reused per-face scratch: corner positions and the atlas UV rectangle.
const SCRATCH_CORNERS: [number, number, number][] = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];
const SCRATCH_UV: UvRect = { u0: 0, v0: 0, u1: 0, v1: 0 };

/**
 * Builds indexed BufferGeometry streams for a chunk's visible faces using
 * face-culled meshing. The build routes through the consolidated four-stream
 * model (`opaque` / `cutout` / `translucent` / `fluid`, see MeshingTypes):
 * every face is classified into exactly one stream, shaded per-corner via the
 * optional injectable samplers, and emitted into grow-only typed-array
 * builders. The historical two-field result shape is preserved — `opaque` and
 * `transparent` geometries are derived from the same stream build, with
 * `transparent` aliasing the translucent stream — while cutout/fluid streams
 * are exposed alongside for the extended material setup.
 */
export class ChunkMesher {
  private readonly registry: BlockRegistry;
  private readonly atlas: TextureAtlas;
  private getNeighbor: (cx: number, cy: number, cz: number) => Chunk | undefined = () => undefined;

  constructor(opts: { registry: BlockRegistry; atlas: TextureAtlas }) {
    this.registry = opts.registry;
    this.atlas = opts.atlas;
  }

  mesh(
    chunk: Chunk,
    getNeighbor: (cx: number, cy: number, cz: number) => Chunk | undefined,
    options?: ChunkMeshOptions,
  ): ChunkMeshResult {
    this.getNeighbor = getNeighbor;
    const inputVersion = options?.inputVersion ?? 0;
    const light = options?.lightSampler;
    const renderLayerOf =
      options?.renderLayerOf ??
      ((id: number): MeshStreamName =>
        this.registry.get(id).renderCategory === RenderCategory.Transparent ? 'translucent' : 'opaque');

    SCRATCH.reset();

    const { width, height, depth } = CHUNK_DIMENSIONS;
    // Chunk origin in world coordinates (light sampling crosses chunk borders).
    const ox = chunk.cx * width;
    const oy = chunk.cy * height;
    const oz = chunk.cz * depth;

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
              // Transparent blocks: emit only against a non-transparent,
              // non-opaque neighbor (e.g. air), keeping water/glass interiors
              // from producing redundant faces.
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
            const uvRaw = this.atlas.uv(tile);
            SCRATCH_UV.u0 = uvRaw.u0;
            SCRATCH_UV.v0 = uvRaw.v0;
            SCRATCH_UV.u1 = uvRaw.u1;
            SCRATCH_UV.v1 = uvRaw.v1;

            this.sampleCornerShading(light, face, ox + x, oy + y, oz + z);

            let tintR = 1;
            let tintG = 1;
            let tintB = 1;
            if (options?.tintRgbOf) {
              const rgb = options.tintRgbOf(id);
              tintR = rgb[0];
              tintG = rgb[1];
              tintB = rgb[2];
            }

            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c]!;
              SCRATCH_CORNERS[c]![0] = x + corner[0];
              SCRATCH_CORNERS[c]![1] = y + corner[1];
              SCRATCH_CORNERS[c]![2] = z + corner[2];
            }

            const streamName = renderLayerOf(id);
            emitQuad(
              SCRATCH.builder(streamName),
              SCRATCH_CORNERS,
              face.normal[0],
              face.normal[1],
              face.normal[2],
              SCRATCH_UV,
              SCRATCH_LIGHTS,
              SCRATCH_AO,
              tintR,
              tintG,
              tintB,
            );
          }
        }
      }
    }

    const streams: MeshBuildResult = SCRATCH.build(inputVersion);
    // `transparent` aliases the translucent stream (hardening 2026-08-23):
    // building it twice produced a second, never-rendered BufferGeometry that
    // was discarded as CPU garbage on every remesh.
    const translucent = buildGeometry(streams.streams.translucent);
    return {
      opaque: buildGeometry(streams.streams.opaque),
      transparent: translucent,
      cutout: buildGeometry(streams.streams.cutout),
      translucent,
      fluid: buildGeometry(streams.streams.fluid),
      versionSnapshot: options?.versionSnapshot,
      streams,
    };
  }

  /**
   * Fill the reusable corner-shading scratch for one face. When no sampler is
   * supplied the neutral values already in the scratch are kept (sky 15,
   * block 0, AO 3), matching an unshaded build.
   */
  private sampleCornerShading(light: LightSampler | undefined, face: Face, wx: number, wy: number, wz: number): void {
    if (!light) {
      return;
    }
    const axis = faceAxis(face);
    const isMax = face.dir[axis]! > 0;
    const planeCoord = (axis === 0 ? wx : axis === 1 ? wy : wz) + (isMax ? 1 : 0);
    // In-plane axes (062 conventions): up/down → u=x,v=z; north/south → u=x,v=y; east/west → u=z,v=y.
    const [uAxis, vAxis] = inPlaneAxes(axis);
    const minU = uAxis === 0 ? wx : uAxis === 1 ? wy : wz;
    const minV = vAxis === 0 ? wx : vAxis === 1 ? wy : wz;
    const ctx = { axis, isMax, planeCoord, cellX: wx, cellY: wy, cellZ: wz };
    quadVertexLightsInto(light, ctx, minU, minV, 1, 1, SCRATCH_LIGHTS);
    quadVertexAOInto(light, ctx, minU, minV, 1, 1, SCRATCH_AO);
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

  /**
   * Builds indexed BufferGeometry streams for a single 16³ chunk section using
   * face-culled meshing and canonical world-coordinate neighbor queries.
   */
  meshSection(
    sx: number,
    sy: number,
    sz: number,
    section: ChunkSection,
    getBlockState: (wx: number, wy: number, wz: number) => BlockState,
    options?: ChunkMeshOptions,
  ): ChunkMeshResult {
    const inputVersion = options?.inputVersion ?? section.meshVersion;
    if (section.isEmpty()) {
      return {
        opaque: null,
        transparent: null,
        cutout: null,
        translucent: null,
        fluid: null,
        versionSnapshot: options?.versionSnapshot,
        streams: emptyMeshBuildResult(inputVersion),
      };
    }

    const light = options?.lightSampler;
    const renderLayerOf =
      options?.renderLayerOf ??
      ((id: number): MeshStreamName =>
        this.registry.get(id).renderCategory === RenderCategory.Transparent ? 'translucent' : 'opaque');

    SCRATCH.reset();

    const ox = sx * 16;
    const oy = sy * 16;
    const oz = sz * 16;

    for (let y = 0; y < 16; y++) {
      const wy = oy + y;
      for (let z = 0; z < 16; z++) {
        const wz = oz + z;
        for (let x = 0; x < 16; x++) {
          const wx = ox + x;
          const state = section.getStateAt(x, y, z);
          const id = state.blockId;
          if (id === BlockId.Air) {
            continue;
          }
          const def = this.registry.get(id);
          const isTransparent = def.renderCategory === RenderCategory.Transparent;

          for (const face of FACES) {
            const nwx = wx + face.dir[0];
            const nwy = wy + face.dir[1];
            const nwz = wz + face.dir[2];
            const inLocal =
              x + face.dir[0] >= 0 && x + face.dir[0] < 16 &&
              y + face.dir[1] >= 0 && y + face.dir[1] < 16 &&
              z + face.dir[2] >= 0 && z + face.dir[2] < 16;
            const neighborState = inLocal
              ? section.getStateAt(x + face.dir[0], y + face.dir[1], z + face.dir[2])
              : getBlockState(nwx, nwy, nwz);
            const neighborDef = this.registry.get(neighborState.blockId);

            let emit: boolean;
            if (isTransparent) {
              emit = !neighborDef.opaque && neighborDef.renderCategory !== RenderCategory.Transparent;
            } else {
              emit = !neighborDef.opaque;
            }
            if (!emit) {
              continue;
            }

            const tile = face.dir[1] === 1 ? def.topTile : face.dir[1] === -1 ? def.bottomTile : def.sideTile;
            const uvRaw = this.atlas.uv(tile);
            SCRATCH_UV.u0 = uvRaw.u0;
            SCRATCH_UV.v0 = uvRaw.v0;
            SCRATCH_UV.u1 = uvRaw.u1;
            SCRATCH_UV.v1 = uvRaw.v1;

            this.sampleCornerShading(light, face, wx, wy, wz);

            let tintR = 1;
            let tintG = 1;
            let tintB = 1;
            if (options?.tintRgbOf) {
              const rgb = options.tintRgbOf(id);
              tintR = rgb[0];
              tintG = rgb[1];
              tintB = rgb[2];
            }

            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c]!;
              SCRATCH_CORNERS[c]![0] = x + corner[0];
              SCRATCH_CORNERS[c]![1] = y + corner[1];
              SCRATCH_CORNERS[c]![2] = z + corner[2];
            }

            const streamName = renderLayerOf(id);
            emitQuad(
              SCRATCH.builder(streamName),
              SCRATCH_CORNERS,
              face.normal[0],
              face.normal[1],
              face.normal[2],
              SCRATCH_UV,
              SCRATCH_LIGHTS,
              SCRATCH_AO,
              tintR,
              tintG,
              tintB,
            );
          }
        }
      }
    }

    const streams: MeshBuildResult = SCRATCH.build(inputVersion);
    const translucent = buildGeometry(streams.streams.translucent);
    return {
      opaque: buildGeometry(streams.streams.opaque),
      transparent: translucent,
      cutout: buildGeometry(streams.streams.cutout),
      translucent,
      fluid: buildGeometry(streams.streams.fluid),
      versionSnapshot: options?.versionSnapshot,
      streams,
    };
  }
}

/** Build an indexed BufferGeometry from a finished stream, or null when empty. */
function buildGeometry(data: MeshStreamData): THREE.BufferGeometry | null {
  if (data.indexCount === 0) {
    return null;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geometry.setAttribute('skylight', new THREE.BufferAttribute(data.skyLight, 1));
  geometry.setAttribute('blocklight', new THREE.BufferAttribute(data.blockLight, 1));
  geometry.setAttribute('ao', new THREE.BufferAttribute(data.ao, 1));
  geometry.setAttribute('tint', new THREE.BufferAttribute(data.tint, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  return geometry;
}

/** Re-exported so integration code can build geometries from raw streams without duplicating logic. */
export { buildGeometry as geometryFromMeshStream, emptyMeshStream };
