/**
 * Structure template format (099). A `StructureTemplate` is a keyed, validated 3D template:
 * size + sparse blocks (relative integer coordinates, non-negative block ids) + entities
 * (validated data references) + connectors (named attachment points with a facing).
 * `applyStructureTransform` transforms blocks, entities and connectors deterministically:
 * mirror first (x or z), then a clockwise Y rotation about the origin corner (0/90/180/270),
 * with connector facings rotated by the same rules. Direction convention: north = -z,
 * south = +z, east = +x, west = -x, up = +y, down = -y (Minecraft convention).
 * `StructureTemplateRegistry` stores only validated templates with atomic rejection
 * (003 pattern). 100 structure placement and 101 the first default structure consume this.
 */

/** A block-face / attachment direction (Minecraft convention: north = -z). */
export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

/** All documented directions, in a fixed order. */
export const DIRECTIONS: readonly Direction[] = ['north', 'south', 'east', 'west', 'up', 'down'];

/** Maximum template extent per axis (bounds validation). */
export const MAX_TEMPLATE_EXTENT = 64;

/** Template bounding size in blocks. */
export interface StructureSize {
  width: number;
  height: number;
  depth: number;
}

/** One template block at a relative coordinate. */
export interface StructureBlock {
  x: number;
  y: number;
  z: number;
  blockId: number;
}

/** One template entity spawn at a relative coordinate (validated data reference). */
export interface StructureEntity {
  x: number;
  y: number;
  z: number;
  entityKey: string;
}

/** A named attachment point (for chaining structures) at a relative coordinate with a facing. */
export interface StructureConnector {
  key: string;
  x: number;
  y: number;
  z: number;
  facing: Direction;
}

/** A validated structure template. */
export interface StructureTemplate {
  key: string;
  size: StructureSize;
  blocks: StructureBlock[];
  entities: StructureEntity[];
  connectors: StructureConnector[];
}

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function assertPositiveExtent(value: unknown, path: string): void {
  if (!isInteger(value) || value <= 0 || value > MAX_TEMPLATE_EXTENT) {
    throw new Error(`StructureTemplate: ${path} must be an integer in [1, ${MAX_TEMPLATE_EXTENT}], got ${String(value)}`);
  }
}

function assertInBounds(x: unknown, y: unknown, z: unknown, size: StructureSize, path: string): void {
  if (
    !isInteger(x) || !isInteger(y) || !isInteger(z) ||
    x < 0 || x >= size.width || y < 0 || y >= size.height || z < 0 || z >= size.depth
  ) {
    throw new Error(`StructureTemplate: ${path} coordinates must be integers within [0, size) (size ${size.width}x${size.height}x${size.depth}), got (${String(x)}, ${String(y)}, ${String(z)})`);
  }
}

