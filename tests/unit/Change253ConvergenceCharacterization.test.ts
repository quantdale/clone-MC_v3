import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../src/config';
import { worldToChunk, CHUNK_DIMENSIONS } from '../../src/world/WorldCoordinates';
import { VerticalWorldAccess } from '../../src/world/VerticalWorldAccess';
import { BlockState, createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { BlockId } from '../../src/world/BlockRegistry';
import { DimensionType, createDefaultDimensionTypeRegistry } from '../../src/data/DimensionType';
import { createResourceId } from '../../src/data/ResourceId';

/**
 * Change-253 characterization: documents the divergence the convergence must close and
 * re-affirms the canonical target contract. These are baseline/characterization assertions,
 * not regression tests of new behavior — they pin the *current* legacy coordinate model
 * (slab height 64, y clamp 0..63) against the *target* Overworld dimension (-64..319).
 *
 * Per agent-prompts PROMPT 01, this covers: negative-coordinate boundaries, lazy canonical
 * reads (no allocation at out-of-range), and the deterministic Overworld boundary matrix.
 */

const registry = createDefaultBlockStateRegistry();
const air = registry.getDefaultState(BlockId.Air);
const stone = registry.getDefaultState(BlockId.Stone);
const dirt = registry.getDefaultState(BlockId.Dirt);

const overworld = new DimensionType({
  id: createResourceId('minecraft', 'overworld'),
  minY: -64,
  height: 384,
  logicalHeight: 384,
  hasSkylight: true,
});

function makeWorld(): VerticalWorldAccess {
  return new VerticalWorldAccess({ dimension: overworld, registry });
}

describe('Change 253 — legacy slab model (current baseline being superseded)', () => {
  it('configures a 16x64x16 legacy slab height', () => {
    expect(CONFIG.chunk.width).toBe(16);
    expect(CONFIG.chunk.height).toBe(64);
    expect(CONFIG.chunk.depth).toBe(16);
  });

  it('routes world Y through the legacy slab height (cy uses chunk.height)', () => {
    // Legacy routing floors by the 64-block slab height, so negative and high Y land in
    // negative/positive slab layers rather than the dimension's section grid.
    expect(worldToChunk(0, -64, 0)).toEqual([0, -1, 0]);
    expect(worldToChunk(0, 0, 0)).toEqual([0, 0, 0]);
    expect(worldToChunk(0, 63, 0)).toEqual([0, 0, 0]);
    expect(worldToChunk(0, 319, 0)).toEqual([0, 4, 0]);
    expect(CHUNK_DIMENSIONS.height).toBe(64);
  });

  it('cannot uniformly address the Overworld vertical range via the legacy slab', () => {
    // Under the legacy model y in [-64,-1] maps to negative slab cy values and y in [64,319]
    // is entirely outside the [0,63] slab the live World actually writes (live setBlock clamps
    // y < 0 || y >= CHUNK_DIMENSIONS.height). This is the split-truth the migration removes.
    expect(worldToChunk(0, -64, 0)[1]).toBeLessThan(0);
    expect(worldToChunk(0, 319, 0)[1]).toBeGreaterThan(0);
  });
});

describe('Change 253 — canonical Overworld target contract', () => {
  it('Overworld dimension derives the full section grid from minY/height', () => {
    expect(overworld.minY).toBe(-64);
    expect(overworld.maxY).toBe(319);
    expect(overworld.minSectionY).toBe(-4);
    expect(overworld.sectionCount).toBe(24);
    expect(overworld.containsY(-64)).toBe(true);
    expect(overworld.containsY(319)).toBe(true);
    expect(overworld.containsY(-65)).toBe(false);
    expect(overworld.containsY(320)).toBe(false);
  });

  it('honors the required boundary matrix without allocating out-of-range', () => {
    const w = makeWorld();
    const matrix: Array<[number, boolean]> = [
      [-65, false],
      [-64, true],
      [-1, true],
      [0, true],
      [15, true],
      [16, true],
      [63, true],
      [64, true],
      [319, true],
      [320, false],
    ];
    for (const [y, inRange] of matrix) {
      // Before any write, every in-range cell is air and no column is materialized.
      expect(w.getBlockState(0, y, 0).id).toBe(air.id);
    }
    expect(w.size).toBe(0);

    // Out-of-range writes are no-ops and allocate nothing.
    w.setBlockState(0, -65, 0, stone);
    w.setBlockState(0, 320, 0, stone);
    expect(w.size).toBe(0);

    // In-range boundary writes round-trip.
    w.setBlockState(0, -64, 0, stone);
    w.setBlockState(0, 319, 0, dirt);
    expect(w.getBlockState(0, -64, 0).id).toBe(stone.id);
    expect(w.getBlockState(0, 319, 0).id).toBe(dirt.id);
    expect(w.size).toBe(1); // one column hosts both extreme sections (lazy, materialized on write)
  });

  it('keeps absent-air reads non-allocating (lazy canonical storage)', () => {
    const w = makeWorld();
    expect(w.size).toBe(0);
    // Reading air at the very center of the world must not materialize a column.
    expect(w.getBlockState(8, 40, 8).id).toBe(air.id);
    expect(w.size).toBe(0);
    // Reading a negative-Y air cell also allocates nothing.
    expect(w.getBlockState(8, -32, 8).id).toBe(air.id);
    expect(w.size).toBe(0);
  });

  it('routes negative X/Z through floor division to the correct column', () => {
    const w = makeWorld();
    w.setBlockState(-1, 0, -1, stone);
    w.setBlockState(-16, 0, -16, dirt);
    expect(w.getBlockState(-1, 0, -1).id).toBe(stone.id);
    expect(w.getBlockState(-16, 0, -16).id).toBe(dirt.id);
    // Negative coordinates land in distinct columns (floor division, not truncation).
    expect(w.getColumn(-1, -1)?.chunkX).toBe(-1);
    expect(w.getColumn(-1, -1)?.chunkZ).toBe(-1);
  });
});
