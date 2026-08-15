import { describe, it, expect } from 'vitest';
import {
  EXPLOSION_RAY_COUNT,
  computeExplosion,
  explosionEntityDamage,
  explosionRays,
  type ExplosionWorld,
} from '../../src/simulation/ExplosionCore';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** Vanilla-ish resistance values (stone 6, dirt 0.5, glass 0.3, water 100, obsidian 1200). */
const RESISTANCE: Record<string, number> = {
  air: 0,
  stone: 6,
  dirt: 0.5,
  glass: 0.3,
  water: 100,
  obsidian: 1200,
};

function makeWorld(initial: Record<string, string> = {}): ExplosionWorld<string> {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getBlockState(x, y, z) {
      return store.get(key(x, y, z)) ?? 'air';
    },
    isAir(s) {
      return s === 'air';
    },
    isDestroyable(s) {
      return s !== 'air' && s !== 'water'; // fluids absorb rays but are never destroyed
    },
    blastResistance(s) {
      return RESISTANCE[s] ?? 0;
    },
    dropFor(s) {
      if (s === 'stone') return 'minecraft:cobblestone';
      if (s === 'dirt') return 'minecraft:dirt';
      return null;
    },
  };
}

const CENTER: [number, number, number] = [0.5, 0.5, 0.5];
const TNT_STRENGTH = 4;

describe('explosionRays', () => {
  it('generates exactly 1352 unit-length deterministic rays', () => {
    const rays = explosionRays();
    expect(rays.length).toBe(EXPLOSION_RAY_COUNT);
    for (const [x, y, z] of rays) {
      const len = Math.sqrt(x * x + y * y + z * z);
      expect(Math.abs(len - 1)).toBeLessThan(1e-9);
    }
    // Deterministic: two calls return the identical sequence.
    expect(rays).toEqual(explosionRays());
  });
});

