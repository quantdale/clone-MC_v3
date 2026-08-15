import { describe, expect, it } from 'vitest';
import {
  createDefaultBlockRegistry,
  createDefaultBlockTags,
  MINABLE_TAG_BY_KIND,
  BlockId,
  ToolKind,
  type BlockTypeDefinition,
} from '../../src/world/BlockRegistry';
import {
  createDefaultItemRegistry,
  createDefaultItemTags,
  TOOLS_TAG_BY_KIND,
  ItemId,
  type ItemTypeDefinition,
} from '../../src/inventory/ItemRegistry';
import { HarvestRules, MIN_BREAK_DURATION } from '../../src/world/HarvestRules';

const blocks = createDefaultBlockRegistry();
const items = createDefaultItemRegistry();
const rules = new HarvestRules(createDefaultBlockTags(blocks), createDefaultItemTags(items));

const stoneDef = blocks.get(BlockId.Stone);
const dirtDef = blocks.get(BlockId.Dirt);
const coalOreDef = blocks.get(BlockId.CoalOre);
const woodenPickaxe = items.get(ItemId.WoodenPickaxe);
const stonePickaxe = items.get(ItemId.StonePickaxe);
const woodenAxe = items.get(ItemId.WoodenAxe);

describe('harvest data model', () => {
  it('sets miningLevel 1 on the stone-family blocks', () => {
    for (const id of [BlockId.Stone, BlockId.CoalOre, BlockId.IronOre, BlockId.Cobblestone, BlockId.Bricks, BlockId.Furnace]) {
      expect(blocks.get(id).miningLevel).toBe(1);
    }
  });

  it('leaves tool-requiring blocks at the default level 0 (drop by hand)', () => {
    // Dirt/grass/sand/gravel/snow/wood/leaves/planks/glass/chest need no tool.
    expect(dirtDef.miningLevel ?? 0).toBe(0);
    expect(blocks.get(BlockId.Wood).miningLevel ?? 0).toBe(0);
    expect(blocks.get(BlockId.Glass).miningLevel ?? 0).toBe(0);
  });

  it('sets tool tiers on the tool items', () => {
    expect(woodenPickaxe.toolTier).toBe(1);
    expect(woodenAxe.toolTier).toBe(1);
    expect(stonePickaxe.toolTier).toBe(2);
  });
});

describe('harvest tag-based mineability', () => {
  const blockTags = createDefaultBlockTags(blocks);
  const itemTags = createDefaultItemTags(items);

  it('finalizes the block and item tag registries', () => {
    expect(blockTags.isFinalized).toBe(true);
    expect(itemTags.isFinalized).toBe(true);
  });

  it('declares the three mineable and three tools tags', () => {
    for (const kind of [ToolKind.Pickaxe, ToolKind.Axe, ToolKind.Shovel]) {
      expect(blockTags.has(MINABLE_TAG_BY_KIND[kind])).toBe(true);
      expect(itemTags.has(TOOLS_TAG_BY_KIND[kind])).toBe(true);
    }
  });

  it('places stone in mineable/pickaxe but not mineable/axe', () => {
    expect(blockTags.contains(MINABLE_TAG_BY_KIND[ToolKind.Pickaxe], stoneDef.resourceId)).toBe(true);
    expect(blockTags.contains(MINABLE_TAG_BY_KIND[ToolKind.Axe], stoneDef.resourceId)).toBe(false);
  });

  it('resolves block and item tool kinds from tags', () => {
    expect(rules.blockToolKind(stoneDef)).toBe(ToolKind.Pickaxe);
    expect(rules.blockToolKind(dirtDef)).toBe(ToolKind.Shovel);
    expect(rules.toolKind(woodenPickaxe)).toBe(ToolKind.Pickaxe);
    expect(rules.toolKind(woodenAxe)).toBe(ToolKind.Axe);
  });
});