/** Validate an unknown value as a structure template; throws descriptively otherwise. */
export function validateStructureTemplate(input: unknown): StructureTemplate {
  if (typeof input !== 'object' || input === null) {
    throw new Error('StructureTemplate: must be an object');
  }
  const r = input as Record<string, unknown>;
  if (typeof r.key !== 'string' || r.key.length === 0) {
    throw new Error('StructureTemplate: key must be a non-empty string');
  }
  if (typeof r.size !== 'object' || r.size === null) {
    throw new Error('StructureTemplate: size must be an object');
  }
  const sizeInput = r.size as Record<string, unknown>;
  const size: StructureSize = {
    width: sizeInput.width as number,
    height: sizeInput.height as number,
    depth: sizeInput.depth as number,
  };
  assertPositiveExtent(size.width, 'size.width');
  assertPositiveExtent(size.height, 'size.height');
  assertPositiveExtent(size.depth, 'size.depth');

  if (!Array.isArray(r.blocks)) {
    throw new Error('StructureTemplate: blocks must be an array');
  }
  const blocks: StructureBlock[] = [];
  const seenPositions = new Set<string>();
  for (const entry of r.blocks) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('StructureTemplate: blocks entries must be objects');
    }
    const b = entry as Record<string, unknown>;
    assertInBounds(b.x, b.y, b.z, size, 'blocks');
    if (!isInteger(b.blockId) || b.blockId < 0) {
      throw new Error(`StructureTemplate: blocks.blockId must be a non-negative integer, got ${String(b.blockId)}`);
    }
    const positionKey = `${String(b.x)},${String(b.y)},${String(b.z)}`;
    if (seenPositions.has(positionKey)) {
      throw new Error(`StructureTemplate: duplicate block position (${positionKey})`);
    }
    seenPositions.add(positionKey);
    blocks.push({ x: b.x as number, y: b.y as number, z: b.z as number, blockId: b.blockId as number });
  }

  if (!Array.isArray(r.entities)) {
    throw new Error('StructureTemplate: entities must be an array');
  }
  const entities: StructureEntity[] = [];
  for (const entry of r.entities) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('StructureTemplate: entities entries must be objects');
    }
    const e = entry as Record<string, unknown>;
    assertInBounds(e.x, e.y, e.z, size, 'entities');
    if (typeof e.entityKey !== 'string' || e.entityKey.length === 0) {
      throw new Error('StructureTemplate: entities.entityKey must be a non-empty string');
    }
    entities.push({ x: e.x as number, y: e.y as number, z: e.z as number, entityKey: e.entityKey });
  }

  if (!Array.isArray(r.connectors)) {
    throw new Error('StructureTemplate: connectors must be an array');
  }
  const connectors: StructureConnector[] = [];
  const seenKeys = new Set<string>();
  for (const entry of r.connectors) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('StructureTemplate: connectors entries must be objects');
    }
    const c = entry as Record<string, unknown>;
    if (typeof c.key !== 'string' || c.key.length === 0) {
      throw new Error('StructureTemplate: connectors.key must be a non-empty string');
    }
    if (seenKeys.has(c.key)) {
      throw new Error(`StructureTemplate: duplicate connector key: ${c.key}`);
    }
    seenKeys.add(c.key);
    assertInBounds(c.x, c.y, c.z, size, 'connectors');
    if (typeof c.facing !== 'string' || !DIRECTIONS.includes(c.facing as Direction)) {
      throw new Error(`StructureTemplate: connectors.facing must be one of ${DIRECTIONS.join('/')}, got ${String(c.facing)}`);
    }
    connectors.push({ key: c.key, x: c.x as number, y: c.y as number, z: c.z as number, facing: c.facing as Direction });
  }

  return { key: r.key, size, blocks, entities, connectors };
}

/** Y-axis rotation in degrees clockwise from above. */
export type StructureRotation = 0 | 90 | 180 | 270;

/** Mirror axis. */
export type StructureMirror = 'none' | 'x' | 'z';

/** A structure transform: mirror first, then rotation. */
export interface StructureTransform {
  rotation: StructureRotation;
  mirror: StructureMirror;
}

/** Validate an unknown value as a structure transform; throws descriptively otherwise. */
export function validateStructureTransform(input: unknown): StructureTransform {
  if (typeof input !== 'object' || input === null) {
    throw new Error('StructureTemplate: transform must be an object');
  }
  const r = input as Record<string, unknown>;
  if (r.rotation !== 0 && r.rotation !== 90 && r.rotation !== 180 && r.rotation !== 270) {
    throw new Error(`StructureTemplate: transform.rotation must be one of 0/90/180/270, got ${String(r.rotation)}`);
  }
  if (r.mirror !== 'none' && r.mirror !== 'x' && r.mirror !== 'z') {
    throw new Error(`StructureTemplate: transform.mirror must be one of none/x/z, got ${String(r.mirror)}`);
  }
  return { rotation: r.rotation as StructureRotation, mirror: r.mirror as StructureMirror };
}

/** A transformed template: mirrored and rotated blocks/entities/connectors with the new size. */
export interface TransformedStructure {
  size: StructureSize;
  blocks: StructureBlock[];
  entities: StructureEntity[];
  connectors: StructureConnector[];
}

/** Mirror a point about the template axes (size unchanged). */
function mirrorPoint(x: number, y: number, z: number, size: StructureSize, mirror: StructureMirror): [number, number, number] {
  if (mirror === 'x') {
    return [size.width - 1 - x, y, z];
  }
  if (mirror === 'z') {
    return [x, y, size.depth - 1 - z];
  }
  return [x, y, z];
}

