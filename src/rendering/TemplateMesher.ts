/**
 * Template (partial-block) meshing (063). `meshBlockModel` converts a 059 `BlockModel` at a world
 * cell into world-unit `OpaqueFaceQuad`s: per element, per face, the quad spans the two in-plane
 * axes from `from/16` to `to/16` at the face plane. Boundary faces (plane at local 0 or 1) are culled
 * when the outward neighbor is opaque; interior faces are never culled. Since 070 every quad carries
 * per-corner sky/block light sampled from the caller-supplied `LightSampler`. Deterministic output in
 * model element order.
 */
import type { BlockModel, ModelFace } from '../data/BlockModel';
import type { OpaqueFaceQuad, LightSampler } from './GreedyMesher';
import { quadVertexLights, type FaceLightContext } from './VertexLighting';

/** Whether the cell at world coordinates is opaque (for culling). */
export type OpaqueCellPredicate = (x: number, y: number, z: number) => boolean;

interface FaceSpec {
  face: ModelFace;
  /** Plane axis (0=x, 1=y, 2=z). */
  axis: 0 | 1 | 2;
  /** True when the face sits at the element's max side on its axis. */
  isMax: boolean;
}

const FACE_ORDER: readonly FaceSpec[] = [
  { face: 'down', axis: 1, isMax: false },
  { face: 'up', axis: 1, isMax: true },
  { face: 'north', axis: 2, isMax: false },
  { face: 'south', axis: 2, isMax: true },
  { face: 'east', axis: 0, isMax: true },
  { face: 'west', axis: 0, isMax: false },
];

/**
 * Mesh a block model at cell `(x, y, z)` into world-unit quads. `blockId` is stamped on every quad.
 * Boundary faces whose outward neighbor is opaque are culled. Every quad carries per-corner light
 * sampled from `light` (070).
 */
export function meshBlockModel(
  model: BlockModel,
  blockId: number,
  x: number,
  y: number,
  z: number,
  isOpaqueCell: OpaqueCellPredicate,
  light: LightSampler,
): OpaqueFaceQuad[] {
  const out: OpaqueFaceQuad[] = [];

  for (const element of model.elements) {
    for (const spec of FACE_ORDER) {
      const faceData = element.faces[spec.face];
      if (!faceData) continue;

      const from = element.from;
      const to = element.to;
      const planeLocal = (spec.isMax ? to[spec.axis]! : from[spec.axis]!) / 16;

      // Outward neighbor.
      const nx = x + (spec.axis === 0 ? (spec.isMax ? 1 : -1) : 0);
      const ny = y + (spec.axis === 1 ? (spec.isMax ? 1 : -1) : 0);
      const nz = z + (spec.axis === 2 ? (spec.isMax ? 1 : -1) : 0);

      // Cull only boundary faces (plane at local 0 or 1) against opaque neighbors.
      const isBoundary = planeLocal === 0 || planeLocal === 1;
      if (isBoundary && isOpaqueCell(nx, ny, nz)) {
        continue;
      }

      // In-plane axes: for up/down -> (x, z); north/south -> (x, y); east/west -> (z, y).
      const uAxis = spec.axis === 1 ? 0 : spec.axis === 2 ? 0 : 2;
      const vAxis = spec.axis === 1 ? 2 : spec.axis === 2 ? 1 : 1;
      const uFrom = from[uAxis]! / 16;
      const vFrom = from[vAxis]! / 16;
      const uTo = to[uAxis]! / 16;
      const vTo = to[vAxis]! / 16;
      const width = uTo - uFrom;
      const height = vTo - vFrom;

      const cell = [x, y, z] as const;
      const quadPos: [number, number, number] = [cell[0], cell[1], cell[2]];
      quadPos[spec.axis] = cell[spec.axis]! + planeLocal;
      quadPos[uAxis] = cell[uAxis]! + uFrom;
      quadPos[vAxis] = cell[vAxis]! + vFrom;

      const ctx: FaceLightContext = {
        axis: spec.axis,
        isMax: spec.isMax,
        planeCoord: cell[spec.axis]! + planeLocal,
        cellX: x,
        cellY: y,
        cellZ: z,
      };

      out.push({
        face: spec.face,
        x: quadPos[0],
        y: quadPos[1],
        z: quadPos[2],
        width,
        height,
        blockId,
        vertexLights: quadVertexLights(light, ctx, cell[uAxis]! + uFrom, cell[vAxis]! + vFrom, width, height),
      });
    }
  }

  return out;
}

/** True when the model is exactly the canonical full cube (one element, all six faces). */
export function isFullCubeModel(model: BlockModel): boolean {
  if (model.elements.length !== 1) return false;
  const element = model.elements[0]!;
  const from = element.from;
  const to = element.to;
  const isFullBox = from[0] === 0 && from[1] === 0 && from[2] === 0 && to[0] === 16 && to[1] === 16 && to[2] === 16;
  if (!isFullBox) return false;
  for (const spec of FACE_ORDER) {
    if (!element.faces[spec.face]) return false;
  }
  return true;
}
