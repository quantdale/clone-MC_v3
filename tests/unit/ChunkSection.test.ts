import { describe, it, expect } from 'vitest';
import { ChunkSection } from '../../src/world/ChunkSection';
import { BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { SECTION_VOLUME } from '../../src/math/SectionCoordinate';

const registry = createDefaultBlockStateRegistry();
const air = registry.getDefaultState(BlockId.Air);
const stone = registry.getDefaultState(BlockId.Stone);
const dirt = registry.getDefaultState(BlockId.Dirt);

describe('ChunkSection', () => {
  it('starts empty and reports air everywhere', () => {
    const s = new ChunkSection(0, registry);
    expect(s.isEmpty()).toBe(true);
    expect(s.getState(0).id).toBe(air.id);
    expect(s.nonAirCount()).toBe(0);
  });

  it('round-trips a single set state by slot and by coordinate', () => {
    const s = new ChunkSection(0, registry);
    s.set(100, stone);
    expect(s.getState(100).id).toBe(stone.id);
    expect(s.getStateId(100)).toBe(stone.id);
    expect(s.isEmpty()).toBe(false);

    s.setAt(3, 7, 11, dirt);
    expect(s.getStateAt(3, 7, 11).id).toBe(dirt.id);
    expect(s.getStateIdAt(3, 7, 11)).toBe(dirt.id);
  });

  it('handles boundary local coordinates (15,15,15)', () => {
    const s = new ChunkSection(0, registry);
    s.setAt(15, 15, 15, stone);
    expect(s.getStateAt(15, 15, 15).id).toBe(stone.id);
  });

  it('fill replaces every slot with one state', () => {
    const s = new ChunkSection(0, registry);
    s.fill(stone);
    expect(s.isEmpty()).toBe(false);
    expect(s.nonAirCount()).toBe(SECTION_VOLUME);
    for (let i = 0; i < SECTION_VOLUME; i++) expect(s.getState(i).id).toBe(stone.id);
  });

  it('counts non-air slots after a partial fill', () => {
    const s = new ChunkSection(0, registry);
    for (let i = 0; i < 50; i++) s.set(i, stone);
    expect(s.nonAirCount()).toBe(50);
  });

  it('serializes and deserializes an identical section', () => {
    const s = new ChunkSection(2, registry);
    s.set(0, stone);
    s.set(1, dirt);
    s.set(200, stone);
    s.set(2047, dirt);
    const data = s.serialize();
    const restored = ChunkSection.deserialize(data, 2, registry);
    expect(restored.index).toBe(2);
    expect(restored.getStateId(0)).toBe(stone.id);
    expect(restored.getStateId(1)).toBe(dirt.id);
    expect(restored.getStateId(200)).toBe(stone.id);
    expect(restored.getStateId(2047)).toBe(dirt.id);
  });

  it('serializes a full section deterministically', () => {
    const s = new ChunkSection(0, registry);
    for (let i = 0; i < SECTION_VOLUME; i++) {
      s.setStateId(i, i % 3 === 0 ? stone.id : i % 3 === 1 ? dirt.id : air.id);
    }
    const restored = ChunkSection.deserialize(s.serialize(), 0, registry);
    for (let i = 0; i < SECTION_VOLUME; i++) expect(restored.getStateId(i)).toBe(s.getStateId(i));
  });
});
