import { describe, it, expect } from 'vitest';
import {
  ChunkStatus,
  chunkStatusOrdinal,
  isChunkStatusAtLeast,
  compareChunkStatus,
  chunkStatusName,
  CHUNK_STATUS_ORDER,
} from '../../src/world/ChunkStatus';
import { ChunkColumn } from '../../src/world/ChunkColumn';
import { BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';

const registry = createDefaultBlockStateRegistry();
const air = registry.getDefaultState(BlockId.Air);

function makeColumn(): ChunkColumn {
  return new ChunkColumn({
    chunkX: 1,
    chunkZ: 1,
    sectionCount: 4,
    registry,
    airId: air.id,
  });
}

describe('ChunkStatus lifecycle', () => {
  it('orders the lifecycle from Empty to Full', () => {
    expect(chunkStatusOrdinal(ChunkStatus.Empty)).toBe(0);
    expect(chunkStatusOrdinal(ChunkStatus.Full)).toBe(CHUNK_STATUS_ORDER.length - 1);
    expect(chunkStatusOrdinal(ChunkStatus.Empty)).toBeLessThan(chunkStatusOrdinal(ChunkStatus.Blocks));
    expect(chunkStatusOrdinal(ChunkStatus.Blocks)).toBeLessThan(chunkStatusOrdinal(ChunkStatus.Full));
  });

  it('names every status uniquely', () => {
    const names = CHUNK_STATUS_ORDER.map((s) => chunkStatusName(s));
    expect(names.every((n) => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(CHUNK_STATUS_ORDER.length);
  });

  it('compares statuses by ordinal', () => {
    expect(isChunkStatusAtLeast(ChunkStatus.Full, ChunkStatus.Blocks)).toBe(true);
    expect(isChunkStatusAtLeast(ChunkStatus.Blocks, ChunkStatus.Full)).toBe(false);
    expect(isChunkStatusAtLeast(ChunkStatus.Blocks, ChunkStatus.Blocks)).toBe(true);
    expect(compareChunkStatus(ChunkStatus.Noise, ChunkStatus.Surface)).toBeLessThan(0);
    expect(compareChunkStatus(ChunkStatus.Surface, ChunkStatus.Noise)).toBeGreaterThan(0);
    expect(compareChunkStatus(ChunkStatus.Noise, ChunkStatus.Noise)).toBe(0);
  });
});

describe('ChunkColumn generation status', () => {
  it('starts Empty', () => {
    expect(makeColumn().getStatus()).toBe(ChunkStatus.Empty);
  });

  it('setStatus assigns exactly', () => {
    const c = makeColumn();
    c.setStatus(ChunkStatus.Blocks);
    expect(c.getStatus()).toBe(ChunkStatus.Blocks);
  });

  it('advanceStatusTo never moves backward', () => {
    const c = makeColumn();
    c.advanceStatusTo(ChunkStatus.Blocks);
    expect(c.getStatus()).toBe(ChunkStatus.Blocks);
    c.advanceStatusTo(ChunkStatus.Noise); // earlier stage -> no-op
    expect(c.getStatus()).toBe(ChunkStatus.Blocks);
    c.advanceStatusTo(ChunkStatus.Full);
    expect(c.getStatus()).toBe(ChunkStatus.Full);
    c.advanceStatusTo(ChunkStatus.Empty); // earlier stage -> no-op
    expect(c.getStatus()).toBe(ChunkStatus.Full);
  });

  it('does not persist status across serialize/deserialize', () => {
    const c = makeColumn();
    c.advanceStatusTo(ChunkStatus.Blocks);
    const restored = ChunkColumn.deserialize(c.serialize(), registry, air.id);
    expect(restored.getStatus()).toBe(ChunkStatus.Empty);
  });
});
