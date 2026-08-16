import { describe, it, expect } from 'vitest';
import {
  AdversarialMessageGuard,
  MessageRateLimiter,
  MessageSequenceGuard,
  boundedArray,
  boundedCollection,
  boundedString,
  type InspectResult,
  type RateLimit,
} from '../../src/simulation/NetworkAdversarialGuard';
import {
  createNetworkProtocol,
  type NetworkProtocol,
  type ProtocolMessage,
  type WireEnvelope,
} from '../../src/simulation/NetworkProtocol';
import { MovementAuthority } from '../../src/simulation/MovementAuthority';
import { InventoryTransactionValidator } from '../../src/simulation/InventoryTransactionNetworking';
import { CombatValidator } from '../../src/simulation/CombatNetworking';

const MOVE: ProtocolMessage = {
  id: 1,
  name: 'move',
  fields: [
    { name: 'x', type: 'int' },
    { name: 'y', type: 'float' },
    { name: 'name', type: 'string' },
  ],
};
const JUMP: ProtocolMessage = {
  id: 2,
  name: 'jump',
  fields: [{ name: 'active', type: 'bool' }],
};

const protocol = (): NetworkProtocol => createNetworkProtocol(1, [MOVE, JUMP]);

/** A valid `move` envelope. */
const moveEnvelope = (over: Partial<WireEnvelope> = {}): WireEnvelope => ({
  messageId: 1,
  values: [1, 2.5, 'alex'],
  ...over,
});

describe('MessageSequenceGuard', () => {
  it('accepts a monotonic advance', () => {
    const g = new MessageSequenceGuard();
    expect(g.track(10)).toBe('accept');
    expect(g.lastAccepted).toBe(10);
    expect(g.track(11)).toBe('accept');
    expect(g.lastAccepted).toBe(11);
  });

  it('rejects a replayed (equal) sequence as duplicate without advancing', () => {
    const g = new MessageSequenceGuard();
    g.track(10);
    expect(g.track(10)).toBe('duplicate');
    expect(g.lastAccepted).toBe(10);
  });

  it('rejects a lower (out-of-order) sequence without advancing', () => {
    const g = new MessageSequenceGuard();
    g.track(10);
    expect(g.track(7)).toBe('out_of_order');
    expect(g.lastAccepted).toBe(10);
  });

  it('reset starts a fresh sequence epoch after reconnect', () => {
    const g = new MessageSequenceGuard();
    g.track(10);
    g.reset();
    expect(g.lastAccepted).toBe(0);
    expect(g.track(3)).toBe('accept');
    expect(g.lastAccepted).toBe(3);
  });

  it('throws NetworkAdversarial on a non-safe-int sequence', () => {
    const g = new MessageSequenceGuard();
    for (const bad of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => g.track(bad)).toThrow('NetworkAdversarial: sequence must be a non-negative safe integer');
    }
    expect(g.lastAccepted).toBe(0);
  });
});

