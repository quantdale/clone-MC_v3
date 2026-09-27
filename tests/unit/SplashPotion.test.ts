import { describe, expect, it } from 'vitest';
import { CollisionResolver, type ShapeWorld } from '../../src/world/CollisionResolver';
import { VoxelShape } from '../../src/world/VoxelShape';
import { createPotionContents, type PotionContents } from '../../src/data/PotionItemData';
import {
  SPLASH_POTION_CAP,
  SPLASH_POTION_MAX_AGE_TICKS,
  SplashPotionSystem,
  chooseWitchPotion,
  isInstantDamageEffect,
  isInstantHealthEffect,
  isThrowableSplash,
  playerPotionSpawn,
  playerPotionThrowVelocity,
  resolveSplashApplication,
  splashIntensity,
  splashScope,
  splashThrowDecision,
  witchPotionContents,
  witchPotionRoll,
  witchPotionSpawn,
  witchPotionThrowVelocity,
  type SplashTarget,
} from '../../src/simulation/SplashPotion';

const resolver = new CollisionResolver();
const emptyWorld: ShapeWorld = { getCollisionShape: () => VoxelShape.EMPTY };
const floorWorld: ShapeWorld = {
  getCollisionShape: (_x: number, y: number) => (y < 64 ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY),
};

function splash(typeKey: string, duration = 45, amplifier = 0, kind: 'SPLASH' | 'NORMAL' | 'LINGERING' = 'SPLASH'): PotionContents {
  return createPotionContents({ kind, customEffects: [{ typeId: `minecraft:effect/${typeKey}`, duration, amplifier }] });
}

const player = (x = 0, y = 64, z = 0): SplashTarget => ({ kind: 'player', entityId: -1, x, y, z, height: 1.8 });
const raider = (id: number, x: number, y = 64, z = 0): SplashTarget => ({ kind: 'raid', entityId: id, x, y, z, height: 1.95 });

function runUntilShatter(sys: SplashPotionSystem, world: ShapeWorld, targets: SplashTarget[], max = 200) {
  for (let i = 0; i < max; i++) {
    const out = sys.tick(world, resolver, targets);
    if (out.length > 0) return { shatter: out[0]!, ticks: i + 1 };
  }
  return { shatter: null, ticks: max };
}

describe('SplashPotion throw vectors', () => {
  it('player level throw lifts only the vertical component by 20° at speed 0.5', () => {
    const v = playerPotionThrowVelocity(0, 0)!;
    expect(Math.hypot(v.vx, v.vy, v.vz)).toBeCloseTo(0.5, 9);
    expect(v.vx).toBeCloseTo(0, 9);
    expect(v.vz).toBeLessThan(0); // yaw 0 faces −Z
    expect(v.vy / -v.vz).toBeCloseTo(Math.sin((20 * Math.PI) / 180), 9);
    const east = playerPotionThrowVelocity(-Math.PI / 2, 0)!;
    expect(east.vx).toBeGreaterThan(0);
  });

  it('looking straight down throws straight down (self splash)', () => {
    const v = playerPotionThrowVelocity(0.7, -Math.PI / 2)!;
    expect(v.vy).toBeCloseTo(-0.5, 9);
    expect(Math.abs(v.vx)).toBeLessThan(1e-9);
    expect(Math.abs(v.vz)).toBeLessThan(1e-9);
  });

  it('non-finite inputs are refused', () => {
    expect(playerPotionThrowVelocity(Number.NaN, 0)).toBeNull();
    expect(witchPotionThrowVelocity({ x: 0, y: 0, z: 0 }, { x: Number.POSITIVE_INFINITY, y: 0, z: 0 })).toBeNull();
  });

  it('spawn points sit at eye height − 0.1', () => {
    expect(playerPotionSpawn(1, 64, 2)).toEqual({ x: 1, y: 64 + 1.62 - 0.1, z: 2 });
    expect(witchPotionSpawn(1, 64, 2)).toEqual({ x: 1, y: 64 + 1.62 - 0.1, z: 2 });
  });

  it('witch aim is (dx, dy + 0.2·d3, dz) toward the target eye − 1.1 at speed 0.75', () => {
    const v = witchPotionThrowVelocity({ x: 0, y: 64, z: 0 }, { x: 3, y: 64, z: 4 })!;
    const d3 = 5;
    const ay = 1.62 - 1.1 + 0.2 * d3;
    const len = Math.hypot(3, ay, 4);
    expect(v.vx).toBeCloseTo((3 / len) * 0.75, 9);
    expect(v.vy).toBeCloseTo((ay / len) * 0.75, 9);
    expect(v.vz).toBeCloseTo((4 / len) * 0.75, 9);
  });
});

