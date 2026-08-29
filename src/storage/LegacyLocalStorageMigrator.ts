/**
 * Legacy localStorage → world-database migration (040 / v6). Reads the legacy per-seed keys
 * `voxel-game-edits-v1:${seed}` (sparse edit overlay) and `voxel-game-state-v1:${seed}`
 * (player/inventory/survival), validates them, and imports them into the persistence layer:
 *
 * - **Authoritative faithful record**: one `ChunkEditRecord` per distinct `(cx, cy, cz)` legacy
 *   entry is written to the v6 `chunk-edits` store via `ChunkEditRepository`, holding the validated
 *   `[localIndex, blockId]` pairs sorted by index and deduplicated by index (last occurrence wins,
 *   matching `World.importEdits` map-insertion semantics). Indices span the full chunk volume
 *   (`CHUNK_BLOCK_COUNT` = 16×64×16); nothing is truncated. Each record is read back and verified
 *   for semantic equivalence before it counts as migrated; a mismatch deletes the bad record so
 *   partial/corrupt state never masquerades as migrated.
 * - **Compatibility columns**: the edit overlay is additionally folded into air-filled
 *   `SerializedChunkColumn` records in the chunk-sections store. This output is lossy by design
 *   (untouched cells are indistinguishable from edited-to-air) and is retained solely for archive/
 *   tooling compatibility; it is no longer consumed by the game. Column read-back verification is
 *   deliberately skipped — the faithful record above carries the correctness guarantee, and the
 *   columns are redundant compatibility output.
 * - The game snapshot becomes a `PlayerStateRecord` in the player-state store, also read back and
 *   verified field-equivalent (mismatch → error + delete).
 *
 * Migration is non-destructive — legacy storage is only read, never written or deleted — and
 * interruption-safe: a crash mid-migration leaves the already-committed records in place, and the
 * next `migrate()` run overwrites them idempotently with identical content. Per-artifact failures
 * are reported without throwing.
 *
 * Conversion is registry-free: legacy numeric id `0` is air, so each migrated section's paletted
 * container is built with palette `[0, ...changedIds]` and storage initialized to air.
 */
import { CHUNK_COLUMN_VERSION, type SerializedChunkColumn } from '../world/ChunkColumn';
import {
  MIN_PALETTE_BITS,
  PALETTED_CONTAINER_VERSION,
  PackedIntegerArray,
  type SerializedPalettedContainer,
} from '../data/PalettedContainer';
import { SECTION_SIZE, SECTION_VOLUME } from '../math/SectionCoordinate';
import { CHUNK_BLOCK_COUNT } from '../world/WorldCoordinates';
import { OVERWORLD_DIMENSION_TYPE } from '../data/DimensionTypes';
import { createDefaultBlockStateRegistry } from '../world/BlockStateRegistry';
import { ChunkSectionRepository } from './ChunkSectionRepository';
import { ChunkEditRepository } from './ChunkEditRepository';
import { PlayerStateRepository } from './PlayerStateRepository';
import {
  validatePlayerStateRecord,
  type PlayerStateRecord,
} from './PlayerStateRecord';

/** Minimal storage surface; satisfied by `window.localStorage` or a test double. */
export interface StorageLike {
  getItem(key: string): string | null;
}

/** Legacy `WorldEditSnapshot` shape (version 1) — see `World.exportEdits`/`importEdits`. */
export interface LegacyEditSnapshot {
  version: 1;
  seed: number;
  edits: Array<{
    chunk: [number, number, number];
    changes: Array<[number, number]>;
  }>;
}

/** Legacy `GameSaveSnapshot` shape (version 1) — see `Game.savePlayerState`. */
export interface LegacyPlayerSnapshot {
  version: 1;
  seed: number;
  player: { position: [number, number, number]; yaw: number; pitch: number };
  inventory: unknown;
  survival: unknown;
}

/** Result of one `migrate(seed)` call; the migration audit trail. */
export interface LegacyMigrationReport {
  seed: number;
  /** Distinct `(chunkX, chunkZ)` columns written to the chunk-sections store. */
  importedColumns: number;
  /** Accepted cell edits folded into the migrated columns. */
  importedEdits: number;
  /** Whether the player-state record was written (and read-back verified). */
  playerStateImported: boolean;
  /** Faithful `ChunkEditRecord`s written to the chunk-edits store. */
  importedEditRecords?: number;
  /** Records (chunk-edits + player state) that passed read-back verification. */
  verifiedRecords?: number;
  /** Per-artifact failures (validation/storage/verification); empty when fully successful. */
  errors: string[];
}

