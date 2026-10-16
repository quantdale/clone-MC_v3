/**
 * Core progression advancements (186): the first advancement CATALOG over 185's framework — a
 * data-driven chain covering survival → Nether → End progression, in play order.
 *
 * The chain (vanilla-inspired keys, vanilla-like criteria):
 *   1. `minecraft:stone_age`        — obtain a wooden pickaxe
 *   2. `minecraft:acquire_hardware` — obtain a stone pickaxe
 *   3. `minecraft:iron_tools`       — obtain an iron pickaxe
 *   4. `minecraft:diamonds`         — obtain a diamond
 *   5. `minecraft:enter_the_nether` — enter the Nether
 *   6. `minecraft:enter_the_end`    — enter the End
 *   7. `minecraft:free_the_end`     — defeat the Ender Dragon (reward: 500 experience, vanilla)
 *
 * All definitions use only 185's typed criteria; rewards are definition data (185 models granting
 * as wiring). `coreProgressionAdvancements` returns the chain in order; `getCoreProgressionAdvancement`
 * looks up by key.
 */
import { createResourceId } from '../data/ResourceId';
import type { AdvancementDefinition } from './AdvancementFramework';

const ADVANCEMENTS: readonly AdvancementDefinition[] = [
  {
    id: createResourceId('minecraft', 'stone_age'),
    key: 'minecraft:stone_age',
    title: 'Stone Age',
    criteria: [{ type: 'obtain_item', itemKey: 'wooden_pickaxe' }],
    reward: { kind: 'none' },
  },
  {
    id: createResourceId('minecraft', 'acquire_hardware'),
    key: 'minecraft:acquire_hardware',
    title: 'Acquire Hardware',
    criteria: [{ type: 'obtain_item', itemKey: 'stone_pickaxe' }],
    reward: { kind: 'none' },
  },
  {
    id: createResourceId('minecraft', 'iron_tools'),
    key: 'minecraft:iron_tools',
    title: 'Iron Tools',
    criteria: [{ type: 'obtain_item', itemKey: 'iron_pickaxe' }],
    reward: { kind: 'none' },
  },
  {
    id: createResourceId('minecraft', 'diamonds'),
    key: 'minecraft:diamonds',
    title: 'Diamonds!',
    criteria: [{ type: 'obtain_item', itemKey: 'diamond' }],
    reward: { kind: 'none' },
  },
  {
    id: createResourceId('minecraft', 'enter_the_nether'),
    key: 'minecraft:enter_the_nether',
    title: 'We Need to Go Deeper',
    criteria: [{ type: 'dimension_enter', dimensionKey: 'minecraft:the_nether' }],
    reward: { kind: 'none' },
  },
  {
    id: createResourceId('minecraft', 'enter_the_end'),
    key: 'minecraft:enter_the_end',
    title: 'The End?',
    criteria: [{ type: 'dimension_enter', dimensionKey: 'minecraft:the_end' }],
    reward: { kind: 'none' },
  },
  {
    id: createResourceId('minecraft', 'free_the_end'),
    key: 'minecraft:free_the_end',
    title: 'Free the End',
    criteria: [{ type: 'boss_defeat', bossKey: 'ender_dragon' }],
    reward: { kind: 'experience', amount: 500 },
  },
];

/** The core progression chain, in play order (survival → Nether → End). */
export function coreProgressionAdvancements(): readonly AdvancementDefinition[] {
  return ADVANCEMENTS;
}

/** Look up a core-progression advancement by key, or `undefined`. */
export function getCoreProgressionAdvancement(key: string): AdvancementDefinition | undefined {
  return ADVANCEMENTS.find((a) => a.key === key);
}

/** The first advancement in the chain. */
export function firstCoreProgressionAdvancement(): AdvancementDefinition {
  return ADVANCEMENTS[0]!;
}

/** The final advancement in the chain (the dragon kill). */
export function finalCoreProgressionAdvancement(): AdvancementDefinition {
  return ADVANCEMENTS[ADVANCEMENTS.length - 1]!;
}
