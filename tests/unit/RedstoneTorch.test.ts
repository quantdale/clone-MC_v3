import { describe, expect, it } from 'vitest';
import { BlockId, LIT_SCHEMA, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
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
  TORCH_UPDATE_DELAY_TICKS,
  BURNOUT_TOGGLE_LIMIT,
  BURNOUT_WINDOW_TICKS,
  BURNOUT_RECOVERY_TICKS,
  torchShouldBeLit,
  torchSignalStrength,
  scheduleTorchUpdate,
  dueTorchUpdates,
  TorchBurnoutTracker,
  torchStateProperties,
} from '../../src/simulation/RedstoneTorch';

describe('redstone torch registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers the block with LIT_SCHEMA and an unlit default', () => {
    const def = blockRegistry.get(BlockId.RedstoneTorch);
    expect(def.key).toBe('redstone_torch');
    expect(blockRegistry.getPropertySchema(BlockId.RedstoneTorch)).toBe(LIT_SCHEMA);
    expect(def.defaultState).toEqual({ lit: false });
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.RedstoneTorch);
    expect(item.key).toBe('redstone_torch');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:redstone_torch');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly two states with an unlit default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.RedstoneTorch);
    expect(states.length).toBe(2);
    const defaultState = stateRegistry.getDefaultState(BlockId.RedstoneTorch);
    expect(states).toContain(defaultState);
    expect(defaultState.getProperty('lit')).toBe('false');
  });
});

describe('torch inversion', () => {
  it('lights when its attachment is unpowered', () => {
    expect(torchShouldBeLit(false)).toBe(true);
  });

  it('extinguishes when its attachment is powered', () => {
    expect(torchShouldBeLit(true)).toBe(false);
  });

  it('is a pure inversion with nothing else folded in', () => {
    for (const attachmentPowered of [true, false]) {
      expect(torchShouldBeLit(attachmentPowered)).toBe(!attachmentPowered);
    }
  });
});

describe('torchSignalStrength', () => {
  it('emits full signal when lit and nothing when unlit', () => {
    expect(torchSignalStrength(true)).toBe(MAX_SIGNAL_STRENGTH);
    expect(torchSignalStrength(false)).toBe(MIN_SIGNAL_STRENGTH);
  });
});