describe('SplashPotionSystem flight and shatter', () => {
  it('flies a gravity arc with drag through ProjectileCore', () => {
    const sys = new SplashPotionSystem();
    sys.spawn({ x: 0, y: 100, z: 0, velocity: { vx: 0.5, vy: 0, vz: 0 }, contents: splash('speed'), thrower: 'player', owner: null });
    sys.tick(emptyWorld, resolver, []);
    const s1 = sys.getPotions()[0]!.state;
    expect(s1.x).toBeCloseTo(0.5, 9);
    expect(s1.y).toBeCloseTo(100 - 0.05, 9);
    expect(s1.vy).toBeCloseTo(-0.05 * 0.99, 9);
    expect(s1.vx).toBeCloseTo(0.5 * 0.99, 9);
    sys.tick(emptyWorld, resolver, []);
    const s2 = sys.getPotions()[0]!.state;
    expect(s2.y - s1.y).toBeLessThan(s1.y - 100); // accelerating downward
  });

  it('a level player throw lands a few blocks ahead on flat ground', () => {
    const sys = new SplashPotionSystem();
    const spawn = playerPotionSpawn(0.5, 64, 0.5);
    sys.spawn({ ...spawn, velocity: playerPotionThrowVelocity(0, 0)!, contents: splash('speed'), thrower: 'player', owner: { kind: 'player', entityId: -1 } });
    const { shatter } = runUntilShatter(sys, floorWorld, []);
    expect(shatter?.cause).toBe('block');
    expect(0.5 - shatter!.z).toBeGreaterThan(2);
    expect(0.5 - shatter!.z).toBeLessThan(10);
    expect(shatter!.y).toBeCloseTo(64.125, 6);
    expect(sys.count).toBe(0);
  });

  it('shatters on block contact and splashes the thrower at its feet (owner immunity only blocks the hit)', () => {
    const sys = new SplashPotionSystem();
    const p = player(0.5, 64, 0.5);
    const spawn = playerPotionSpawn(p.x, p.y, p.z);
    sys.spawn({ ...spawn, velocity: playerPotionThrowVelocity(0, -Math.PI / 2)!, contents: splash('poison', 45), thrower: 'player', owner: { kind: 'player', entityId: -1 } });
    const { shatter, ticks } = runUntilShatter(sys, floorWorld, [p]);
    expect(ticks).toBeLessThanOrEqual(5);
    expect(shatter!.cause).toBe('block');
    expect(shatter!.directHit).toBeNull();
    const a = shatter!.affected.find((x) => x.target.kind === 'player')!;
    expect(a.direct).toBe(false);
    expect(a.intensity).toBeCloseTo(1 - 0.125 / 4, 6);
    expect(a.application.effects[0]!.typeId).toBe('minecraft:effect/poison');
    expect(a.application.effects[0]!.durationSeconds).toBeCloseTo(Math.floor(a.intensity * 45 * 20 + 0.5) / 20, 9);
  });

  it('a direct entity hit has intensity 1 and nearby targets fall off with distance', () => {
    const sys = new SplashPotionSystem();
    const hit = raider(7, 2, 64, 0);
    const near = raider(8, 4, 64, 0);
    const far = raider(9, 9, 64, 0);
    sys.spawn({ x: 0, y: 65, z: 0, velocity: { vx: 0.5, vy: 0, vz: 0 }, contents: splash('instant_damage', 0), thrower: 'player', owner: { kind: 'player', entityId: -1 } });
    const { shatter } = runUntilShatter(sys, floorWorld, [hit, near, far]);
    expect(shatter!.cause).toBe('entity');
    expect(shatter!.directHit).toEqual(hit);
    const direct = shatter!.affected.find((a) => a.target.entityId === 7)!;
    expect(direct.intensity).toBe(1);
    expect(direct.application.damage).toBe(6);
    const n = shatter!.affected.find((a) => a.target.entityId === 8)!;
    expect(n.intensity).toBeGreaterThan(0);
    expect(n.intensity).toBeLessThan(1);
    expect(n.application.damage).toBe(Math.floor(n.intensity * 6 + 0.5));
    expect(shatter!.affected.some((a) => a.target.entityId === 9)).toBe(false);
  });

  it('owner is immune for its first ticks even when the potion starts inside its sphere', () => {
    const sys = new SplashPotionSystem();
    const w = raider(3, 0, 64, 0);
    sys.spawn({ x: 0, y: 65, z: 0, velocity: { vx: 0, vy: 0.3, vz: 0 }, contents: splash('speed'), thrower: 'player', owner: { kind: 'raid', entityId: 3 } });
    for (let i = 0; i < 5; i++) expect(sys.tick(emptyWorld, resolver, [w])).toEqual([]);
  });

  it('witch potions pass through raiders and affect only the player', () => {
    expect(splashScope('witch', [player(), raider(1, 1)]).map((t) => t.kind)).toEqual(['player']);
    const sys = new SplashPotionSystem();
    const r = raider(1, 1.5, 64, 0);
    const p = player(3, 64, 0);
    sys.spawn({ x: 0, y: 65, z: 0, velocity: { vx: 0.5, vy: 0, vz: 0 }, contents: witchPotionContents('harming'), thrower: 'witch', owner: { kind: 'raid', entityId: 2 } });
    const { shatter } = runUntilShatter(sys, floorWorld, [r, p]);
    expect(shatter!.directHit?.kind).toBe('player');
    expect(shatter!.affected.map((a) => a.target.kind)).toEqual(['player']);
    expect(shatter!.affected[0]!.application.damage).toBe(6);
  });

  it('a witch throw at a player 5 blocks away on flat ground is a direct hit (vanilla aim)', () => {
    const sys = new SplashPotionSystem();
    const p = player(5, 64, 0);
    const from = { x: 0, y: 64, z: 0 };
    sys.spawn({ ...witchPotionSpawn(0, 64, 0), velocity: witchPotionThrowVelocity(from, p)!, contents: witchPotionContents('poison'), thrower: 'witch', owner: { kind: 'raid', entityId: 1 } });
    const { shatter } = runUntilShatter(sys, floorWorld, [p]);
    expect(shatter!.cause).toBe('entity');
    expect(shatter!.directHit?.kind).toBe('player');
    expect(shatter!.affected[0]!.intensity).toBe(1);
    expect(shatter!.affected[0]!.application.effects).toEqual([{ typeId: 'minecraft:effect/poison', durationSeconds: 45, amplifier: 0 }]);
  });

  it('expires silently at the max age without splashing', () => {
    const sys = new SplashPotionSystem();
    sys.spawn({ x: 0, y: 0, z: 0, velocity: { vx: 0, vy: 0, vz: 0 }, contents: splash('speed'), thrower: 'player', owner: null });
    let shatters = 0;
    for (let i = 0; i <= SPLASH_POTION_MAX_AGE_TICKS; i++) shatters += sys.tick(emptyWorld, resolver, []).length;
    expect(shatters).toBe(0);
    expect(sys.count).toBe(0);
  });

  it('enforces the cap and refuses non-splash or non-finite spawns', () => {
    const sys = new SplashPotionSystem();
    const base = { x: 0, y: 70, z: 0, velocity: { vx: 0, vy: 0, vz: 0 }, thrower: 'player' as const, owner: null };
    for (let i = 0; i < SPLASH_POTION_CAP; i++) expect(sys.spawn({ ...base, contents: splash('speed') })).not.toBeNull();
    expect(sys.spawn({ ...base, contents: splash('speed') })).toBeNull();
    sys.clear();
    expect(sys.count).toBe(0);
    expect(sys.spawn({ ...base, contents: splash('speed', 45, 0, 'NORMAL') })).toBeNull();
    expect(sys.spawn({ ...base, contents: splash('speed', 45, 0, 'LINGERING') })).toBeNull();
    expect(sys.spawn({ ...base, x: Number.NaN, contents: splash('speed') })).toBeNull();
    expect(isThrowableSplash(splash('speed'))).toBe(true);
    expect(isThrowableSplash(splash('speed', 45, 0, 'NORMAL'))).toBe(false);
    expect(isThrowableSplash(null)).toBe(false);
  });
});

