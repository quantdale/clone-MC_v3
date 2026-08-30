import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import {
  lodTileKey,
  sampleLodTile,
  type LodSamplingSource,
} from '../../src/rendering/LodTile';
import {
  LOD_RENDER_GRID_SIZE,
  LOD_RENDER_INDEX_COUNT,
  LOD_RENDER_SKIRT_INDEX_COUNT,
  LOD_RENDER_SKIRT_VERTEX_COUNT,
  LOD_RENDER_TOP_INDEX_COUNT,
  LOD_RENDER_TOP_VERTEX_COUNT,
  LOD_RENDER_VERTEX_COUNT,
  buildLodTileRenderData,
  createLodTileRenderResource,
  lodTileBounds,
  lodTileSelectionKey,
  LodTileRenderCache,
  selectLodTiles,
} from '../../src/rendering/LodTileRender';

const dimensionId = createResourceId('minecraft', 'overworld');
const selectionConfig = {
  lod1EnterDistance: 32,
  lod1ExitDistance: 48,
  lod2EnterDistance: 64,
  lod2ExitDistance: 80,
  maxDistance: 160,
  maxTiles: 8,
} as const;

function source(): LodSamplingSource {
  return {
    seed: 7,
    generationVersion: 'v2',
    sampleColumn(worldX, worldZ) {
      return {
        height: OVERWORLD_DIMENSION_TYPE.minY + ((worldX + worldZ + 256) % 80),
        material: Math.abs(worldX + worldZ) % 32,
        biome: Math.abs(worldX - worldZ) % 4,
      };
    },
  };
}

function tile(lod: 1 | 2 | 3, tileX = 0, tileZ = 0) {
  return sampleLodTile(
    {
      dimensionId,
      seed: 7,
      generationVersion: 'v2',
      lod,
      tileX,
      tileZ,
    },
    OVERWORLD_DIMENSION_TYPE,
    source(),
  );
}

