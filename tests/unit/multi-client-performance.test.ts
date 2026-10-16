import { describe, expect, it } from 'vitest';
import {
  BASELINE_LOAD,
  DEFAULT_BASELINE_BUDGETS,
  MultiClientHarness,
  MultiClientMetricsCollector,
  evaluateMultiClientBudgets,
  scenarioEntityPosition,
  validateMultiClientBudgets,
  type ClientSession,
  type ClientTickMetrics,
  type MultiClientBudgets,
  type MultiClientBudgetReport,
  type MultiClientLoadMetrics,
} from '../../src/simulation/MultiClientLoadHarness';
import type { ChunkSnapshot } from '../../src/simulation/ChunkStreaming';
import type { EntityPosition } from '../../src/simulation/EntityReplication';
import type { InventoryTransaction } from '../../src/simulation/InventoryTransactionNetworking';
import type { TickSystem } from '../../src/simulation/WorldTickProcess';

// ────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ────────────────────────────────────────────────────────────────────────────

function makeChunk(key: string, tick = 1): ChunkSnapshot {
  const [xStr, zStr] = key.split(',');
  return { key, x: Number(xStr), z: Number(zStr), sections: [{ y: 0, data: [1] }], tick };
}

/** A full drag start/end pair at the given stateId (drag end bumps the stateId). */
function dragPair(stateId: number): InventoryTransaction[] {
  return [
    { type: 'drag', windowId: 0, stateId, phase: 'start', button: 'left' },
    { type: 'drag', windowId: 0, stateId, phase: 'end', button: 'left' },
  ];
}

function emptyMetrics(): ClientTickMetrics {
  return {
    chunkAdded: 0,
    chunkUpdated: 0,
    chunkRemoved: 0,
    entitySpawned: 0,
    entityDespawned: 0,
    entityTransforms: 0,
    entityTrackedData: 0,
    inventoryAccepted: 0,
    inventoryRejected: 0,
    inventoryMutations: 0,
  };
}

function inRange(position: EntityPosition, center: EntityPosition, range: number): boolean {
  const dx = position.x - center.x;
  const dy = position.y - center.y;
  const dz = position.z - center.z;
  return dx * dx + dy * dy + dz * dz <= range * range;
}

/**
 * Exact mirror of `ChunkStreamManager.putSnapshot` eviction: oldest-first by first
 * insertion; re-putting an existing key does not reorder it. Used to prove the store
 * stayed at its bound without reaching into private state.
 */
function simulateStore(keys: readonly string[], max: number): { order: string[]; present: Set<string> } {
  const order: string[] = [];
  const present = new Set<string>();
  for (const key of keys) {
    if (!present.has(key)) {
      if (present.size >= max) {
        const oldest = order.shift()!;
        present.delete(oldest);
      }
      present.add(key);
      order.push(key);
    }
  }
  return { order, present };
}

// ────────────────────────────────────────────────────────────────────────────
// REQ-P1 — Headless metric collection
// ────────────────────────────────────────────────────────────────────────────