describe('computeExplosion', () => {
  it('destroys nothing in an all-air world', () => {
    const world = makeWorld();
    const result = computeExplosion({ center: CENTER, strength: TNT_STRENGTH, world });
    expect(result.destroyed).toEqual([]);
    expect(result.drops).toEqual([]);
  });

  it('returns an empty result for non-finite strength/center', () => {
    const world = makeWorld();
    expect(
      computeExplosion({ center: CENTER, strength: Number.NaN, world }).destroyed,
    ).toEqual([]);
    expect(
      computeExplosion({ center: [Number.NaN, 0, 0], strength: TNT_STRENGTH, world }).destroyed,
    ).toEqual([]);
    expect(
      computeExplosion({ center: CENTER, strength: 0, world }).destroyed,
    ).toEqual([]);
  });

  it('destroys a low-resistance block the rays reach and drops its item', () => {
    const world = makeWorld({ [key(1, 0, 0)]: 'stone' });
    const result = computeExplosion({ center: CENTER, strength: TNT_STRENGTH, world });
    expect(result.destroyed).toContainEqual([1, 0, 0]);
    expect(result.drops).toContainEqual({ item: 'minecraft:cobblestone', position: [1, 0, 0] });
  });

  it('a second stone layer behind the first is NOT destroyed (ray power dies)', () => {
    const world = makeWorld({ [key(1, 0, 0)]: 'stone', [key(2, 0, 0)]: 'stone' });
    const result = computeExplosion({ center: CENTER, strength: TNT_STRENGTH, world });
    expect(result.destroyed).toContainEqual([1, 0, 0]);
    expect(result.destroyed).not.toContainEqual([2, 0, 0]);
  });

  it('water absorbs rays but is not destroyed, and shields what is behind it', () => {
    const world = makeWorld({ [key(1, 0, 0)]: 'water', [key(2, 0, 0)]: 'stone' });
    const result = computeExplosion({ center: CENTER, strength: TNT_STRENGTH, world });
    expect(result.destroyed).not.toContainEqual([1, 0, 0]); // water never destroyed
    expect(result.destroyed).not.toContainEqual([2, 0, 0]); // shielded by water's resistance 100
  });

  it('obsidian (resistance 1200) is not destroyed and blocks everything behind it', () => {
    const world = makeWorld({ [key(1, 0, 0)]: 'obsidian', [key(2, 0, 0)]: 'stone' });
    const result = computeExplosion({ center: CENTER, strength: TNT_STRENGTH, world });
    expect(result.destroyed).not.toContainEqual([1, 0, 0]);
    expect(result.destroyed).not.toContainEqual([2, 0, 0]);
  });

  it('reports drops in the same sorted order as destroyed positions', () => {
    const world = makeWorld({
      [key(-1, 0, 0)]: 'dirt',
      [key(1, 0, 0)]: 'stone',
      [key(0, 1, 0)]: 'glass', // no drop
    });
    const result = computeExplosion({ center: CENTER, strength: TNT_STRENGTH, world });
    expect(result.destroyed).toContainEqual([-1, 0, 0]);
    expect(result.destroyed).toContainEqual([1, 0, 0]);
    expect(result.destroyed).toContainEqual([0, 1, 0]); // glass destroyed (low resistance) but...
    expect(result.drops).toEqual([
      { item: 'minecraft:dirt', position: [-1, 0, 0] },
      { item: 'minecraft:cobblestone', position: [1, 0, 0] },
    ]);
    // Drops follow the sorted destroyed order, glass contributes no drop.
    const destroyedKeys = result.destroyed.map(([x, y, z]) => key(x, y, z));
    expect(destroyedKeys).toEqual([...destroyedKeys].sort());
    for (const drop of result.drops) {
      expect(destroyedKeys).toContain(key(drop.position[0], drop.position[1], drop.position[2]));
    }
  });

  it('is fully deterministic across repeated calls', () => {
    const world = makeWorld({
      [key(-2, 1, 3)]: 'stone',
      [key(4, -1, 0)]: 'dirt',
      [key(0, 0, -3)]: 'glass',
    });
    const a = computeExplosion({ center: CENTER, strength: TNT_STRENGTH, world });
    const b = computeExplosion({ center: CENTER, strength: TNT_STRENGTH, world });
    expect(a).toEqual(b);
  });
});

describe('explosionEntityDamage', () => {
  it('matches the vanilla exposure=1 formula at the center, mid-blast, and edge', () => {
    const damages = explosionEntityDamage([0, 0, 0], 4, [
      [0, 0, 0], // d=0 -> 57
      [4, 0, 0], // d=0.5 -> 22
      [8, 0, 0], // d=1 -> 1
      [9, 0, 0], // beyond -> omitted
    ]);
    expect(damages).toEqual([
      { position: [0, 0, 0], damage: 57 },
      { position: [4, 0, 0], damage: 22 },
      { position: [8, 0, 0], damage: 1 },
    ]);
  });

  it('preserves input order and is deterministic', () => {
    const positions: Array<readonly [number, number, number]> = [
      [1, 0, 0],
      [0, 0, 0],
      [2, 0, 0],
    ];
    const a = explosionEntityDamage([0, 0, 0], 4, positions);
    const b = explosionEntityDamage([0, 0, 0], 4, positions);
    expect(a.map((d) => d.position)).toEqual([[1, 0, 0], [0, 0, 0], [2, 0, 0]]);
    expect(a).toEqual(b);
  });

  it('returns an empty list for non-finite inputs', () => {
    expect(explosionEntityDamage([0, 0, 0], Number.NaN, [[0, 0, 0]])).toEqual([]);
    expect(explosionEntityDamage([Number.NaN, 0, 0], 4, [[0, 0, 0]])).toEqual([]);
    expect(explosionEntityDamage([0, 0, 0], 0, [[0, 0, 0]])).toEqual([]);
  });
});
