import { describe, it, expect } from 'vitest';
import {
  MovementAuthority,
  type MovementResult,
  type MovementRejectionReason,
  type Position,
} from '../../src/simulation/MovementAuthority';

const P = (x: number, y: number, z: number): Position => ({ x, y, z });

function isCorrection(
  r: MovementResult,
): r is { accepted: false; correction: Position; reason: MovementRejectionReason } {
  return !r.accepted;
}

describe('MovementAuthority', () => {
  describe('construction', () => {
    it('constructs pristine: origin, lastTick 0, zero count, no rejection', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      expect(a.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(a.lastTick).toBe(0);
      expect(a.acceptedCount).toBe(0);
      expect(a.lastRejection).toBeNull();
    });

    it('rejects non-positive or non-finite max speed', () => {
      for (const bad of [0, -2, Number.POSITIVE_INFINITY]) {
        expect(() => new MovementAuthority({ maxSpeedPerTick: bad })).toThrow(
          'MovementAuthority: maxSpeedPerTick must be a positive finite number',
        );
      }
      expect(() => new MovementAuthority({ maxSpeedPerTick: 1.5 })).not.toThrow();
    });
  });

  describe('spawn', () => {
    it('sets the authoritative state', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      a.spawn(P(10, 64, 20), 5);
      expect(a.position).toEqual(P(10, 64, 20));
      expect(a.lastTick).toBe(5);
      expect(a.acceptedCount).toBe(0);
      expect(a.lastRejection).toBeNull();
    });

    it('rejects malformed spawn without changing state', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      expect(() => a.spawn(P(Number.NaN, 0, 0), 5)).toThrow(
        'MovementAuthority: spawn position must be finite numbers',
      );
      expect(() => a.spawn(P(0, 0, 0), -1)).toThrow(
        'MovementAuthority: spawn tick must be a non-negative safe integer',
      );
      expect(() => a.spawn(P(0, 0, 0), 1.5)).toThrow(
        'MovementAuthority: spawn tick must be a non-negative safe integer',
      );
      expect(a.position).toEqual(P(0, 0, 0));
      expect(a.lastTick).toBe(0);
    });

    it('re-spawn re-places the authority', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      a.spawn(P(0, 0, 0), 0);
      a.submitIntent(P(0.5, 0, 0), 1);
      a.spawn(P(100, 64, 100), 9);
      expect(a.position).toEqual(P(100, 64, 100));
      expect(a.lastTick).toBe(9);
      expect(a.acceptedCount).toBe(0);
    });
  });

  describe('acceptance', () => {
    it('accepts an in-bounds newer-tick intent', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      a.spawn(P(0, 0, 0), 0);
      const r = a.submitIntent(P(0.5, 0, 0), 1);
      expect(r.accepted).toBe(true);
      expect(a.position).toEqual(P(0.5, 0, 0));
      expect(a.lastTick).toBe(1);
      expect(a.acceptedCount).toBe(1);
      expect(a.lastRejection).toBeNull();
    });

    it('accepts at the exact speed boundary', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 2 });
      a.spawn(P(0, 0, 0), 0);
      const r = a.submitIntent(P(2, 0, 0), 1);
      expect(r.accepted).toBe(true);
      expect(a.position).toEqual(P(2, 0, 0));
    });

    it('accepts a 3D displacement near the bound', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      a.spawn(P(0, 0, 0), 0);
      const r = a.submitIntent(P(0.57735, 0.57735, 0.57735), 1);
      expect(r.accepted).toBe(true);
    });
  });

  describe('corrections', () => {
    it('corrects equal and older ticks without changing state', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      a.spawn(P(0, 0, 0), 5);
      const equal = a.submitIntent(P(0.1, 0, 0), 5);
      const older = a.submitIntent(P(0.1, 0, 0), 4);
      expect(equal.accepted).toBe(false);
      expect(older.accepted).toBe(false);
      if (isCorrection(equal) && isCorrection(older)) {
        expect(equal.reason).toBe('stale tick');
        expect(older.reason).toBe('stale tick');
        expect(equal.correction).toEqual(P(0, 0, 0));
        expect(older.correction).toEqual(P(0, 0, 0));
      }
      expect(a.position).toEqual(P(0, 0, 0));
      expect(a.acceptedCount).toBe(0);
      expect(a.lastRejection).toEqual({ tick: 4, reason: 'stale tick' });
    });

    it('corrects a speed-limit violation', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      a.spawn(P(0, 0, 0), 0);
      const r = a.submitIntent(P(3, 0, 0), 1);
      expect(r.accepted).toBe(false);
      if (isCorrection(r)) {
        expect(r.reason).toBe('speed limit');
        expect(r.correction).toEqual(P(0, 0, 0));
      }
      expect(a.position).toEqual(P(0, 0, 0));
      expect(a.acceptedCount).toBe(0);
    });

    it('rejects pre-spawn intents as stale', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      const r = a.submitIntent(P(0, 0, 0), 1);
      expect(r.accepted).toBe(false);
      if (isCorrection(r)) {
        expect(r.reason).toBe('stale tick');
        expect(r.correction).toEqual(P(0, 0, 0));
      }
    });
  });

  describe('malformed intents throw', () => {
    it('rejects non-finite coordinates', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      a.spawn(P(0, 0, 0), 0);
      expect(() => a.submitIntent(P(Number.NaN, 0, 0), 1)).toThrow(
        'MovementAuthority: intent position must be finite numbers',
      );
      expect(a.position).toEqual(P(0, 0, 0));
      expect(a.acceptedCount).toBe(0);
    });

    it('rejects non-integer or negative ticks', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      a.spawn(P(0, 0, 0), 0);
      expect(() => a.submitIntent(P(0, 0, 0), -1)).toThrow(
        'MovementAuthority: intent tick must be a non-negative safe integer',
      );
      expect(() => a.submitIntent(P(0, 0, 0), 1.5)).toThrow(
        'MovementAuthority: intent tick must be a non-negative safe integer',
      );
      expect(a.lastTick).toBe(0);
    });
  });

  describe('teleport and reset', () => {
    it('teleports and resets ordering', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      a.spawn(P(0, 0, 0), 0);
      a.submitIntent(P(0.5, 0, 0), 1);
      a.teleport(P(100, 80, 100), 50);
      expect(a.position).toEqual(P(100, 80, 100));
      expect(a.lastTick).toBe(50);
    });

    it('reset restores the pristine state', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      a.spawn(P(0, 0, 0), 0);
      a.submitIntent(P(0.5, 0, 0), 1);
      a.submitIntent(P(2, 0, 0), 2); // corrected
      a.reset();
      expect(a.position).toEqual(P(0, 0, 0));
      expect(a.lastTick).toBe(0);
      expect(a.acceptedCount).toBe(0);
      expect(a.lastRejection).toBeNull();
    });

    it('identical schedules produce identical state', () => {
      const run = (): MovementAuthority => {
        const a = new MovementAuthority({ maxSpeedPerTick: 1 });
        a.spawn(P(0, 0, 0), 0);
        a.submitIntent(P(0.5, 0, 0), 1);
        a.submitIntent(P(2, 0, 0), 2); // rejected
        a.teleport(P(10, 64, 10), 20);
        a.submitIntent(P(10.5, 64, 10), 21);
        return a;
      };
      const a = run();
      const b = run();
      expect(b.position).toEqual(a.position);
      expect(b.lastTick).toEqual(a.lastTick);
      expect(b.acceptedCount).toEqual(a.acceptedCount);
      expect(b.lastRejection).toEqual(a.lastRejection);
    });
  });

  describe('adversarial replay/ordering integrity (237)', () => {
    it('rejects replayed and out-of-order ticks as stale without mutating state', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      a.spawn(P(0, 0, 0), 100);
      const accepted = a.submitIntent(P(0.5, 0, 0), 110);
      expect(accepted.accepted).toBe(true);
      const posAfter = a.position;
      const tickAfter = a.lastTick;
      for (const t of [110, 109]) {
        const r = a.submitIntent(P(1, 0, 0), t);
        expect(r.accepted).toBe(false);
        if (isCorrection(r)) expect(r.reason).toBe('stale tick');
      }
      expect(a.position).toEqual(posAfter);
      expect(a.lastTick).toBe(tickAfter);
    });

    it('a teleport legitimately resets tick ordering', () => {
      const a = new MovementAuthority({ maxSpeedPerTick: 1 });
      a.spawn(P(0, 0, 0), 100);
      a.submitIntent(P(0.5, 0, 0), 110);
      a.teleport(P(5, 0, 0), 200);
      const r = a.submitIntent(P(5.5, 0, 0), 201);
      expect(r.accepted).toBe(true);
      expect(a.position).toEqual(P(5.5, 0, 0));
    });
  });
});
