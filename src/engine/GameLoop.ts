import { CONFIG } from '../config';

/**
 * Fixed-style game loop driven by requestAnimationFrame.
 *
 * Computes the real elapsed time per frame (clamped to CONFIG.maxDeltaTime to
 * prevent physics explosions after a tab was hidden or the frame hitching),
 * then calls the update callback with that delta before rendering.
 */
export class GameLoop {
  private readonly update: (dt: number) => void;
  private readonly render: () => void;
  private readonly onError?: (err: unknown) => void;

  private running = false;
  private frameId = 0;
  private lastTime = 0;

  constructor(
    update: (dt: number) => void,
    render: () => void,
    onError?: (err: unknown) => void,
  ) {
    this.update = update;
    this.render = render;
    this.onError = onError;
  }

  /** Begins the animation loop. Safe to call multiple times. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
  }

  /** Cancels the animation frame and stops the loop. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;

    const elapsed = (now - this.lastTime) / 1000;
    // Clamp both bounds: a large lapse (hidden tab / hitch) is capped to
    // maxDeltaTime, and a regressed clock cannot drive physics backwards.
    const dt = Math.max(0, Math.min(elapsed, CONFIG.maxDeltaTime));
    this.lastTime = now;

    // An exception here would otherwise unwind the loop and leave the game
    // silently frozen with no error surfaced. Catch it, stop, and report.
    try {
      this.update(dt);
      this.render();
    } catch (err) {
      this.stop();
      this.onError?.(err);
      return;
    }

    this.frameId = requestAnimationFrame(this.tick);
  };
}