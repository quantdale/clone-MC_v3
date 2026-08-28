/**
 * Per-vertex light sampling for generated meshes (070). A face quad's four corners get sky/block
 * light by averaging the cells adjacent to each corner in the outward layer: an integer corner
 * coordinate samples the `{c - 1, c}` cell pair per in-plane axis, a fractional coordinate samples
 * only the containing cell; opaque cells contribute 0 and are counted; out-of-section cells are
 * skipped; a corner with no in-section cells is `(0, 0)`. Deterministic: fixed sample order and
 * `Math.round` averaging.
 */
import type { LightSampler, VertexLight } from './GreedyMesher';

/** Face orientation data needed to locate the outward light layer. */
export interface FaceLightContext {
  /** Normal axis (0=x, 1=y, 2=z). */
  axis: 0 | 1 | 2;
  /** True when the face points toward +axis. */
  isMax: boolean;
  /** Face plane coordinate along `axis`, in world units (integer for section faces, fractional for model faces). */
  planeCoord: number;
  /** World cell the face belongs to (used for the fractional-plane outward-layer fallback). */
  cellX: number;
  cellY: number;
  cellZ: number;
}

/** In-plane axes for a face: first = u, second = v (matches 062/063 conventions). */
export function inPlaneAxes(axis: 0 | 1 | 2): [0 | 1 | 2, 0 | 1 | 2] {
  if (axis === 1) return [0, 2]; // up/down: u = x, v = z
  if (axis === 2) return [0, 1]; // north/south: u = x, v = y
  return [2, 1]; // east/west: u = z, v = y
}

/** World coordinate along `axis` of the cell the face belongs to. */
function cellAxisCoord(ctx: FaceLightContext): number {
  if (ctx.axis === 0) return ctx.cellX;
  if (ctx.axis === 1) return ctx.cellY;
  return ctx.cellZ;
}

/** World coordinate along `axis` of the outward layer (one step from the face). */
export function outwardLayerCoord(ctx: FaceLightContext): number {
  if (Number.isInteger(ctx.planeCoord)) {
    return ctx.isMax ? ctx.planeCoord : ctx.planeCoord - 1;
  }
  const cell = cellAxisCoord(ctx);
  return ctx.isMax ? cell + 1 : cell;
}


/**
 * Sample sky/block light at one corner `(u, v)` of a face (in-plane coordinates, world units).
 * The result is `round(average)` over the outward-layer cells adjacent to the corner; opaque cells
 * contribute 0 and are counted; out-of-section cells are skipped.
 */
export function sampleCornerLight(
  light: LightSampler,
  ctx: FaceLightContext,
  u: number,
  v: number,
): VertexLight {
  const out: VertexLight = { sky: 0, block: 0 };
  sampleCornerLightInto(light, ctx, u, v, out);
  return out;
}

/**
 * Write sampled sky/block light at one corner `(u, v)` directly into `out`.
 */
export function sampleCornerLightInto(
  light: LightSampler,
  ctx: FaceLightContext,
  u: number,
  v: number,
  out: VertexLight,
): void {
  const [uAxis, vAxis] = inPlaneAxes(ctx.axis);
  const layer = outwardLayerCoord(ctx);
  const uIsInt = Number.isInteger(u);
  const vIsInt = Number.isInteger(v);
  const uMin = uIsInt ? u - 1 : Math.floor(u);
  const uMax = uIsInt ? u : uMin;
  const vMin = vIsInt ? v - 1 : Math.floor(v);
  const vMax = vIsInt ? v : vMin;

  let skySum = 0;
  let blockSum = 0;
  let count = 0;

  for (let ui = uMin; ui <= uMax; ui++) {
    for (let vi = vMin; vi <= vMax; vi++) {
      let x = ctx.cellX;
      let y = ctx.cellY;
      let z = ctx.cellZ;
      if (ctx.axis === 0) x = layer;
      else if (ctx.axis === 1) y = layer;
      else z = layer;

      if (uAxis === 0) x = ui;
      else if (uAxis === 1) y = ui;
      else z = ui;

      if (vAxis === 0) x = vi;
      else if (vAxis === 1) y = vi;
      else z = vi;

      if (!light.inBounds(x, y, z)) continue;
      if (light.isOpaque(x, y, z)) {
        count++;
        continue;
      }
      skySum += light.getSkyLight(x, y, z);
      blockSum += light.getBlockLight(x, y, z);
      count++;
    }
  }

  if (count === 0) {
    out.sky = 0;
    out.block = 0;
  } else {
    out.sky = Math.round(skySum / count);
    out.block = Math.round(blockSum / count);
  }
}

/**
 * The four corner lights of a quad spanning `[minU, minU + width] × [minV, minV + height]`.
 * Corner order is fixed: `(minU, minV)`, `(maxU, minV)`, `(minU, maxV)`, `(maxU, maxV)`.
 */
export function quadVertexLights(
  light: LightSampler,
  ctx: FaceLightContext,
  minU: number,
  minV: number,
  width: number,
  height: number,
): [VertexLight, VertexLight, VertexLight, VertexLight] {
  const out: [VertexLight, VertexLight, VertexLight, VertexLight] = [
    { sky: 0, block: 0 },
    { sky: 0, block: 0 },
    { sky: 0, block: 0 },
    { sky: 0, block: 0 },
  ];
  quadVertexLightsInto(light, ctx, minU, minV, width, height, out);
  return out;
}

/**
 * Allocation-light variant of `quadVertexLights`: writes the four corner lights
 * into the caller-supplied `out` array of reusable `VertexLight` objects
 * (mesher-time scratch) instead of allocating. Corner order is unchanged.
 */
export function quadVertexLightsInto(
  light: LightSampler,
  ctx: FaceLightContext,
  minU: number,
  minV: number,
  width: number,
  height: number,
  out: readonly [VertexLight, VertexLight, VertexLight, VertexLight] | VertexLight[],
): void {
  const maxU = minU + width;
  const maxV = minV + height;
  sampleCornerLightInto(light, ctx, minU, minV, out[0]!);
  sampleCornerLightInto(light, ctx, maxU, minV, out[1]!);
  sampleCornerLightInto(light, ctx, minU, maxV, out[2]!);
  sampleCornerLightInto(light, ctx, maxU, maxV, out[3]!);
}
