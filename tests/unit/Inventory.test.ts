import { describe, it, expect } from 'vitest';
import { Inventory } from '../../src/inventory/Inventory';
import { BlockId } from '../../src/world/BlockRegistry';

describe('inventory hotbar selection', () => {
  it('defaults to the first slot selected', () => {
    const inv = new Inventory();
    expect(inv.selected).toBe(0);
    expect(inv.getSelectedBlockId()).toBe(inv.slots[0]);
  });

  it('selects a slot by index', () => {
    const inv = new Inventory();
    inv.select(5);
    expect(inv.selected).toBe(5);
  });

  it('clamps out-of-range selection', () => {
    const inv = new Inventory();
    inv.select(-3);
    expect(inv.selected).toBe(0);
    inv.select(999);
    expect(inv.selected).toBe(inv.slots.length - 1);
  });

  it('cycles forward with wraparound', () => {
    const inv = new Inventory();
    inv.select(0);
    inv.cycle(1);
    expect(inv.selected).toBe(1);
    // Wrap past the last slot back to the first.
    inv.select(inv.slots.length - 1);
    inv.cycle(1);
    expect(inv.selected).toBe(0);
  });

  it('cycles backward with wraparound', () => {
    const inv = new Inventory();
    inv.select(0);
    inv.cycle(-1);
    expect(inv.selected).toBe(inv.slots.length - 1);
    // Wrap past the first slot back to the last.
    inv.cycle(-1);
    expect(inv.selected).toBe(inv.slots.length - 2);
  });

  it('returns the selected block id', () => {
    const inv = new Inventory([BlockId.Grass, BlockId.Stone, BlockId.Sand]);
    inv.select(1);
    expect(inv.getSelectedBlockId()).toBe(BlockId.Stone);
  });

  it('falls back to default slots when constructed empty', () => {
    const inv = new Inventory([]);
    expect(inv.slots.length).toBeGreaterThan(0);
    inv.select(0);
    expect(inv.getSelectedBlockId()).toBe(inv.slots[0]);
  });

  it('default slots match the documented block order', () => {
    // Grass / Dirt / Stone / Sand / Wood / Leaves / Water / Bedrock / Grass.
    const inv = new Inventory();
    expect(inv.slots).toEqual([1, 2, 3, 4, 7, 8, 5, 6, 1]);
  });

  it('cycles wrap with a delta larger than the slot count', () => {
    const inv = new Inventory();
    inv.select(0);
    inv.cycle(10); // 10 slots forward → wraps to 1 (10 % 9 = 1).
    expect(inv.selected).toBe(1);
    inv.cycle(-10); // back to 0.
    expect(inv.selected).toBe(0);
  });

  it('select truncates fractional indices to the nearest slot', () => {
    const inv = new Inventory();
    inv.select(1.7);
    expect(inv.selected).toBe(1);
    inv.select(-0.5);
    expect(inv.selected).toBe(0);
  });
});