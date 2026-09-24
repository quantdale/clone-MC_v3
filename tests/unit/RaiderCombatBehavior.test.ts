import { describe, expect, it } from 'vitest';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import { EntityManager } from '../../src/simulation/EntityManager';
import { CollisionResolver, type ShapeWorld } from '../../src/world/CollisionResolver';
import { VoxelShape } from '../../src/world/VoxelShape';
import {
  forceRaidDefeat,
  raiderCombatProfile,
  raiderCombatRole,
  RaiderCombatSystem,
  WITCH_RANGED_FALLBACK_DAMAGE,
  RAIDER_PROJECTILE_CAP,
  PLAYER_RAID_MELEE_DAMAGE,
} from '../../src/simulation/RaiderCombatBehavior';
import { startRaid, type RaidState } from '../../src/simulation/RaidStateMachine';

const emptyWorld: ShapeWorld = {
  getCollisionShape: () => VoxelShape.EMPTY,
};

describe('RaiderCombatBehavior pure helpers', () => {
  it('maps roles for the four raid type keys', () => {
    expect(raiderCombatRole('pillager')).toBe('RANGED');
    expect(raiderCombatRole('witch')).toBe('RANGED');
    expect(raiderCombatRole('vindicator')).toBe('MELEE');
    expect(raiderCombatRole('ravager')).toBe('MELEE');
    expect(raiderCombatRole('unknown')).toBe('MELEE');
  });

  it('pins witch fallback damage and registry melee damages', () => {
    expect(raiderCombatProfile('witch', 0).baseDamage).toBe(WITCH_RANGED_FALLBACK_DAMAGE);
    expect(raiderCombatProfile('witch', 0).role).toBe('RANGED');
    expect(raiderCombatProfile('vindicator', 6).baseDamage).toBe(6);
    expect(raiderCombatProfile('ravager', 12).baseDamage).toBe(12);
    expect(raiderCombatProfile('pillager', 4).role).toBe('RANGED');
  });

  it('forceRaidDefeat only flips ACTIVE', () => {
    const active = startRaid(0, 64, 0, 1);
    const defeated = forceRaidDefeat(active);
    expect(defeated.status).toBe('DEFEAT');
    expect(defeated.raidersRemaining).toBe(active.raidersRemaining);
    const again = forceRaidDefeat(defeated);
    expect(again).toEqual(defeated);
    const victory: RaidState = { ...active, status: 'VICTORY' };
    expect(forceRaidDefeat(victory)).toEqual(victory);
  });
});

