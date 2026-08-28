import { describe, it, expect } from "vitest";
import {
  LightUpdateEngine,
  ChannelUpdateQueue,
  updateLightAfterEdit,
  type LightChannelContext,
  type VoxelLightAccess,
} from "../../src/rendering/LightUpdateEngine";
import { WorldLightStorage } from "../../src/rendering/LightStorage";

const MIN_Y = 0;
const MAX_Y = 16;

/**
 * A tiny 16³ block/luminance field. `blocks` holds opaque cells, `luminance`
 * the emitters; light values live in a real {@link WorldLightStorage}.
 */
class Field implements VoxelLightAccess {
  readonly storage = new WorldLightStorage();
  readonly blocks = new Set<string>();
  readonly luminance = new Map<string, number>();

  private static key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  isOpaque(x: number, y: number, z: number): boolean {
    return this.blocks.has(Field.key(x, y, z));
  }

  getLuminance(x: number, y: number, z: number): number {
    return this.luminance.get(Field.key(x, y, z)) ?? 0;
  }

  setLuminance(x: number, y: number, z: number, value: number): void {
    if (value === 0) this.luminance.delete(Field.key(x, y, z));
    else this.luminance.set(Field.key(x, y, z), value);
  }
}

/** Deterministic full-recompute reference for the same field contents. */
function fullRecompute(field: Field): WorldLightStorage {
  const reference = new WorldLightStorage();
  const world = {
    isOpaque: (x: number, y: number, z: number) => field.isOpaque(x, y, z),
    getLuminance: (x: number, y: number, z: number) =>
      field.getLuminance(x, y, z),
    getSkyLight: (x: number, y: number, z: number) =>
      reference.getSkyLight(x, y, z),
    setSkyLight: (x: number, y: number, z: number, v: number) =>
      reference.setSkyLight(x, y, z, v),
    getBlockLight: (x: number, y: number, z: number) =>
      reference.getBlockLight(x, y, z),
    setBlockLight: (x: number, y: number, z: number, v: number) =>
      reference.setBlockLight(x, y, z, v),
    minY: MIN_Y,
    maxY: MAX_Y,
  };
  for (const key of field.luminance.keys()) {
    const [x, y, z] = key.split(",").map(Number);
    updateLightAfterEdit(world, x!, y!, z!);
  }
  return reference;
}

function assertFieldsEqual(a: WorldLightStorage, b: WorldLightStorage): void {
  for (let x = 0; x < 16; x++) {
    for (let y = MIN_Y; y < MAX_Y; y++) {
      for (let z = 0; z < 16; z++) {
        expect(b.getSkyLight(x, y, z)).toBe(a.getSkyLight(x, y, z));
        expect(b.getBlockLight(x, y, z)).toBe(a.getBlockLight(x, y, z));
      }
    }
  }
}

function drainFully(engine: LightUpdateEngine): void {
  let guard = 0;
  while (!engine.idle && guard++ < 1000) engine.drain({ maxOps: 4096 });
}

