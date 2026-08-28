import { describe, it, expect } from 'vitest';
import {
  BlockId,
  RAIL_SCHEMA,
  createDefaultBlockRegistry,
} from '../../src/world/BlockRegistry';
import {
  ItemId,
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { resourceIdToString } from '../../src/data/ResourceId';
import {
  RAIL_SHAPES,
  railHasSupport,
  railNeighborInfo,
  railShapeConnections,
  railStateProperties,
  resolveRailShape,
  type RailNeighborWorld,
  type RailSupportWorld,
} from '../../src/simulation/RailBlockStates';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function makeNeighborWorld(rails: string[] = []): RailNeighborWorld<string> {
  const set = new Set(rails);
  return {
    getBlockState(x, y, z) {
      return set.has(key(x, y, z)) ? 'rail' : 'air';
    },
    isRail(s) {
      return s === 'rail';
    },
  };
}

function makeSupportWorld(initial: Record<string, string> = {}): RailSupportWorld<string> {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getBlockState(x, y, z) {
      return store.get(key(x, y, z)) ?? 'air';
    },
    isSolidSupport(s) {
      return s === 'stone';
    },
  };
}

describe('rail registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers the block with RAIL_SCHEMA and its default', () => {
    const def = blockRegistry.get(BlockId.Rail);
    expect(def.key).toBe('rail');
    expect(blockRegistry.getPropertySchema(BlockId.Rail)).toBe(RAIL_SCHEMA);
    expect(def.defaultState).toEqual({ shape: 'north_south' });
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.Rail);
    expect(item.key).toBe('rail');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:rail');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });

  it('enumerates exactly 10 states including the default', () => {
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.Rail);
    expect(states.length).toBe(10);
    const defaultState = stateRegistry.getDefaultState(BlockId.Rail);
    expect(states).toContain(defaultState);
    expect(defaultState.getProperty('shape')).toBe('north_south');
  });
});

describe('resolveRailShape', () => {
  it('defaults to north_south with no neighbors', () => {
    expect(resolveRailShape({})).toBe('north_south');
  });

  it('forms flat straights from opposite same-level pairs', () => {
    expect(resolveRailShape({ north: 0, south: 0 })).toBe('north_south');
    expect(resolveRailShape({ east: 0, west: 0 })).toBe('east_west');
  });

  it('ascends toward an elevated side of a straight pair', () => {
    expect(resolveRailShape({ north: 1, south: 0 })).toBe('ascending_north');
    expect(resolveRailShape({ north: 0, south: 1 })).toBe('ascending_south');
    expect(resolveRailShape({ east: 1, west: 0 })).toBe('ascending_east');
    expect(resolveRailShape({ east: 0, west: 1 })).toBe('ascending_west');
  });

  it('forms all four corners from perpendicular same-level pairs', () => {
    expect(resolveRailShape({ north: 0, east: 0 })).toBe('corner_north_east');
    expect(resolveRailShape({ north: 0, west: 0 })).toBe('corner_north_west');
    expect(resolveRailShape({ south: 0, east: 0 })).toBe('corner_south_east');
    expect(resolveRailShape({ south: 0, west: 0 })).toBe('corner_south_west');
  });

  it('does NOT corner with an elevated neighbor — it ascends instead', () => {
    expect(resolveRailShape({ north: 1, east: 0 })).toBe('ascending_north');
    expect(resolveRailShape({ north: 0, east: 1 })).toBe('ascending_east');
  });

  it('straight pairs take precedence over corners (three neighbors)', () => {
    expect(resolveRailShape({ north: 0, south: 0, east: 0 })).toBe('north_south');
    expect(resolveRailShape({ east: 0, west: 0, north: 0 })).toBe('east_west');
  });

  it('a single elevated neighbor ascends; a single same-level neighbor goes flat', () => {
    expect(resolveRailShape({ north: 1 })).toBe('ascending_north');
    expect(resolveRailShape({ south: 1 })).toBe('ascending_south');
    expect(resolveRailShape({ east: 1 })).toBe('ascending_east');
    expect(resolveRailShape({ west: 1 })).toBe('ascending_west');
    expect(resolveRailShape({ north: 0 })).toBe('north_south');
    expect(resolveRailShape({ east: 0 })).toBe('east_west');
  });
});

describe('railNeighborInfo', () => {
  it('finds a same-height rail (level 0)', () => {
    const world = makeNeighborWorld([key(1, 0, 0)]);
    expect(railNeighborInfo(world, 0, 0, 0, 'east')).toEqual({ present: true, level: 0 });
  });

  it('finds a one-higher rail (level 1) and reports absent otherwise', () => {
    const world = makeNeighborWorld([key(1, 1, 0)]);
    expect(railNeighborInfo(world, 0, 0, 0, 'east')).toEqual({ present: true, level: 1 });
    expect(railNeighborInfo(world, 0, 0, 0, 'west')).toEqual({ present: false, level: 0 });
    expect(railNeighborInfo(world, 0, 0, 0, 'north')).toEqual({ present: false, level: 0 });
  });
});

describe('railShapeConnections', () => {
  it('reports the connected directions for every shape', () => {
    expect(railShapeConnections('north_south')).toEqual(['north', 'south']);
    expect(railShapeConnections('east_west')).toEqual(['east', 'west']);
    expect(railShapeConnections('ascending_east')).toEqual(['east']);
    expect(railShapeConnections('corner_north_east')).toEqual(['north', 'east']);
    expect(railShapeConnections('corner_south_west')).toEqual(['south', 'west']);
  });

  it('covers all ten shapes (stable enumeration)', () => {
    expect(RAIL_SHAPES.length).toBe(10);
    for (const shape of RAIL_SHAPES) {
      expect(railShapeConnections(shape).length).toBeGreaterThan(0);
    }
  });
});

describe('railHasSupport', () => {
  it('requires a solid-supporting block directly below', () => {
    const world = makeSupportWorld({ [key(0, -1, 0)]: 'stone' });
    expect(railHasSupport(world, 0, 0, 0)).toBe(true);
    expect(railHasSupport(world, 0, 1, 0)).toBe(false); // nothing below y=0
  });
});

describe('railStateProperties', () => {
  it('projects the full state, legal for the schema', () => {
    const props = railStateProperties('ascending_east');
    expect(Object.keys(props)).toEqual(['shape']);
    expect(props).toEqual({ shape: 'ascending_east' });
    expect(RAIL_SCHEMA.legalValues('shape')).toContain('ascending_east');
  });
});
