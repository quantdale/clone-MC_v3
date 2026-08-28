import { describe, expect, it } from 'vitest';
import { BlockId, POWERED_SCHEMA, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
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
  BUTTON_ACTIVE_TICKS,
  PLATE_RELEASE_DELAY_TICKS,
  componentSignalStrength,
  toggleLever,
  pressButton,
  platePowered,
  plateReleaseTick,
  scheduleComponentRelease,
  dueComponentReleases,
  componentStateProperties,
  type RedstoneComponentKind,
} from '../../src/simulation/RedstoneInputComponents';

const KINDS: readonly RedstoneComponentKind[] = ['lever', 'button', 'pressure_plate'];

const COMPONENT_BLOCKS: ReadonlyArray<readonly [number, string, number]> = [
  [BlockId.Lever, 'lever', ItemId.Lever],
  [BlockId.StoneButton, 'stone_button', ItemId.StoneButton],
  [BlockId.PressurePlate, 'pressure_plate', ItemId.PressurePlate],
];

describe('input component registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers each block with POWERED_SCHEMA and an unpowered default', () => {
    for (const [blockId, key] of COMPONENT_BLOCKS) {
      const def = blockRegistry.get(blockId);
      expect(def.key).toBe(key);
      expect(blockRegistry.getPropertySchema(blockId)).toBe(POWERED_SCHEMA);
      expect(def.defaultState).toEqual({ powered: false });
    }
  });

  it('registers a placing item for each block', () => {
    for (const [, key, itemId] of COMPONENT_BLOCKS) {
      const item = itemRegistry.get(itemId);
      expect(item.key).toBe(key);
      expect(resourceIdToString(item.placeBlock!)).toBe(`minecraft:${key}`);
    }
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly two states per component with an unpowered default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    for (const [blockId] of COMPONENT_BLOCKS) {
      const states = stateRegistry.statesForBlock(blockId);
      expect(states.length).toBe(2);
      const defaultState = stateRegistry.getDefaultState(blockId);
      expect(states).toContain(defaultState);
      expect(defaultState.getProperty('powered')).toBe('false');
    }
  });
});

describe('componentSignalStrength', () => {
  it('emits full strength while powered, for every kind', () => {
    for (const kind of KINDS) {
      expect(componentSignalStrength(kind, true)).toBe(MAX_SIGNAL_STRENGTH);
    }
  });

  it('emits nothing while unpowered, for every kind', () => {
    for (const kind of KINDS) {
      expect(componentSignalStrength(kind, false)).toBe(MIN_SIGNAL_STRENGTH);
    }
  });
});

describe('toggleLever', () => {
  it('flips the state', () => {
    expect(toggleLever(false)).toBe(true);
    expect(toggleLever(true)).toBe(false);
  });

  it('is an involution', () => {
    for (const start of [true, false]) {
      expect(toggleLever(toggleLever(start))).toBe(start);
    }
  });
});

describe('pressButton', () => {
  it('powers on and sets the release tick', () => {
    expect(pressButton(100)).toEqual({ powered: true, releaseTick: 100 + BUTTON_ACTIVE_TICKS });
  });

  it('treats a non-finite tick as zero', () => {
    expect(pressButton(Number.NaN).releaseTick).toBe(BUTTON_ACTIVE_TICKS);
  });
});

describe('platePowered / plateReleaseTick', () => {
  it('is powered while occupied', () => {
    expect(platePowered(1)).toBe(true);
    expect(platePowered(5)).toBe(true);
  });

  it('is unpowered when empty', () => {
    expect(platePowered(0)).toBe(false);
  });

  it('treats an invalid count as unpowered', () => {
    expect(platePowered(-1)).toBe(false);
    expect(platePowered(Number.NaN)).toBe(false);
  });

  it('releases after the trailing delay', () => {
    expect(plateReleaseTick(50)).toBe(50 + PLATE_RELEASE_DELAY_TICKS);
  });
});

describe('scheduled releases', () => {
  it('never schedules a lever', () => {
    const queue = new ScheduledTickQueue();
    expect(scheduleComponentRelease(queue, 0, 0, 0, 'lever', 0)).toBe(false);
    expect(dueComponentReleases(queue, 1000)).toEqual([]);
  });

  it('does not release a button before its tick', () => {
    const queue = new ScheduledTickQueue();
    expect(scheduleComponentRelease(queue, 1, 2, 3, 'button', 0)).toBe(true);
    expect(dueComponentReleases(queue, BUTTON_ACTIVE_TICKS - 1)).toEqual([]);
  });

  it('releases a button at its tick', () => {
    const queue = new ScheduledTickQueue();
    scheduleComponentRelease(queue, 1, 2, 3, 'button', 0);
    const due = dueComponentReleases(queue, BUTTON_ACTIVE_TICKS);
    expect(due.length).toBe(1);
    expect(due[0]).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('releases a plate after its own shorter delay', () => {
    const queue = new ScheduledTickQueue();
    scheduleComponentRelease(queue, 4, 5, 6, 'pressure_plate', 0);
    expect(dueComponentReleases(queue, PLATE_RELEASE_DELAY_TICKS - 1)).toEqual([]);
    expect(dueComponentReleases(queue, PLATE_RELEASE_DELAY_TICKS).length).toBe(1);
  });

  it('re-pressing a button extends its release rather than firing early', () => {
    const queue = new ScheduledTickQueue();
    scheduleComponentRelease(queue, 1, 2, 3, 'button', 0);
    // Pressed again at tick 10; 047 dedups by position, so the release moves out.
    scheduleComponentRelease(queue, 1, 2, 3, 'button', 10);

    expect(dueComponentReleases(queue, BUTTON_ACTIVE_TICKS)).toEqual([]);
    const due = dueComponentReleases(queue, 10 + BUTTON_ACTIVE_TICKS);
    expect(due.length).toBe(1);
  });

  it('releases same-tick components in a deterministic, repeatable order', () => {
    function run() {
      const queue = new ScheduledTickQueue();
      scheduleComponentRelease(queue, 0, 0, 0, 'button', 0);
      scheduleComponentRelease(queue, 9, 9, 9, 'button', 0);
      return dueComponentReleases(queue, BUTTON_ACTIVE_TICKS).map((t) => `${t.x},${t.y},${t.z}`);
    }

    const first = run();
    expect(first.length).toBe(2);
    expect(first).toEqual(['0,0,0', '9,9,9']); // scheduling order
    expect(run()).toEqual(first); // repeatable
  });

  it('leaves later entries queued when draining an earlier tick', () => {
    const queue = new ScheduledTickQueue();
    scheduleComponentRelease(queue, 0, 0, 0, 'pressure_plate', 0); // due at 10
    scheduleComponentRelease(queue, 1, 1, 1, 'button', 0); // due at 20

    expect(dueComponentReleases(queue, PLATE_RELEASE_DELAY_TICKS).length).toBe(1);
    expect(dueComponentReleases(queue, BUTTON_ACTIVE_TICKS).length).toBe(1);
  });
});

describe('componentStateProperties', () => {
  it('projects only the powered flag, legal for the schema', () => {
    for (const powered of [true, false]) {
      const props = componentStateProperties(powered);
      expect(Object.keys(props)).toEqual(['powered']);
      expect(props.powered).toBe(powered);
      expect(POWERED_SCHEMA.legalValues('powered')).toContain(String(powered));
    }
  });
});
