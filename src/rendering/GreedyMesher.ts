/**
 * Greedy opaque face meshing (062). Exposed opaque cube faces in a 16³ section are merged into
 * maximal rectangles, merging only cells whose `faceKey(id, face)` matches. The algorithm scans each
 * face and slice, builds a visibility grid (opaque cell whose outward neighbor is not opaque —
 * out-of-section neighbors count as exposed), and greedily extends rectangles row-major. Output is
 * deterministic. `enumerateOpaqueFacesNaive` emits one quad per exposed face for regression
 * equivalence testing. Since 070 every emitted quad also carries per-corner sky/block light sampled
 * from a caller-supplied `LightSampler` (see VertexLighting), and since 071 per-corner ambient
 * occlusion (see AmbientOcclusion).
 */
import type { ModelFace } from '../data/BlockModel';
import { quadVertexAO } from './AmbientOcclusion';
import { quadVertexLights, type FaceLightContext } from './VertexLighting';

/** Sky/block light at one quad corner (0-15). */
export interface VertexLight {
  sky: number;
  block: number;
}

/** Per-corner ambient occlusion level (Minecraft scale: 3 = unoccluded, 0 = fully occluded). */
export type AOLevel = 0 | 1 | 2 | 3;

/** Samples sky/block light and opacity at world cells (070/071 vertex shading). */
export interface LightSampler {
  /** Whether the world cell lies inside the sampled volume. */
  inBounds(x: number, y: number, z: number): boolean;
  /** Whether the world cell is opaque (contributes 0 to corner averages; occludes AO). */
  isOpaque(x: number, y: number, z: number): boolean;
  getSkyLight(x: number, y: number, z: number): number;
  getBlockLight(x: number, y: number, z: number): number;
}

/** One merged opaque face rectangle (block-unit coordinates; `x/y/z` is the min corner). */
export interface OpaqueFaceQuad {
  face: ModelFace;
  x: number;
  y: number;
  z: number;
  /** Extent along the first in-plane axis. */
  width: number;
  /** Extent along the second in-plane axis. */
  height: number;
  blockId: number;
  /** Per-corner light, order `(minU,minV), (maxU,minV), (minU,maxV), (maxU,maxV)` (070). */
  vertexLights: [VertexLight, VertexLight, VertexLight, VertexLight];
  /** Per-corner ambient occlusion, same corner order as `vertexLights` (071). */
  vertexAO: [AOLevel, AOLevel, AOLevel, AOLevel];
}

/** Samples the block id at a world cell; `null` = not opaque/absent. */
export type FaceCellSampler = (x: number, y: number, z: number) => number | null;

/** Whether a block id is opaque. */
export type OpaquePredicate = (id: number) => boolean;

/** Merge-compatibility key derived from `(blockId, face)`. */
export type FaceKeyFn = (id: number, face: ModelFace) => string;

const SECTION = 16;

interface FacePlane {
  face: ModelFace;
  /** Axis of the plane (0=x, 1=y, 2=z). */
  axis: 0 | 1 | 2;
  /** Slice count along the axis. */
  slices: number;
  /** Plane offset in block units: slice + offset. */
  offset: number;
}

const PLANES: readonly FacePlane[] = [
  { face: 'down', axis: 1, slices: SECTION, offset: 0 },
  { face: 'up', axis: 1, slices: SECTION, offset: 1 },
  { face: 'north', axis: 2, slices: SECTION, offset: 0 },
  { face: 'south', axis: 2, slices: SECTION, offset: 1 },
  { face: 'east', axis: 0, slices: SECTION, offset: 1 },
  { face: 'west', axis: 0, slices: SECTION, offset: 0 },
];

/** A visibility-grid cell: the id and key of the face to render, or null. */
type VisibleCell = { id: number; key: string } | null;

/**
 * Build the 16×16 visibility grid for one face slice: `grid[u][v]` is the face's id/key when the
 * cell at the slice is opaque and its outward neighbor is not opaque.
 */
function buildVisibilityGrid(
  getCell: FaceCellSampler,
  isOpaque: OpaquePredicate,
  faceKey: FaceKeyFn,
  plane: FacePlane,
  slice: number,
): VisibleCell[][] {
  // Rows are indexed by v, columns by u (grid[v][u]).
  const grid: VisibleCell[][] = [];
  for (let v = 0; v < SECTION; v++) {
    const row: VisibleCell[] = [];
    for (let u = 0; u < SECTION; u++) {
      const cell = planeCell(getCell, plane, slice, u, v);
      if (cell === null || !isOpaque(cell)) {
        row.push(null);
        continue;
      }
      const neighbor = planeNeighbor(getCell, plane, slice, u, v);
      if (neighbor !== null && isOpaque(neighbor)) {
        row.push(null);
        continue;
      }
      row.push({ id: cell, key: faceKey(cell, plane.face) });
    }
    grid.push(row);
  }
  return grid;
}

/** The cell at (slice, u, v) for a plane. */
function planeCell(getCell: FaceCellSampler, plane: FacePlane, slice: number, u: number, v: number): number | null {
  if (plane.axis === 1) {
    return getCell(u, slice, v);
  }
  if (plane.axis === 2) {
    return getCell(u, v, slice);
  }
  return getCell(slice, v, u);
}

