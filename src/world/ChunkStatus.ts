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

/**
 * Authoritative end-to-end chunk lifecycle (audit 04 "Required chunk state machine").
 *
 * This is the *pipeline* lifecycle — allocation, work queues, GPU residency, eviction — and is
 * deliberately coarser than {@link ChunkStatus}, which describes fine-grained worldgen progress.
 * Mapping from the worldgen ladder to pipeline stages:
 *
 * - `Empty` ↔ `ABSENT` (no resident record);
 * - `StructureStarts`..`Surface` fall inside `GENERATED`'s span (base terrain work);
 * - `Carvers`..`Fluids` also inside `GENERATED`;
 * - `Features` ↔ `FEATURES`;
 * - `Light`/`Spawn` ↔ `LIGHTED`;
 * - `Full` means worldgen is done — the column then continues through the mesh/upload stages,
 *   which have no counterpart in the worldgen ladder.
 *
 * The cycle is monotonic upward from `ABSENT` to `ACTIVE_GPU`; only `EVICTING -> ABSENT` closes
 * the loop. Values are contiguous `0..N`; all ordering goes through `chunkLifecycleOrdinal`.
 */
export const enum ChunkLifecycleStage {
  /** No resident record; chunk data does not exist. */
  Absent = 0,
  /** Storage allocated; nothing generated yet. */
  Allocated = 1,
  /** Base terrain (noise/surface/carvers) complete. */
  Generated = 2,
  /** Features/structures placed. */
  Features = 3,
  /** Lighting computed. */
  Lighted = 4,
  /** Mesh build queued (CPU meshing not started/finished). */
  MeshQueued = 5,
  /** CPU mesh built, awaiting upload scheduling. */
  MeshReadyCpu = 6,
  /** GPU upload queued. */
  UploadQueued = 7,
  /** Live on the GPU and rendered. */
  ActiveGpu = 8,
  /** Eviction started; resources being released. */
  Evicting = 9,
}

/** Ascending pipeline order. The ordinal of a stage is its index here. */
export const CHUNK_LIFECYCLE_ORDER: readonly ChunkLifecycleStage[] = [
  ChunkLifecycleStage.Absent,
  ChunkLifecycleStage.Allocated,
  ChunkLifecycleStage.Generated,
  ChunkLifecycleStage.Features,
  ChunkLifecycleStage.Lighted,
  ChunkLifecycleStage.MeshQueued,
  ChunkLifecycleStage.MeshReadyCpu,
  ChunkLifecycleStage.UploadQueued,
  ChunkLifecycleStage.ActiveGpu,
  ChunkLifecycleStage.Evicting,
];

const CHUNK_LIFECYCLE_NAMES: Record<ChunkLifecycleStage, string> = {
  [ChunkLifecycleStage.Absent]: 'absent',
  [ChunkLifecycleStage.Allocated]: 'allocated',
  [ChunkLifecycleStage.Generated]: 'generated',
  [ChunkLifecycleStage.Features]: 'features',
  [ChunkLifecycleStage.Lighted]: 'lighted',
  [ChunkLifecycleStage.MeshQueued]: 'mesh_queued',
  [ChunkLifecycleStage.MeshReadyCpu]: 'mesh_ready_cpu',
  [ChunkLifecycleStage.UploadQueued]: 'upload_queued',
  [ChunkLifecycleStage.ActiveGpu]: 'active_gpu',
  [ChunkLifecycleStage.Evicting]: 'evicting',
};

/** Position of `s` in the ascending pipeline order (0 for `Absent`). */
export function chunkLifecycleOrdinal(s: ChunkLifecycleStage): number {
  return CHUNK_LIFECYCLE_ORDER.indexOf(s);
}

/** True when `s` has reached or passed `min` in the pipeline order. */
export function isChunkLifecycleAtLeast(s: ChunkLifecycleStage, min: ChunkLifecycleStage): boolean {
  return chunkLifecycleOrdinal(s) >= chunkLifecycleOrdinal(min);
}

/** Stable, non-empty human-readable name for a pipeline stage. */
export function chunkLifecycleName(s: ChunkLifecycleStage): string {
  return CHUNK_LIFECYCLE_NAMES[s];
}

/**
 * Legal transitions of the pipeline. Forward steps go exactly one stage at a time (the stage's
 * owning job completes); `Evicting` may be entered from any resident stage; `Absent` is reached
 * only from `Evicting` (or re-entered from itself when a record is fully dropped).
 */
const ALLOWED_TRANSITIONS: Record<ChunkLifecycleStage, readonly ChunkLifecycleStage[]> = {
  [ChunkLifecycleStage.Absent]: [ChunkLifecycleStage.Allocated],
  [ChunkLifecycleStage.Allocated]: [
    ChunkLifecycleStage.Generated,
    ChunkLifecycleStage.Evicting,
  ],
  [ChunkLifecycleStage.Generated]: [ChunkLifecycleStage.Features, ChunkLifecycleStage.Evicting],
  [ChunkLifecycleStage.Features]: [ChunkLifecycleStage.Lighted, ChunkLifecycleStage.Evicting],
  [ChunkLifecycleStage.Lighted]: [ChunkLifecycleStage.MeshQueued, ChunkLifecycleStage.Evicting],
  [ChunkLifecycleStage.MeshQueued]: [ChunkLifecycleStage.MeshReadyCpu, ChunkLifecycleStage.Evicting],
  [ChunkLifecycleStage.MeshReadyCpu]: [ChunkLifecycleStage.UploadQueued, ChunkLifecycleStage.Evicting],
  [ChunkLifecycleStage.UploadQueued]: [ChunkLifecycleStage.ActiveGpu, ChunkLifecycleStage.Evicting],
  [ChunkLifecycleStage.ActiveGpu]: [ChunkLifecycleStage.Evicting],
  [ChunkLifecycleStage.Evicting]: [ChunkLifecycleStage.Absent],
};

/**
 * True when moving from `from` to `to` respects the state machine: one forward step, or entry
 * into `Evicting` from any resident stage, or completion of eviction (`Evicting -> Absent`).
 * Regeneration after eviction goes through an explicit reset to `Absent` first.
 */
export function canTransition(from: ChunkLifecycleStage, to: ChunkLifecycleStage): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}
