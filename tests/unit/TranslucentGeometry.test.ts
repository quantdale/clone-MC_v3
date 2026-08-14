import { describe, it, expect } from 'vitest';
import {
  partitionQuadsByLayer,
  quadCentroid,
  sortTranslucentBackToFront,
  type QuadLayerResolver,
} from '../../src/rendering/TranslucentGeometry';
import type { OpaqueFaceQuad } from '../../src/rendering/GreedyMesher';
import type { RenderLayer } from '../../src/rendering/RenderLayer';

const ZERO_LIGHTS: OpaqueFaceQuad['vertexLights'] = [
  { sky: 0, block: 0 },
  { sky: 0, block: 0 },
  { sky: 0, block: 0 },
  { sky: 0, block: 0 },
];
const ZERO_AO: OpaqueFaceQuad['vertexAO'] = [3, 3, 3, 3];

function quad(id: number, face: OpaqueFaceQuad['face'], x: number, y: number, z: number, width = 1, height = 1): OpaqueFaceQuad {
  return { face, x, y, z, width, height, blockId: id, vertexLights: ZERO_LIGHTS, vertexAO: ZERO_AO };
}

function layersOf(...layerByBlock: Array<[number, RenderLayer]>): QuadLayerResolver {
  const map = new Map(layerByBlock);
  return (blockId) => map.get(blockId) ?? 'opaque';
}

describe('partitionQuadsByLayer', () => {
  it('separates translucent quads from everything else, preserving input order', () => {
    const quads = [
      quad(1, 'up', 0, 1, 0),
      quad(2, 'north', 1, 1, 0),
      quad(3, 'up', 2, 1, 0),
      quad(4, 'east', 3, 1, 0),
      quad(5, 'up', 4, 1, 0),
    ];
    const layerOf = layersOf([2, 'translucent'], [4, 'translucent'], [1, 'emissive'], [3, 'cutout'], [5, 'opaque']);

    const { opaque, translucent } = partitionQuadsByLayer(quads, layerOf);

    expect(translucent.map((q) => q.blockId)).toEqual([2, 4]);
    expect(opaque.map((q) => q.blockId)).toEqual([1, 3, 5]);
  });

  it('returns empty buckets for an empty batch', () => {
    const { opaque, translucent } = partitionQuadsByLayer([], layersOf([1, 'translucent']));
    expect(opaque).toEqual([]);
    expect(translucent).toEqual([]);
  });

  it('does not mutate its input', () => {
    const quads = [quad(1, 'up', 0, 1, 0), quad(2, 'up', 1, 1, 0)];
    const before = [...quads];
    partitionQuadsByLayer(quads, layersOf([2, 'translucent']));
    expect(quads).toEqual(before);
  });
});

describe('quadCentroid', () => {
  it('computes up-face centroids from width/height on x/z', () => {
    expect(quadCentroid(quad(1, 'up', 5, 1, 5, 2, 3))).toEqual([6, 1, 6.5]);
  });

  it('computes north-face centroids from width/height on x/y', () => {
    expect(quadCentroid(quad(1, 'north', 0, 2, 0, 4, 2))).toEqual([2, 3, 0]);
  });

  it('computes east-face centroids from width/height on z/y', () => {
    expect(quadCentroid(quad(1, 'east', 2, 0, 4, 2, 6))).toEqual([2, 3, 5]);
  });

  it('computes down/south/west via the same plane mapping', () => {
    expect(quadCentroid(quad(1, 'down', 1, 3, 1, 2, 2))).toEqual([2, 3, 2]);
    expect(quadCentroid(quad(1, 'south', 0, 0, 2, 2, 2))).toEqual([1, 1, 2]);
    expect(quadCentroid(quad(1, 'west', 4, 2, 2, 2, 2))).toEqual([4, 3, 3]);
  });
});

describe('sortTranslucentBackToFront', () => {
  it('orders far-to-near by centroid distance', () => {
    // Camera at (0, 0, 0); up faces at y=1 with x offsets 3, 8, 5 → distances 3.16, 8.06, 5.10.
    const quads = [
      quad(1, 'up', 3, 1, 0),
      quad(2, 'up', 8, 1, 0),
      quad(3, 'up', 5, 1, 0),
    ];
    expect(sortTranslucentBackToFront(quads, 0, 0, 0).map((q) => q.blockId)).toEqual([2, 3, 1]);
  });

  it('keeps ties in input order (stable)', () => {
    // Centroid distances² from (0,0,0): A (1.5,1,0.5) = 3.5, B (0.5,1,1.5) = 3.5 (tie),
    // C (4.5,1,2.5) = 27.5 → C first, then A before B (input-order tie).
    const quads = [
      quad(1, 'up', 1, 1, 0),
      quad(2, 'up', 0, 1, 1),
      quad(3, 'up', 4, 1, 2),
    ];
    expect(sortTranslucentBackToFront(quads, 0, 0, 0).map((q) => q.blockId)).toEqual([3, 1, 2]);
  });

  it('handles a camera inside the geometry', () => {
    const quads = [
      quad(1, 'up', 5, 1, 5),
      quad(2, 'up', 6, 1, 5),
      quad(3, 'up', 5, 1, 6),
    ];
    // Centroid distances² from (5.5, 0.5, 5.5): q1 0.25, q2 1.25, q3 1.25 → q2 before q3
    // (input-order tie), q1 closest.
    expect(sortTranslucentBackToFront(quads, 5.5, 0.5, 5.5).map((q) => q.blockId)).toEqual([2, 3, 1]);
  });

  it('is deterministic and does not mutate its input', () => {
    const quads = [
      quad(1, 'up', 3, 1, 0),
      quad(2, 'up', 8, 1, 0),
      quad(3, 'up', 5, 1, 0),
    ];
    const before = [...quads];
    const a = sortTranslucentBackToFront(quads, 0, 0, 0);
    const b = sortTranslucentBackToFront(quads, 0, 0, 0);
    expect(a).toEqual(b);
    expect(a).not.toBe(quads);
    expect(quads).toEqual(before);
  });
});