/** The cell outside the face (across the plane) at (slice, u, v). */
function planeNeighbor(getCell: FaceCellSampler, plane: FacePlane, slice: number, u: number, v: number): number | null {
  const s = plane.offset === 1 ? slice + 1 : slice - 1;
  if (s < 0 || s >= SECTION) return null; // out of section → exposed
  if (plane.axis === 1) {
    return getCell(u, s, v);
  }
  if (plane.axis === 2) {
    return getCell(u, v, s);
  }
  return getCell(s, v, u);
}

/** The quad's min corner in block units for a merged rectangle. */
function quadPosition(plane: FacePlane, slice: number, u: number, v: number): [number, number, number] {
  const planeCoord = slice + plane.offset;
  if (plane.axis === 1) return [u, planeCoord, v];
  if (plane.axis === 2) return [u, v, planeCoord];
  return [planeCoord, v, u];
}

/** The quad's in-plane (u, v) min corner, in cell/world units. */
function quadInPlaneMin(plane: FacePlane, x: number, y: number, z: number): [number, number] {
  if (plane.axis === 1) return [x, z];
  if (plane.axis === 2) return [x, y];
  return [z, y];
}

/** Light-sampling context for a face of the cell at the quad's min corner. */
function faceLightContext(plane: FacePlane, slice: number, x: number, y: number, z: number): FaceLightContext {
  let cellX = x;
  let cellY = y;
  let cellZ = z;
  if (plane.axis === 0) cellX = slice;
  else if (plane.axis === 1) cellY = slice;
  else cellZ = slice;
  return { axis: plane.axis, isMax: plane.offset === 1, planeCoord: slice + plane.offset, cellX, cellY, cellZ };
}

/** Attach per-corner light and AO to a quad (070/071). */
function withVertexShading(
  light: LightSampler,
  plane: FacePlane,
  slice: number,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
): { vertexLights: OpaqueFaceQuad['vertexLights']; vertexAO: OpaqueFaceQuad['vertexAO'] } {
  const [minU, minV] = quadInPlaneMin(plane, x, y, z);
  const ctx = faceLightContext(plane, slice, x, y, z);
  return {
    vertexLights: quadVertexLights(light, ctx, minU, minV, width, height),
    vertexAO: quadVertexAO(light, ctx, minU, minV, width, height),
  };
}

/**
 * Greedily merge exposed opaque faces into maximal rectangles. Deterministic: faces in fixed order,
 * slices ascending, rectangles expanded row-major. Every quad carries per-corner light (070).
 */
export function greedyMergeOpaqueFaces(
  getCell: FaceCellSampler,
  isOpaque: OpaquePredicate,
  faceKey: FaceKeyFn,
  light: LightSampler,
): OpaqueFaceQuad[] {
  const out: OpaqueFaceQuad[] = [];

  for (const plane of PLANES) {
    for (let slice = 0; slice < plane.slices; slice++) {
      const grid = buildVisibilityGrid(getCell, isOpaque, faceKey, plane, slice);
      const consumed: boolean[][] = grid.map((row) => row.map(() => false));

      for (let v = 0; v < SECTION; v++) {
        for (let u = 0; u < SECTION; u++) {
          if (consumed[v]![u] || grid[v]![u] === null) continue;
          const cell = grid[v]![u]!;

          // Extend width along u.
          let width = 1;
          while (
            u + width < SECTION &&
            !consumed[v]![u + width] &&
            grid[v]![u + width] !== null &&
            grid[v]![u + width]!.key === cell.key
          ) {
            width++;
          }

          // Extend height along v while the whole row matches.
          let height = 1;
          outer: while (v + height < SECTION) {
            for (let w = 0; w < width; w++) {
              const next = grid[v + height]![u + w];
              if (consumed[v + height]![u + w] || !next || next.key !== cell.key) {
                break outer;
              }
            }
            height++;
          }

          // Consume the rectangle.
          for (let dv = 0; dv < height; dv++) {
            for (let du = 0; du < width; du++) {
              consumed[v + dv]![u + du] = true;
            }
          }

          const [x, y, z] = quadPosition(plane, slice, u, v);
          out.push({
            face: plane.face,
            x,
            y,
            z,
            width,
            height,
            blockId: cell.id,
            ...withVertexShading(light, plane, slice, x, y, z, width, height),
          });
        }
      }
    }
  }

  return out;
}

/** Enumerate one 1×1 quad per exposed face (no merging) — the naive reference for equivalence. */
export function enumerateOpaqueFacesNaive(
  getCell: FaceCellSampler,
  isOpaque: OpaquePredicate,
  faceKey: FaceKeyFn,
  light: LightSampler,
): OpaqueFaceQuad[] {
  const out: OpaqueFaceQuad[] = [];
  for (const plane of PLANES) {
    for (let slice = 0; slice < plane.slices; slice++) {
      const grid = buildVisibilityGrid(getCell, isOpaque, faceKey, plane, slice);
      for (let v = 0; v < SECTION; v++) {
        for (let u = 0; u < SECTION; u++) {
          const cell = grid[v]![u];
          if (!cell) continue;
          const [x, y, z] = quadPosition(plane, slice, u, v);
          out.push({
            face: plane.face,
            x,
            y,
            z,
            width: 1,
            height: 1,
            blockId: cell.id,
            ...withVertexShading(light, plane, slice, x, y, z, 1, 1),
          });
        }
      }
    }
  }
  return out;
}
