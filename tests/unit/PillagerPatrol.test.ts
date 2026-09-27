import { describe, expect, it } from 'vitest';
import { createDefaultEntityRegistry } from '../../src/data/EntityType';
import { createResourceId } from '../../src/data/ResourceId';
import { EntityManager } from '../../src/simulation/EntityManager';
import {
  createRecordingRaidBackend,
  type RaidEntityBackend,
} from '../../src/simulation/RaidEntityBackend';
import {
  decidePatrolAttempt,
  nextPatrolCooldown,
  PATROL_ANCHOR_TRIES,
  PATROL_ATTEMPT_INTERVAL_TICKS,
  PATROL_ATTEMPT_JITTER_TICKS,
  PATROL_DESPAWN_DISTANCE,
  PATROL_MAX_SIZE,
  PATROL_MIN_SIZE,
  PATROL_MIN_WORLD_TICKS,
  PATROL_TYPE_KEY,
  PillagerPatrolSystem,
  type PatrolAttemptContext,
  type PatrolAttemptDecision,
  type PatrolRng,
  type PatrolTickInput,
} from '../../src/simulation/PillagerPatrol';
import { createNamedRng, SeedRng } from '../../src/simulation/SeedRng';
import { CollisionResolver, type ShapeWorld } from '../../src/world/CollisionResolver';
import { VoxelShape } from '../../src/world/VoxelShape';

const registry = createDefaultEntityRegistry();
const dimension = createResourceId('minecraft', 'overworld');
const resolver = new CollisionResolver();
/** Solid floor below y=64 so patrol pillagers stand on the surface. */
const floorWorld: ShapeWorld = {
  getCollisionShape: (_x: number, y: number) => (y < 64 ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY),
};

function ctx(overrides: Partial<PatrolAttemptContext> = {}): PatrolAttemptContext {
  return {
    doMobSpawning: true,
    difficulty: 'normal',
    spectator: false,
    worldTicks: PATROL_MIN_WORLD_TICKS,
    dayTick: 1000,
    raidActive: false,
    patrolAlive: false,
    nearVillage: false,
    playerX: 0.5,
    playerY: 64,
    playerZ: 0.5,
    surfaceY: () => 64,
    ...overrides,
  };
}

/** RNG whose first draw is scripted (chance), then delegates to a seeded stream. */
function scriptedRng(first: number[], seed = 7): PatrolRng & { draws: number } {
  const inner = new SeedRng(seed);
  const queue = [...first];
  const rng = {
    draws: 0,
    nextInt(n: number): number {
      rng.draws++;
      if (queue.length > 0) return queue.shift()! % n;
      return inner.nextInt(n);
    },
    nextBoolean(): boolean {
      rng.draws++;
      return inner.nextBoolean();
    },
    nextFloat(): number {
      rng.draws++;
      return inner.nextFloat();
    },
  };
  return rng;
}

function newSystem(seed = 1234, backend?: RaidEntityBackend) {
  const manager = new EntityManager(registry);
  const system = new PillagerPatrolSystem({
    manager,
    registry,
    dimension,
    rng: createNamedRng(seed, 'pillager-patrol'),
    backend,
  });
  return { manager, system };
}

function tickInput(
  context: () => PatrolAttemptContext,
  overrides: Partial<PatrolTickInput> = {},
): PatrolTickInput {
  return {
    context,
    simTick: 0,
    dt: 0.05,
    playerX: 0.5,
    playerZ: 0.5,
    getPlayerTarget: () => null,
    world: floorWorld,
    resolver,
    onPlayerDamaged: () => undefined,
    playerMeleeRequested: false,
    onCaptainKilled: () => undefined,
    ...overrides,
  };
}

