/**
 * Redstone regression worlds (173): headless canonical circuit fixtures and timing assertions that
 * close the Redstone and automation section (154-172). Each fixture composes the section's pure
 * modules — 158 torch, 159 repeater, 160 comparator, 163/164 pistons, 166 hopper, 167 dropper,
 * 168 dispenser, 169 explosion, 170 TNT, 171 rail, 172 minecart — into a canonical scenario and
 * asserts a tick-exact timeline. No production code is touched; these fixtures are the section's
 * regression contract so later changes (243's redstone-automation-e2e) have a stable baseline.
 */
import { describe, it, expect } from 'vitest';
import { ScheduledTickQueue } from '../../src/simulation/ScheduledTickQueue';
import {
  REPEATER_DELAY_TICKS,
  dueRepeaterOutputs,
  resolveRepeaterOutput,
  scheduleRepeaterOutput,
} from '../../src/simulation/RedstoneRepeater';
import {
  COMPARATOR_UPDATE_DELAY_TICKS,
  dueComparatorUpdates,
  resolveComparatorOutput,
  scheduleComparatorUpdate,
} from '../../src/simulation/RedstoneComparator';
import {
  BURNOUT_TOGGLE_LIMIT,
  TorchBurnoutTracker,
  torchShouldBeLit,
  torchSignalStrength,
} from '../../src/simulation/RedstoneTorch';
import {
  executePistonPush,
  pistonStateProperties,
} from '../../src/simulation/PistonExecution';
import { planPistonPush, type PistonWorld } from '../../src/simulation/PistonMovePlanner';
import { transferOneItem } from '../../src/simulation/HopperTransfer';
import { ejectFromDropper } from '../../src/simulation/DropperEject';
import { dispenseFromDispenser } from '../../src/simulation/DispenserBehavior';
import { primeTnt, tickPrimedTnt, primedTntIsDue, explodePrimedTnt } from '../../src/simulation/TntPriming';
import type { ExplosionWorld } from '../../src/simulation/ExplosionCore';
import {
  railShapeConnections,
} from '../../src/simulation/RailBlockStates';
import {
  MINECART_MAX_SPEED,
  tickMinecart,
  type MinecartWorld,
  type MinecartState,
} from '../../src/simulation/MinecartPhysics';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';

function slot(item: string | null, count = 0, maxStack = 64): MenuSlot {
  return { item, count, maxStack };
}

describe('fixture 1: repeater delay chain (159)', () => {
  it('a two-repeater chain fires at ticks 2 and 4 for a tick-0 input', () => {
    expect(REPEATER_DELAY_TICKS[1]).toBe(2);
    const queue = new ScheduledTickQueue();

    // Input turns on at tick 0 -> repeater 1 output scheduled at tick 2.
    expect(resolveRepeaterOutput(true, false, false)).toBe(true);
    scheduleRepeaterOutput(queue, 1, 0, 0, 1, 0);

    // Nothing due before tick 2.
    expect(dueRepeaterOutputs(queue, 1)).toEqual([]);
    const first = dueRepeaterOutputs(queue, 2);
    expect(first.map((t) => [t.x, t.y, t.z])).toEqual([[1, 0, 0]]);

    // Repeater 1 output is now true -> repeater 2 output scheduled at tick 4.
    scheduleRepeaterOutput(queue, 2, 0, 0, 1, 2);
    const second = dueRepeaterOutputs(queue, 4);
    expect(second.map((t) => [t.x, t.y, t.z])).toEqual([[2, 0, 0]]);
  });
});

