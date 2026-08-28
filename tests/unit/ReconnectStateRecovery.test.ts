import { describe, expect, it } from 'vitest';
import {
  ReconnectStateManager,
  ReconnectStateClient,
  compareSignatures,
  type ClientStateSignature,
  type FullStateInput,
  type FullStateSnapshot,
  type InventorySnapshot,
  type ServerStateSignature,
} from '../../src/simulation/ReconnectStateRecovery';
import type { EntitySpawnDescriptor } from '../../src/simulation/EntityReplication';
import { columnKey, ChunkStreamManager, type ChunkSnapshot } from '../../src/simulation/ChunkStreaming';
import { ClientEntityStore } from '../../src/simulation/EntityReplication';
import {
  ClientInventoryReconciler,
  InventoryTransactionValidator,
  type TransactionResult,
} from '../../src/simulation/InventoryTransactionNetworking';
import { MovementAuthority } from '../../src/simulation/MovementAuthority';
import { MovementReconciler } from '../../src/simulation/MovementReconciler';
import { ClientBlockReconciler } from '../../src/simulation/BlockInteractionNetworking';

// ────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ────────────────────────────────────────────────────────────────────────────

function makeChunk(key: string, tick = 10): ChunkSnapshot {
  const [xStr, zStr] = key.split(',');
  return { key, x: Number(xStr), z: Number(zStr), sections: [{ y: 0, data: [1] }], tick };
}

function makeEntity(id: number): EntitySpawnDescriptor {
  return { id, type: 'cow', position: { x: id * 2, y: 0, z: 0 } };
}

function makeInventory(stateId = 0, overrides: Partial<InventorySnapshot> = {}): InventorySnapshot {
  return {
    stateId,
    slots: new Array<null>(36).fill(null),
    hotbar: new Array<null>(9).fill(null),
    cursorItem: null,
    ...overrides,
  };
}

