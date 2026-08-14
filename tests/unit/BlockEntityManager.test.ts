import { describe, it, expect } from 'vitest';
import { BlockEntityInstance, BlockEntityManager } from '../../src/simulation/BlockEntityManager';

describe('BlockEntityInstance', () => {
  it('ticks only when tickable', () => {
    const ticks: number[] = [];
    const instance = new BlockEntityInstance({
      typeKey: 'minecraft:chest',
      x: 1,
      y: 2,
      z: 3,
      onTick: (_self, tick) => ticks.push(tick),
    });

    instance.tick(5); // not tickable yet
    expect(ticks).toEqual([]);

    instance.setTickable(true);
    instance.tick(6);
    expect(ticks).toEqual([6]);
    expect(instance.tickable).toBe(true);
    expect(instance.data).toBeUndefined();
  });
});

describe('BlockEntityManager', () => {
  it('adds, gets, and removes by position; rejects duplicates', () => {
    const manager = new BlockEntityManager();
    const a = new BlockEntityInstance({ typeKey: 'minecraft:chest', x: 1, y: 2, z: 3 });
    const b = new BlockEntityInstance({ typeKey: 'minecraft:furnace', x: 1, y: 2, z: 3 });

    expect(manager.add(a)).toBe(true);
    expect(manager.add(b)).toBe(false); // duplicate position
    expect(manager.get(1, 2, 3)).toBe(a);
    expect(manager.size).toBe(1);

    expect(manager.remove(1, 2, 3)).toBe(true);
    expect(manager.remove(1, 2, 3)).toBe(false);
    expect(manager.get(1, 2, 3)).toBeNull();
    expect(manager.size).toBe(0);
  });

  it('groups instances per chunk and removes whole chunks', () => {
    const manager = new BlockEntityManager();
    manager.add(new BlockEntityInstance({ typeKey: 't', x: 5, y: 0, z: 5 })); // chunk 0,0
    manager.add(new BlockEntityInstance({ typeKey: 't', x: 20, y: 0, z: 20 })); // chunk 1,1

    expect(manager.getForChunk(0, 0)).toHaveLength(1);
    expect(manager.getForChunk(1, 1)).toHaveLength(1);
    expect(manager.removeChunk(0, 0)).toBe(1);
    expect(manager.getForChunk(0, 0)).toHaveLength(0);
    expect(manager.getForChunk(1, 1)).toHaveLength(1);
    expect(manager.size).toBe(1);
  });

  it('ticks tickable instances in insertion order', () => {
    const manager = new BlockEntityManager();
    const order: string[] = [];
    const make = (typeKey: string, x: number) =>
      new BlockEntityInstance({ typeKey, x, y: 0, z: 0, tickable: true, onTick: (self) => order.push(self.typeKey) });

    manager.add(make('a', 1));
    manager.add(make('b', 2));
    manager.add(new BlockEntityInstance({ typeKey: 'c', x: 3, y: 0, z: 0 })); // non-tickable

    expect(manager.tickAll(10)).toBe(2);
    expect(order).toEqual(['a', 'b']);
  });

  it('serializeChunk → deserializeChunk round-trips through the 036 envelope', () => {
    const manager = new BlockEntityManager();
    manager.add(new BlockEntityInstance({ typeKey: 'minecraft:chest', x: 5, y: 1, z: 5, data: { items: [] } }));
    manager.add(new BlockEntityInstance({ typeKey: 'minecraft:furnace', x: 6, y: 1, z: 5 }));

    const payload = manager.serializeChunk(0, 0);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({ schemaVersion: 1, typeKey: 'minecraft:chest', x: 5, y: 1, z: 5 });

    const fresh = new BlockEntityManager();
    expect(fresh.deserializeChunk(0, 0, payload)).toBe(2);
    expect(fresh.getForChunk(0, 0).map((i) => i.typeKey)).toEqual(['minecraft:chest', 'minecraft:furnace']);
    expect(fresh.get(5, 1, 5)?.data).toEqual({ items: [] });
  });

  it('rejects malformed or duplicate payloads without mutating the manager', () => {
    const manager = new BlockEntityManager();
    manager.add(new BlockEntityInstance({ typeKey: 'minecraft:chest', x: 5, y: 1, z: 5 }));

    // Malformed element
    expect(() => manager.deserializeChunk(0, 0, [{ typeKey: 42 } as unknown])).toThrow();
    // Duplicate position (already occupied)
    expect(() =>
      manager.deserializeChunk(0, 0, [
        { schemaVersion: 1, typeKey: 't', x: 5, y: 1, z: 5, data: {} },
      ]),
    ).toThrow(/duplicate/i);

    expect(manager.size).toBe(1);
    expect(manager.get(5, 1, 5)?.typeKey).toBe('minecraft:chest');
  });

  it('exposes size and clear', () => {
    const manager = new BlockEntityManager();
    manager.add(new BlockEntityInstance({ typeKey: 't', x: 1, y: 0, z: 1 }));
    expect(manager.size).toBe(1);
    manager.clear();
    expect(manager.size).toBe(0);
    expect(manager.getForChunk(0, 0)).toHaveLength(0);
  });
});
