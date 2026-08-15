/**
 * Prioritized, interruptible AI goal framework (136). A `GoalSelector` runs a
 * per-mob set of `Goal`s each tick: it evaluates goals in ascending-priority
 * (then insertion) order, selects the ones that want to run and whose
 * `flags` don't conflict with an earlier-selected goal this tick — so a
 * higher-priority goal interrupts (stops) a running lower-priority goal that
 * loses a flag contest — then calls `stop()` on dropped goals, `start()` on
 * newly selected ones, and `tick()` on everything still running.
 *
 * No concrete goal implementations (wander/attack/etc., 139/140's scope) and
 * no `Game`/mob wiring — this is the generic scheduler only.
 */

/** Mutual-exclusion control categories a goal may claim while running. */
export const enum GoalFlag {
  Move = 0,
  Look = 1,
  Jump = 2,
  Target = 3,
}

/** One schedulable behavior. All lifecycle hooks are optional. */
export interface Goal {
  readonly flags: readonly GoalFlag[];
  /** Whether this goal may start (not currently running). */
  canUse(): boolean;
  /** Whether this goal may keep running. Defaults to re-checking `canUse()` when absent. */
  canContinueToUse?(): boolean;
  start?(): void;
  tick?(): void;
  stop?(): void;
}

interface Entry {
  priority: number;
  seq: number;
  goal: Goal;
}

/** Prioritized, interruptible goal scheduler for one mob. */
export class GoalSelector {
  private readonly entries: Entry[] = [];
  private readonly running = new Set<Goal>();
  private nextSeq = 0;

  /** Register `goal` at `priority` (lower runs first). Ties broken by registration order. */
  addGoal(priority: number, goal: Goal): void {
    this.entries.push({ priority, seq: this.nextSeq++, goal });
    this.entries.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
  }

  /** Stop `goal` if running and remove it from future selection. No-op if never added. */
  removeGoal(goal: Goal): void {
    const index = this.entries.findIndex((e) => e.goal === goal);
    if (index >= 0) this.entries.splice(index, 1);
    if (this.running.has(goal)) {
      goal.stop?.();
      this.running.delete(goal);
    }
  }

  /**
   * Evaluate one tick: select goals in priority order (skipping any whose
   * flags were already claimed this tick), stop dropped goals, start newly
   * selected ones, then tick every goal still running.
   */
  tick(): void {
    const usedFlags = new Set<GoalFlag>();
    const selected: Goal[] = [];

    for (const { goal } of this.entries) {
      const wantsToRun = this.running.has(goal)
        ? (goal.canContinueToUse ?? goal.canUse).call(goal)
        : goal.canUse();
      if (!wantsToRun) continue;
      if (goal.flags.some((f) => usedFlags.has(f))) continue;
      selected.push(goal);
      for (const f of goal.flags) usedFlags.add(f);
    }

    const selectedSet = new Set(selected);
    for (const goal of [...this.running]) {
      if (!selectedSet.has(goal)) {
        goal.stop?.();
        this.running.delete(goal);
      }
    }
    for (const goal of selected) {
      if (!this.running.has(goal)) {
        goal.start?.();
        this.running.add(goal);
      }
    }
    for (const goal of this.running) {
      goal.tick?.();
    }
  }

  /** Currently running goals (insertion order into the running set). */
  getRunning(): readonly Goal[] {
    return [...this.running];
  }

  /** Stop every running goal and remove all registered goals. */
  clear(): void {
    for (const goal of this.running) {
      goal.stop?.();
    }
    this.running.clear();
    this.entries.length = 0;
  }
}
