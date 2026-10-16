import { describe, expect, it } from 'vitest';
import {
  MultiClientHarness,
  scenarioEntityPosition,
  type MultiClientHarnessSnapshot,
} from '../../src/simulation/MultiClientLoadHarness';
import {
  ChunkStreamManager,
  type ChunkSnapshot,
} from '../../src/simulation/ChunkStreaming';
import {
  ClientEntityStore,
  EntityReplicationManager,
  type EntitySpawnDescriptor,
  type EntityPosition,
} from '../../src/simulation/EntityReplication';
import {
  ClientInventoryReconciler,
  InventoryTransactionValidator,
  type InventoryTransaction,
  type ItemStack,
} from '../../src/simulation/InventoryTransactionNetworking';

// ────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ────────────────────────────────────────────────────────────────────────────

function makeChunk(key: string, tick = 1): ChunkSnapshot {
  const [xStr, zStr] = key.split(',');
  return { key, x: Number(xStr), z: Number(zStr), sections: [{ y: 0, data: [1] }], tick };
}

function makeEntity(id: number, position: EntityPosition = { x: 0, y: 0, z: 0 }): EntitySpawnDescriptor {
  return { id, type: 'cow', position: { ...position } };
}

function inRange(position: EntityPosition, center: EntityPosition, range: number): boolean {
  const dx = position.x - center.x;
  const dy = position.y - center.y;
  const dz = position.z - center.z;
  return dx * dx + dy * dy + dz * dz <= range * range;
}

/** The server manager's in-range entity ids (mirroring 229's interest rule), sorted. */
function serverInRangeIds(manager: EntityReplicationManager): number[] {
  const center = manager.center;
  if (center === null) return [];
  // Fixtures always construct the manager with the default trackingRange 64.
  const ids: number[] = [];
  const maxId = manager.authoritativeCount;
  for (let id = 0; id < maxId; id++) {
    const desc = manager.getEntity(id);
    if (desc && inRange(desc.position, center, 64)) ids.push(id);
  }
  return ids;
}

function harnessOptions(overrides: Record<string, unknown> = {}) {
  return {
    clientCount: 2,
    config: { viewDistance: 2, windowSlots: 40 },
    ...overrides,
  };
}
const emptySlots = (n: number): (null)[] => new Array<null>(n).fill(null);

// ────────────────────────────────────────────────────────────────────────────
// REQ-C1 — Fixture harness composition
// ────────────────────────────────────────────────────────────────────────────

