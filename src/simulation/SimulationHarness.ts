/**
 * Headless simulation test harness (055). A `SimulationHarness` owns an integer tick counter and a
 * list of `HarnessSystem`s, stepping them deterministically in registration order. `snapshot`/
 * `restore` provide deterministic replay hooks (restore-then-step equals fresh-run results);
 * `stepUntil` bounds condition-driven stepping; `reset`/`run` manage scoped sessions. Intended for
 * headless simulation tests of fluids, redstone, mobs, and other fixed-tick systems.
 */
export interface TickableSystem {
  tick(tick: number): void;
}

/** A tickable system that can serialize/restore its own state. */
export interface HarnessSystem extends TickableSystem {
  /** Must return a fresh, serializable object (never the live state). */
  snapshot(): unknown;
  restore(state: unknown): void;
}

/** Combined harness state for deterministic replay. */
export interface HarnessSnapshot {
  tick: number;
  systems: unknown[];
}

export interface SimulationHarnessOptions {
  systems: HarnessSystem[];
  /** First tick is `initialTick + 1`; default 0. */
  initialTick?: number;
}

function isHarnessSnapshot(value: unknown): value is HarnessSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return Number.isInteger(r.tick) && Array.isArray(r.systems);
}

/** Deterministic tick-stepping harness over `HarnessSystem`s. */
export class SimulationHarness {
  private readonly systems: HarnessSystem[];
  private readonly initialSnapshot: HarnessSnapshot;
  private currentTick: number;

  constructor(opts: SimulationHarnessOptions) {
    this.systems = opts.systems;
    this.currentTick = opts.initialTick ?? 0;
    // Capture each system's pristine state at construction for `reset()`.
    this.initialSnapshot = {
      tick: this.currentTick,
      systems: this.systems.map((s) => s.snapshot()),
    };
  }

  /** Advance exactly `times` ticks (default 1); `times <= 0` is a no-op. */
  step(times: number = 1): void {
    if (!Number.isInteger(times) || times <= 0) return;
    for (let i = 0; i < times; i++) {
      this.currentTick++;
      for (const system of this.systems) {
        system.tick(this.currentTick);
      }
    }
  }

  /**
   * Step until `predicate(tick)` is true or `maxSteps` ticks were taken. Returns the number of steps
   * taken.
   */
  stepUntil(predicate: (tick: number) => boolean, maxSteps: number): number {
    let steps = 0;
    while (steps < maxSteps && !predicate(this.currentTick)) {
      this.step(1);
      steps++;
    }
    return steps;
  }

  /** The current tick counter. */
  get tick(): number {
    return this.currentTick;
  }

  /** Capture the harness state (tick counter + per-system snapshots). */
  snapshot(): HarnessSnapshot {
    return {
      tick: this.currentTick,
      systems: this.systems.map((s) => s.snapshot()),
    };
  }

  /**
   * Restore a previously captured snapshot. The whole snapshot is validated first (shape + system
   * count); on rejection the harness is unchanged.
   */
  restore(snapshot: HarnessSnapshot): void {
    if (!isHarnessSnapshot(snapshot) || snapshot.systems.length !== this.systems.length) {
      throw new Error('SimulationHarness: malformed harness snapshot');
    }
    this.currentTick = snapshot.tick;
    for (let i = 0; i < this.systems.length; i++) {
      this.systems[i]!.restore(snapshot.systems[i]);
    }
  }

  /** Restore the initial tick and each system's pristine state (captured at construction). */
  reset(): void {
    this.restore(this.initialSnapshot);
  }

  /** Run `fn` in a scoped session: snapshot → reset → fn → restore; leaves the harness unchanged. */
  run(fn: (harness: SimulationHarness) => void): void {
    const before = this.snapshot();
    this.reset();
    try {
      fn(this);
    } finally {
      this.restore(before);
    }
  }
}
