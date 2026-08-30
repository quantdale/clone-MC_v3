import { describe, expect, it } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { sampleLodTile, type LodSamplingSource } from '../../src/rendering/LodTile';
import { buildLodTileRenderData, createLodTileRenderResource, LodTileRenderCache } from '../../src/rendering/LodTileRender';
import { LodTileInvalidationCoordinator } from '../../src/rendering/LodTileInvalidation';

const dimensionId = createResourceId('minecraft', 'overworld');
const source: LodSamplingSource = {
  seed: 99,
  generationVersion: 'v2',
  sampleColumn(worldX, worldZ) {
    return {
      height: OVERWORLD_DIMENSION_TYPE.minY + ((worldX * 3 + worldZ * 5 + 512) % 96),
      material: Math.abs(worldX + worldZ) % 16,
      biome: Math.abs(worldX - worldZ) % 4,
    };
  },
};

function identity(lod: 1 | 2 | 3, tileX = 0, tileZ = 0) {
  return {
    dimensionId,
    seed: 99,
    generationVersion: 'v2',
    lod,
    tileX,
    tileZ,
  } as const;
}

function resource(lod: 1 | 2 | 3, tileX = 0, tileZ = 0, onDispose?: () => void) {
  const tile = sampleLodTile(identity(lod, tileX, tileZ), OVERWORLD_DIMENSION_TYPE, source);
  return createLodTileRenderResource(buildLodTileRenderData(tile), onDispose);
}

describe('LodTileInvalidationCoordinator', () => {
  it('invalidates exactly one bounded tile per far tier with floor-safe negative coordinates', () => {
    const coordinator = new LodTileInvalidationCoordinator(new LodTileRenderCache({ maxEntries: 8, maxBytes: 100_000 }));
    const result = coordinator.invalidateEdit({
      dimensionId,
      seed: 99,
      generationVersion: 'v2',
      worldX: -1,
      worldY: 12,
      worldZ: -129,
    });
    expect(result.invalidated).toHaveLength(3);
    expect(result.invalidated.map((token) => [token.identity.lod, token.identity.tileX, token.identity.tileZ])).toEqual([
      [1, -1, -5],
      [2, -1, -3],
      [3, -1, -2],
    ]);
    expect(new Set(result.invalidated.map((token) => token.key)).size).toBe(3);
    expect(coordinator.pendingCount).toBe(3);
    expect(coordinator.invalidatedKeys()).toEqual(result.invalidated.map((token) => token.key).sort());
    for (const token of result.invalidated) {
      expect(coordinator.visibility(token.identity)).toMatchObject({
        visible: false,
        conservative: true,
        invalidated: true,
      });
    }
  });

  it('keeps the old derived resource visible but conservative until a matching rebuild commits', () => {
    const cache = new LodTileRenderCache({ maxEntries: 8, maxBytes: 100_000 });
    const coordinator = new LodTileInvalidationCoordinator(cache);
    const current = resource(2, 0, 0);
    expect(cache.set(current)).toBe(true);

    const result = coordinator.invalidateEdit({
      dimensionId,
      seed: 99,
      generationVersion: 'v2',
      worldX: 1,
      worldY: 12,
      worldZ: 1,
    });
    const token = result.invalidated[1]!;
    expect(coordinator.visibility(token.identity)).toMatchObject({
      visible: true,
      conservative: true,
      invalidated: true,
    });
    expect(coordinator.failRebuild(token)).toBe(true);
    expect(coordinator.visibility(token.identity).invalidated).toBe(true);

    const rebuilt = resource(2, 0, 0);
    expect(coordinator.commitRebuild(token, rebuilt)).toBe(true);
    expect(rebuilt.disposed).toBe(false);
    expect(coordinator.pendingCount).toBe(2);
    expect(coordinator.visibility(token.identity)).toMatchObject({
      visible: true,
      conservative: false,
      invalidated: false,
      revision: 0,
    });
    expect(cache.get(token.key)).toBe(rebuilt);
    expect(current.disposed).toBe(true);
  });

  it('rejects stale rebuilds exactly once without replacing the newer conservative resource', () => {
    const cache = new LodTileRenderCache({ maxEntries: 8, maxBytes: 100_000 });
    const coordinator = new LodTileInvalidationCoordinator(cache);
    const current = resource(1);
    expect(cache.set(current)).toBe(true);
    const first = coordinator.beginRebuild(identity(1));
    const second = coordinator.beginRebuild(identity(1));
    let staleDisposals = 0;
    const stale = resource(1, 0, 0, () => staleDisposals++);
    expect(coordinator.commitRebuild(first, stale)).toBe(false);
    expect(stale.disposed).toBe(true);
    expect(staleDisposals).toBe(1);
    expect(cache.get(first.key)).toBe(current);
    expect(coordinator.visibility(first.identity).conservative).toBe(true);

    const replacement = resource(1);
    expect(coordinator.commitRebuild(second, replacement)).toBe(true);
    expect(cache.get(second.key)).toBe(replacement);
    expect(current.disposed).toBe(true);
  });

  it('retains the old resource when rebuilt data cannot fit and exposes no canonical read path', () => {
    const cache = new LodTileRenderCache({ maxEntries: 1, maxBytes: 30_000 });
    const coordinator = new LodTileInvalidationCoordinator(cache);
    const current = resource(3);
    expect(cache.set(current)).toBe(true);
    const token = coordinator.beginRebuild(identity(3));
    let rejectedDisposals = 0;
    const rejected = {
      key: token.key,
      data: current.data,
      byteLength: 30_001,
      disposed: false,
      dispose(): void {
        if (!this.disposed) {
          this.disposed = true;
          rejectedDisposals++;
        }
      },
    };
    expect(coordinator.commitRebuild(token, rejected)).toBe(false);
    expect(rejected.disposed).toBe(true);
    expect(rejectedDisposals).toBe(1);
    expect(cache.get(token.key)).toBe(current);
    expect(coordinator.visibility(token.identity)).toMatchObject({
      visible: true,
      conservative: true,
      invalidated: true,
    });
  });

  it('rejects malformed canonical edit coordinates before creating invalidation state', () => {
    const coordinator = new LodTileInvalidationCoordinator(new LodTileRenderCache({ maxEntries: 8, maxBytes: 100_000 }));
    expect(() =>
      coordinator.invalidateEdit({
        dimensionId,
        seed: 99,
        generationVersion: 'v2',
        worldX: 1.5,
        worldY: 0,
        worldZ: 0,
      }),
    ).toThrow(/worldX/);
    expect(() =>
      coordinator.invalidateEdit({
        dimensionId,
        seed: 99,
        generationVersion: 'v2',
        worldX: 0,
        worldY: Number.MAX_SAFE_INTEGER + 1,
        worldZ: 0,
      }),
    ).toThrow(/worldY/);
    expect(coordinator.pendingCount).toBe(0);
  });
});
