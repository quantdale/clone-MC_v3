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

function checkOccluding(
  light: LightSampler,
  ctx: FaceLightContext,
  layer: number,
  uAxis: 0 | 1 | 2,
  vAxis: 0 | 1 | 2,
  uVal: number,
  vVal: number,
): boolean {
  let x = ctx.cellX;
  let y = ctx.cellY;
  let z = ctx.cellZ;
  if (ctx.axis === 0) x = layer;
  else if (ctx.axis === 1) y = layer;
  else z = layer;

  if (uAxis === 0) x = uVal;
  else if (uAxis === 1) y = uVal;
  else z = uVal;

  if (vAxis === 0) x = vVal;
  else if (vAxis === 1) y = vVal;
  else z = vVal;

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

  const side1 = checkOccluding(light, ctx, layer, uAxis, vAxis, fu - 1, fv);
  const side2 = checkOccluding(light, ctx, layer, uAxis, vAxis, fu, fv - 1);
  const corner = checkOccluding(light, ctx, layer, uAxis, vAxis, fu - 1, fv - 1);

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
  const out: [AOLevel, AOLevel, AOLevel, AOLevel] = [0, 0, 0, 0];
  quadVertexAOInto(light, ctx, minU, minV, width, height, out);
  return out;
}

/**
 * Allocation-light variant of `quadVertexAO`: writes the four corner AO levels
 * into the caller-supplied `out` array (mesher-time scratch) instead of
 * allocating. Corner order matches `quadVertexLights`.
 */
export function quadVertexAOInto(
  light: LightSampler,
  ctx: FaceLightContext,
  minU: number,
  minV: number,
  width: number,
  height: number,
  out: [AOLevel, AOLevel, AOLevel, AOLevel] | AOLevel[],
): void {
  const maxU = minU + width;
  const maxV = minV + height;
  out[0] = sampleCornerAO(light, ctx, minU, minV);
  out[1] = sampleCornerAO(light, ctx, maxU, minV);
  out[2] = sampleCornerAO(light, ctx, minU, maxV);
  out[3] = sampleCornerAO(light, ctx, maxU, maxV);
}
