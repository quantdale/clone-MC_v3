import { describe, it, expect } from 'vitest';
import {
  BlockBehaviorRegistry,
  type BlockBehavior,
} from '../../src/simulation/BlockBehavior';
import { RandomTickEligibility } from '../../src/simulation/RandomTickEligibility';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';

/**
 * Change 254 R6: the registry-derived eligibility table must decide exactly
 * like the direct block→key→behavior lookup path for every id.
 */

function makeRig() {
  const blocks = createDefaultBlockRegistry();
  const behaviors = new BlockBehaviorRegistry();
  const tick: BlockBehavior = { onRandomTick: () => undefined };
  behaviors.register(blocks.all().find((d) => d.key === 'wheat')!.key, tick);
  behaviors.register(blocks.all().find((d) => d.key === 'fire')!.key, tick);
  return { blocks, behaviors };
}

describe('RandomTickEligibility table (254 R6)', () => {
  it('agrees with direct registry lookups for every registered id', () => {
    const { blocks, behaviors } = makeRig();
    const table = new RandomTickEligibility(blocks, behaviors);
    for (const def of blocks.all()) {
      const direct = typeof behaviors.getBehavior(def.key).onRandomTick === 'function';
      expect(table.has(def.id)).toBe(direct);
      // Second call hits the built table; decisions must not drift.
      expect(table.has(def.id)).toBe(direct);
    }
    // Exactly the two registered behavior keys are eligible.
    const eligible = blocks.all().filter((d) => table.has(d.id)).map((d) => d.key);
    expect(eligible.sort()).toEqual(['fire', 'wheat']);
  });

  it('decisions stay identical after a table rebuild triggered by an out-of-range probe', () => {
    const { blocks, behaviors } = makeRig();
    const table = new RandomTickEligibility(blocks, behaviors);
    expect(table.has(0)).toBe(false); // builds the initial table
    // An id beyond the current table forces a rebuild path.
    const maxId = Math.max(...blocks.all().map((d) => d.id));
    let threwOrFalse: string;
    try {
      threwOrFalse = String(table.has(maxId + 5000));
    } catch (err) {
      threwOrFalse = `threw:${String(err)}`;
    }
    if (!threwOrFalse.startsWith('threw')) {
      expect(threwOrFalse).toBe('false');
    }
    for (const def of blocks.all()) {
      const direct = typeof behaviors.getBehavior(def.key).onRandomTick === 'function';
      expect(table.has(def.id)).toBe(direct);
    }
  });

  it('unregistered ids surface the identical unknown-block-id error', () => {
    const { blocks, behaviors } = makeRig();
    const table = new RandomTickEligibility(blocks, behaviors);
    expect(() => table.has(100000)).toThrow(/unknown block id: 100000/);
  });
});
