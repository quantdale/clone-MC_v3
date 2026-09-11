/**
 * Advancement row views (263): pure, headless-safe descriptions over the 186
 * catalog and 185 progress. `Game` delegates its panel rows to these helpers;
 * the panel renders the views without owning any progress state.
 *
 * Descriptions are original criterion-derived English (the 185 definitions
 * carry a title but no description): obtain/kill name the item or mob,
 * dimension/boss keys resolve their two known vanilla-like destinations and
 * otherwise humanize the raw key. Unknown future criterion shapes fall back
 * to the humanized payload so the panel can never render an empty string.
 */
import type {
  AdvancementCriterion,
  AdvancementDefinition,
  AdvancementProgress,
} from './AdvancementFramework';

/** One panel row: identity, original-English description, and progress. */
export interface AdvancementRowView {
  key: string;
  title: string;
  description: string;
  achieved: boolean;
  achievedTick: number | null;
  achievedCount: number;
  totalCount: number;
  remaining: number;
}

/** `minecraft:the_nether` → `The Nether`; `wooden_pickaxe` → `Wooden Pickaxe`. */
export function humanizeAdvancementKey(key: string): string {
  const path = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
  return path
    .split('_')
    .filter((w) => w.length > 0)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

/** Original-English description for one criterion. Never empty, never throws. */
export function describeAdvancementCriterion(criterion: AdvancementCriterion): string {
  switch (criterion.type) {
    case 'obtain_item':
      return `Obtain ${humanizeAdvancementKey(criterion.itemKey)}`;
    case 'kill_mob':
      return `Defeat ${humanizeAdvancementKey(criterion.mobKey)}`;
    case 'dimension_enter':
      if (criterion.dimensionKey === 'minecraft:the_nether') return 'Enter the Nether';
      if (criterion.dimensionKey === 'minecraft:the_end') return 'Enter the End';
      return `Enter ${humanizeAdvancementKey(criterion.dimensionKey)}`;
    case 'boss_defeat':
      if (criterion.bossKey === 'ender_dragon') return 'Defeat the Ender Dragon';
      return `Defeat ${humanizeAdvancementKey(criterion.bossKey)}`;
  }
}

/**
 * Build the row view for one definition/progress pair. Multi-criterion
 * definitions join their criterion descriptions with ` + ` in criterion
 * order; the count fields mirror `advancementCriteriaRemaining` semantics.
 */
export function describeAdvancement(
  def: AdvancementDefinition,
  progress: AdvancementProgress,
): AdvancementRowView {
  const achievedCount = progress.criteriaAchieved.filter(Boolean).length;
  return {
    key: def.key,
    title: def.title,
    description: def.criteria.map(describeAdvancementCriterion).join(' + '),
    achieved: progress.achieved,
    achievedTick: progress.achievedTick,
    achievedCount,
    totalCount: def.criteria.length,
    remaining: def.criteria.length - achievedCount,
  };
}

/** Row views for the whole catalog, in catalog order. */
export function describeAdvancements(
  catalog: readonly AdvancementDefinition[],
  progresses: readonly AdvancementProgress[],
): AdvancementRowView[] {
  return catalog.map((def, i) =>
    describeAdvancement(def, progresses[i] ?? {
      advancementKey: def.key,
      achieved: false,
      achievedTick: null,
      criteriaAchieved: def.criteria.map(() => false),
    }),
  );
}
