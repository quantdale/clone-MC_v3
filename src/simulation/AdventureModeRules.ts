/**
 * Adventure-mode rules (194): the pure break/place permission rules plus the helper that resolves
 * an item's declared block set from direct ids and tag membership — "restricted breaking/placing
 * using item components/tags", registry-free and headless-safe.
 *
 * Vanilla semantics:
 *   survival / creative : always allowed to break and place.
 *   spectator           : never interacts.
 *   adventure           : allowed ONLY for blocks in the held item's declared set (CanDestroy /
 *                         CanPlaceOn via components or tags). An item with no declarations is
 *                         allowed to break/place nothing.
 *
 * The tag lookup is injected as `(tagId) => ReadonlySet<string> | undefined` so callers can back
 * it with a TagRegistry (005) without coupling this module to it; unknown tags contribute nothing.
 * Block ids are canonical strings (`minecraft:stone` form).
 */
import type { GameMode } from './GameModeFramework';

/**
 * Whether `blockId` may be broken in `mode`. `allowed` is the held item's CanDestroy set (already
 * component/tag-resolved by the caller). Total function: never throws.
 */
export function canBreakBlock(
  mode: GameMode,
  blockId: string,
  allowed: ReadonlySet<string>,
): boolean {
  if (mode === 'adventure') return allowed.has(blockId);
  return mode !== 'spectator';
}

/**
 * Whether `blockId` may be placed in `mode`. `allowed` is the held item's CanPlaceOn set.
 * Total function: never throws.
 */
export function canPlaceBlock(
  mode: GameMode,
  blockId: string,
  allowed: ReadonlySet<string>,
): boolean {
  if (mode === 'adventure') return allowed.has(blockId);
  return mode !== 'spectator';
}

/**
 * Resolve an item's declared block set: the deduplicated union of `directIds` (component-declared
 * blocks) and the members of every tag whose lookup returns a set. Lookups returning `undefined`
 * (unknown/missing tags) contribute nothing. Empty inputs yield the empty set. Never throws.
 */
export function resolveBlockPermissionSet(
  directIds: readonly string[],
  tagIds: readonly string[],
  lookupTag: (tagId: string) => ReadonlySet<string> | undefined,
): ReadonlySet<string> {
  const resolved = new Set<string>();
  for (const id of directIds) resolved.add(id);
  for (const tagId of tagIds) {
    const members = lookupTag(tagId);
    if (members === undefined) continue;
    for (const member of members) resolved.add(member);
  }
  return resolved;
}
