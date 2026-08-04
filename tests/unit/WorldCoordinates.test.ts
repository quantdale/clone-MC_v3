import { describe, it, expect } from 'vitest';
import {
  worldToChunk,
  worldToLocal,
  chunkLocalToWorld,
  chunkKey,
  keyToChunk,
  localIndex,
  floorDiv,
  floorMod,
  isLocalInBounds,
  CHUNK_BLOCK_COUNT,
  CHUNK_DIMENSIONS,
} from '../../src/world/WorldCoordinates';
import { CONFIG } from '../../src/config';

const W = CONFIG.chunk.width;
const H = CONFIG.chunk.height;
const D = CONFIG.chunk.depth;

describe('coordinate conversion', () => {
  it('converts positive world coordinates', () => {
    expect(worldToChunk(0, 0, 0)).toEqual([0, 0, 0]);
    expect(worldToChunk(W, H, D)).toEqual([1, 1, 1]);
    expect(worldToLocal(W, H, D)).toEqual([0, 0, 0]);
  });

  it('handles negative coordinates correctly (floor division)', () => {
    // -1 maps to chunk -1 with local W-1 for a W-wide chunk.
    expect(worldToChunk(-1, 0, 0)).toEqual([-1, 0, 0]);
    expect(worldToLocal(-1, 0, 0)).toEqual([W - 1, 0, 0]);
    expect(worldToChunk(-W, 0, 0)).toEqual([-1, 0, 0]);
    expect(worldToLocal(-W, 0, 0)).toEqual([0, 0, 0]);
  });

  it('round-trips any coordinate through chunk+local', () => {
    const samples: Array<[number, number, number]> = [
      [0, 0, 0],
      [5, 3, 7],
      [-1, -1, -1],
      [W + 3, H + 2, D + 1],
      [-W - 2, -H - 1, -D - 3],
    ];
    for (const [x, y, z] of samples) {
      const [cx, cy, cz] = worldToChunk(x, y, z);
      const [lx, ly, lz] = worldToLocal(x, y, z);
      const [rx, ry, rz] = chunkLocalToWorld(cx, cy, cz, lx, ly, lz);
      expect([rx, ry, rz]).toEqual([x, y, z]);
    }
  });

  it('round-trips every coordinate in a grid sweep (incl. negatives)', () => {
    // A dense sweep across negative, zero, and positive worlds catches
    // off-by-one errors in floor division / modulo that hand-picked samples
    // can miss.
    for (let x = -20; x <= 20; x++) {
      for (let y = -4; y <= 36; y++) {
        for (let z = -20; z <= 20; z++) {
          const [cx, cy, cz] = worldToChunk(x, y, z);
          const [lx, ly, lz] = worldToLocal(x, y, z);
          expect(chunkLocalToWorld(cx, cy, cz, lx, ly, lz)).toEqual([x, y, z]);
        }
      }
    }
  });

  it('local coordinates stay in bounds only inside the chunk', () => {
    expect(isLocalInBounds(0, 0, 0)).toBe(true);
    expect(isLocalInBounds(W - 1, H - 1, D - 1)).toBe(true);
    expect(isLocalInBounds(0, 0, D - 1)).toBe(true);
    expect(isLocalInBounds(W, 0, 0)).toBe(false);
    expect(isLocalInBounds(-1, 0, 0)).toBe(false);
    expect(isLocalInBounds(0, H, 0)).toBe(false);
    expect(isLocalInBounds(0, -1, 0)).toBe(false);
    expect(isLocalInBounds(0, 0, D)).toBe(false);
  });

  it('exposes chunk dimensions consistent with CONFIG and a matching block count', () => {
    expect(CHUNK_DIMENSIONS).toEqual({ width: W, height: H, depth: D });
    expect(CHUNK_BLOCK_COUNT).toBe(W * H * D);
  });

  it('floorDiv and floorMod are consistent for negatives', () => {
    expect(floorDiv(-1, 16)).toBe(-1);
    expect(floorMod(-1, 16)).toBe(15);
    expect(floorDiv(-16, 16)).toBe(-1);
    expect(floorMod(-16, 16)).toBe(0);
    expect(floorDiv(17, 16)).toBe(1);
    expect(floorMod(17, 16)).toBe(1);
  });

  it('chunkKey round-trips for negative coordinates', () => {
    const samples: Array<[number, number, number]> = [
      [0, 0, 0],
      [1, 0, -1],
      [-3, 0, 2],
      [-100, 0, 200],
    ];
    for (const [cx, cy, cz] of samples) {
      expect(keyToChunk(chunkKey(cx, cy, cz))).toEqual([cx, cy, cz]);
    }
  });

  it('localIndex indexes x + z*W + y*W*D', () => {
    expect(localIndex(0, 0, 0)).toBe(0);
    expect(localIndex(1, 0, 0)).toBe(1);
    expect(localIndex(0, 0, 1)).toBe(W);
    expect(localIndex(0, 1, 0)).toBe(W * D);
    expect(localIndex(W - 1, H - 1, D - 1)).toBe(W * D * H - 1);
  });
});