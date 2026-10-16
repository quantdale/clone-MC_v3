import { describe, it, expect, vi } from 'vitest';
import { ResourceManager } from '../../src/engine/ResourceManager';
import { MemoryResourceLedger, type ResourceCategory } from '../../src/rendering/MemoryResourceBudget';

function fakeDisposable() {
  return { dispose: vi.fn() };
}

function categoryUsage(ledger: MemoryResourceLedger, category: ResourceCategory) {
  return ledger.snapshot()[category]!;
}

describe('ResourceManager (no ledger)', () => {
  it('disposes every tracked resource exactly once and clears the registry', () => {
    const rm = new ResourceManager();
    const a = fakeDisposable();
    const b = fakeDisposable();
    rm.track(a);
    rm.track(b);

    rm.dispose();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).toHaveBeenCalledTimes(1);

    // Registry is cleared: a second dispose must not double-dispose.
    rm.dispose();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).toHaveBeenCalledTimes(1);
  });

  it('a throwing dispose does not prevent later resources from disposing nor corrupt re-dispose', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const rm = new ResourceManager();
      const bad = { dispose: () => { throw new Error('GPU gone'); } };
      const good = fakeDisposable();
      rm.track(bad);
      rm.track(good);

      expect(() => rm.dispose()).not.toThrow();
      expect(good.dispose).toHaveBeenCalledTimes(1);
      // Snapshot-and-clear semantics: a second dispose disposes nothing again.
      rm.dispose();
      expect(good.dispose).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

describe('ResourceManager (ledger-backed)', () => {
  it('charges TrackOptions {category, sourceTag, estimatedBytes} to the ledger on track', () => {
    const ledger = new MemoryResourceLedger();
    const rm = new ResourceManager(ledger);
    rm.track(fakeDisposable(), {
      category: 'geometries',
      sourceTag: 'ChunkMesher',
      estimatedBytes: 1024,
    });

    const usage = categoryUsage(ledger, 'geometries');
    expect(usage.count).toBe(1);
    expect(usage.estimatedBytes).toBe(1024);
  });

  it('dispose reconciles every category back to zero with no accounting drift', () => {
    const ledger = new MemoryResourceLedger();
    const rm = new ResourceManager(ledger);
    rm.track(fakeDisposable(), { category: 'geometries', sourceTag: 'mesher', estimatedBytes: 4096 });
    rm.track(fakeDisposable(), { category: 'textures', sourceTag: 'atlas', estimatedBytes: 65536 });
    rm.track(fakeDisposable(), { category: 'workerBuffers', sourceTag: 'pool', estimatedBytes: 2048 });
    rm.track(fakeDisposable(), { category: 'geometries', sourceTag: 'entities', estimatedBytes: 512 });

    const before = ledger.snapshot();
    expect(before.geometries!.count).toBe(2);
    expect(before.geometries!.estimatedBytes).toBe(4608);
    expect(before.textures!.count).toBe(1);

    rm.dispose();

    for (const category of Object.keys(before) as ResourceCategory[]) {
      expect(ledger.snapshot()[category]!).toEqual({ count: 0, estimatedBytes: 0 });
    }
    expect(ledger.underflowCount).toBe(0); // register/release pairs balanced
  });

  it('resources tracked WITHOUT options stay source-compatible and charge nothing to the ledger', () => {
    const ledger = new MemoryResourceLedger();
    const rm = new ResourceManager(ledger);
    const plain = fakeDisposable();
    rm.track(plain); // legacy call signature, no TrackOptions

    // No category charged.
    expect(ledger.snapshot().geometries!.count).toBe(0);
    // ...and disposal still works through the same path.
    rm.dispose();
    expect(plain.dispose).toHaveBeenCalledTimes(1);
    expect(ledger.underflowCount).toBe(0);
  });

  it('options without a category are legal and skip ledger accounting entirely', () => {
    const ledger = new MemoryResourceLedger();
    const rm = new ResourceManager(ledger);
    rm.track(fakeDisposable(), { sourceTag: 'misc' }); // no category
    rm.track(fakeDisposable(), { estimatedBytes: 10 }); // no category
    const total = Object.values(ledger.snapshot()).reduce((sum, u) => sum + u.count, 0);
    expect(total).toBe(0);
    expect(() => rm.dispose()).not.toThrow();
  });
});