describe('MessageRateLimiter', () => {
  const LIMIT: RateLimit = { maxPerWindow: 5, windowTicks: 20 };

  it('accepts a burst below the window limit', () => {
    const r = new MessageRateLimiter({}, LIMIT);
    for (let t = 100; t <= 104; t++) {
      expect(r.submit('melee_attack', t)).toBe(true);
    }
    expect(r.count('melee_attack')).toBe(5);
  });

  it('rate-limits an overflow without counting the rejections', () => {
    const r = new MessageRateLimiter({}, LIMIT);
    for (let t = 100; t <= 104; t++) r.submit('melee_attack', t);
    expect(r.submit('melee_attack', 105)).toBe(false);
    expect(r.submit('melee_attack', 106)).toBe(false);
    expect(r.count('melee_attack')).toBe(5);
  });

  it('slides the window with tick and re-opens', () => {
    const r = new MessageRateLimiter({}, LIMIT);
    for (let t = 100; t <= 104; t++) r.submit('melee_attack', t);
    expect(r.submit('melee_attack', 105)).toBe(false);
    // Beyond 100 + 20 the window has slid and re-opened.
    expect(r.submit('melee_attack', 124)).toBe(true);
  });

  it('applies per-kind overrides above the default', () => {
    const r = new MessageRateLimiter({ chat: { maxPerWindow: 2, windowTicks: 20 } }, LIMIT);
    expect(r.submit('chat', 100)).toBe(true);
    expect(r.submit('chat', 101)).toBe(true);
    expect(r.submit('chat', 102)).toBe(false);
    // Unconfigured kinds fall back to the default limit.
    expect(r.submit('melee_attack', 100)).toBe(true);
  });

  it('accepts exactly at the window boundary', () => {
    const r = new MessageRateLimiter({}, LIMIT);
    for (let t = 100; t <= 104; t++) expect(r.submit('k', t)).toBe(true);
    expect(r.submit('k', 105)).toBe(false);
  });

  it('throws on a non-string kind or a non-safe-int tick', () => {
    const r = new MessageRateLimiter({}, LIMIT);
    expect(() => r.submit('', 1)).toThrow('NetworkAdversarial: kind must be a non-empty string');
    expect(() => r.submit(5 as never, 1)).toThrow('NetworkAdversarial: kind must be a non-empty string');
    expect(() => r.submit('k', -1)).toThrow('NetworkAdversarial: tick must be a non-negative safe integer');
    expect(() => r.submit('k', 1.5)).toThrow('NetworkAdversarial: tick must be a non-negative safe integer');
    expect(r.count('k')).toBe(0);
  });

  it('reset clears all counters', () => {
    const r = new MessageRateLimiter({}, LIMIT);
    for (let t = 100; t <= 104; t++) r.submit('k', t);
    r.reset();
    expect(r.count('k')).toBe(0);
    expect(r.submit('k', 105)).toBe(true);
  });
});

describe('bounded-domain helpers', () => {
  it('boundedString rejects over-long strings at the boundary', () => {
    expect(boundedString('1234567890123456', 16)).toBe(true);
    expect(boundedString('12345678901234567', 16)).toBe(false);
  });

  it('boundedArray and boundedCollection enforce their caps', () => {
    expect(boundedArray([1, 2, 3, 4], 4)).toBe(true);
    expect(boundedArray([1, 2, 3, 4, 5], 4)).toBe(false);
    expect(boundedCollection([1, 2, 3], 3)).toBe(true);
    expect(boundedCollection([1, 2, 3], 2)).toBe(false);
  });
});

