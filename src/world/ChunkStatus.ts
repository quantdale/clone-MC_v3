/**
 * Explicit chunk-generation lifecycle, independent of rendering/visibility.
 *
 * A chunk column moves through these stages as world generation progresses. The lifecycle describes *generation
 * progress* only — it is intentionally orthogonal to mesh/dirty/heightmap state (a column can be `Full` yet still
 * unmeshed, or `Empty` with no sections). Values are contiguous `0..N` so the ordinal equals the value, but all
 * ordering goes through `chunkStatusOrdinal` so the order is defined by `CHUNK_STATUS_ORDER`, not the raw numbers.
 */
export const enum ChunkStatus {
  Empty = 0,
  StructureStarts = 1,
  StructureReferences = 2,
  Biomes = 3,
  Noise = 4,
  Surface = 5,
  Carvers = 6,
  LiquidCarvers = 7,
  Blocks = 8,
  Fluids = 9,
  Light = 10,
  Spawn = 11,
  Features = 12,
  Full = 13,
}

/** Ascending generation order. The ordinal of a status is its index here. */
export const CHUNK_STATUS_ORDER: readonly ChunkStatus[] = [
  ChunkStatus.Empty,
  ChunkStatus.StructureStarts,
  ChunkStatus.StructureReferences,
  ChunkStatus.Biomes,
  ChunkStatus.Noise,
  ChunkStatus.Surface,
  ChunkStatus.Carvers,
  ChunkStatus.LiquidCarvers,
  ChunkStatus.Blocks,
  ChunkStatus.Fluids,
  ChunkStatus.Light,
  ChunkStatus.Spawn,
  ChunkStatus.Features,
  ChunkStatus.Full,
];

const CHUNK_STATUS_NAMES: Record<ChunkStatus, string> = {
  [ChunkStatus.Empty]: 'empty',
  [ChunkStatus.StructureStarts]: 'structure_starts',
  [ChunkStatus.StructureReferences]: 'structure_references',
  [ChunkStatus.Biomes]: 'biomes',
  [ChunkStatus.Noise]: 'noise',
  [ChunkStatus.Surface]: 'surface',
  [ChunkStatus.Carvers]: 'carvers',
  [ChunkStatus.LiquidCarvers]: 'liquid_carvers',
  [ChunkStatus.Blocks]: 'blocks',
  [ChunkStatus.Fluids]: 'fluids',
  [ChunkStatus.Light]: 'light',
  [ChunkStatus.Spawn]: 'spawn',
  [ChunkStatus.Features]: 'features',
  [ChunkStatus.Full]: 'full',
};

/** Position of `s` in the ascending generation order (0 for `Empty`). */
export function chunkStatusOrdinal(s: ChunkStatus): number {
  return CHUNK_STATUS_ORDER.indexOf(s);
}

/** True when `s` has reached or passed `min` in the generation order. */
export function isChunkStatusAtLeast(s: ChunkStatus, min: ChunkStatus): boolean {
  return chunkStatusOrdinal(s) >= chunkStatusOrdinal(min);
}

/** Signed comparison of two statuses by generation order; `< 0` means `a` precedes `b`. */
export function compareChunkStatus(a: ChunkStatus, b: ChunkStatus): number {
  return chunkStatusOrdinal(a) - chunkStatusOrdinal(b);
}

/** Stable, non-empty human-readable name for a status. */
export function chunkStatusName(s: ChunkStatus): string {
  return CHUNK_STATUS_NAMES[s];
}
