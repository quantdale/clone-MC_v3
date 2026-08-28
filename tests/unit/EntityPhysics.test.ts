import { describe, it, expect } from 'vitest';
import {
  computeEntityPhysicsStep,
  tickEntityPhysics,
  DEFAULT_GRAVITY,
  DEFAULT_TERMINAL_VELOCITY,
  type EntityPhysicsBox,
} from '../../src/simulation/EntityPhysics';
import { CollisionResolver, type ShapeWorld } from '../../src/world/CollisionResolver';
import { VoxelShape } from '../../src/world/VoxelShape';
import { EntityManager } from '../../src/simulation/EntityManager';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import { ZERO_VELOCITY, type EntityTransform } from '../../src/world/Entity';

const resolver = new CollisionResolver();
const registry = createDefaultEntityRegistry();
const ZOMBIE = registry.getByKey('zombie')!.id;
const OVERWORLD = createResourceId('minecraft', 'overworld');

const emptyWorld: ShapeWorld = {
  getCollisionShape: () => VoxelShape.EMPTY,
};

function floorAtY(floorCy: number): ShapeWorld {
  return {
    getCollisionShape: (_x, y) => (y === floorCy ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY),
  };
}

function wallAtX(wallCx: number): ShapeWorld {
  return {
    getCollisionShape: (x) => (x === wallCx ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY),
  };
}

function ceilingAtY(ceilCy: number): ShapeWorld {
  return {
    getCollisionShape: (_x, y) => (y === ceilCy ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY),
  };
}

const UNIT_BOX: EntityPhysicsBox = { width: 1, height: 1, depth: 1 };

function transform(overrides: Partial<EntityTransform> = {}): EntityTransform {
  return { x: 0, y: 10, z: 0, yaw: 0, pitch: 0, ...overrides };
}

describe('computeEntityPhysicsStep — free fall', () => {
  it('applies gravity to vy and moves the entity down over one step', () => {
    const result = computeEntityPhysicsStep(emptyWorld, resolver, transform(), ZERO_VELOCITY, UNIT_BOX, 1);
    expect(result.velocity.vy).toBe(-DEFAULT_GRAVITY);
    expect(result.transform.y).toBe(10 - DEFAULT_GRAVITY);
    expect(result.onGround).toBe(false);
  });

  it('clamps vy at the terminal velocity', () => {
    const result = computeEntityPhysicsStep(
      emptyWorld,
      resolver,
      transform(),
      { vx: 0, vy: -1000, vz: 0 },
      UNIT_BOX,
      1,
    );
    expect(result.velocity.vy).toBe(-DEFAULT_TERMINAL_VELOCITY);
  });

  it('is pure: does not mutate its inputs', () => {
    const t = transform();
    const v = { vx: 1, vy: 2, vz: 3 };
    const box = { ...UNIT_BOX };
    computeEntityPhysicsStep(emptyWorld, resolver, t, v, box, 1);
    expect(t).toEqual(transform());
    expect(v).toEqual({ vx: 1, vy: 2, vz: 3 });
    expect(box).toEqual(UNIT_BOX);
  });
});

describe('computeEntityPhysicsStep — floor landing', () => {
  it('lands on a full-cube floor: clamps to the top face, zeroes vy, reports onGround', () => {
    const world = floorAtY(0);
    const box: EntityPhysicsBox = { width: 1, height: 1.8, depth: 1 };
    const start = transform({ y: 5 });
    const result = computeEntityPhysicsStep(world, resolver, start, { vx: 0, vy: -20, vz: 0 }, box, 1);
    expect(result.transform.y).toBe(1);
    expect(result.velocity.vy).toBe(0);
    expect(result.onGround).toBe(true);
  });
});

describe('computeEntityPhysicsStep — horizontal collision', () => {
  it('walking into a wall zeroes vx, leaves vz untouched, and never grounds the entity', () => {
    const world = wallAtX(5);
    const start = transform({ x: 4, y: 10, z: 0 });
    const velocity = { vx: 5, vy: 0, vz: 2 };
    const result = computeEntityPhysicsStep(world, resolver, start, velocity, UNIT_BOX, 1);
    expect(result.transform.x).toBe(4.5);
    expect(result.velocity.vx).toBe(0);
    expect(result.velocity.vz).toBe(2);
    expect(result.onGround).toBe(false);
  });
});

describe('computeEntityPhysicsStep — ceiling collision', () => {
  it('jumping into a ceiling zeroes vy without grounding the entity', () => {
    const world = ceilingAtY(3);
    const box: EntityPhysicsBox = { width: 1, height: 1, depth: 1 };
    const start = transform({ y: 1 });
    const result = computeEntityPhysicsStep(world, resolver, start, { vx: 0, vy: 100, vz: 0 }, box, 1);
    expect(result.transform.y).toBe(2);
    expect(result.velocity.vy).toBe(0);
    expect(result.onGround).toBe(false);
  });
});

describe('tickEntityPhysics', () => {
  function manager(): EntityManager {
    return new EntityManager(registry);
  }

  it('no-ops on an unknown id, a removed id, and dt <= 0', () => {
    const m = manager();
    const e = m.spawn(ZOMBIE, OVERWORLD, transform());
    m.remove(e.id);
    const world = emptyWorld;

    expect(tickEntityPhysics(m, 999, world, resolver, UNIT_BOX, 1)).toEqual({ ran: false, onGround: false });
    expect(tickEntityPhysics(m, e.id, world, resolver, UNIT_BOX, 1)).toEqual({ ran: false, onGround: false });

    const active = m.spawn(ZOMBIE, OVERWORLD, transform());
    expect(tickEntityPhysics(m, active.id, world, resolver, UNIT_BOX, 0)).toEqual({ ran: false, onGround: false });
    expect(tickEntityPhysics(m, active.id, world, resolver, UNIT_BOX, -1)).toEqual({ ran: false, onGround: false });
    // No entity's transform/velocity changed.
    expect(m.get(active.id)!.transform).toEqual(transform());
    expect(m.get(active.id)!.velocity).toEqual(ZERO_VELOCITY);
  });

  it('runs the step and persists the result through the manager', () => {
    const m = manager();
    const world = floorAtY(0);
    const box: EntityPhysicsBox = { width: 1, height: 1.8, depth: 1 };
    const e = m.spawn(ZOMBIE, OVERWORLD, transform({ y: 5 }), { velocity: { vx: 0, vy: -20, vz: 0 } });

    const outcome = tickEntityPhysics(m, e.id, world, resolver, box, 1);
    expect(outcome).toEqual({ ran: true, onGround: true });

    const updated = m.get(e.id)!;
    expect(updated.transform.y).toBe(1);
    expect(updated.velocity.vy).toBe(0);
  });
});
