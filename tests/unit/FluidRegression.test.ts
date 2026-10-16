import { describe, it, expect } from 'vitest';
import { FluidTickDispatcher } from '../../src/simulation/FluidTickDispatcher';
import { ScheduledTickQueue } from '../../src/simulation/ScheduledTickQueue';
import { stepWaterCell, WATER_FLOW_INTERVAL } from '../../src/simulation/WaterFlowEngine';
import {
  applyFluidContact,
  type FluidInteractionWorld,
  type InteractionBlockIds,
} from '../../src/simulation/FluidInteraction';
import type { WaterWorldAccess, WaterStepResult } from '../../src/simulation/WaterFlowEngine';
import {
  waterlog,
  waterloggingLevelFromFluid,
  type WaterloggedCell,
} from '../../src/world/Waterlogging';
import { createFluidState, type FluidState } from '../../src/world/FluidState';

const WATER = 1;
const LAVA = 2;
const OBSIDIAN = 100;
const COBBLESTONE = 101;
const STONE = 102;
const SLAB = 200; // a waterloggable block id

const IDS: InteractionBlockIds = { obsidian: OBSIDIAN, cobblestone: COBBLESTONE, stone: STONE };

/** Deterministic in-memory fluid world with bounds, solids, and waterlogging. */
class RegressionWorld implements WaterWorldAccess, FluidInteractionWorld {
  private readonly fluids = new Map<string, FluidState>();
  private readonly solids = new Set<string>();
  private readonly waterlogged = new Map<string, WaterloggedCell>();
  private readonly waterloggableBlocks = new Set<string>();

  constructor(
    private readonly minX: number,
    private readonly minY: number,
    private readonly minZ: number,
    private readonly maxX: number,
    private readonly maxY: number,
    private readonly maxZ: number,
  ) {}

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  private inBounds(x: number, y: number, z: number): boolean {
    return x >= this.minX && x < this.maxX && y >= this.minY && y < this.maxY && z >= this.minZ && z < this.maxZ;
  }

  getFluidState(x: number, y: number, z: number): FluidState | null {
    const key = this.key(x, y, z);
    const waterlogged = this.waterlogged.get(key);
    if (waterlogged !== undefined) {
      return createFluidState(WATER, waterlogged.waterLevel);
    }
    return this.fluids.get(key) ?? null;
  }

  setFluidState(x: number, y: number, z: number, state: FluidState | null): void {
    const key = this.key(x, y, z);
    this.waterlogged.delete(key);
    if (state === null) {
      this.fluids.delete(key);
      return;
    }
    if (this.waterloggableBlocks.has(key) && state.fluidId === WATER) {
      // Water entering a waterloggable cell waterlogs it (level via 081 conversion).
      this.waterlogged.set(key, waterlog(SLAB, waterloggingLevelFromFluid(state.level)));
      return;
    }
    this.fluids.set(key, state);
  }

  setBlockState(x: number, y: number, z: number, _blockId: number): void {
    const key = this.key(x, y, z);
    this.fluids.delete(key);
    this.waterlogged.delete(key);
    this.waterloggableBlocks.delete(key);
    this.solids.add(key);
  }

  isReplaceable(x: number, y: number, z: number): boolean {
    if (!this.inBounds(x, y, z)) return false;
    const key = this.key(x, y, z);
    return !this.solids.has(key);
  }

  setSolid(x: number, y: number, z: number): void {
    this.solids.add(this.key(x, y, z));
  }

  placeWaterloggable(x: number, y: number, z: number): void {
    this.waterloggableBlocks.add(this.key(x, y, z));
  }

  setFluid(x: number, y: number, z: number, level: number, fluidId = WATER): void {
    this.fluids.set(this.key(x, y, z), createFluidState(fluidId, level));
  }

  clearFluid(x: number, y: number, z: number): void {
    this.fluids.delete(this.key(x, y, z));
  }

  levelAt(x: number, y: number, z: number): number | null {
    const state = this.getFluidState(x, y, z);
    return state === null ? null : state.level;
  }

  isWaterloggedAt(x: number, y: number, z: number): boolean {
    return this.waterlogged.has(this.key(x, y, z));
  }

