import { describe, expect, it } from 'vitest';
import { MIN_SIGNAL_STRENGTH, type RedstonePowerSource } from '../../src/simulation/RedstoneSignal';
import type { WireWorld } from '../../src/simulation/RedstoneWire';
import { RedstonePropagator, type WirePowerStore } from '../../src/simulation/RedstonePropagation';

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** An in-memory power store that records how many writes it received. */
class MapStore implements WirePowerStore {
  readonly powers = new Map<string, number>();
  writes = 0;

  getPower(x: number, y: number, z: number): number {
    return this.powers.get(key(x, y, z)) ?? 0;
  }

  setPower(x: number, y: number, z: number, power: number): void {
    this.powers.set(key(x, y, z), power);
    this.writes++;
  }
}

/** Build a world whose wires are exactly `cells`, with nothing solid or connectable. */
function wireWorld(cells: ReadonlyArray<readonly [number, number, number]>, store: MapStore): WireWorld {
  const set = new Set(cells.map(([x, y, z]) => key(x, y, z)));
  return {
    isWire: (x, y, z) => set.has(key(x, y, z)),
    isSolid: () => false,
    connectsToRedstone: () => false,
    getWirePower: (x, y, z) => store.getPower(x, y, z),
  };
}

/** A source emitting `strength` strong power upward from just below `(sx, sy - 1, sz)`. */
function sourceBelow(sx: number, sy: number, sz: number, strength: number): RedstonePowerSource {
  return {
    getWeakPower: () => 0,
    getStrongPower: (x, y, z, d) => (x === sx && y === sy - 1 && z === sz && d === 'up' ? strength : 0),
    isConductive: () => false,
  };
}

const noPower: RedstonePowerSource = {
  getWeakPower: () => 0,
  getStrongPower: () => 0,
  isConductive: () => false,
};

/** A straight west→east run of `length` wires along y=0, z=0 starting at x=0. */
function straightRun(length: number): Array<readonly [number, number, number]> {
  return Array.from({ length }, (_, i) => [i, 0, 0] as const);
}

describe('straight-run propagation', () => {
  it('attenuates one per block from the source', () => {
    const store = new MapStore();
    const cells = straightRun(5);
    const world = wireWorld(cells, store);
    const propagator = new RedstonePropagator(world, sourceBelow(0, 0, 0, 15), store);

    for (const [x, y, z] of cells) propagator.markDirty(x, y, z);
    const result = propagator.settle();

    expect(result.hitLimit).toBe(false);
    expect(cells.map(([x, y, z]) => store.getPower(x, y, z))).toEqual([15, 14, 13, 12, 11]);
  });

  it('drops to zero beyond fifteen blocks', () => {
    const store = new MapStore();
    const cells = straightRun(20);
    const world = wireWorld(cells, store);
    const propagator = new RedstonePropagator(world, sourceBelow(0, 0, 0, 15), store);

    for (const [x, y, z] of cells) propagator.markDirty(x, y, z);
    propagator.settle();

    expect(store.getPower(15, 0, 0)).toBe(MIN_SIGNAL_STRENGTH);
    expect(store.getPower(19, 0, 0)).toBe(MIN_SIGNAL_STRENGTH);
    expect(store.getPower(14, 0, 0)).toBe(1);
  });

  it('drains back to zero once the source is removed', () => {
    const store = new MapStore();
    const cells = straightRun(6);
    const world = wireWorld(cells, store);

    const powered = new RedstonePropagator(world, sourceBelow(0, 0, 0, 15), store);
    for (const [x, y, z] of cells) powered.markDirty(x, y, z);
    powered.settle();
    expect(store.getPower(0, 0, 0)).toBe(15);

    // Same world/store, but nothing emits any more.
    const drained = new RedstonePropagator(world, noPower, store);
    for (const [x, y, z] of cells) drained.markDirty(x, y, z);
    drained.settle();

    for (const [x, y, z] of cells) {
      expect(store.getPower(x, y, z)).toBe(MIN_SIGNAL_STRENGTH);
    }
  });
});

describe('loop protection', () => {
  it('settles a closed wire ring without exhausting its bound', () => {
    const store = new MapStore();
    // A 4x4 rectangular ring in the y=0 plane.
    const cells: Array<readonly [number, number, number]> = [];
    for (let i = 0; i < 4; i++) {
      cells.push([i, 0, 0], [i, 0, 3], [0, 0, i], [3, 0, i]);
    }
    const world = wireWorld(cells, store);
    const propagator = new RedstonePropagator(world, sourceBelow(0, 0, 0, 15), store);

    for (const [x, y, z] of cells) propagator.markDirty(x, y, z);
    const result = propagator.settle();

    expect(result.hitLimit).toBe(false);
    expect(propagator.pendingCount).toBe(0);
    for (const [x, y, z] of cells) {
      const power = store.getPower(x, y, z);
      expect(power).toBeGreaterThanOrEqual(MIN_SIGNAL_STRENGTH);
      expect(power).toBeLessThanOrEqual(15);
    }
    expect(store.getPower(0, 0, 0)).toBe(15);
  });
});

