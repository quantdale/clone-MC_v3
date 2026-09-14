import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../src/config';
import {
  DAY_TICKS,
  NIGHT_START_TICK,
  NIGHT_END_TICK,
  canSleep,
  canSkipNight,
  createDefaultSleepState,
  enterBed,
  leaveBed,
  serializeSleepState,
  deserializeSleepState,
  spawnPoint,
  isNight,
  type SleepState,
} from '../../src/simulation/SleepFramework';

/**
 * Wiring oracles for the live sleep integration (274): the exact composition
 * `Game.useBedAt` / `respawnPlayer` / the clock seam run over the VERIFIED
 * headless SleepFramework (198). `Game` itself is DOM-bound and has no node
 * harness, so the routing is covered here at the seam (the real 198 + the
 * pinned clock↔tick mapping + the spec scenarios) and in browser E2E (real
 * DOM toasts/HUD, real persistence, real respawn landing).
 *
 * The mapping is pinned by the spec: the live fixed-tick clock (worldSeconds
 * ∈ [0, dayLength)) maps onto the 198 24000-tick day; `skipNight` lands at
 * tick 0 (I-6 deterministic).
 */

const DAY_LENGTH = CONFIG.dayNight.dayLength;

/** The exact 198 day tick the live clock maps to (Game.currentDayTick). */
function tickForSeconds(seconds: number): number {
  return Math.floor((seconds / DAY_LENGTH) * DAY_TICKS) % DAY_TICKS;
}

/** The exact worldSeconds a 198 day tick sets (Game.setDayTick). */
function secondsForTick(tick: number): number {
  return (((tick % DAY_TICKS) + DAY_TICKS) % DAY_TICKS) * (DAY_LENGTH / DAY_TICKS);
}

interface UseOutcome {
  state: SleepState;
  skipped: boolean;
  ok: boolean;
  reason?: string;
}

/**
 * The exact `Game.useBedAt` routing over the real 198 (the live storm input is
 * false — no Game-owned weather this change). Leaving a same bed while
 * sleeping is NOT time-gated (a player can always wake); entering a free bed
 * runs the canSleep gate + occupied rejection. Returns the resulting state,
 * whether the night-skip fired, and the structured result.
 */
function routeUse(sleep: SleepState, tick: number, bed: readonly [number, number, number], occupied: boolean): UseOutcome {
  const s = sleep.spawn;
  const sameBed = s[0] === bed[0] && s[1] === bed[1] && s[2] === bed[2];
  if (sleep.sleeping && sameBed) {
    return { state: leaveBed(sleep), skipped: false, ok: true };
  }
  if (!canSleep(tick, false)) {
    return { state: sleep, skipped: false, ok: false, reason: 'daytime' };
  }
  const result = enterBed(sleep, [...bed], occupied);
  if (!result.ok) {
    return { state: sleep, skipped: false, ok: false, reason: 'occupied' };
  }
  const skipped = canSkipNight(1, 1);
  return { state: result.state, skipped, ok: true };
}

const NIGHT = NIGHT_START_TICK; // inside [12542, 23459]
const DAY = 0; // morning — outside the night window

describe('clock <-> tick mapping (274)', () => {
  it('starts the day at tick 0 (noon, not night)', () => {
    expect(tickForSeconds(0)).toBe(0);
    expect(isNight(tickForSeconds(0))).toBe(false);
  });

  it('maps the night window onto reachable live seconds', () => {
    // The seconds that produce the night-start tick land inside the window.
    const atNightStart = secondsForTick(NIGHT_START_TICK);
    expect(tickForSeconds(atNightStart)).toBeGreaterThanOrEqual(NIGHT_START_TICK);
    expect(tickForSeconds(atNightStart)).toBeLessThanOrEqual(NIGHT_END_TICK);
    expect(canSleep(tickForSeconds(atNightStart), false)).toBe(true);
  });

  it('round-trips ticks through seconds within the floor granularity', () => {
    for (const tick of [0, 1000, NIGHT_START_TICK, 20000, NIGHT_END_TICK, DAY_TICKS - 1]) {
      const back = tickForSeconds(secondsForTick(tick));
      expect(Math.abs(back - tick)).toBeLessThanOrEqual(1);
    }
  });

  it('skipNight lands the clock at tick 0 (I-6 deterministic)', () => {
    const skippedSeconds = secondsForTick(0);
    expect(tickForSeconds(skippedSeconds)).toBe(0);
    expect(isNight(tickForSeconds(skippedSeconds))).toBe(false);
  });
});