/** Rotate a point clockwise about +Y by `rotation`, around the origin corner. */
function rotatePoint(x: number, y: number, z: number, size: StructureSize, rotation: StructureRotation): [number, number, number] {
  switch (rotation) {
    case 90:
      return [size.depth - 1 - z, y, x];
    case 180:
      return [size.width - 1 - x, y, size.depth - 1 - z];
    case 270:
      return [z, y, size.width - 1 - x];
    default:
      return [x, y, z];
  }
}

/** Footprint after a rotation (90/270 transpose width/depth). */
function rotatedSize(size: StructureSize, rotation: StructureRotation): StructureSize {
  if (rotation === 90 || rotation === 270) {
    return { width: size.depth, height: size.height, depth: size.width };
  }
  return { ...size };
}

/** Rotate a facing clockwise about +Y (north -> east -> south -> west). */
function rotateFacing(facing: Direction, rotation: StructureRotation): Direction {
  if (facing === 'up' || facing === 'down') {
    return facing;
  }
  const ring: readonly Direction[] = ['north', 'east', 'south', 'west'];
  const index = ring.indexOf(facing);
  return ring[(index + rotation / 90) % 4]!;
}

/** Mirror a facing about an axis (x: east<->west, z: north<->south). */
function mirrorFacing(facing: Direction, mirror: StructureMirror): Direction {
  if (mirror === 'x') {
    if (facing === 'east') {
      return 'west';
    }
    if (facing === 'west') {
      return 'east';
    }
  }
  if (mirror === 'z') {
    if (facing === 'north') {
      return 'south';
    }
    if (facing === 'south') {
      return 'north';
    }
  }
  return facing;
}

/**
 * Apply a transform to a validated template: mirror first, then rotation. Blocks and entities
 * transform their coordinates; connectors transform coordinates and facings. Output order
 * preserves the input order (deterministic).
 */
export function applyStructureTransform(template: StructureTemplate, transform: StructureTransform): TransformedStructure {
  const mirroredSize = template.size; // mirroring does not change the footprint
  const blocks = template.blocks.map((b) => {
    const [x, y, z] = mirrorPoint(b.x, b.y, b.z, mirroredSize, transform.mirror);
    return { x, y, z, blockId: b.blockId };
  });
  const entities = template.entities.map((e) => {
    const [x, y, z] = mirrorPoint(e.x, e.y, e.z, mirroredSize, transform.mirror);
    return { x, y, z, entityKey: e.entityKey };
  });
  const connectors = template.connectors.map((c) => {
    const [x, y, z] = mirrorPoint(c.x, c.y, c.z, mirroredSize, transform.mirror);
    return { key: c.key, x, y, z, facing: mirrorFacing(c.facing, transform.mirror) };
  });

  const rotation = transform.rotation;
  const size = rotatedSize(mirroredSize, rotation);
  return {
    size,
    blocks: blocks.map((b) => {
      const [x, y, z] = rotatePoint(b.x, b.y, b.z, mirroredSize, rotation);
      return { x, y, z, blockId: b.blockId };
    }),
    entities: entities.map((e) => {
      const [x, y, z] = rotatePoint(e.x, e.y, e.z, mirroredSize, rotation);
      return { x, y, z, entityKey: e.entityKey };
    }),
    connectors: connectors.map((c) => {
      const [x, y, z] = rotatePoint(c.x, c.y, c.z, mirroredSize, rotation);
      return { key: c.key, x, y, z, facing: rotateFacing(c.facing, rotation) };
    }),
  };
}

/** Registry of validated structure templates (duplicate/invalid rejection, no partial state). */
export class StructureTemplateRegistry {
  private readonly templates = new Map<string, StructureTemplate>();

  register(template: StructureTemplate): void {
    const validated = validateStructureTemplate(template);
    if (this.templates.has(validated.key)) {
      throw new Error(`StructureTemplateRegistry: duplicate key: ${validated.key}`);
    }
    this.templates.set(validated.key, validated);
  }

  get(key: string): StructureTemplate | null {
    return this.templates.get(key) ?? null;
  }

  has(key: string): boolean {
    return this.templates.has(key);
  }

  get size(): number {
    return this.templates.size;
  }

  /** All validated templates in registration order (101 extension). */
  all(): StructureTemplate[] {
    return [...this.templates.values()];
  }

  clear(): void {
    this.templates.clear();
  }
}
