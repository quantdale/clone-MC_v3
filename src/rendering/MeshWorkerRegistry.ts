import { RenderCategory, type BlockTypeDefinition } from '../world/BlockRegistry';

export const MESH_LAYER_OPAQUE = 0;
export const MESH_LAYER_TRANSLUCENT = 2;
export const MESH_LAYER_FLUID = 3;

/** Version of the immutable render classification table sent to each mesh worker. */
export const MESH_REGISTRY_TABLE_PROTOCOL_VERSION = 2;

export interface MeshWorkerRegistryTable {
  readonly protocolVersion: number;
  readonly tableId: string;
  readonly opaqueIds: readonly number[];
  /** Indexed by stable block id; missing entries are invalid for referenced ids. */
  readonly layerById: readonly number[];
  /** Worker-safe atlas tile metadata indexed by stable block id. */
  readonly topTileById: readonly number[];
  readonly bottomTileById: readonly number[];
  readonly sideTileById: readonly number[];
}

interface MeshRegistryDefinition {
  id: number;
  opaque: boolean;
  renderCategory: RenderCategory;
  topTile?: number;
  bottomTile?: number;
  sideTile?: number;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function tableIdFor(
  opaqueIds: readonly number[],
  layerById: readonly (number | undefined)[],
  topTileById: readonly (number | undefined)[],
  bottomTileById: readonly (number | undefined)[],
  sideTileById: readonly (number | undefined)[],
): string {
  const signature = layerById
    .map((layer, id) => layer === undefined ? null : `${id}:${opaqueIds.includes(id) ? 1 : 0}:${layer}:${topTileById[id] ?? 0}:${bottomTileById[id] ?? 0}:${sideTileById[id] ?? 0}`)
    .filter((entry): entry is string => entry !== null)
    .join('|');
  return `mesh-registry-v${MESH_REGISTRY_TABLE_PROTOCOL_VERSION}-${fnv1a(signature)}`;
}

/** Build a deterministic, frozen worker table from canonical registry definitions. */
export function createMeshWorkerRegistryTable(
  definitions: readonly MeshRegistryDefinition[] | readonly BlockTypeDefinition[],
  fluidIds: readonly number[] = [],
): MeshWorkerRegistryTable {
  const sorted = [...definitions].sort((a, b) => a.id - b.id);
  const fluids = new Set(fluidIds);
  const layerById: number[] = [];
  const topTileById: number[] = [];
  const bottomTileById: number[] = [];
  const sideTileById: number[] = [];
  const opaqueIds: number[] = [];

  for (const definition of sorted) {
    if (!Number.isInteger(definition.id) || definition.id < 0) {
      throw new RangeError(`MeshWorkerRegistryTable: invalid block id ${String(definition.id)}`);
    }
    const layer = fluids.has(definition.id)
      ? MESH_LAYER_FLUID
      : definition.renderCategory === RenderCategory.Transparent
        ? MESH_LAYER_TRANSLUCENT
        : MESH_LAYER_OPAQUE;
    layerById[definition.id] = layer;
    topTileById[definition.id] = definition.topTile ?? 0;
    bottomTileById[definition.id] = definition.bottomTile ?? 0;
    sideTileById[definition.id] = definition.sideTile ?? 0;
    if (definition.opaque) opaqueIds.push(definition.id);
  }

  const table: MeshWorkerRegistryTable = {
    protocolVersion: MESH_REGISTRY_TABLE_PROTOCOL_VERSION,
    tableId: tableIdFor(opaqueIds, layerById, topTileById, bottomTileById, sideTileById),
    opaqueIds: Object.freeze(opaqueIds),
    layerById: Object.freeze(layerById),
    topTileById: Object.freeze(topTileById),
    bottomTileById: Object.freeze(bottomTileById),
    sideTileById: Object.freeze(sideTileById),
  };
  return Object.freeze(table);
}

function isLayer(value: unknown): value is number {
  return value === MESH_LAYER_OPAQUE || value === MESH_LAYER_TRANSLUCENT || value === MESH_LAYER_FLUID;
}

/** Validate an untrusted worker initialization table before retaining it. */
export function validateMeshWorkerRegistryTable(input: unknown): MeshWorkerRegistryTable {
  if (typeof input !== 'object' || input === null) {
    throw new Error('MeshWorkerRegistryTable: expected an object');
  }
  const raw = input as Record<string, unknown>;
  if (raw.protocolVersion !== MESH_REGISTRY_TABLE_PROTOCOL_VERSION) {
    throw new Error(`MeshWorkerRegistryTable: unsupported protocol version ${String(raw.protocolVersion)}`);
  }
  if (typeof raw.tableId !== 'string' || raw.tableId.length === 0) {
    throw new Error('MeshWorkerRegistryTable: tableId must be a non-empty string');
  }
  if (!Array.isArray(raw.opaqueIds) || !raw.opaqueIds.every((id) => Number.isInteger(id) && id >= 0)) {
    throw new Error('MeshWorkerRegistryTable: opaqueIds must be non-negative integers');
  }
  if (!Array.isArray(raw.layerById) || !raw.layerById.every((layer) => layer === undefined || isLayer(layer))) {
    throw new Error('MeshWorkerRegistryTable: layerById contains an invalid layer');
  }
  const tileTable = (name: string): number[] => {
    const value = raw[name];
    if (!Array.isArray(value) || value.length !== (raw.layerById as unknown[]).length ||
        !value.every((tile) => Number.isInteger(tile) && (tile as number) >= 0)) {
      throw new Error(`MeshWorkerRegistryTable: ${name} contains invalid tile metadata`);
    }
    return [...value] as number[];
  };
  const topTileById = tileTable('topTileById');
  const bottomTileById = tileTable('bottomTileById');
  const sideTileById = tileTable('sideTileById');
  const opaqueIds = [...new Set(raw.opaqueIds as number[])].sort((a, b) => a - b);
  const layerById = [...raw.layerById] as number[];
  for (const id of opaqueIds) {
    if (layerById[id] !== MESH_LAYER_OPAQUE) {
      throw new Error(`MeshWorkerRegistryTable: opaque id ${id} is not classified opaque`);
    }
  }
  const expectedTableId = tableIdFor(opaqueIds, layerById, topTileById, bottomTileById, sideTileById);
  if (raw.tableId !== expectedTableId) {
    throw new Error('MeshWorkerRegistryTable: tableId does not match table contents');
  }
  return Object.freeze({
    protocolVersion: MESH_REGISTRY_TABLE_PROTOCOL_VERSION,
    tableId: raw.tableId,
    opaqueIds: Object.freeze(opaqueIds),
    layerById: Object.freeze(layerById),
    topTileById: Object.freeze(topTileById),
    bottomTileById: Object.freeze(bottomTileById),
    sideTileById: Object.freeze(sideTileById),
  });
}
