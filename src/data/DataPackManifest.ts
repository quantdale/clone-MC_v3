/**
 * Internal data-pack format (212): the canonical namespaced gameplay-data manifest — recipes,
 * loot tables, tags, worldgen, and advancements, validated and resolved through an INJECTED
 * registry check. Pure and headless-safe: no registry access (the wiring adapts 103/005/186 and
 * the loot/worldgen registries into a `(kind, id) => boolean` lookup), no mutation of inputs.
 * The manifest model IS the format; 213 reloads it atomically.
 *
 * Determinism rules:
 * - `formatVersion` is 1; `name`/`description` are non-empty strings.
 * - Entry ids are validated namespaced ids; paths are non-empty relative paths without a
 *   leading '/' or '..' segments; kinds are one of the five; an id may appear once per kind.
 * - Validation rejects the whole payload on any violation; `resolveEntries` is total and
 *   returns missing entries in registration order.
 * - `entryPath` = `data/<namespace>/<kind>/<path>`.
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

export type DataKind = 'recipe' | 'loot_table' | 'tag' | 'worldgen' | 'advancement';

const DATA_KINDS: readonly string[] = ['recipe', 'loot_table', 'tag', 'worldgen', 'advancement'];

/** One namespaced data entry. */
export interface DataPackEntry {
  readonly id: ResourceId;
  readonly kind: DataKind;
  /** Relative pack path (no leading '/', no '..' segments). */
  readonly path: string;
}

/** A validated data-pack manifest. */
export interface DataPackManifest {
  readonly formatVersion: 1;
  readonly name: string;
  readonly description: string;
  readonly entries: readonly DataPackEntry[];
}

function isDataKind(value: unknown): value is DataKind {
  return typeof value === 'string' && DATA_KINDS.includes(value);
}

function isValidRelativePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (path.startsWith('/')) return false;
  const segments = path.split('/');
  return segments.every((s) => s.length > 0 && s !== '..' && s !== '.');
}

function toResourceId(value: unknown, what: string): ResourceId {
  if (typeof value === 'string') {
    const parsed = tryParseResourceId(value, 'minecraft');
    if (parsed === null) {
      throw new Error(`DataPack: ${what} must be a valid namespaced id`);
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
      throw new Error(`DataPack: ${what} must be a valid namespaced id`);
    }
    return createResourceId(r.namespace, r.path);
  }
  throw new Error(`DataPack: ${what} must be a valid namespaced id`);
}

function validateEntry(value: unknown, index: number): DataPackEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`DataPack: entries ${index} must be an object`);
  }
  const e = value as Record<string, unknown>;
  const id = toResourceId(e.id, `entries ${index}.id`);
  if (!isDataKind(e.kind)) {
    throw new Error(
      `DataPack: entries ${index}.kind must be recipe, loot_table, tag, worldgen, or advancement`,
    );
  }
  if (!isValidRelativePath(e.path)) {
    throw new Error(`DataPack: entries ${index}.path must be a relative path without '..'`);
  }
  return { id, kind: e.kind, path: e.path };
}

/** Validate an unknown value as a manifest; throws descriptively, accepts nothing partially. */
export function validateDataPackManifest(input: unknown): DataPackManifest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('DataPack: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.formatVersion !== 1) {
    throw new Error(`DataPack: unsupported format version ${String(r.formatVersion)}`);
  }
  if (typeof r.name !== 'string' || r.name.length === 0) {
    throw new Error('DataPack: name must be a non-empty string');
  }
  if (typeof r.description !== 'string' || r.description.length === 0) {
    throw new Error('DataPack: description must be a non-empty string');
  }
  if (!Array.isArray(r.entries)) {
    throw new Error('DataPack: entries must be an array');
  }
  const entries: DataPackEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < r.entries.length; i += 1) {
    const entry = validateEntry(r.entries[i], i);
    const key = `${entry.kind}:${resourceIdToString(entry.id)}`;
    if (seen.has(key)) {
      throw new Error(`DataPack: duplicate entry ${entry.kind} ${resourceIdToString(entry.id)}`);
    }
    seen.add(key);
    entries.push(entry);
  }
  for (const key of Object.keys(r)) {
    if (key !== 'formatVersion' && key !== 'name' && key !== 'description' && key !== 'entries') {
      throw new Error(`DataPack: unknown key ${key}`);
    }
  }
  return { formatVersion: 1, name: r.name, description: r.description, entries };
}

/** Build a validated manifest. */
export function createDataPackManifest(
  name: string,
  description: string,
  entries: readonly DataPackEntry[],
): DataPackManifest {
  return validateDataPackManifest({ formatVersion: 1, name, description, entries });
}

/** The first entry with the id (any kind); undefined when missing. */
export function entryById(manifest: DataPackManifest, id: ResourceId | string): DataPackEntry | undefined {
  const target = typeof id === 'string' ? tryParseResourceId(id, 'minecraft') : id;
  if (target === null) return undefined;
  return manifest.entries.find((entry) => resourceIdEquals(entry.id, target));
}

/** Entries of one kind, in registration order. */
export function entriesOfKind(manifest: DataPackManifest, kind: DataKind): readonly DataPackEntry[] {
  return manifest.entries.filter((entry) => entry.kind === kind);
}

/** Entries grouped by kind (absent kinds present as empty arrays), registration order kept. */
export function entriesByKind(
  manifest: DataPackManifest,
): Readonly<Record<DataKind, readonly DataPackEntry[]>> {
  const groups: Record<string, DataPackEntry[]> = {};
  for (const kind of DATA_KINDS) {
    groups[kind] = [];
  }
  for (const entry of manifest.entries) {
    groups[entry.kind]!.push(entry);
  }
  return groups as Record<DataKind, readonly DataPackEntry[]>;
}

/** The canonical data-pack path. */
export function entryPath(entry: DataPackEntry): string {
  return `data/${entry.id.namespace}/${entry.kind}/${entry.path}`;
}

/**
 * Report the entries that the injected registry check cannot resolve, in registration order.
 * `hasEntry(kind, id)` adapts the concrete registries (103 recipes, 005 tags, 186 advancements,
 * loot/worldgen). Total and side-effect free.
 */
export function resolveEntries(
  manifest: DataPackManifest,
  hasEntry: (kind: DataKind, id: ResourceId) => boolean,
): readonly DataPackEntry[] {
  return manifest.entries.filter((entry) => !hasEntry(entry.kind, entry.id));
}