describe('PillagerPatrol gates (291)', () => {
  const cases: Array<[Partial<PatrolAttemptContext>, string]> = [
    [{ playerX: Number.NaN }, 'INVALID_PLAYER'],
    [{ doMobSpawning: false }, 'DISABLED'],
    [{ difficulty: 'peaceful' }, 'PEACEFUL'],
    [{ spectator: true }, 'SPECTATOR'],
    [{ raidActive: true }, 'RAID_ACTIVE'],
    [{ patrolAlive: true }, 'PATROL_ALIVE'],
    [{ worldTicks: PATROL_MIN_WORLD_TICKS - 1 }, 'WORLD_TOO_YOUNG'],
    [{ worldTicks: Number.NaN }, 'WORLD_TOO_YOUNG'],
    [{ dayTick: 13000 }, 'NIGHT'],
    [{ nearVillage: true }, 'NEAR_VILLAGE'],
  ];
  for (const [over, reason] of cases) {
    it(`single failing gate → ${reason} with no RNG draws`, () => {
      const rng = scriptedRng([]);
      const d = decidePatrolAttempt(ctx(over), rng);
      expect(d).toEqual({ kind: 'SKIP', reason });
      expect(rng.draws).toBe(0);
    });
  }

  it('precedence: DISABLED beats PEACEFUL and NIGHT', () => {
    const d = decidePatrolAttempt(
      ctx({ doMobSpawning: false, difficulty: 'peaceful', dayTick: 13000 }),
      scriptedRng([]),
    );
    expect(d).toEqual({ kind: 'SKIP', reason: 'DISABLED' });
  });

  it('precedence: RAID_ACTIVE beats WORLD_TOO_YOUNG and NEAR_VILLAGE', () => {
    const d = decidePatrolAttempt(
      ctx({ raidActive: true, worldTicks: 0, nearVillage: true }),
      scriptedRng([]),
    );
    expect(d).toEqual({ kind: 'SKIP', reason: 'RAID_ACTIVE' });
  });

  it('fresh world is too young and the stream is untouched', () => {
    const a = createNamedRng(99, 'pillager-patrol');
    const b = createNamedRng(99, 'pillager-patrol');
    expect(decidePatrolAttempt(ctx({ worldTicks: 100 }), a)).toEqual({
      kind: 'SKIP',
      reason: 'WORLD_TOO_YOUNG',
    });
    expect(a.next()).toBe(b.next());
  });

  it('night boundary: 12541 day, 12542 night, 23459 night, 23460 day', () => {
    const always = (): PatrolRng => scriptedRng([0]);
    expect(decidePatrolAttempt(ctx({ dayTick: 12541 }), always()).kind).toBe('SPAWN');
    expect(decidePatrolAttempt(ctx({ dayTick: 12542 }), always())).toEqual({ kind: 'SKIP', reason: 'NIGHT' });
    expect(decidePatrolAttempt(ctx({ dayTick: 23459 }), always())).toEqual({ kind: 'SKIP', reason: 'NIGHT' });
    expect(decidePatrolAttempt(ctx({ dayTick: 23460 }), always()).kind).toBe('SPAWN');
  });
});