/** Legacy localStorage key prefix for the sparse edit overlay. */
export const LEGACY_EDIT_STORAGE_PREFIX = 'voxel-game-edits-v1:';

/** Legacy localStorage key prefix for the player state snapshot. */
export const LEGACY_STATE_STORAGE_PREFIX = 'voxel-game-state-v1:';

/**
 * One edited section within a column being built. `cy` is the section's Y within the column
 * (already decoded from full-chunk edit indices by the caller); `changes` holds section-local
 * `[index, blockId]` pairs with `0 <= index < SECTION_VOLUME`.
 */
export interface EditSectionGroup {
  cy: number;
  changes: Array<[number, number]>;
}

/** Sections per chunk column: the full chunk volume (16×64×16) folds into 16³ sections. */
const SECTIONS_PER_CHUNK = CHUNK_BLOCK_COUNT / SECTION_VOLUME;

/** Section-plane area: one local y step in the full-chunk index encoding. */
const SECTION_AREA = SECTION_SIZE * SECTION_SIZE;

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Structural validation of a parsed legacy edit snapshot. */
export function isLegacyEditSnapshot(value: unknown): value is LegacyEditSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  if (r.version !== 1 || !isInteger(r.seed)) return false;
  if (!Array.isArray(r.edits)) return false;
  for (const entry of r.edits as unknown[]) {
    if (typeof entry !== 'object' || entry === null) return false;
    const e = entry as Record<string, unknown>;
    if (!Array.isArray(e.chunk) || (e.chunk as unknown[]).length !== 3) return false;
    if (!(e.chunk as unknown[]).every(isInteger)) return false;
    if (!Array.isArray(e.changes)) return false;
    for (const change of e.changes as unknown[]) {
      if (!Array.isArray(change) || (change as unknown[]).length !== 2) return false;
      if (!(change as unknown[]).every(isInteger)) return false;
    }
  }
  return true;
}

/** Structural validation of a parsed legacy player snapshot. */
export function isLegacyPlayerSnapshot(value: unknown): value is LegacyPlayerSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  if (r.version !== 1 || !isInteger(r.seed)) return false;
  const player = r.player as Record<string, unknown> | undefined;
  if (typeof player !== 'object' || player === null) return false;
  const pos = player.position;
  if (!Array.isArray(pos) || pos.length !== 3 || !pos.every(isFiniteNumber)) return false;
  if (!isFiniteNumber(player.yaw) || !isFiniteNumber(player.pitch)) return false;
  if (r.inventory === undefined || r.survival === undefined) return false;
  return true;
}

/**
 * Build a serialized paletted container for one section from sparse cell edits. Palette is
 * `[0 (air), ...changedIds]`; storage is air-filled with edited cells set. Invalid cells (bad index /
 * negative id) are skipped.
 */
export function buildSectionContainer(
  changes: ReadonlyArray<[number, number]>,
  capacity: number = SECTION_VOLUME,
  stateIdForBlockId: (blockId: number) => number = (blockId) => blockId,
): SerializedPalettedContainer {
  // Accept only cells with an in-range index and a non-negative integer id.
  const accepted: Array<[number, number]> = [];
  for (const [index, id] of changes) {
    if (isInteger(index) && index >= 0 && index < capacity && isInteger(id) && id >= 0) {
      accepted.push([index, stateIdForBlockId(id)]);
    }
  }

  const palette: number[] = [0]; // legacy id 0 = air
  const idToOrdinal = new Map<number, number>([[0, 0]]);
  for (const [, id] of accepted) {
    if (!idToOrdinal.has(id)) {
      idToOrdinal.set(id, palette.length);
      palette.push(id);
    }
  }

  let bits = MIN_PALETTE_BITS;
  while ((1 << bits) < palette.length) bits++;

  const storage = new PackedIntegerArray(bits, capacity); // all-zero = air
  for (const [index, id] of accepted) {
    storage.set(index, idToOrdinal.get(id)!);
  }

  return {
    version: PALETTED_CONTAINER_VERSION,
    capacity,
    bitsPerEntry: bits,
    palette,
    storage: storage.serialize(),
  };
}

