import { CONFIG } from '../config';

/**
 * World ↔ chunk ↔ local coordinate conversion, correct for negative
 * coordinates via floor division.
 */

const CHUNK_WIDTH = CONFIG.chunk.width;
const CHUNK_HEIGHT = CONFIG.chunk.height;
const CHUNK_DEPTH = CONFIG.chunk.depth;

/** Floor division (handles negative numbers correctly). */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Floor modulo (always returns a value in [0, b)). */
export function floorMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/**
 * Convert a world coordinate to its chunk coordinate, using the configured
 * chunk width for the horizontal (x/z) axes and the chunk height for y.
 */
export function worldToChunk(worldX: number, worldY: number, worldZ: number): [number, number, number] {
  return [floorDiv(worldX, CHUNK_WIDTH), floorDiv(worldY, CHUNK_HEIGHT), floorDiv(worldZ, CHUNK_DEPTH)];
}

/** Convert a world coordinate to its local coordinate within a chunk. */
export function worldToLocal(worldX: number, worldY: number, worldZ: number): [number, number, number] {
  return [floorMod(worldX, CHUNK_WIDTH), floorMod(worldY, CHUNK_HEIGHT), floorMod(worldZ, CHUNK_DEPTH)];
}

/** Convert chunk + local coordinates back to world coordinates. */
export function chunkLocalToWorld(chunkX: number, chunkY: number, chunkZ: number, lx: number, ly: number, lz: number): [number, number, number] {
  return [chunkX * CHUNK_WIDTH + lx, chunkY * CHUNK_HEIGHT + ly, chunkZ * CHUNK_DEPTH + lz];
}

/** Compress a chunk coordinate triple into a single string key. */
export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

/** Decompress a chunk string key back into a coordinate triple. */
export function keyToChunk(key: string): [number, number, number] {
  const parts = key.split(',');
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

/** Index a local block into a chunk's flat storage array. */
export function localIndex(lx: number, ly: number, lz: number): number {
  return lx + lz * CHUNK_WIDTH + ly * CHUNK_WIDTH * CHUNK_DEPTH;
}

/** Number of blocks in a chunk. */
export const CHUNK_BLOCK_COUNT = CHUNK_WIDTH * CHUNK_HEIGHT * CHUNK_DEPTH;

export const CHUNK_DIMENSIONS = {
  width: CHUNK_WIDTH,
  height: CHUNK_HEIGHT,
  depth: CHUNK_DEPTH,
};

/** Validate that a local coordinate is within chunk bounds. */
export function isLocalInBounds(lx: number, ly: number, lz: number): boolean {
  return lx >= 0 && lx < CHUNK_WIDTH && ly >= 0 && ly < CHUNK_HEIGHT && lz >= 0 && lz < CHUNK_DEPTH;
}