describe('fixture 2: comparator modes and delay (160)', () => {
  it('compare vs subtract are tick-0 functions of the two clamped inputs', () => {
    expect(resolveComparatorOutput('compare', 8, 3)).toBe(8);
    expect(resolveComparatorOutput('compare', 3, 8)).toBe(0);
    expect(resolveComparatorOutput('subtract', 8, 3)).toBe(5);
    expect(resolveComparatorOutput('subtract', 3, 8)).toBe(0);
  });

  it('updates are scheduled COMPARATOR_UPDATE_DELAY_TICKS (2) later', () => {
    expect(COMPARATOR_UPDATE_DELAY_TICKS).toBe(2);
    const queue = new ScheduledTickQueue();
    scheduleComparatorUpdate(queue, 5, 0, 0, 0);
    expect(dueComparatorUpdates(queue, 1)).toEqual([]);
    expect(dueComparatorUpdates(queue, 2).map((t) => [t.x, t.y, t.z])).toEqual([[5, 0, 0]]);
  });
});

describe('fixture 3: torch inversion and burnout (158)', () => {
  it('a powered attachment kills the torch; a lit torch emits full signal', () => {
    expect(torchShouldBeLit(true)).toBe(false);
    expect(torchShouldBeLit(false)).toBe(true);
    expect(torchSignalStrength(true)).toBe(15);
    expect(torchSignalStrength(false)).toBe(0);
  });

  it('nine toggles within the window burn the torch out; eight do not', () => {
    expect(BURNOUT_TOGGLE_LIMIT).toBe(8);
    const burned = new TorchBurnoutTracker();
    for (let tick = 0; tick <= 8; tick++) burned.recordToggle(1, tick); // 9 toggles: exceeds the limit
    expect(burned.isBurnedOut(1, 60)).toBe(true);

    const healthy = new TorchBurnoutTracker();
    for (let tick = 0; tick < 8; tick++) healthy.recordToggle(2, tick); // 8: exactly the limit, not exceeded
    expect(healthy.isBurnedOut(2, 60)).toBe(false);
  });
});

describe('fixture 4: piston push chain (163/164)', () => {
  function key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  const chainWorld: PistonWorld = {
    isImmovable: () => false,
    isPushable: (x) => x >= 1 && x <= 3,
    isDestroyedByPush: () => false,
  };

  it('plans a three-block chain farthest-first and executes the move', () => {
    const plan = planPistonPush(chainWorld, 0, 0, 0, 'east');
    expect(plan.canPush).toBe(true);
    expect(plan.blocksToMove).toEqual([
      [3, 0, 0],
      [2, 0, 0],
      [1, 0, 0],
    ]);

    const store = new Map<string, string>();
    store.set(key(1, 0, 0), 'stone');
    store.set(key(2, 0, 0), 'dirt');
    store.set(key(3, 0, 0), 'sand');
    const world = {
      getBlockState(x: number, y: number, z: number): string {
        return store.get(key(x, y, z)) ?? 'air';
      },
      setBlockState(x: number, y: number, z: number, state: string): void {
        store.set(key(x, y, z), state);
      },
      clearBlockState(x: number, y: number, z: number): void {
        store.delete(key(x, y, z));
      },
    };
    executePistonPush(world, plan, 'east');
    expect(store.get(key(4, 0, 0))).toBe('sand');
    expect(store.get(key(3, 0, 0))).toBe('dirt');
    expect(store.get(key(2, 0, 0))).toBe('stone');
    expect(store.has(key(1, 0, 0))).toBe(false);
    expect(pistonStateProperties('east', true)).toEqual({ facing: 'east', extended: true });
  });
});