describe("LightUpdateEngine facade", () => {
  it("onBlockChanged queues minimal work and repeated invalidations dedupe", () => {
    const field = new Field();
    field.setLuminance(8, 8, 8, 14);
    const engine = new LightUpdateEngine(field.storage, field, {
      minY: MIN_Y,
      maxY: MAX_Y,
    });

    engine.onBlockChanged(8, 8, 8);
    const afterFirst = engine.pendingCounts();
    // One cell per channel; sky is dark everywhere so no column extension.
    expect(afterFirst).toEqual({ sky: 1, block: 1, total: 2 });

    engine.onBlockChanged(8, 8, 8);
    engine.onBlockChanged(8, 8, 8);
    expect(engine.pendingCounts()).toEqual(afterFirst);

    drainFully(engine);
    expect(engine.idle).toBe(true);
  });

  it("drain({maxOps}) respects the cap and resumes to completion", () => {
    const field = new Field();
    for (let i = 0; i < 4; i++) field.setLuminance(3 + i * 3, 5, 7 + i, 12);
    const engine = new LightUpdateEngine(field.storage, field, {
      minY: MIN_Y,
      maxY: MAX_Y,
    });
    for (let i = 0; i < 4; i++) engine.onBlockChanged(3 + i * 3, 5, 7 + i);

    let totalOps = 0;
    while (!engine.idle) {
      const result = engine.drain({ maxOps: 2 });
      expect(result.opsUsed).toBeLessThanOrEqual(4); // ≤2 per channel
      totalOps += result.opsUsed;
      if (!result.completed) expect(result.remainingOps).toBeGreaterThan(0);
    }
    expect(totalOps).toBeGreaterThan(4); // work was actually split across drains

    // Everything queued has now landed.
    const settled = fullRecompute(field);
    assertFieldsEqual(field.storage, settled);
  });

  it("version increments only on productive drains", () => {
    const field = new Field();
    field.setLuminance(6, 6, 6, 10);
    const engine = new LightUpdateEngine(field.storage, field, {
      minY: MIN_Y,
      maxY: MAX_Y,
    });
    expect(engine.version).toBe(0);

    engine.drain(); // nothing queued → idle drain
    expect(engine.version).toBe(0);

    engine.onBlockChanged(6, 6, 6);
    const first = engine.drain();
    expect(first.opsUsed).toBeGreaterThan(0);
    const versionAfterWork = engine.version;
    expect(versionAfterWork).toBeGreaterThan(0);

    engine.drain(); // still idle afterwards
    expect(engine.version).toBe(versionAfterWork);
  });

  it("removal-before-readd matches a full recompute on a small fixture", () => {
    const field = new Field();
    field.setLuminance(5, 5, 5, 14);
    field.setLuminance(10, 9, 7, 12);
    field.blocks.add("7,5,5"); // shadows part of the first source's reach

    const engine = new LightUpdateEngine(field.storage, field, {
      minY: MIN_Y,
      maxY: MAX_Y,
    });
    engine.onBlockChanged(5, 5, 5);
    engine.onBlockChanged(10, 9, 7);
    drainFully(engine);
    assertFieldsEqual(field.storage, fullRecompute(field));

    // Remove one source; incremental result must equal a fresh recompute.
    field.setLuminance(5, 5, 5, 0);
    engine.onBlockChanged(5, 5, 5);
    drainFully(engine);
    assertFieldsEqual(field.storage, fullRecompute(field));

    // And re-adding it at a different level also converges to the reference.
    field.setLuminance(5, 5, 5, 9);
    engine.onBlockChanged(5, 5, 5);
    drainFully(engine);
    assertFieldsEqual(field.storage, fullRecompute(field));
  });

  it("exposes its storage and luminance passthrough", () => {
    const field = new Field();
    field.setLuminance(1, 2, 3, 5);
    const engine = new LightUpdateEngine(field.storage, field, {
      minY: MIN_Y,
      maxY: MAX_Y,
    });
    expect(engine.lightStorage).toBe(field.storage);
    expect(engine.luminanceAt(1, 2, 3)).toBe(5);
  });
});

describe("ChannelUpdateQueue", () => {
  function context(
    overrides: Partial<LightChannelContext> = {},
  ): LightChannelContext & { values: Map<string, number> } {
    const values = new Map<string, number>();
    return {
      values,
      minY: 0,
      maxY: 16,
      isOpaque: () => false,
      get: (x, y, z) => values.get(`${x},${y},${z}`) ?? 0,
      set: (x, y, z, v) => {
        if (v === 0) values.delete(`${x},${y},${z}`);
        else values.set(`${x},${y},${z}`, v);
      },
      attenuate: (value) => value - 1,
      consumesEqualDown: false,
      ...overrides,
    };
  }

  it("invalidate ignores out-of-bounds Y and drains report completion", () => {
    const ctx = context();
    const queue = new ChannelUpdateQueue();
    queue.invalidate(ctx, 0, -1, 0);
    queue.invalidate(ctx, 0, 16, 0);
    expect(queue.pendingCount).toBe(0);
    expect(queue.idle).toBe(true);

    const result = queue.drain(ctx, {});
    expect(result.completed).toBe(true);
    expect(result.remainingOps).toBe(0);
  });

  it("clear drops queued work without touching stored values", () => {
    const ctx = context(); // get/set backed by the values map
    ctx.values.set("0,0,0", 5);
    const queue = new ChannelUpdateQueue();
    queue.invalidate(ctx, 0, 0, 0);
    expect(queue.pendingCount).toBe(1);
    queue.clear();
    expect(queue.idle).toBe(true);
    expect(ctx.values.get("0,0,0")).toBe(5); // stored light untouched
  });
});