describe('torch update scheduling', () => {
  it('is not due before its delay elapses', () => {
    const queue = new ScheduledTickQueue();
    scheduleTorchUpdate(queue, 1, 2, 3, 0);
    expect(dueTorchUpdates(queue, TORCH_UPDATE_DELAY_TICKS - 1)).toEqual([]);
  });

  it('fires at its delay tick', () => {
    const queue = new ScheduledTickQueue();
    scheduleTorchUpdate(queue, 1, 2, 3, 0);
    const due = dueTorchUpdates(queue, TORCH_UPDATE_DELAY_TICKS);
    expect(due.length).toBe(1);
    expect(due[0]).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('orders same-tick updates deterministically and repeatably', () => {
    function run() {
      const queue = new ScheduledTickQueue();
      scheduleTorchUpdate(queue, 0, 0, 0, 0);
      scheduleTorchUpdate(queue, 5, 5, 5, 0);
      return dueTorchUpdates(queue, TORCH_UPDATE_DELAY_TICKS).map((t) => `${t.x},${t.y},${t.z}`);
    }
    const first = run();
    expect(first).toEqual(['0,0,0', '5,5,5']);
    expect(run()).toEqual(first);
  });

  it('treats a non-finite current tick as zero', () => {
    const queue = new ScheduledTickQueue();
    scheduleTorchUpdate(queue, 0, 0, 0, Number.NaN);
    expect(dueTorchUpdates(queue, TORCH_UPDATE_DELAY_TICKS).length).toBe(1);
  });
});

describe('TorchBurnoutTracker', () => {
  const TORCH = 1;

  /** Toggle `count` times on consecutive ticks starting at `start`; returns the last tick used. */
  function toggleConsecutively(tracker: TorchBurnoutTracker, count: number, start = 0): number {
    let tick = start;
    for (let i = 0; i < count; i++) {
      tracker.recordToggle(TORCH, tick);
      tick++;
    }
    return tick - 1;
  }

  it('burns out once toggles exceed the limit', () => {
    const tracker = new TorchBurnoutTracker();
    const last = toggleConsecutively(tracker, BURNOUT_TOGGLE_LIMIT + 1);
    expect(tracker.isBurnedOut(TORCH, last)).toBe(true);
  });

  it('does not burn out at exactly the limit', () => {
    const tracker = new TorchBurnoutTracker();
    const last = toggleConsecutively(tracker, BURNOUT_TOGGLE_LIMIT);
    expect(tracker.isBurnedOut(TORCH, last)).toBe(false);
  });

  it('does not burn out when the same toggles are spread beyond the window', () => {
    const tracker = new TorchBurnoutTracker();
    let tick = 0;
    for (let i = 0; i < BURNOUT_TOGGLE_LIMIT + 1; i++) {
      tracker.recordToggle(TORCH, tick);
      tick += BURNOUT_WINDOW_TICKS + 1;
    }
    expect(tracker.isBurnedOut(TORCH, tick)).toBe(false);
  });

  it('prunes old toggles so the retained count stays bounded', () => {
    const tracker = new TorchBurnoutTracker();
    let tick = 0;
    for (let i = 0; i < 50; i++) {
      tracker.recordToggle(TORCH, tick);
      tick += BURNOUT_WINDOW_TICKS + 1;
    }
    // Only the newest toggle is still inside the window.
    expect(tracker.toggleCount(TORCH, tick - (BURNOUT_WINDOW_TICKS + 1))).toBe(1);
  });

  it('stays burnt out during the recovery period', () => {
    const tracker = new TorchBurnoutTracker();
    const last = toggleConsecutively(tracker, BURNOUT_TOGGLE_LIMIT + 1);
    expect(tracker.isBurnedOut(TORCH, last + BURNOUT_RECOVERY_TICKS - 1)).toBe(true);
  });

  it('recovers after the quiet period', () => {
    const tracker = new TorchBurnoutTracker();
    const last = toggleConsecutively(tracker, BURNOUT_TOGGLE_LIMIT + 1);
    expect(tracker.isBurnedOut(TORCH, last + BURNOUT_RECOVERY_TICKS)).toBe(false);
  });

  it('extends the burnout when toggling continues partway through recovery', () => {
    const tracker = new TorchBurnoutTracker();
    const last = toggleConsecutively(tracker, BURNOUT_TOGGLE_LIMIT + 1);
    const wouldHaveRecovered = last + BURNOUT_RECOVERY_TICKS;

    // A further toggle partway through recovery, still inside the counting window.
    tracker.recordToggle(TORCH, last + 5);

    expect(tracker.isBurnedOut(TORCH, wouldHaveRecovered)).toBe(true);
  });

  it('tracks burnout per torch', () => {
    const tracker = new TorchBurnoutTracker();
    const last = toggleConsecutively(tracker, BURNOUT_TOGGLE_LIMIT + 1);
    expect(tracker.isBurnedOut(TORCH, last)).toBe(true);
    expect(tracker.isBurnedOut(TORCH + 1, last)).toBe(false);
  });

  it('reports no burnout for an untracked torch', () => {
    const tracker = new TorchBurnoutTracker();
    expect(tracker.isBurnedOut(99, 0)).toBe(false);
    expect(tracker.toggleCount(99, 0)).toBe(0);
  });

  it('clears one torch or all of them', () => {
    const tracker = new TorchBurnoutTracker();
    toggleConsecutively(tracker, BURNOUT_TOGGLE_LIMIT + 1);
    tracker.recordToggle(2, 0);

    tracker.clear(TORCH);
    expect(tracker.toggleCount(TORCH, 0)).toBe(0);
    expect(tracker.toggleCount(2, 0)).toBe(1);

    tracker.clear();
    expect(tracker.toggleCount(2, 0)).toBe(0);
  });
});

describe('torchStateProperties', () => {
  it('projects only the lit flag, legal for the schema', () => {
    for (const lit of [true, false]) {
      const props = torchStateProperties(lit);
      expect(Object.keys(props)).toEqual(['lit']);
      expect(props.lit).toBe(lit);
      expect(LIT_SCHEMA.legalValues('lit')).toContain(String(lit));
    }
  });
});
