import { describe, it, expect } from 'vitest';
import { DataAccessorRegistry, EntityDataTracker } from '../../src/data/EntityDataTracker';

describe('DataAccessorRegistry', () => {
  it('assigns strictly increasing ids across define calls', () => {
    const registry = new DataAccessorRegistry();
    const health = registry.define<number>('health');
    const isBaby = registry.define<boolean>('isBaby');
    expect(isBaby.id).toBeGreaterThan(health.id);
    expect(registry.has('health')).toBe(true);
    expect(registry.has('isBaby')).toBe(true);
    expect(registry.size).toBe(2);
  });

  it('rejects a duplicate name without consuming an id', () => {
    const registry = new DataAccessorRegistry();
    registry.define<number>('health');
    expect(() => registry.define<number>('health')).toThrow();
    expect(registry.size).toBe(1);
  });

  it('has returns false for an undefined name', () => {
    const registry = new DataAccessorRegistry();
    expect(registry.has('nonexistent')).toBe(false);
  });
});

describe('EntityDataTracker.define', () => {
  it('seeds a value that is readable and not dirty', () => {
    const registry = new DataAccessorRegistry();
    const health = registry.define<number>('health');
    const tracker = new EntityDataTracker();
    tracker.define(health, 20);
    expect(tracker.get(health)).toBe(20);
    expect(tracker.isDirty(health)).toBe(false);
    expect(tracker.has(health)).toBe(true);
  });

  it('rejects redefining the same accessor id without changing the value', () => {
    const registry = new DataAccessorRegistry();
    const health = registry.define<number>('health');
    const tracker = new EntityDataTracker();
    tracker.define(health, 20);
    expect(() => tracker.define(health, 99)).toThrow();
    expect(tracker.get(health)).toBe(20);
  });
});

describe('EntityDataTracker.set', () => {
  it('marks dirty and returns true on an actual change', () => {
    const registry = new DataAccessorRegistry();
    const health = registry.define<number>('health');
    const tracker = new EntityDataTracker();
    tracker.define(health, 20);

    expect(tracker.set(health, 15)).toBe(true);
    expect(tracker.get(health)).toBe(15);
    expect(tracker.isDirty(health)).toBe(true);
  });

  it('does not mark dirty and returns false when the value is Object.is-equal', () => {
    const registry = new DataAccessorRegistry();
    const health = registry.define<number>('health');
    const tracker = new EntityDataTracker();
    tracker.define(health, 20);

    expect(tracker.set(health, 20)).toBe(false);
    expect(tracker.isDirty(health)).toBe(false);
  });

  it('treats NaN as equal to itself (Object.is semantics)', () => {
    const registry = new DataAccessorRegistry();
    const value = registry.define<number>('value');
    const tracker = new EntityDataTracker();
    tracker.define(value, NaN);
    expect(tracker.set(value, NaN)).toBe(false);
  });

  it('throws for an accessor never defined on this tracker', () => {
    const registry = new DataAccessorRegistry();
    const health = registry.define<number>('health');
    const tracker = new EntityDataTracker();
    expect(() => tracker.set(health, 1)).toThrow();
    expect(() => tracker.get(health)).toThrow();
    expect(() => tracker.isDirty(health)).toThrow();
  });
});

describe('EntityDataTracker sync contract (getDirty/getAll/clearDirty)', () => {
  it('getDirty returns only changed entries; getAll returns everything', () => {
    const registry = new DataAccessorRegistry();
    const health = registry.define<number>('health');
    const isBaby = registry.define<boolean>('isBaby');
    const tracker = new EntityDataTracker();
    tracker.define(health, 20);
    tracker.define(isBaby, false);

    tracker.set(health, 15);

    const dirty = tracker.getDirty();
    expect(dirty).toHaveLength(1);
    expect(dirty[0]!.accessor).toBe(health);
    expect(dirty[0]!.value).toBe(15);

    const all = tracker.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.value)).toEqual([15, false]);
  });

  it('clearDirty empties getDirty without altering stored values', () => {
    const registry = new DataAccessorRegistry();
    const health = registry.define<number>('health');
    const tracker = new EntityDataTracker();
    tracker.define(health, 20);
    tracker.set(health, 15);

    tracker.clearDirty();

    expect(tracker.getDirty()).toEqual([]);
    expect(tracker.isDirty(health)).toBe(false);
    expect(tracker.get(health)).toBe(15);
  });

  it('a subsequent set after clearDirty marks dirty again', () => {
    const registry = new DataAccessorRegistry();
    const health = registry.define<number>('health');
    const tracker = new EntityDataTracker();
    tracker.define(health, 20);
    tracker.set(health, 15);
    tracker.clearDirty();

    tracker.set(health, 10);
    expect(tracker.getDirty()).toEqual([{ accessor: health, value: 10 }]);
  });
});
