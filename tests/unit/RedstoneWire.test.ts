import { describe, expect, it } from 'vitest';
import {
  BlockId,
  REDSTONE_WIRE_SCHEMA,
  createDefaultBlockRegistry,
} from '../../src/world/BlockRegistry';
import {
  ItemId,
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { resourceIdToString } from '../../src/data/ResourceId';
import { MIN_SIGNAL_STRENGTH, MAX_SIGNAL_STRENGTH, type RedstonePowerSource } from '../../src/simulation/RedstoneSignal';
import {
  HORIZONTAL_DIRECTIONS,
  resolveWireConnections,
  computeWirePower,
  wireStateProperties,
  DEFAULT_WIRE_CONNECTIONS,
  type WireWorld,
} from '../../src/simulation/RedstoneWire';

/** A world where nothing is a wire, solid, or connectable, and all wire power is 0. */
function emptyWorld(overrides: Partial<WireWorld> = {}): WireWorld {
  return {
    isWire: () => false,
    isSolid: () => false,
    connectsToRedstone: () => false,
    getWirePower: () => 0,
    ...overrides,
  };
}

/** A power source emitting nothing anywhere. */
const noPower: RedstonePowerSource = {
  getWeakPower: () => 0,
  getStrongPower: () => 0,
  isConductive: () => false,
};

const at = (x: number, y: number, z: number) => (px: number, py: number, pz: number) =>
  px === x && py === y && pz === z;

const anyOf = (...cells: ReadonlyArray<readonly [number, number, number]>) =>
  (px: number, py: number, pz: number) => cells.some(([x, y, z]) => px === x && py === y && pz === z);

describe('redstone wire registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers the wire block with its schema and default state', () => {
    const wire = blockRegistry.get(BlockId.RedstoneWire);
    expect(wire.key).toBe('redstone_wire');
    expect(wire.solid).toBe(false);
    expect(wire.breakable).toBe(true);
    expect(blockRegistry.getPropertySchema(BlockId.RedstoneWire)).toBe(REDSTONE_WIRE_SCHEMA);
    expect(wire.defaultState).toEqual({
      power: 0,
      north: 'none',
      south: 'none',
      east: 'none',
      west: 'none',
    });
  });

  it('registers a redstone item that places the wire block', () => {
    const dust = itemRegistry.get(ItemId.Redstone);
    expect(dust.key).toBe('redstone');
    expect(resourceIdToString(dust.placeBlock!)).toBe('minecraft:redstone_wire');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('drops redstone dust when broken', () => {
    const wire = blockRegistry.get(BlockId.RedstoneWire);
    expect(resourceIdToString(wire.dropItem!)).toBe('minecraft:redstone');
    expect(itemRegistry.getByResourceId(wire.dropItem!).id).toBe(ItemId.Redstone);
  });

  it('enumerates exactly 1296 wire states including the default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.RedstoneWire);
    expect(states.length).toBe(1296); // 16 power values x 3^4 connection values

    const defaultState = stateRegistry.getDefaultState(BlockId.RedstoneWire);
    expect(states).toContain(defaultState);
    expect(defaultState.getProperty('power')).toBe('0');
    for (const side of HORIZONTAL_DIRECTIONS) {
      expect(defaultState.getProperty(side)).toBe('none');
    }
  });
});

describe('resolveWireConnections', () => {
  it('connects at the side to a wire neighbour', () => {
    // North of the origin is (0, 0, -1).
    const world = emptyWorld({ isWire: at(0, 0, -1) });
    expect(resolveWireConnections(world, 0, 0, 0).north).toBe('side');
  });

  it('connects at the side to a connectable component', () => {
    // East of the origin is (1, 0, 0).
    const world = emptyWorld({ connectsToRedstone: at(1, 0, 0) });
    expect(resolveWireConnections(world, 0, 0, 0).east).toBe('side');
  });

  it('climbs a solid neighbour carrying a wire on top', () => {
    // West of the origin is (-1, 0, 0); the wire sits at (-1, 1, 0).
    const world = emptyWorld({
      isSolid: at(-1, 0, 0),
      isWire: at(-1, 1, 0),
    });
    expect(resolveWireConnections(world, 0, 0, 0).west).toBe('up');
  });

  it('does not climb when a solid block caps the querying wire', () => {
    const world = emptyWorld({
      isSolid: anyOf([-1, 0, 0], [0, 1, 0]), // neighbour solid AND ceiling solid
      isWire: at(-1, 1, 0),
    });
    expect(resolveWireConnections(world, 0, 0, 0).west).toBe('none');
  });

  it('reports a descent as a side connection', () => {
    // South of the origin is (0, 0, 1), non-solid, with a wire below at (0, -1, 1).
    const world = emptyWorld({ isWire: at(0, -1, 1) });
    expect(resolveWireConnections(world, 0, 0, 0).south).toBe('side');
  });

  it('connects to nothing when isolated', () => {
    const connections = resolveWireConnections(emptyWorld(), 0, 0, 0);
    expect(connections).toEqual(DEFAULT_WIRE_CONNECTIONS);
  });

  it('prefers a wire neighbour over a step-up', () => {
    // The neighbour is BOTH a wire and solid with a wire above; the side branch must win.
    const world = emptyWorld({
      isWire: anyOf([-1, 0, 0], [-1, 1, 0]),
      isSolid: at(-1, 0, 0),
    });
    expect(resolveWireConnections(world, 0, 0, 0).west).toBe('side');
  });

  it('returns exactly one connection per horizontal direction', () => {
    const connections = resolveWireConnections(emptyWorld({ isWire: () => true }), 0, 0, 0);
    expect(Object.keys(connections).sort()).toEqual([...HORIZONTAL_DIRECTIONS].sort());
    for (const d of HORIZONTAL_DIRECTIONS) {
      expect(['none', 'side', 'up']).toContain(connections[d]);
    }
  });
});

