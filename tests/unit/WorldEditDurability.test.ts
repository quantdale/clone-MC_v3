import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { World, type WorldEditDurability, type WorldEditSnapshot } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { CONFIG } from '../../src/config';
import { chunkKey, localIndex } from '../../src/world/WorldCoordinates';

/**
 * Recording WorldEditDurability mock backed by plain Maps/promises. Captures
 * and retains copy the chunk's overlay so later live mutations cannot alias.
 */
class MockDurability implements WorldEditDurability {
  /** Latest full changes per chunk key — what a persistence layer would own. */
  readonly captures = new Map<string, Map<number, number>>();
  /** Synchronous pending copies served by restorePendingChunkEdits. */
  readonly pendingCopies = new Map<string, Map<number, number>>();
  /** Committed arrays served by loadCommittedChunkEdits by default. */
  readonly committed = new Map<string, Array<[number, number]>>();
  /** Overridable async loader (for deferred/gated promises in tests). */
  loadImpl:
    | ((cx: number, cy: number, cz: number) => Promise<Array<[number, number]> | null>)
    | null = null;
  captureCalls = 0;
  /** Per-chunk-key count of loadCommittedChunkEdits invocations. */
  readonly loadCallsByKey = new Map<string, number>();

  captureChunkEdits(cx: number, cy: number, cz: number, changes: ReadonlyMap<number, number>): void {
    this.captureCalls++;
    this.captures.set(chunkKey(cx, cy, cz), new Map(changes));
  }

  retainEvictedChunkEdits(cx: number, cy: number, cz: number, changes: ReadonlyMap<number, number>): void {
    this.captures.set(chunkKey(cx, cy, cz), new Map(changes));
  }

  restorePendingChunkEdits(cx: number, cy: number, cz: number): ReadonlyMap<number, number> | null {
    return this.pendingCopies.get(chunkKey(cx, cy, cz)) ?? null;
  }

  loadCommittedChunkEdits(cx: number, cy: number, cz: number): Promise<Array<[number, number]> | null> {
    const key = chunkKey(cx, cy, cz);
    this.loadCallsByKey.set(key, (this.loadCallsByKey.get(key) ?? 0) + 1);
    const gated = this.loadImpl?.(cx, cy, cz);
    if (gated) {
      return gated;
    }
    return Promise.resolve(this.committed.get(chunkKey(cx, cy, cz)) ?? null);
  }
}

function makeWorldWithDurability(seed: number, durability?: WorldEditDurability): World {
  const registry = createDefaultBlockRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = {
    generateChunk(chunk: Chunk): void {
      chunk.fill(BlockId.Stone);
    },
    getHeightAt(): number {
      return CONFIG.seaLevel + 1;
    },
  };
  const mesher = {
    mesh(): { opaque: null; transparent: null } {
      return { opaque: null, transparent: null };
    },
  };
  return new World({
    registry,
    seed,
    scene,
    mesher: mesher as never,
    generator: generator as never,
    materials,
    renderDistance: 2,
    ...(durability ? { editDurability: durability } : {}),
  });
}

/** Stream around the player chunk until it has generated (mirrors World.test). */
function streamUntilGenerated(world: World, cx: number, cz: number): void {
  for (let i = 0; i < 200; i++) {
    world.update(0.016, cx, cz);
    if (world.getBlock(cx * 16 + 8, 8, cz * 16 + 8) !== BlockId.Air) {
      return;
    }
  }
}

/** Canonical edit state = resident overlay ∪ durability captures, per chunk/cell. */
function canonicalState(world: World, durability: MockDurability): Map<string, Map<number, number>> {
  const merged = new Map<string, Map<number, number>>();
  for (const [key, map] of durability.captures) {
    merged.set(key, new Map(map));
  }
  for (const entry of world.exportEdits().edits) {
    const key = chunkKey(entry.chunk[0], entry.chunk[1], entry.chunk[2]);
    merged.set(key, new Map(entry.changes));
  }
  return merged;
}

