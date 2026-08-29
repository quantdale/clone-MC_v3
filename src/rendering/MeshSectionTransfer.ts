import {
  SAMPLE_OUT_OF_BOUNDS,
  SAMPLE_PRESENT,
  type SectionHaloFace,
} from '../world/SectionSnapshot';

export const MESH_SECTION_VOLUME = 16 * 16 * 16;
export const MESH_SECTION_FACE_AREA = 16 * 16;
export const MESH_SECTION_FACES: readonly SectionHaloFace[] = ['west', 'east', 'down', 'up', 'north', 'south'];
/** Hard upper bound for one complete section snapshot transfer. */
export const DEFAULT_MAX_MESH_SECTION_TRANSFER_BYTES = 1024 * 1024;

export interface MeshSectionTransferHalo {
  availability: Uint8Array;
  cells: Uint16Array;
  skyLight: Uint8Array;
  blockLight: Uint8Array;
  fluidLevels: Int8Array;
}

/** Typed, transfer-safe section data. Every view owns its complete ArrayBuffer. */
export interface MeshSectionTransferPayload {
  cells: Uint16Array;
  skyLight: Uint8Array;
  blockLight: Uint8Array;
  fluidLevels?: Int8Array;
  tintClasses?: Uint32Array;
  opaqueIds?: Uint16Array;
  layerById?: Uint8Array;
  halo: Record<SectionHaloFace, MeshSectionTransferHalo>;
}

type NumericSource = ArrayLike<number | null>;

function isArrayLike(value: unknown): value is NumericSource {
  return typeof value === 'object' && value !== null && 'length' in value &&
    Number.isInteger((value as { length?: unknown }).length);
}

function isFullOwnedBuffer(view: ArrayBufferView): boolean {
  try {
    return view.buffer.byteLength >= 0 && view.byteOffset === 0 && view.byteLength === view.buffer.byteLength;
  } catch {
    return false;
  }
}

function assertInteger(value: number, name: string, index: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`MeshSectionTransfer: ${name}[${index}] must be an integer in [${min}, ${max}]`);
  }
}

function copyTyped<T extends Uint16Array | Uint8Array | Uint32Array | Int8Array>(
  source: unknown,
  ctor: { new (length: number): T },
  length: number,
  name: string,
  min: number,
  max: number,
  map: (value: number | null) => number = (value) => value ?? 0,
): T {
  if (!isArrayLike(source) || source.length !== length) {
    throw new RangeError(`MeshSectionTransfer: ${name} must contain ${length} entries`);
  }
  if (ArrayBuffer.isView(source)) {
    if (!(source instanceof ctor) || !isFullOwnedBuffer(source)) {
      throw new TypeError(`MeshSectionTransfer: ${name} must be an owned ${ctor.name} buffer`);
    }
    const typed = source as T & { length: number; [index: number]: number };
    for (let i = 0; i < length; i++) assertInteger(typed[i]!, name, i, min, max);
    return source as T;
  }
  const out = new ctor(length);
  for (let i = 0; i < length; i++) {
    const value = map(source[i]!);
    assertInteger(value, name, i, min, max);
    out[i] = value;
  }
  return out;
}

function normalizeHalo(source: unknown, name: SectionHaloFace): MeshSectionTransferHalo {
  const raw = source as Record<string, unknown> | undefined;
  if (raw === undefined || raw === null || typeof raw !== 'object') {
    return {
      availability: new Uint8Array(MESH_SECTION_FACE_AREA).fill(SAMPLE_OUT_OF_BOUNDS),
      cells: new Uint16Array(MESH_SECTION_FACE_AREA),
      skyLight: new Uint8Array(MESH_SECTION_FACE_AREA),
      blockLight: new Uint8Array(MESH_SECTION_FACE_AREA),
      fluidLevels: new Int8Array(MESH_SECTION_FACE_AREA).fill(-1),
    };
  }
  return {
    availability: copyTyped(raw.availability, Uint8Array, MESH_SECTION_FACE_AREA, `halo.${name}.availability`, SAMPLE_PRESENT, SAMPLE_OUT_OF_BOUNDS),
    cells: copyTyped(raw.cells, Uint16Array, MESH_SECTION_FACE_AREA, `halo.${name}.cells`, 0, 65535),
    skyLight: copyTyped(raw.skyLight, Uint8Array, MESH_SECTION_FACE_AREA, `halo.${name}.skyLight`, 0, 15),
    blockLight: copyTyped(raw.blockLight, Uint8Array, MESH_SECTION_FACE_AREA, `halo.${name}.blockLight`, 0, 15),
    fluidLevels: copyTyped(raw.fluidLevels ?? new Int8Array(MESH_SECTION_FACE_AREA).fill(-1), Int8Array, MESH_SECTION_FACE_AREA, `halo.${name}.fluidLevels`, -1, 15),
  };
}