describe('Splash falloff and application', () => {
  it('intensity is 1 − dist/4 inside the radius and vertical band, else 0', () => {
    const t = player(0, 64, 0);
    expect(splashIntensity({ x: 2, y: 64, z: 0 }, t, false)).toBeCloseTo(0.5, 9);
    expect(splashIntensity({ x: 4, y: 64, z: 0 }, t, false)).toBe(0);
    expect(splashIntensity({ x: 3.99, y: 64, z: 0 }, t, false)).toBeGreaterThan(0);
    expect(splashIntensity({ x: 0, y: 61.5, z: 0 }, t, false)).toBe(0); // below the band
    expect(splashIntensity({ x: 0, y: 66, z: 0 }, t, false)).toBeCloseTo(0.5, 9);
    expect(splashIntensity({ x: 100, y: 64, z: 0 }, t, true)).toBe(1);
    expect(splashIntensity({ x: Number.NaN, y: 64, z: 0 }, t, false)).toBe(0);
  });

  it('instant harming/healing use floor(i·(base << amp) + 0.5)', () => {
    const harm = [{ typeId: 'minecraft:effect/instant_damage', duration: 0, amplifier: 0 }];
    expect(resolveSplashApplication(harm, 1).damage).toBe(6);
    expect(resolveSplashApplication(harm, 0.5).damage).toBe(3);
    expect(resolveSplashApplication(harm, 0.25).damage).toBe(2);
    expect(resolveSplashApplication([{ typeId: 'minecraft:effect/harming', duration: 0, amplifier: 1 }], 1).damage).toBe(12);
    const heal = [{ typeId: 'minecraft:effect/instant_health', duration: 0, amplifier: 0 }];
    expect(resolveSplashApplication(heal, 1).heal).toBe(4);
    expect(resolveSplashApplication(heal, 0.5).heal).toBe(2);
    expect(resolveSplashApplication([{ typeId: 'minecraft:effect/healing', duration: 0, amplifier: 1 }], 1).heal).toBe(8);
    expect(resolveSplashApplication(harm, 0)).toEqual({ damage: 0, heal: 0, effects: [] });
    expect(isInstantDamageEffect('minecraft:effect/poison')).toBe(false);
    expect(isInstantHealthEffect('minecraft:effect/healing')).toBe(true);
  });

  it('duration effects scale in ticks and apply only above 20 ticks', () => {
    const poison = [{ typeId: 'minecraft:effect/poison', duration: 45, amplifier: 1 }];
    expect(resolveSplashApplication(poison, 0.5).effects).toEqual([{ typeId: 'minecraft:effect/poison', durationSeconds: 22.5, amplifier: 1 }]);
    expect(resolveSplashApplication([{ typeId: 'minecraft:effect/speed', duration: 1, amplifier: 0 }], 1).effects).toEqual([]);
    expect(resolveSplashApplication([{ typeId: 'minecraft:effect/speed', duration: 1.1, amplifier: 0 }], 1).effects[0]!.durationSeconds).toBeCloseTo(1.1, 9);
    expect(resolveSplashApplication(poison, 0.02).effects).toEqual([]); // 18 ticks
    const mixed = resolveSplashApplication(
      [
        { typeId: 'minecraft:effect/instant_damage', duration: 0, amplifier: 0 },
        { typeId: 'minecraft:effect/slowness', duration: 90, amplifier: 0 },
        { typeId: 'minecraft:effect/not_registered', duration: 10, amplifier: 0 },
      ],
      1,
    );
    expect(mixed.damage).toBe(6);
    // Unknown ids pass through the plan; the Game skips unregistered ids safely.
    expect(mixed.effects.map((e) => e.typeId)).toEqual(['minecraft:effect/slowness', 'minecraft:effect/not_registered']);
  });
});

