/**
 * Legacy localStorage → world-database migration (040). Reads the legacy per-seed keys
 * `voxel-game-edits-v1:${seed}` (sparse edit overlay) and `voxel-game-state-v1:${seed}`
 * (player/inventory/survival), validates them, and imports them into the 034-040 persistence layer:
 * the edit overlay becomes `SerializedChunkColumn` records in the chunk-sections store, and the game
 * snapshot becomes a `PlayerStateRecord` in the player-state store. Migration is non-destructive —
 * legacy storage is only read — and reports per-artifact errors without partial writes.
 *
 * Conversion is registry-free: legacy numeric id `0` is air, so each migrated section's paletted
 * container is built with palette `[0, ...changedIds]` and storage initialized to air. Migrated
 * columns contain the player's edits with air for untouched cells; the world runtime decides how to
 * merge them with regenerated terrain when it consumes the store.
 */
import { CHUNK_COLUMN_VERSION, type SerializedChunkColumn } from '../world/ChunkColumn';
import {
  MIN_PALETTE_BITS,
  PALETTED_CONTAINER_VERSION,
  PackedIntegerArray,
  type SerializedPalettedContainer,
} from '../data/PalettedContainer';
import { SECTION_VOLUME } from '../math/SectionCoordinate';
import { ChunkSectionRepository } from './ChunkSectionRepository';
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
  /** Whether the player-state record was written. */
  playerStateImported: boolean;
  /** Per-artifact failures (validation/storage); empty when fully successful. */
  errors: string[];
}

/** Legacy localStorage key prefix for the sparse edit overlay. */
export const LEGACY_EDIT_STORAGE_PREFIX = 'voxel-game-edits-v1:';

/** Legacy localStorage key prefix for the player state snapshot. */
export const LEGACY_STATE_STORAGE_PREFIX = 'voxel-game-state-v1:';

/** One edited section within a column being built. */
export interface EditSectionGroup {
  cy: number;
  changes: Array<[number, number]>;
}

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
): SerializedPalettedContainer {
  // Accept only cells with an in-range index and a non-negative integer id.
  const accepted: Array<[number, number]> = [];
  for (const [index, id] of changes) {
    if (isInteger(index) && index >= 0 && index < capacity && isInteger(id) && id >= 0) {
      accepted.push([index, id]);
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
): SerializedChunkColumn {
  const valid = sections.filter((s) => isInteger(s.cy)).sort((a, b) => a.cy - b.cy);
  if (valid.length === 0) {
    throw new Error('editsToSerializedChunkColumn: no sections to convert');
  }
  const minSectionY = valid[0]!.cy;
  const sectionCount = valid[valid.length - 1]!.cy - minSectionY + 1;
  const out: Record<number, SerializedPalettedContainer> = {};
  for (const s of valid) {
    out[s.cy - minSectionY] = buildSectionContainer(s.changes);
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
 * One-time, non-destructive importer of a seed's legacy localStorage artifacts into the new
 * persistence layer.
 */
export class LegacyLocalStorageMigrator {
  private readonly storage: StorageLike;
  private readonly chunkSections: ChunkSectionRepository;
  private readonly playerStates: PlayerStateRepository;
  private readonly worldIdForSeed: (seed: number) => string;

  constructor(opts: {
    storage: StorageLike;
    chunkSections: ChunkSectionRepository;
    playerStates: PlayerStateRepository;
    /** Map a legacy seed to the world id used by the repositories (default `world-${seed}`). */
    worldIdForSeed?: (seed: number) => string;
  }) {
    this.storage = opts.storage;
    this.chunkSections = opts.chunkSections;
    this.playerStates = opts.playerStates;
    this.worldIdForSeed = opts.worldIdForSeed ?? ((seed: number) => `world-${seed}`);
  }

  /**
   * Import the legacy edits and player state for `seed` into the repositories. Never throws out of
   * the method: storage/validation/write failures are collected in `report.errors`.
   */
  async migrate(seed: number): Promise<LegacyMigrationReport> {
    const worldId = this.worldIdForSeed(seed);
    const report: LegacyMigrationReport = {
      seed,
      importedColumns: 0,
      importedEdits: 0,
      playerStateImported: false,
      errors: [],
    };
    await this.chunkSections.open();
    await this.playerStates.open();

    // --- Sparse edit overlay → chunk-sections ---------------------------------------------
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
        const columns = groupEditsToColumns(parsed.edits);
        for (const column of columns.values()) {
          const sections = [...column.sections.entries()].map(
            ([cy, changes]): EditSectionGroup => ({ cy, changes }),
          );
          const serialized = editsToSerializedChunkColumn(sections, column.cx, column.cz);
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
      try {
        const parsed = JSON.parse(rawState) as unknown;
        if (!isLegacyPlayerSnapshot(parsed)) {
          throw new Error('malformed legacy player snapshot');
        }
        await this.playerStates.putPlayerState(toPlayerStateRecord(parsed, worldId));
        report.playerStateImported = true;
      } catch (e) {
        report.errors.push(`state: ${errorMessage(e)}`);
      }
    }

    return report;
  }
}

/** Group a legacy snapshot's entries by `(chunkX, chunkZ)`. */
function groupEditsToColumns(
  edits: LegacyEditSnapshot['edits'],
): Map<string, { cx: number; cz: number; sections: Map<number, Array<[number, number]>> }> {
  const columns = new Map<string, { cx: number; cz: number; sections: Map<number, Array<[number, number]>> }>();
  for (const entry of edits) {
    const [cx, cy, cz] = entry.chunk;
    const key = `${cx}|${cz}`;
    let column = columns.get(key);
    if (!column) {
      column = { cx, cz, sections: new Map() };
      columns.set(key, column);
    }
    const existing = column.sections.get(cy) ?? [];
    existing.push(...entry.changes);
    column.sections.set(cy, existing);
  }
  return columns;
}
