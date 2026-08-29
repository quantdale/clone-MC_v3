/**
 * Greedy opaque face meshing (062). Exposed opaque cube faces in a 16³ section are merged into
 * maximal rectangles, merging only cells whose complete merge signature matches. The algorithm scans each
 * face and slice, builds a visibility grid (opaque cell whose outward neighbor is not opaque —
 * out-of-section neighbors count as exposed), and greedily extends rectangles row-major. Output is
 * deterministic. `enumerateOpaqueFacesNaive` emits one quad per exposed face for regression
 * equivalence testing. Since 070 every emitted quad also carries per-corner sky/block light sampled
 * from a caller-supplied `LightSampler` (see VertexLighting), and since 071 per-corner ambient
 * occlusion (see AmbientOcclusion).
 *
 * ## Merge signature (audit 03 "Meshing")
 *
 * Two exposed faces merge only when their complete signature tuples are equal:
 *
 * 1. `baseKey` — the caller's `faceKey(id, face)`, covering block/material id,
 *    texture face/layer and orientation;
 * 2. biome tint class (072);
 * 3. transparency class;
 * 4. animation class.
 *
 * Per-corner light (070) and AO (071) are deliberately NOT merge gates: they
 * vary smoothly across neighboring cells, so gating on per-cell values would
 * fragment surfaces into 1×1 quads. Instead every emitted quad samples its own
 * four corners over its full extent (`withVertexShading` at emit time), which
 * reproduces the correct gradient for merged rectangles. Classes 2-4 come from
 * optional caller callbacks and default to the single class `0`.
 */
import type { ModelFace } from '../data/BlockModel';
import type { MeshStreamName } from '../world/MeshingTypes';
import { quadVertexAO } from './AmbientOcclusion';
import { quadVertexLights, type FaceLightContext } from './VertexLighting';

/** Sky/block light at one quad corner (0-15). */
export interface VertexLight {
  sky: number;
  block: number;
}

/** Per-corner ambient occlusion level (Minecraft scale: 3 = unoccluded, 0 = fully occluded). */
export type AOLevel = 0 | 1 | 2 | 3;

/**
 * Optional per-block merge classes beyond the base face key. All three default
 * to `0` (single class) when the caller does not supply a resolver.
 */
export interface MergeClassResolvers {
  /** Biome tint class id (072); faces with different tints never merge. */
  tintClassOf?(id: number): number;
  /** Animation class id (animated-texture group); different groups never merge. */
  animationClassOf?(id: number): number;
  /** Transparency class id; different classes never merge. */
  transparencyClassOf?(id: number): number;
}

/** Optional trailing arguments shared by the greedy/naive builders. */
export interface MergeOptions extends MergeClassResolvers {
  /** Version token stamped on every emitted quad for stale-result rejection. */
  inputVersion?: number;
}

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
  /** Biome tint class id (072); `0` when unclassified. */
  tintClass?: number;
  /** Animation class id; `0` when unclassified. */
  animationClass?: number;
  /** Transparency class id; `0` when unclassified. */
  transparencyClass?: number;
  /** Version token of the build that produced this quad. */
  inputVersion?: number;
  /** Canonical worker render stream; omitted by legacy quad producers. */
  renderStream?: MeshStreamName;
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
 * Build the 16×16 visibility grid for one face slice into a flat 256-element array:
 * `grid[v * 16 + u]` is the face's id/key when the cell at the slice is opaque and
 * its outward neighbor is not opaque.
 */
