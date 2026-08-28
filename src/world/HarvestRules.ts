/**
 * Harvest rules for tool-tier and mineability (change 114).
 *
 * Centralizes the three harvest decisions that previously lived inline in
 * `PlayerInteraction`:
 *
 * 1. Is the held tool the *effective* tool for a block? (controls break speed)
 * 2. Does breaking the block yield a drop? (controls loot)
 * 3. How long does the block take to break with the held tool? (speed math)
 *
 * Mineability is data-driven through block tags `minecraft:mineable/<kind>` and
 * tool kind is resolved through item tags `minecraft:tools/<kind>`, with the
 * `preferredTool` / `toolKind` fields retained as bootstrap sources. Tool tier
 * (`ItemTypeDefinition.toolTier`) is compared against the block's
 * `miningLevel` to decide harvestability of blocks that require a tool.
 *
 * All queries are O(1) set/map lookups with no allocation in the per-frame
 * break loop, and the tag registries are frozen at bootstrap.
 */

import { type ResourceId, createResourceId } from '../data/ResourceId';
import { type TagRegistry } from '../data/TagRegistry';
import { type BlockTypeDefinition, ToolKind } from './BlockRegistry';
import { type ItemTypeDefinition } from '../inventory/ItemRegistry';
import { efficiencySpeedMultiplier } from '../inventory/EnchantmentApplication';

/** The three tool kinds this game models. */
const TOOL_KINDS: readonly ToolKind[] = [ToolKind.Pickaxe, ToolKind.Axe, ToolKind.Shovel];

/** Block tag declaring which blocks a tool kind can mine. */
const MINABLE_TAG_BY_KIND: Readonly<Record<ToolKind, ResourceId>> = {
  [ToolKind.Pickaxe]: createResourceId('minecraft', 'mineable/pickaxe'),
  [ToolKind.Axe]: createResourceId('minecraft', 'mineable/axe'),
  [ToolKind.Shovel]: createResourceId('minecraft', 'mineable/shovel'),
};

/** Item tag declaring which tool items belong to a tool kind. */
const TOOLS_TAG_BY_KIND: Readonly<Record<ToolKind, ResourceId>> = {
  [ToolKind.Pickaxe]: createResourceId('minecraft', 'tools/pickaxe'),
  [ToolKind.Axe]: createResourceId('minecraft', 'tools/axe'),
  [ToolKind.Shovel]: createResourceId('minecraft', 'tools/shovel'),
};

/** Minimum effective break duration in seconds. */
export const MIN_BREAK_DURATION = 0.08;

export class HarvestRules {
  private readonly blockTags: TagRegistry;
  private readonly itemTags: TagRegistry;

  constructor(blockTags: TagRegistry, itemTags: TagRegistry) {
    this.blockTags = blockTags;
    this.itemTags = itemTags;
  }

  /**
   * The tool kind required to efficiently mine a block, derived from the
   * `mineable/<kind>` tag the block belongs to. Falls back to `preferredTool`
   * when the block is in no mineable tag.
   */
  blockToolKind(def: BlockTypeDefinition): ToolKind | undefined {
    for (const kind of TOOL_KINDS) {
      if (this.blockTags.contains(MINABLE_TAG_BY_KIND[kind], def.resourceId)) {
        return kind;
      }
    }
    return def.preferredTool;
  }

  /**
   * The tool kind of an item, derived from the `tools/<kind>` tag it belongs to.
   * Falls back to `toolKind` when the item is in no tools tag.
   */
  toolKind(item: ItemTypeDefinition): ToolKind | undefined {
    for (const kind of TOOL_KINDS) {
      if (this.itemTags.contains(TOOLS_TAG_BY_KIND[kind], item.resourceId)) {
        return kind;
      }
    }
    return item.toolKind;
  }

  /**
   * Whether the held tool is the *effective* tool for `def`: its kind matches the
   * block's required kind, and either the block needs no tool (`miningLevel 0`)
   * or the tool's `toolTier` meets the block's `miningLevel`.
   */
  isEffectiveTool(def: BlockTypeDefinition, tool: ItemTypeDefinition | undefined): boolean {
    if (tool === undefined) return false;
    const blockKind = this.blockToolKind(def);
    if (blockKind === undefined) return false;
    const toolKind = this.toolKind(tool);
    if (toolKind === undefined || toolKind !== blockKind) return false;
    const level = def.miningLevel ?? 0;
    return level === 0 || (tool.toolTier ?? 0) >= level;
  }

  /**
   * Whether breaking `def` with `tool` yields a drop. A `miningLevel 0` block is
   * always harvestable (drops by hand); a higher-level block drops only when the
   * held tool's kind matches and its `toolTier` meets the level.
   */
  canHarvest(def: BlockTypeDefinition, tool: ItemTypeDefinition | undefined): boolean {
    const level = def.miningLevel ?? 0;
    if (level === 0) return true;
    if (tool === undefined) return false;
    const blockKind = this.blockToolKind(def);
    const toolKind = this.toolKind(tool);
    return blockKind !== undefined && toolKind === blockKind && (tool.toolTier ?? 0) >= level;
  }

  /**
   * Effective break duration in seconds. An effective tool divides `hardness` by
   * its `toolPower`; otherwise the base `hardness` applies. The result is floored
   * at `MIN_BREAK_DURATION`. When `efficiencyLevel > 0` (an Efficiency-enchanted
   * tool), the effective duration is further divided by
   * `efficiencySpeedMultiplier(efficiencyLevel)` (change 119).
   */
  getBreakDuration(
    def: BlockTypeDefinition,
    tool: ItemTypeDefinition | undefined,
    efficiencyLevel = 0,
  ): number {
    const base = def.hardness;
    if (this.isEffectiveTool(def, tool) && tool?.toolPower !== undefined) {
      const effective = base / tool.toolPower;
      if (efficiencyLevel > 0) {
        return Math.max(MIN_BREAK_DURATION, effective / efficiencySpeedMultiplier(efficiencyLevel));
      }
      return Math.max(MIN_BREAK_DURATION, effective);
    }
    return Math.max(MIN_BREAK_DURATION, base);
  }
}