describe('RaiderCombatSystem', () => {
  const registry = createDefaultEntityRegistry();
  const dimension = createResourceId('minecraft', 'overworld');
  const resolver = new CollisionResolver();

  function spawn(typeKey: string, x = 0, y = 64, z = 0) {
    const manager = new EntityManager(registry);
    const def = registry.getByKey(typeKey)!;
    const entity = manager.spawn(def.id, dimension, { x, y, z, yaw: 0, pitch: 0 });
    const system = new RaiderCombatSystem({ manager, registry });
    return { manager, system, entity };
  }

  it('melee vindicator damages the player once then respects invulnerability', () => {
    const { system, entity } = spawn('vindicator', 0, 64, 0);
    const hits: number[] = [];
    const tick = (simTick: number) =>
      system.tick({
        dt: 0.05,
        simTick,
        paused: false,
        center: { x: 0, y: 64, z: 0 },
        trackedIds: [entity.id],
        getPlayerTarget: () => ({ x: 0.5, y: 64, z: 0.5 }),
        world: emptyWorld,
        resolver,
        onPlayerDamaged: (amount) => hits.push(amount),
        onRaiderDied: () => undefined,
        playerMeleeRequested: false,
      });
    tick(1);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]).toBeGreaterThan(0);
    const afterFirst = hits.length;
    tick(2); // within invuln / cooldown
    expect(hits.length).toBe(afterFirst);
  });

  it('homes toward raid center when player target is null', () => {
    const { system, entity, manager } = spawn('vindicator', 10, 64, 0);
    system.tick({
      dt: 0.05,
      simTick: 1,
      paused: false,
      center: { x: 0, y: 64, z: 0 },
      trackedIds: [entity.id],
      getPlayerTarget: () => null,
      world: emptyWorld,
      resolver,
      onPlayerDamaged: () => {
        throw new Error('must not damage');
      },
      onRaiderDied: () => undefined,
      playerMeleeRequested: false,
    });
    const after = manager.get(entity.id)!;
    expect(after.transform.x).toBeLessThan(10);
  });

  it('pause freezes motion and damage', () => {
    const { system, entity, manager } = spawn('vindicator', 0, 64, 0);
    const before = { ...manager.get(entity.id)!.transform };
    let hits = 0;
    system.tick({
      dt: 0.05,
      simTick: 1,
      paused: true,
      center: { x: 0, y: 64, z: 0 },
      trackedIds: [entity.id],
      getPlayerTarget: () => ({ x: 0.5, y: 64, z: 0.5 }),
      world: emptyWorld,
      resolver,
      onPlayerDamaged: () => {
        hits++;
      },
      onRaiderDied: () => undefined,
      playerMeleeRequested: false,
    });
    expect(hits).toBe(0);
    const after = manager.get(entity.id)!.transform;
    expect(after.x).toBe(before.x);
    expect(after.z).toBe(before.z);
  });

  it('damageRaider kills once and invokes onDied', () => {
    const { system, entity, manager } = spawn('pillager');
    let deaths = 0;
    const first = system.damageRaider(entity.id, 1000, () => {
      deaths++;
    });
    expect(first.died).toBe(true);
    expect(deaths).toBe(1);
    expect(manager.get(entity.id)?.state).toBe('REMOVED');
    const second = system.damageRaider(entity.id, 1000, () => {
      deaths++;
    });
    expect(second.died).toBe(false);
    expect(deaths).toBe(1);
  });

  it('player melee request damages nearest raider', () => {
    const { system, entity } = spawn('witch', 1, 64, 0);
    let died = false;
    system.tick({
      dt: 0.05,
      simTick: 10,
      paused: false,
      center: { x: 0, y: 64, z: 0 },
      trackedIds: [entity.id],
      getPlayerTarget: () => ({ x: 0, y: 64, z: 0 }),
      world: emptyWorld,
      resolver,
      onPlayerDamaged: () => undefined,
      onRaiderDied: () => {
        died = true;
      },
      playerMeleeRequested: true,
    });
    // One hit of PLAYER_RAID_MELEE_DAMAGE may not kill witch (26 hp)
    expect(system.getRaiderHealth(entity.id)).toBe(26 - PLAYER_RAID_MELEE_DAMAGE);
    expect(died).toBe(false);
    // Finish it off
    for (let t = 20; t < 200 && !died; t += 10) {
      system.tick({
        dt: 0.05,
        simTick: t,
        paused: false,
        center: { x: 0, y: 64, z: 0 },
        trackedIds: died ? [] : [entity.id],
        getPlayerTarget: () => ({ x: 0, y: 64, z: 0 }),
        world: emptyWorld,
        resolver,
        onPlayerDamaged: () => undefined,
        onRaiderDied: () => {
          died = true;
        },
        playerMeleeRequested: true,
      });
    }
    expect(died).toBe(true);
  });

  it('pillager eventually fires a projectile that can hit the player', () => {
    const { system, entity } = spawn('pillager', 0, 64, 0);
    const hits: number[] = [];
    for (let t = 1; t <= 120; t++) {
      system.tick({
        dt: 0.05,
        simTick: t,
        paused: false,
        center: { x: 0, y: 64, z: 0 },
        trackedIds: [entity.id],
        getPlayerTarget: () => ({ x: 3, y: 64, z: 0 }),
        world: emptyWorld,
        resolver,
        onPlayerDamaged: (amount) => hits.push(amount),
        onRaiderDied: () => undefined,
        playerMeleeRequested: false,
      });
      expect(system.getProjectileCount()).toBeLessThanOrEqual(RAIDER_PROJECTILE_CAP);
    }
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toBeGreaterThan(0);
  });

  it('witch projectile uses fallback damage', () => {
    const { system, entity } = spawn('witch', 0, 64, 0);
    const hits: number[] = [];
    for (let t = 1; t <= 100; t++) {
      system.tick({
        dt: 0.05,
        simTick: t,
        paused: false,
        center: { x: 0, y: 64, z: 0 },
        trackedIds: [entity.id],
        getPlayerTarget: () => ({ x: 3, y: 64, z: 0 }),
        world: emptyWorld,
        resolver,
        onPlayerDamaged: (amount) => hits.push(amount),
        onRaiderDied: () => undefined,
        playerMeleeRequested: false,
      });
    }
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toBe(WITCH_RANGED_FALLBACK_DAMAGE);
  });

  it('clear drops projectiles and health tracking', () => {
    const { system, entity } = spawn('pillager');
    system.damageRaider(entity.id, 1, () => undefined);
    expect(system.getRaiderHealth(entity.id)).toBeDefined();
    system.clear();
    expect(system.getProjectileCount()).toBe(0);
    expect(system.getRaiderHealth(entity.id)).toBeUndefined();
  });
});
