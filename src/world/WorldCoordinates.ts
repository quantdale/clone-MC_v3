import { CONFIG } from '../config';
import { SECTION_SIZE, sectionIndex, localCoord } from '../math/SectionCoordinate';

/**
 * World ↔ chunk ↔ local coordinate conversion, correct for negative
 * coordinates via floor division.
 *
 * Two vertical systems coexist and MUST NOT be conflated — this file documents
 * both and keeps their math separate:
 *
 * - **Slab / streaming (legacy `Chunk` / `ChunkManager`):** fixed
 *   `16 × 64 × 16` slabs. Y uses `CHUNK_HEIGHT = CONFIG.chunk.height = 64`.
 *   `worldToChunk` / `worldToLocal` / `chunkLocalToWorld` / `localIndex` /
 *   `CHUNK_DIMENSIONS` / `CHUNK_BLOCK_COUNT` all encode this 64-stride. The
 *   streaming window `cy ∈ [minChunkY, minChunkY + chunkLayerCount)` and all
 *   `ChunkManager` keys are slab keys. Width/depth are 16, so X/Z coincide
 *   with the 16-stride section grid, but Y does NOT.
 *
 * - **Canonical storage (`ChunkColumn` / `VerticalWorldAccess` / `ChunkSection`):**
 *   dimension-aware `16³` sections tiled via `DimensionType`. Y uses
 *   `SECTION_SIZE = 16` through `SectionCoordinate` helpers (`sectionIndex`,
 *   `localCoord`, `worldToSection`, `worldToLocal` there). Valid Y is gated by
 *   `dimension.containsY(y)` (Overworld `[-64, 319]`, 24 sections), not by
 *   `0..63` or `CONFIG.chunk.height`. Reads of absent columns are air and do
 *   NOT allocate; writes via `VerticalWorldAccess.ensureColumn` materialize the
 *   target column lazily.
 *
 * `worldToChunk`/`worldToLocal` intentionally stay on the 64 slab stride for
 * legacy slab addressing (streaming, meshing, edit-overlay indexing). Callers
 * that need canonical section/column identity MUST use the 16-stride helpers
 * in `SectionCoordinate` or the re-exported `worldToSection*` helpers below,
 * not `CHUNK_HEIGHT`.
 */

const CHUNK_WIDTH = CONFIG.chunk.width;
const CHUNK_HEIGHT = CONFIG.chunk.height;
const CHUNK_DEPTH = CONFIG.chunk.depth;

/** Legacy slab height (64) — the Y stride of `worldToChunk`/`worldToLocal`. */
export const CHUNK_SLAB_HEIGHT = CHUNK_HEIGHT;
/** Canonical storage section edge (16) — the Y stride of section helpers. */
export const CANONICAL_SECTION_SIZE = SECTION_SIZE;

/** Floor division (handles negative numbers correctly via `Math.floor`). */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Floor modulo (always returns a value in [0, b)). */
export function floorMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/**
 * Convert a world coordinate to its **slab** chunk coordinate.
 *
 * Uses the configured chunk width for X/Z (16) and the **slab height 64**
 * for Y (`floorDiv(y, 64)`). Correct for negative world Y via `Math.floor`.
 * This is the slab/chunk identity used by `ChunkManager` streaming and the
 * edit-overlay keyed by `(cx, cy, cz)`.
 *
 * For canonical 16^3 section/column identity, use `worldToSection` /
 * `sectionIndex` (`floorDiv(y, 16)`) instead.
 */
export function worldToChunk(worldX: number, worldY: number, worldZ: number): [number, number, number] {
  return [floorDiv(worldX, CHUNK_WIDTH), floorDiv(worldY, CHUNK_HEIGHT), floorDiv(worldZ, CHUNK_DEPTH)];
}

/**
 * Convert a world coordinate to its local coordinate within a **slab** chunk.
 *
 * Uses `floorMod(y, 64)` for Y — the offset inside the 64-tall slab.
 * For the offset inside a 16-tall section, use `localCoord(y)` / `worldToSectionLocal`.
 */
