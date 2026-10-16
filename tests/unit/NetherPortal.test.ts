import { describe, it, expect } from 'vitest';
import {
  BlockId,
  PORTAL_SCHEMA,
  createDefaultBlockRegistry,
} from '../../src/world/BlockRegistry';
import {
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import {
  MAX_PORTAL_SIZE,
  MIN_PORTAL_HEIGHT,
  MIN_PORTAL_WIDTH,
  portalBlockPositions,
  portalStateProperties,
  validatePortalFrame,
  type PortalFrameWorld,
  type PortalShape,
} from '../../src/simulation/NetherPortal';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** Build a world with an obsidian frame rectangle at plane z0: ring around [x0..x0+w-1] x [y0..y0+h-1]. */
function makeFrameWorld(opts: {
  x0?: number;
  y0?: number;
  z0?: number;
  width?: number;
  height?: number;
  /** Absolute offsets from (x0, y0) of a ring cell to remove (e.g. [-1, -1] = bottom-left corner). */
  omitCorner?: [number, number];
  interiorFire?: Array<[number, number]>;
} = {}): PortalFrameWorld {
  const x0 = opts.x0 ?? 1;
  const y0 = opts.y0 ?? 1;
  const z0 = opts.z0 ?? 0;
  const width = opts.width ?? 2;
  const height = opts.height ?? 3;
  const obsidian = new Set<string>();
  const air = new Set<string>();
  const fire = new Set<string>();

  // Ring: bottom bar (y0-1), top bar (y0+height), left/right columns (x0-1, x0+width).
  for (let i = -1; i <= width; i++) {
    obsidian.add(key(x0 + i, y0 - 1, z0));
    obsidian.add(key(x0 + i, y0 + height, z0));
  }
  for (let j = 0; j < height; j++) {
    obsidian.add(key(x0 - 1, y0 + j, z0));
    obsidian.add(key(x0 + width, y0 + j, z0));
  }
  if (opts.omitCorner) {
    obsidian.delete(key(x0 + opts.omitCorner[0], y0 + opts.omitCorner[1], z0));
  }
  // Interior.
  for (let i = 0; i < width; i++) {
    for (let j = 0; j < height; j++) {
      air.add(key(x0 + i, y0 + j, z0));
    }
  }
  for (const [ix, iy] of opts.interiorFire ?? []) {
    air.delete(key(x0 + ix, y0 + iy, z0));
    fire.add(key(x0 + ix, y0 + iy, z0));
  }

  return {
    isAir(x, y, z) {
      return air.has(key(x, y, z));
    },
    isFire(x, y, z) {
      return fire.has(key(x, y, z));
    },
    isObsidian(x, y, z) {
      return obsidian.has(key(x, y, z));
    },
  };
}

function assertShape(shape: PortalShape | null): PortalShape {
  if (shape === null) throw new Error('expected a valid portal shape');
  return shape;
}

describe('nether portal registration', () => {
  it('registers a portal block with PORTAL_SCHEMA (2 states, default axis x)', () => {
    const blockRegistry = createDefaultBlockRegistry();
    const def = blockRegistry.get(BlockId.NetherPortal);
    expect(def.key).toBe('nether_portal');
    expect(blockRegistry.getPropertySchema(BlockId.NetherPortal)).toBe(PORTAL_SCHEMA);
    expect(def.defaultState).toEqual({ axis: 'x' });
    const stateRegistry = createDefaultBlockStateRegistry();
    const states = stateRegistry.statesForBlock(BlockId.NetherPortal);
    expect(states.length).toBe(2);
    expect(stateRegistry.getDefaultState(BlockId.NetherPortal).getProperty('axis')).toBe('x');
  });

  it('has no placing item and cross-references still pass', () => {
    const itemRegistry = createDefaultItemRegistry();
    const blockRegistry = createDefaultBlockRegistry();
    expect(itemRegistry.getByKey('nether_portal')).toBeUndefined();
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });
});

describe('validatePortalFrame', () => {
  it('validates a minimal 4x5 frame (interior 2x3) with axis x', () => {
    const world = makeFrameWorld();
    const shape = assertShape(validatePortalFrame(world, 1, 2, 0));
    expect(shape).toEqual({ axis: 'x', x0: 1, y0: 1, z0: 0, width: 2, height: 3 });
  });

  it('validates a frame oriented along z with axis z', () => {
    // Interior spans z: ring at plane x=0 around interior z 1..3, y 1..3.
    const obsidian = new Set<string>();
    const air = new Set<string>();
    for (let i = -1; i <= 3; i++) {
      obsidian.add(key(0, 0, 1 + i)); // bottom bar (y=0)
      obsidian.add(key(0, 4, 1 + i)); // top bar (y=4)
    }
    for (let j = 0; j < 3; j++) {
      obsidian.add(key(0, 1 + j, 0)); // left column (z=0)
      obsidian.add(key(0, 1 + j, 4)); // right column (z=4)
    }
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        air.add(key(0, 1 + j, 1 + i));
      }
    }
    const world: PortalFrameWorld = {
      isAir: (x, y, z) => air.has(key(x, y, z)),
      isFire: () => false,
      isObsidian: (x, y, z) => obsidian.has(key(x, y, z)),
    };
    const shape = assertShape(validatePortalFrame(world, 0, 2, 2));
    expect(shape.axis).toBe('z');
    expect(shape.width).toBe(3);
    expect(shape.height).toBe(3);
  });

  it('allows fire inside the opening (the lighting fire)', () => {
    const world = makeFrameWorld({ interiorFire: [[0, 0]] });
    const shape = validatePortalFrame(world, 1, 1, 0);
    expect(shape).not.toBeNull();
  });

  it('rejects a missing corner', () => {
    const world = makeFrameWorld({ omitCorner: [-1, -1] }); // bottom-left corner gone
    expect(validatePortalFrame(world, 1, 2, 0)).toBeNull();
  });

  it('rejects a missing top bar', () => {
    const world = makeFrameWorld({ omitCorner: [0, 3] }); // a top-bar cell (x0, y0+height) gone
    expect(validatePortalFrame(world, 1, 2, 0)).toBeNull();
  });

  it('rejects a frame too narrow (width 1)', () => {
    expect(MIN_PORTAL_WIDTH).toBe(2);
    const world = makeFrameWorld({ width: 1, height: 3 });
    expect(validatePortalFrame(world, 1, 2, 0)).toBeNull();
  });

  it('rejects a frame too short (height 2)', () => {
    expect(MIN_PORTAL_HEIGHT).toBe(3);
    const world = makeFrameWorld({ width: 2, height: 2 });
    expect(validatePortalFrame(world, 1, 2, 0)).toBeNull();
  });

  it('rejects a non-air ignition cell', () => {
    const world = makeFrameWorld();
    expect(validatePortalFrame(world, 1, 1, 1)).toBeNull(); // outside the frame (not air/fire)
  });

  it('rejects an empty world (no frame anywhere)', () => {
    const empty: PortalFrameWorld = {
      isAir: () => true,
      isFire: () => false,
      isObsidian: () => false,
    };
    expect(validatePortalFrame(empty, 5, 5, 5)).toBeNull();
  });
});

describe('portalBlockPositions', () => {
  it('lists every interior cell of the shape (column-major: width outer, height inner)', () => {
    const shape: PortalShape = { axis: 'x', x0: 1, y0: 1, z0: 0, width: 2, height: 3 };
    const cells = portalBlockPositions(shape);
    expect(cells).toEqual([
      [1, 1, 0],
      [1, 2, 0],
      [1, 3, 0],
      [2, 1, 0],
      [2, 2, 0],
      [2, 3, 0],
    ]);
    expect(cells.length).toBe(6);
    expect(MAX_PORTAL_SIZE).toBe(21);
  });
});

describe('portalStateProperties', () => {
  it('projects the full state, legal for the schema', () => {
    expect(portalStateProperties('x')).toEqual({ axis: 'x' });
    expect(portalStateProperties('z')).toEqual({ axis: 'z' });
    expect(PORTAL_SCHEMA.legalValues('axis')).toEqual(['x', 'z']);
  });
});
