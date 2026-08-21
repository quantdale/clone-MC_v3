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

/** Cell indices adjacent to an in-plane corner coordinate: integer → pair, fractional → containing cell. */
function adjacentIndices(c: number): [number, number] | [number] {
  if (Number.isInteger(c)) return [c - 1, c];
  return [Math.floor(c)];
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
  const [uAxis, vAxis] = inPlaneAxes(ctx.axis);
  const layer = outwardLayerCoord(ctx);
  const us = adjacentIndices(u);
  const vs = adjacentIndices(v);

  let skySum = 0;
  let blockSum = 0;
  let count = 0;

  for (const ui of us) {
    for (const vi of vs) {
      const coords: [number, number, number] = [ctx.cellX, ctx.cellY, ctx.cellZ];
      coords[ctx.axis] = layer;
      coords[uAxis] = ui;
      coords[vAxis] = vi;
      const [x, y, z] = coords;
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

  if (count === 0) return { sky: 0, block: 0 };
  return { sky: Math.round(skySum / count), block: Math.round(blockSum / count) };
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
  const c0 = sampleCornerLight(light, ctx, minU, minV);
  out[0].sky = c0.sky;
  out[0].block = c0.block;
  const c1 = sampleCornerLight(light, ctx, maxU, minV);
  out[1].sky = c1.sky;
  out[1].block = c1.block;
  const c2 = sampleCornerLight(light, ctx, minU, maxV);
  out[2].sky = c2.sky;
  out[2].block = c2.block;
  const c3 = sampleCornerLight(light, ctx, maxU, maxV);
  out[3].sky = c3.sky;
  out[3].block = c3.block;
}