/**
 * Build a `SerializedChunkColumn` for one `(chunkX, chunkZ)` from its edited sections. The column's
 * vertical extent covers exactly the edited sections (`minSectionY` = minimum `cy`).
 */
export function editsToSerializedChunkColumn(
  sections: ReadonlyArray<EditSectionGroup>,
  chunkX: number,
  chunkZ: number,
  stateIdForBlockId: (blockId: number) => number = (blockId) => blockId,
  layout?: { minSectionY: number; sectionCount: number },
): SerializedChunkColumn {
  const valid = sections.filter((s) => isInteger(s.cy)).sort((a, b) => a.cy - b.cy);
  if (valid.length === 0) {
    throw new Error('editsToSerializedChunkColumn: no sections to convert');
  }
  const minSectionY = layout?.minSectionY ?? valid[0]!.cy;
  const sectionCount = layout?.sectionCount ?? valid[valid.length - 1]!.cy - minSectionY + 1;
  if (!isInteger(minSectionY) || !isInteger(sectionCount) || sectionCount < 1) {
    throw new Error('editsToSerializedChunkColumn: invalid layout');
  }
  const maxSectionY = minSectionY + sectionCount;
  if (valid.some((s) => s.cy < minSectionY || s.cy >= maxSectionY)) {
    throw new Error('editsToSerializedChunkColumn: section outside layout');
  }
  const out: Record<number, SerializedPalettedContainer> = {};
  for (const s of valid) {
    out[s.cy - minSectionY] = buildSectionContainer(s.changes, SECTION_VOLUME, stateIdForBlockId);
  }
  return {
    version: CHUNK_COLUMN_VERSION,
    chunkX,
    chunkZ,
    sectionCount,
    minSectionY,
    sections: out,
  };
}

/**
 * Normalize one legacy entry's changes into the faithful record form: drop cells with an
 * out-of-range index or a negative id, deduplicate by index (last occurrence wins, matching the
 * map-insertion semantics of `World.importEdits`), and sort ascending by index. Indices span the
 * full chunk volume (`CHUNK_BLOCK_COUNT`), so edits at any local y are preserved.
 */