describe('PillagerPatrol chance/position/group (291)', () => {
  it('non-zero chance draw → CHANCE after exactly one draw', () => {
    const rng = scriptedRng([3]);
    expect(decidePatrolAttempt(ctx(), rng)).toEqual({ kind: 'SKIP', reason: 'CHANCE' });
    expect(rng.draws).toBe(1);
  });

  it('no loaded surface → NO_SURFACE after exactly 4 probes', () => {
    let probes = 0;
    const d = decidePatrolAttempt(
      ctx({
        surfaceY: () => {
          probes++;
          return null;
        },
      }),
      scriptedRng([0]),
    );
    expect(d).toEqual({ kind: 'SKIP', reason: 'NO_SURFACE' });
    expect(probes).toBe(PATROL_ANCHOR_TRIES);
  });

  it('throwing surface probe is treated as no surface', () => {
    const d = decidePatrolAttempt(
      ctx({
        surfaceY: () => {
          throw new Error('probe');
        },
      }),
      scriptedRng([0]),
    );
    expect(d).toEqual({ kind: 'SKIP', reason: 'NO_SURFACE' });
  });

  it('anchor offsets are in [24, 47] per axis; sizes in [2, 4]; exactly one captain first', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const px = seed * 3 + 0.25;
      const pz = -seed * 5 + 0.75;
      const d = decidePatrolAttempt(ctx({ playerX: px, playerZ: pz }), new SeedRng(seed), {
        force: true,
      });
      expect(d.kind).toBe('SPAWN');
      if (d.kind !== 'SPAWN') continue;
      const dx = Math.abs(d.anchorX - 0.5 - Math.floor(px));
      const dz = Math.abs(d.anchorZ - 0.5 - Math.floor(pz));
      expect(dx).toBeGreaterThanOrEqual(24);
      expect(dx).toBeLessThanOrEqual(47);
      expect(dz).toBeGreaterThanOrEqual(24);
      expect(dz).toBeLessThanOrEqual(47);
      expect(d.members.length).toBeGreaterThanOrEqual(PATROL_MIN_SIZE);
      expect(d.members.length).toBeLessThanOrEqual(PATROL_MAX_SIZE);
      expect(d.members.filter((m) => m.captain)).toHaveLength(1);
      expect(d.members[0]!.captain).toBe(true);
      expect(d.members[0]!.x).toBe(d.anchorX);
      expect(d.members[0]!.z).toBe(d.anchorZ);
      for (const m of d.members.slice(1)) {
        expect(Math.abs(m.x - d.anchorX)).toBeLessThanOrEqual(4);
        expect(Math.abs(m.z - d.anchorZ)).toBeLessThanOrEqual(4);
      }
    }
  });

  it('all sizes 2, 3 and 4 occur across seeds', () => {
    const sizes = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const d = decidePatrolAttempt(ctx(), new SeedRng(seed), { force: true });
      if (d.kind === 'SPAWN') sizes.add(d.members.length);
    }
    expect([...sizes].sort()).toEqual([2, 3, 4]);
  });

  it('invalid member surfaces shrink the group but keep the captain', () => {
    let anchorKey: string | null = null;
    const d = decidePatrolAttempt(
      ctx({
        surfaceY: (x, z) => {
          if (anchorKey === null) anchorKey = `${x},${z}`;
          return `${x},${z}` === anchorKey ? 70 : null;
        },
      }),
      new SeedRng(5),
      { force: true },
    );
    expect(d.kind).toBe('SPAWN');
    if (d.kind === 'SPAWN') {
      expect(d.members).toHaveLength(1);
      expect(d.members[0]!.captain).toBe(true);
      expect(d.members[0]!.y).toBe(70);
    }
  });

  it('force keeps DISABLED/PEACEFUL/SPECTATOR but bypasses age/night/village/chance', () => {
    expect(decidePatrolAttempt(ctx({ doMobSpawning: false }), new SeedRng(1), { force: true })).toEqual({
      kind: 'SKIP',
      reason: 'DISABLED',
    });
    const d = decidePatrolAttempt(
      ctx({ worldTicks: 0, dayTick: 15000, nearVillage: true, raidActive: true }),
      new SeedRng(1),
      { force: true },
    );
    expect(d.kind).toBe('SPAWN');
  });

  it('cooldown is in [6000, 6599]', () => {
    const rng = new SeedRng(42);
    for (let i = 0; i < 500; i++) {
      const c = nextPatrolCooldown(rng);
      expect(c).toBeGreaterThanOrEqual(PATROL_ATTEMPT_INTERVAL_TICKS);
      expect(c).toBeLessThan(PATROL_ATTEMPT_INTERVAL_TICKS + PATROL_ATTEMPT_JITTER_TICKS);
    }
  });
});

describe('PillagerPatrol determinism (291)', () => {
  function run(seed: number): PatrolAttemptDecision[] {
    const { system } = newSystem(seed);
    const out: PatrolAttemptDecision[] = [system.snapshot().cooldownTicks as unknown as PatrolAttemptDecision];
    for (let i = 0; i < 20; i++) {
      out.push(system.runAttempt(ctx({ playerX: i * 2 + 0.5 })));
      system.clear('replace');
      out.push(system.snapshot().cooldownTicks as unknown as PatrolAttemptDecision);
    }
    return out;
  }

  it('same seed → identical cooldowns and decisions; different seed differs', () => {
    expect(run(1234)).toEqual(run(1234));
    expect(run(1234)).not.toEqual(run(4321));
  });
});

