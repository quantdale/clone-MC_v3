import { RenderCategory, type BlockTypeDefinition } from '../world/BlockRegistry';

export const MESH_LAYER_OPAQUE = 0;
export const MESH_LAYER_TRANSLUCENT = 2;
export const MESH_LAYER_FLUID = 3;

/** Version of the immutable render classification table sent to each mesh worker. */
export const MESH_REGISTRY_TABLE_PROTOCOL_VERSION = 1;

export interface MeshWorkerRegistryTable {
  readonly protocolVersion: number;
  readonly tableId: string;
  readonly opaqueIds: readonly number[];
  /** Indexed by stable block id; missing entries are invalid for referenced ids. */
  readonly layerById: readonly number[];
}

interface MeshRegistryDefinition {
  id: number;
  opaque: boolean;
  renderCategory: RenderCategory;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function tableIdFor(opaqueIds: readonly number[], layerById: readonly (number | undefined)[]): string {
  const signature = layerById
    .map((layer, id) => layer === undefined ? null : `${id}:${opaqueIds.includes(id) ? 1 : 0}:${layer}`)
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
    if (definition.opaque) opaqueIds.push(definition.id);
  }

  const table: MeshWorkerRegistryTable = {
    protocolVersion: MESH_REGISTRY_TABLE_PROTOCOL_VERSION,
    tableId: tableIdFor(opaqueIds, layerById),
    opaqueIds: Object.freeze(opaqueIds),
    layerById: Object.freeze(layerById),
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
  const opaqueIds = [...new Set(raw.opaqueIds as number[])].sort((a, b) => a - b);
  const layerById = [...raw.layerById] as number[];
  for (const id of opaqueIds) {
    if (layerById[id] !== MESH_LAYER_OPAQUE) {
      throw new Error(`MeshWorkerRegistryTable: opaque id ${id} is not classified opaque`);
    }
  }
  const expectedTableId = tableIdFor(opaqueIds, layerById);
  if (raw.tableId !== expectedTableId) {
    throw new Error('MeshWorkerRegistryTable: tableId does not match table contents');
  }
  return Object.freeze({
    protocolVersion: MESH_REGISTRY_TABLE_PROTOCOL_VERSION,
    tableId: raw.tableId,
    opaqueIds: Object.freeze(opaqueIds),
    layerById: Object.freeze(layerById),
  });
}