describe('fixture 5: hopper -> dropper item pipeline (166/167)', () => {
  it('transfers one item at tick 8 and ejects a world drop at tick 16', () => {
    const queue = new ScheduledTickQueue();
    const hopper = { item: 'stone', count: 5, maxStack: 64 };
    const chest = [slot(null), slot(null)];

    // Hopper pull is due at tick 8 (cooldown 8).
    queue.schedule(0, 0, 0, 8);
    expect(queue.tick(7)).toEqual([]);
    queue.tick(8);
    const transfer = transferOneItem([hopper], chest);
    expect(transfer.moved).toBe(true);
    expect(transfer.destination[0]).toEqual({ item: 'stone', count: 1, maxStack: 64 });

    // Dropper drop is due at tick 16; facing no container, it produces a DroppedItem.
    queue.schedule(0, 0, 0, 16);
    expect(queue.tick(15)).toEqual([]);
    queue.tick(16);
    const drop = ejectFromDropper([{ item: 'stone', count: 4, maxStack: 64 }], null, [0, 1, 0]);
    expect(drop.kind).toBe('drop');
    if (drop.kind !== 'drop') throw new Error('expected drop');
    expect(drop.drop).toEqual({ item: 'stone', count: 1, position: [0, 1, 0] });
    expect(drop.source[0]!.count).toBe(3);
  });
});

describe('fixture 6: dispenser plain-item parity with dropper (168)', () => {
  it('a plain item in a dispenser behaves exactly like a dropper push', () => {
    const result = dispenseFromDispenser([slot('stone', 5)], [slot('stone', 10), slot(null)], [9, 9, 9]);
    expect(result.kind).toBe('container');
    if (result.kind !== 'container') throw new Error('expected container');
    expect(result.destination[0]!.count).toBe(11);
    expect(result.source[0]!.count).toBe(4);
  });
});

describe('fixture 7: TNT detonation timeline (169/170)', () => {
  function key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }
  const world: ExplosionWorld<string> = {
    getBlockState(x, y, z) {
      return key(x, y, z) === key(1, 0, 0) ? 'stone' : 'air';
    },
    isAir: (s) => s === 'air',
    isDestroyable: (s) => s !== 'air',
    blastResistance: (s) => (s === 'stone' ? 6 : 0),
    dropFor: (s) => (s === 'stone' ? 'minecraft:cobblestone' : null),
  };

  it('redstone-primed TNT detonates exactly at tick 80 and destroys the stone', () => {
    let primed = primeTnt(0, 0, 0, 'redstone');
    for (let tick = 1; tick <= 79; tick++) {
      primed = tickPrimedTnt(primed, 1);
      expect(primedTntIsDue(primed)).toBe(false);
    }
    expect(primed.fuseTicks).toBe(1);
    primed = tickPrimedTnt(primed, 1);
    expect(primedTntIsDue(primed)).toBe(true);

    const result = explodePrimedTnt(primed, world);
    expect(result.destroyed).toContainEqual([1, 0, 0]);
    expect(result.drops).toContainEqual({ item: 'minecraft:cobblestone', position: [1, 0, 0] });
  });
});

describe('fixture 8: rail traversal and minecart timing (171/172)', () => {
  function key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  it('a straight rail constrains motion to its axis and to max speed', () => {
    const world: MinecartWorld = {
      getRailShapeAt: (x, y, z) => (key(x, y, z) === key(0, 0, 0) ? 'north_south' : null),
      isBlocking: () => false,
    };
    let cart: MinecartState = { x: 0.5, y: 0.5, z: 0.5, vx: 0.4, vy: 0, vz: 0.4 };
    cart = tickMinecart(cart, world);
    expect(cart.vx).toBe(0);
    expect(cart.vz).toBe(MINECART_MAX_SPEED);
    expect(cart.z).toBeCloseTo(0.9, 10);
    expect(railShapeConnections('north_south')).toEqual(['north', 'south']);
  });

  it('a corner turns a north-bound cart onto the east axis', () => {
    const world: MinecartWorld = {
      getRailShapeAt: (x, y, z) => (key(x, y, z) === key(0, 0, 0) ? 'corner_north_east' : null),
      isBlocking: () => false,
    };
    const turned = tickMinecart({ x: 0.5, y: 0.5, z: 0.5, vx: 0, vy: 0, vz: -0.2 }, world);
    expect(turned.vx).toBeCloseTo(0.2, 10);
    expect(turned.vz).toBe(0);
  });
});