describe('AdversarialMessageGuard.inspectIncoming', () => {
  it('rejects an unknown message id', () => {
    const g = new AdversarialMessageGuard();
    expect(g.inspectIncoming(protocol(), { messageId: 99, values: [] }, 100)).toEqual({
      dispatch: false,
      reason: 'unknown_message_id',
    });
  });

  it('rejects wrong arity as malformed', () => {
    const g = new AdversarialMessageGuard();
    expect(g.inspectIncoming(protocol(), { messageId: 1, values: [] }, 100)).toEqual({
      dispatch: false,
      reason: 'malformed_fields',
    });
    expect(g.inspectIncoming(protocol(), { messageId: 1, values: [1, 2] }, 100)).toEqual({
      dispatch: false,
      reason: 'malformed_fields',
    });
    expect(g.inspectIncoming(protocol(), { messageId: 1, values: [1, 2.5, 'a', true] }, 100)).toEqual({
      dispatch: false,
      reason: 'malformed_fields',
    });
  });

  it('rejects type-unsafe values as malformed', () => {
    const g = new AdversarialMessageGuard();
    expect(g.inspectIncoming(protocol(), { messageId: 1, values: [1.5, 2.5, 'a'] }, 100)).toEqual({
      dispatch: false,
      reason: 'malformed_fields',
    });
    expect(g.inspectIncoming(protocol(), { messageId: 1, values: [1, Number.NaN, 'a'] }, 100)).toEqual({
      dispatch: false,
      reason: 'malformed_fields',
    });
    expect(g.inspectIncoming(protocol(), { messageId: 1, values: [1, 2.5, 5] }, 100)).toEqual({
      dispatch: false,
      reason: 'malformed_fields',
    });
    expect(g.inspectIncoming(protocol(), { messageId: 2, values: ['yes'] }, 100)).toEqual({
      dispatch: false,
      reason: 'malformed_fields',
    });
  });

  it('rejects an over-long string field as oversized', () => {
    const g = new AdversarialMessageGuard({ maxStringLength: 16 });
    expect(
      g.inspectIncoming(protocol(), { messageId: 1, values: [1, 2.5, 'a'.repeat(17)] }, 100),
    ).toEqual({ dispatch: false, reason: 'oversized_field' });
  });

  it('accepts a string exactly at the maxStringLength boundary', () => {
    const g = new AdversarialMessageGuard({ maxStringLength: 4 });
    expect(g.inspectIncoming(protocol(), { messageId: 1, values: [1, 2.5, 'abcd'] }, 100)).toMatchObject({
      dispatch: true,
    });
  });

  it('rejects a replayed sequence as duplicate_message', () => {
    const g = new AdversarialMessageGuard();
    g.sequence.track(10);
    expect(g.inspectIncoming(protocol(), moveEnvelope(), 100, 10)).toEqual({
      dispatch: false,
      reason: 'duplicate_message',
    });
  });

  it('rejects an out-of-order sequence', () => {
    const g = new AdversarialMessageGuard();
    g.sequence.track(10);
    expect(g.inspectIncoming(protocol(), moveEnvelope(), 100, 7)).toEqual({
      dispatch: false,
      reason: 'out_of_order',
    });
  });

  it('rejects a rate-limited message at the guard', () => {
    const g = new AdversarialMessageGuard({
      limits: { move: { maxPerWindow: 1, windowTicks: 20 } },
    });
    expect(g.inspectIncoming(protocol(), moveEnvelope(), 100, 1)).toMatchObject({ dispatch: true });
    expect(g.inspectIncoming(protocol(), moveEnvelope(), 101, 2)).toEqual({
      dispatch: false,
      reason: 'rate_limited',
    });
  });

  it('dispatches a valid envelope with the decoded record', () => {
    const g = new AdversarialMessageGuard();
    const result = g.inspectIncoming(protocol(), moveEnvelope(), 100, 1);
    expect(result).toEqual({
      dispatch: true,
      name: 'move',
      values: { x: 1, y: 2.5, name: 'alex' },
    });
  });

  it('performs no sequence check when sequence is undefined', () => {
    const g = new AdversarialMessageGuard();
    expect(g.inspectIncoming(protocol(), moveEnvelope(), 100)).toMatchObject({ dispatch: true });
    expect(g.inspectIncoming(protocol(), moveEnvelope(), 101)).toMatchObject({ dispatch: true });
  });

  it('throws on a malformed tick', () => {
    const g = new AdversarialMessageGuard();
    expect(() => g.inspectIncoming(protocol(), moveEnvelope(), -1)).toThrow(
      'NetworkAdversarial: tick must be a non-negative safe integer',
    );
  });

  it('reset restores the sequence and rate state', () => {
    const g = new AdversarialMessageGuard({
      limits: { move: { maxPerWindow: 1, windowTicks: 20 } },
    });
    g.inspectIncoming(protocol(), moveEnvelope(), 100, 10);
    expect(g.inspectIncoming(protocol(), moveEnvelope(), 101, 10)).toEqual({
      dispatch: false,
      reason: 'duplicate_message',
    });
    g.reset();
    expect(g.sequence.lastAccepted).toBe(0);
    expect(g.inspectIncoming(protocol(), moveEnvelope(), 102, 1)).toMatchObject({ dispatch: true });
  });

  it('rejects invalid constructor options', () => {
    expect(() => new AdversarialMessageGuard({ maxStringLength: 0 })).toThrow(
      'NetworkAdversarial: maxStringLength must be a positive integer',
    );
    expect(() => new AdversarialMessageGuard({ defaultLimit: { maxPerWindow: 0, windowTicks: 1 } })).toThrow(
      'NetworkAdversarial: defaultLimit.maxPerWindow must be a positive integer',
    );
  });
});