describe('PillagerPatrolSystem rate limit and roster (291)', () => {
  it('ticks 30000 times: ≤5 natural attempts, gaps in [6000, 6599], ≤1 live patrol', () => {
    const { system } = newSystem(77);
    const attemptTicks: number[] = [];
    let lastAttempts = 0;
    for (let t = 1; t <= 30000; t++) {
      system.tick(tickInput(() => ctx(), { simTick: t }));
      const snap = system.snapshot();
      if (snap.attempts !== lastAttempts) {
        attemptTicks.push(t);
        lastAttempts = snap.attempts;
      }
      expect(snap.captainId === null ? 0 : 1).toBeLessThanOrEqual(1);
      expect(snap.memberIds.length).toBeLessThanOrEqual(PATROL_MAX_SIZE);
    }
    expect(attemptTicks.length).toBeGreaterThanOrEqual(4);
    expect(attemptTicks.length).toBeLessThanOrEqual(5);
    expect(attemptTicks[0]!).toBeGreaterThanOrEqual(PATROL_ATTEMPT_INTERVAL_TICKS);
    for (let i = 1; i < attemptTicks.length; i++) {
      const gap = attemptTicks[i]! - attemptTicks[i - 1]!;
      expect(gap).toBeGreaterThanOrEqual(PATROL_ATTEMPT_INTERVAL_TICKS);
      expect(gap).toBeLessThan(PATROL_ATTEMPT_INTERVAL_TICKS + PATROL_ATTEMPT_JITTER_TICKS);
    }
  });

  it('context is built lazily only when an attempt is due', () => {
    const { system } = newSystem(3);
    let built = 0;
    const cooldown = system.getCooldownTicks();
    for (let t = 1; t < cooldown; t++) {
      system.tick(tickInput(() => {
        built++;
        return ctx();
      }));
    }
    expect(built).toBe(0);
    system.tick(tickInput(() => {
      built++;
      return ctx();
    }));
    expect(built).toBe(1);
  });

  it('a live patrol makes the next natural attempt skip PATROL_ALIVE', () => {
    const { system } = newSystem(11);
    const spawned = system.forceSpawn(ctx());
    expect(spawned.kind).toBe('SPAWN');
    expect(system.runAttempt(ctx())).toEqual({ kind: 'SKIP', reason: 'PATROL_ALIVE' });
  });

  it('forceSpawn does not alter the cooldown and replaces an older patrol', () => {
    const { system, manager } = newSystem(12);
    const before = system.getCooldownTicks();
    system.forceSpawn(ctx());
    const firstIds = system.getMemberIds();
    system.forceSpawn(ctx());
    expect(system.getCooldownTicks()).toBe(before);
    for (const id of firstIds) expect(manager.get(id)?.state === 'ACTIVE').toBe(false);
    expect(system.snapshot().generation).toBe(2);
  });

  it('spawns pillagers through the backend with exactly one captain', () => {
    const backend = createRecordingRaidBackend();
    const { system } = newSystem(13, backend);
    const d = system.forceSpawn(ctx());
    expect(d.kind).toBe('SPAWN');
    expect(backend.spawns.length).toBe(system.getMemberIds().length);
    expect(backend.spawns.every((s) => s.typeKey === PATROL_TYPE_KEY)).toBe(true);
    expect(system.getCaptainId()).toBe(system.getMemberIds()[0]);
  });

  it('partial spawn failure rolls back the whole patrol', () => {
    let checked = 0;
    for (let seed = 1; seed < 60 && checked < 5; seed++) {
      const backend = createRecordingRaidBackend({ failSpawnAfter: 1 });
      const { system } = newSystem(seed, backend);
      const d = system.forceSpawn(ctx());
      if (d.kind !== 'SPAWN' || d.members.length < 2) continue;
      checked++;
      expect(system.snapshot().lastApplyOk).toBe(false);
      expect(system.getMemberIds()).toEqual([]);
      expect(system.getCaptainId()).toBeNull();
      expect(backend.spawns.length).toBe(1);
      expect(backend.despawns.length).toBe(1);
      expect(system.snapshot().generation).toBe(0);
    }
    expect(checked).toBe(5);
  });
});

