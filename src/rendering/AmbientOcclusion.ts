/**
 * Per-vertex ambient occlusion for generated meshes (071). A quad corner's AO level (0-3,
 * Minecraft scale) comes from the three-cell neighborhood in the outward layer: the two in-plane
 * side cells and the diagonal corner cell. The cell directly in front of the corner (`(fu, fv)`) is
 * never consulted; out-of-section cells never occlude; fractional corner coordinates snap with
 * `floor()`. The 0-3 table is fixed: both sides → 0; one side (+ diagonal → 1, else → 2); no sides
 * (diagonal → 2, else → 3). Deterministic.
 */
import type { AOLevel, LightSampler } from './GreedyMesher';
import type { FaceLightContext } from './VertexLighting';
import { inPlaneAxes, outwardLayerCoord } from './VertexLighting';

/** True when the cell is in section and opaque (occludes a corner). */
function isOccluding(light: LightSampler, x: number, y: number, z: number): boolean {
  return light.inBounds(x, y, z) && light.isOpaque(x, y, z);
}

/**
 * Sample the AO level at one corner `(u, v)` of a face (in-plane coordinates, world units).
 * Neighborhood: `side1 = (floor(u) - 1, floor(v))`, `side2 = (floor(u), floor(v) - 1)`,
 * `corner = (floor(u) - 1, floor(v) - 1)` in the outward layer.
 */
export function sampleCornerAO(light: LightSampler, ctx: FaceLightContext, u: number, v: number): AOLevel {
  const [uAxis, vAxis] = inPlaneAxes(ctx.axis);
  const layer = outwardLayerCoord(ctx);
  const fu = Math.floor(u);
  const fv = Math.floor(v);

  const cellAt = (du: number, dv: number): [number, number, number] => {
    const coords: [number, number, number] = [ctx.cellX, ctx.cellY, ctx.cellZ];
    coords[ctx.axis] = layer;
    coords[uAxis] = fu + du;
    coords[vAxis] = fv + dv;
    return coords;
  };

  const side1 = isOccluding(light, ...cellAt(-1, 0));
  const side2 = isOccluding(light, ...cellAt(0, -1));
  const corner = isOccluding(light, ...cellAt(-1, -1));

  if (side1 && side2) return 0;
  if (side1 || side2) return corner ? 1 : 2;
  return corner ? 2 : 3;
}

/**
 * The four corner AO levels of a quad spanning `[minU, minU + width] × [minV, minV + height]`.
 * Corner order matches 070 `vertexLights`: `(minU, minV)`, `(maxU, minV)`, `(minU, maxV)`,
 * `(maxU, maxV)`.
 */
export function quadVertexAO(
  light: LightSampler,
  ctx: FaceLightContext,
  minU: number,
  minV: number,
  width: number,
  height: number,
): [AOLevel, AOLevel, AOLevel, AOLevel] {
  const maxU = minU + width;
  const maxV = minV + height;
  return [
    sampleCornerAO(light, ctx, minU, minV),
    sampleCornerAO(light, ctx, maxU, minV),
    sampleCornerAO(light, ctx, minU, maxV),
    sampleCornerAO(light, ctx, maxU, maxV),
  ];
}
