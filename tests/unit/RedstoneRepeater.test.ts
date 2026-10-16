import { describe, expect, it } from 'vitest';
import {
  BlockId,
  REPEATER_SCHEMA,
  createDefaultBlockRegistry,
} from '../../src/world/BlockRegistry';
import {
  ItemId,
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { resourceIdToString } from '../../src/data/ResourceId';
import { MIN_SIGNAL_STRENGTH, MAX_SIGNAL_STRENGTH } from '../../src/simulation/RedstoneSignal';
import { ScheduledTickQueue } from '../../src/simulation/ScheduledTickQueue';
import {
  REPEATER_DELAY_TICKS,
  cycleRepeaterDelay,
  repeaterShouldLock,
  resolveRepeaterOutput,
  repeaterSignalStrength,
  scheduleRepeaterOutput,
  dueRepeaterOutputs,
  repeaterStateProperties,
  type RepeaterDelay,
} from '../../src/simulation/RedstoneRepeater';

describe('repeater registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers the block with REPEATER_SCHEMA and its default', () => {
    const def = blockRegistry.get(BlockId.RedstoneRepeater);
    expect(def.key).toBe('redstone_repeater');
    expect(blockRegistry.getPropertySchema(BlockId.RedstoneRepeater)).toBe(REPEATER_SCHEMA);
    expect(def.defaultState).toEqual({ facing: 'north', delay: 1, locked: false, powered: false });
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.RedstoneRepeater);
    expect(item.key).toBe('redstone_repeater');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:redstone_repeater');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly 64 states including the default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.RedstoneRepeater);
    expect(states.length).toBe(64); // 4 facings x 4 delays x 2 locked x 2 powered

    const defaultState = stateRegistry.getDefaultState(BlockId.RedstoneRepeater);
    expect(states).toContain(defaultState);
    expect(defaultState.getProperty('facing')).toBe('north');
    expect(defaultState.getProperty('delay')).toBe('1');
    expect(defaultState.getProperty('locked')).toBe('false');
    expect(defaultState.getProperty('powered')).toBe('false');
  });
});

describe('REPEATER_DELAY_TICKS', () => {
  it('maps every delay setting to the correct tick cost', () => {
    expect(REPEATER_DELAY_TICKS[1]).toBe(2);
    expect(REPEATER_DELAY_TICKS[2]).toBe(4);
    expect(REPEATER_DELAY_TICKS[3]).toBe(6);
    expect(REPEATER_DELAY_TICKS[4]).toBe(8);
  });
});

describe('cycleRepeaterDelay', () => {
  it('advances 1 through 4 and wraps back to 1', () => {
    let delay: RepeaterDelay = 1;
    const sequence: RepeaterDelay[] = [];
    for (let i = 0; i < 4; i++) {
      delay = cycleRepeaterDelay(delay);
      sequence.push(delay);
    }
    expect(sequence).toEqual([2, 3, 4, 1]);
  });
});

describe('repeaterShouldLock', () => {
  it('locks when the perpendicular neighbour is powered', () => {
    expect(repeaterShouldLock(true)).toBe(true);
  });

  it('does not lock when the perpendicular neighbour is unpowered', () => {
    expect(repeaterShouldLock(false)).toBe(false);
  });
});

describe('resolveRepeaterOutput', () => {
  it('holds the current output when locked, ignoring a changed input', () => {
    expect(resolveRepeaterOutput(false, true, true)).toBe(true);
    expect(resolveRepeaterOutput(true, true, false)).toBe(false);
  });

  it('follows the input when unlocked', () => {
    expect(resolveRepeaterOutput(true, false, false)).toBe(true);
    expect(resolveRepeaterOutput(false, false, true)).toBe(false);
  });
});

describe('repeaterSignalStrength', () => {
  it('emits full signal when powered and nothing when not', () => {
    expect(repeaterSignalStrength(true)).toBe(MAX_SIGNAL_STRENGTH);
    expect(repeaterSignalStrength(false)).toBe(MIN_SIGNAL_STRENGTH);
  });
});

describe('output scheduling', () => {
  const DELAYS: readonly RepeaterDelay[] = [1, 2, 3, 4];

  it('is not due one tick before its own delay cost, for every setting', () => {
    for (const delay of DELAYS) {
      const queue = new ScheduledTickQueue();
      scheduleRepeaterOutput(queue, 1, 2, 3, delay, 0);
      expect(dueRepeaterOutputs(queue, REPEATER_DELAY_TICKS[delay] - 1)).toEqual([]);
    }
  });

  it('fires at its own delay cost, for every setting', () => {
    for (const delay of DELAYS) {
      const queue = new ScheduledTickQueue();
      scheduleRepeaterOutput(queue, 1, 2, 3, delay, 0);
      const due = dueRepeaterOutputs(queue, REPEATER_DELAY_TICKS[delay]);
      expect(due.length).toBe(1);
      expect(due[0]).toMatchObject({ x: 1, y: 2, z: 3 });
    }
  });

  it('orders same-tick outputs deterministically and repeatably', () => {
    function run() {
      const queue = new ScheduledTickQueue();
      scheduleRepeaterOutput(queue, 0, 0, 0, 1, 0);
      scheduleRepeaterOutput(queue, 9, 9, 9, 1, 0);
      return dueRepeaterOutputs(queue, REPEATER_DELAY_TICKS[1]).map((t) => `${t.x},${t.y},${t.z}`);
    }
    const first = run();
    expect(first).toEqual(['0,0,0', '9,9,9']);
    expect(run()).toEqual(first);
  });

  it('treats a non-finite current tick as zero', () => {
    const queue = new ScheduledTickQueue();
    scheduleRepeaterOutput(queue, 0, 0, 0, 1, Number.NaN);
    expect(dueRepeaterOutputs(queue, REPEATER_DELAY_TICKS[1]).length).toBe(1);
  });
});

describe('repeaterStateProperties', () => {
  it('projects the full state, legal for the schema', () => {
    const props = repeaterStateProperties('east', 3, true, false);
    expect(Object.keys(props).sort()).toEqual(['delay', 'facing', 'locked', 'powered']);
    expect(props).toEqual({ facing: 'east', delay: 3, locked: true, powered: false });
    for (const [name, value] of Object.entries(props)) {
      expect(REPEATER_SCHEMA.legalValues(name)).toContain(String(value));
    }
  });
});