describe('PillagerPatrolSystem deaths and despawn (291)', () => {
  it('non-captain death does not call omen; captain death calls exactly once; duplicates no-op', () => {
    const { system } = newSystem(21);
    let omen = 0;
    const grant = (): void => {
      omen++;
    };
    // Ensure ≥2 members by retrying forced spawns.
    let guard = 0;
    while (system.getMemberIds().length < 2 && guard++ < 50) system.forceSpawn(ctx());
    const captain = system.getCaptainId()!;
    const other = system.getMemberIds().find((id) => id !== captain)!;
    expect(system.damageMember(other, 10_000, grant)).toBe(true);
    expect(omen).toBe(0);
    expect(system.damageMember(captain, 10_000, grant)).toBe(true);
    expect(omen).toBe(1);
    expect(system.damageMember(captain, 10_000, grant)).toBe(false);
    expect(system.consumeDeath(captain)).toEqual({ member: false, captain: false });
    expect(omen).toBe(1);
  });

  it('captain death with survivors keeps the patrol alive without a captain', () => {
    const { system } = newSystem(22);
    let guard = 0;
    while (system.getMemberIds().length < 2 && guard++ < 50) system.forceSpawn(ctx());
    system.damageMember(system.getCaptainId()!, 10_000, () => undefined);
    expect(system.isAlive()).toBe(true);
    expect(system.getCaptainId()).toBeNull();
  });

  it('members beyond 128 blocks despawn without granting omen', () => {
    const { system, manager } = newSystem(23);
    system.forceSpawn(ctx());
    const ids = system.getMemberIds();
    expect(ids.length).toBeGreaterThan(0);
    let omen = 0;
    system.tick(
      tickInput(() => ctx(), {
        playerX: PATROL_DESPAWN_DISTANCE + 200,
        playerZ: PATROL_DESPAWN_DISTANCE + 200,
        onCaptainKilled: () => {
          omen++;
        },
      }),
    );
    expect(system.getMemberIds()).toEqual([]);
    expect(omen).toBe(0);
    for (const id of ids) expect(manager.get(id)?.state === 'ACTIVE').toBe(false);
  });

  it('clear removes every member and grants nothing', () => {
    const { system, manager } = newSystem(24);
    system.forceSpawn(ctx());
    const ids = system.getMemberIds();
    system.clear('raid-start');
    expect(system.isAlive()).toBe(false);
    for (const id of ids) expect(manager.get(id)?.state === 'ACTIVE').toBe(false);
  });

  it('reused 288 pillager combat damages the player with reason pillager', () => {
    const { system, manager } = newSystem(25);
    system.forceSpawn(ctx());
    const captain = manager.get(system.getCaptainId()!)!;
    const player = { x: captain.transform.x + 8, y: 64, z: captain.transform.z };
    const reasons: string[] = [];
    for (let t = 1; t <= 120; t++) {
      system.tickCombat({
        simTick: t,
        dt: 0.05,
        playerX: player.x,
        playerZ: player.z,
        getPlayerTarget: () => player,
        world: floorWorld,
        resolver,
        onPlayerDamaged: (_amount, _sx, _sz, reason) => reasons.push(reason),
        playerMeleeRequested: false,
        onCaptainKilled: () => undefined,
      });
    }
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.every((r) => r === 'pillager')).toBe(true);
  });

  it('player melee through combat kills the captain and fires the omen callback once', () => {
    const { system, manager } = newSystem(26);
    system.forceSpawn(ctx());
    const captainId = system.getCaptainId()!;
    const captain = manager.get(captainId)!;
    const player = { x: captain.transform.x, y: captain.transform.y, z: captain.transform.z };
    let omen = 0;
    for (let t = 1; t <= 400 && system.getCaptainId() !== null; t++) {
      // Keep the player on top of the captain so it is always the nearest member.
      const c = manager.get(captainId);
      if (c) {
        player.x = c.transform.x;
        player.y = c.transform.y;
        player.z = c.transform.z;
      }
      system.tickCombat({
        simTick: t,
        dt: 0.05,
        playerX: player.x,
        playerZ: player.z,
        getPlayerTarget: () => player,
        world: floorWorld,
        resolver,
        onPlayerDamaged: () => undefined,
        playerMeleeRequested: true,
        onCaptainKilled: () => {
          omen++;
        },
      });
    }
    expect(system.getCaptainId()).toBeNull();
    expect(omen).toBe(1);
  });
});
