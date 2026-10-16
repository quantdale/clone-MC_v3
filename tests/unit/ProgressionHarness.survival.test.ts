import { describe, it, expect } from 'vitest';
import {
  ProgressionHarness,
  ProgressionError,
  InMemoryWorld,
  type ProgressionAction,
} from '../support/ProgressionHarness';
import { BlockId, createDefaultBlockRegistry, createDefaultBlockTags } from '../../src/world/BlockRegistry';
import { ItemId, createDefaultItemRegistry, createDefaultItemTags } from '../../src/inventory/ItemRegistry';
import { HarvestRules } from '../../src/world/HarvestRules';

const toolChain: ProgressionAction[] = [
  { kind: 'gainWood' },
  { kind: 'craftPickaxe', tier: 'wooden' },
  { kind: 'craftPickaxe', tier: 'stone' },
  { kind: 'fireAdvancement', itemKey: 'iron_pickaxe' },
  { kind: 'fireAdvancement', itemKey: 'diamond' },
];

describe('survival-progression: Stage 0 (fresh world)', () => {
  it('spawns at the deterministic point with a full survival baseline and loaded overworld', () => {
    const h = new ProgressionHarness({ worldSeed: 11 });
    expect(h.isStageComplete('fresh-world')).toBe(true);
    expect(h.snapshot().survival).toEqual({ version: 1, health: 20, hunger: 20, saturation: 5 });
    expect(h.snapshot().experience).toEqual({ version: 1, level: 0, xp: 0 });
    const [px, py, pz] = h.snapshot().playerPosition;
    expect(h.world.getBlock(px, py - 1, pz)).not.toBe(0);
  });

  it('fresh-world state survives snapshot/restore round-trip', () => {
    const h = new ProgressionHarness({ worldSeed: 11 });
    const snap = h.snapshot();
    const fresh = new ProgressionHarness({ worldSeed: 99 });
    fresh.reset();
    fresh.restore(snap);
    expect(fresh.snapshot().playerPosition).toEqual(h.snapshot().playerPosition);
    expect(fresh.snapshot().survival).toEqual(h.snapshot().survival);
    expect(fresh.snapshot().experience).toEqual(h.snapshot().experience);
    expect(fresh.isStageComplete('fresh-world')).toBe(true);
  });
});

describe('survival-progression: Stage 1 (tools)', () => {
  it('full tool chain yields the real pickaxes and the ordered advancement chain', () => {
    const h = new ProgressionHarness({ worldSeed: 5 });
    h.runScript(toolChain);
    expect(h.isStageComplete('tools')).toBe(true);
    expect(h.getItemCount(ItemId.WoodenPickaxe)).toBeGreaterThan(0);
    expect(h.getItemCount(ItemId.StonePickaxe)).toBeGreaterThan(0);

    const order = ['minecraft:stone_age', 'minecraft:acquire_hardware', 'minecraft:iron_tools', 'minecraft:diamonds'];
    const ticks = order.map((k) => (h as unknown as { advancementProgress: Map<string, { achieved: boolean; achievedTick: number | null }> }).advancementProgress.get(k)!.achievedTick);
    expect(ticks.every((t) => t !== null)).toBe(true);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!);
    }
  });

  it('the block yields no drop with the wrong tool and the harness aborts atomically', () => {
    // Real module check: an obsidian block (miningLevel 3) cannot be harvested by hand.
    const blocks = createDefaultBlockRegistry();
    const tags = createDefaultBlockTags(blocks);
    const items = createDefaultItemRegistry();
    const itemTags = createDefaultItemTags(items);
    const rules = new HarvestRules(tags, itemTags);
    expect(rules.canHarvest(blocks.get(BlockId.Obsidian), undefined)).toBe(false);

    const h = new ProgressionHarness({ worldSeed: 5 });
    expect(() => h.runScript([{ kind: 'breakBlock', blockId: BlockId.Obsidian }])).toThrowError(ProgressionError);
    expect(() => h.runScript([{ kind: 'breakBlock', blockId: BlockId.Obsidian }])).toThrow(/wrong_tool_for_mining_level/);
    // No stage credit, inventory unchanged.
    expect(h.isStageComplete('tools')).toBe(false);
    expect(h.getItemCount(ItemId.Obsidian)).toBe(0);
  });
});

describe('survival-progression: Stage 2 (food)', () => {
  it('eating restores hunger and saturation and credits the stage', () => {
    const h = new ProgressionHarness({ worldSeed: 5 });
    // Starve first (hunger/saturation -> 0, one starvation tick of damage), then eat an apple.
    h.runScript([{ kind: 'starve' }, { kind: 'eat', itemId: ItemId.Apple }]);
    expect(h.snapshot().survival.hunger).toBe(4); // apple foodHunger = 4
    expect(h.snapshot().survival.saturation).toBe(2); // apple foodSaturation = 2
    expect(h.isStageComplete('food')).toBe(true);
  });

  it('a starving player loses health and a continued attempt aborts with not_fed', () => {
    const h = new ProgressionHarness({ worldSeed: 5 });
    h.runScript([{ kind: 'starve' }]);
    expect(h.snapshot().survival.health).toBeLessThan(20);
    expect(() => h.runScript([{ kind: 'requireFed' }])).toThrowError(ProgressionError);
    expect(() => h.runScript([{ kind: 'requireFed' }])).toThrow(/not_fed/);
  });
});

describe('survival-progression: Stage 3 (shelter)', () => {
  it('an enclosed shelter is air-tight and contains the player', () => {
    const h = new ProgressionHarness({ worldSeed: 5 });
    h.runScript([{ kind: 'buildShelter' }]);
    expect(h.isStageComplete('shelter')).toBe(true);
    const [px, py, pz] = h.snapshot().playerPosition;
    expect(h.world.getBlock(px, py, pz)).toBe(0); // player stands in interior air
  });

  it('a non-sealed shelter is NOT credited', () => {
    const h = new ProgressionHarness({ worldSeed: 5 });
    h.runScript([{ kind: 'buildShelter', sealed: false }]);
    expect(h.isStageComplete('shelter')).toBe(false);
  });

  it('shelter persists across reload', () => {
    const h = new ProgressionHarness({ worldSeed: 5 });
    h.runScript([{ kind: 'buildShelter' }]);
    const snap = h.snapshot();
    const fresh = new ProgressionHarness({ worldSeed: 5 });
    fresh.reset();
    fresh.restore(snap);
    expect(fresh.isStageComplete('shelter')).toBe(true);
    // The obsidian shelter blocks are present in the restored world edits.
    expect(fresh.world.getBlock(7, 64, 7)).toBe(BlockId.Obsidian);
    expect(fresh.world.getBlock(9, 67, 9)).toBe(BlockId.Obsidian);
  });
});

describe('survival-progression: in-memory fixture sanity', () => {
  it('tracks block edits and exports/imports deterministically', () => {
    const w = new InMemoryWorld();
    w.setBlock(1, 2, 3, BlockId.Obsidian);
    expect(w.getBlock(1, 2, 3)).toBe(BlockId.Obsidian);
    expect(w.isObsidian(1, 2, 3)).toBe(true);
    const edits = w.exportEdits();
    const w2 = new InMemoryWorld();
    w2.importEdits(edits);
    expect(w2.getBlock(1, 2, 3)).toBe(BlockId.Obsidian);
  });
});
