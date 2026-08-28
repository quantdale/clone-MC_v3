/**
 * Ore vein placement adapter (Phase 6 wiring). Bridges the 096 ore feature data
 * (`OreBlockTagRegistry` targets + 094 configured `ore` features) into the live
 * per-chunk generation path: each chunk owns its veins outright, so placement is
 * order-independent by construction — every vein derives from
 * `hash3(chunkX, salt, chunkZ, seed)` and is clipped to its owner chunk.
 * Neighboring chunks never need to agree on each other's veins.
 */
import { hash3, PRNG } from '../math/PRNG';
import { createDefaultOreBlockTags, resolveOreTargetBlockIds } from './OreFeature';

/** One ore vein feature as placed per chunk. */
export interface OreVeinDefinition {
  key: string;
  /** Block id stamped into replaceable cells. */
  blockId: number;
  /** Maximum blocks per vein (the random walk truncates early at chunk borders). */
  size: number;
  /** Independent vein attempts per owner chunk. */
  triesPerChunk: number;
  /** Inclusive world-Y range veins may start in. */
  minY: number;
  maxY: number;
  /** Per-definition salt mixed into the per-chunk region hash. */
  salt: number;
}

/** Documented default ore veins: shallow-biased coal, deep-only iron. */
export function createDefaultOreVeinDefinitions(seaLevel: number, bedrockY: number): OreVeinDefinition[] {
  return [
    {
      key: 'overworld/coal_ore',
      blockId: 14,
      size: 12,
      triesPerChunk: 6,
      minY: bedrockY + 3,
      maxY: seaLevel - 2,
      salt: 52031,
    },
    {
      key: 'overworld/iron_ore',
      blockId: 15,
      size: 8,
      triesPerChunk: 4,
      minY: bedrockY + 3,
      maxY: seaLevel - 9,
      salt: 52057,
    },
  ];
}

/** Read/write access to the owner chunk's local block storage. */
export interface OreVeinSink {
  /** Current block id at local coordinates, or null when out of bounds. */
  getLocal(lx: number, ly: number, lz: number): number | null;
  setLocal(lx: number, ly: number, lz: number, id: number): void;
}

/** Optional per-column gate (e.g. spawn-area protection). */
export type OreVeinColumnGate = (worldX: number, worldZ: number) => boolean;

/**
 * Stamp this chunk's ore veins into `sink`. Deterministic per
 * (chunkX, chunkZ, seed): each attempt draws origin (lx, ly, lz), then random-walks
 * up to `size` steps, replacing cells whose current block is a resolved ore
 * replaceable. Walks are clipped at chunk bounds — the owner chunk owns its whole
 * vein, so no cross-chunk coordination is needed.
 */
export function stampChunkOreVeins(
  definitions: readonly OreVeinDefinition[],
  replaceableTagKeys: readonly string[],
  chunkX: number,
  chunkZ: number,
  seed: number,
  sink: OreVeinSink,
  dimensions: { width: number; height: number; depth: number },
  worldOrigin: { x: number; z: number },
  gate?: OreVeinColumnGate,
): void {
  const replaceable = resolveOreTargetBlockIds([...replaceableTagKeys], createDefaultOreBlockTags());
  const replaceableSet = new Set(replaceable);

  for (const def of definitions) {
    const rng = new PRNG(hash3(chunkX, def.salt, chunkZ, seed));
    const ySpan = def.maxY - def.minY + 1;
    if (ySpan <= 0) {
      continue;
    }
    for (let attempt = 0; attempt < def.triesPerChunk; attempt++) {
      let lx = rng.nextInt(dimensions.width);
      let ly = def.minY + rng.nextInt(ySpan);
      let lz = rng.nextInt(dimensions.depth);
      if (gate && !gate(worldOrigin.x + lx, worldOrigin.z + lz)) {
        continue;
      }
      for (let step = 0; step < def.size; step++) {
        const current = sink.getLocal(lx, ly, lz);
        if (current !== null && replaceableSet.has(current)) {
          sink.setLocal(lx, ly, lz, def.blockId);
        }
        // Random walk: pick an axis, then a direction; stop at the chunk border
        // (owner-confined clipping keeps placement order-independent).
        const axis = rng.nextInt(3);
        const dir = rng.next() < 0.5 ? -1 : 1;
        if (axis === 0) {
          const next = lx + dir;
          if (next < 0 || next >= dimensions.width) break;
          lx = next;
        } else if (axis === 1) {
          const next = ly + dir;
          if (next < 0 || next >= dimensions.height) break;
          ly = next;
        } else {
          const next = lz + dir;
          if (next < 0 || next >= dimensions.depth) break;
          lz = next;
        }
      }
    }
  }
}
