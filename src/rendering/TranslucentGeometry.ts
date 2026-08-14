/**
 * Dedicated translucent geometry handling (074). Quads are layer-agnostic (062/070/071); this module
 * partitions a batch into solid/translucent sets via a caller-supplied blockId → 061 render-layer
 * resolver and provides a deterministic far-to-near (painter's) ordering of translucent quads by
 * squared centroid distance from the camera, with ties resolved by stable input order. All functions
 * are pure and never mutate their inputs.
 */
import type { RenderLayer } from './RenderLayer';
import type { ModelFace } from '../data/BlockModel';
import type { OpaqueFaceQuad } from './GreedyMesher';
import { inPlaneAxes } from './VertexLighting';

/** Maps a quad's block id to its 061 render layer (caller-owned, e.g. RenderLayerRegistry-backed). */
export type QuadLayerResolver = (blockId: number) => RenderLayer;

/** The partition of a quad batch into solid and translucent sets. */
export interface QuadPartition {
  /** Everything whose resolved layer is not `'translucent'`. */
  opaque: OpaqueFaceQuad[];
  /** Exactly the quads whose resolved layer is `'translucent'`, in input order. */
  translucent: OpaqueFaceQuad[];
}

/** Face plane axis: up/down → 1 (y), north/south → 2 (z), east/west → 0 (x). */
function faceAxis(face: ModelFace): 0 | 1 | 2 {
  if (face === 'up' || face === 'down') return 1;
  if (face === 'north' || face === 'south') return 2;
  return 0;
}

/**
 * The face-plane-aware center of a quad: the min corner advanced by half-extents along the two
 * in-plane axes.
 */
export function quadCentroid(quad: OpaqueFaceQuad): [number, number, number] {
  const [uAxis, vAxis] = inPlaneAxes(faceAxis(quad.face));
  const center: [number, number, number] = [quad.x, quad.y, quad.z];
  center[uAxis] += quad.width / 2;
  center[vAxis] += quad.height / 2;
  return center;
}

/** Split a quad batch into solid and translucent sets, preserving input order (no mutation). */
export function partitionQuadsByLayer(
  quads: readonly OpaqueFaceQuad[],
  layerOf: QuadLayerResolver,
): QuadPartition {
  const opaque: OpaqueFaceQuad[] = [];
  const translucent: OpaqueFaceQuad[] = [];
  for (const quad of quads) {
    if (layerOf(quad.blockId) === 'translucent') translucent.push(quad);
    else opaque.push(quad);
  }
  return { opaque, translucent };
}

/**
 * Order translucent quads far-to-near (painter's algorithm): descending squared centroid distance
 * from the camera; equal distances keep input order (explicit stable tie-break). Returns a new
 * array; the input is never mutated.
 */
export function sortTranslucentBackToFront(
  quads: readonly OpaqueFaceQuad[],
  cameraX: number,
  cameraY: number,
  cameraZ: number,
): OpaqueFaceQuad[] {
  const decorated = quads.map((quad, index) => {
    const [cx, cy, cz] = quadCentroid(quad);
    const dx = cx - cameraX;
    const dy = cy - cameraY;
    const dz = cz - cameraZ;
    return { quad, index, distanceSq: dx * dx + dy * dy + dz * dz };
  });
  decorated.sort((a, b) => b.distanceSq - a.distanceSq || a.index - b.index);
  return decorated.map((entry) => entry.quad);
}
