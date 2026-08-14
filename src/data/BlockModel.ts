/**
 * Block model data schema (059). A `BlockModel` describes a block's render geometry as box elements
 * with per-face texture references, in model units `[0, 16]`. `validateBlockModel` rejects malformed
 * models strictly; `BlockModelRegistry` stores validated models per ResourceId key with duplicate
 * rejection. Rendering (063) and blockstate resolution (060) consume this schema.
 */

/** The six block faces. */
export type ModelFace = 'up' | 'down' | 'north' | 'south' | 'east' | 'west';

const MODEL_FACES: ReadonlySet<string> = new Set(['up', 'down', 'north', 'south', 'east', 'west']);

/** Per-face render data: texture reference plus optional UVs and cull rule. */
export interface BlockModelFace {
  /** Texture key from the model's `textures` map, or a `#`-prefixed parent reference. */
  texture: string;
  /** UV rectangle `[u1, v1, u2, v2]` in texture-pixel units; optional (defaults per face). */
  uv?: [number, number, number, number];
  /** Face to cull against (`null` = never cull; absent = cull when the neighbor is opaque). */
  cullface?: ModelFace | null;
}

/** One box element of the model. */
export interface BlockModelElement {
  /** Minimum corner in model units. */
  from: [number, number, number];
  /** Maximum corner in model units. */
  to: [number, number, number];
  /** Per-face render data (a face may be absent = no geometry). */
  faces: Partial<Record<ModelFace, BlockModelFace>>;
}

/** A block render model. */
export interface BlockModel {
  /** Optional parent model key to inherit from (resolved by 060). */
  parent?: string;
  /** Texture key → texture reference map. */
  textures: Record<string, string>;
  /** Box elements composing the model. */
  elements: BlockModelElement[];
}

function isFinite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every(isFinite);
}

function isUv(v: unknown): v is [number, number, number, number] {
  return Array.isArray(v) && v.length === 4 && v.every(isFinite);
}

function validateFace(face: unknown, context: string): BlockModelFace {
  if (typeof face !== 'object' || face === null) {
    throw new Error(`BlockModel: ${context} face must be an object`);
  }
  const r = face as Record<string, unknown>;
  if (typeof r.texture !== 'string' || r.texture.length === 0) {
    throw new Error(`BlockModel: ${context} face texture must be a non-empty string`);
  }
  if (r.uv !== undefined && !isUv(r.uv)) {
    throw new Error(`BlockModel: ${context} face uv must be four finite numbers`);
  }
  if (r.cullface !== undefined && r.cullface !== null && !MODEL_FACES.has(r.cullface as string)) {
    throw new Error(`BlockModel: ${context} face cullface must be a valid face or null`);
  }
  const out: BlockModelFace = { texture: r.texture as string };
  if (r.uv !== undefined) out.uv = r.uv as [number, number, number, number];
  if (r.cullface !== undefined) out.cullface = r.cullface as ModelFace | null;
  return out;
}

/**
 * Validate an unknown value as a `BlockModel`. Returns the same value (narrowed) on success; throws
 * a descriptive `Error` on any invalid field. Does not coerce types.
 */
export function validateBlockModel(input: unknown): BlockModel {
  if (typeof input !== 'object' || input === null) {
    throw new Error('BlockModel: expected an object');
  }
  const r = input as Record<string, unknown>;

  if (r.parent !== undefined && (typeof r.parent !== 'string' || r.parent.length === 0)) {
    throw new Error('BlockModel: parent must be a non-empty string');
  }
  if (typeof r.textures !== 'object' || r.textures === null || Array.isArray(r.textures)) {
    throw new Error('BlockModel: textures must be an object');
  }
  for (const [key, value] of Object.entries(r.textures as Record<string, unknown>)) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`BlockModel: texture '${key}' must be a non-empty string`);
    }
  }
  if (!Array.isArray(r.elements)) {
    throw new Error('BlockModel: elements must be an array');
  }

  const elements: BlockModelElement[] = [];
  for (let i = 0; i < (r.elements as unknown[]).length; i++) {
    const raw = (r.elements as unknown[])[i];
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`BlockModel: elements[${i}] must be an object`);
    }
    const e = raw as Record<string, unknown>;
    if (!isVec3(e.from) || !isVec3(e.to)) {
      throw new Error(`BlockModel: elements[${i}] from/to must be three finite numbers`);
    }
    const from = e.from as [number, number, number];
    const to = e.to as [number, number, number];
    for (let a = 0; a < 3; a++) {
      if (from[a]! < 0 || from[a]! > 16 || to[a]! < 0 || to[a]! > 16) {
        throw new Error(`BlockModel: elements[${i}] coordinates must be within [0, 16]`);
      }
      if (from[a]! >= to[a]!) {
        throw new Error(`BlockModel: elements[${i}] from must be less than to on every axis`);
      }
    }
    if (typeof e.faces !== 'object' || e.faces === null) {
      throw new Error(`BlockModel: elements[${i}] faces must be an object`);
    }
    const faces: Partial<Record<ModelFace, BlockModelFace>> = {};
    for (const [faceKey, faceValue] of Object.entries(e.faces as Record<string, unknown>)) {
      if (!MODEL_FACES.has(faceKey)) {
        throw new Error(`BlockModel: elements[${i}] has invalid face '${faceKey}'`);
      }
      faces[faceKey as ModelFace] = validateFace(faceValue, `elements[${i}].${faceKey}`);
    }
    elements.push({ from, to, faces });
  }

  const out: BlockModel = { textures: r.textures as Record<string, string>, elements };
  if (r.parent !== undefined) out.parent = r.parent as string;
  return out;
}

/** Stores validated block models keyed by ResourceId. */
export class BlockModelRegistry {
  private readonly models = new Map<string, BlockModel>();

  /** Register a validated model; throws on invalid models or duplicate keys. */
  register(key: string, model: BlockModel): void {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('BlockModelRegistry: key must be a non-empty string');
    }
    const valid = validateBlockModel(model);
    if (this.models.has(key)) {
      throw new Error(`BlockModelRegistry: duplicate model '${key}'`);
    }
    this.models.set(key, valid);
  }

  /** The model for `key`, or `null`. */
  get(key: string): BlockModel | null {
    return this.models.get(key) ?? null;
  }

  /** Whether a model is registered for `key`. */
  has(key: string): boolean {
    return this.models.has(key);
  }

  /** Number of registered models. */
  get size(): number {
    return this.models.size;
  }

  /** Remove all models. */
  clear(): void {
    this.models.clear();
  }
}