describe('REQ-C1 harness composition', () => {
  it('two clients tick against one authoritative process to tick 100', () => {
    const h = new MultiClientHarness(harnessOptions({ clientCount: 2 }) as never);
    expect(h.clients).toHaveLength(2);
    expect(h.clients[0]!.index).toBe(0);
    expect(h.clients[1]!.index).toBe(1);
    expect(h.clients[0]!.connection.state).toBe('connected');
    expect(h.clients[1]!.connection.state).toBe('connected');
    h.step(100);
    expect(h.process.tick).toBe(100);
    for (const client of h.clients) {
      const records = h.metrics.clientTickRecords(client.index);
      expect(records).toHaveLength(100);
      expect(records[99]!.tick).toBe(100);
      expect(records[0]!.tick).toBe(1);
    }
  });

  it('clientCount 0 or a non-integer count throws MultiClientHarness: naming the field', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '2', null, undefined]) {
      expect(() =>
        new MultiClientHarness(harnessOptions({ clientCount: bad }) as never),
      ).toThrow(/MultiClientHarness: clientCount/);
    }
  });

  it('invalid per-session config throws MultiClientHarness: naming the field', () => {
    for (const bad of [0, -1, 2.5, NaN, Infinity, '4']) {
      expect(() =>
        new MultiClientHarness(harnessOptions({ config: { viewDistance: bad, windowSlots: 40 } }) as never),
      ).toThrow(/MultiClientHarness: config\.viewDistance/);
      expect(() =>
        new MultiClientHarness(harnessOptions({ config: { viewDistance: 2, windowSlots: bad } }) as never),
      ).toThrow(/MultiClientHarness: config\.windowSlots/);
    }
    expect(() =>
      new MultiClientHarness(harnessOptions({ config: { viewDistance: 2, windowSlots: 40, trackingRange: 0 } }) as never),
    ).toThrow(/MultiClientHarness: config\.trackingRange/);
    expect(() =>
      new MultiClientHarness(harnessOptions({ config: { viewDistance: 2, windowSlots: 40, maxSnapshots: 0 } }) as never),
    ).toThrow(/MultiClientHarness: config\.maxSnapshots/);
    expect(() =>
      new MultiClientHarness(harnessOptions({ config: { viewDistance: 2, windowSlots: 40, maxTracked: -3 } }) as never),
    ).toThrow(/MultiClientHarness: config\.maxTracked/);
    expect(() => new MultiClientHarness(harnessOptions({ clientCount: 0 }) as never)).toThrow(
      /MultiClientHarness: clientCount/,
    );
  });

  it('invalid scenario options throw without partial construction', () => {
    expect(() =>
      new MultiClientHarness(harnessOptions({ serverEntityCount: 0 }) as never),
    ).toThrow(/MultiClientHarness: serverEntityCount/);
    expect(() =>
      new MultiClientHarness(harnessOptions({ maxTicksPerFrame: 0 }) as never),
    ).toThrow(/MultiClientHarness: maxTicksPerFrame/);
    expect(() =>
      new MultiClientHarness(harnessOptions({ clock: {} }) as never),
    ).toThrow(/MultiClientHarness: clock/);
    expect(() =>
      new MultiClientHarness(harnessOptions({ systems: [{ tick: 'nope' }] }) as never),
    ).toThrow(/MultiClientHarness: systems 0/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// REQ-C2 — Deterministic ticking and failure-stops-everything
// ────────────────────────────────────────────────────────────────────────────

describe('REQ-C2 deterministic ticking and failure-stops-everything', () => {
  it('step(50) advances every one of 3 clients to the same authoritative tick 50', () => {
    const h = new MultiClientHarness(harnessOptions({ clientCount: 3 }) as never);
    h.step(50);
    expect(h.process.tick).toBe(50);
    for (const client of h.clients) {
      const records = h.metrics.clientTickRecords(client.index);
      expect(records).toHaveLength(50);
      expect(records[49]!.tick).toBe(50);
    }
  });

  it('a throwing world system stops the process and every client, failed tick uncounted', () => {
    const h = new MultiClientHarness(
      harnessOptions({
        clientCount: 2,
        systems: [
          {
            tick: (tick: number) => {
              if (tick === 3) throw new Error('simulated world failure');
            },
          },
        ],
      }) as never,
    );
    expect(() => h.step(5)).toThrow('simulated world failure');
    expect(h.process.isStopped).toBe(true);
    expect(h.process.lastError).toBeInstanceOf(Error);
    expect(h.process.tick).toBe(2);
    for (const client of h.clients) {
      const records = h.metrics.clientTickRecords(client.index);
      expect(records).toHaveLength(2);
      expect(records[1]!.tick).toBe(2);
    }
    // A further step rethrows the recorded error until reset().
    expect(() => h.step(1)).toThrow('simulated world failure');
  });

  it('reset() restores a clean re-runnable state once the throwing system is disarmed', () => {
    let armed = true;
    const h = new MultiClientHarness(
      harnessOptions({
        clientCount: 2,
        systems: [
          {
            tick: () => {
              if (armed) throw new Error('simulated world failure');
            },
          },
        ],
      }) as never,
    );
    expect(() => h.step(1)).toThrow('simulated world failure');
    expect(h.process.tick).toBe(0);
    armed = false;
    h.reset();
    expect(h.process.tick).toBe(0);
    expect(h.process.isStopped).toBe(false);
    expect(h.process.lastError).toBeNull();
    expect(h.metrics.totals().chunkAdded).toBe(0);
    expect(h.step(1)).toBe(1);
    expect(h.process.tick).toBe(1);
    // Reset also restores every client component to its pristine constructed state.
    for (const client of h.clients) {
      expect(client.connection.state).toBe('connected');
      expect(client.chunks.center).toBeNull();
      expect(client.entityClient.size).toBe(0);
      expect(client.reconciler.hasPending).toBe(false);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// REQ-C3 — Chunk correctness fixtures
// ────────────────────────────────────────────────────────────────────────────

describe('REQ-C3 chunk correctness fixtures', () => {
  it('first center set enters the full interest set exactly once, key-sorted', () => {
    const m = new ChunkStreamManager({ viewDistance: 4 });
    m.setCenter(0, 0);
    const interest = m.interest();
    expect(interest).toHaveLength(81);
    for (const key of interest) m.putSnapshot(makeChunk(key, 1));
    const first = m.pendingUpdates(1);
    expect(first.added).toHaveLength(81);
    expect(first.removed).toHaveLength(0);
    const keys = first.added.map((s) => s.key);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(81);
    const second = m.pendingUpdates(2);
    expect(second.added).toHaveLength(0);
    expect(second.updated).toHaveLength(0);
    expect(second.removed).toHaveLength(0);
  });

  it('one-column move yields the exact entered/left delta with no overlap', () => {
    const m = new ChunkStreamManager({ viewDistance: 1 });
    m.setCenter(0, 0);
    for (const key of m.interest()) m.putSnapshot(makeChunk(key, 1));
    m.pendingUpdates(1);
    const delta = m.setCenter(1, 0);
    expect(delta.left).toHaveLength(3);
    expect(delta.left).toEqual(['-1,-1', '-1,0', '-1,1']);
    expect(delta.entered).toEqual(['2,-1', '2,0', '2,1']);
    for (const key of delta.entered) m.putSnapshot(makeChunk(key, 2));
    const update = m.pendingUpdates(2);
    expect(update.removed).toEqual(delta.left);
    expect(update.added.map((s) => s.key)).toEqual(delta.entered);
    const overlap = new Set([...update.removed, ...update.added.map((s) => s.key)]);
    expect(overlap.size).toBe(6);
  });

  it('a late snapshot surfaces as an update, never as a duplicate add', () => {
    const m = new ChunkStreamManager({ viewDistance: 2 });
    m.setCenter(0, 0);
    const entered = m.setCenter(1, 0).entered; // e.g. '3,-2'..'3,2'
    expect(entered).toHaveLength(5);
    // No snapshots yet for the entered columns: the first drain adds nothing.
    const drained = m.pendingUpdates(1);
    expect(drained.added).toHaveLength(0);
    // A late snapshot surfaces exactly once (as an update).
    const key = entered[0]!;
    m.putSnapshot(makeChunk(key, 2));
    const late = m.pendingUpdates(2);
    const appearances = late.added.filter((s) => s.key === key).length + late.updated.filter((s) => s.key === key).length;
    expect(appearances).toBe(1);
    expect(late.added.some((s) => s.key === key)).toBe(false);
    expect(late.updated.some((s) => s.key === key)).toBe(true);
  });

  it('snapshot store eviction enforces the bounded capacity', () => {
    const m = new ChunkStreamManager({ viewDistance: 1, maxSnapshots: 2 });
    m.putSnapshot(makeChunk('0,0', 1));
    m.putSnapshot(makeChunk('1,0', 2));
    m.putSnapshot(makeChunk('2,0', 3));
    expect(m.hasSnapshot('0,0')).toBe(false); // oldest evicted
    expect(m.hasSnapshot('1,0')).toBe(true);
    expect(m.hasSnapshot('2,0')).toBe(true);
    // Re-putting an existing key does not evict.
    m.putSnapshot(makeChunk('1,0', 4));
    expect(m.hasSnapshot('1,0')).toBe(true);
    expect(m.hasSnapshot('2,0')).toBe(true);
    expect(m.hasSnapshot('0,0')).toBe(false);
  });

  it('two identical clients produce identical update sequences', () => {
    const a = new ChunkStreamManager({ viewDistance: 2 });
    const b = new ChunkStreamManager({ viewDistance: 2 });
    const sequencesA: string[][] = [];
    const sequencesB: string[][] = [];
    for (const m of [a, b]) {
      m.setCenter(0, 0);
      for (const key of m.interest()) m.putSnapshot(makeChunk(key, 1));
    }
    for (let tick = 1; tick <= 3; tick++) {
      for (const m of [a, b]) {
        if (tick === 2) {
          const delta = m.setCenter(1, 0);
          for (const key of delta.entered) m.putSnapshot(makeChunk(key, tick));
        }
      }
      sequencesA.push(a.pendingUpdates(tick).added.map((s) => s.key));
      sequencesB.push(b.pendingUpdates(tick).added.map((s) => s.key));
    }
    expect(sequencesA).toEqual(sequencesB);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// REQ-C4 — Entity correctness fixtures
// ────────────────────────────────────────────────────────────────────────────

describe('REQ-C4 entity correctness fixtures', () => {
  it('an entity entering range spawns exactly once', () => {
    const server = new EntityReplicationManager();
    server.upsertEntity(makeEntity(1, { x: 0, y: 0, z: 0 }));
    server.setCenter(0, 0, 0);
    const store = new ClientEntityStore();
    const first = server.collectUpdates(1);
    expect(first.spawned.map((s) => s.id)).toEqual([1]);
    store.applyBatch(first);
    expect(store.hasEntity(1)).toBe(true);
    const second = server.collectUpdates(2);
    expect(second.spawned).toHaveLength(0);
    store.applyBatch(second);
    expect(store.size).toBe(1);
  });

  it('an entity leaving range or removed despawns exactly once', () => {
    const server = new EntityReplicationManager();
    server.upsertEntity(makeEntity(1, { x: 0, y: 0, z: 0 }));
    server.setCenter(0, 0, 0);
    const store = new ClientEntityStore();
    store.applyBatch(server.collectUpdates(1));
    expect(store.size).toBe(1);
    server.setCenter(100, 0, 0);
    const batch = server.collectUpdates(2);
    expect(batch.despawned).toEqual([1]);
    store.applyBatch(batch);
    expect(store.hasEntity(1)).toBe(false);
    // Removal also despawns exactly once.
    server.setCenter(0, 0, 0);
    store.applyBatch(server.collectUpdates(3));
    expect(store.size).toBe(1);
    server.removeEntity(1);
    const removedBatch = server.collectUpdates(4);
    expect(removedBatch.despawned).toEqual([1]);
    store.applyBatch(removedBatch);
    expect(store.size).toBe(0);
  });

  it('deltas are replicated only for tracked entities', () => {
    const server = new EntityReplicationManager();
    server.upsertEntity(makeEntity(1, { x: 0, y: 0, z: 0 }));
    server.upsertEntity(makeEntity(2, { x: 1000, y: 0, z: 0 })); // far out of range
    server.setCenter(0, 0, 0);
    const store = new ClientEntityStore();
    store.applyBatch(server.collectUpdates(1));
    expect(store.hasEntity(1)).toBe(true);
    expect(store.hasEntity(2)).toBe(false);
    server.updateTransform(1, { position: { x: 1, y: 0, z: 0 } });
    server.updateTransform(2, { position: { x: 1001, y: 0, z: 0 } });
    server.updateTrackedData(1, [{ id: 7, value: 'a' }]);
    server.updateTrackedData(2, [{ id: 7, value: 'b' }]);
    const batch = server.collectUpdates(2);
    expect(batch.transforms.map((t) => t.id)).toEqual([1]);
    expect(batch.trackedData.map((t) => t.id)).toEqual([1]);
    store.applyBatch(batch);
    expect(store.getEntity(1)!.position.x).toBe(1);
    expect(store.getEntity(1)!.trackedData.get(7)).toBe('a');
  });

  it('client store converges to the authoritative tracked set', () => {
    const server = new EntityReplicationManager();
    for (let id = 0; id < 12; id++) {
      server.upsertEntity(makeEntity(id, scenarioEntityPosition(id)));
    }
    const store = new ClientEntityStore();
    // Sweep the center so entities churn fully out of range and back; the store must
    // track the server's in-range set at every step.
    const centers: EntityPosition[] = [
      { x: 0, y: 0, z: 0 },
      { x: 200, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ];
    let tick = 1;
    for (const center of centers) {
      server.setCenter(center.x, center.y, center.z);
      for (let i = 0; i < 12; i++) {
        // Mark every entity dirty without moving it (positions are fixed scenario data).
        server.updateTransform(i, { position: scenarioEntityPosition(i) });
      }
      store.applyBatch(server.collectUpdates(tick++));
      if (center.x === 200) {
        expect(store.size).toBe(0); // everything left range and despawned
      }
    }
    // The store equals the server's in-range set: id/type/position/trackedData.
    const expected = serverInRangeIds(server);
    expect(expected).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const actual = store.getAll().map((e) => e.id);
    expect(actual).toEqual(expected);
    for (const e of store.getAll()) {
      const authoritative = server.getEntity(e.id)!;
      expect(e.type).toBe(authoritative.type);
      expect(e.position).toEqual(authoritative.position);
    }
    expect(store.getAll().every((e) => expected.includes(e.id))).toBe(true);
  });

  it('maxTracked is enforced', () => {
    const server = new EntityReplicationManager({ maxTracked: 2 });
    server.upsertEntity(makeEntity(1));
    server.upsertEntity(makeEntity(2));
    expect(() => server.upsertEntity(makeEntity(3))).toThrow(
      'EntityReplication: maxTracked limit exceeded',
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// REQ-C5 — Inventory correctness fixtures
// ────────────────────────────────────────────────────────────────────────────

describe('REQ-C5 inventory correctness fixtures', () => {
  const windowWithItem = (): (ItemStack | null)[] => {
    const slots: (ItemStack | null)[] = new Array<ItemStack | null>(40).fill(null);
    slots[0] = { id: 1, count: 5, maxCount: 64 };
    return slots;
  };

  const click = (stateId: number, slotId: number, button: 'left' | 'right' = 'left'): InventoryTransaction => ({
    type: 'slot_click',
    windowId: 0,
    stateId,
    slotId,
    button,
  });

  it('accepted prediction confirms and leaves the reconciler clean', () => {
    const server = new InventoryTransactionValidator({ slots: windowWithItem() });
    const reconciler = new ClientInventoryReconciler();
    reconciler.predict([{ slotId: 0, stack: null }]);
    expect(reconciler.hasPending).toBe(true);
    const result = server.processTransaction(click(0, 0));
    expect(result.accepted).toBe(true);
    expect(reconciler.reconcile(result)).toBeNull();
    expect(reconciler.hasPending).toBe(false);
    // The client window equals the authoritative server window (item picked up).
    expect(server.currentSlots[0]).toBeNull();
    expect(server.currentCursorItem).toEqual({ id: 1, count: 5, maxCount: 64 });
  });

  it('rejected transaction rolls back to the authoritative snapshot', () => {
    const server = new InventoryTransactionValidator({ slots: windowWithItem() });
    const reconciler = new ClientInventoryReconciler();
    reconciler.predict([{ slotId: 1, stack: { id: 9, count: 1, maxCount: 64 } }]);
    const result = server.processTransaction(click(7, 0)); // wrong stateId (server is at 0)
    expect(result.accepted).toBe(false);
    const directive = reconciler.reconcile(result);
    expect(directive).not.toBeNull();
    expect(directive!.authoritativeSlots).toEqual(server.currentSlots);
    expect(directive!.authoritativeCursor).toEqual(server.currentCursorItem);
    expect(server.currentSlots[0]).toEqual({ id: 1, count: 5, maxCount: 64 }); // unchanged
  });

  it('wrong state id is rejected without mutation', () => {
    const server = new InventoryTransactionValidator({ slots: windowWithItem(), initialStateId: 3 });
    const before = server.currentSlots;
    for (const bad of [2, 4]) {
      const result = server.processTransaction(click(bad, 0));
      expect(result.accepted).toBe(false);
      expect((result as { reason: string }).reason).toBe('wrong_state_id');
      expect(server.currentStateId).toBe(3);
      expect(server.currentSlots).toEqual(before);
      expect(server.currentCursorItem).toBeNull();
    }
  });

  it('duplicate drag start and end-without-start are rejected', () => {
    const server = new InventoryTransactionValidator({ slots: emptySlots(40) });
    const start = (stateId: number): InventoryTransaction => ({
      type: 'drag',
      windowId: 0,
      stateId,
      phase: 'start',
      button: 'left',
    });
    const end = (stateId: number): InventoryTransaction => ({
      type: 'drag',
      windowId: 0,
      stateId,
      phase: 'end',
      button: 'left',
    });
    // End without start is rejected.
    const noStart = server.processTransaction(end(0));
    expect(noStart.accepted).toBe(false);
    expect((noStart as { reason: string }).reason).toBe('drag_not_started');
    // A valid start/end cycle runs.
    expect(server.processTransaction(start(0)).accepted).toBe(true);
    // Duplicate start while a drag is active is rejected and leaves the drag intact.
    const dup = server.processTransaction(start(0));
    expect(dup.accepted).toBe(false);
    expect((dup as { reason: string }).reason).toBe('drag_not_started');
    expect(server.processTransaction(end(0)).accepted).toBe(true);
  });

  it('two clients on a shared window converge', () => {
    const server = new InventoryTransactionValidator({ slots: windowWithItem() });
    const client = new InventoryTransactionValidator({ slots: windowWithItem() });
    const serverReconciler = new ClientInventoryReconciler();
    const clientReconciler = new ClientInventoryReconciler();
    // Server picks up slot 0; the shared authoritative state is broadcast to the client.
    const accepted = server.processTransaction(click(0, 0));
    expect(accepted.accepted).toBe(true);
    serverReconciler.reconcile(accepted);
    client.reset(server.currentSlots, undefined, server.currentCursorItem, server.currentStateId);
    // Client submits a stale (wrong-stateId) transaction; it is rejected with a rollback.
    const stale = client.processTransaction(click(0, 1));
    expect(stale.accepted).toBe(false);
    expect((stale as { reason: string }).reason).toBe('wrong_state_id');
    const directive = clientReconciler.reconcile(stale);
    expect(directive!.authoritativeSlots).toEqual(server.currentSlots);
    // Both windows converge to the authoritative state; stateId reflects accepted mutations only.
    expect(client.currentSlots).toEqual(server.currentSlots);
    expect(client.currentCursorItem).toEqual(server.currentCursorItem);
    expect(client.currentStateId).toBe(server.currentStateId);
    expect(serverReconciler.hasPending).toBe(false);
    expect(clientReconciler.hasPending).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// REQ-C6 — Multi-client convergence
// ────────────────────────────────────────────────────────────────────────────

describe('REQ-C6 multi-client convergence', () => {
  it('interleaved chunk/entity/inventory operations converge every client', () => {
    const h = new MultiClientHarness(
      harnessOptions({
        clientCount: 4,
        config: { viewDistance: 2, windowSlots: 40 },
        serverEntityCount: 12,
      }) as never,
    );
    // Clients A(0) and B(1) stream chunks; A/C/D receive entity replicas; all four submit
    // inventory transactions with at least one rejection each.
    h.setClientCenter(0, 0, 0);
    for (const key of h.clients[0]!.chunks.interest()) {
      h.putClientSnapshot(0, makeChunk(key, 1));
    }
    h.setClientEntityCenter(0, 0, 0, 0);
    h.setClientCenter(1, 3, 0);
    for (const key of h.clients[1]!.chunks.interest()) {
      h.putClientSnapshot(1, makeChunk(key, 1));
    }
    // Clients C(2) and D(3) track entities only (chunk interest stays empty).
    h.setClientEntityCenter(2, 0, 0, 0);
    h.setClientEntityCenter(3, 0, 0, 0);
    // Every client queues one wrong-stateId transaction (rejected) then a valid drag cycle
    // (accepted; drag start does not bump the stateId, drag end bumps it to 1).
    for (const client of h.clients) {
      h.queueClientTransaction(client.index, {
        type: 'slot_click',
        windowId: 0,
        stateId: 99,
        slotId: 0,
        button: 'left',
      });
      h.queueClientTransaction(client.index, {
        type: 'drag',
        windowId: 0,
        stateId: 0,
        phase: 'start',
        button: 'left',
      });
      h.queueClientTransaction(client.index, {
        type: 'drag',
        windowId: 0,
        stateId: 0,
        phase: 'end',
        button: 'left',
      });
    }
    h.step(1);
    // Run to quiescence (no further inputs).
    expect(h.process.tick).toBe(1);
    for (const client of h.clients) {
      // Chunk interest matches the authoritative center the test provided.
      const expectedInterest = client.chunks.interest();
      expect(expectedInterest.length).toBe(client.index <= 1 ? 25 : 0);
      // Entity store matches the authoritative in-range set (all 12 entities are within
      // trackingRange 64 of the origin for clients with a center; none for client 1).
      const expectedIds = client.index === 1 ? [] : serverInRangeIds(client.entityServer);
      expect(client.entityClient.getAll().map((e) => e.id)).toEqual(expectedIds);
      // Window/cursor match the server; reconcilers hold no pending prediction.
      expect(client.inventory.currentSlots).toEqual(emptySlots(40));
      expect(client.inventory.currentCursorItem).toBeNull();
      expect(client.reconciler.hasPending).toBe(false);
      // Each client: 1 rejected + 2 accepted transactions.
      const totals = h.metrics.clientTotals(client.index);
      expect(totals.inventoryRejected).toBe(1);
      expect(totals.inventoryAccepted).toBe(2);
      expect(client.inventory.currentStateId).toBe(1);
    }
    // Clients with a center spawned all 12 entities in the first epoch.
    for (const index of [0, 2, 3]) {
      expect(h.metrics.clientTickRecords(index)[0]!.metrics.entitySpawned).toBe(12);
    }
    expect(h.metrics.clientTickRecords(1)[0]!.metrics.entitySpawned).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// REQ-C7 — Determinism and replay
// ────────────────────────────────────────────────────────────────────────────

describe('REQ-C7 determinism and replay', () => {
  function runScript(): MultiClientHarness {
    const h = new MultiClientHarness(
      harnessOptions({
        clientCount: 2,
        config: { viewDistance: 2, windowSlots: 40 },
        serverEntityCount: 10,
      }) as never,
    );
    h.setClientCenter(0, 0, 0);
    for (const key of h.clients[0]!.chunks.interest()) h.putClientSnapshot(0, makeChunk(key, 1));
    h.setClientCenter(1, 2, 0);
    for (const key of h.clients[1]!.chunks.interest()) h.putClientSnapshot(1, makeChunk(key, 1));
    h.step(4);
    h.setClientCenter(0, 1, 0);
    for (const key of h.clients[0]!.chunks.interest()) h.putClientSnapshot(0, makeChunk(key, 5));
    h.queueClientTransaction(0, {
      type: 'drag',
      windowId: 0,
      stateId: 0,
      phase: 'start',
      button: 'left',
    });
    h.queueClientTransaction(0, {
      type: 'drag',
      windowId: 0,
      stateId: 0,
      phase: 'end',
      button: 'left',
    });
    h.step(6);
    return h;
  }

  it('repeated identical runs record identical observation sequences and convergence', () => {
    const h1 = runScript();
    const h2 = runScript();
    expect(h1.process.tick).toBe(10);
    expect(h2.process.tick).toBe(10);
    for (let i = 0; i < 2; i++) {
      expect(h1.metrics.clientTickRecords(i)).toEqual(h2.metrics.clientTickRecords(i));
    }
    expect(h1.metrics.totals()).toEqual(h2.metrics.totals());
    for (let i = 0; i < 2; i++) {
      expect(h1.clients[i]!.chunks.interest()).toEqual(h2.clients[i]!.chunks.interest());
      expect(h1.clients[i]!.entityClient.getAll()).toEqual(h2.clients[i]!.entityClient.getAll());
      expect(h1.clients[i]!.inventory.currentSlots).toEqual(h2.clients[i]!.inventory.currentSlots);
      expect(h1.clients[i]!.inventory.currentStateId).toBe(h2.clients[i]!.inventory.currentStateId);
    }
  });

  it('restore-then-step equals a fresh run', () => {
    const h1 = runScript();
    const snapshot = h1.snapshot();
    expect(snapshot.tick).toBe(10);
    // Continuation on h1.
    h1.step(3);
    const h2 = new MultiClientHarness(
      harnessOptions({
        clientCount: 2,
        config: { viewDistance: 2, windowSlots: 40 },
        serverEntityCount: 10,
      }) as never,
    );
    h2.restore(snapshot);
    expect(h2.process.tick).toBe(10);
    expect(h2.metrics.clientTickRecords(0)).toEqual(h1.metrics.clientTickRecords(0).slice(0, 10));
    h2.step(3);
    // Post-restore observations are identical to the fresh continuation.
    for (let i = 0; i < 2; i++) {
      expect(h2.metrics.clientTickRecords(i)).toEqual(h1.metrics.clientTickRecords(i));
    }
    expect(h2.metrics.totals()).toEqual(h1.metrics.totals());
    expect(h2.clients[0]!.chunks.interest()).toEqual(h1.clients[0]!.chunks.interest());
    expect(h2.clients[0]!.inventory.currentStateId).toBe(h1.clients[0]!.inventory.currentStateId);
    expect(h2.clients[0]!.inventory.currentSlots).toEqual(h1.clients[0]!.inventory.currentSlots);
  });

  it('restore rejects malformed snapshots without changing the harness', () => {
    const h = runScript();
    const before = h.metrics.totals();
    const bad = ({ tick: 10, log: [{ kind: 'nope', client: 0 }] } as unknown) as MultiClientHarnessSnapshot;
    expect(() => h.restore(bad)).toThrow(/MultiClientHarness: malformed harness snapshot/);
    expect(h.process.tick).toBe(10);
    expect(h.metrics.totals()).toEqual(before);
    const badIndex = ({ tick: 10, log: [{ kind: 'step', ticks: 1 }, { kind: 'setCenter', client: 5, x: 0, z: 0 }] } as unknown) as MultiClientHarnessSnapshot;
    expect(() => h.restore(badIndex)).toThrow(/MultiClientHarness: malformed harness snapshot/);
    expect(h.process.tick).toBe(10);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// REQ-C8 — Boundary and failure fixtures
// ────────────────────────────────────────────────────────────────────────────

describe('REQ-C8 boundary and failure fixtures', () => {
  it('out-of-range inventory inputs throw without mutation', () => {
    function clickFor(slotId: number): InventoryTransaction {
      return { type: 'slot_click', windowId: 0, stateId: 0, slotId, button: 'left' };
    }
    const server = new InventoryTransactionValidator({ slots: emptySlots(40) });
    const before = server.currentSlots;
    expect(() => server.processTransaction(clickFor(40))).toThrow(/InventoryTransaction: slotId 40 out of range/);
    expect(server.currentSlots).toEqual(before);
    expect(server.currentStateId).toBe(0);

    // A hotbar swap outside [0, 8] also throws without mutation.
    expect(() =>
      server.processTransaction({
        type: 'hotbar_swap',
        windowId: 0,
        stateId: 0,
        slotId: 0,
        hotbarSlot: 9,
      }),
    ).toThrow(/InventoryTransaction: hotbarSlot/);
    expect(server.currentSlots).toEqual(before);
  });

  it('invalid entity input throws without mutation', () => {
    const server = new EntityReplicationManager();
    server.upsertEntity(makeEntity(1));
    expect(() => server.upsertEntity({ id: -1, type: 'cow', position: { x: 0, y: 0, z: 0 } })).toThrow(
      'EntityReplication: id must be a non-negative safe integer',
    );
    expect(() =>
      server.upsertEntity({ id: 2, type: 'cow', position: { x: NaN, y: 0, z: 0 } }),
    ).toThrow('EntityReplication: coordinates must be finite numbers');
    expect(server.authoritativeCount).toBe(1);
    expect(server.hasEntity(2)).toBe(false);
  });

  it('invalid chunk tick throws without consuming accumulators', () => {
    const m = new ChunkStreamManager({ viewDistance: 1 });
    m.setCenter(0, 0);
    m.putSnapshot(makeChunk('0,0', 1));
    m.putSnapshot(makeChunk('1,0', 1));
    expect(() => m.pendingUpdates(-1)).toThrow(/ChunkStream: tick must be a non-negative safe integer/);
    const drained = m.pendingUpdates(1);
    expect(drained.added).toHaveLength(2); // accumulators were NOT consumed by the failed call
    expect(drained.removed).toHaveLength(0);
  });

  it('harness input methods reject invalid client indices without mutation', () => {
    function clickFor(slotId: number): InventoryTransaction {
      return { type: 'slot_click', windowId: 0, stateId: 0, slotId, button: 'left' };
    }
    const h = new MultiClientHarness(harnessOptions({ clientCount: 2 }) as never);
    expect(() => h.setClientCenter(2, 0, 0)).toThrow(/MultiClientHarness: clientIndex must be in \[0, 2\)/);
    expect(() => h.putClientSnapshot(-1, makeChunk('0,0'))).toThrow(/MultiClientHarness: clientIndex/);
    expect(() => h.queueClientTransaction(5, clickFor(0))).toThrow(/MultiClientHarness: clientIndex/);
    expect(() => h.queueClientTransaction(0, ({ type: 'teleport' } as unknown) as InventoryTransaction)).toThrow(
      /MultiClientHarness: transaction type/,
    );
    expect(h.queuedTransactionCount(0)).toBe(0);
  });

  it('stepTo performs bounded condition stepping', () => {
    const h = new MultiClientHarness(harnessOptions({ clientCount: 2 }) as never);
    expect(h.stepTo(10, 3)).toBe(3);
    expect(h.process.tick).toBe(3);
    expect(h.stepTo(10, 100)).toBe(7);
    expect(h.process.tick).toBe(10);
    expect(h.stepTo(5, 100)).toBe(0); // already past the target
    expect(h.step(0)).toBe(0);
    expect(h.step(2.5)).toBe(0);
  });
});