function snapshotFrom(state: Map<string, Map<number, number>>, seed: number): WorldEditSnapshot {
  return {
    version: 1,
    seed,
    edits: [...state.entries()].map(([key, changes]) => ({
      chunk: key.split(',').map(Number) as [number, number, number],
      changes: [...changes.entries()],
    })),
  };
}

function expectStatesEqual(
  actual: Map<string, Map<number, number>>,
  expected: Map<string, Map<number, number>>,
): void {
  expect(actual.size).toBe(expected.size);
  for (const [key, expectedCells] of expected) {
    const actualCells = actual.get(key);
    expect(actualCells, `chunk ${key} missing`).toBeDefined();
    expect([...actualCells!.entries()].sort((a, b) => a[0] - b[0])).toEqual(
      [...expectedCells.entries()].sort((a, b) => a[0] - b[0]),
    );
  }
}

describe('world edit durability bridge', () => {
  it('captures every live setBlock edit and never captures importEdits', () => {
    const durability = new MockDurability();
    const world = makeWorldWithDurability(5, durability);
    streamUntilGenerated(world, 0, 0);

    world.setBlock(2, 9, 4, BlockId.Dirt);
    world.setBlock(6, 12, 9, BlockId.Cobblestone);

    const captured = durability.captures.get('0,0,0');
    expect(captured).toBeDefined();
    expect(captured!.get(localIndex(2, 9, 4))).toBe(BlockId.Dirt);
    expect(captured!.get(localIndex(6, 12, 9))).toBe(BlockId.Cobblestone);
    expect(captured!.size).toBe(2);

    // Boot-time bulk import is already durable: no re-capture.
    const before = durability.captureCalls;
    const imported = makeWorldWithDurability(5, durability);
    imported.importEdits({
      version: 1,
      seed: 5,
      edits: [{ chunk: [3, 0, 3], changes: [[localIndex(1, 1, 1), BlockId.Stone]] }],
    });
    expect(durability.captureCalls).toBe(before);
    expect(durability.captures.has('3,0,3')).toBe(false);
  });

  it('survives >10k-chunk LRU churn with exact per-cell equivalence and clean save/reload', () => {
    const seed = 42;
    const durability = new MockDurability();
    const world = makeWorldWithDurability(seed, durability);

    // Independently built expectation of the newest committed version per cell.
    const expected = new Map<string, Map<number, number>>();
    const edit = (x: number, y: number, z: number, id: number) => {
      const key = chunkKey(Math.floor(x / 16), Math.floor(y / 64), Math.floor(z / 16));
      let cells = expected.get(key);
      if (!cells) {
        cells = new Map<number, number>();
        expected.set(key, cells);
      }
      cells.set(localIndex(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16), id);
      world.setBlock(x, y, z, id);
    };

    // Early LRU candidate: edited first, re-edited to dirt only after the churn
    // has evicted it (DIRTY-3 newest-version-wins).
    edit(3, 5, 3, BlockId.Stone);

    const ids = [BlockId.Dirt, BlockId.Cobblestone, BlockId.Stone];
    const CHUNKS = 10_050; // > World.EDIT_OVERLAY_MAX_CHUNKS (10_000)
    for (let i = 0; i < CHUNKS; i++) {
      edit((i + 1) * 16 + 7, i % 64, 11, ids[i % 3]!);
    }

    // Re-edit chunk A post-eviction; the chunk is not loaded so this goes
    // through the overlay + capture path directly.
    edit(3, 5, 3, BlockId.Dirt);

    const distinctChunks = expected.size;
    expect(distinctChunks).toBe(10_051);

    // (a) resident cache stays bounded (DIRTY-4).
    expect(world.getEditOverlayChunkCount()).toBeLessThanOrEqual(10_000);

    // (b) every edited chunk's latest edits survive across overlay ∪ mock.
    const actual = canonicalState(world, durability);
    expectStatesEqual(actual, expected);

    // (c) every evicted chunk (absent from the overlay) is retained by the mock.
    const residentKeys = new Set(world.exportEdits().edits.map((e) => chunkKey(...e.chunk)));
    // Early churn chunks were evicted; chunk A was re-edited last so it is
    // resident again (MRU) — its newest dirt value is checked below.
    expect(residentKeys.has('1,0,0')).toBe(false);
    expect(durability.captures.has('1,0,0')).toBe(true);
    for (const key of expected.keys()) {
      if (!residentKeys.has(key)) {
        expect(durability.captures.has(key), `evicted chunk ${key} lost`).toBe(true);
      }
    }

    // Boundedness: mock holds exactly the distinct edited chunks, once each.
    expect(durability.captures.size).toBe(distinctChunks);
    // Canonical storage is the durable truth for unloaded chunks, and the
    // public ID projection remains visible after the slab projection evicts.
    expect(world.getBlock(3, 5, 3)).toBe(BlockId.Dirt);
    expect(world.storage.getBlock(3, 5, 3)).toBe(BlockId.Dirt);
    expect(world.getBlockState(3, 5, 3).blockId).toBe(BlockId.Dirt);
    expect(world.getBlockState(7, 3, 27).blockId).toBe(BlockId.Air);
    expect(world.getBlock(7, 3, 27)).toBe(BlockId.Air);
    // Save/reload equivalence: canonical snapshot → fresh world (same seed),
    // then compare FULL canonical edit state cell-by-cell (DIRTY-5).
    const snapshot = snapshotFrom(canonicalState(world, durability), seed);
    const reloadDurability = new MockDurability();
    const fresh = makeWorldWithDurability(seed, reloadDurability);
    const accepted = fresh.importEdits(snapshot);
    expect(accepted).toBeGreaterThan(0);
    expect(fresh.getEditOverlayChunkCount()).toBeLessThanOrEqual(10_000);
    expectStatesEqual(canonicalState(fresh, reloadDurability), expected);
    // The re-edited dirt value must win everywhere it should (not stale stone).
    expect(canonicalState(fresh, reloadDurability).get('0,0,0')!.get(localIndex(3, 5, 3))).toBe(
      BlockId.Dirt,
    );
  }, 30_000);

  it('re-materializes an evicted entry synchronously via restorePendingChunkEdits', () => {
    const durability = new MockDurability();
    const idx = localIndex(6, 10, 6);
    durability.pendingCopies.set('4,0,9', new Map([[idx, BlockId.Glass]]));
    const world = makeWorldWithDurability(7, durability);

    streamUntilGenerated(world, 4, 9);

    // Restored edit applied to regenerated blocks...
    expect(world.getBlock(4 * 16 + 6, 10, 9 * 16 + 6)).toBe(BlockId.Glass);
    // ...and the resident overlay entry re-materialized.
    const entry = world.exportEdits().edits.find((e) => chunkKey(...e.chunk) === '4,0,9');
    expect(entry).toBeDefined();
    expect(entry!.changes).toContainEqual([idx, BlockId.Glass]);
  });

  it('hydrates committed edits asynchronously without double-firing', async () => {
    const durability = new MockDurability();
    let resolveLoad!: (v: Array<[number, number]> | null) => void;
    const gate = new Promise<Array<[number, number]> | null>((resolve) => {
      resolveLoad = resolve;
    });
    durability.loadImpl = () => gate;
    const world = makeWorldWithDurability(8, durability);

    const idx = localIndex(5, 20, 5);
    streamUntilGenerated(world, 2, 3);
    expect(durability.loadCallsByKey.get('2,0,3')).toBe(1); // hydration fired on generation
    expect(world.getBlock(2 * 16 + 5, 20, 3 * 16 + 5)).toBe(BlockId.Stone); // not yet applied

    // Unload the chunk while hydration is still pending, then regenerate:
    // applyEditOverlay must not fire a second lookup for the same key.
    for (let i = 0; i < 500; i++) {
      world.update(0.016, 100, 100);
      if (world.getBlock(2 * 16 + 5, 20, 3 * 16 + 5) === BlockId.Air) break;
    }
    streamUntilGenerated(world, 2, 3);
    expect(durability.loadCallsByKey.get('2,0,3')).toBe(1);

    resolveLoad([[idx, BlockId.Dirt]]);
    await vi.waitFor(() => {
      expect(world.getBlock(2 * 16 + 5, 20, 3 * 16 + 5)).toBe(BlockId.Dirt);
    });
    // Hydration must write through to canonical column storage before updating
    // the compatibility projection; otherwise a later unload/reload loses it.
    expect(world.storage.getBlock(2 * 16 + 5, 20, 3 * 16 + 5)).toBe(BlockId.Dirt);
    // Resolved edits land in the overlay even though the chunk was unloaded
    // and regenerated during the pending window.
    const entry = world.exportEdits().edits.find((e) => chunkKey(...e.chunk) === '2,0,3');
    expect(entry).toBeDefined();
    expect(entry!.changes).toContainEqual([idx, BlockId.Dirt]);
  });

  it('hydration resolve does not revert a live edit that landed while it was pending', async () => {
    const durability = new MockDurability();
    let resolveLoad!: (v: Array<[number, number]> | null) => void;
    const gate = new Promise<Array<[number, number]> | null>((resolve) => {
      resolveLoad = resolve;
    });
    durability.loadImpl = () => gate;
    const world = makeWorldWithDurability(11, durability);

    const idx = localIndex(6, 18, 6);
    streamUntilGenerated(world, 3, 4);
    expect(durability.loadCallsByKey.get('3,0,4')).toBe(1); // hydration fired

    // A live edit lands while the committed-copy lookup is still pending.
    world.setBlock(3 * 16 + 6, 18, 4 * 16 + 6, BlockId.Cobblestone);
    expect(world.getBlock(3 * 16 + 6, 18, 4 * 16 + 6)).toBe(BlockId.Cobblestone);

    // The committed copy resolves AFTER the live edit: the resident overlay
    // (newer) must win — no visual/durable revert to the stale committed ids.
    resolveLoad([[idx, BlockId.Dirt]]);
    await vi.waitFor(() => {});
    expect(world.getBlock(3 * 16 + 6, 18, 4 * 16 + 6)).toBe(BlockId.Cobblestone);
    const entry = world.exportEdits().edits.find((e) => chunkKey(...e.chunk) === '3,0,4');
    expect(entry).toBeDefined();
    expect(entry!.changes).toContainEqual([idx, BlockId.Cobblestone]);
    expect(entry!.changes).not.toContainEqual([idx, BlockId.Dirt]);
    // The newer edit was captured for durability.
    const captured = durability.captures.get('3,0,4');
    expect(captured?.get(idx)).toBe(BlockId.Cobblestone);
  });

  it('filters invalid hydration payloads (out-of-range index / unregistered id)', async () => {
    const durability = new MockDurability();
    durability.committed.set('1,0,1', [
      [localIndex(4, 8, 4), BlockId.Grass],
      [999_999, BlockId.Stone], // out-of-range index
      [localIndex(5, 8, 4), 999], // unregistered id
      [-1, BlockId.Dirt], // negative index
    ]);
    const world = makeWorldWithDurability(9, durability);

    streamUntilGenerated(world, 1, 1);
    await vi.waitFor(() => {
      expect(world.getBlock(1 * 16 + 4, 8, 1 * 16 + 4)).toBe(BlockId.Grass);
    });
    expect(world.getBlock(1 * 16 + 5, 8, 1 * 16 + 4)).toBe(BlockId.Stone); // dropped → terrain

    const entry = world.exportEdits().edits.find((e) => chunkKey(...e.chunk) === '1,0,1');
    expect(entry!.changes).toEqual([[localIndex(4, 8, 4), BlockId.Grass]]);
  });

  it('keeps legacy cache-only behaviour when no durability is injected', () => {
    const world = makeWorldWithDurability(11);
    streamUntilGenerated(world, 0, 0);
    world.setBlock(8, 8, 8, BlockId.Sand);
    // Normal applyEditOverlay path intact: export/import round-trip.
    const snapshot = world.exportEdits();
    expect(snapshot.edits).toHaveLength(1);
    const restored = makeWorldWithDurability(11);
    restored.importEdits(snapshot);
    streamUntilGenerated(restored, 0, 0);
    expect(restored.getBlock(8, 8, 8)).toBe(BlockId.Sand);
  });
});