function fillVisibilityGrid(
  grid: VisibleCell[],
  getCell: FaceCellSampler,
  isOpaque: OpaquePredicate,
  faceKey: FaceKeyFn,
  plane: FacePlane,
  slice: number,
): void {
  let idx = 0;
  for (let v = 0; v < SECTION; v++) {
    for (let u = 0; u < SECTION; u++) {
      const cell = planeCell(getCell, plane, slice, u, v);
      if (cell === null || !isOpaque(cell)) {
        grid[idx++] = null;
        continue;
      }
      const neighbor = planeNeighbor(getCell, plane, slice, u, v);
      if (neighbor !== null && isOpaque(neighbor)) {
        grid[idx++] = null;
        continue;
      }
      grid[idx++] = { id: cell, key: faceKey(cell, plane.face) };
    }
  }
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

/** Pack four AO levels into an 8-bit pattern id. */
export function aoPatternId(ao: readonly AOLevel[]): number {
  return ao[0]! | (ao[1]! << 2) | (ao[2]! << 4) | (ao[3]! << 6);
}

/**
 * The complete merge signature of the visible cell at grid `(v, u)` of a slice:
 * base face key plus the optional merge classes. Light (070) and AO (071) are
 * sampled per emitted quad after merging, not gated per cell (see module doc).
 * Two cells are merge-compatible only when every field matches.
 */
interface MergeSignature {
  baseKey: string;
  tintClass: number;
  animationClass: number;
  transparencyClass: number;
}

/** Per-slice memo of cell signatures, indexed by `v * SECTION + u`. */
class SignatureCache {
  private readonly entries: Array<MergeSignature | null> = new Array(SECTION * SECTION).fill(null);

  constructor(
    private readonly grid: readonly VisibleCell[],
    plane: FacePlane,
    slice: number,
    private readonly resolvers: MergeClassResolvers,
  ) {
    void plane;
    void slice;
  }

  /** Whether a visible (non-null) cell exists at `(v, u)`. */
  has(v: number, u: number): boolean {
    const cell = this.grid[v * SECTION + u];
    return cell !== null && cell !== undefined;
  }

  get(v: number, u: number): MergeSignature {
    const index = v * SECTION + u;
    let entry = this.entries[index];
    if (!entry) {
      const cell = this.grid[index]!;
      entry = {
        baseKey: cell.key,
        tintClass: this.resolvers.tintClassOf ? this.resolvers.tintClassOf(cell.id) : 0,
        animationClass: this.resolvers.animationClassOf ? this.resolvers.animationClassOf(cell.id) : 0,
        transparencyClass: this.resolvers.transparencyClassOf ? this.resolvers.transparencyClassOf(cell.id) : 0,
      };
      this.entries[index] = entry;
    }
    return entry;
  }

  /** Whether the signatures at `(v, u)` and `seed` match on every field. */
  matches(v: number, u: number, seed: MergeSignature): boolean {
    if (!this.has(v, u)) return false;
    const other = this.get(v, u);
    return (
      other.baseKey === seed.baseKey &&
      other.tintClass === seed.tintClass &&
      other.animationClass === seed.animationClass &&
      other.transparencyClass === seed.transparencyClass
    );
  }
}

/**
 * Greedily merge exposed opaque faces into maximal rectangles. Deterministic: faces in fixed order,
 * slices ascending, rectangles expanded row-major. Every quad carries per-corner light (070).
 * Faces merge only when their complete merge signatures match (see the module doc); pass
 * `options` to supply tint/animation/transparency class resolvers and a version token.
 */
export function greedyMergeOpaqueFaces(
  getCell: FaceCellSampler,
  isOpaque: OpaquePredicate,
  faceKey: FaceKeyFn,
  light: LightSampler,
  options?: MergeOptions,
): OpaqueFaceQuad[] {
  const out: OpaqueFaceQuad[] = [];
  const resolvers: MergeClassResolvers = options ?? {};
  const grid: VisibleCell[] = new Array(SECTION * SECTION);
  const consumed = new Uint8Array(SECTION * SECTION);

  for (const plane of PLANES) {
    for (let slice = 0; slice < plane.slices; slice++) {
      fillVisibilityGrid(grid, getCell, isOpaque, faceKey, plane, slice);
      consumed.fill(0);
      const signatures = new SignatureCache(grid, plane, slice, resolvers);

      for (let v = 0; v < SECTION; v++) {
        const vOffset = v * SECTION;
        for (let u = 0; u < SECTION; u++) {
          const idx = vOffset + u;
          if (consumed[idx] === 1 || grid[idx] === null) continue;

          // Extend width along u while the full signature matches the seed.
          const seed = signatures.get(v, u);
          let width = 1;
          while (
            u + width < SECTION &&
            consumed[vOffset + u + width] === 0 &&
            grid[vOffset + u + width] !== null &&
            signatures.matches(v, u + width, seed)
          ) {
            width++;
          }

          // Extend height along v while every row cell matches the seed.
          let height = 1;
          outer: while (v + height < SECTION) {
            const nextRowOffset = (v + height) * SECTION;
            for (let w = 0; w < width; w++) {
              if (consumed[nextRowOffset + u + w] === 1 || !signatures.matches(v + height, u + w, seed)) {
                break outer;
              }
            }
            height++;
          }

          // Consume the rectangle.
          for (let dv = 0; dv < height; dv++) {
            const rOffset = (v + dv) * SECTION + u;
            for (let du = 0; du < width; du++) {
              consumed[rOffset + du] = 1;
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
            blockId: grid[idx]!.id,
            ...withVertexShading(light, plane, slice, x, y, z, width, height),
            tintClass: seed.tintClass,
            animationClass: seed.animationClass,
            transparencyClass: seed.transparencyClass,
            inputVersion: options?.inputVersion,
          });
        }
      }
    }
  }

  return out;
}

/**
 * Enumerate one 1×1 quad per exposed face (no merging) — the naive reference for equivalence.
 * Accepts the same `options` as `greedyMergeOpaqueFaces` so both stamp identical metadata.
 */
export function enumerateOpaqueFacesNaive(
  getCell: FaceCellSampler,
  isOpaque: OpaquePredicate,
  faceKey: FaceKeyFn,
  light: LightSampler,
  options?: MergeOptions,
): OpaqueFaceQuad[] {
  const out: OpaqueFaceQuad[] = [];
  const grid: VisibleCell[] = new Array(SECTION * SECTION);
  for (const plane of PLANES) {
    for (let slice = 0; slice < plane.slices; slice++) {
      fillVisibilityGrid(grid, getCell, isOpaque, faceKey, plane, slice);
      for (let v = 0; v < SECTION; v++) {
        const vOffset = v * SECTION;
        for (let u = 0; u < SECTION; u++) {
          const cell = grid[vOffset + u];
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
            tintClass: options?.tintClassOf ? options.tintClassOf(cell.id) : 0,
            animationClass: options?.animationClassOf ? options.animationClassOf(cell.id) : 0,
            transparencyClass: options?.transparencyClassOf ? options.transparencyClassOf(cell.id) : 0,
            inputVersion: options?.inputVersion,
          });
        }
      }
    }
  }
  return out;
}
