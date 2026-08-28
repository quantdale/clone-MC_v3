import { type ResourceId, createResourceId, resourceIdToString } from './ResourceId';
import { Registry, RegistryError } from './Registry';

const rid = (path: string): ResourceId => createResourceId('minecraft', path);

/** Definition of one dimension's vertical extent and lighting model. */
export interface DimensionTypeDefinition {
  id: ResourceId;
  /** Lowest block Y in the dimension; may be negative (overworld = -64). */
  minY: number;
  /** Total block height of the dimension; MUST be positive. */
  height: number;
  /** Playable/logical height; MUST satisfy 1 <= logicalHeight <= height. */
  logicalHeight: number;
  /** Whether the dimension receives sunlight (drives skylight). */
  hasSkylight: boolean;
  /** (Optional) nether-like constant warmth. */
  ultrawarm?: boolean;
  /** (Optional) whether the dimension has natural generation. */
  natural?: boolean;
  /** (Optional) fixed time-of-day in ticks, or null for normal day cycle. */
  fixedTime?: number | null;
}

/**
 * Immutable dimension height model. Derives the section layout a `ChunkColumn`
 * needs (`minSectionY`, `sectionCount`) from the raw minY/height, and validates
 * the vertical extent up front so downstream storage cannot be misconfigured.
 */
export class DimensionType {
  readonly id: ResourceId;
  readonly minY: number;
  readonly height: number;
  readonly logicalHeight: number;
  readonly hasSkylight: boolean;
  readonly ultrawarm: boolean;
  readonly natural: boolean;
  readonly fixedTime: number | null;

  /** Lowest section index (`floor(minY / 16)`). */
  readonly minSectionY: number;
  /** Number of vertical sections (`ceil(height / 16)`). */
  readonly sectionCount: number;
  /** Highest section index (`minSectionY + sectionCount - 1`). */
  readonly maxSectionY: number;
  /** Highest block Y (`minY + height - 1`). */
  readonly maxY: number;

  constructor(def: DimensionTypeDefinition) {
    if (!Number.isInteger(def.minY)) {
      throw new RegistryError('INVALID_ID', resourceIdToString(def.id), 'minY must be an integer');
    }
    if (!Number.isInteger(def.height) || def.height <= 0) {
      throw new RegistryError('INVALID_ID', resourceIdToString(def.id), 'height must be a positive integer');
    }
    if (!Number.isInteger(def.logicalHeight) || def.logicalHeight < 1 || def.logicalHeight > def.height) {
      throw new RegistryError(
        'INVALID_ID',
        resourceIdToString(def.id),
        'logicalHeight must be an integer in [1, height]',
      );
    }

    this.id = def.id;
    this.minY = def.minY;
    this.height = def.height;
    this.logicalHeight = def.logicalHeight;
    this.hasSkylight = def.hasSkylight;
    this.ultrawarm = def.ultrawarm ?? false;
    this.natural = def.natural ?? true;
    this.fixedTime = def.fixedTime ?? null;

    this.maxY = def.minY + def.height - 1;
    this.minSectionY = Math.floor(def.minY / 16);
    this.maxSectionY = Math.floor(this.maxY / 16);
    this.sectionCount = this.maxSectionY - this.minSectionY + 1;
    this.maxY = def.minY + def.height - 1;
  }

  /** Whether a world Y lies within this dimension's vertical range. */
  containsY(worldY: number): boolean {
    return worldY >= this.minY && worldY <= this.maxY;
  }

  /** In-column section index for a world Y, relative to `minSectionY`. */
  sectionIndexForY(worldY: number): number {
    return Math.floor(worldY / 16) - this.minSectionY;
  }

  calculateMaxY(): number {
    return this.maxY;
  }
}

/** Registry of dimension types keyed by ResourceId, on the 003 generic Registry. */
export class DimensionTypeRegistry {
  private readonly registry = new Registry<DimensionType>();

  register(def: DimensionTypeDefinition): DimensionType {
    const dt = new DimensionType(def);
    this.registry.register(dt.id, dt);
    return dt;
  }

  get(id: ResourceId): DimensionType {
    return this.registry.get(id);
  }

  has(id: ResourceId): boolean {
    return this.registry.has(id);
  }

  get size(): number {
    return this.registry.size;
  }

  all(): readonly DimensionType[] {
    return this.registry.entries().map((e) => e.value);
  }

  finalize(): void {
    this.registry.finalize();
  }
}

/** Build the default dimension set: overworld, nether, end. */
export function createDefaultDimensionTypeRegistry(): DimensionTypeRegistry {
  const registry = new DimensionTypeRegistry();
  registry.register({
    id: rid('overworld'),
    minY: -64,
    height: 384,
    logicalHeight: 384,
    hasSkylight: true,
    natural: true,
  });
  registry.register({
    id: rid('the_nether'),
    minY: 0,
    height: 128,
    logicalHeight: 128,
    hasSkylight: false,
    ultrawarm: true,
    natural: true,
  });
  registry.register({
    id: rid('the_end'),
    minY: 0,
    height: 256,
    logicalHeight: 256,
    hasSkylight: false,
    natural: true,
  });
  return registry;
}