describe('REQ-P1 headless metric collection', () => {
  it('collector reports exact totals for a scripted run', () => {
    const h = new MultiClientHarness({
      clientCount: 2,
      config: { viewDistance: 2, windowSlots: 40 },
      serverEntityCount: 10,
    });
    // Client 0 at the origin, client 1 at (5, 0): 25 snapshot columns each.
    h.setClientCenter(0, 0, 0);
    for (const key of h.clients[0]!.chunks.interest()) h.putClientSnapshot(0, makeChunk(key, 1));
    h.setClientEntityCenter(0, 0, 0, 0);
    h.setClientCenter(1, 5, 0);
    for (const key of h.clients[1]!.chunks.interest()) h.putClientSnapshot(1, makeChunk(key, 1));
    h.setClientEntityCenter(1, 0, 0, 0);
    // 10 ticks; every tick every client queues two full drag cycles. A drag start does not
    // bump the stateId, a drag end does, so at tick t the stateId is 2*(t-1) and the four
    // transactions [start(S), end(S), start(S+1), end(S+1)] with S = 2*(t-1) all accept.
    for (let t = 1; t <= 10; t++) {
      const s = 2 * (t - 1);
      for (const client of h.clients) {
        for (const tx of [...dragPair(s), ...dragPair(s + 1)]) {
          h.queueClientTransaction(client.index, tx);
        }
      }
      h.step(1);
    }
    const totals = h.metrics.totals();
    // Chunk added == sum of columns entered (25 per client).
    expect(h.metrics.clientTotals(0).chunkAdded).toBe(25);
    expect(h.metrics.clientTotals(1).chunkAdded).toBe(25);
    expect(totals.chunkAdded).toBe(50);
    // Entity spawned == in-range count per client (all 10 within trackingRange 64).
    expect(totals.entitySpawned).toBe(20);
    // Inventory accepted + rejected == queued transactions (10 ticks x 4 x 2 clients).
    expect(totals.inventoryAccepted).toBe(80);
    expect(totals.inventoryRejected).toBe(0);
    expect(totals.inventoryAccepted + totals.inventoryRejected).toBe(80);
    // Per-client-tick maxima: 25 chunks, 10 entities, 4 inventory on the first tick.
    expect(h.metrics.perClientTickMaxes()).toEqual({
      chunkAdded: 25,
      entitySpawned: 10,
      inventoryAcceptedRejected: 4,
    });
  });

  it('collector validation rejects misuse and preserves prior counts', () => {
    const collector = new MultiClientMetricsCollector(2);
    collector.recordClientTick(0, 1, { ...emptyMetrics(), chunkAdded: 3 });
    collector.recordClientTick(1, 1, { ...emptyMetrics(), entitySpawned: 5 });
    // Negative / non-integer counters and out-of-range indices are all rejected.
    const badMetrics: Partial<ClientTickMetrics>[] = [
      { chunkAdded: -1 },
      { entitySpawned: 1.5 },
      { inventoryAccepted: NaN },
      { inventoryRejected: Infinity },
    ];
    for (const bad of badMetrics) {
      expect(() =>
        collector.recordClientTick(0, 2, { ...emptyMetrics(), ...bad } as ClientTickMetrics),
      ).toThrow(/MultiClientHarness: metrics\./);
    }
    expect(() => collector.recordClientTick(-1, 2, emptyMetrics())).toThrow(/MultiClientHarness: clientIndex/);
    expect(() => collector.recordClientTick(2, 2, emptyMetrics())).toThrow(/MultiClientHarness: clientIndex/);
    expect(() => collector.recordClientTick(0, 1.5, emptyMetrics())).toThrow(/MultiClientHarness: tick/);
    expect(() => collector.recordClientTick(0, -2, emptyMetrics())).toThrow(/MultiClientHarness: tick/);
    // Prior counts are intact.
    expect(collector.clientTotals(0).chunkAdded).toBe(3);
    expect(collector.clientTotals(1).entitySpawned).toBe(5);
    expect(collector.clientTickRecords(0)).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// REQ-P2 — Budget config validation
// ────────────────────────────────────────────────────────────────────────────

describe('REQ-P2 budget config validation', () => {
  const fields: (keyof MultiClientBudgets)[] = [
    'minTicksPerSecond',
    'maxElapsedMsForTicks',
    'maxChunkAddedPerClient',
    'maxEntitySpawnedPerClient',
    'maxInventoryAcceptedPerClient',
  ];
  const badValues: unknown[] = [0, -1, NaN, Infinity, '5', null, undefined];

  it('invalid budget is rejected naming the field', () => {
    for (const field of fields) {
      for (const bad of badValues) {
        const input: Record<string, unknown> = { ...DEFAULT_BASELINE_BUDGETS };
        input[field] = bad;
        expect(() => validateMultiClientBudgets(input)).toThrow(
          new RegExp(`MultiClientBudgets: ${field}`),
        );
      }
    }
    for (const notObject of [null, undefined, 42, 'budget', []]) {
      expect(() => validateMultiClientBudgets(notObject)).toThrow(/MultiClientBudgets/);
    }
  });

  it('valid budgets pass unchanged and boundary equality is within budget', () => {
    const budgets = validateMultiClientBudgets({ ...DEFAULT_BASELINE_BUDGETS });
    expect(budgets).toEqual(DEFAULT_BASELINE_BUDGETS);
    // Every actual exactly at its boundary (075 convention: equality counts as within).
    const atBoundary: MultiClientLoadMetrics = {
      sustainedTicksPerSecond: DEFAULT_BASELINE_BUDGETS.minTicksPerSecond,
      elapsedMs: DEFAULT_BASELINE_BUDGETS.maxElapsedMsForTicks,
      maxChunkAddedPerClientTick: DEFAULT_BASELINE_BUDGETS.maxChunkAddedPerClient,
      maxEntitySpawnedPerClientTick: DEFAULT_BASELINE_BUDGETS.maxEntitySpawnedPerClient,
      maxInventoryAcceptedPerClientTick: DEFAULT_BASELINE_BUDGETS.maxInventoryAcceptedPerClient,
    };
    const boundary = evaluateMultiClientBudgets(budgets, atBoundary);
    expect(boundary.withinBudget).toBe(true);
    for (const entry of boundary.entries) expect(entry.withinBudget).toBe(true);
    // One ticks/sec below the floor fails that dimension and the overall verdict.
    const slow: MultiClientLoadMetrics = { ...atBoundary, sustainedTicksPerSecond: budgets.minTicksPerSecond - 1 };
    const slowReport = evaluateMultiClientBudgets(budgets, slow);
    expect(slowReport.withinBudget).toBe(false);
    const tpsEntry = slowReport.entries.find((e) => e.dimension === 'minTicksPerSecond')!;
    expect(tpsEntry.withinBudget).toBe(false);
    // Malformed actuals violate their dimension instead of reporting a false pass.
    for (const badActual of [NaN, Infinity, -5]) {
      const bad: MultiClientLoadMetrics = { ...atBoundary, elapsedMs: badActual };
      const report = evaluateMultiClientBudgets(budgets, bad);
      expect(report.withinBudget).toBe(false);
      const entry = report.entries.find((e) => e.dimension === 'maxElapsedMsForTicks')!;
      expect(entry.withinBudget).toBe(false);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// REQ-P3 + REQ-P7 — Wall-clock canonical scenario (throughput + elapsed ceilings)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Drive the canonical BASELINE_LOAD scenario under the wall clock and return the
 * measured actuals plus the budget verdict. Per spec (multi-client-performance-fixtures
 * "Measurement context"): inside the full parallel suite this asserts only the
 * load-independent structural ceilings and records the actuals; the throughput/elapsed
 * budget verdict is enforced by the canonical isolated measurement below
 * (`MC_CANONICAL=1 npx vitest run tests/unit/multi-client-performance.test.ts`).
 */
interface BaselineLoadResult {
  readonly processTick: number;
  readonly sustainedTicksPerSecond: number;
  readonly elapsedMs: number;
  readonly maxChunkAdded: number;
  readonly maxEntitySpawned: number;
  readonly maxInventoryAcceptedRejected: number;
  readonly report: MultiClientBudgetReport;
}

function runBaselineLoad(): BaselineLoadResult {
  // Per-tick entity churn through a factory system: every client's server manager is
  // re-marked dirty with in-range positions, so the consume pass replicates 1024
  // transforms per client per tick (independent of machine speed).
  const churn = (clients: readonly ClientSession[]): readonly TickSystem[] => [
    {
      tick: (t: number) => {
        for (const c of clients) {
          for (let i = 0; i < 1024; i++) {
            c.entityServer.updateTransform(i, {
              position: { x: (i + c.index + t) % 64, y: 0, z: 0 },
            });
          }
        }
      },
    },
  ];
  const h = new MultiClientHarness({
    ...BASELINE_LOAD.options,
    systems: churn,
  });
  for (const c of h.clients) {
    h.setClientCenter(c.index, 0, 0);
    for (const key of c.chunks.interest()) h.putClientSnapshot(c.index, makeChunk(key, 1));
    h.setClientEntityCenter(c.index, 0, 0, 0);
  }
  const startMs = performance.now();
  for (let t = 1; t <= BASELINE_LOAD.ticks; t++) {
    const s = 2 * (t - 1);
    for (const c of h.clients) {
      for (const tx of [...dragPair(s), ...dragPair(s + 1)]) {
        h.queueClientTransaction(c.index, tx);
      }
    }
    h.step(1);
  }
  const elapsedMs = performance.now() - startMs;
  const sustainedTicksPerSecond = BASELINE_LOAD.ticks / (elapsedMs / 1000);
  const maxes = h.metrics.perClientTickMaxes();
  const metrics: MultiClientLoadMetrics = {
    sustainedTicksPerSecond,
    elapsedMs,
    maxChunkAddedPerClientTick: maxes.chunkAdded,
    maxEntitySpawnedPerClientTick: maxes.entitySpawned,
    maxInventoryAcceptedPerClientTick: maxes.inventoryAcceptedRejected,
  };
  return {
    processTick: h.process.tick,
    sustainedTicksPerSecond,
    elapsedMs,
    maxChunkAdded: maxes.chunkAdded,
    maxEntitySpawned: maxes.entitySpawned,
    maxInventoryAcceptedRejected: maxes.inventoryAcceptedRejected,
    report: evaluateMultiClientBudgets(DEFAULT_BASELINE_BUDGETS, metrics),
  };
}

describe('REQ-P3 + REQ-P7 wall-clock canonical scenario', () => {
  it('BASELINE_LOAD measures actuals and honors the load-independent structural ceilings', () => {
    const r = runBaselineLoad();
    // Real measured numbers, recorded in verification.md (both contexts).
    console.log(
      `[236 BASELINE_LOAD] elapsedMs=${r.elapsedMs.toFixed(1)} sustainedTps=${r.sustainedTicksPerSecond.toFixed(1)} ` +
        `maxChunkAdded=${r.maxChunkAdded} maxEntitySpawned=${r.maxEntitySpawned} ` +
        `maxInventoryAcceptedRejected=${r.maxInventoryAcceptedRejected} withinBudget=${r.report.withinBudget}`,
    );
    expect(r.processTick).toBe(BASELINE_LOAD.ticks);
    // Per-client-tick ceilings are structural (interest/tracked/queue sizes) and
    // load-independent; the throughput/elapsed verdict lives in the canonical test below.
    expect(r.maxChunkAdded).toBeLessThanOrEqual(DEFAULT_BASELINE_BUDGETS.maxChunkAddedPerClient);
    expect(r.maxEntitySpawned).toBeLessThanOrEqual(DEFAULT_BASELINE_BUDGETS.maxEntitySpawnedPerClient);
    expect(r.maxInventoryAcceptedRejected).toBeLessThanOrEqual(
      DEFAULT_BASELINE_BUDGETS.maxInventoryAcceptedPerClient,
    );
  }, 180000);

  // Canonical isolated measurement: run alone via
  //   MC_CANONICAL=1 npx vitest run tests/unit/multi-client-performance.test.ts
  // (no other test file competes for CPU), and enforce the normative throughput and
  // elapsed budgets (REQ-P3/REQ-P7). The verdict is recorded in verification.md.
  it.skipIf(process.env.MC_CANONICAL !== '1')(
    'canonical isolated measurement sustains >= 200 ticks/sec within 6000 ms',
    () => {
      const r = runBaselineLoad();
      console.log(
        `[236 BASELINE_LOAD canonical] elapsedMs=${r.elapsedMs.toFixed(1)} ` +
          `sustainedTps=${r.sustainedTicksPerSecond.toFixed(1)} withinBudget=${r.report.withinBudget}`,
      );
      expect(r.report.withinBudget).toBe(true);
      expect(r.sustainedTicksPerSecond).toBeGreaterThanOrEqual(
        DEFAULT_BASELINE_BUDGETS.minTicksPerSecond,
      );
      expect(r.elapsedMs).toBeLessThanOrEqual(DEFAULT_BASELINE_BUDGETS.maxElapsedMsForTicks);
    },
    180000,
  );
});

// ────────────────────────────────────────────────────────────────────────────
// REQ-P4 — Per-tick message ceilings
// ────────────────────────────────────────────────────────────────────────────

describe('REQ-P4 per-tick message ceilings', () => {
  it('first-center chunk added count is bounded by the interest size', () => {
    const h = new MultiClientHarness({
      clientCount: 2,
      config: { viewDistance: 4, windowSlots: 40 },
    });
    for (const c of h.clients) {
      h.setClientCenter(c.index, 0, 0);
      const interest = c.chunks.interest();
      expect(interest).toHaveLength(81);
      for (const key of interest) h.putClientSnapshot(c.index, makeChunk(key, 1));
    }
    h.step(1);
    for (const c of h.clients) {
      const first = h.metrics.clientTickRecords(c.index)[0]!.metrics;
      expect(first.chunkAdded).toBe(81); // <= 81 and no duplicates (interest has 81 keys)
    }
    expect(h.metrics.perClientTickMaxes().chunkAdded).toBeLessThanOrEqual(
      DEFAULT_BASELINE_BUDGETS.maxChunkAddedPerClient,
    );
  });

  it('entity spawn count is bounded by the in-range tracked count', () => {
    const h = new MultiClientHarness({ ...BASELINE_LOAD.options });
    for (const c of h.clients) {
      h.setClientEntityCenter(c.index, 0, 0, 0);
    }
    h.step(1);
    // Every seeded entity lies within trackingRange 64 of the origin.
    let inRangeCount = 0;
    for (let i = 0; i < BASELINE_LOAD.options.serverEntityCount!; i++) {
      if (inRange(scenarioEntityPosition(i), { x: 0, y: 0, z: 0 }, 64)) inRangeCount++;
    }
    expect(inRangeCount).toBe(1024);
    for (const c of h.clients) {
      const first = h.metrics.clientTickRecords(c.index)[0]!.metrics;
      expect(first.entitySpawned).toBe(1024);
      expect(first.entitySpawned).toBeLessThanOrEqual(
        DEFAULT_BASELINE_BUDGETS.maxEntitySpawnedPerClient,
      );
    }
  });

  it('inventory accepted count is bounded by the queued transactions', () => {
    const h = new MultiClientHarness({
      clientCount: 1,
      config: { viewDistance: 2, windowSlots: 40 },
    });
    // 16 drag pairs in one tick: at stateId 0 every start/end accepts in order.
    for (let s = 0; s < 16; s++) {
      for (const tx of dragPair(s)) h.queueClientTransaction(0, tx);
    }
    h.step(1);
    const first = h.metrics.clientTickRecords(0)[0]!.metrics;
    expect(first.inventoryAccepted).toBe(32);
    expect(first.inventoryAccepted + first.inventoryRejected).toBe(32);
    expect(first.inventoryAccepted + first.inventoryRejected).toBeLessThanOrEqual(
      DEFAULT_BASELINE_BUDGETS.maxInventoryAcceptedPerClient,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// REQ-P5 — Deterministic timing
// ────────────────────────────────────────────────────────────────────────────

describe('REQ-P5 deterministic timing', () => {
  function scriptedRun(): MultiClientHarness {
    const h = new MultiClientHarness({
      clientCount: 2,
      config: { viewDistance: 2, windowSlots: 40 },
      serverEntityCount: 10,
    });
    h.setClientCenter(0, 0, 0);
    for (const key of h.clients[0]!.chunks.interest()) h.putClientSnapshot(0, makeChunk(key, 1));
    h.setClientEntityCenter(0, 0, 0, 0);
    h.setClientCenter(1, 2, 0);
    for (const key of h.clients[1]!.chunks.interest()) h.putClientSnapshot(1, makeChunk(key, 1));
    h.setClientEntityCenter(1, 0, 0, 0);
    // Four drag cycles queued up front are all consumed at tick 1 (each drag end bumps the
    // stateId, so consecutive pairs at stateIds 0..3 all accept). Scripted timestamps:
    // 0 anchors, then 500 ms steps at 20 TPS emit 10 ticks each -> 40 ticks total.
    for (let s = 0; s < 4; s++) {
      for (const tx of dragPair(s)) h.queueClientTransaction(0, tx);
    }
    for (const nowMs of [0, 500, 1000, 1500, 2000]) {
      h.update(nowMs);
    }
    return h;
  }

  it('identical scripted runs produce identical deterministic metrics', () => {
    const a = scriptedRun();
    const b = scriptedRun();
    expect(a.process.tick).toBe(40);
    expect(b.process.tick).toBe(40);
    for (let i = 0; i < 2; i++) {
      expect(a.metrics.clientTickRecords(i)).toEqual(b.metrics.clientTickRecords(i));
    }
    expect(a.metrics.totals()).toEqual(b.metrics.totals());
    expect(a.metrics.clientTotals(0).entitySpawned).toBe(10);
    expect(a.metrics.clientTotals(0).inventoryAccepted).toBe(8);
  });

  it('wall-clock speed does not change deterministic metrics', async () => {
    const a = scriptedRun();
    // Replay the same script with artificially slowed wall time between drive calls.
    const h = new MultiClientHarness({
      clientCount: 2,
      config: { viewDistance: 2, windowSlots: 40 },
      serverEntityCount: 10,
    });
    h.setClientCenter(0, 0, 0);
    for (const key of h.clients[0]!.chunks.interest()) h.putClientSnapshot(0, makeChunk(key, 1));
    h.setClientEntityCenter(0, 0, 0, 0);
    h.setClientCenter(1, 2, 0);
    for (const key of h.clients[1]!.chunks.interest()) h.putClientSnapshot(1, makeChunk(key, 1));
    h.setClientEntityCenter(1, 0, 0, 0);
    for (let s = 0; s < 4; s++) {
      for (const tx of dragPair(s)) h.queueClientTransaction(0, tx);
    }
    for (const nowMs of [0, 500, 1000, 1500, 2000]) {
      h.update(nowMs);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(h.process.tick).toBe(40);
    for (let i = 0; i < 2; i++) {
      expect(h.metrics.clientTickRecords(i)).toEqual(a.metrics.clientTickRecords(i));
    }
    expect(h.metrics.totals()).toEqual(a.metrics.totals());
  });
});

// ────────────────────────────────────────────────────────────────────────────
// REQ-P6 — Long-run resource boundedness
// ────────────────────────────────────────────────────────────────────────────

describe('REQ-P6 long-run resource boundedness', () => {
  it('a 10,000-tick run keeps chunk/entity stores bounded and reconcilers empty', () => {
    const maxSnapshots = 16;
    const maxTracked = 200;
    const h = new MultiClientHarness({
      clientCount: 4,
      config: { viewDistance: 4, windowSlots: 40, maxSnapshots, maxTracked, trackingRange: 64 },
      serverEntityCount: 200,
    });
    const putLog: string[][] = [[], [], [], []];
    for (const c of h.clients) {
      h.setClientCenter(c.index, 0, 0);
      for (const key of c.chunks.interest()) h.putClientSnapshot(c.index, makeChunk(key, 1));
      h.setClientEntityCenter(c.index, 0, 0, 0);
    }
    for (let t = 1; t <= 10000; t++) {
      // Every 5 ticks the centers sweep x 0 -> 60 -> 0 (sawtooth), churning columns.
      if (t % 5 === 0) {
        const phase = Math.floor(t / 5) % 24;
        const x = (phase < 12 ? phase : 24 - phase) * 5;
        for (const c of h.clients) {
          const delta = h.setClientCenter(c.index, x, 0);
          for (const key of delta.entered) {
            h.putClientSnapshot(c.index, makeChunk(key, t));
            putLog[c.index]!.push(key);
          }
        }
      }
      // One queued drag cycle mid-run; stateId is still 0 (nothing accepted before).
      if (t === 100) {
        for (const c of h.clients) {
          for (const tx of dragPair(0)) h.queueClientTransaction(c.index, tx);
        }
      }
      h.step(1);
    }
    // Chunk stores: the FIFO simulation of the eviction bound must match hasSnapshot exactly.
    for (const c of h.clients) {
      const simulated = simulateStore(putLog[c.index]!, maxSnapshots);
      expect(simulated.present.size).toBe(maxSnapshots);
      // Re-entered keys appear multiple times in the put log; count distinct present keys.
      const presentLogged = new Set<string>();
      for (const key of putLog[c.index]!) {
        const present = h.clients[c.index]!.chunks.hasSnapshot(key);
        if (present) presentLogged.add(key);
        expect(present).toBe(simulated.present.has(key));
      }
      expect(presentLogged.size).toBe(maxSnapshots);
    }
    // Entity stores stay within maxTracked; reconcilers hold no pending prediction.
    for (const c of h.clients) {
      expect(c.entityClient.size).toBeLessThanOrEqual(maxTracked);
      expect(c.reconciler.hasPending).toBe(false);
    }
    expect(h.process.tick).toBe(10000);
  }, 120000);
});