// ── Facade seam coverage (verification campaign) ────────────────────────────

describe("LightUpdateEngine — invalidateCell / clearPending / skylight channel", () => {
  it("invalidateCell queues both channels exactly like onBlockChanged", () => {
    const field = new Field();
    field.setLuminance(4, 4, 4, 12);
    const engine = new LightUpdateEngine(field.storage, field, {
      minY: MIN_Y,
      maxY: MAX_Y,
    });

    engine.invalidateCell(4, 4, 4);
    expect(engine.pendingCounts()).toEqual({ sky: 1, block: 1, total: 2 });
    drainFully(engine);
    expect(engine.idle).toBe(true);
  });

  it("clearPending drops queued work without touching stored light", () => {
    const field = new Field();
    field.storage.setSkyLight(6, 6, 6, 15); // pre-existing column light
    const engine = new LightUpdateEngine(field.storage, field, {
      minY: MIN_Y,
      maxY: MAX_Y,
    });

    engine.onBlockChanged(6, 6, 6);
    expect(engine.idle).toBe(false);
    engine.clearPending();
    expect(engine.idle).toBe(true);
    expect(engine.pendingCounts().total).toBe(0);
    // Stored value untouched by the clear.
    expect(field.storage.getSkyLight(6, 6, 6)).toBe(15);
  });

  it("skylight removal consumes equal-level columns downward and re-adds survivors", () => {
    const field = new Field();
    // A lit skylight column at x=3,z=3 from y=15 down to y=0 (classic open-sky shaft).
    for (let y = MIN_Y; y < MAX_Y; y++) field.storage.setSkyLight(3, y, 3, 15);
    const engine = new LightUpdateEngine(field.storage, field, {
      minY: MIN_Y,
      maxY: MAX_Y,
    });

    // Roof closes over the column top: every directly-lit cell below must collapse.
    field.blocks.add("3,15,3");
    engine.onBlockChanged(3, 15, 3);
    drainFully(engine);

    // The whole former shaft went dark (no side inflow in this fixture).
    let lit = 0;
    for (let y = MIN_Y; y < MAX_Y; y++)
      if (field.storage.getSkyLight(3, y, 3) > 0) lit++;
    expect(lit).toBe(0);
    expect(engine.version).toBeGreaterThan(0);
  });

  it("skylight edits re-add side-inflow after a partial obstruction", () => {
    const field = new Field();
    // Lit column plus a bright neighbor wall to re-light from.
    for (let y = MIN_Y; y < MAX_Y; y++) {
      field.storage.setSkyLight(3, y, 3, 15);
      field.storage.setSkyLight(2, y, 3, 15);
    }
    const engine = new LightUpdateEngine(field.storage, field, {
      minY: MIN_Y,
      maxY: MAX_Y,
    });

    field.blocks.add("3,15,3"); // obstruct one column's head
    engine.onBlockChanged(3, 15, 3);
    drainFully(engine);

    // Deep cells of the obstructed column now carry side-inflow light (< 15 but > 0).
    const deep = field.storage.getSkyLight(3, 2, 3);
    expect(deep).toBeGreaterThan(0);
    expect(deep).toBeLessThan(15);
    void fullRecompute;
  });
});
