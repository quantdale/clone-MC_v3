import { describe, expect, it } from 'vitest';
import { createResourceId, parseResourceId } from '../../src/data/ResourceId';
import { Registry, RegistryError } from '../../src/data/Registry';

function expectRegistryReason(action: () => unknown, reason: RegistryError['reason']): void {
  try {
    action();
    throw new Error('Expected RegistryError');
  } catch (error) {
    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).reason).toBe(reason);
  }
}

describe('Registry', () => {
  it('behaves as an empty registry before any registration', () => {
    const registry = new Registry<number>();
    expect(registry.size).toBe(0);
    expect(registry.finalized).toBe(false);
    expect(registry.entries()).toEqual([]);
    expect(registry.getOptional(parseResourceId('game:missing'))).toBeUndefined();
    expect(registry.has(parseResourceId('game:missing'))).toBe(false);
    expectRegistryReason(() => registry.get(parseResourceId('game:missing')), 'MISSING_ID');
    expectRegistryReason(() => registry.getRuntimeId(parseResourceId('game:missing')), 'MISSING_ID');
    expectRegistryReason(() => registry.getByRuntimeId(0), 'INVALID_RUNTIME_ID');
  });

  it('assigns dense runtime ids in registration order', () => {
    const registry = new Registry<string>();
    const a = registry.register(parseResourceId('game:a'), 'A');
    const b = registry.register(parseResourceId('game:b'), 'B');

    expect(a.runtimeId).toBe(0);
    expect(b.runtimeId).toBe(1);
    expect(registry.size).toBe(2);
    expect(registry.getByRuntimeId(0)).toBe('A');
    expect(registry.getByRuntimeId(1)).toBe('B');
  });

  it('resolves entries registered with logically equal ResourceId objects', () => {
    const registry = new Registry<number>();
    registry.register(createResourceId('game', 'stone'), 3);

    const lookups = [parseResourceId('game:stone'), createResourceId('game', 'stone')];
    for (const id of lookups) {
      expect(registry.get(id)).toBe(3);
      expect(registry.getRuntimeId(id)).toBe(0);
    }
  });

  it('rejects duplicate registration and preserves original entry and id sequence', () => {
    const registry = new Registry<number>();
    const first = registry.register(parseResourceId('game:a'), 10);

    expectRegistryReason(() => registry.register(parseResourceId('game:a'), 99), 'DUPLICATE_ID');
    expect(registry.size).toBe(1);
    expect(first.value).toBe(10);
    expect(registry.get(first.id)).toBe(10);

    const second = registry.register(parseResourceId('game:b'), 20);
    expect(second.runtimeId).toBe(1);
    expect(registry.getRuntimeId(parseResourceId('game:b'))).toBe(1);
  });

  it('exposes strict and optional missing lookups distinctly', () => {
    const registry = new Registry<number>();
    registry.register(parseResourceId('game:a'), 1);

    expect(registry.getOptional(parseResourceId('game:missing'))).toBeUndefined();
    expectRegistryReason(() => registry.get(parseResourceId('game:missing')), 'MISSING_ID');
  });

  it('round-trips ResourceId to runtime id and back', () => {
    const registry = new Registry<string>();
    registry.register(parseResourceId('game:a'), 'A');
    registry.register(parseResourceId('game:b'), 'B');
    registry.register(parseResourceId('game:c'), 'C');

    for (const [text, expected] of [['game:a', 0], ['game:b', 1], ['game:c', 2]] as const) {
      const id = parseResourceId(text);
      const runtimeId = registry.getRuntimeId(id);
      expect(runtimeId).toBe(expected);
      expect(registry.getEntryByRuntimeId(runtimeId).id).toEqual(id);
    }
  });

  it('rejects invalid runtime ids for strict lookups', () => {
    const registry = new Registry<number>();
    registry.register(parseResourceId('game:a'), 1);
    registry.register(parseResourceId('game:b'), 2);

    for (const bad of [-1, 1.5, NaN, Infinity, 2, 100, 3]) {
      expectRegistryReason(() => registry.getByRuntimeId(bad as number), 'INVALID_RUNTIME_ID');
      expectRegistryReason(() => registry.getEntryByRuntimeId(bad as number), 'INVALID_RUNTIME_ID');
    }
    // -0 is numerically 0 and resolves to the first entry, not an error.
    expect(registry.getByRuntimeId(-0)).toBe(1);
    expect(registry.getByRuntimeId(0)).toBe(1);
  });

  it('iterates entries in deterministic ascending runtime id order', () => {
    const registry = new Registry<string>();
    const texts = ['game:c', 'game:a', 'game:b', 'minecraft:z'];
    for (const text of texts) {
      registry.register(parseResourceId(text), text);
    }

    expect(registry.entries().map((entry) => entry.runtimeId)).toEqual([0, 1, 2, 3]);
    expect(registry.entries().map((entry) => entry.id)).toEqual(texts.map((t) => parseResourceId(t)));
    expect(registry.entries().map((entry) => entry.value)).toEqual(texts);
  });

  it('finalizes once and supports repeated finalize without mutation', () => {
    const registry = new Registry<number>();
    registry.register(parseResourceId('game:a'), 1);
    registry.finalize();
    expect(registry.finalized).toBe(true);

    registry.finalize();
    expect(registry.finalized).toBe(true);
    expect(registry.size).toBe(1);
    expect(registry.get(parseResourceId('game:a'))).toBe(1);
  });

  it('rejects registration after finalize without changing state', () => {
    const registry = new Registry<number>();
    registry.register(parseResourceId('game:a'), 1);
    registry.finalize();

    expectRegistryReason(() => registry.register(parseResourceId('game:b'), 2), 'FINALIZED');
    expect(registry.size).toBe(1);
    expect(registry.has(parseResourceId('game:b'))).toBe(false);
    expect(registry.getOptional(parseResourceId('game:b'))).toBeUndefined();
  });

  it('does not partially mutate after failed operations', () => {
    const registry = new Registry<number>();
    registry.register(parseResourceId('game:a'), 1);

    expectRegistryReason(() => registry.register(parseResourceId('game:a'), 2), 'DUPLICATE_ID');
    expectRegistryReason(() => registry.getByRuntimeId(99), 'INVALID_RUNTIME_ID');
    expectRegistryReason(() => registry.get(parseResourceId('game:ghost')), 'MISSING_ID');

    expect(registry.size).toBe(1);
    expect(registry.getRuntimeId(parseResourceId('game:a'))).toBe(0);
    expect(registry.getEntryByRuntimeId(0).value).toBe(1);
  });

  it('is generic over value type and supports distinct value types', () => {
    interface BlockLike { id: string }
    interface ItemLike { count: number }

    const blocks = new Registry<BlockLike>();
    blocks.register(parseResourceId('game:stone'), { id: 'stone' });
    expect(blocks.get(parseResourceId('game:stone'))).toEqual({ id: 'stone' });

    const items = new Registry<ItemLike>();
    items.register(parseResourceId('game:stick'), { count: 64 });
    expect(items.get(parseResourceId('game:stick'))).toEqual({ count: 64 });
    expect(blocks).not.toBe(items);
  });

  it('immutably freezes each entry', () => {
    const registry = new Registry<number>();
    const entry = registry.register(parseResourceId('game:a'), 1);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(() => {
      (entry as { value: number }).value = 2;
    }).toThrow(TypeError);
  });
});
