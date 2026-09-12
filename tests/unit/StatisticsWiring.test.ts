import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  applyStatisticEvent,
  createStatisticStore,
  type StatisticEvent,
} from '../../src/simulation/StatisticsFramework';
import { Player } from '../../src/player/Player';
import { PlayerController } from '../../src/player/PlayerController';
import type { InputState, MouseDelta } from '../../src/engine/InputTypes';
import { createDefaultBossRegistry } from '../../src/simulation/BossFramework';
import { createWither, damageWither, tickWither, WITHER_CHARGE_TICKS } from '../../src/simulation/WitherBoss';

/**
 * Wiring oracles for the statistics panel UI (271): the exact composition
 * `Game.recordStatistic` runs at its event hooks — event→counter mapping,
 * the identity fast path (Game persists/re-renders nothing), flooring, and
 * the wither-defeat exactly-once property the three Game kill sites ride on
 * — plus the `PlayerController` onJump hook at both impulse sites.
 *
 * Game-structural guarantees (save policy, panel re-render, hook placement)
 * are covered here at the seam and in browser E2E (visible bumps, reload):
 * Game itself is DOM-bound and has no node harness.
 */

function witherDef() {
  const reg = createDefaultBossRegistry();
  return reg.getByKey('wither')!;
}

function makeInput(overrides: Partial<InputState> = {}): InputState {
  return {
    moveForward: false,
    moveBack: false,
    moveLeft: false,
    moveRight: false,
    jump: false,
    sprint: false,
    isLocked: () => true,
    consumeMouseDelta(): MouseDelta {
      return { dyaw: 0, dpitch: 0 };
    },
    consumeBreak: () => false,
    isBreakHeld: () => false,
    consumePlace: () => false,
    consumeHotbarDelta: () => 0,
    consumeHotbarIndex: () => -1,
    consumeDebugToggle: () => false,
    consumeCraftingToggle: () => false,
    consumeEat: () => false,
    ...overrides,
  };
}

describe('StatisticsWiring (271)', () => {
  it('maps every gameplay event to its counter', () => {
    let store = createStatisticStore();
    const events: Array<[StatisticEvent, string, number]> = [
      [{ type: 'walk', distance: 3.9 }, 'walk_distance', 3],
      [{ type: 'break_block', blockKey: 'stone' }, 'blocks_broken', 1],
      [{ type: 'kill_mob', mobKey: 'wither' }, 'mob_kills', 1],
      [{ type: 'death' }, 'deaths', 1],
      [{ type: 'damage', amount: 2.7 }, 'damage_taken', 2],
      [{ type: 'jump' }, 'jumps', 1],
      [{ type: 'play_tick' }, 'time_played', 1],
    ];
    for (const [event, key, delta] of events) {
      const before = store[key as keyof typeof store];
      store = applyStatisticEvent(store, event);
      expect(store[key as keyof typeof store]).toBe(before + delta);
    }
  });

  it('identity fast path: no-op events return the identical store (Game saves/renders nothing)', () => {
    const store = createStatisticStore();
    expect(applyStatisticEvent(store, { type: 'walk', distance: 0.4 })).toBe(store);
    expect(applyStatisticEvent(store, { type: 'walk', distance: NaN })).toBe(store);
    expect(applyStatisticEvent(store, { type: 'damage', amount: 0 })).toBe(store);
    expect(applyStatisticEvent(store, { type: 'damage', amount: -2 })).toBe(store);
    expect(applyStatisticEvent(store, { type: 'damage', amount: 0.4 })).toBe(store);
  });

  it('accumulates play ticks one-for-one and floors walk meters', () => {
    let store = createStatisticStore();
    for (let i = 0; i < 40; i++) store = applyStatisticEvent(store, { type: 'play_tick' });
    expect(store.time_played).toBe(40);
    store = applyStatisticEvent(store, { type: 'walk', distance: 12.7 });
    expect(store.walk_distance).toBe(12);
  });

  it('wither defeat reports exactly once (the Game kill-site guard protocol)', () => {
    const def = witherDef();
    // Damage during the spawn charge is refused and never defeats.
    const fresh = createWither(1, 0, 64, 0, def);
    const refused = damageWither(fresh, def, 50, false);
    expect(refused.damageApplied).toBe(0);
    expect(refused.defeated).toBe(false);
    // Tick out the real charge to ACTIVE, then deal lethal damage: defeat
    // reports true exactly once; post-defeat damage stays silent. The three
    // Game reward guards (each `!hasDroppedReward`-checked) therefore claim
    // at most one mob_kills increment per wither.
    let w = createWither(2, 0, 64, 0, def);
    for (let i = 0; i < WITHER_CHARGE_TICKS + 1; i++) w = tickWither(w, def, i).state;
    expect(w.bossState.status).toBe('ACTIVE');
    const lethal = damageWither(w, def, 100000, false);
    expect(lethal.damageApplied).toBeGreaterThan(0);
    expect(lethal.defeated).toBe(true);
    const again = damageWither(lethal.state, def, 100000, false);
    expect(again.defeated).toBe(false);
    expect(again.damageApplied).toBe(0);
  });

  it('kill_mob increments by exactly one per claimed defeat', () => {
    const store = createStatisticStore();
    const next = applyStatisticEvent(store, { type: 'kill_mob', mobKey: 'wither' });
    expect(next.mob_kills).toBe(1);
    expect(next).not.toBe(store);
  });
});

describe('PlayerController onJump hook (271)', () => {
  it('fires once per manual jump impulse and never without one', () => {
    const player = new Player({ position: new THREE.Vector3(0, 0, 0) });
    player.onGround = true;
    let jumps = 0;
    const controller = new PlayerController(player, makeInput({ jump: true }), {
      onJump: () => jumps++,
    });
    controller.update(0.016);
    expect(jumps).toBe(1);
    // Airborne with jump held: no new impulse.
    controller.update(0.016);
    expect(jumps).toBe(1);
  });

  it('never fires when jump is not pressed and tolerates an absent hook', () => {
    const player = new Player({ position: new THREE.Vector3(0, 0, 0) });
    player.onGround = true;
    const silent = new PlayerController(player, makeInput());
    expect(() => silent.update(0.016)).not.toThrow();
    let jumps = 0;
    const controller = new PlayerController(player, makeInput(), { onJump: () => jumps++ });
    controller.update(0.016);
    expect(jumps).toBe(0);
  });

  it('fires the auto-jump impulse exactly once per landing', () => {
    const player = new Player({ position: new THREE.Vector3(0, 0, 0) });
    player.onGround = false;
    let jumps = 0;
    const input = makeInput({ jump: false, wantsAutoJump: () => true });
    const controller = new PlayerController(player, input, { onJump: () => jumps++ });
    controller.update(0.016); // airborne: arms the latch, no impulse
    expect(jumps).toBe(0);
    player.onGround = true;
    controller.update(0.016); // landing: exactly one auto-jump impulse
    expect(jumps).toBe(1);
  });

  it('pins the held-swim-up semantic: each tick impulse counts', () => {
    const player = new Player({ position: new THREE.Vector3(0, 0, 0) });
    player.onGround = false;
    player.inWater = true;
    let jumps = 0;
    const controller = new PlayerController(player, makeInput({ jump: true }), {
      onJump: () => jumps++,
    });
    controller.update(0.016);
    controller.update(0.016);
    controller.update(0.016);
    expect(jumps).toBe(3);
  });
});
