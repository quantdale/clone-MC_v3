/**
 * Structure placement core (100). A `StructurePlacementConfig` maps a template (099) to a
 * deterministic, seeded placement pattern: one start per region of `spacing` chunks, offset
 * within `[0, spacing - separation)` per axis, gated by biome and terrain.
 * `structureStartAtChunk` answers the per-chunk query in O(1): region = floor division of the
 * chunk, region rng = `SeedRng(hash3(regionX, salt, regionZ, seed))`, fixed draw order
 * (offsetX, offsetZ, rotation), then biome and surface-height gates at the start chunk center.
 * `StructurePlacementRegistry` stores only validated configs with atomic rejection (003 pattern).
 */

import { hash3 } from '../math/PRNG';
import { SeedRng } from '../simulation/SeedRng';
import type { StructureMirror, StructureRotation } from './StructureTemplate';

/** A validated structure placement config (MC-like spacing/separation model). */
export interface StructurePlacementConfig {
  key: string;
  templateKey: string;
  /** Region size in chunks (positive integer). */
  spacing: number;
  /** Minimum separation in chunks; integer in [0, spacing). */
  separation: number;
  /** Seed salt for this structure set (non-negative integer). */
  salt: number;
  /** Biome keys allowed at the start (non-empty array of non-empty strings). */
  biomeKeys: string[];
  /** Terrain gate: the surface at the start center must be >= this height (integer). */
  minSurfaceHeight: number;
}

/** The world probes placement needs: biome key and surface height at world block coords. */
export interface StructurePlacementContext {
  biomeKey(x: number, z: number): string;
  surfaceY(x: number, z: number): number;
}

/** A structure start decision: the start chunk, template reference, and rotation to apply. */
export interface StructureStart {
  configKey: string;
  templateKey: string;
  chunkX: number;
  chunkZ: number;
  rotation: StructureRotation;
  mirror: StructureMirror;
}

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** Validate an unknown value as a structure placement config; throws descriptively otherwise. */
export function validateStructurePlacementConfig(input: unknown): StructurePlacementConfig {
  if (typeof input !== 'object' || input === null) {
    throw new Error('StructurePlacement: config must be an object');
  }
  const r = input as Record<string, unknown>;
  if (typeof r.key !== 'string' || r.key.length === 0) {
    throw new Error('StructurePlacement: key must be a non-empty string');
  }
  if (typeof r.templateKey !== 'string' || r.templateKey.length === 0) {
    throw new Error('StructurePlacement: templateKey must be a non-empty string');
  }
  if (!isInteger(r.spacing) || r.spacing <= 0) {
    throw new Error(`StructurePlacement: spacing must be a positive integer, got ${String(r.spacing)}`);
  }
  if (!isInteger(r.separation) || r.separation < 0 || (r.separation as number) >= (r.spacing as number)) {
    throw new Error(`StructurePlacement: separation must be an integer in [0, spacing), got ${String(r.separation)}`);
  }
  if (!isInteger(r.salt) || r.salt < 0) {
    throw new Error(`StructurePlacement: salt must be a non-negative integer, got ${String(r.salt)}`);
  }
  if (!Array.isArray(r.biomeKeys) || r.biomeKeys.length === 0) {
    throw new Error('StructurePlacement: biomeKeys must be a non-empty array');
  }
  for (const k of r.biomeKeys) {
    if (typeof k !== 'string' || k.length === 0) {
      throw new Error('StructurePlacement: biomeKeys entries must be non-empty strings');
    }
  }
  if (!isInteger(r.minSurfaceHeight)) {
    throw new Error(`StructurePlacement: minSurfaceHeight must be an integer, got ${String(r.minSurfaceHeight)}`);
  }
  return {
    key: r.key,
    templateKey: r.templateKey,
    spacing: r.spacing as number,
    separation: r.separation as number,
    salt: r.salt as number,
    biomeKeys: r.biomeKeys as string[],
    minSurfaceHeight: r.minSurfaceHeight as number,
  };
}

/**
 * Decide the structure start for a chunk, or null. Deterministic: floor-division region,
 * region-seeded draws in fixed order (offsetX, offsetZ, rotation), biome gate, terrain gate.
 */
export function structureStartAtChunk(
  config: StructurePlacementConfig,
  ctx: StructurePlacementContext,
  chunkX: number,
  chunkZ: number,
  seed: number,
): StructureStart | null {
  const regionX = Math.floor(chunkX / config.spacing);
  const regionZ = Math.floor(chunkZ / config.spacing);
  const regionSeed = hash3(regionX, config.salt, regionZ, seed);
  const rng = new SeedRng(regionSeed);
  const offsetSpan = config.spacing - config.separation;
  const offsetX = rng.nextInt(offsetSpan);
  const offsetZ = rng.nextInt(offsetSpan);
  const startChunkX = regionX * config.spacing + offsetX;
  const startChunkZ = regionZ * config.spacing + offsetZ;
  if (chunkX !== startChunkX || chunkZ !== startChunkZ) {
    return null;
  }

  const centerX = startChunkX * 16 + 8;
  const centerZ = startChunkZ * 16 + 8;
  if (!config.biomeKeys.includes(ctx.biomeKey(centerX, centerZ))) {
    return null;
  }
  if (ctx.surfaceY(centerX, centerZ) < config.minSurfaceHeight) {
    return null;
  }

  const rotation = (rng.nextInt(4) * 90) as StructureRotation;
  return {
    configKey: config.key,
    templateKey: config.templateKey,
    chunkX: startChunkX,
    chunkZ: startChunkZ,
    rotation,
    mirror: 'none',
  };
}

/** Registry of validated structure placement configs (duplicate/invalid rejection, no partial state). */
export class StructurePlacementRegistry {
  private readonly configs = new Map<string, StructurePlacementConfig>();

  register(config: StructurePlacementConfig): void {
    const validated = validateStructurePlacementConfig(config);
    if (this.configs.has(validated.key)) {
      throw new Error(`StructurePlacementRegistry: duplicate key: ${validated.key}`);
    }
    this.configs.set(validated.key, validated);
  }

  get(key: string): StructurePlacementConfig | null {
    return this.configs.get(key) ?? null;
  }

  has(key: string): boolean {
    return this.configs.has(key);
  }

  get size(): number {
    return this.configs.size;
  }

  clear(): void {
    this.configs.clear();
  }
}
