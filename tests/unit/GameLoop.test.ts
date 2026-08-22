// ── GameLoop coverage (verification campaign) ───────────────────────────────

import { describe, expect, it } from "vitest";
import { GameLoop } from "../../src/engine/GameLoop";
import { CONFIG } from "../../src/config";

/** Installs a controllable requestAnimationFrame/cancelAnimationFrame + performance.now triple. */
function installFakeRaf() {
  const pending = new Map<number, (now: number) => void>();
  let nextId = 1;
  let now = 1000;
  const originalNow = globalThis.performance.now.bind(globalThis.performance);
  globalThis.performance.now = () => now;
  globalThis.requestAnimationFrame = ((cb: (t: number) => void) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    pending.delete(id);
  }) as typeof cancelAnimationFrame;
  return {
    /** Fire the oldest queued frame at time `advanceMs` later; returns whether one fired. */
    pump(advanceMs: number): boolean {
      now += advanceMs;
      const first = pending.entries().next();
      if (first.done) return false;
      const [id, cb] = first.value;
      pending.delete(id);
      cb(now);
      return true;
    },
    get queued(): number {
      return pending.size;
    },
    restore() {
      delete (globalThis as { requestAnimationFrame?: unknown })
        .requestAnimationFrame;
      delete (globalThis as { cancelAnimationFrame?: unknown })
        .cancelAnimationFrame;
      globalThis.performance.now = originalNow;
    },
  };
}

describe("GameLoop", () => {
  it("drives update+render per frame with clamped positive deltas", () => {
    const raf = installFakeRaf();
    try {
      const updates: number[] = [];
      let renders = 0;
      const loop = new GameLoop(
        (dt) => updates.push(dt),
        () => renders++,
      );
      loop.start();

      expect(raf.pump(16)).toBe(true); // first frame: dt measured from start()
      expect(updates).toEqual([0.016]);
      expect(renders).toBe(1);
      expect(raf.queued).toBe(1);

      raf.pump(33);
      expect(updates.length).toBe(2);
      expect(updates[1]).toBeCloseTo(0.033, 5);
      expect(renders).toBe(2);
      expect(raf.queued).toBe(1);

      // A huge lapse (hidden tab) is capped to CONFIG.maxDeltaTime.
      raf.pump(10_000);
      expect(updates.length).toBe(3);
      expect(updates[2]).toBe(CONFIG.maxDeltaTime);

      loop.stop();
      expect(raf.queued).toBe(0);
    } finally {
      raf.restore();
    }
  });

  it("start is idempotent and stop before start is inert", () => {
    const raf = installFakeRaf();
    try {
      const loop = new GameLoop(
        () => {},
        () => {},
      );
      loop.stop(); // not running: no-op
      loop.start();
      loop.start(); // second start must not double-queue
      expect(raf.queued).toBe(1);
      loop.stop();
      expect(raf.queued).toBe(0);
    } finally {
      raf.restore();
    }
  });

  it("stops and reports through onError when update throws mid-frame", () => {
    const raf = installFakeRaf();
    try {
      const errors: unknown[] = [];
      const boom = new Error("update exploded");
      const loop = new GameLoop(
        () => {
          throw boom;
        },
        () => {},
        (err) => errors.push(err),
      );
      loop.start();
      raf.pump(16);
      expect(errors).toEqual([boom]);
      expect(raf.queued).toBe(0); // loop halted itself
    } finally {
      raf.restore();
    }
  });

  it("stops and reports when render throws", () => {
    const raf = installFakeRaf();
    try {
      const errors: unknown[] = [];
      let updates = 0;
      const loop = new GameLoop(
        () => updates++,
        () => {
          throw new Error("render exploded");
        },
        (err) => errors.push(err),
      );
      loop.start();
      raf.pump(16);
      expect(updates).toBe(1);
      expect(errors.length).toBe(1);
      expect(raf.queued).toBe(0);
    } finally {
      raf.restore();
    }
  });
});