function makeInput(overrides: Partial<FullStateInput> = {}): FullStateInput {
  return {
    profile: 'alice',
    epoch: 1,
    tick: 10,
    position: { x: 0, y: 0, z: 0 },
    chunks: [makeChunk('0,0')],
    entities: [makeEntity(1)],
    inventory: makeInventory(),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<FullStateSnapshot> = {}): FullStateSnapshot {
  const input = makeInput({ epoch: 2, tick: 120, position: { x: 10, y: 0, z: 10 } });
  const base: FullStateSnapshot = {
    profile: 'alice',
    epoch: 2,
    tick: input.tick,
    position: { ...input.position },
    chunkKeys: ['0,0', '1,0'],
    chunkSnapshots: [makeChunk('0,0', 120), makeChunk('1,0', 120)],
    entities: [makeEntity(1), makeEntity(3)],
    inventory: makeInventory(7),
  };
  return { ...base, ...overrides };
}

function clientSignature(overrides: Partial<ClientStateSignature> = {}): ClientStateSignature {
  return {
    profile: 'alice',
    epoch: 2,
    tick: 120,
    position: { x: 10, y: 0, z: 10 },
    inventoryStateId: 7,
    interest: ['0,0', '1,0'],
    entities: [1, 3],
    ...overrides,
  };
}

function serverSignature(overrides: Partial<ServerStateSignature> = {}): ServerStateSignature {
  return clientSignature(overrides);
}

/** Mimics the server's dispatch gate: stale-epoch messages are dropped before any sub-protocol. */
function gate<T>(
  manager: ReconnectStateManager,
  profile: string,
  epoch: number,
  fn: () => T,
): T | null {
  return manager.isSessionCurrent(profile, epoch) ? fn() : null;
}

const emptySlots36 = (): (null)[] => new Array<null>(36).fill(null);
const emptyHotbar = (): (null)[] => new Array<null>(9).fill(null);

// ────────────────────────────────────────────────────────────────────────────
// Task 2.1 — connect/disconnect/reconnect, epoch issuance, bounded history
// ────────────────────────────────────────────────────────────────────────────

describe('ReconnectStateManager connect/disconnect/reconnect and epoch issuance (reconnect-session REQ-1, REQ-2, REQ-4)', () => {
  it('first connect issues epoch 1 with isReconnect false', () => {
    const manager = new ReconnectStateManager();
    expect(manager.connect('alice')).toEqual({ epoch: 1, isReconnect: false });
  });

  it('reconnect while active issues an incremented epoch with isReconnect true', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    expect(manager.connect('alice')).toEqual({ epoch: 2, isReconnect: true });
  });

  it('connect after a clean disconnect issues an incremented epoch with isReconnect true', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    manager.disconnect('alice');
    expect(manager.connect('alice')).toEqual({ epoch: 2, isReconnect: true });
  });

  it('per-profile counters are independent', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    manager.connect('alice');
    expect(manager.connect('bob')).toEqual({ epoch: 1, isReconnect: false });
    expect(manager.currentEpoch('alice')).toBe(2);
    expect(manager.currentEpoch('bob')).toBe(1);
  });

  it('empty profile throws and creates no session', () => {
    const manager = new ReconnectStateManager();
    expect(() => manager.connect('')).toThrow('Reconnect: profile must be a non-empty string');
    expect(() => manager.hasActiveSession('')).toThrow('Reconnect: profile must be a non-empty string');
    expect(() => manager.currentEpoch('')).toThrow('Reconnect: profile must be a non-empty string');
    expect(manager.epochCount).toBe(0);
    expect(manager.history).toEqual([]);
  });

  it('whitespace profile throws and creates no session', () => {
    const manager = new ReconnectStateManager();
    expect(() => manager.connect('   ')).toThrow('Reconnect: profile must be a non-empty string');
    expect(manager.epochCount).toBe(0);
    expect(manager.history).toEqual([]);
  });

  it('disconnect ends the active session (REQ-2)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    manager.disconnect('alice');
    expect(manager.hasActiveSession('alice')).toBe(false);
    expect(manager.currentEpoch('alice')).toBeNull();
  });

  it('disconnect with no active session throws', () => {
    const manager = new ReconnectStateManager();
    expect(() => manager.disconnect('bob')).toThrow('Reconnect: profile has no active session');
  });

  it('double disconnect throws', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    manager.disconnect('alice');
    expect(() => manager.disconnect('alice')).toThrow('Reconnect: profile has no active session');
  });

  it('history records connect and disconnect transitions oldest first (REQ-4)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    manager.disconnect('alice');
    manager.connect('alice');
    expect(manager.history).toEqual([
      { profile: 'alice', kind: 'connect', epoch: 1 },
      { profile: 'alice', kind: 'disconnect', epoch: 1 },
      { profile: 'alice', kind: 'connect', epoch: 2 },
    ]);
  });

  it('history is bounded with the oldest record dropped (REQ-4)', () => {
    const manager = new ReconnectStateManager({ historyLimit: 2 });
    manager.connect('alice'); // 1
    manager.disconnect('alice'); // 2
    manager.connect('alice'); // 3
    expect(manager.history.length).toBe(2);
    expect(manager.history[0]).toEqual({ profile: 'alice', kind: 'disconnect', epoch: 1 });
    expect(manager.history[1]).toEqual({ profile: 'alice', kind: 'connect', epoch: 2 });
  });

  it('default historyLimit is 32', () => {
    const manager = new ReconnectStateManager();
    for (let i = 0; i < 35; i += 1) {
      manager.connect('alice');
    }
    expect(manager.history.length).toBe(32);
    expect(manager.history[0]).toEqual({ profile: 'alice', kind: 'connect', epoch: 4 });
    expect(manager.history[31]).toEqual({ profile: 'alice', kind: 'connect', epoch: 35 });
  });

  it('invalid historyLimit is rejected at construction (REQ-4)', () => {
    expect(() => new ReconnectStateManager({ historyLimit: 0 })).toThrow(
      'Reconnect: historyLimit must be a positive integer',
    );
    expect(() => new ReconnectStateManager({ historyLimit: 2.5 })).toThrow(
      'Reconnect: historyLimit must be a positive integer',
    );
    expect(() => new ReconnectStateManager({ historyLimit: -1 })).toThrow(
      'Reconnect: historyLimit must be a positive integer',
    );
  });

  it('epochCount counts connect transitions across profiles', () => {
    const manager = new ReconnectStateManager();
    expect(manager.epochCount).toBe(0);
    manager.connect('alice');
    manager.connect('alice');
    manager.connect('bob');
    expect(manager.epochCount).toBe(3);
  });

  it('currentEpoch and hasActiveSession return null/false for unknown profiles', () => {
    const manager = new ReconnectStateManager();
    expect(manager.currentEpoch('carol')).toBeNull();
    expect(manager.hasActiveSession('carol')).toBe(false);
  });

  it('history getter returns copies (caller mutation cannot alter the log)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    const history = manager.history as unknown as { kind: string }[];
    history[0]!.kind = 'disconnect';
    expect(manager.history[0]!.kind).toBe('connect');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 2.2 — isSessionCurrent stale/replay and mid-transaction rejection
// ────────────────────────────────────────────────────────────────────────────

describe('isSessionCurrent stale/replay rejection (reconnect-session REQ-3, REQ-5)', () => {
  it('current epoch is accepted (REQ-3)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    expect(manager.isSessionCurrent('alice', 1)).toBe(true);
  });

  it('previous-session epoch is rejected after reconnect (REQ-3)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    manager.connect('alice');
    expect(manager.isSessionCurrent('alice', 1)).toBe(false);
    expect(manager.isSessionCurrent('alice', 2)).toBe(true);
  });

  it('all epochs are rejected after disconnect (REQ-3)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    manager.disconnect('alice');
    expect(manager.isSessionCurrent('alice', 1)).toBe(false);
    expect(manager.isSessionCurrent('alice', 0)).toBe(false);
  });

  it('unknown profile is rejected (REQ-3)', () => {
    const manager = new ReconnectStateManager();
    expect(manager.isSessionCurrent('carol', 1)).toBe(false);
  });

  it('epoch is validated before the active-session check', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    expect(() => manager.isSessionCurrent('alice', -1)).toThrow(
      'Reconnect: epoch must be a non-negative safe integer',
    );
    expect(() => manager.isSessionCurrent('alice', 1.5)).toThrow(
      'Reconnect: epoch must be a non-negative safe integer',
    );
    expect(() => manager.isSessionCurrent('alice', NaN)).toThrow(
      'Reconnect: epoch must be a non-negative safe integer',
    );
  });

  it('profile is validated on isSessionCurrent', () => {
    const manager = new ReconnectStateManager();
    expect(() => manager.isSessionCurrent('', 1)).toThrow('Reconnect: profile must be a non-empty string');
  });

  it('late mid-drag inventory transaction from the old session is rejected after reconnect (REQ-5)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice'); // epoch 1
    const validator = new InventoryTransactionValidator({
      slots: emptySlots36(),
      hotbar: emptyHotbar(),
      initialStateId: 0,
    });
    // A drag is started (mid-transaction) under epoch 1.
    const start = gate(manager, 'alice', 1, () =>
      validator.processTransaction({
        type: 'drag',
        windowId: 0,
        stateId: 0,
        phase: 'start',
        button: 'left',
        slotId: 0,
      }),
    );
    expect(start!.accepted).toBe(true);
    const stateIdAfterStart = validator.currentStateId;

    // Disconnect mid-drag, then reconnect: epoch 2 is current, epoch 1 is stale.
    manager.disconnect('alice');
    manager.connect('alice'); // epoch 2
    expect(manager.isSessionCurrent('alice', 1)).toBe(false);

    // The late drag-end tagged with epoch 1 is dropped before reaching the validator.
    const lateEnd = gate(manager, 'alice', 1, () =>
      validator.processTransaction({
        type: 'drag',
        windowId: 0,
        stateId: 0,
        phase: 'end',
        button: 'left',
        slotId: 0,
      }),
    );
    expect(lateEnd).toBeNull();
    expect(validator.currentStateId).toBe(stateIdAfterStart); // untouched: nothing reached it

    // New-session traffic passes the gate (the validator's reaction is 231's own domain).
    const fresh = gate(manager, 'alice', 2, () =>
      validator.processTransaction({
        type: 'drag',
        windowId: 0,
        stateId: 0,
        phase: 'start',
        button: 'left',
        slotId: 0,
      }),
    );
    expect(fresh).not.toBeNull();
    expect((fresh as TransactionResult).accepted).toBe(false); // 231's own wrong_state_id rejection
  });

  it('pending movement intent from the old session cannot be applied after reconnect (REQ-5)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice'); // epoch 1
    const authority = new MovementAuthority({ maxSpeedPerTick: 4 });
    authority.spawn({ x: 0, y: 0, z: 0 }, 0);
    expect(
      gate(manager, 'alice', 1, () => authority.submitIntent({ x: 1, y: 0, z: 0 }, 1))!.accepted,
    ).toBe(true);

    manager.disconnect('alice');
    manager.connect('alice'); // epoch 2
    expect(manager.isSessionCurrent('alice', 1)).toBe(false);

    // A late intent tagged with the old epoch is discarded at the gate.
    const lateIntent = gate(manager, 'alice', 1, () => authority.submitIntent({ x: 2, y: 0, z: 0 }, 2));
    expect(lateIntent).toBeNull();

    // The authoritative position is unchanged by the discarded intent.
    expect(authority.position).toEqual({ x: 1, y: 0, z: 0 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 2.3 — compareSignatures divergence detection
// ────────────────────────────────────────────────────────────────────────────

describe('compareSignatures divergence detection (state-resynchronization REQ-2, REQ-3)', () => {
  it('equal signatures require no resync (REQ-2)', () => {
    expect(compareSignatures(clientSignature(), serverSignature())).toEqual({
      needsResync: false,
      reasons: [],
    });
  });

  it('empty-vs-empty interest and entities are equal (REQ-2)', () => {
    const base = { interest: [], entities: [] };
    expect(compareSignatures(clientSignature(base), serverSignature(base))).toEqual({
      needsResync: false,
      reasons: [],
    });
  });

  it('interest set equality is order-independent', () => {
    expect(
      compareSignatures(
        clientSignature({ interest: ['1,0', '0,0'] }),
        serverSignature({ interest: ['0,0', '1,0'] }),
      ),
    ).toEqual({ needsResync: false, reasons: [] });
  });

  it('entity set equality is order-independent', () => {
    expect(
      compareSignatures(
        clientSignature({ entities: [3, 1] }),
        serverSignature({ entities: [1, 3] }),
      ),
    ).toEqual({ needsResync: false, reasons: [] });
  });

  it('profile mismatch triggers resync', () => {
    expect(
      compareSignatures(clientSignature({ profile: 'alice' }), serverSignature({ profile: 'bob' })),
    ).toEqual({ needsResync: true, reasons: ['profile mismatch'] });
  });

  it('reconnect after clean disconnect requires resync (REQ-3)', () => {
    const server = new ReconnectStateManager();
    server.connect('alice');
    server.disconnect('alice');
    server.connect('alice'); // epoch 3 after a further disconnect+reconnect
    server.disconnect('alice');
    server.connect('alice');
    const current = server.currentEpoch('alice')!;
    expect(current).toBe(3);
    const clientSig = clientSignature({ epoch: 2 });
    const serverSig = serverSignature({ epoch: current });
    expect(compareSignatures(clientSig, serverSig)).toEqual({
      needsResync: true,
      reasons: ['epoch mismatch'],
    });
  });

  it('reconnect after keepalive drop requires resync (REQ-3)', () => {
    const server = new ReconnectStateManager();
    server.connect('alice'); // epoch 1
    server.disconnect('alice'); // keepalive drop
    server.connect('alice'); // epoch 2
    expect(
      compareSignatures(clientSignature({ epoch: 1 }), serverSignature({ epoch: 2 })),
    ).toEqual({ needsResync: true, reasons: ['epoch mismatch'] });
  });

  it('tick mismatch triggers resync', () => {
    expect(
      compareSignatures(clientSignature({ tick: 120 }), serverSignature({ tick: 121 })),
    ).toEqual({ needsResync: true, reasons: ['tick mismatch'] });
  });

  it('position mismatch triggers resync', () => {
    expect(
      compareSignatures(
        clientSignature({ position: { x: 10, y: 0, z: 10 } }),
        serverSignature({ position: { x: 11, y: 0, z: 10 } }),
      ),
    ).toEqual({ needsResync: true, reasons: ['position mismatch'] });
  });

  it('differing inventory stateId triggers resync (REQ-2)', () => {
    expect(
      compareSignatures(clientSignature({ inventoryStateId: 4 }), serverSignature({ inventoryStateId: 9 })),
    ).toEqual({ needsResync: true, reasons: ['inventory state mismatch'] });
  });

  it('differing interest set triggers resync (REQ-2)', () => {
    expect(
      compareSignatures(
        clientSignature({ interest: ['0,0'] }),
        serverSignature({ interest: ['0,0', '1,0'] }),
      ),
    ).toEqual({ needsResync: true, reasons: ['interest mismatch'] });
  });

  it('differing entity set triggers resync (REQ-2)', () => {
    expect(
      compareSignatures(
        clientSignature({ entities: [1, 2] }),
        serverSignature({ entities: [1, 2, 3] }),
      ),
    ).toEqual({ needsResync: true, reasons: ['entity set mismatch'] });
  });

  it('the first difference in the fixed check order wins', () => {
    expect(
      compareSignatures(
        clientSignature({ tick: 1, interest: ['0,0'] }),
        serverSignature({ tick: 2, interest: ['0,0', '1,0'] }),
      ),
    ).toEqual({ needsResync: true, reasons: ['tick mismatch'] });
  });

  it('invalid client signature throws without a verdict', () => {
    expect(() => compareSignatures(clientSignature({ profile: '' }), serverSignature())).toThrow(
      'Reconnect: client signature.profile must be a non-empty string',
    );
    expect(() => compareSignatures(clientSignature({ epoch: -1 }), serverSignature())).toThrow(
      'Reconnect: client signature.epoch must be a non-negative safe integer',
    );
  });

  it('invalid server signature throws without a verdict', () => {
    expect(() => compareSignatures(clientSignature(), serverSignature({ tick: -3 }))).toThrow(
      'Reconnect: server signature.tick must be a non-negative safe integer',
    );
    expect(() => compareSignatures(clientSignature(), serverSignature({ entities: [1, -2] }))).toThrow(
      'Reconnect: server signature.entities[1] must be a non-negative safe integer',
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 2.4 — collectFullState assembly determinism and validation
// ────────────────────────────────────────────────────────────────────────────

describe('collectFullState snapshot assembly (state-resynchronization REQ-4)', () => {
  it('valid input assembles a deterministic sorted snapshot (REQ-4)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    manager.connect('alice'); // epoch 2
    const snapshot = manager.collectFullState(
      'alice',
      makeInput({
        epoch: 2,
        tick: 120,
        position: { x: 10, y: 0, z: 10 },
        chunks: [makeChunk('1,0', 120), makeChunk('0,0', 120)],
        entities: [makeEntity(3), makeEntity(1)],
        inventory: makeInventory(7, {
          slots: [{ id: 5, count: 3, maxCount: 64 }, ...new Array<null>(35).fill(null)],
        }),
      }),
    );
    expect(snapshot.profile).toBe('alice');
    expect(snapshot.epoch).toBe(2);
    expect(snapshot.tick).toBe(120);
    expect(snapshot.position).toEqual({ x: 10, y: 0, z: 10 });
    expect(snapshot.chunkKeys).toEqual(['0,0', '1,0']);
    expect(snapshot.chunkSnapshots.map((c) => c.key)).toEqual(['0,0', '1,0']);
    expect(snapshot.entities.map((e) => e.id)).toEqual([1, 3]);
    expect(snapshot.inventory.stateId).toBe(7);
    expect(snapshot.inventory.slots[0]).toEqual({ id: 5, count: 3, maxCount: 64 });
    expect(snapshot.inventory.hotbar.length).toBe(9);
  });

  it('repeated calls with the same input produce identical snapshots (REQ-4)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    manager.connect('alice');
    const input = makeInput({
      epoch: 2,
      chunks: [makeChunk('1,0', 120), makeChunk('0,0', 120)],
      entities: [makeEntity(3), makeEntity(1)],
    });
    expect(manager.collectFullState('alice', input)).toEqual(
      manager.collectFullState('alice', input),
    );
  });

  it('empty chunk and entity inputs are allowed (REQ-4)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    const snapshot = manager.collectFullState(
      'alice',
      makeInput({ epoch: 1, chunks: [], entities: [] }),
    );
    expect(snapshot.chunkKeys).toEqual([]);
    expect(snapshot.chunkSnapshots).toEqual([]);
    expect(snapshot.entities).toEqual([]);
  });

  it('stale epoch is rejected (REQ-4)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    manager.connect('alice'); // epoch 2 current
    expect(() => manager.collectFullState('alice', makeInput({ epoch: 1 }))).toThrow(
      'Reconnect: epoch is not the current session',
    );
  });

  it('no active session rejects any epoch', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    manager.disconnect('alice');
    expect(() => manager.collectFullState('alice', makeInput({ epoch: 1 }))).toThrow(
      'Reconnect: epoch is not the current session',
    );
  });

  it('duplicate chunk key is rejected (REQ-4)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    expect(() =>
      manager.collectFullState(
        'alice',
        makeInput({ chunks: [makeChunk('0,0'), makeChunk('0,0')] }),
      ),
    ).toThrow('Reconnect: duplicate chunk key 0,0');
  });

  it('duplicate entity id is rejected', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    expect(() =>
      manager.collectFullState(
        'alice',
        makeInput({ entities: [makeEntity(1), makeEntity(1)] }),
      ),
    ).toThrow('Reconnect: duplicate entity id 1');
  });

  it('input profile mismatch is rejected', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    expect(() =>
      manager.collectFullState('alice', makeInput({ profile: 'bob' })),
    ).toThrow('Reconnect: input profile must match the requested profile');
  });

  it('invalid inventory window is rejected (REQ-4)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    // hotbar of length 8
    expect(() =>
      manager.collectFullState(
        'alice',
        makeInput({ inventory: makeInventory(0, { hotbar: new Array<null>(8).fill(null) }) }),
      ),
    ).toThrow('Reconnect: inventory.hotbar must have exactly 9 slots');
    // out-of-range slot stack (count > maxCount)
    expect(() =>
      manager.collectFullState(
        'alice',
        makeInput({
          inventory: makeInventory(0, {
            slots: [{ id: 1, count: 99, maxCount: 64 }, ...new Array<null>(35).fill(null)],
          }),
        }),
      ),
    ).toThrow('Reconnect: inventory.slots[0].count must be in [1, maxCount]');
    // negative stateId
    expect(() =>
      manager.collectFullState('alice', makeInput({ inventory: makeInventory(-1) })),
    ).toThrow('Reconnect: inventory.stateId must be a non-negative safe integer');
  });

  it('malformed chunk snapshot is rejected', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    const bad = { ...makeChunk('0,0'), key: '9,9' };
    expect(() =>
      manager.collectFullState('alice', makeInput({ chunks: [bad] })),
    ).toThrow('Reconnect: chunk snapshot key 9,9 does not match (0, 0)');
  });

  it('malformed entity descriptor is rejected', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    expect(() =>
      manager.collectFullState('alice', makeInput({ entities: [{ ...makeEntity(1), id: -1 }] })),
    ).toThrow('Reconnect: entity id must be a non-negative safe integer');
    expect(() =>
      manager.collectFullState('alice', makeInput({ entities: [{ ...makeEntity(1), type: ' ' }] })),
    ).toThrow('Reconnect: entity type must be a non-empty string');
  });

  it('malformed tick and position are rejected', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    expect(() => manager.collectFullState('alice', makeInput({ tick: -1 }))).toThrow(
      'Reconnect: tick must be a non-negative safe integer',
    );
    expect(() =>
      manager.collectFullState('alice', makeInput({ position: { x: NaN, y: 0, z: 0 } })),
    ).toThrow('Reconnect: position must be finite numbers');
  });

  it('the returned snapshot is a defensive copy (input immutability)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice');
    const input = makeInput({ epoch: 1, position: { x: 10, y: 0, z: 10 } });
    const snapshot = manager.collectFullState('alice', input);
    (input.position as { x: number }).x = 999;
    (input.chunks as unknown[]).push(makeChunk('2,0'));
    (input.inventory as { stateId: number }).stateId = 999;
    expect(snapshot.position).toEqual({ x: 10, y: 0, z: 10 });
    expect(snapshot.chunkKeys).toEqual(['0,0']);
    expect(snapshot.inventory.stateId).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 2.6 — client signature recording and input validation
