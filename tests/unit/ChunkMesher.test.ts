import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ChunkMesher } from '../../src/world/ChunkMesher';
import { Chunk } from '../../src/world/Chunk';
import { BlockId, createDefaultRegistry } from '../../src/world/BlockRegistry';
import { tileUV } from '../../src/rendering/TextureAtlas';
import type { TextureAtlas } from '../../src/rendering/TextureAtlas';

/** Count the triangles in a geometry by dividing its index count by 3. */
function countTriangles(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (!index) {
    throw new Error('Expected an indexed geometry');
  }
  return index.count / 3;
}

/** Fake atlas that just maps tiles to UV rects — no DOM canvas needed. */
const fakeAtlas = { uv: (tile: number) => tileUV(tile) } as unknown as TextureAtlas;

describe('ChunkMesher', () => {
  const registry = createDefaultRegistry();

  it('produces zero faces for a solid stone block fully surrounded by stone', () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.fill(BlockId.Stone);

    // Neighboring chunks are also solid stone, so every face — including the
    // ones on the chunk boundary — is hidden by the adjacent block.
    const stoneNeighbor = () => {
      const neighbor = new Chunk(0, 0, 0);
      neighbor.fill(BlockId.Stone);
      return neighbor;
    };

    const mesher = new ChunkMesher({ registry, atlas: fakeAtlas });
    const result = mesher.mesh(chunk, stoneNeighbor);

    expect(result.opaque).toBeNull();
    expect(result.transparent).toBeNull();
  });

  it('produces exactly 6 faces (24 vertices / 12 triangles) for a lone stone block in air', () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.fill(BlockId.Air);
    chunk.setLocal(8, 32, 8, BlockId.Stone);

    const mesher = new ChunkMesher({ registry, atlas: fakeAtlas });
    const result = mesher.mesh(chunk, () => undefined);

    expect(result.opaque).not.toBeNull();
    expect(result.transparent).toBeNull();

    const geometry = result.opaque!;
    expect(countTriangles(geometry)).toBe(12);
    expect(geometry.attributes.position!.count).toBe(24);
    expect(geometry.attributes.normal!.count).toBe(24);
    expect(geometry.attributes.uv!.count).toBe(24);
  });

  it('produces a transparent geometry for water', () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.fill(BlockId.Air);
    chunk.setLocal(8, 32, 8, BlockId.Water);

    const mesher = new ChunkMesher({ registry, atlas: fakeAtlas });
    const result = mesher.mesh(chunk, () => undefined);

    expect(result.opaque).toBeNull();
    expect(result.transparent).not.toBeNull();
    expect(countTriangles(result.transparent!)).toBe(12);
  });

  it('culls a face against a solid block in a neighboring chunk via getNeighbor', () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.fill(BlockId.Air);
    chunk.setLocal(15, 32, 8, BlockId.Stone);

    const neighbor = new Chunk(1, 0, 0);
    neighbor.fill(BlockId.Air);
    neighbor.setLocal(0, 32, 8, BlockId.Stone);

    const mesher = new ChunkMesher({ registry, atlas: fakeAtlas });
    const result = mesher.mesh(chunk, (cx, cy, cz) => (cx === 1 && cy === 0 && cz === 0 ? neighbor : undefined));

    // The +X face is hidden by the neighbor chunk's stone; the other 5 faces
    // remain (5 faces × 2 triangles = 10 triangles).
    expect(result.opaque).not.toBeNull();
    expect(countTriangles(result.opaque!)).toBe(10);
    expect(result.transparent).toBeNull();
  });

  it('keeps water faces visible against leaves (solid but not opaque)', () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.fill(BlockId.Air);
    chunk.setLocal(8, 32, 8, BlockId.Water);
    chunk.setLocal(8, 33, 8, BlockId.Leaves);

    const mesher = new ChunkMesher({ registry, atlas: fakeAtlas });
    const result = mesher.mesh(chunk, () => undefined);

    // Water's top face against leaves is emitted; the 4 side faces against air
    // are emitted; the bottom face against air is emitted too.
    expect(result.transparent).not.toBeNull();
    expect(countTriangles(result.transparent!)).toBe(12);
  });

  it('culls the shared face between two adjacent water blocks', () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.fill(BlockId.Air);
    chunk.setLocal(8, 32, 8, BlockId.Water);
    chunk.setLocal(9, 32, 8, BlockId.Water);

    const mesher = new ChunkMesher({ registry, atlas: fakeAtlas });
    const result = mesher.mesh(chunk, () => undefined);

    // 2 blocks × 6 faces − the shared face hidden on both sides = 10 faces,
    // i.e. 20 triangles. Water siding against water must not render an inner
    // wall between them.
    expect(result.opaque).toBeNull();
    expect(result.transparent).not.toBeNull();
    expect(countTriangles(result.transparent!)).toBe(20);
  });

  it('maps per-face UV tiles for grass (top/side/bottom)', () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.fill(BlockId.Air);
    chunk.setLocal(8, 32, 8, BlockId.Grass);

    const mesher = new ChunkMesher({ registry, atlas: fakeAtlas });
    const result = mesher.mesh(chunk, () => undefined);

    const geometry = result.opaque!;
    const normals = geometry.attributes.normal!.array as Float32Array;
    const uvs = geometry.attributes.uv!.array as Float32Array;
    const vertexCount = geometry.attributes.position!.count;

    // Atlas tile columns (tileUV uses col = tile % 16): grassTop=1 (u in
    // [1/16, 2/16]), dirt=2 (u in [2/16, 3/16]), grassSide=3 (u in
    // [3/16, 4/16]).
    const topU1 = 1 / 16;
    const topU2 = 2 / 16;
    const bottomU1 = 2 / 16;
    const bottomU2 = 3 / 16;
    const sideU1 = 3 / 16;
    const sideU2 = 4 / 16;

    for (let i = 0; i < vertexCount; i++) {
      const nx = normals[i * 3]!;
      const ny = normals[i * 3 + 1]!;
      const nz = normals[i * 3 + 2]!;
      const u = uvs[i * 2]!;
      if (ny === 1 && nx === 0 && nz === 0) {
        // Top face → grassTop tile.
        expect(u === topU1 || u === topU2).toBe(true);
      } else if (ny === -1 && nx === 0 && nz === 0) {
        // Bottom face → dirt tile.
        expect(u === bottomU1 || u === bottomU2).toBe(true);
      } else {
        // Any side face → grassSide tile.
        expect(u === sideU1 || u === sideU2).toBe(true);
      }
    }
  });
});