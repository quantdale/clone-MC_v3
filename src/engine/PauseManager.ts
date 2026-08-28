/**
 * Explicit singleplayer pause semantics (046). The simulation clock (044) is gated by this manager:
 * while any pause reason is active, `isPaused` is true and the game loop must stop feeding the clock,
 * freezing the simulation exactly. UI, rendering, and non-simulation timers are unaffected (they run
 * outside the sim gate). Reasons are a Set so pause/resume are idempotent and overlapping sources
 * compose correctly: the simulation resumes only when the last reason clears.
 */

/** The known singleplayer pause sources. */
export const PAUSE_REASONS = {
  menuOpen: 'menu-open',
  pointerLockLost: 'pointer-lock-lost',
  windowBlur: 'window-blur',
  autoPause: 'auto-pause',
} as const;

/** Any named pause source (extensible beyond the vocabulary). */
export type PauseReason = string;

/** Reason-based pause state for the singleplayer simulation. */
export class PauseManager {
  private readonly active = new Set<string>();
  private readonly listeners = new Set<(paused: boolean) => void>();

  /** Pause the simulation for `reason` (idempotent). */
  pause(reason: PauseReason): void {
    if (this.active.has(reason)) return;
    const wasPaused = this.active.size > 0;
    this.active.add(reason);
    if (!wasPaused) {
      this.notify(true);
    }
  }

  /** Release `reason` (idempotent; unknown reasons are a no-op). */
  resume(reason: PauseReason): void {
    if (!this.active.delete(reason)) return;
    if (this.active.size === 0) {
      this.notify(false);
    }
  }

  /** True while any pause reason is active. */
  get isPaused(): boolean {
    return this.active.size > 0;
  }

  /** Active pause reasons in insertion order. */
  get reasons(): string[] {
    return [...this.active];
  }

  /** Subscribe to paused-state transitions; returns an unsubscribe function. */
  onChange(listener: (paused: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Clear every active reason (used for clean teardown). */
  resumeAll(): void {
    if (this.active.size === 0) return;
    this.active.clear();
    this.notify(false);
  }

  private notify(paused: boolean): void {
    for (const listener of this.listeners) {
      try {
        listener(paused);
      } catch {
        // Defensive: one failing listener must not break the rest.
      }
    }
  }
}
