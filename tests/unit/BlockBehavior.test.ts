import { describe, it, expect } from 'vitest';
import {
  BlockBehaviorRegistry,
  DEFAULT_BLOCK_BEHAVIOR,
  type BlockBehaviorContext,
  type BlockWorldAccess,
} from '../../src/simulation/BlockBehavior';

class MockWorld implements BlockWorldAccess {
  calls: Array<[number, number, number, number]> = [];
  getBlockId(): number {
    return 0;
  }
  setBlockId(x: number, y: number, z: number, id: number): void {
    this.calls.push([x, y, z, id]);
  }
}

describe('BlockBehaviorRegistry', () => {
  it('returns the shared default for unregistered keys', () => {
    const registry = new BlockBehaviorRegistry();
    expect(registry.getBehavior('minecraft:air')).toBe(DEFAULT_BLOCK_BEHAVIOR);
    expect(registry.getBehavior('minecraft:air')).toBe(registry.getBehavior('minecraft:stone'));
    expect(registry.hasBehavior('minecraft:air')).toBe(false);
  });

  it('registers and resolves behaviors per key in isolation', () => {
    const registry = new BlockBehaviorRegistry();
    const behaviorA = { onPlaced: () => undefined };
    const behaviorB = { onBroken: () => undefined };
    registry.register('a', behaviorA);
    registry.register('b', behaviorB);

    expect(registry.getBehavior('a')).toBe(behaviorA);
    expect(registry.getBehavior('b')).toBe(behaviorB);
    expect(registry.getBehavior('c')).toBe(DEFAULT_BLOCK_BEHAVIOR);
    expect(registry.hasBehavior('a')).toBe(true);
    expect(registry.hasBehavior('b')).toBe(true);
    expect(registry.hasBehavior('c')).toBe(false);
    expect(registry.size).toBe(2);
  });

  it('rejects empty keys, non-object behaviors, and duplicates', () => {
    const registry = new BlockBehaviorRegistry();
    expect(() => registry.register('', {})).toThrow();
    expect(() => registry.register('x', null as unknown as object)).toThrow();
    registry.register('x', {});
    expect(() => registry.register('x', {})).toThrow(/duplicate/i);
  });

  it('invokes hooks with position, tick, and world access', () => {
    const registry = new BlockBehaviorRegistry();
    const world = new MockWorld();
    let seenTick = -1;

    registry.register('minecraft:test', {
      onRandomTick(ctx: BlockBehaviorContext): void {
        seenTick = ctx.tick;
        ctx.world.setBlockId(ctx.x, ctx.y, ctx.z, 99);
      },
    });

    const behavior = registry.getBehavior('minecraft:test');
    behavior.onRandomTick?.({ x: 1, y: 2, z: 3, tick: 40, world });

    expect(world.calls).toEqual([[1, 2, 3, 99]]);
    expect(seenTick).toBe(40);
  });

  it('clear removes all registrations', () => {
    const registry = new BlockBehaviorRegistry();
    registry.register('a', {});
    registry.register('b', {});
    registry.clear();

    expect(registry.size).toBe(0);
    expect(registry.getBehavior('a')).toBe(DEFAULT_BLOCK_BEHAVIOR);
    expect(registry.getBehavior('b')).toBe(DEFAULT_BLOCK_BEHAVIOR);
  });
});