describe('computeWirePower', () => {
  it('takes external power for an isolated wire', () => {
    const source: RedstonePowerSource = {
      ...noPower,
      getStrongPower: (x, y, z, d) => (at(0, -1, 0)(x, y, z) && d === 'up' ? 12 : 0),
    };
    expect(computeWirePower(emptyWorld(), source, 0, 0, 0)).toBe(12);
  });

  it('takes a connected neighbour\'s power minus one', () => {
    const world = emptyWorld({
      isWire: at(0, 0, -1),
      getWirePower: (x, y, z) => (at(0, 0, -1)(x, y, z) ? 9 : 0),
    });
    expect(computeWirePower(world, noPower, 0, 0, 0)).toBe(8);
  });

  it('takes the strongest contributor', () => {
    const world = emptyWorld({
      isWire: at(0, 0, -1),
      getWirePower: (x, y, z) => (at(0, 0, -1)(x, y, z) ? 15 : 0),
    });
    const source: RedstonePowerSource = {
      ...noPower,
      getStrongPower: (x, y, z, d) => (at(0, -1, 0)(x, y, z) && d === 'up' ? 4 : 0),
    };
    expect(computeWirePower(world, source, 0, 0, 0)).toBe(14);
  });

  it('reads zero for an isolated unpowered wire', () => {
    expect(computeWirePower(emptyWorld(), noPower, 0, 0, 0)).toBe(MIN_SIGNAL_STRENGTH);
  });

  it('gains nothing from a neighbour at power one', () => {
    const world = emptyWorld({
      isWire: at(0, 0, -1),
      getWirePower: (x, y, z) => (at(0, 0, -1)(x, y, z) ? 1 : 0),
    });
    expect(computeWirePower(world, noPower, 0, 0, 0)).toBe(MIN_SIGNAL_STRENGTH);
  });

  it('attenuates an upward neighbour identically to a level one', () => {
    // West neighbour (-1,0,0) is solid with a wire above it at (-1,1,0) storing 10.
    const world = emptyWorld({
      isSolid: at(-1, 0, 0),
      isWire: at(-1, 1, 0),
      getWirePower: (x, y, z) => (at(-1, 1, 0)(x, y, z) ? 10 : 0),
    });
    expect(resolveWireConnections(world, 0, 0, 0).west).toBe('up');
    expect(computeWirePower(world, noPower, 0, 0, 0)).toBe(9);
  });

  it('attenuates a downward neighbour identically', () => {
    // South neighbour (0,0,1) is non-solid with a wire below at (0,-1,1) storing 10.
    const world = emptyWorld({
      isWire: at(0, -1, 1),
      getWirePower: (x, y, z) => (at(0, -1, 1)(x, y, z) ? 10 : 0),
    });
    expect(resolveWireConnections(world, 0, 0, 0).south).toBe('side');
    expect(computeWirePower(world, noPower, 0, 0, 0)).toBe(9);
  });

  it('never exceeds the signal domain even with an out-of-domain neighbour', () => {
    const world = emptyWorld({
      isWire: at(0, 0, -1),
      getWirePower: () => 999,
    });
    expect(computeWirePower(world, noPower, 0, 0, 0)).toBe(MAX_SIGNAL_STRENGTH - 1);
  });

  it('cannot sustain its own signal through a neighbour (always loses at least one)', () => {
    // A ring-like arrangement: every neighbour is a wire holding the same value.
    for (const stored of [1, 5, 15]) {
      const world = emptyWorld({ isWire: () => true, getWirePower: () => stored });
      expect(computeWirePower(world, noPower, 0, 0, 0)).toBe(Math.max(0, stored - 1));
    }
  });
});

describe('wireStateProperties', () => {
  it('projects power and connections onto the schema property names', () => {
    const connections = { north: 'side', south: 'none', east: 'up', west: 'side' } as const;
    const props = wireStateProperties(7, connections);

    expect(Object.keys(props).sort()).toEqual(['east', 'north', 'power', 'south', 'west']);
    expect(props).toEqual({ power: 7, north: 'side', south: 'none', east: 'up', west: 'side' });
  });

  it('clamps an out-of-domain power', () => {
    expect(wireStateProperties(99, DEFAULT_WIRE_CONNECTIONS).power).toBe(MAX_SIGNAL_STRENGTH);
    expect(wireStateProperties(-5, DEFAULT_WIRE_CONNECTIONS).power).toBe(MIN_SIGNAL_STRENGTH);
  });

  it('produces a record the wire schema accepts as a legal state', () => {
    const props = wireStateProperties(3, DEFAULT_WIRE_CONNECTIONS);
    for (const [name, value] of Object.entries(props)) {
      expect(REDSTONE_WIRE_SCHEMA.legalValues(name)).toContain(String(value));
    }
  });
});
