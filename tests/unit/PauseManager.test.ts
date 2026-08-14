import { describe, it, expect } from 'vitest';
import { PauseManager, PAUSE_REASONS } from '../../src/engine/PauseManager';

describe('PauseManager', () => {
  it('pauses and resumes with a single reason', () => {
    const pm = new PauseManager();
    expect(pm.isPaused).toBe(false);

    pm.pause(PAUSE_REASONS.menuOpen);
    expect(pm.isPaused).toBe(true);
    expect(pm.reasons).toEqual(['menu-open']);

    pm.resume(PAUSE_REASONS.menuOpen);
    expect(pm.isPaused).toBe(false);
    expect(pm.reasons).toEqual([]);
  });

  it('stays paused while any reason is active, resuming only when the last clears', () => {
    const pm = new PauseManager();
    pm.pause(PAUSE_REASONS.menuOpen);
    pm.pause(PAUSE_REASONS.pointerLockLost);
    expect(pm.isPaused).toBe(true);
    expect(pm.reasons).toEqual(['menu-open', 'pointer-lock-lost']);

    pm.resume(PAUSE_REASONS.menuOpen);
    expect(pm.isPaused).toBe(true);

    pm.resume(PAUSE_REASONS.pointerLockLost);
    expect(pm.isPaused).toBe(false);
  });

  it('is idempotent and ignores unknown resumes', () => {
    const pm = new PauseManager();
    pm.pause('x');
    pm.pause('x');
    expect(pm.reasons).toEqual(['x']);

    pm.resume('x');
    pm.resume('x');
    pm.resume('never-paused');
    expect(pm.isPaused).toBe(false);
    expect(pm.reasons).toEqual([]);
  });

  it('fires listeners only on transitions and supports unsubscribe', () => {
    const pm = new PauseManager();
    const seen: boolean[] = [];
    const unsubscribe = pm.onChange((paused) => seen.push(paused));

    pm.pause('a');
    pm.pause('b'); // no transition (already paused)
    pm.resume('a'); // still paused
    pm.resume('b'); // transition to unpaused
    expect(seen).toEqual([true, false]);

    unsubscribe();
    pm.pause('c');
    expect(seen).toEqual([true, false]);
  });

  it('resumeAll clears every reason', () => {
    const pm = new PauseManager();
    pm.pause('a');
    pm.pause('b');
    pm.resumeAll();
    expect(pm.isPaused).toBe(false);
    expect(pm.reasons).toEqual([]);
  });

  it('a throwing listener does not break other listeners', () => {
    const pm = new PauseManager();
    const seen: boolean[] = [];
    pm.onChange(() => {
      throw new Error('boom');
    });
    pm.onChange((paused) => seen.push(paused));

    pm.pause('a');
    expect(seen).toEqual([true]);
    pm.resume('a');
    expect(seen).toEqual([true, false]);
  });
});
