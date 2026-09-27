import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import { EntityManager } from '../../src/simulation/EntityManager';
import { createEntityManagerRaidBackend } from '../../src/simulation/RaidEntityBackend';
import { RaidWaveController } from '../../src/simulation/RaidWaveController';
import {
  PLAYER_RAID_MELEE_DAMAGE,
  RaiderCombatSystem,
  type RaiderDeathInfo,
} from '../../src/simulation/RaiderCombatBehavior';
import { recordRaiderDeath, startRaid, tickRaid, type RaidState } from '../../src/simulation/RaidStateMachine';
import { CollisionResolver, type ShapeWorld } from '../../src/world/CollisionResolver';
import { VoxelShape } from '../../src/world/VoxelShape';
import { ItemEntityManager } from '../../src/simulation/ItemEntityManager';
import { createDefaultItemRegistry, ItemId } from '../../src/inventory/ItemRegistry';
import {
  WITCH_TOTAL_WEIGHT,
  createScriptedRandom,
  resolveMobGunpowderDrops,
} from '../../src/simulation/GunpowderMobDrops';
import type { RandomSource } from '../../src/inventory/LootTable';

/**
 * Live witch gunpowder drops (297): Game's composition replayed over the real
 * RaiderCombatSystem + RaidWaveController + ItemEntityManager: every death path
 * hands `RaiderDeathInfo` (type key + pre-removal position) to the sink, witch
 * deaths drop the vanilla table exactly once as item entities, other raiders
 * drop nothing, and the drop is picked up through the real collect path.
 */

const emptyWorld: ShapeWorld = { getCollisionShape: () => VoxelShape.EMPTY };
const entityRegistry = createDefaultEntityRegistry();
const itemRegistry = createDefaultItemRegistry();
const dimension = createResourceId('minecraft', 'overworld');

/** 1 roll -> gunpowder -> count 2. */
const GUNPOWDER_X2 = [0, 5.5 / WITCH_TOTAL_WEIGHT, 0.99];

class Owner {
  raidState: RaidState | null = null;
  readonly manager = new EntityManager(entityRegistry);
  readonly backend = createEntityManagerRaidBackend({ manager: this.manager, registry: entityRegistry, dimension });
  readonly controller = new RaidWaveController({
    backend: this.backend,
    resolveType: (k) => entityRegistry.getByKey(k) !== undefined,
  });
  readonly combat = new RaiderCombatSystem({ manager: this.manager, registry: entityRegistry });
  readonly items = new ItemEntityManager({ itemRegistry });
  dropRandom: RandomSource = createScriptedRandom(GUNPOWDER_X2)!;
  readonly drops: { death: RaiderDeathInfo; stacks: { item: number; count: number }[] }[] = [];
  simTick = 0;

  start(omen = 3): void {
    const { state, spawned } = tickRaid(startRaid(0, 64, 0, omen));
    this.raidState = state;
    if (spawned && spawned.length > 0) this.controller.applyWave(state, spawned);
  }

  kindOf(id: number): string {
    const e = this.manager.get(id);
    return e ? (entityRegistry.getOptional(e.typeId)?.key ?? '') : '';
  }

  idsOf(kind: string): number[] {
    return this.controller.getRaidWaveEntityIds().filter((id) => this.kindOf(id) === kind);
  }

  private onRemoved(entityId: number): boolean {
    if (!this.raidState) return false;
    if (!this.controller.consumeDeath(entityId)) return false;
    this.raidState = recordRaiderDeath(this.raidState);
    return true;
  }

  /** Mirrors Game.dropRaiderLoot. */
  private dropLoot(death: RaiderDeathInfo): void {
    if (death.typeKey !== 'witch') return;
    const { stacks } = resolveMobGunpowderDrops(death.typeKey, itemRegistry, this.dropRandom, 0);
    const copy = stacks.map((s) => ({ item: s.item, count: s.count }));
    this.drops.push({ death, stacks: copy });
    if (copy.length > 0) this.items.spawnLootStacks(copy, death.x, death.y + 0.5, death.z);
  }

  /** Game's sink shape: consumed deaths only drop loot. */
  readonly sink = (id: number, death: RaiderDeathInfo): void => {
    if (this.onRemoved(id)) this.dropLoot(death);
  };

  melee(player: { x: number; y: number; z: number }): void {
    this.simTick += 100; // clear melee cooldown
    this.combat.tick({
      dt: 0.05,
      simTick: this.simTick,
      paused: false,
      center: { x: 0, y: 64, z: 0 },
      trackedIds: this.controller.getRaidWaveEntityIds(),
      getPlayerTarget: () => player,
      world: emptyWorld,
      resolver: new CollisionResolver(),
      onPlayerDamaged: () => undefined,
      onRaiderDied: this.sink,
      playerMeleeRequested: true,
    });
  }
}

describe('raider death info (297)', () => {
  it('damageRaider reports the type key and the pre-removal position', () => {
    const o = new Owner();
    o.start(3);
    const witch = o.idsOf('witch')[0]!;
    expect(witch).toBeDefined();
    const e = o.manager.get(witch)!;
    const pos = { x: e.transform.x, y: e.transform.y, z: e.transform.z };
    let seen: RaiderDeathInfo | null = null;
    const r = o.combat.damageRaider(witch, 10_000, (_id, death) => {
      seen = death;
      expect(o.manager.get(witch)?.state).not.toBe('ACTIVE'); // removed before the sink
    });
    expect(r.died).toBe(true);
    expect(seen).toEqual({ typeKey: 'witch', ...pos });
  });

  it('non-lethal damage reports nothing', () => {
    const o = new Owner();
    o.start(3);
    const witch = o.idsOf('witch')[0]!;
    let calls = 0;
    o.combat.damageRaider(witch, 1, () => calls++);
    expect(calls).toBe(0);
  });
});