/** Normalize legacy structured-clone arrays once at the worker transport boundary. */
export function normalizeMeshSectionTransfer(source: {
  cells?: unknown;
  skyLight?: unknown;
  blockLight?: unknown;
  fluidLevels?: unknown;
  tintClasses?: unknown;
  opaqueIds?: unknown;
  layerById?: unknown;
  halo?: unknown;
}): MeshSectionTransferPayload {
  if (source.cells === undefined || source.skyLight === undefined || source.blockLight === undefined) {
    throw new Error('MeshSectionTransfer: cells, skyLight, and blockLight are required');
  }
  const rawHalo = source.halo as Record<string, unknown> | undefined;
  const halo = {} as Record<SectionHaloFace, MeshSectionTransferHalo>;
  for (const face of MESH_SECTION_FACES) halo[face] = normalizeHalo(rawHalo?.[face], face);
  return {
    cells: copyTyped(source.cells, Uint16Array, MESH_SECTION_VOLUME, 'cells', 0, 65535),
    skyLight: copyTyped(source.skyLight, Uint8Array, MESH_SECTION_VOLUME, 'skyLight', 0, 15),
    blockLight: copyTyped(source.blockLight, Uint8Array, MESH_SECTION_VOLUME, 'blockLight', 0, 15),
    fluidLevels: source.fluidLevels === undefined
      ? undefined
      : copyTyped(source.fluidLevels, Int8Array, MESH_SECTION_VOLUME, 'fluidLevels', -1, 15),
    tintClasses: source.tintClasses === undefined
      ? undefined
      : copyTyped(source.tintClasses, Uint32Array, MESH_SECTION_VOLUME, 'tintClasses', 0, 0xffffff),
    opaqueIds: source.opaqueIds === undefined
      ? undefined
      : copyTyped(source.opaqueIds, Uint16Array, source.opaqueIds instanceof Uint16Array ? source.opaqueIds.length : (source.opaqueIds as NumericSource).length, 'opaqueIds', 0, 65535),
    layerById: source.layerById === undefined
      ? undefined
      : copyTyped(source.layerById, Uint8Array, source.layerById instanceof Uint8Array ? source.layerById.length : (source.layerById as NumericSource).length, 'layerById', 0, 3),
    halo,
  };
}

type TypedArrayConstructor = Uint16ArrayConstructor | Uint8ArrayConstructor | Uint32ArrayConstructor | Int8ArrayConstructor;

/** Validate that every typed view is detached-safe, correctly sized, uniquely owned, and bounded. */
export function validateMeshSectionTransferOwnership(
  payload: MeshSectionTransferPayload,
  maxBytes = DEFAULT_MAX_MESH_SECTION_TRANSFER_BYTES,
): void {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('MeshSectionTransfer: maxBytes must be a positive integer');
  }
  const views: Array<[string, ArrayBufferView, TypedArrayConstructor, number]> = [
    ['cells', payload.cells, Uint16Array, MESH_SECTION_VOLUME],
    ['skyLight', payload.skyLight, Uint8Array, MESH_SECTION_VOLUME],
    ['blockLight', payload.blockLight, Uint8Array, MESH_SECTION_VOLUME],
  ];
  if (payload.fluidLevels) views.push(['fluidLevels', payload.fluidLevels, Int8Array, MESH_SECTION_VOLUME]);
  if (payload.tintClasses) views.push(['tintClasses', payload.tintClasses, Uint32Array, MESH_SECTION_VOLUME]);
  if (payload.opaqueIds) views.push(['opaqueIds', payload.opaqueIds, Uint16Array, payload.opaqueIds.length]);
  if (payload.layerById) views.push(['layerById', payload.layerById, Uint8Array, payload.layerById.length]);
  for (const face of MESH_SECTION_FACES) {
    const halo = payload.halo?.[face];
    if (halo === undefined) throw new Error(`MeshSectionTransfer: halo.${face} is required`);
    views.push(
      [`halo.${face}.availability`, halo.availability, Uint8Array, MESH_SECTION_FACE_AREA],
      [`halo.${face}.cells`, halo.cells, Uint16Array, MESH_SECTION_FACE_AREA],
      [`halo.${face}.skyLight`, halo.skyLight, Uint8Array, MESH_SECTION_FACE_AREA],
      [`halo.${face}.blockLight`, halo.blockLight, Uint8Array, MESH_SECTION_FACE_AREA],
      [`halo.${face}.fluidLevels`, halo.fluidLevels, Int8Array, MESH_SECTION_FACE_AREA],
    );
  }
  const buffers = new Set<ArrayBuffer>();
  let totalBytes = 0;
  for (const [name, view, ctor, length] of views) {
    if (!(view instanceof ctor) || (view as unknown as { length: number }).length !== length || !isFullOwnedBuffer(view)) {
      throw new Error(`MeshSectionTransfer: ${name} is detached, incorrectly typed, or has the wrong length`);
    }
    const buffer = view.buffer as ArrayBuffer;
    if (buffers.has(buffer)) throw new Error(`MeshSectionTransfer: duplicate buffer ownership at ${name}`);
    buffers.add(buffer);
    totalBytes += buffer.byteLength;
  }
  if (totalBytes > maxBytes) {
    throw new RangeError(`MeshSectionTransfer: total buffer bytes ${totalBytes} exceed cap ${maxBytes}`);
  }
}

/** Return each owned section buffer exactly once for Worker.postMessage transfer. */
export function collectMeshSectionTransferables(
  payload: MeshSectionTransferPayload,
  maxBytes = DEFAULT_MAX_MESH_SECTION_TRANSFER_BYTES,
): ArrayBuffer[] {
  validateMeshSectionTransferOwnership(payload, maxBytes);
  const buffers: ArrayBuffer[] = [];
  const add = (view: ArrayBufferView | undefined) => { if (view) buffers.push(view.buffer as ArrayBuffer); };
  add(payload.cells); add(payload.skyLight); add(payload.blockLight); add(payload.fluidLevels); add(payload.tintClasses); add(payload.opaqueIds); add(payload.layerById);
  for (const face of MESH_SECTION_FACES) {
    const halo = payload.halo[face];
    add(halo.availability); add(halo.cells); add(halo.skyLight); add(halo.blockLight); add(halo.fluidLevels);
  }
  return buffers;
}