describe('determinism', () => {
  it('two independent runs produce identical results', () => {
    function run() {
      const store = new MapStore();
      const cells = straightRun(8);
      const world = wireWorld(cells, store);
      const propagator = new RedstonePropagator(world, sourceBelow(0, 0, 0, 15), store);
      for (const [x, y, z] of cells) propagator.markDirty(x, y, z);
      const result = propagator.settle();
      return { powers: [...store.powers.entries()].sort(), result };
    }

    const a = run();
    const b = run();
    expect(a.powers).toEqual(b.powers);
    expect(a.result.visited).toBe(b.result.visited);
    expect(a.result.changed).toBe(b.result.changed);
  });
});

describe('fixed point', () => {
  it('re-settling a settled circuit writes nothing', () => {
    const store = new MapStore();
    const cells = straightRun(6);
    const world = wireWorld(cells, store);
    const propagator = new RedstonePropagator(world, sourceBelow(0, 0, 0, 15), store);

    for (const [x, y, z] of cells) propagator.markDirty(x, y, z);
    propagator.settle();

    const writesAfterFirst = store.writes;
    for (const [x, y, z] of cells) propagator.markDirty(x, y, z);
    const second = propagator.settle();

    expect(second.changed).toBe(0);
    expect(store.writes).toBe(writesAfterFirst);
  });
});

describe('bounds', () => {
  it('reports hitLimit and preserves the backlog when maxUpdates trips', () => {
    const store = new MapStore();
    const cells = straightRun(40);
    const world = wireWorld(cells, store);
    const propagator = new RedstonePropagator(world, sourceBelow(0, 0, 0, 15), store, {
      maxUpdates: 5,
    });

    for (const [x, y, z] of cells) propagator.markDirty(x, y, z);
    const result = propagator.propagate();

    expect(result.hitLimit).toBe(true);
    expect(result.visited).toBe(5);
    expect(propagator.pendingCount).toBeGreaterThan(0);
  });

  it('never dequeues a position it does not handle', () => {
    // Regression guard: a bound trip must not consume queued work without processing it.
    const store = new MapStore();
    const cells = straightRun(10);
    const world = wireWorld(cells, store);
    const propagator = new RedstonePropagator(world, noPower, store, { maxUpdates: 3 });

    for (const [x, y, z] of cells) propagator.markDirty(x, y, z);
    const before = propagator.pendingCount;
    const result = propagator.propagate();

    // Exactly `visited` positions left the queue — none were dropped.
    expect(before - propagator.pendingCount).toBe(result.visited);
    expect(result.visited).toBe(3);
  });

  it('settle eventually clears the backlog across rounds', () => {
    const store = new MapStore();
    const cells = straightRun(20);
    const world = wireWorld(cells, store);
    const propagator = new RedstonePropagator(world, sourceBelow(0, 0, 0, 15), store, {
      maxUpdates: 8,
      maxSettleRounds: 200,
    });

    for (const [x, y, z] of cells) propagator.markDirty(x, y, z);
    const result = propagator.settle();

    expect(result.hitLimit).toBe(false);
    expect(propagator.pendingCount).toBe(0);
    expect(store.getPower(0, 0, 0)).toBe(15);
    expect(store.getPower(5, 0, 0)).toBe(10);
  });
});

describe('non-wire positions and neighbour marking', () => {
  it('examines but never writes a non-wire position', () => {
    const store = new MapStore();
    const world = wireWorld([], store); // nothing is a wire
    const propagator = new RedstonePropagator(world, sourceBelow(0, 0, 0, 15), store);

    propagator.markDirty(0, 0, 0);
    const result = propagator.propagate();

    expect(result.visited).toBeGreaterThanOrEqual(1);
    expect(result.changed).toBe(0);
    expect(store.writes).toBe(0);
  });

  it('markNeighborsDirty enqueues the six axis neighbours', () => {
    const store = new MapStore();
    const propagator = new RedstonePropagator(wireWorld([], store), noPower, store);

    propagator.markNeighborsDirty(0, 0, 0);

    expect(propagator.pendingCount).toBe(6);
  });
});

describe('vertical propagation', () => {
  it('carries a signal up a staircase of wires', () => {
    const store = new MapStore();
    // A staircase climbing east: wire at (0,0,0), solid at (1,0,0) with wire on top at (1,1,0),
    // solid at (2,1,0) with wire on top at (2,2,0).
    const wires = new Set([key(0, 0, 0), key(1, 1, 0), key(2, 2, 0)]);
    const solids = new Set([key(1, 0, 0), key(2, 1, 0)]);
    const world: WireWorld = {
      isWire: (x, y, z) => wires.has(key(x, y, z)),
      isSolid: (x, y, z) => solids.has(key(x, y, z)),
      connectsToRedstone: () => false,
      getWirePower: (x, y, z) => store.getPower(x, y, z),
    };
    const propagator = new RedstonePropagator(world, sourceBelow(0, 0, 0, 15), store);

    propagator.markDirty(0, 0, 0);
    const result = propagator.settle();

    expect(result.hitLimit).toBe(false);
    expect(store.getPower(0, 0, 0)).toBe(15);
    expect(store.getPower(1, 1, 0)).toBe(14);
    expect(store.getPower(2, 2, 0)).toBe(13);
  });
});