describe('harvest break speed', () => {
  it('speeds up stone with an effective pickaxe (hardness / toolPower)', () => {
    // stone hardness 1.5, wooden pickaxe power 2.2 => 0.6818...
    expect(rules.getBreakDuration(stoneDef, woodenPickaxe)).toBeCloseTo(1.5 / 2.2, 4);
  });

  it('keeps base speed with the wrong tool kind', () => {
    expect(rules.getBreakDuration(stoneDef, woodenAxe)).toBe(1.5);
  });

  it('keeps base speed with no tool', () => {
    expect(rules.getBreakDuration(stoneDef, undefined)).toBe(1.5);
  });

  it('applies the bonus to a level-0 block with the matching kind', () => {
    // wood hardness 1.0, wooden axe power 2.4 => 0.4167
    const woodDef = blocks.get(BlockId.Wood);
    expect(rules.getBreakDuration(woodDef, woodenAxe)).toBeCloseTo(1.0 / 2.4, 4);
  });

  it('floors the duration at MIN_BREAK_DURATION', () => {
    const fastBlock: BlockTypeDefinition = { ...stoneDef, miningLevel: 0, hardness: 0.1 };
    const fastTool: ItemTypeDefinition = { ...woodenPickaxe, toolPower: 100 };
    expect(rules.getBreakDuration(fastBlock, fastTool)).toBe(MIN_BREAK_DURATION);
  });
});

describe('harvest drop rule', () => {
  it('always harvests a level-0 block by hand', () => {
    expect(rules.canHarvest(dirtDef, undefined)).toBe(true);
  });

  it('does not harvest stone by hand', () => {
    expect(rules.canHarvest(stoneDef, undefined)).toBe(false);
  });

  it('does not harvest with the wrong tool kind', () => {
    expect(rules.canHarvest(stoneDef, woodenAxe)).toBe(false);
  });

  it('harvests with the correct kind at sufficient tier', () => {
    expect(rules.canHarvest(stoneDef, woodenPickaxe)).toBe(true);
  });

  it('harvests a level-0 block even with the wrong-kind tool', () => {
    expect(rules.canHarvest(dirtDef, woodenPickaxe)).toBe(true);
  });

  it('rejects an insufficient-tier correct-kind tool', () => {
    const hardBlock: BlockTypeDefinition = { ...stoneDef, miningLevel: 2 };
    const weakPickaxe: ItemTypeDefinition = { ...woodenPickaxe, toolTier: 1 };
    expect(rules.canHarvest(hardBlock, weakPickaxe)).toBe(false);
    expect(rules.isEffectiveTool(hardBlock, weakPickaxe)).toBe(false);
    const strongPickaxe: ItemTypeDefinition = { ...woodenPickaxe, toolTier: 2 };
    expect(rules.canHarvest(hardBlock, strongPickaxe)).toBe(true);
    expect(rules.isEffectiveTool(hardBlock, strongPickaxe)).toBe(true);
  });
});

describe('harvest effective-tool classification', () => {
  it('is effective for matching kind+level', () => {
    expect(rules.isEffectiveTool(stoneDef, woodenPickaxe)).toBe(true);
  });

  it('is not effective for the wrong kind', () => {
    expect(rules.isEffectiveTool(stoneDef, woodenAxe)).toBe(false);
  });

  it('is not effective with no tool', () => {
    expect(rules.isEffectiveTool(stoneDef, undefined)).toBe(false);
  });

  it('is not effective for a level-0 block with the wrong kind', () => {
    // No speed bonus, but the block still drops (separate canHarvest path).
    expect(rules.isEffectiveTool(dirtDef, woodenPickaxe)).toBe(false);
  });

  it('is effective for a level-0 block with the matching kind', () => {
    const woodDef = blocks.get(BlockId.Wood);
    expect(rules.isEffectiveTool(woodDef, woodenAxe)).toBe(true);
  });

  it('coal ore is harvestable by a wooden pickaxe', () => {
    expect(rules.canHarvest(coalOreDef, woodenPickaxe)).toBe(true);
  });
});
