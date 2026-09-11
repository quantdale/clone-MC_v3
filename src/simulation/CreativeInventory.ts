import type { ItemTypeRegistry } from '../inventory/ItemRegistry';
import type { BlockTypeRegistry } from '../world/BlockRegistry';

/**
 * Creative inventory catalog (265): the browse/search model behind the live
 * creative menu. Pure/headless: no DOM, no mutation, no throws on registry
 * drift (an unresolvable `placeBlock` reference yields `blockId: null` and the
 * row is still listed — placement follows the existing blocked path).
 */

/** One grantable row in the creative menu. */
export interface CreativeItemView {
  /** Stable numeric item id (the grant identity). */
  id: number;
  /** Stable registry string key. */
  key: string;
  /** Human-readable display name. */
  name: string;
  /** Numeric block id placed by this item, or null when unresolvable. */
  blockId: number | null;
  /** Full-stack grant size. */
  stackSize: number;
}

/**
 * List every registry item with a `placeBlock` target in registration order.
 * Non-placeable items (tools, food, materials without a block form) are
 * excluded. Never throws: unresolvable block references become null rows.
 */
export function listCreativeItems(
  itemRegistry: ItemTypeRegistry,
  blockRegistry: BlockTypeRegistry,
): CreativeItemView[] {
  const views: CreativeItemView[] = [];
  for (const def of itemRegistry.all()) {
    if (!def.placeBlock) continue;
    let blockId: number | null = null;
    try {
      blockId = blockRegistry.getByResourceId(def.placeBlock).id;
    } catch {
      blockId = null;
    }
    views.push({ id: def.id, key: def.key, name: def.name, blockId, stackSize: def.stackSize });
  }
  return views;
}

/**
 * Filter creative rows by case-insensitive substring over name/key (204
 * search parity). A blank/whitespace query returns every row in order. The
 * input array is never mutated; the result is a fresh array in stable order.
 */
export function searchCreativeItems(
  views: readonly CreativeItemView[],
  query: string,
): CreativeItemView[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [...views];
  return views.filter(
    (view) =>
      view.name.toLowerCase().includes(normalized) || view.key.toLowerCase().includes(normalized),
  );
}