describe('determinism under adversarial schedules (REQ-R6)', () => {
  const run = (): { results: InspectResult[]; lastAccepted: number } => {
    const g = new AdversarialMessageGuard({
      limits: { move: { maxPerWindow: 2, windowTicks: 20 } },
    });
    const results: InspectResult[] = [];
    results.push(g.inspectIncoming(protocol(), { messageId: 99, values: [] }, 100, 1));
    results.push(g.inspectIncoming(protocol(), { messageId: 1, values: [1.5, 2.5, 'a'] }, 101, 2));
    results.push(g.inspectIncoming(protocol(), moveEnvelope(), 102, 3));
    results.push(g.inspectIncoming(protocol(), moveEnvelope(), 103, 3));
    results.push(g.inspectIncoming(protocol(), moveEnvelope(), 104, 2));
    results.push(g.inspectIncoming(protocol(), moveEnvelope(), 105, 4));
    results.push(g.inspectIncoming(protocol(), moveEnvelope(), 106, 5));
    results.push(g.inspectIncoming(protocol(), moveEnvelope(), 200, 6));
    return { results, lastAccepted: g.sequence.lastAccepted };
  };

  it('identical schedules produce identical traces and state', () => {
    const a = run();
    const b = run();
    expect(b.results).toEqual(a.results);
    expect(b.lastAccepted).toEqual(a.lastAccepted);
    // The window re-opened so the last message dispatches exactly once.
    expect(a.results[a.results.length - 1]).toMatchObject({ dispatch: true });
  });
});

describe('adversarial burst integrity across handlers (REQ-R5)', () => {
  const runBurst = () => {
    // A scripted burst: malformed + replayed + out-of-order + rate abuse around single
    // accepted operations on movement, inventory, and combat.
    const movement = new MovementAuthority({ maxSpeedPerTick: 1 });
    movement.spawn({ x: 0, y: 0, z: 0 }, 100);
    const inv = new InventoryTransactionValidator({ slots: [null, null, null] });
    const combat = new CombatValidator({ maxProjectiles: 1 });

    const results: unknown[] = [];

    // Movement: one accepted intent (tick 110), then replays/out-of-order rejected.
    results.push(movement.submitIntent({ x: 0.5, y: 0, z: 0 }, 110));
    results.push(movement.submitIntent({ x: 1, y: 0, z: 0 }, 110));
    results.push(movement.submitIntent({ x: 1, y: 0, z: 0 }, 109));

    // Inventory: one accepted click (stateId 0), then a replayed stateId rejected.
    results.push(inv.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'left' }));
    results.push(inv.processTransaction({ type: 'slot_click', windowId: 0, stateId: 0, slotId: 0, button: 'left' }));

    // Combat: one accepted fire fills the cap, a second fire is capped; a malformed seam throws.
    const fire = combat.submitProjectileFire(
      { playerId: 1, requestId: 1, tick: 400, origin: { x: 0, y: 1.6, z: 0 }, direction: { x: 0, y: 0, z: 1 }, chargeTicks: 20 },
      { x: 0, y: 0, z: 0 },
      { getArrowCount: () => 3, consumeArrow: () => undefined },
      () => undefined,
    );
    results.push(fire);
    results.push(combat.submitProjectileFire(
      { playerId: 1, requestId: 2, tick: 410, origin: { x: 0, y: 1.6, z: 0 }, direction: { x: 0, y: 0, z: 1 }, chargeTicks: 10 },
      { x: 0, y: 0, z: 0 },
      { getArrowCount: () => 3, consumeArrow: () => undefined },
      () => undefined,
    ));

    return {
      results,
      movementPos: movement.position,
      movementTick: movement.lastTick,
      invState: inv.currentStateId,
      invSlots: inv.currentSlots,
      projectileCount: combat.projectileCount,
    };
  };

  it('a burst leaves every handler within bounds and reflecting only accepted operations', () => {
    const b = runBurst();
    // Movement: only the tick-110 intent was accepted; replays changed nothing.
    expect(b.movementPos).toEqual({ x: 0.5, y: 0, z: 0 });
    expect(b.movementTick).toBe(110);
    // Inventory: exactly one accepted click (a no-op on an empty slot) -> stateId 1; the
    // replayed one was rejected and did not advance state.
    expect(b.invState).toBe(1);
    expect(b.invSlots[0]).toBeNull();
    // Combat: exactly one projectile under the cap; the second fire was capped.
    expect(b.projectileCount).toBe(1);
    expect(b.results[5]).toMatchObject({ accepted: true, kind: 'projectile_fire' });
    expect(b.results[6]).toMatchObject({ accepted: false, kind: 'projectile_fire', reason: 'max_projectiles' });
  });

  it('repeated bursts are identical and deterministic', () => {
    expect(runBurst()).toEqual(runBurst());
  });
});