describe('live witch drops (297)', () => {
  it('a killed witch drops 2 gunpowder as an item entity at its position, exactly once', () => {
    const o = new Owner();
    o.start(3);
    const witch = o.idsOf('witch')[0]!;
    const e = o.manager.get(witch)!;
    const pos = { x: e.transform.x, y: e.transform.y, z: e.transform.z };
    o.combat.damageRaider(witch, 10_000, o.sink);
    expect(o.drops).toHaveLength(1);
    expect(o.drops[0]!.stacks).toEqual([{ item: ItemId.Gunpowder, count: 2 }]);
    const ents = o.items.getItemEntities();
    expect(ents).toHaveLength(1);
    expect(ents[0]!.item).toBe(ItemId.Gunpowder);
    expect(ents[0]!.count).toBe(2);
    expect(ents[0]!.x).toBeCloseTo(pos.x, 6);
    expect(ents[0]!.y).toBeCloseTo(pos.y + 0.5, 6);
    expect(ents[0]!.z).toBeCloseTo(pos.z, 6);
    // A stale second death is not consumed -> no second drop.
    o.sink(witch, { typeKey: 'witch', ...pos });
    expect(o.drops).toHaveLength(1);
  });

  it('player melee kills route death info through onRaiderDied and drop loot', () => {
    const o = new Owner();
    o.start(3);
    const witch = o.idsOf('witch')[0]!;
    const e = o.manager.get(witch)!;
    const player = { x: e.transform.x, y: e.transform.y, z: e.transform.z };
    // Leave the witch one melee hit from death, standing on it so it is nearest.
    o.combat.damageRaider(witch, 26 - PLAYER_RAID_MELEE_DAMAGE / 2, o.sink);
    expect(o.drops).toHaveLength(0);
    o.melee(player);
    expect(o.manager.get(witch)?.state).not.toBe('ACTIVE');
    expect(o.drops).toHaveLength(1);
    expect(o.drops[0]!.death.typeKey).toBe('witch');
  });

  it('pillagers, vindicators and ravagers drop nothing', () => {
    const o = new Owner();
    o.start(3);
    const others = o.controller.getRaidWaveEntityIds().filter((id) => o.kindOf(id) !== 'witch');
    expect(others.length).toBeGreaterThan(0);
    for (const id of others) o.combat.damageRaider(id, 10_000, o.sink);
    expect(o.drops).toHaveLength(0);
    expect(o.items.size).toBe(0);
  });

  it('the dropped gunpowder is collected through the real pickup path after the delay', () => {
    const o = new Owner();
    o.start(3);
    const witch = o.idsOf('witch')[0]!;
    o.combat.damageRaider(witch, 10_000, o.sink);
    const ent = o.items.getItemEntities()[0]!;
    const inv = new Map<number, number>();
    const insert = (id: number, count: number): number => {
      inv.set(id, (inv.get(id) ?? 0) + count);
      return 0;
    };
    expect(o.items.collectPlayerDrops(ent.x, ent.y, ent.z, insert)).toBe(0); // pickup delay
    o.items.tickItemEntities(0.5); // 10 ticks
    expect(o.items.collectPlayerDrops(ent.x, ent.y, ent.z, insert)).toBe(2);
    expect(inv.get(ItemId.Gunpowder)).toBe(2);
    expect(o.items.size).toBe(0);
  });

  it('witch drops under Math.random only ever contain present table items', () => {
    for (let i = 0; i < 40; i++) {
      const o = new Owner();
      o.dropRandom = Math.random;
      o.start(3);
      for (const id of o.idsOf('witch')) o.combat.damageRaider(id, 10_000, o.sink);
      for (const d of o.drops) {
        for (const s of d.stacks) expect([ItemId.Gunpowder, ItemId.Redstone, ItemId.Stick]).toContain(s.item);
      }
    }
  });
});

describe('Game wiring source guards (297)', () => {
  const src = readFileSync(resolve(__dirname, '../../src/engine/Game.ts'), 'utf8');

  it('every raid death site drops loot only when the death is consumed', () => {
    const sites = src.match(/if \(this\.onRaidEntityRemoved\(\w+\)\) this\.dropRaiderLoot\(death\);/g) ?? [];
    expect(sites).toHaveLength(3); // melee tick, splash harming, debugDamageRaidEntity
    expect(src).not.toMatch(/damageRaider\([^)]*\(id\) => \{\s*this\.onRaidEntityRemoved\(id\);/);
  });

  it('witch-only loot via the injectable drop rng and spawnLootStacks', () => {
    expect(src).toContain("if (death.typeKey !== 'witch') return;");
    expect(src).toContain('resolveMobGunpowderDrops(death.typeKey, this.itemRegistry, this.mobDropRandom, 0)');
    expect(src).toContain('this.itemEntities.spawnLootStacks(stacks, death.x, death.y + 0.5, death.z, Math.random)');
  });

  it('testGrantSplashPotion is documented test-only and no longer claims splash is unobtainable', () => {
    expect(src).not.toContain('no gunpowder / splash brewing exists');
    expect(src).toMatch(/Test-only: survival players\s+\* obtain splash potions by brewing a potion with gunpowder/);
  });
});