describe('LodTileRender contracts', () => {
  it('builds fixed-count seam-safe geometry with skirts on every edge', () => {
    const data = buildLodTileRenderData(tile(2, -1, -2));
    expect(data.key).toBe(lodTileKey(tile(2, -1, -2).identity));
    expect(data.originX).toBe(-64);
    expect(data.originZ).toBe(-128);
    expect(data.worldSpan).toBe(64);
    expect(data.seamSafe).toBe(true);
    expect(data.seamEdges).toEqual(['north', 'east', 'south', 'west']);
    expect(data.seamOverlap).toBe(2);
    expect(data.skirtDepth).toBe(4);
    expect(data.positions.length / 3).toBe(LOD_RENDER_VERTEX_COUNT);
    expect(data.indices.length).toBe(LOD_RENDER_INDEX_COUNT);
    expect(data.indices.length).toBe(LOD_RENDER_TOP_INDEX_COUNT + LOD_RENDER_SKIRT_INDEX_COUNT);
    expect(LOD_RENDER_TOP_VERTEX_COUNT).toBe(289);
    expect(LOD_RENDER_SKIRT_VERTEX_COUNT).toBe(128);
    expect(data.byteLength).toBe(
      data.positions.byteLength + data.indices.byteLength + data.materials.byteLength + (data.biomes?.byteLength ?? 0),
    );

    const westLowerVertex = LOD_RENDER_TOP_VERTEX_COUNT + LOD_RENDER_GRID_SIZE * 2 * 3;
    const westTopX = data.positions[0];
    const westLowerX = data.positions[westLowerVertex * 3];
    expect(westLowerX).toBe(westTopX! - data.seamOverlap);
    expect(data.positions[LOD_RENDER_TOP_VERTEX_COUNT * 3 + 1]).toBeLessThan(data.positions[1]!);
  });

  it('preserves typed payload separation and rejects invalid seam options', () => {
    const lod1 = buildLodTileRenderData(tile(1));
    expect(lod1.biomes).toBeUndefined();
    expect(lod1.materials.length).toBe(256);
    expect(() => buildLodTileRenderData(tile(1), { seamOverlap: 0 })).toThrow(/positive/);
    expect(() => buildLodTileRenderData(tile(1), { skirtDepth: Number.NaN })).toThrow(/finite/);
  });

  it('selects deterministic tiers with hysteresis, negative coordinates, frustum, and capacity bounds', () => {
    const nearIdentity = {
      dimensionId,
      seed: 7,
      generationVersion: 'v2',
      lod: 1,
      tileX: -1,
      tileZ: -1,
    } as const;
    const farIdentity = { ...nearIdentity, tileX: 2, tileZ: 0 };
    const nearSourceKey = lodTileSelectionKey(nearIdentity);
    const near = selectLodTiles(
      [{ identity: nearIdentity }, { identity: farIdentity }, { identity: nearIdentity }],
      { cameraX: -16, cameraZ: -16 },
      { ...selectionConfig, maxTiles: 1 },
      new Map([[nearSourceKey, 3]]),
    );
    expect(near.selected).toHaveLength(1);
    expect(near.selected[0]!.lod).toBe(2);
    expect(near.selected[0]!.tileX).toBe(-1);
    expect(near.selected[0]!.tileZ).toBe(-1);
    expect(near.rejected.some((entry) => entry.reason === 'capacity')).toBe(true);

    const heldNear = selectLodTiles(
      [{ identity: { ...nearIdentity, tileX: 0, tileZ: 0 } }],
      { cameraX: 72, cameraZ: 16 },
      selectionConfig,
      new Map([[lodTileSelectionKey({ ...nearIdentity, tileX: 0, tileZ: 0 }), 1]]),
    );
    expect(heldNear.selected[0]!.lod).toBe(1);

    const frustumRejected = selectLodTiles(
      [{ identity: nearIdentity }],
      { cameraX: -16, cameraZ: -16, frustum: () => false },
      selectionConfig,
    );
    expect(frustumRejected.selected).toHaveLength(0);
    expect(frustumRejected.rejected[0]?.reason).toBe('frustum');
  });

  it('uses half-open adjacent bounds and deterministic selection keys', () => {
    expect(lodTileBounds({ ...tile(1).identity, tileX: -1, tileZ: 0 })).toEqual({
      minX: -32,
      minZ: 0,
      maxX: 0,
      maxZ: 32,
    });
    expect(lodTileBounds({ ...tile(1).identity, tileX: 0, tileZ: 0 }).minX).toBe(0);
    expect(lodTileSelectionKey({ ...tile(1).identity, tileX: -1, tileZ: 0 })).not.toBe(
      lodTileSelectionKey({ ...tile(1).identity, tileX: 0, tileZ: 0 }),
    );
  });

  it('rejects invalid selection/cache configuration and replaces same-key ownership exactly once', () => {
    expect(() => selectLodTiles([], { cameraX: 0, cameraZ: 0 }, { ...selectionConfig, maxTiles: 0 })).toThrow(
      /maxTiles/,
    );
    expect(() =>
      selectLodTiles([], { cameraX: Number.NaN, cameraZ: 0 }, selectionConfig),
    ).toThrow(/cameraX/);
    expect(() =>
      selectLodTiles([], { cameraX: 0, cameraZ: 0 }, { ...selectionConfig, maxDistance: 70 }),
    ).toThrow(/maxDistance/);

    const cache = new LodTileRenderCache({ maxEntries: 1, maxBytes: 30000 });
    const disposed: string[] = [];
    const first = createLodTileRenderResource(buildLodTileRenderData(tile(1)), () => disposed.push('first'));
    const replacement = createLodTileRenderResource(buildLodTileRenderData(tile(1)), () => disposed.push('replacement'));
    expect(cache.set(first)).toBe(true);
    expect(cache.set(replacement)).toBe(true);
    expect(first.disposed).toBe(true);
    expect(disposed).toEqual(['first']);
    cache.clear();
    expect(disposed).toEqual(['first', 'replacement']);
  });

  it('rejects candidates outside max distance without invoking the frustum', () => {
    let frustumCalls = 0;
    const result = selectLodTiles(
      [{ identity: { ...tile(1).identity, tileX: 20, tileZ: 20 } }],
      {
        cameraX: 0,
        cameraZ: 0,
        frustum: () => {
          frustumCalls++;
          return true;
        },
      },
      selectionConfig,
    );
    expect(result.selected).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe('distance');
    expect(frustumCalls).toBe(0);
  });
  it('evicts least-recently-used resources under entry/byte caps and disposes once', () => {
    const cache = new LodTileRenderCache({ maxEntries: 2, maxBytes: 30000 });
    const disposed: string[] = [];
    const first = createLodTileRenderResource(
      buildLodTileRenderData(tile(1, 0, 0)),
      () => disposed.push('first'),
    );
    const second = createLodTileRenderResource(
      buildLodTileRenderData(tile(1, 1, 0)),
      () => disposed.push('second'),
    );
    const third = createLodTileRenderResource(
      buildLodTileRenderData(tile(1, 2, 0)),
      () => disposed.push('third'),
    );
    expect(first.byteLength).toBeGreaterThan(0);
    expect(cache.set(first)).toBe(true);
    expect(cache.set(second)).toBe(true);
    expect(cache.get(first.key)).toBe(first);
    expect(cache.set(third)).toBe(true);
    expect(cache.has(second.key)).toBe(false);
    expect(second.disposed).toBe(true);
    expect(disposed).toEqual(['second']);
    expect(cache.size).toBe(2);
    expect(cache.bytes).toBeLessThanOrEqual(30000);
    cache.delete(first.key);
    cache.delete(first.key);
    expect(disposed).toEqual(['second', 'first']);
    cache.clear();
    cache.clear();
    expect(disposed).toEqual(['second', 'first', 'third']);
    expect(cache.stats()).toMatchObject({ entries: 0, bytes: 0, disposals: 3 });
  });

  it('retains the visible resource when an oversized replacement is rejected', () => {
    const cache = new LodTileRenderCache({ maxEntries: 1, maxBytes: 30000 });
    const current = createLodTileRenderResource(buildLodTileRenderData(tile(1)));
    let rejectedDisposed = 0;
    const oversized = {
      key: current.key,
      data: current.data,
      byteLength: 30001,
      disposed: false,
      dispose(): void {
        if (!this.disposed) {
          this.disposed = true;
          rejectedDisposed++;
        }
      },
    };
    expect(cache.set(current)).toBe(true);
    expect(cache.set(oversized)).toBe(false);
    expect(cache.get(current.key)).toBe(current);
    expect(current.disposed).toBe(false);
    expect(oversized.disposed).toBe(true);
    expect(rejectedDisposed).toBe(1);
  });
  it('rejects an individual resource larger than the byte budget without admission', () => {
    const cache = new LodTileRenderCache({ maxEntries: 1, maxBytes: 1 });
    let disposeCount = 0;
    const resource = createLodTileRenderResource(buildLodTileRenderData(tile(3)), () => disposeCount++);
    expect(cache.set(resource)).toBe(false);
    expect(cache.size).toBe(0);
    expect(resource.disposed).toBe(true);
    expect(disposeCount).toBe(1);
  });
});