describe('Witch potion choice', () => {
  const none = () => false;
  it('follows the vanilla ordered table', () => {
    expect(chooseWitchPotion({ horizontalDistance: 8, targetHealth: 20, hasEffect: none, roll: 0.9 })).toBe('slowness');
    expect(chooseWitchPotion({ horizontalDistance: 9, targetHealth: 20, hasEffect: (k) => k === 'slowness', roll: 0.9 })).toBe('poison');
    expect(chooseWitchPotion({ horizontalDistance: 5, targetHealth: 8, hasEffect: none, roll: 0.9 })).toBe('poison');
    expect(chooseWitchPotion({ horizontalDistance: 5, targetHealth: 7.5, hasEffect: none, roll: 0 })).toBe('harming');
    expect(chooseWitchPotion({ horizontalDistance: 3, targetHealth: 6, hasEffect: none, roll: 0.24 })).toBe('weakness');
    expect(chooseWitchPotion({ horizontalDistance: 3, targetHealth: 6, hasEffect: none, roll: 0.25 })).toBe('harming');
    expect(chooseWitchPotion({ horizontalDistance: 3, targetHealth: 6, hasEffect: (k) => k === 'weakness', roll: 0 })).toBe('harming');
    expect(chooseWitchPotion({ horizontalDistance: 2, targetHealth: 20, hasEffect: (k) => k === 'poison', roll: 0.9 })).toBe('harming');
  });

  it('roll is deterministic in [0, 1) and varies with entity and tick', () => {
    const a = witchPotionRoll(5, 100);
    expect(witchPotionRoll(5, 100)).toBe(a);
    const values = new Set<number>();
    for (let t = 0; t < 200; t++) {
      const r = witchPotionRoll(5, t);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      values.add(r);
    }
    expect(values.size).toBeGreaterThan(190);
    expect(witchPotionRoll(6, 100)).not.toBe(a);
    let below = 0;
    for (let t = 0; t < 4000; t++) if (witchPotionRoll(11, t) < 0.25) below++;
    expect(below / 4000).toBeGreaterThan(0.2);
    expect(below / 4000).toBeLessThan(0.3);
  });

  it('witch contents are vanilla splash potions', () => {
    const cases = [
      ['harming', 'minecraft:effect/instant_damage', 0],
      ['poison', 'minecraft:effect/poison', 45],
      ['slowness', 'minecraft:effect/slowness', 90],
      ['weakness', 'minecraft:effect/weakness', 90],
    ] as const;
    for (const [choice, typeId, duration] of cases) {
      const c = witchPotionContents(choice);
      expect(c.kind).toBe('SPLASH');
      expect(c.customEffects).toEqual([{ typeId, duration, amplifier: 0 }]);
    }
  });
});

