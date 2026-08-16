import { describe, it, expect } from 'vitest';
import {
  MovementReconciler,
  type Position,
} from '../../src/simulation/MovementReconciler';

const P = (x: number, y: number, z: number): Position => ({ x, y, z });

describe('MovementReconciler', () => {
  describe('construction', () => {
    it('constructs pristine: origin, confirmedTick 0, pendingCount 0, empty pending', () => {
      const r = new MovementReconciler();
      expect(r.predicted).toEqual({ x: 0, y: 0, z: 0 });
      expect(r.confirmedTick).toBe(0);
      expect(r.pendingCount).toBe(0);
      expect(r.pending).toEqual([]);
    });

    it('accepts valid custom maxPending option', () => {
      const r = new MovementReconciler({ maxPending: 64 });
      expect(r.predicted).toEqual({ x: 0, y: 0, z: 0 });
      expect(r.confirmedTick).toBe(0);
      expect(r.pendingCount).toBe(0);
      expect(r.pending).toEqual([]);
    });

    it('rejects invalid maxPending', () => {
      for (const bad of [0, -5, 1.5, Number.POSITIVE_INFINITY, Number.NaN]) {
        expect(() => new MovementReconciler({ maxPending: bad })).toThrow(
          'MovementReconciler: maxPending must be a positive integer',
        );
      }
    });
  });

  describe('prediction', () => {
    it('advances predicted position and appends intent to pending buffer', () => {
      const r = new MovementReconciler();
      r.predict(P(1, 64, 2), 1);
      expect(r.predicted).toEqual(P(1, 64, 2));
      expect(r.confirmedTick).toBe(0);
      expect(r.pendingCount).toBe(1);
      expect(r.pending).toEqual([{ tick: 1, position: P(1, 64, 2) }]);
    });

    it('handles multiple sequential predictions in chronological order', () => {
      const r = new MovementReconciler();
      r.predict(P(1, 0, 0), 1);
      r.predict(P(2, 0, 0), 2);
      r.predict(P(3, 0, 0), 3);
      expect(r.predicted).toEqual(P(3, 0, 0));
      expect(r.pendingCount).toBe(3);
      expect(r.pending).toEqual([
        { tick: 1, position: P(1, 0, 0) },
        { tick: 2, position: P(2, 0, 0) },
        { tick: 3, position: P(3, 0, 0) },
      ]);
    });

    it('rejects prediction when pending buffer is full without mutating state', () => {
      const r = new MovementReconciler({ maxPending: 2 });
      r.predict(P(1, 0, 0), 1);
      r.predict(P(2, 0, 0), 2);
      expect(r.pendingCount).toBe(2);

      expect(() => r.predict(P(3, 0, 0), 3)).toThrow(
        'MovementReconciler: pending buffer full',
      );
      expect(r.predicted).toEqual(P(2, 0, 0));
      expect(r.pendingCount).toBe(2);
      expect(r.pending).toEqual([
        { tick: 1, position: P(1, 0, 0) },
        { tick: 2, position: P(2, 0, 0) },
      ]);
    });

    it('is immune to external mutation of passed position objects or retrieved snapshots', () => {
      const r = new MovementReconciler();
      const pos = { x: 5, y: 10, z: 15 };
      r.predict(pos, 1);
      pos.x = 999;
      expect(r.predicted).toEqual(P(5, 10, 15));
      expect(r.pending[0]?.position).toEqual(P(5, 10, 15));

      const snapshot = r.pending;
      const first = snapshot[0];
      expect(first).toBeDefined();
      if (first) {
        (first.position as { x: number }).x = 888;
      }
      expect(r.pending[0]?.position).toEqual(P(5, 10, 15));

      const pred = r.predicted;
      (pred as { x: number }).x = 777;
      expect(r.predicted).toEqual(P(5, 10, 15));
    });
  });

  describe('reconciliation', () => {
    it('confirms predicted intent, advances confirmedTick, and replays surviving intents', () => {
      const r = new MovementReconciler();
      r.predict(P(1, 0, 0), 1);
      r.predict(P(2, 0, 0), 2);

      r.reconcile(P(1, 0, 0), 1);
      expect(r.confirmedTick).toBe(1);
      expect(r.pendingCount).toBe(1);
      expect(r.pending).toEqual([{ tick: 2, position: P(2, 0, 0) }]);
      expect(r.predicted).toEqual(P(2, 0, 0));
    });

    it('applies authoritative correction, snaps to server position, and replays surviving intents', () => {
      const r = new MovementReconciler();
      r.predict(P(10, 0, 0), 1);
      r.predict(P(20, 0, 0), 2);

      // Server corrects tick 1 from 10 to 5
      r.reconcile(P(5, 0, 0), 1);
      expect(r.confirmedTick).toBe(1);
      expect(r.pendingCount).toBe(1);
      expect(r.pending).toEqual([{ tick: 2, position: P(20, 0, 0) }]);
      // Since intent 2 is at {20,0,0}, replaying it sets predicted to {20,0,0}
      expect(r.predicted).toEqual(P(20, 0, 0));
    });

    it('sets predicted to authoritative position when no pending intents survive', () => {
      const r = new MovementReconciler();
      r.predict(P(10, 0, 0), 1);
      r.predict(P(20, 0, 0), 2);

      // Server confirms/corrects tick 2 to {15,0,0}
      r.reconcile(P(15, 0, 0), 2);
      expect(r.confirmedTick).toBe(2);
      expect(r.pendingCount).toBe(0);
      expect(r.pending).toEqual([]);
      expect(r.predicted).toEqual(P(15, 0, 0));
    });

    it('correctly replays multi-step surviving intents in chronological order', () => {
      const r = new MovementReconciler();
      r.predict(P(1, 0, 0), 1);
      r.predict(P(2, 0, 0), 2);
      r.predict(P(3, 0, 0), 3);
      r.predict(P(4, 0, 0), 4);

      // Server corrects tick 2 to {10, 0, 0}
      r.reconcile(P(10, 0, 0), 2);
      expect(r.confirmedTick).toBe(2);
      expect(r.pendingCount).toBe(2);
      expect(r.pending).toEqual([
        { tick: 3, position: P(3, 0, 0) },
        { tick: 4, position: P(4, 0, 0) },
      ]);
      expect(r.predicted).toEqual(P(4, 0, 0));
    });

    it('treats stale corrections (authoritativeTick <= confirmedTick) as silent no-ops', () => {
      const r = new MovementReconciler();
      r.predict(P(1, 0, 0), 1);
      r.predict(P(5, 0, 0), 5);
      r.reconcile(P(5, 0, 0), 5);

      expect(r.confirmedTick).toBe(5);
      expect(r.predicted).toEqual(P(5, 0, 0));
      expect(r.pendingCount).toBe(0);

      // Equal tick (5) is stale
      r.reconcile(P(999, 0, 0), 5);
      expect(r.confirmedTick).toBe(5);
      expect(r.predicted).toEqual(P(5, 0, 0));

      // Older tick (3) is stale
      r.reconcile(P(888, 0, 0), 3);
      expect(r.confirmedTick).toBe(5);
      expect(r.predicted).toEqual(P(5, 0, 0));
    });
  });

  describe('malformed input validation', () => {
    it('rejects malformed coordinates in predict without mutating state', () => {
      const r = new MovementReconciler();
      for (const bad of [
        P(Number.NaN, 0, 0),
        P(0, Number.POSITIVE_INFINITY, 0),
        P(0, 0, Number.NEGATIVE_INFINITY),
        null as unknown as Position,
        { x: 0, y: 'bad', z: 0 } as unknown as Position,
      ]) {
        expect(() => r.predict(bad, 1)).toThrow(
          'MovementReconciler: predict position must be finite numbers',
        );
      }
      expect(r.predicted).toEqual(P(0, 0, 0));
      expect(r.pendingCount).toBe(0);
    });

    it('rejects malformed ticks in predict without mutating state', () => {
      const r = new MovementReconciler();
      for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => r.predict(P(1, 0, 0), bad)).toThrow(
          'MovementReconciler: predict tick must be a non-negative safe integer',
        );
      }
      expect(r.predicted).toEqual(P(0, 0, 0));
      expect(r.pendingCount).toBe(0);
    });

    it('rejects predict tick <= confirmedTick without mutating state', () => {
      const r = new MovementReconciler();
      r.predict(P(1, 0, 0), 5);
      r.reconcile(P(1, 0, 0), 5);
      expect(r.confirmedTick).toBe(5);

      expect(() => r.predict(P(2, 0, 0), 5)).toThrow(
        'MovementReconciler: predict tick must be greater than confirmed tick',
      );
      expect(() => r.predict(P(2, 0, 0), 4)).toThrow(
        'MovementReconciler: predict tick must be greater than confirmed tick',
      );
      expect(r.predicted).toEqual(P(1, 0, 0));
      expect(r.pendingCount).toBe(0);
    });

    it('rejects malformed coordinates in reconcile without mutating state', () => {
      const r = new MovementReconciler();
      r.predict(P(1, 0, 0), 1);
      for (const bad of [
        P(Number.NaN, 0, 0),
        P(0, Number.POSITIVE_INFINITY, 0),
        null as unknown as Position,
      ]) {
        expect(() => r.reconcile(bad, 1)).toThrow(
          'MovementReconciler: authoritative position must be finite numbers',
        );
      }
      expect(r.confirmedTick).toBe(0);
      expect(r.predicted).toEqual(P(1, 0, 0));
      expect(r.pendingCount).toBe(1);
    });

    it('rejects malformed ticks in reconcile without mutating state', () => {
      const r = new MovementReconciler();
      r.predict(P(1, 0, 0), 1);
      for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => r.reconcile(P(1, 0, 0), bad)).toThrow(
          'MovementReconciler: authoritative tick must be a non-negative safe integer',
        );
      }
      expect(r.confirmedTick).toBe(0);
      expect(r.predicted).toEqual(P(1, 0, 0));
      expect(r.pendingCount).toBe(1);
    });
  });

  describe('reset and determinism', () => {
    it('reset restores pristine state', () => {
      const r = new MovementReconciler();
      r.predict(P(1, 0, 0), 1);
      r.predict(P(2, 0, 0), 2);
      r.reconcile(P(1, 0, 0), 1);
      expect(r.confirmedTick).toBe(1);
      expect(r.pendingCount).toBe(1);

      r.reset();
      expect(r.predicted).toEqual(P(0, 0, 0));
      expect(r.confirmedTick).toBe(0);
      expect(r.pendingCount).toBe(0);
      expect(r.pending).toEqual([]);
    });

    it('identical schedules produce identical state at every step', () => {
      const run = (): MovementReconciler => {
        const r = new MovementReconciler();
        r.predict(P(1, 64, 1), 1);
        r.predict(P(2, 64, 2), 2);
        r.predict(P(3, 64, 3), 3);
        r.reconcile(P(1.5, 64, 1.5), 2);
        r.predict(P(4, 64, 4), 4);
        r.reconcile(P(4, 64, 4), 4);
        return r;
      };
      const a = run();
      const b = run();
      expect(b.predicted).toEqual(a.predicted);
      expect(b.confirmedTick).toEqual(a.confirmedTick);
      expect(b.pendingCount).toEqual(a.pendingCount);
      expect(b.pending).toEqual(a.pending);
    });
  });
});