  blockAt(x: number, y: number, z: number): number | null {
    return this.solids.has(this.key(x, y, z)) ? 1 : null;
  }

  snapshot(): string {
    const fluids = [...this.fluids.entries()].sort();
    const waterlogged = [...this.waterlogged.entries()].sort();
    const solids = [...this.solids].sort();
    return JSON.stringify({ fluids, waterlogged, solids });
  }
}

const ALL_NEIGHBORS: ReadonlyArray<[number, number, number]> = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

/** The deterministic wiring: water step → lava contacts → re-schedule affected + neighbors. */
function makeWiring(
  world: RegressionWorld,
  queue: ScheduledTickQueue,
): (x: number, y: number, z: number, dueTick: number) => void {
  const HORIZONTAL: ReadonlyArray<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  return (x, y, z, dueTick) => {
    const result: WaterStepResult = stepWaterCell(world, WATER, x, y, z);
    for (const [dx, dy, dz] of ALL_NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      const neighbor = world.getFluidState(nx, ny, nz);
      if (neighbor !== null && neighbor.fluidId === LAVA) {
        applyFluidContact(world, IDS, x, y, z, nx, ny, nz);
      }
    }
    // Neighbor updates: changed cells AND their horizontal neighbors re-tick (a feeder change
    // must reach the cells it sustains, so decay waves propagate deterministically).
    for (const [ax, ay, az] of result.affected) {
      queue.scheduleIn(ax, ay, az, WATER_FLOW_INTERVAL, dueTick);
      for (const [hdx, hdz] of HORIZONTAL) {
        queue.scheduleIn(ax + hdx, ay, az + hdz, WATER_FLOW_INTERVAL, dueTick);
      }
    }
  };
}

/** Drive the wiring until steady state; returns dispatch-cycle counts. */
function simulate(
  world: RegressionWorld,
  queue: ScheduledTickQueue,
  seeds: Array<[number, number, number]>,
  maxCycles: number,
  maxPerTick?: number,
): { cycles: number; totalProcessed: number } {
  const dispatcher = new FluidTickDispatcher(queue, makeWiring(world, queue), maxPerTick);
  for (const [x, y, z] of seeds) dispatcher.schedule(x, y, z, WATER_FLOW_INTERVAL, 0);
  let totalProcessed = 0;
  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    const report = dispatcher.tick(cycle * WATER_FLOW_INTERVAL);
    totalProcessed += report.processed;
    if (report.processed === 0 && report.pending === 0) {
      return { cycles: cycle, totalProcessed };
    }
  }
  throw new Error(`not steady after ${maxCycles} dispatch cycles`);
}

/** A corridor world: floor at y=0, walls along the corridor, cells at y=1. */
function corridorWorld(cells: number, minX: number): RegressionWorld {
  const world = new RegressionWorld(minX - 2, -1, -1, minX + cells + 2, 8, 2);
  for (let x = minX - 2; x < minX + cells + 2; x++) {
    world.setSolid(x, 0, 0);
    world.setSolid(x, -1, 0);
  }
  for (let x = minX - 2; x < minX + cells + 2; x++) {
    world.setSolid(x, 1, -1);
    world.setSolid(x, 1, 1);
  }
  return world;
}

