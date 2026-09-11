/**
 * Atlas grid geometry (260).
 *
 * The single source of truth for the procedural texture atlas dimensions,
 * shared by the main-thread `TextureAtlas` and the worker-side meshing code
 * (`WorkerMeshing.workerTileUv`). This module is intentionally dependency-free
 * (no THREE, no DOM) so the mesh worker bundle stays lean; `TextureAtlas`
 * re-exports these names for backwards compatibility.
 */

/** Pixel edge of one square atlas tile. */
export const TILE_SIZE = 16;
/** Tiles per atlas row. */
export const TILES_PER_ROW = 16;
/** Atlas rows; tile indices 0..(ROWS*16-1) are addressable canvas. */
export const ATLAS_ROWS = 5;
/** Atlas canvas width in pixels. */
export const ATLAS_WIDTH = TILE_SIZE * TILES_PER_ROW; // 256
/** Atlas canvas height in pixels. */
export const ATLAS_HEIGHT = TILE_SIZE * ATLAS_ROWS; // 80
