/**
 * Small deterministic hysteresis primitives shared by streaming policies.
 * Runtime-only state: these latches never affect canonical world data.
 */

export type HysteresisDirection = 'at-most' | 'at-least';

export interface HysteresisThresholdOptions {
  enterAt: number;
  exitAt: number;
  direction: HysteresisDirection;
  initialActive?: boolean;
}

function assertThreshold(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Hysteresis: ${name} must be finite`);
  }
}

/**
 * A two-threshold boolean latch. `enterAt` is the stricter threshold and
 * `exitAt` supplies the dead-band that prevents threshold chatter.
 */
export class HysteresisLatch {
  private active: boolean;
  readonly enterAt: number;
  readonly exitAt: number;
  readonly direction: HysteresisDirection;

  constructor(options: HysteresisThresholdOptions) {
    assertThreshold(options.enterAt, 'enterAt');
    assertThreshold(options.exitAt, 'exitAt');
    if (options.direction !== 'at-most' && options.direction !== 'at-least') {
      throw new RangeError('Hysteresis: direction must be at-most or at-least');
    }
    if (options.direction === 'at-most' && options.exitAt < options.enterAt) {
      throw new RangeError('Hysteresis: at-most exitAt must be >= enterAt');
    }
    if (options.direction === 'at-least' && options.exitAt > options.enterAt) {
      throw new RangeError('Hysteresis: at-least exitAt must be <= enterAt');
    }
    this.enterAt = options.enterAt;
    this.exitAt = options.exitAt;
    this.direction = options.direction;
    this.active = options.initialActive ?? false;
  }

  /** Apply one sample and return the stable active state. */
  update(sample: number): boolean {
    assertThreshold(sample, 'sample');
    if (this.direction === 'at-most') {
      if (this.active) {
        if (sample > this.exitAt) this.active = false;
      } else if (sample <= this.enterAt) {
        this.active = true;
      }
    } else if (this.active) {
      if (sample < this.exitAt) this.active = false;
    } else if (sample >= this.enterAt) {
      this.active = true;
    }
    return this.active;
  }

  /** Current state without sampling. */
  get isActive(): boolean {
    return this.active;
  }

  /** Reset to a known state before a new stream epoch. */
  reset(active = false): void {
    this.active = active;
  }
}

/** Stateless distance policy used by load/unload hysteresis. */
export function isOutsideHysteresisRadius(
  distance: number,
  loadRadius: number,
  hysteresis: number,
): boolean {
  assertThreshold(distance, 'distance');
  if (!Number.isInteger(loadRadius) || loadRadius < 0) {
    throw new RangeError('Hysteresis: loadRadius must be a non-negative integer');
  }
  if (!Number.isInteger(hysteresis) || hysteresis < 0) {
    throw new RangeError('Hysteresis: hysteresis must be a non-negative integer');
  }
  return distance > loadRadius + hysteresis;
}
