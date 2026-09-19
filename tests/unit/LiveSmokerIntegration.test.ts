import { describe, expect, it } from 'vitest';
import { LiveBlockEntityHost, type HostWorldView } from '../../src/engine/LiveBlockEntityHost';
import { BLOCK_ENTITY_RECORD_VERSION, type SerializedBlockEntity } from '../../src/storage/BlockEntityRecord';
import { createSmokerContext } from '../../src/inventory/SmokerRecipes';
import {
  createFurnaceState,
  serializeFurnaceState,
  type FurnaceContext,
  type FurnaceState,
} from '../../src/world/FurnaceBlockEntity';
import { SMOKER_BLOCK_ID, SMOKER_TYPE_KEY } from '../../src/world/SmokerBlockEntity';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';

const X = 5;
const Y = 64;
const Z = -7;
const CHUNK = `${Math.floor(X / 16)},${Math.floor(Z / 16)}`;

const furnaceContext: FurnaceContext = {
  fuelBurnTicks: (item) => item === 'minecraft:coal' ? 10 : 0,
  cookTicks: (item) => item === 'minecraft:sand' ? 6 : 0,
  resultOf: (item) => item === 'minecraft:sand' ? { item: 'minecraft:glass', count: 1 } : null,
  experienceOf: (item) => item === 'minecraft:sand' ? 0.7 : 0,
};

class FakeWorld implements HostWorldView {
  readonly blocks = new Map<string, number>();
  readonly simulating = new Set<string>([CHUNK]);

  setBlock(x: number, y: number, z: number, id: number): void {
    this.blocks.set(`${x},${y},${z}`, id);
  }

  isChunkSimulating(cx: number, cz: number): boolean {
    return this.simulating.has(`${cx},${cz}`);
  }

  getBlock(x: number, y: number, z: number): number {
    return this.blocks.get(`${x},${y},${z}`) ?? 0;
  }
}

class SpyPersistence {
  readonly calls: Array<{ cx: number; cz: number; entities: SerializedBlockEntity[] }> = [];

  saveBlockEntities(cx: number, cz: number, entities: SerializedBlockEntity[]): void {
    this.calls.push({ cx, cz, entities });
  }
}

function slot(item: string | null, count: number): MenuSlot {
  return { item, count, maxStack: 64 };
}

function makeRig(): { world: FakeWorld; persistence: SpyPersistence; host: LiveBlockEntityHost } {
  const world = new FakeWorld();
  world.setBlock(X, Y, Z, SMOKER_BLOCK_ID);
  const persistence = new SpyPersistence();
  const host = new LiveBlockEntityHost({
    world,
    persistence,
    furnaceContext,
    smokerContext: createSmokerContext(furnaceContext),
  });
  return { world, persistence, host };
}

function state(host: LiveBlockEntityHost): FurnaceState {
  const value = host.getSmokerState(X, Y, Z);
  expect(value).not.toBeNull();
  return value!;
}

function load(host: LiveBlockEntityHost, init: Partial<Pick<FurnaceState, 'input' | 'fuel' | 'output'>> = {}): void {
  expect(host.placeSmoker(X, Y, Z)).toBe(true);
  const base = createFurnaceState();
  expect(host.applySmokerMenuSlots(X, Y, Z, {
    input: init.input ?? base.input,
    fuel: init.fuel ?? base.fuel,
    output: init.output ?? base.output,
  })).not.toBeNull();
}

describe('live smoker integration (281)', () => {
  it('processes at twice furnace speed while preserving fuel/result/xp semantics', () => {
    const rig = makeRig();
    load(rig.host, { input: slot('minecraft:sand', 1), fuel: slot('minecraft:coal', 1) });

    for (let i = 0; i < 2; i++) rig.host.tickSmokers();
    expect(state(rig.host).output.item).toBeNull();
    expect(state(rig.host).smeltTime).toBe(2);

    rig.host.tickSmokers();
    const cooked = state(rig.host);
    expect(cooked.output).toEqual(slot('minecraft:glass', 1));
    expect(cooked.input.item).toBeNull();
    expect(cooked.fuel.item).toBeNull();
    expect(cooked.fuel.count).toBe(0);
    expect(cooked.xp).toBe(0.7);
  });

  it('does not advance while the chunk is not simulating and restores an exact snapshot', () => {
    const rig = makeRig();
    load(rig.host, { input: slot('minecraft:sand', 1), fuel: slot('minecraft:coal', 1) });
    rig.world.simulating.clear();
    rig.host.tickSmokers();
    expect(state(rig.host).smeltTime).toBe(0);

    const snapshot = rig.host.serializeChunkForSave(Math.floor(X / 16), Math.floor(Z / 16));
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]!.typeKey).toBe(SMOKER_TYPE_KEY);

    const reloaded = makeRig();
    expect(reloaded.host.hydrate(snapshot)).toEqual({ hydrated: 1, quarantined: 0 });
    expect(state(reloaded.host)).toEqual(state(rig.host));
  });

  it('pauses on a blocked output and rejects a menu write after the block vanishes', () => {
    const rig = makeRig();
    load(rig.host, {
      input: slot('minecraft:sand', 1),
      fuel: slot('minecraft:coal', 1),
      output: slot('minecraft:glass', 64),
    });
    const before = state(rig.host);
    expect(rig.host.tickSmokers()).toBe(0);
    expect(state(rig.host)).toEqual(before);

    rig.world.setBlock(X, Y, Z, 0);
    expect(rig.host.applySmokerMenuSlots(X, Y, Z, {
      input: slot('minecraft:sand', 2),
      fuel: slot('minecraft:coal', 2),
      output: before.output,
    })).toBeNull();
    expect(state(rig.host)).toEqual(before);
  });

  it('drains only floored XP and preserves the fractional carry', () => {
    const rig = makeRig();
    const record: SerializedBlockEntity = {
      schemaVersion: BLOCK_ENTITY_RECORD_VERSION,
      typeKey: SMOKER_TYPE_KEY,
      x: X,
      y: Y,
      z: Z,
      data: serializeFurnaceState({ ...createFurnaceState(), xp: 2.4 }),
    };
    expect(rig.host.hydrate([record])).toEqual({ hydrated: 1, quarantined: 0 });
    expect(rig.host.takeSmokerExperience(X, Y, Z)).toBe(2);
    expect(state(rig.host).xp).toBeCloseTo(0.4);
    expect(rig.host.takeSmokerExperience(X, Y, Z)).toBe(0);
  });

  it('removes stale rows once, rejects duplicate placement, and leaves an empty persisted chunk', () => {
    const rig = makeRig();
    load(rig.host);
    expect(rig.host.placeSmoker(X, Y, Z)).toBe(false);
    rig.world.blocks.delete(`${X},${Y},${Z}`);
    rig.host.tickSmokers();
    expect(rig.host.getSmokerState(X, Y, Z)).toBeNull();
    expect(rig.host.removeSmoker(X, Y, Z)).toBeNull();
    expect(rig.persistence.calls.at(-1)?.entities).toEqual([]);
  });

  it('quarantines malformed smoker payloads without boot failure', () => {
    const rig = makeRig();
    const bad: SerializedBlockEntity = {
      schemaVersion: BLOCK_ENTITY_RECORD_VERSION,
      typeKey: SMOKER_TYPE_KEY,
      x: X,
      y: Y,
      z: Z,
      data: { ...(serializeFurnaceState(createFurnaceState()) as Record<string, unknown>), burnTime: 0.5 },
    };
    expect(rig.host.hydrate([bad])).toEqual({ hydrated: 0, quarantined: 1 });
    expect(rig.host.size).toBe(0);
  });
});
