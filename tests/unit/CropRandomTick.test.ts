import { describe, it, expect } from 'vitest';
import { RandomTickSelector } from '../../src/simulation/RandomTickSelector';
import { BlockId } from '../../src/world/BlockRegistry';

/** A minimal block-map world exposing a crop-eligibility predicate. */
class GridWorld {
  readonly cells = new Map<string, number>();

  set(x: number, y: number, z: number, id: number): void {
    this.cells.set(`${x},${y},${z}`, id);
  }

  get(x: number, y: number, z: number): number {
    return this.cells.get(`${x},${y},${z}`) ?? BlockId.Air;
  }
}

function isCrop(world: GridWorld, id: number): (x: number, y: number, z: number) => boolean {
  return (x, y, z) => world.get(x, y, z) === id;
}

describe('random-tick dispatch eligibility', () => {
  it('selectEligible returns only crop cells', () => {
    const world = new GridWorld();
    // Dense, deterministic mix: even-parity cells are wheat, odd are stone, so
    // the selector reliably samples eligible cells and ineligible ones abound.
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        for (let z = 0; z < 16; z++) {
          world.set(x, y, z, (x + y + z) % 2 === 0 ? BlockId.Wheat : BlockId.Stone);
        }
      }
    }

    const sel = new RandomTickSelector();
    const out = sel.selectEligible(0, 0, 0, 100, 42, isCrop(world, BlockId.Wheat), 8);

    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(8);
    for (const [x, y, z] of out) {
      expect(world.get(x, y, z)).toBe(BlockId.Wheat);
    }
  });

  it('returns empty (not a hang) for an all-ineligible section', () => {
    const world = new GridWorld();
    world.set(0, 0, 0, BlockId.Stone);
    world.set(1, 1, 1, BlockId.Stone);
    const sel = new RandomTickSelector();
    const out = sel.selectEligible(0, 0, 0, 100, 42, isCrop(world, BlockId.Wheat));
    expect(out).toEqual([]);
  });

  it('is deterministic for identical inputs', () => {
    const world = new GridWorld();
    world.set(0, 0, 0, BlockId.Wheat);
    world.set(3, 3, 3, BlockId.Wheat);
    world.set(8, 2, 9, BlockId.Wheat);
    const sel = new RandomTickSelector();
    const a = sel.selectEligible(1, 2, 3, 7, 99, isCrop(world, BlockId.Wheat));
    const b = sel.selectEligible(1, 2, 3, 7, 99, isCrop(world, BlockId.Wheat));
    expect(a).toEqual(b);
  });
});