describe('fluid regression fixtures', () => {
  it('fills a 7-cell corridor deterministically (cell k reaches level k on cycle k)', () => {
    const world = corridorWorld(7, 0);
    world.setFluid(0, 1, 0, 0); // source at the mouth

    const { cycles, totalProcessed } = simulate(world, new ScheduledTickQueue(), [[0, 1, 0]], 20);

    for (let k = 1; k <= 7; k++) expect(world.levelAt(k, 1, 0)).toBe(k);
    expect(world.levelAt(8, 1, 0)).toBeNull();
    expect(cycles).toBeLessThanOrEqual(9);
    expect(totalProcessed).toBeLessThanOrEqual(50);
  });

  it('forms a waterfall: falling column, level-6 base, level-7 pool', () => {
    const world = new RegressionWorld(-2, -1, -2, 8, 8, 3);
    for (let x = -2; x < 8; x++) {
      for (let z = -2; z < 3; z++) {
        world.setSolid(x, 0, z);
      }
    }
    world.setFluid(4, 5, 0, 0); // elevated source

    const { cycles, totalProcessed } = simulate(world, new ScheduledTickQueue(), [[4, 5, 0]], 30);

    // Falling column 4..2; base at y=1 is flowing 6; the four pool neighbors are level 7.
    expect(world.levelAt(4, 4, 0)).toBe(8);
    expect(world.levelAt(4, 3, 0)).toBe(8);
    expect(world.levelAt(4, 2, 0)).toBe(8);
    expect(world.levelAt(4, 1, 0)).toBe(6);
    expect(world.levelAt(3, 1, 0)).toBe(7);
    expect(world.levelAt(5, 1, 0)).toBe(7);
    expect(world.levelAt(4, 1, -1)).toBe(7);
    expect(world.levelAt(4, 1, 1)).toBe(7);
    expect(cycles).toBeLessThanOrEqual(12);
    expect(totalProcessed).toBeLessThanOrEqual(40);
  });

  it('turns a two-source gap into a source pool', () => {
    const world = corridorWorld(4, 0);
    world.setFluid(0, 1, 0, 0);
    world.setFluid(2, 1, 0, 0);

    simulate(world, new ScheduledTickQueue(), [
      [0, 1, 0],
      [2, 1, 0],
    ], 20);

    expect(world.levelAt(1, 1, 0)).toBe(0); // the gap became a source
    expect(world.levelAt(0, 1, 0)).toBe(0);
    expect(world.levelAt(2, 1, 0)).toBe(0);
  });

  it('dries a pool after its source is removed', () => {
    const world = corridorWorld(7, 0);
    world.setFluid(0, 1, 0, 0);
    simulate(world, new ScheduledTickQueue(), [[0, 1, 0]], 20);
    expect(world.levelAt(7, 1, 0)).toBe(7);

    world.clearFluid(0, 1, 0);
    world.setFluid(0, 1, 0, 7); // the source cell itself is now unfed flowing water
    // Breaking a block schedules the affected region (neighbor updates); seed the corridor.
    const seeds: Array<[number, number, number]> = [];
    for (let x = 0; x <= 7; x++) seeds.push([x, 1, 0]);
    simulate(world, new ScheduledTickQueue(), seeds, 40);

    for (let x = 0; x <= 7; x++) expect(world.levelAt(x, 1, 0)).toBeNull();
  });

  it('contains flow at world edges and behind walls', () => {
    const world = new RegressionWorld(0, -1, 0, 8, 8, 8);
    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 8; z++) {
        world.setSolid(x, 0, z);
      }
    }
    world.setFluid(0, 1, 0, 0); // at the world corner: west/south sides are out of bounds

    simulate(world, new ScheduledTickQueue(), [[0, 1, 0]], 20);

    // Water spread east/north only; nothing written outside the bounds.
    expect(world.levelAt(1, 1, 0)).toBe(1);
    expect(world.levelAt(0, 1, 1)).toBe(1);
    expect(world.levelAt(0, 1, -1)).toBeNull();
    expect(world.levelAt(-1, 1, 0)).toBeNull();
    expect(world.snapshot()).not.toContain('"-1,');

    // L-shaped wall pocket: water stays inside.
    const pocket = new RegressionWorld(0, -1, 0, 8, 8, 8);
    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 8; z++) {
        pocket.setSolid(x, 0, z);
      }
    }
    // L-shaped wall pocket: walls along x=3 (all z) and z=3 (all x) leave the corner open.
    for (let z = 0; z < 8; z++) pocket.setSolid(3, 1, z);
    for (let x = 0; x < 8; x++) pocket.setSolid(x, 1, 3);
    pocket.setFluid(0, 1, 0, 0);

    simulate(pocket, new ScheduledTickQueue(), [[0, 1, 0]], 20);

    expect(pocket.levelAt(2, 1, 2)).not.toBeNull(); // inside the pocket
    expect(pocket.levelAt(4, 1, 2)).toBeNull(); // walled off
    expect(pocket.levelAt(2, 1, 4)).toBeNull();
  });

  it('survives an unload/reload round-trip of the tick queue', () => {
    const build = () => {
      const world = corridorWorld(7, 0);
      world.setFluid(0, 1, 0, 0);
      return world;
    };

    // Control: straight through.
    const controlWorld = build();
    const controlQueue = new ScheduledTickQueue();
    simulate(controlWorld, controlQueue, [[0, 1, 0]], 20);

    // Round-trip: run 3 cycles, serialize, restore into a fresh queue, continue.
    const world = build();
    const queue = new ScheduledTickQueue();
    const dispatcher = new FluidTickDispatcher(queue, makeWiring(world, queue));
    dispatcher.schedule(0, 1, 0, WATER_FLOW_INTERVAL, 0);
    for (let cycle = 1; cycle <= 3; cycle++) dispatcher.tick(cycle * WATER_FLOW_INTERVAL);

    const serialized = queue.serialize();
    const restored = new ScheduledTickQueue();
    restored.deserialize(serialized);
    const restoredDispatcher = new FluidTickDispatcher(restored, makeWiring(world, restored));
    for (let cycle = 4; cycle <= 20; cycle++) {
      const report = restoredDispatcher.tick(cycle * WATER_FLOW_INTERVAL);
      if (report.processed === 0 && report.pending === 0) break;
    }

    expect(world.snapshot()).toBe(controlWorld.snapshot());
  });

  it('waterlogs waterloggable cells and treats them as sources', () => {
    const world = corridorWorld(3, 0);
    world.placeWaterloggable(2, 1, 0); // a slab in the corridor

    world.setFluid(0, 1, 0, 0);
    simulate(world, new ScheduledTickQueue(), [[0, 1, 0]], 20);

    expect(world.isWaterloggedAt(2, 1, 0)).toBe(true);
    expect(world.levelAt(2, 1, 0)).toBe(0); // reads as a source for flow
    expect(world.levelAt(3, 1, 0)).toBe(1); // the waterlogged source fed the next cell
  });

  it('turns water+lava contact into blocks during flow', () => {
    const world = corridorWorld(5, 0);
    world.setFluid(0, 1, 0, 0); // water source
    world.setFluid(3, 1, 0, 0, LAVA); // lava source in the corridor

    simulate(world, new ScheduledTickQueue(), [[0, 1, 0]], 20);

    expect(world.levelAt(3, 1, 0)).toBeNull(); // lava consumed
    expect(world.levelAt(1, 1, 0)).not.toBeNull();
  });

  it('reaches steady state on a 64x64 basin within bounds, deterministically', () => {
    const run = () => {
      const world = new RegressionWorld(-1, -1, -1, 65, 8, 65);
      for (let x = 0; x < 64; x++) {
        for (let z = 0; z < 64; z++) {
          world.setSolid(x, 0, z);
        }
      }
      // Perimeter walls.
      for (let x = -1; x <= 64; x++) {
        world.setSolid(x, 1, -1);
        world.setSolid(x, 1, 64);
      }
      for (let z = 0; z < 64; z++) {
        world.setSolid(-1, 1, z);
        world.setSolid(64, 1, z);
      }
      world.setFluid(32, 1, 32, 0); // center source

      const { cycles, totalProcessed } = simulate(world, new ScheduledTickQueue(), [[32, 1, 32]], 200, 50);
      return { world, cycles, totalProcessed };
    };

    const a = run();
    const b = run();

    // The filled region is exactly the manhattan diamond within 7 of the source.
    for (let x = 0; x < 64; x++) {
      for (let z = 0; z < 64; z++) {
        const dist = Math.abs(x - 32) + Math.abs(z - 32);
        if (dist <= 7) expect(a.world.levelAt(x, 1, z)).not.toBeNull();
        else expect(a.world.levelAt(x, 1, z)).toBeNull();
      }
    }

    expect(a.cycles).toBeLessThanOrEqual(60);
    expect(a.totalProcessed).toBeLessThanOrEqual(20000);
    expect(a.world.snapshot()).toBe(b.world.snapshot());
    expect(a.cycles).toBe(b.cycles);
    expect(a.totalProcessed).toBe(b.totalProcessed);
  });
});
