/**
 * Internal resource-pack format (211): the canonical namespaced asset manifest — textures,
 * models, sounds, and metadata organized by namespace with strict validate-before-accept
 * construction. Pure and headless-safe: no file access, no mutation of inputs, no registry
 * changes. The manifest model IS the format; the loader resolves assets via `assetPath`.
 *
 * Determinism rules:
 * - `formatVersion` is 1; `name`/`description` are non-empty strings.
 * - Asset ids are validated namespaced ids (004's rules); paths are non-empty relative paths
 *   without a leading '/' or '..' segments; `metadata` is an object and only on metadata-type
 *   assets; duplicate ids are rejected.
 * - Validation rejects the whole payload on any violation; lookups are total.
 * - `assetPath` = `assets/<namespace>/<type>/<path>`.
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

export type AssetType = 'texture' | 'model' | 'sound' | 'metadata';

const ASSET_TYPES: readonly string[] = ['texture', 'model', 'sound', 'metadata'];

/** One namespaced asset. */
export interface ResourceAsset {
  readonly id: ResourceId;
  readonly type: AssetType;
  /** Relative asset path (no leading '/', no '..' segments). */
  readonly path: string;
  /** Opaque metadata; metadata-type assets only. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A validated resource-pack manifest. */
export interface ResourcePackManifest {
  readonly formatVersion: 1;
  readonly name: string;
  readonly description: string;
  readonly assets: readonly ResourceAsset[];
}

function isAssetType(value: unknown): value is AssetType {
  return typeof value === 'string' && ASSET_TYPES.includes(value);
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
      throw new Error(`ResourcePack: ${what} must be a valid namespaced id`);
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
      throw new Error(`ResourcePack: ${what} must be a valid namespaced id`);
    }
    return createResourceId(r.namespace, r.path);
  }
  throw new Error(`ResourcePack: ${what} must be a valid namespaced id`);
}

function validateAsset(value: unknown, index: number): ResourceAsset {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`ResourcePack: assets ${index} must be an object`);
  }
  const a = value as Record<string, unknown>;
  const id = toResourceId(a.id, `assets ${index}.id`);
  if (!isAssetType(a.type)) {
    throw new Error(`ResourcePack: assets ${index}.type must be texture, model, sound, or metadata`);
  }
  if (!isValidRelativePath(a.path)) {
    throw new Error(`ResourcePack: assets ${index}.path must be a relative path without '..'`);
  }
  const hasMetadata = a.metadata !== undefined;
  if (hasMetadata && a.type !== 'metadata') {
    throw new Error(`ResourcePack: assets ${index}.metadata must be an object on metadata assets`);
  }
  if (
    hasMetadata &&
    (typeof a.metadata !== 'object' || a.metadata === null || Array.isArray(a.metadata))
  ) {
    throw new Error(`ResourcePack: assets ${index}.metadata must be an object on metadata assets`);
  }
  const asset: ResourceAsset = {
    id,
    type: a.type,
    path: a.path,
    ...(hasMetadata ? { metadata: a.metadata as Readonly<Record<string, unknown>> } : {}),
  };
  return asset;
}

/**
 * Validate an unknown value as a manifest; throws descriptively and accepts nothing partially.
 */
export function validateResourcePackManifest(input: unknown): ResourcePackManifest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('ResourcePack: expected an object');
  }
  const r = input as Record<string, unknown>;
  if (r.formatVersion !== 1) {
    throw new Error(`ResourcePack: unsupported format version ${String(r.formatVersion)}`);
  }
  if (typeof r.name !== 'string' || r.name.length === 0) {
    throw new Error('ResourcePack: name must be a non-empty string');
  }
  if (typeof r.description !== 'string' || r.description.length === 0) {
    throw new Error('ResourcePack: description must be a non-empty string');
  }
  if (!Array.isArray(r.assets)) {
    throw new Error('ResourcePack: assets must be an array');
  }
  const assets: ResourceAsset[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < r.assets.length; i += 1) {
    const asset = validateAsset(r.assets[i], i);
    const key = resourceIdToString(asset.id);
    if (seen.has(key)) {
      throw new Error(`ResourcePack: duplicate asset id ${key}`);
    }
    seen.add(key);
    assets.push(asset);
  }
  for (const key of Object.keys(r)) {
    if (key !== 'formatVersion' && key !== 'name' && key !== 'description' && key !== 'assets') {
      throw new Error(`ResourcePack: unknown key ${key}`);
    }
  }
  return { formatVersion: 1, name: r.name, description: r.description, assets };
}

/** Build a validated manifest. */
export function createResourcePackManifest(
  name: string,
  description: string,
  assets: readonly ResourceAsset[],
): ResourcePackManifest {
  return validateResourcePackManifest({ formatVersion: 1, name, description, assets });
}

/** Look up an asset by id (string or ResourceId); undefined when missing. */
export function assetById(manifest: ResourcePackManifest, id: ResourceId | string): ResourceAsset | undefined {
  const target = typeof id === 'string' ? tryParseResourceId(id, 'minecraft') : id;
  if (target === null) return undefined;
  return manifest.assets.find((asset) => resourceIdEquals(asset.id, target));
}

/** Assets grouped by namespace, preserving registration order within each group. */
export function assetsByNamespace(
  manifest: ResourcePackManifest,
): Readonly<Record<string, readonly ResourceAsset[]>> {
  const groups: Record<string, ResourceAsset[]> = {};
  for (const asset of manifest.assets) {
    const ns = asset.id.namespace;
    const list = groups[ns];
    if (list === undefined) groups[ns] = [asset];
    else list.push(asset);
  }
  return groups;
}

/** Assets of one type, in registration order. */
export function assetsOfType(manifest: ResourcePackManifest, type: AssetType): readonly ResourceAsset[] {
  return manifest.assets.filter((asset) => asset.type === type);
}

/** The canonical loader path. */
export function assetPath(asset: ResourceAsset): string {
  return `assets/${asset.id.namespace}/${asset.type}/${asset.path}`;
}
