/**
 * Content expansion (215): data-driven block/item definitions over the existing registries —
 * no new architecture, no registry mutation (the wiring maps these definitions onto 004/006).
 * Pure and headless-safe.
 *
 * Determinism rules:
 * - Ids are valid namespaced ids (004 rules) whose path does NOT start with 'block/' or
 *   'item/' (the kind carries the prefix).
 * - `name` is a non-empty translation key (214); `stackSize` is an integer in [1, 64] (default
 *   64); `hardness` is a finite number >= 0 (default 0); `tags` are non-empty strings
 *   (default []).
 * - Duplicate ids are rejected; the whole payload validates before anything is accepted.
 * - `createContentExpansion` groups by kind preserving registration order; lookups are total.
 */
import {
  createResourceId,
  isValidResourceNamespace,
  isValidResourcePath,
  resourceIdEquals,
  resourceIdToString,
  tryParseResourceId,
  type ResourceId,
} from './ResourceId';

export type ContentKind = 'block' | 'item';

/** One data-driven content definition. */
export interface ContentDefinition {
  readonly id: ResourceId;
  readonly kind: ContentKind;
  /** Translation key (214). */
  readonly name: string;
  /** 1..64 (default 64). */
  readonly stackSize: number;
  /** >= 0 (default 0). */
  readonly hardness: number;
  readonly tags: readonly string[];
}

function toResourceId(value: unknown, what: string): ResourceId {
  if (typeof value === 'string') {
    const parsed = tryParseResourceId(value, 'minecraft');
    if (parsed === null) {
      throw new Error(`Content: ${what} must be a valid namespaced id`);
    }
    return parsed;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).namespace === 'string' &&
    typeof (value as Record<string, unknown>).path === 'string'
  ) {
    const r = value as { namespace: string; path: string };
    if (!isValidResourceNamespace(r.namespace) || !isValidResourcePath(r.path)) {
      throw new Error(`Content: ${what} must be a valid namespaced id`);
    }
    return createResourceId(r.namespace, r.path);
  }
  throw new Error(`Content: ${what} must be a valid namespaced id`);
}

export interface ContentDefinitionInput {
  readonly id: ResourceId | string;
  readonly kind: ContentKind;
  readonly name: string;
  readonly stackSize?: number;
  readonly hardness?: number;
  readonly tags?: readonly string[];
}

/** Build a validated content definition with the documented defaults. */
export function createContentDefinition(input: ContentDefinitionInput): ContentDefinition {
  const id = toResourceId(input.id, 'id');
  if (id.path.startsWith('block/') || id.path.startsWith('item/')) {
    throw new Error(`Content: id path must not start with 'block/' or 'item/'`);
  }
  if (typeof input.name !== 'string' || input.name.length === 0) {
    throw new Error('Content: name must be a non-empty string');
  }
  const stackSize = input.stackSize ?? 64;
  if (!Number.isInteger(stackSize) || stackSize < 1 || stackSize > 64) {
    throw new Error('Content: stackSize must be an integer in [1, 64]');
  }
  const hardness = input.hardness ?? 0;
  if (typeof hardness !== 'number' || !Number.isFinite(hardness) || hardness < 0) {
    throw new Error('Content: hardness must be a finite number >= 0');
  }
  const tags = input.tags ?? [];
  for (const tag of tags) {
    if (typeof tag !== 'string' || tag.length === 0) {
      throw new Error('Content: tags must be non-empty strings');
    }
  }
  return { id, kind: input.kind, name: input.name, stackSize, hardness, tags: [...tags] };
}

/** The validated catalog expansion, grouped by kind (registration order). */
export interface ContentExpansion {
  readonly blocks: readonly ContentDefinition[];
  readonly items: readonly ContentDefinition[];
}

/** Build an expansion; duplicate ids are rejected wholesale. */
export function createContentExpansion(
  definitions: readonly ContentDefinition[],
): ContentExpansion {
  const seen = new Set<string>();
  const blocks: ContentDefinition[] = [];
  const items: ContentDefinition[] = [];
  for (const definition of definitions) {
    const key = resourceIdToString(definition.id);
    if (seen.has(key)) {
      throw new Error(`Content: duplicate content id ${key}`);
    }
    seen.add(key);
    if (definition.kind === 'block') blocks.push(definition);
    else items.push(definition);
  }
  return { blocks, items };
}

/** Look up a definition by id; undefined when missing. */
export function contentById(
  expansion: ContentExpansion,
  id: ResourceId | string,
): ContentDefinition | undefined {
  const target = typeof id === 'string' ? tryParseResourceId(id, 'minecraft') : id;
  if (target === null) return undefined;
  return [...expansion.blocks, ...expansion.items].find((d) => resourceIdEquals(d.id, target));
}

/** The definitions of one kind, in registration order. */
export function contentsOfKind(
  expansion: ContentExpansion,
  kind: ContentKind,
): readonly ContentDefinition[] {
  return kind === 'block' ? expansion.blocks : expansion.items;
}