describe('Splash throw consume rules', () => {
  const base = { canInteract: true, deathScreenOpen: false, depletesItems: true, stackCount: 1, isPotionItem: true, contents: splash('poison') };
  it('survival/adventure consume one; creative throws without consuming', () => {
    expect(splashThrowDecision(base)).toEqual({ throw: true, consume: true });
    expect(splashThrowDecision({ ...base, depletesItems: false })).toEqual({ throw: true, consume: false });
  });
  it('refuses spectators, the death screen, empty hands, non-potions and non-splash potions', () => {
    expect(splashThrowDecision({ ...base, canInteract: false })).toEqual({ throw: false, reason: 'NO_INTERACT' });
    expect(splashThrowDecision({ ...base, deathScreenOpen: true })).toEqual({ throw: false, reason: 'DEATH_SCREEN' });
    expect(splashThrowDecision({ ...base, stackCount: 0 })).toEqual({ throw: false, reason: 'EMPTY_HAND' });
    expect(splashThrowDecision({ ...base, isPotionItem: false })).toEqual({ throw: false, reason: 'NOT_POTION' });
    expect(splashThrowDecision({ ...base, contents: splash('poison', 45, 0, 'NORMAL') })).toEqual({ throw: false, reason: 'NOT_SPLASH' });
    expect(splashThrowDecision({ ...base, contents: splash('poison', 45, 0, 'LINGERING') })).toEqual({ throw: false, reason: 'NOT_SPLASH' });
    expect(splashThrowDecision({ ...base, contents: undefined })).toEqual({ throw: false, reason: 'NOT_SPLASH' });
  });
});
