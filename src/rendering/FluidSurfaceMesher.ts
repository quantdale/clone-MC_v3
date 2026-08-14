/**
 * Level-aware fluid surface meshing (083). `meshFluidSurface` emits deterministic quads for one
 * fluid cell: a top face at the 076 surface height (`1` for source/falling, `(8 - level) / 8` for
 * flowing) when the cell above is not the same fluid, and side faces — full depth against
 * air/blocks/different fluids, step height against lower same-fluid surfaces; equal/higher
 * same-fluid neighbors produce no side. Zero-height sides are skipped. Quads reuse the 062 shape
 * with `blockId = fluidId` and 070/071 corner light/AO. Per-cell emission order: up, then
 * `-x, +x, -z, +z`.
 */
import type { OpaqueFaceQuad, LightSampler } from './GreedyMesher';
import { quadVertexAO } from './AmbientOcclusion';
import { quadVertexLights, type FaceLightContext } from './VertexLighting';
import { fluidSurfaceHeight, type FluidState } from '../world/FluidState';

/** The fluid cells a surface mesh reads. */
export interface FluidSurfaceWorld {
  getFluidState(x: number, y: number, z: number): FluidState | null;
}

const SIDE_ORDER: ReadonlyArray<{ face: OpaqueFaceQuad['face']; dx: number; dz: number }> = [
  { face: 'west', dx: -1, dz: 0 },
  { face: 'east', dx: 1, dz: 0 },
  { face: 'north', dx: 0, dz: -1 },
  { face: 'south', dx: 0, dz: 1 },
];

/** Face plane axis per 062 conventions: west/east → x (0), up/down → y (1), north/south → z (2). */
function faceAxis(face: OpaqueFaceQuad['face']): 0 | 1 | 2 {
  if (face === 'west' || face === 'east') return 0;
  if (face === 'up' || face === 'down') return 1;
  return 2;
}

/**
 * Push one shaded quad. `(x, y, z)` is the quad's min corner; width/height extend along the
 * face's in-plane axes (062 conventions). `cellX/Y/Z` is the face's own cell; `planeCoord` the
 * plane along the normal axis.
 */
function pushShaded(
  out: OpaqueFaceQuad[],
  fluidId: number,
  light: LightSampler,
  face: OpaqueFaceQuad['face'],
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  cellX: number,
  cellY: number,
  cellZ: number,
  planeCoord: number,
): void {
  const axis = faceAxis(face);
  const isMax = face === 'up' || face === 'east' || face === 'south';
  const ctx: FaceLightContext = { axis, isMax, planeCoord, cellX, cellY, cellZ };
  // In-plane mapping (062): up/down → u=x, v=z; north/south → u=x, v=y; west/east → u=z, v=y.
  const minU = axis === 0 ? z : x;
  const minV = axis === 1 ? z : y;
  out.push({
    face,
    x,
    y,
    z,
    width,
    height,
    blockId: fluidId,
    vertexLights: quadVertexLights(light, ctx, minU, minV, width, height),
    vertexAO: quadVertexAO(light, ctx, minU, minV, width, height),
  });
}

/** The surface quads of the fluid cell at (x, y, z); [] when the cell holds no such fluid. */
export function meshFluidSurface(
  world: FluidSurfaceWorld,
  fluidId: number,
  light: LightSampler,
  x: number,
  y: number,
  z: number,
): OpaqueFaceQuad[] {
  const state = world.getFluidState(x, y, z);
  if (state === null || state.fluidId !== fluidId) return [];

  const out: OpaqueFaceQuad[] = [];
  const surface = fluidSurfaceHeight(state);
  const ownTop = y + surface;

  // Top face: emitted only when the cell above is not the same fluid.
  const above = world.getFluidState(x, y + 1, z);
  if (above === null || above.fluidId !== fluidId) {
    pushShaded(out, fluidId, light, 'up', x, ownTop, z, 1, 1, x, y, z, ownTop);
  }

  // Side faces in fixed order.
  for (const side of SIDE_ORDER) {
    const neighbor = world.getFluidState(x + side.dx, y, z + side.dz);
    let neighborTop = y;
    if (neighbor !== null && neighbor.fluidId === fluidId) {
      neighborTop = y + fluidSurfaceHeight(neighbor);
    }
    if (neighborTop >= ownTop) continue; // equal/higher same-fluid surface → no side

    const height = ownTop - neighborTop;
    if (height <= 0) continue; // zero-height sides are never emitted

    if (side.face === 'west' || side.face === 'east') {
      const plane = x + (side.face === 'east' ? 1 : 0);
      // west/east: plane on x; quad spans y ∈ [neighborTop, ownTop], z ∈ [z, z+1].
      pushShaded(out, fluidId, light, side.face, plane, neighborTop, z, 1, height, x, y, z, plane);
    } else {
      const plane = z + (side.face === 'south' ? 1 : 0);
      // north/south: plane on z; quad spans x ∈ [x, x+1], y ∈ [neighborTop, ownTop].
      pushShaded(out, fluidId, light, side.face, x, neighborTop, plane, 1, height, x, y, z, plane);
    }
  }

  return out;
}

/** Mesh a batch of positions in input order (deterministic). */
export function meshFluidSurfaces(
  world: FluidSurfaceWorld,
  fluidId: number,
  light: LightSampler,
  positions: ReadonlyArray<[number, number, number]>,
): OpaqueFaceQuad[] {
  const out: OpaqueFaceQuad[] = [];
  for (const [x, y, z] of positions) {
    out.push(...meshFluidSurface(world, fluidId, light, x, y, z));
  }
  return out;
}
