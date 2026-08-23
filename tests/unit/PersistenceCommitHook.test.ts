import { describe, expect, it } from 'vitest';
import { GamePersistence } from '../../src/storage/GamePersistence';
import { createIdbFactoryMock } from './IdbFactoryMock';
import type { TimerLike } from '../../src/storage/AutosaveCoordinator';

/**
 * Coverage + regression for the coordinator→facade commit hook
 * (hardening 2026-08-23, F-PERS-6): pending overlay copies must be released by
 * the PERIODIC tick path, not only by an explicit facade flush().
 */

/** Manual timer double: tests fire coordinator ticks explicitly. */
function manualTimer(): TimerLike & { fire(): Promise<void> } {
  const callbacks: Array<() => void> = [];
  return {
    setInterval(fn: () => void): unknown {
      callbacks.push(fn);
      return callbacks.length - 1;
    },
    clearInterval(): void {},
    async fire(): Promise<void> {
      for (const fn of [...callbacks]) await fn();
    },
  };
}

describe('GamePersistence periodic-tick pending release', () => {
  it('releases pendingEdits when the coordinator interval commits the unit', async () => {
    const timer = manualTimer();
    const p = new GamePersistence({
      seed: 42,
      factory: createIdbFactoryMock(),
      legacyStorage: null,
      flushTarget: null,
      timer,
      intervalMs: 5,
    });
    await p.open();

    p.captureChunkEdits(
      3,
      0,
      4,
      new Map([
        [1, 2],
        [7, 3],
      ]),
    );
    // Pending copy is synchronously available for eviction re-materialization.
    expect(p.restorePendingChunkEdits(3, 0, 4)).not.toBeNull();
    expect(p.pendingCount).toBe(1);

    // Drive the PERIODIC path (not facade.flush): the same tick() the interval
    // fires, awaited so the IndexedDB mock's async writes settle.
    const coordinator = (p as unknown as { coordinator: { tick(): Promise<number> } }).coordinator;
    const written = await coordinator.tick();
    expect(written).toBe(1);
    expect(p.pendingCount).toBe(0);
    expect(p.restorePendingChunkEdits(3, 0, 4)).toBeNull();
    expect(await p.loadCommittedChunkEdits(3, 0, 4)).toEqual([
      [1, 2],
      [7, 3],
    ]);
    await p.dispose();
  });
});
