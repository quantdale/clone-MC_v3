import { BlockRegistry } from './BlockRegistry';
import { Chunk } from './Chunk';
import { chunkKey } from './WorldCoordinates';

/**
 * Owns the set of loaded chunks, keyed by their chunk-coordinate triple.
 *
 * Chunk storage is a flat map so lookups are O(1) and unloading is a simple
 * removal. The registry is accepted for interface symmetry with the rest of
 * the world layer; it is not consulted here.
 */
export class ChunkManager {
  private readonly chunks = new Map<string, Chunk>();

  constructor(_registry: BlockRegistry) {
    // Registry is part of the constructor contract but not used by this
    // manager; chunk block data is addressed by the caller.
  }

  /** Look up a loaded chunk by chunk coordinates. Returns undefined if not loaded. */
  getChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cy, cz));
  }

  /** Create (or return the existing) chunk at the given coordinates. */
  createChunk(cx: number, cy: number, cz: number): Chunk {
    const key = chunkKey(cx, cy, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cy, cz);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /** Remove a chunk from the map, freeing its block storage. */
  removeChunk(cx: number, cy: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cy, cz));
  }

  /** Iterate over every loaded chunk. */
  forEachChunk(fn: (chunk: Chunk) => void): void {
    for (const chunk of this.chunks.values()) {
      fn(chunk);
    }
  }

  /** Number of loaded chunks. */
  get size(): number {
    return this.chunks.size;
  }

  /** Drop all chunks. */
  dispose(): void {
    this.chunks.clear();
  }
}