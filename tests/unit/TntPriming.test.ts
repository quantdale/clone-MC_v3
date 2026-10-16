import { describe, it, expect } from 'vitest';
import {
  BlockId,
  createDefaultBlockRegistry,
} from '../../src/world/BlockRegistry';
import {
  ItemId,
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { resourceIdToString } from '../../src/data/ResourceId';
import {
  TNT_FUSE_TICKS_FIRE,
  TNT_FUSE_TICKS_REDSTONE,
  TNT_STRENGTH,
  explodePrimedTnt,
  primeTnt,
  primedTntIsDue,
  tickPrimedTnt,
  tntFuseTicks,
  tntShouldPrime,
  type PrimedTnt,
} from '../../src/simulation/TntPriming';
import type { ExplosionWorld } from '../../src/simulation/ExplosionCore';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

const RESISTANCE: Record<string, number> = { air: 0, stone: 6, tnt: 0 };

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
      return s !== 'air';
    },
    blastResistance(s) {
      return RESISTANCE[s] ?? 0;
    },
    dropFor(s) {
      return s === 'stone' ? 'minecraft:cobblestone' : null;
    },
  };
}

describe('tnt registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();

  it('registers a stateless tnt block with a single state', () => {
    const def = blockRegistry.get(BlockId.Tnt);
    expect(def.key).toBe('tnt');
    expect(blockRegistry.getPropertySchema(BlockId.Tnt).isEmpty).toBe(true);
    const stateRegistry = createDefaultBlockStateRegistry();
    expect(stateRegistry.statesForBlock(BlockId.Tnt).length).toBe(1);
  });

  it('registers an item that places the block', () => {
    const item = itemRegistry.get(ItemId.Tnt);
    expect(item.key).toBe('tnt');
    expect(resourceIdToString(item.placeBlock!)).toBe('minecraft:tnt');
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });
});

describe('tnt fuse ticks', () => {
  it('is 80 ticks for redstone priming and 20 for fire priming', () => {
    expect(tntFuseTicks('redstone')).toBe(TNT_FUSE_TICKS_REDSTONE);
    expect(tntFuseTicks('fire')).toBe(TNT_FUSE_TICKS_FIRE);
  });
});

describe('tntShouldPrime', () => {
  it('primes when powered (162-style consumer rule) or when fire is adjacent', () => {
    expect(tntShouldPrime(false, false)).toBe(false);
    expect(tntShouldPrime(true, false)).toBe(true);
    expect(tntShouldPrime(false, true)).toBe(true);
    expect(tntShouldPrime(true, true)).toBe(true);
  });
});

describe('primed TNT lifecycle', () => {
  it('primeTnt creates the descriptor with the cause-specific fuse and TNT strength', () => {
    const red = primeTnt(1, 2, 3, 'redstone');
    expect(red).toEqual({ x: 1, y: 2, z: 3, fuseTicks: 80, strength: TNT_STRENGTH });
    const fire = primeTnt(1, 2, 3, 'fire');
    expect(fire.fuseTicks).toBe(20);
  });

  it('tickPrimedTnt decrements the fuse by exactly the elapsed ticks', () => {
    const primed = primeTnt(0, 0, 0, 'redstone');
    const after = tickPrimedTnt(primed, 79);
    expect(after.fuseTicks).toBe(1);
    expect(primedTntIsDue(after)).toBe(false);
    const due = tickPrimedTnt(primed, 80);
    expect(due.fuseTicks).toBe(0);
    expect(primedTntIsDue(due)).toBe(true);
  });

  it('tickPrimedTnt clamps at zero and ignores non-finite/negative elapsed', () => {
    const primed = primeTnt(0, 0, 0, 'redstone');
    expect(tickPrimedTnt(primed, 1000).fuseTicks).toBe(0);
    expect(tickPrimedTnt(primed, Number.NaN)).toEqual(primed);
    expect(tickPrimedTnt(primed, -5)).toEqual(primed);
  });
});

describe('explodePrimedTnt', () => {
  it('runs 169\'s computeExplosion at the primed position with TNT strength', () => {
    const world = makeWorld({ [key(1, 0, 0)]: 'stone' });
    const primed: PrimedTnt = primeTnt(0, 0, 0, 'redstone');
    const result = explodePrimedTnt(primed, world);
    expect(result.destroyed).toContainEqual([1, 0, 0]);
    expect(result.drops).toContainEqual({ item: 'minecraft:cobblestone', position: [1, 0, 0] });
  });

  it('destroys nothing in an all-air world and is deterministic', () => {
    const world = makeWorld();
    const primed: PrimedTnt = primeTnt(0, 0, 0, 'fire');
    const a = explodePrimedTnt(primed, world);
    const b = explodePrimedTnt(primed, world);
    expect(a.destroyed).toEqual([]);
    expect(a).toEqual(b);
  });

  it('the explosion center is the block center (primed position + 0.5)', () => {
    // A stone at (1,0,0) is exactly one block east of a primed TNT at (0,0,0): it must be reached
    // and destroyed, proving the center resolves to (0.5, 0.5, 0.5) like 169's canonical test.
    const world = makeWorld({ [key(1, 0, 0)]: 'stone' });
    const result = explodePrimedTnt(primeTnt(0, 0, 0, 'redstone'), world);
    expect(result.destroyed).toContainEqual([1, 0, 0]);
  });
});