export function normalizeLegacyChanges(
  changes: ReadonlyArray<[number, number]>,
): Array<[number, number]> {
  const byIndex = new Map<number, number>();
  for (const [index, id] of changes) {
    if (isInteger(index) && index >= 0 && index < CHUNK_BLOCK_COUNT && isInteger(id) && id >= 0) {
      byIndex.set(index, id);
    }
  }
  return [...byIndex.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * Decode a full-chunk edit index (`lx + lz*16 + ly*256`, `ly` over the full chunk height) into its
 * containing section Y within the chunk (0..SECTIONS_PER_CHUNK-1) and the canonical section-local
 * index (`localX + localY*16 + localZ*256`).
 */
export function decodeFullChunkIndex(index: number): { sectionY: number; localIndex: number } {
  const lx = index % SECTION_SIZE;
  const lz = Math.floor(index / SECTION_SIZE) % SECTION_SIZE;
  const ly = Math.floor(index / SECTION_AREA);
  return {
    sectionY: Math.floor(ly / SECTION_SIZE),
    localIndex: lx + (ly % SECTION_SIZE) * SECTION_SIZE + lz * SECTION_AREA,
  };
}

/** Semantic equivalence of two changes lists: same multiset of `[index, id]` pairs. */
function changesEqual(
  a: ReadonlyArray<[number, number]> | null,
  b: ReadonlyArray<[number, number]>,
): boolean {
  if (!a || a.length !== b.length) return false;
  const sort = (list: ReadonlyArray<[number, number]>) =>
    [...list].sort((x, y) => x[0] - y[0]);
  const sa = sort(a);
  const sb = sort(b);
  return sa.every(([index, id], i) => sb[i]![0] === index && sb[i]![1] === id);
}

/** Convert a validated legacy player snapshot into a `PlayerStateRecord` for `worldId`. */
export function toPlayerStateRecord(snapshot: LegacyPlayerSnapshot, worldId: string): PlayerStateRecord {
  return validatePlayerStateRecord({
    worldId,
    seed: snapshot.seed,
    position: snapshot.player.position,
    yaw: snapshot.player.yaw,
    pitch: snapshot.player.pitch,
    inventory: snapshot.inventory,
    survival: snapshot.survival,
    experience: { version: 1, level: 0, xp: 0 },
  });
}

/** Count accepted cell edits in a set of section groups (valid index + non-negative integer id). */
export function countAcceptedEdits(sections: ReadonlyArray<EditSectionGroup>): number {
  let n = 0;
  for (const s of sections) {
    for (const [index, id] of s.changes) {
      if (isInteger(index) && index >= 0 && index < SECTION_VOLUME && isInteger(id) && id >= 0) {
        n++;
      }
    }
  }
  return n;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * One-time, non-destructive, interruption-safe importer of a seed's legacy localStorage artifacts
 * into the persistence layer. Legacy storage is never written or deleted; a crash mid-migration
 * leaves earlier committed records in place and the next `migrate()` run overwrites them
 * idempotently with identical content.
 */
export class LegacyLocalStorageMigrator {
  private readonly storage: StorageLike;
  private readonly chunkSections: ChunkSectionRepository;
  private readonly chunkEdits: ChunkEditRepository;
  private readonly playerStates: PlayerStateRepository;
  private readonly stateIdForBlockId: (blockId: number) => number;
  private readonly worldIdForSeed: (seed: number) => string;

  constructor(opts: {
    storage: StorageLike;
    chunkSections: ChunkSectionRepository;
    /** Faithful per-chunk sparse-edit store (v6 `chunk-edits`); the authoritative import target. */
    chunkEdits: ChunkEditRepository;
    playerStates: PlayerStateRepository;
    /** Map a legacy seed to the world id used by the repositories (default `world-${seed}`). */
    worldIdForSeed?: (seed: number) => string;
  }) {
    this.storage = opts.storage;
    this.chunkSections = opts.chunkSections;
    this.chunkEdits = opts.chunkEdits;
    this.playerStates = opts.playerStates;
    const stateRegistry = createDefaultBlockStateRegistry();
    this.stateIdForBlockId = (blockId) => stateRegistry.getDefaultState(blockId).id;
    this.worldIdForSeed = opts.worldIdForSeed ?? ((seed: number) => `world-${seed}`);
  }

  /**
   * Import the legacy edits and player state for `seed` into the repositories. Never throws out of
   * the method: storage/validation/write/verification failures are collected in `report.errors`.
   * Idempotent: `putChunkEdits`/`putColumn` overwrite by (worldId,cx,cy,cz) /
   * (worldId,cx,cz) key, so repeated `migrate(seed)` calls with the same
   * legacy payload produce identical durable state without duplication. Negative-Y
   * edits (e.g., y=-10 → chunkY=-1) are faithfully preserved via
   * `decodeFullChunkIndex` → `columnSectionY = cy*4+sectionY` and survive
   * round-trip verification.
   */
  async migrate(seed: number): Promise<LegacyMigrationReport> {
    const worldId = this.worldIdForSeed(seed);
    const report: LegacyMigrationReport = {
      seed,
      importedColumns: 0,
      importedEdits: 0,
      playerStateImported: false,
      importedEditRecords: 0,
      verifiedRecords: 0,
      errors: [],
    };
    await this.chunkSections.open();
    await this.chunkEdits.open();
    await this.playerStates.open();

    // --- Sparse edit overlay → faithful chunk-edits records + compatibility columns --------
    let rawEdits: string | null = null;
    try {
      rawEdits = this.storage.getItem(LEGACY_EDIT_STORAGE_PREFIX + seed);
    } catch (e) {
      report.errors.push(`read edits: ${errorMessage(e)}`);
    }
    if (rawEdits !== null && rawEdits !== undefined) {
      try {
        const parsed = JSON.parse(rawEdits) as unknown;
        if (!isLegacyEditSnapshot(parsed)) {
          throw new Error('malformed legacy edit snapshot');
        }

        // Pass 1 — authoritative faithful records: one per distinct (cx, cy, cz), changes sorted
        // ascending and deduplicated by index (last wins). Each record is read back and verified;
        // on mismatch the bad record is deleted so corrupt state never masquerades as migrated.
        const columnSections = new Map<string, { cx: number; cz: number; sections: Map<number, Array<[number, number]>> }>();
        for (const entry of parsed.edits) {
          const [cx, cy, cz] = entry.chunk;
          const normalized = normalizeLegacyChanges(entry.changes);
          if (normalized.length === 0) continue; // nothing valid to persist for this entry
          try {
            await this.chunkEdits.putChunkEdits(worldId, cx, cy, cz, normalized);
            const readBack = await this.chunkEdits.getChunkEdits(worldId, cx, cy, cz);
            if (!changesEqual(readBack, normalized)) {
              throw new Error(
                `chunk-edits read-back mismatch for (${cx},${cy},${cz}): expected ${JSON.stringify(normalized)}, got ${JSON.stringify(readBack)}`,
              );
            }
            report.importedEditRecords!++;
            report.verifiedRecords!++;
          } catch (e) {
            report.errors.push(`chunk-edits (${cx},${cy},${cz}): ${errorMessage(e)}`);
            try {
              await this.chunkEdits.deleteChunkEdits(worldId, cx, cy, cz);
            } catch (cleanupError) {
              report.errors.push(
                `chunk-edits cleanup (${cx},${cy},${cz}): ${errorMessage(cleanupError)}`,
              );
            }
            continue;
          }

          // Pass 2 (same loop) — decode full-chunk indices into 16³ sections for the
          // compatibility column output. Column section Y = legacy chunkY * sections-per-chunk +
          // decoded section Y, placing each legacy chunk's edits at their vertical position.
          const key = `${cx}|${cz}`;
          let column = columnSections.get(key);
          if (!column) {
            column = { cx, cz, sections: new Map() };
            columnSections.set(key, column);
          }
          for (const [index, id] of normalized) {
            const { sectionY, localIndex } = decodeFullChunkIndex(index);
            const columnSectionY = cy * SECTIONS_PER_CHUNK + sectionY;
            const bucket = column.sections.get(columnSectionY) ?? [];
            bucket.push([localIndex, id]);
            column.sections.set(columnSectionY, bucket);
          }
        }

        // Compatibility columns: air-filled by design (lossy), archive/tooling output only, so
        // read-back verification is deliberately skipped here — the faithful records above carry
        // the MIGRATE-1 correctness guarantee.
        for (const column of columnSections.values()) {
          const sections = [...column.sections.entries()].map(
            ([columnSectionY, changes]): EditSectionGroup => ({ cy: columnSectionY, changes }),
          );
          const serialized = editsToSerializedChunkColumn(
            sections,
            column.cx,
            column.cz,
            this.stateIdForBlockId,
            {
              minSectionY: OVERWORLD_DIMENSION_TYPE.minSectionY,
              sectionCount: OVERWORLD_DIMENSION_TYPE.sectionCount,
            },
          );
          await this.chunkSections.putColumn(worldId, serialized);
          report.importedColumns++;
          report.importedEdits += countAcceptedEdits(sections);
        }
      } catch (e) {
        report.errors.push(`edits: ${errorMessage(e)}`);
      }
    }

    // --- Player state → player-state store -------------------------------------------------
    let rawState: string | null = null;
    try {
      rawState = this.storage.getItem(LEGACY_STATE_STORAGE_PREFIX + seed);
    } catch (e) {
      report.errors.push(`read state: ${errorMessage(e)}`);
    }
    if (rawState !== null && rawState !== undefined) {
      let record: PlayerStateRecord | null = null;
      try {
        const parsed = JSON.parse(rawState) as unknown;
        if (!isLegacyPlayerSnapshot(parsed)) {
          throw new Error('malformed legacy player snapshot');
        }
        record = toPlayerStateRecord(parsed, worldId);
        await this.playerStates.putPlayerState(record);
        const readBack = await this.playerStates.getPlayerState(worldId);
        if (!record || !readBack || JSON.stringify(readBack) !== JSON.stringify(record)) {
          throw new Error('player-state read-back mismatch');
        }
        report.playerStateImported = true;
        report.verifiedRecords!++;
      } catch (e) {
        report.errors.push(`state: ${errorMessage(e)}`);
        if (record) {
          try {
            await this.playerStates.deletePlayerState(worldId);
          } catch (cleanupError) {
            report.errors.push(`state cleanup: ${errorMessage(cleanupError)}`);
          }
        }
      }
    }

    return report;
  }
}
