/**
 * Adventure permission composition (266): read a held stack's CanDestroy /
 * CanPlaceOn declarations and compose them with the VERIFIED 194
 * `AdventureModeRules` over the live block-tag registry.
 *
 * Declaration encoding (see `StackDataComponents`): the component value is a
 * flat record of keys to `true`. Keys are canonical block ids
 * (`minecraft:stone`) or `#`-prefixed block-tag references
 * (`#minecraft:logs`). The `#` split is 266-local and happens here; component
 * validation itself accepts any non-empty-string key.
 *
 * Pure and headless-safe: the tag lookup is injected as
 * `(tagId) => ReadonlySet<string> | undefined` (unknown tags contribute
 * nothing, matching 194). Every export is total: malformed stacks, throwing
 * lookups, and unknown modes degrade to the empty set / denial, never throw.
 */
import type { ResourceId } from '../data/ResourceId';
import type { StackComponentMap } from '../inventory/StackDataComponents';
import {
  CAN_DESTROY_COMPONENT,
  CAN_PLACE_ON_COMPONENT,
} from '../inventory/StackDataComponents';
import type { GameMode } from './GameModeFramework';
import {
  canBreakBlock,
  canPlaceBlock,
  resolveBlockPermissionSet,
} from './AdventureModeRules';

/** A stack carrier: only the optional component map is read. */
export interface PermissionStack {
  readonly components?: StackComponentMap | undefined;
}

/** Tag lookup injected by the caller (live: Game's block-tag adapter). */
export type BlockTagLookup = (tagId: string) => ReadonlySet<string> | undefined;

/** Split declaration keys: `#`-prefixed keys are tag references (prefix stripped). */
export interface SplitPermissionKeys {
  readonly directIds: string[];
  readonly tagIds: string[];
}

/**
 * Split a declaration value into direct block ids and tag references. A
 * non-object value (absent component, malformed payload) yields empty lists;
 * non-string keys and non-`true` values are skipped; a bare `'#'` is skipped.
 * Never throws.
 */
export function splitPermissionKeys(value: unknown): SplitPermissionKeys {
  const directIds: string[] = [];
  const tagIds: string[] = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { directIds, tagIds };
  }
  for (const key of Object.keys(value)) {
    if (typeof key !== 'string' || key.length === 0) continue;
    if ((value as Record<string, unknown>)[key] !== true) continue;
    if (key.startsWith('#')) {
      const tag = key.slice(1);
      if (tag.length > 0) tagIds.push(tag);
      continue;
    }
    directIds.push(key);
  }
  return { directIds, tagIds };
}

/**
 * Resolve the held stack's declared set for one component (CanDestroy or
 * CanPlaceOn): split the component value, then union direct ids with resolved
 * tag members via 194 `resolveBlockPermissionSet`. A null/absent stack, an
 * absent component, an unreadable map, or a throwing lookup all yield the
 * empty set. Never throws.
 */
export function getHeldPermissionSet(
  stack: PermissionStack | null | undefined,
  componentId: ResourceId,
  lookupTag: BlockTagLookup,
): ReadonlySet<string> {
  const empty = new Set<string>();
  let raw: unknown;
  try {
    raw = stack?.components?.get(componentId) ?? undefined;
  } catch {
    return empty;
  }
  const { directIds, tagIds } = splitPermissionKeys(raw);
  try {
    return resolveBlockPermissionSet(directIds, tagIds, lookupTag);
  } catch {
    return empty;
  }
}

/**
 * Whether `blockResourceId` (canonical `minecraft:stone` form) may be broken
 * while holding `stack` in `mode`: the 194 `canBreakBlock` table over the
 * held CanDestroy set. Non-adventure modes never consult the stack
 * (survival/creative allow, spectator denies per 194). Never throws.
 */
export function canBreakHeld(
  mode: GameMode,
  stack: PermissionStack | null | undefined,
  blockResourceId: string,
  lookupTag: BlockTagLookup,
): boolean {
  if (mode !== 'adventure') {
    return canBreakBlock(mode, blockResourceId, EMPTY_SET);
  }
  return canBreakBlock(
    mode,
    blockResourceId,
    getHeldPermissionSet(stack, CAN_DESTROY_COMPONENT, lookupTag),
  );
}

/**
 * Whether `blockResourceId` may be placed while holding `stack` in `mode`:
 * the 194 `canPlaceBlock` table over the held CanPlaceOn set. Same
 * non-adventure short-circuit as `canBreakHeld`. Never throws.
 */
export function canPlaceHeld(
  mode: GameMode,
  stack: PermissionStack | null | undefined,
  blockResourceId: string,
  lookupTag: BlockTagLookup,
): boolean {
  if (mode !== 'adventure') {
    return canPlaceBlock(mode, blockResourceId, EMPTY_SET);
  }
  return canPlaceBlock(
    mode,
    blockResourceId,
    getHeldPermissionSet(stack, CAN_PLACE_ON_COMPONENT, lookupTag),
  );
}

/** Shared frozen empty set for the non-adventure short-circuit (194 ignores it). */
const EMPTY_SET: ReadonlySet<string> = Object.freeze(new Set<string>());
