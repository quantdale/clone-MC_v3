/**
 * Bounded, ordered, de-duplicated dirty-save queue (038). It collects dirty world-save units by a
 * unique key and drains them in FIFO order through an injected {@link SaveSink}, performing at most
 * `limit` writes per `drain`. Successfully written units leave the pending set; units whose write
 * fails are re-queued at the end so they are retried on a later drain (no silent loss). The queue is
 * in-memory and storage-framework-agnostic: it knows nothing about IndexedDB or the specific
 * repositories, which are supplied via the sink (see `RepositorySaveSink`).
 *
 * Change 289: drain execution is single-flight (mutex) and each `markDirty` bumps a per-key epoch so
 * concurrent flush callers (Game pagehide + AutosaveCoordinator pagehide, or tick∩flush) cannot leave
 * a superseded payload as the last durable write for a key.
 */
/**
 * The kind of world data a save unit carries; one per 034-040 persistence boundary plus the v6
 * chunk-edit store. `chunk-edits` payloads are `Array<[number, number]>` full per-chunk sparse
 * snapshots; `player-state` payloads are `PlayerStateRecord`-shaped objects.
 */
export type SaveUnitKind =
  | 'world-metadata'
  | 'chunk-sections'
  | 'block-entities'
  | 'entities'
  | 'chunk-edits'
  | 'player-state';

/** A single dirty unit to persist. The unique `key` de-duplicates repeated marks. */
export interface SaveUnit {
  /** Unique unit key, e.g. `chunk-sections|a|1|2`. */
  key: string;
  /** Which persistence boundary owns this unit. */
  kind: SaveUnitKind;
  /** Owning world identifier. */
  worldId: string;
  /** Chunk X (0 for world-metadata). */
  chunkX: number;
  /** Chunk Y (0 for world-metadata; only meaningful for `chunk-edits`). */
  chunkY?: number;
  /** Chunk Z (0 for world-metadata). */
  chunkZ: number;
  /** Kind-specific data (WorldMetadata | SerializedChunkColumn | SerializedBlockEntity[] | SerializedEntity[] | Array<[number, number]> | PlayerStateRecord-shaped object). */
  payload: unknown;
}

/** A persistence target for drained units; injected so the queue stays generic. */
export interface SaveSink {
  write(unit: SaveUnit): Promise<void>;
}

interface PendingEntry {
  readonly unit: SaveUnit;
  readonly epoch: number;
}

/**
 * Ordered, de-duplicated, bounded dirty-save queue. Units are keyed uniquely; re-marking an existing
 * key updates the stored unit but keeps its original FIFO position.
 */
export class DirtySaveQueue {
  private readonly pending = new Map<string, PendingEntry>();
  /** Monotonic per-key generation; bumped on every markDirty. */
  private readonly epochs = new Map<string, number>();
  /** Promise-chain mutex: only one drainReport body runs at a time (289). */
  private drainTail: Promise<unknown> = Promise.resolve();

  /** Mark a unit dirty (or refresh an already-pending one). Insertion order is retained on re-mark. */
  markDirty(unit: SaveUnit): void {
    const epoch = (this.epochs.get(unit.key) ?? 0) + 1;
    this.epochs.set(unit.key, epoch);
    // Map.set on an existing key preserves insertion order in ES2015+ Maps.
    this.pending.set(unit.key, { unit, epoch });
  }

  /**
   * Drain up to `limit` pending units in FIFO order through `sink`. Each unit is removed from the
   * pending set before its write starts; a rejected write re-queues the unit at the end so it
   * retries on a later drain. Returns the number of units successfully written.
   */
  async drain(sink: SaveSink, limit: number): Promise<number> {
    return (await this.drainReport(sink, limit)).written;
  }

  /**
   * Drain with a detailed report: the successfully-written count plus the unit keys whose writes
   * were accepted by the sink. Enables post-drain bookkeeping (e.g. releasing pending overlay
   * copies once their durable commit lands) without re-queue ambiguity.
   */
  async drainReport(sink: SaveSink, limit: number): Promise<{ written: number; committedKeys: string[] }> {
    const run = (): Promise<{ written: number; committedKeys: string[] }> => this.drainReportUnlocked(sink, limit);
    // Single-flight: chain behind the previous drain so concurrent flush callers serialize.
    const resultPromise = this.drainTail.then(run, run);
    // Keep the chain alive even when run rejects (should not; drainReportUnlocked catches writes).
    this.drainTail = resultPromise.then(
      () => undefined,
      () => undefined,
    );
    return resultPromise;
  }

  private async drainReportUnlocked(
    sink: SaveSink,
    limit: number,
  ): Promise<{ written: number; committedKeys: string[] }> {
    if (!Number.isFinite(limit) || limit <= 0) {
      return { written: 0, committedKeys: [] };
    }

    const batch = [...this.pending.entries()].slice(0, limit);
    let written = 0;
    const committedKeys: string[] = [];

    for (const [key, entry] of batch) {
      // Remove up front so a re-entrant waiter's batch cannot process the same snapshot twice.
      this.pending.delete(key);

      // Superseded before write start: a newer markDirty already replaced this epoch.
      if (this.epochs.get(key) !== entry.epoch) {
        continue;
      }

      try {
        await sink.write(entry.unit);
        // If a newer mark landed during the write, keep pending (do not treat as final).
        // The durable store may briefly hold the stale payload; the next drain round / waiter
        // writes the newer one under the same mutex, so the last write is never superseded.
        if (this.epochs.get(key) !== entry.epoch) {
          // Newer is already in pending (markDirty during await). Count neither as committed
          // for bookkeeping of "final" — but the sink did accept this write. Still count written
          // for progress guards; committedKeys still records the key for overlay release of this
          // generation only when not superseded. Prefer not releasing overlays for superseded.
          written++;
          continue;
        }
        written++;
        committedKeys.push(key);
      } catch {
        // Re-queue at the end for retry; preserves no-loss semantics. If a
        // newer markDirty for this key landed while the write was in flight,
        // keep that newer snapshot instead of resurrecting the stale one.
        if (!this.pending.has(key)) {
          this.pending.set(key, entry);
        }
      }
    }

    return { written, committedKeys };
  }

  /** Number of pending (not-yet-drained) units. */
  get size(): number {
    return this.pending.size;
  }

  /** Whether a unit with `key` is currently pending. */
  has(key: string): boolean {
    return this.pending.has(key);
  }

  /** The pending unit keys in FIFO order. */
  keys(): string[] {
    return [...this.pending.keys()];
  }

  /** Remove all pending units. */
  clear(): void {
    this.pending.clear();
  }
}