export function worldToLocal(worldX: number, worldY: number, worldZ: number): [number, number, number] {
  return [floorMod(worldX, CHUNK_WIDTH), floorMod(worldY, CHUNK_HEIGHT), floorMod(worldZ, CHUNK_DEPTH)];
}

/** Convert chunk + local coordinates back to world coordinates (slab 64 stride for Y). */
export function chunkLocalToWorld(chunkX: number, chunkY: number, chunkZ: number, lx: number, ly: number, lz: number): [number, number, number] {
  return [chunkX * CHUNK_WIDTH + lx, chunkY * CHUNK_HEIGHT + ly, chunkZ * CHUNK_DEPTH + lz];
}

/**
 * Canonical section helpers (16-stride) — thin wrappers over `SectionCoordinate`
 * so callers needing storage identity do not accidentally use the 64 slab stride.
 *
 * X/Z also stride 16, so `worldToSectionX/Z` coincide with `worldToChunk` X/Z,
 * but the name makes the intended storage path explicit. Y diverges (64 vs 16)
 * and MUST use these helpers for storage.
 */

/** World position -> canonical 16^3 section indices (uses `sectionIndex` = `floor(y/16)`). */
export function worldToSection(worldX: number, worldY: number, worldZ: number): [number, number, number] {
  return [sectionIndex(worldX), sectionIndex(worldY), sectionIndex(worldZ)];
}

/** World position -> canonical in-section local coordinates in `[0, 16)` (uses `localCoord`). */
export function worldToSectionLocal(worldX: number, worldY: number, worldZ: number): [number, number, number] {
  return [localCoord(worldX), localCoord(worldY), localCoord(worldZ)];
}

/** Single-axis canonical helpers (16-stride). */
export function worldYToSection(worldY: number): number {
  return sectionIndex(worldY);
}
export function worldYToSectionLocal(worldY: number): number {
  return localCoord(worldY);
}
export function worldXToSection(worldX: number): number {
  return sectionIndex(worldX);
}
export function worldZToSection(worldZ: number): number {
  return sectionIndex(worldZ);
}

/** Compress a chunk coordinate triple into a single string key (slab identity). */
export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

/** Decompress a chunk string key back into a coordinate triple. */
export function keyToChunk(key: string): [number, number, number] {
  const parts = key.split(',');
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

/** Index a local block into a chunk's flat storage array (slab `16x64x16`). */
export function localIndex(lx: number, ly: number, lz: number): number {
  return lx + lz * CHUNK_WIDTH + ly * CHUNK_WIDTH * CHUNK_DEPTH;
}

/**
 * Decode one legacy `WorldEditSnapshot` cell index.
 *
 * This is deliberately named and isolated because the v1 edit payload is a
 * read-old compatibility format with a 64-block vertical stride; canonical
 * column/section access must use the 16-block section helpers instead.
 */
export function decodeLegacySlabIndex(
  index: number,
): { lx: number; ly: number; lz: number } | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= CHUNK_BLOCK_COUNT) {
    return undefined;
  }
  const lx = index % CHUNK_WIDTH;
  const lz = Math.floor(index / CHUNK_WIDTH) % CHUNK_DEPTH;
  const ly = Math.floor(index / (CHUNK_WIDTH * CHUNK_DEPTH));
  return { lx, ly, lz };
}

/** Number of blocks in a chunk slab. */
export const CHUNK_BLOCK_COUNT = CHUNK_WIDTH * CHUNK_HEIGHT * CHUNK_DEPTH;

export const CHUNK_DIMENSIONS = {
  width: CHUNK_WIDTH,
  height: CHUNK_HEIGHT,
  depth: CHUNK_DEPTH,
};

/** Validate that a local coordinate is within chunk bounds (slab 64 for Y). */
export function isLocalInBounds(lx: number, ly: number, lz: number): boolean {
  return lx >= 0 && lx < CHUNK_WIDTH && ly >= 0 && ly < CHUNK_HEIGHT && lz >= 0 && lz < CHUNK_DEPTH;
}