describe('useBedAt routing composition (274)', () => {
  it('refuses a daytime use with no mutation (I-4)', () => {
    const start = createDefaultSleepState();
    const out = routeUse(start, DAY, [10, 64, 20], false);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('daytime');
    expect(out.state).toBe(start); // identity — nothing mutated
    expect(out.skipped).toBe(false);
  });

  it('refuses a daytime use even while a spawn is set', () => {
    const start: SleepState = { sleeping: false, spawnSet: true, spawn: [1, 2, 3] };
    const out = routeUse(start, DAY, [1, 2, 3], false);
    expect(out.ok).toBe(false);
    expect(out.state).toBe(start);
    expect(out.skipped).toBe(false);
  });

  it('enters a free bed at night, sets the spawn, and skips (I-6)', () => {
    const out = routeUse(createDefaultSleepState(), NIGHT, [10, 64, 20], false);
    expect(out.ok).toBe(true);
    expect(out.skipped).toBe(true);
    expect(out.state).toEqual({ sleeping: true, spawnSet: true, spawn: [10, 64, 20] });
    expect(spawnPoint(out.state)).toEqual([10, 64, 20]);
  });

  it('rejects an occupied bed at night with no mutation (I-4)', () => {
    const start = createDefaultSleepState();
    const out = routeUse(start, NIGHT, [5, 64, 5], true);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('occupied');
    expect(out.state).toBe(start);
    expect(out.skipped).toBe(false);
  });

  it('leaves the same bed while sleeping, keeping the spawn', () => {
    const sleeping: SleepState = { sleeping: true, spawnSet: true, spawn: [7, 64, 9] };
    const out = routeUse(sleeping, NIGHT, [7, 64, 9], false);
    expect(out.ok).toBe(true);
    expect(out.skipped).toBe(false);
    expect(out.state).toEqual({ sleeping: false, spawnSet: true, spawn: [7, 64, 9] });
    expect(spawnPoint(out.state)).toEqual([7, 64, 9]);
  });

  it('leaving is NOT time-gated: a sleeping player wakes even in daylight (post-skip clock is 0)', () => {
    const sleeping: SleepState = { sleeping: true, spawnSet: true, spawn: [7, 64, 9] };
    // After a night enter the clock skips to 0 (morning) — leaving must still work.
    const out = routeUse(sleeping, DAY, [7, 64, 9], false);
    expect(out.ok).toBe(true);
    expect(out.skipped).toBe(false);
    expect(out.state).toEqual({ sleeping: false, spawnSet: true, spawn: [7, 64, 9] });
  });

  it('a different bed while sleeping in daylight is refused (enter gate), no mutation', () => {
    const sleepingInA: SleepState = { sleeping: true, spawnSet: true, spawn: [1, 64, 1] };
    const out = routeUse(sleepingInA, DAY, [99, 64, 99], false);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('daytime');
    expect(out.state).toBe(sleepingInA);
    expect(out.skipped).toBe(false);
  });

  it('switches to a different bed while sleeping, moving the spawn', () => {
    const sleepingInA: SleepState = { sleeping: true, spawnSet: true, spawn: [1, 64, 1] };
    const out = routeUse(sleepingInA, NIGHT, [99, 64, 99], false);
    expect(out.ok).toBe(true);
    expect(out.state).toEqual({ sleeping: true, spawnSet: true, spawn: [99, 64, 99] });
    expect(spawnPoint(out.state)).toEqual([99, 64, 99]);
  });

  it('treats a second night enter on the same bed as a leave, not an identity re-enter', () => {
    // Game routes same-cell-while-sleeping to leaveBed BEFORE enterBed, so a
    // re-use toggles off (spec "leave keeps spawn"), never a 198 identity no-op.
    const sleeping: SleepState = { sleeping: true, spawnSet: true, spawn: [3, 64, 3] };
    const out = routeUse(sleeping, NIGHT, [3, 64, 3], false);
    expect(out.state.sleeping).toBe(false);
    expect(out.state.spawn).toEqual([3, 64, 3]);
  });
});

describe('night skip (274)', () => {
  it('single player always satisfies canSkipNight(1,1)', () => {
    expect(canSkipNight(1, 1)).toBe(true);
  });

  it('a refused (daytime/occupied) use never skips', () => {
    expect(routeUse(createDefaultSleepState(), DAY, [0, 0, 0], false).skipped).toBe(false);
    expect(routeUse(createDefaultSleepState(), NIGHT, [0, 0, 0], true).skipped).toBe(false);
  });
});

describe('persistence payload + wake-on-boot (274)', () => {
  it('round-trips the exact payload Game persists', () => {
    const state: SleepState = { sleeping: true, spawnSet: true, spawn: [12, 64, -30] };
    const payload = serializeSleepState(state);
    const restored = deserializeSleepState(payload);
    expect(restored).toEqual(state);
  });

  it('applies wake-on-boot: sleeping forced false, spawn kept', () => {
    const persisted = serializeSleepState({ sleeping: true, spawnSet: true, spawn: [12, 64, -30] });
    // GamePersistence.open() rewrites the hydrated state with sleeping false.
    const hydrated: SleepState = {
      sleeping: false,
      spawnSet: persisted.spawnSet,
      spawn: [persisted.spawn[0], persisted.spawn[1], persisted.spawn[2]],
    };
    expect(hydrated).toEqual({ sleeping: false, spawnSet: true, spawn: [12, 64, -30] });
    expect(spawnPoint(hydrated)).toEqual([12, 64, -30]);
  });

  it('rejects corrupt payloads so boot degrades to defaults', () => {
    const bad = [
      { version: 2, sleeping: false, spawnSet: false, spawn: [0, 0, 0] }, // wrong version
      { version: 1, sleeping: 'no', spawnSet: false, spawn: [0, 0, 0] }, // non-boolean
      { version: 1, sleeping: false, spawnSet: false, spawn: [0, 0] }, // short spawn
      { version: 1, sleeping: false, spawnSet: false, spawn: [0, 0, NaN] }, // non-finite
      { version: 1, sleeping: false, spawnSet: false, spawn: [0, 0, 0], extra: 1 }, // unknown key
      'not-an-object',
    ];
    for (const payload of bad) {
      expect(() => deserializeSleepState(payload)).toThrow();
    }
  });
});

describe('bed-aware respawn target (274)', () => {
  it('uses the 198 spawn point when set', () => {
    const sleep: SleepState = { sleeping: false, spawnSet: true, spawn: [40, 64, 40] };
    const worldSpawn: [number, number, number] = [0.5, 65, 0.5];
    const target = spawnPoint(sleep) ?? worldSpawn;
    expect(target).toEqual([40, 64, 40]);
  });

  it('falls back to the world spawn when no spawn is set (I-1)', () => {
    const sleep = createDefaultSleepState();
    const worldSpawn: [number, number, number] = [0.5, 65, 0.5];
    const target = spawnPoint(sleep) ?? worldSpawn;
    expect(target).toEqual([0.5, 65, 0.5]);
  });
});