// ────────────────────────────────────────────────────────────────────────────

describe('ReconnectStateClient signature recording and validation (state-resynchronization REQ-1)', () => {
  it('connect records the handshake epoch, resets the summary, and marks resync pending', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    expect(client.resyncPending).toBe(true);
    expect(client.signature()).toEqual({
      profile: 'alice',
      epoch: 2,
      tick: 0,
      position: { x: 0, y: 0, z: 0 },
      inventoryStateId: 0,
      interest: [],
      entities: [],
    });
  });

  it('recorded state is reflected in the signature (REQ-1)', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    client.recordTick(120);
    client.recordPosition({ x: 10, y: 0, z: 10 });
    client.recordInventoryStateId(7);
    client.setInterest(['0,0', '1,0']);
    client.setEntities([3, 1]);
    expect(client.signature()).toEqual({
      profile: 'alice',
      epoch: 2,
      tick: 120,
      position: { x: 10, y: 0, z: 10 },
      inventoryStateId: 7,
      interest: ['0,0', '1,0'],
      entities: [1, 3],
    });
  });

  it('interest and entity sets are emitted sorted and de-duplicated (REQ-1)', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    client.setInterest(['1,0', '0,0', '1,0']);
    client.setEntities([3, 1, 3, 2]);
    expect(client.signature().interest).toEqual(['0,0', '1,0']);
    expect(client.signature().entities).toEqual([1, 2, 3]);
  });

  it('invalid tick throws and leaves the summary unchanged', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    client.recordTick(120);
    expect(() => client.recordTick(-1)).toThrow('Reconnect: tick must be a non-negative safe integer');
    expect(client.signature().tick).toBe(120);
  });

  it('invalid position throws and leaves the summary unchanged', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    client.recordPosition({ x: 10, y: 0, z: 10 });
    expect(() => client.recordPosition({ x: NaN, y: 0, z: 0 })).toThrow(
      'Reconnect: position must be finite numbers',
    );
    expect(client.signature().position).toEqual({ x: 10, y: 0, z: 10 });
  });

  it('invalid inventoryStateId throws and leaves the summary unchanged', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    client.recordInventoryStateId(7);
    expect(() => client.recordInventoryStateId(-3)).toThrow(
      'Reconnect: inventoryStateId must be a non-negative safe integer',
    );
    expect(client.signature().inventoryStateId).toBe(7);
  });

  it('non-integer entity ids throw and leave the summary unchanged', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    client.setEntities([1, 3]);
    expect(() => client.setEntities([1, 2.5])).toThrow(
      'Reconnect: entity id must be a non-negative safe integer',
    );
    expect(() => client.setEntities([1, -2])).toThrow(
      'Reconnect: entity id must be a non-negative safe integer',
    );
    expect(client.signature().entities).toEqual([1, 3]);
  });

  it('non-string chunk keys throw and leave the summary unchanged', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    client.setInterest(['0,0']);
    expect(() => client.setInterest(['0,0', ''])).toThrow(
      'Reconnect: chunk key must be a non-empty string',
    );
    expect(client.signature().interest).toEqual(['0,0']);
  });

  it('record methods throw before connect', () => {
    const client = new ReconnectStateClient();
    expect(() => client.recordTick(1)).toThrow('Reconnect: client is not connected');
    expect(() => client.recordPosition({ x: 1, y: 0, z: 0 })).toThrow(
      'Reconnect: client is not connected',
    );
    expect(() => client.recordInventoryStateId(1)).toThrow('Reconnect: client is not connected');
    expect(() => client.setInterest(['0,0'])).toThrow('Reconnect: client is not connected');
    expect(() => client.setEntities([1])).toThrow('Reconnect: client is not connected');
    expect(() => client.signature()).toThrow('Reconnect: client is not connected');
  });

  it('connect validates profile and epoch', () => {
    const client = new ReconnectStateClient();
    expect(() => client.connect('', 1)).toThrow('Reconnect: profile must be a non-empty string');
    expect(() => client.connect('alice', -1)).toThrow(
      'Reconnect: epoch must be a non-negative safe integer',
    );
  });

  it('disconnect ends the session and double disconnect throws', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    client.disconnect();
    expect(() => client.disconnect()).toThrow('Reconnect: client has no active session');
  });

  it('reconnect resets the summary and re-marks resync pending', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 1);
    client.recordTick(50);
    client.recordPosition({ x: 5, y: 0, z: 5 });
    client.setEntities([1, 2, 3]);
    client.applyFullState(
      makeSnapshot({ epoch: 1, tick: 50, position: { x: 5, y: 0, z: 5 }, chunkKeys: ['0,0'], chunkSnapshots: [makeChunk('0,0', 50)] }),
    );
    expect(client.resyncPending).toBe(false);
    client.connect('alice', 2); // reconnect: fresh summary, resync pending
    expect(client.resyncPending).toBe(true);
    expect(client.signature().tick).toBe(0);
    expect(client.signature().entities).toEqual([]);
  });

  it('reset restores the pristine state and a fresh connect works', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 1);
    client.recordTick(50);
    client.reset();
    expect(() => client.signature()).toThrow('Reconnect: client is not connected');
    client.connect('alice', 3);
    expect(client.resyncPending).toBe(true);
  });

  it('signature returns a defensive copy', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    client.setEntities([1, 3]);
    const sig = client.signature() as unknown as { entities: number[]; position: { x: number } };
    sig.entities.push(9);
    sig.position.x = 999;
    expect(client.signature().entities).toEqual([1, 3]);
    expect(client.signature().position.x).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 2.5 — applyFullState snapshot application
// ────────────────────────────────────────────────────────────────────────────

describe('applyFullState snapshot application (state-resynchronization REQ-5)', () => {
  it('applying a full snapshot replaces state and returns the full directive (REQ-5)', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    client.recordTick(5); // stale residue from before the snapshot
    expect(client.resyncPending).toBe(true);
    const snapshot = makeSnapshot();
    const directive = client.applyFullState(snapshot);
    expect(directive.actions).toEqual([
      { kind: 'reset_movement', position: { x: 10, y: 0, z: 10 }, tick: 120 },
      {
        kind: 'reset_inventory',
        stateId: 7,
        slots: snapshot.inventory.slots,
        hotbar: snapshot.inventory.hotbar,
        cursorItem: null,
      },
      { kind: 'clear_block_predictions' },
      { kind: 'reset_chunks', keys: ['0,0', '1,0'] },
      { kind: 'reset_entities', entityIds: [1, 3] },
    ]);
    expect(client.resyncPending).toBe(false);
    expect(client.pendingActions).toBe(5);
    expect(client.signature()).toEqual({
      profile: 'alice',
      epoch: 2,
      tick: 120,
      position: { x: 10, y: 0, z: 10 },
      inventoryStateId: 7,
      interest: ['0,0', '1,0'],
      entities: [1, 3],
    });
  });

  it('duplicate application is idempotent (REQ-5)', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    const snapshot = makeSnapshot();
    const first = client.applyFullState(snapshot);
    const before = client.signature();
    const second = client.applyFullState(snapshot);
    expect(second).toEqual(first);
    expect(client.signature()).toEqual(before);
    expect(client.pendingActions).toBe(5);
  });

  it('stale-epoch snapshot is rejected and the summary is unchanged (REQ-5)', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    client.recordTick(50);
    expect(() => client.applyFullState(makeSnapshot({ epoch: 1 }))).toThrow(
      'Reconnect: snapshot epoch is not the current session',
    );
    expect(client.signature().tick).toBe(50);
    expect(client.resyncPending).toBe(true);
  });

  it('snapshot with a mismatched profile is rejected', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    expect(() => client.applyFullState(makeSnapshot({ profile: 'bob' }))).toThrow(
      'Reconnect: snapshot profile must match the current session',
    );
  });

  it('snapshot with an invalid inventory window is rejected', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    expect(() =>
      client.applyFullState(makeSnapshot({ inventory: makeInventory(7, { hotbar: new Array<null>(8).fill(null) }) })),
    ).toThrow('Reconnect: inventory.hotbar must have exactly 9 slots');
  });

  it('snapshot with unsorted chunkKeys is rejected', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    expect(() =>
      client.applyFullState(makeSnapshot({ chunkKeys: ['1,0', '0,0'] })),
    ).toThrow('Reconnect: snapshot chunkKeys must be sorted and unique');
  });

  it('snapshot with chunkKeys not matching chunkSnapshots is rejected', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    expect(() =>
      client.applyFullState(makeSnapshot({ chunkKeys: ['0,0', '2,0'] })),
    ).toThrow('Reconnect: snapshot chunk key 2,0 has no matching snapshot');
    expect(() =>
      client.applyFullState(makeSnapshot({ chunkKeys: ['0,0'] })),
    ).toThrow('Reconnect: snapshot chunkKeys must match chunkSnapshots');
  });

  it('snapshot with unsorted or duplicate entity ids is rejected', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    expect(() =>
      client.applyFullState(makeSnapshot({ entities: [makeEntity(3), makeEntity(1)] })),
    ).toThrow('Reconnect: snapshot entity ids must be sorted and unique');
    expect(() =>
      client.applyFullState(makeSnapshot({ entities: [makeEntity(1), makeEntity(1)] })),
    ).toThrow('Reconnect: snapshot entity ids must be sorted and unique');
  });

  it('applyFullState throws before connect', () => {
    const client = new ReconnectStateClient();
    expect(() => client.applyFullState(makeSnapshot())).toThrow('Reconnect: client is not connected');
  });

  it('empty chunk/entity sets produce empty reset actions', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    const directive = client.applyFullState(
      makeSnapshot({ chunkKeys: [], chunkSnapshots: [], entities: [] }),
    );
    expect(directive.actions[3]).toEqual({ kind: 'reset_chunks', keys: [] });
    expect(directive.actions[4]).toEqual({ kind: 'reset_entities', entityIds: [] });
    expect(client.signature().interest).toEqual([]);
    expect(client.signature().entities).toEqual([]);
  });

  it('lastDirective returns a defensive copy and is stable across reads', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 2);
    expect(client.lastDirective).toBeNull();
    client.applyFullState(makeSnapshot());
    const read = client.lastDirective!;
    (read.actions[3] as unknown as { keys: string[] }).keys.push('9,9');
    (read.actions[4] as unknown as { entityIds: number[] }).entityIds.push(9);
    expect(client.lastDirective!.actions[3]).toEqual({ kind: 'reset_chunks', keys: ['0,0', '1,0'] });
    expect(client.lastDirective!.actions[4]).toEqual({ kind: 'reset_entities', entityIds: [1, 3] });
    expect(client.signature().interest).toEqual(['0,0', '1,0']);
  });

  it('pending predictions are cleared by application (REQ-5)', () => {
    const client = new ReconnectStateClient();
    client.connect('alice', 1);
    client.connect('alice', 2); // reconnect with prior-session residue
    const directive = client.applyFullState(makeSnapshot());
    expect(client.resyncPending).toBe(false);
    const kinds = directive.actions.map((a) => a.kind);
    expect(kinds).toContain('clear_block_predictions');
    expect(kinds).toContain('reset_inventory');
    expect(kinds).toContain('reset_movement');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Task 3.1 — integration: directive reseeds the 226/227/228/229/230/231 components
// ────────────────────────────────────────────────────────────────────────────

describe('Integration: ClientResyncDirective reseeds the concrete components (3.1)', () => {
  it('reconnect flow: stale epoch forces a full resync that reseeds every component', () => {
    const server = new ReconnectStateManager();
    server.connect('alice'); // epoch 1
    const client = new ReconnectStateClient();
    client.connect('alice', 1);
    client.recordTick(50);
    client.recordPosition({ x: 5, y: 0, z: 5 });
    client.setEntities([1, 2, 3]);
    const staleSignature = client.signature();

    // Keepalive drop: server ends the session; the client reconnects into epoch 2.
    server.disconnect('alice');
    const second = server.connect('alice');
    expect(second).toEqual({ epoch: 2, isReconnect: true });

    const authoritative: ServerStateSignature = {
      profile: 'alice',
      epoch: 2,
      tick: 100,
      position: { x: 8, y: 0, z: 8 },
      inventoryStateId: 3,
      interest: ['0,0', '1,0'],
      entities: [1, 3],
    };

    // The stale (epoch 1) signature diverges: resync is mandatory.
    const verdict = compareSignatures(staleSignature, authoritative);
    expect(verdict).toEqual({ needsResync: true, reasons: ['epoch mismatch'] });

    // Server assembles the authoritative snapshot for the current session.
    const snapshot = server.collectFullState(
      'alice',
      makeInput({
        epoch: 2,
        tick: 100,
        position: { x: 8, y: 0, z: 8 },
        chunks: [makeChunk('1,0', 100), makeChunk('0,0', 100)],
        entities: [makeEntity(3), makeEntity(1)],
        inventory: makeInventory(3, {
          slots: [{ id: 5, count: 3, maxCount: 64 }, ...new Array<null>(35).fill(null)],
        }),
      }),
    );

    // Client reconnects with the new epoch and applies the snapshot.
    client.connect('alice', 2);
    expect(client.resyncPending).toBe(true);
    const directive = client.applyFullState(snapshot);
    expect(client.resyncPending).toBe(false);
    expect(directive.actions.map((a) => a.kind)).toEqual([
      'reset_movement',
      'reset_inventory',
      'clear_block_predictions',
      'reset_chunks',
      'reset_entities',
    ]);

    // The caller executes the directive against the concrete components.
    const authority = new MovementAuthority({ maxSpeedPerTick: 4 });
    const reconciler = new MovementReconciler();
    const validator = new InventoryTransactionValidator({ slots: emptySlots36(), hotbar: emptyHotbar() });
    const clientInventory = new ClientInventoryReconciler();
    const blockReconciler = new ClientBlockReconciler();
    const chunks = new ChunkStreamManager({ viewDistance: 1 });
    const entities = new ClientEntityStore();

    // Prior-session residue in every component.
    reconciler.predict({ x: 1, y: 0, z: 0 }, 5);
    clientInventory.predict([{ slotId: 0, stack: { id: 1, count: 1, maxCount: 64 } }]);
    blockReconciler.predict({ x: 1, y: 2, z: 3 }, 10, 9, 5);
    chunks.setCenter(0, 0);
    entities.applyBatch({
      tick: 5,
      spawned: [{ id: 99, type: 'cow', position: { x: 0, y: 0, z: 0 } }],
      despawned: [],
      transforms: [],
      trackedData: [],
    });

    for (const action of directive.actions) {
      switch (action.kind) {
        case 'reset_movement':
          authority.spawn(action.position, action.tick);
          reconciler.reconcile(action.position, action.tick);
          break;
        case 'reset_inventory':
          validator.reset(action.slots, action.hotbar, action.cursorItem, action.stateId);
          clientInventory.reset();
          break;
        case 'clear_block_predictions':
          blockReconciler.reset();
          break;
        case 'reset_chunks':
          chunks.reset();
          for (const key of action.keys) {
            const snap = snapshot.chunkSnapshots.find((s) => s.key === key);
            expect(snap).toBeDefined();
            chunks.putSnapshot(snap!);
          }
          break;
        case 'reset_entities':
          entities.reset();
          entities.applyBatch({
            tick: snapshot.tick,
            spawned: snapshot.entities,
            despawned: [],
            transforms: [],
            trackedData: [],
          });
          break;
      }
    }

    // Movement: authoritative position and tick restored; predictions cleared.
    expect(authority.position).toEqual(snapshot.position);
    expect(authority.lastTick).toBe(snapshot.tick);
    expect(reconciler.predicted).toEqual(snapshot.position);
    expect(reconciler.confirmedTick).toBe(snapshot.tick);
    expect(reconciler.pendingCount).toBe(0);

    // Inventory: authoritative window restored; client predictions cleared.
    expect(validator.currentStateId).toBe(snapshot.inventory.stateId);
    expect(validator.currentSlots).toEqual(snapshot.inventory.slots);
    expect(validator.currentHotbar).toEqual(snapshot.inventory.hotbar);
    expect(validator.currentCursorItem).toEqual(snapshot.inventory.cursorItem);
    expect(clientInventory.hasPending).toBe(false);

    // Block predictions cleared.
    expect(blockReconciler.pendingCount).toBe(0);

    // Chunks: store rebuilt from the snapshot's sorted keys.
    for (const key of snapshot.chunkKeys) {
      expect(chunks.hasSnapshot(key)).toBe(true);
      expect(chunks.getSnapshot(key)).toEqual(snapshot.chunkSnapshots.find((s) => s.key === key));
    }

    // Entities: replica store rebuilt from the snapshot's descriptors.
    expect(entities.getAll().map((e) => e.id)).toEqual(snapshot.entities.map((d) => d.id));
    expect(entities.getAll().map((e) => e.type)).toEqual(snapshot.entities.map((d) => d.type));
    expect(entities.hasEntity(99)).toBe(false); // prior-session residue is gone
  });

  it('mid-transaction disconnect drops the stale message end-to-end (REQ-5)', () => {
    const manager = new ReconnectStateManager();
    manager.connect('alice'); // epoch 1
    const validator = new InventoryTransactionValidator({
      slots: emptySlots36(),
      hotbar: emptyHotbar(),
      initialStateId: 0,
    });
    const start: TransactionResult = validator.processTransaction({
      type: 'drag',
      windowId: 0,
      stateId: 0,
      phase: 'start',
      button: 'left',
      slotId: 0,
    });
    expect(start.accepted).toBe(true);
    const stateIdAfterStart = validator.currentStateId;

    // Disconnect while the drag is still active, then reconnect.
    manager.disconnect('alice');
    const second = manager.connect('alice');
    expect(second.epoch).toBe(2);

    // A late drag-end tagged with the old epoch is rejected at the session gate.
    const lateEnd: TransactionResult | null = gate(manager, 'alice', 1, () =>
      validator.processTransaction({
        type: 'drag',
        windowId: 0,
        stateId: 0,
        phase: 'end',
        button: 'left',
        slotId: 0,
      }),
    );
    expect(lateEnd).toBeNull();
    expect(validator.currentStateId).toBe(stateIdAfterStart);
    expect(manager.isSessionCurrent('alice', 1)).toBe(false);
  });
});

// Column keys produced by the 226 convention are what signatures and snapshots carry.
describe('columnKey interop (226 keying convention)', () => {
  it('snapshot keys use the 226 columnKey format', () => {
    expect(columnKey(0, 0)).toBe('0,0');
    const snapshot = makeSnapshot();
    expect(snapshot.chunkKeys[0]).toBe(columnKey(0, 0));
  });
});
