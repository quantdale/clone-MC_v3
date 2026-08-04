import type { BlockSelector } from './BlockSelector';

/**
 * Player inventory / hotbar backing store.
 *
 * Holds an ordered list of block ids (one per hotbar slot) and tracks the
 * currently selected slot. Implements {@link BlockSelector} so the interaction
 * system can query which block to place.
 *
 * Default slots use the stable BlockId values from the registry:
 * Grass / Dirt / Stone / Sand / Wood / Leaves / Water / Bedrock / Grass.
 */
const DEFAULT_SLOTS: number[] = [1, 2, 3, 4, 7, 8, 5, 6, 1];

export class Inventory implements BlockSelector {
  /** The block id in each hotbar slot. */
  slots: number[];
  /** Index of the currently selected slot. */
  selected: number;

  constructor(slots?: number[]) {
    this.slots = slots && slots.length > 0 ? [...slots] : [...DEFAULT_SLOTS];
    this.selected = 0;
  }

  /**
   * Select a slot by index, clamping out-of-range values to the nearest valid
   * slot.
   */
  select(index: number): void {
    if (this.slots.length === 0) {
      return;
    }
    this.selected = Math.max(0, Math.min(this.slots.length - 1, Math.trunc(index)));
  }

  /**
   * Move the selection by a delta number of slots with wraparound.
   * Positive deltas move forward (past the last slot wraps to the first),
   * negative deltas move backward (past the first slot wraps to the last).
   */
  cycle(delta: number): void {
    if (this.slots.length === 0) {
      return;
    }
    const length = this.slots.length;
    const next = ((this.selected + delta) % length + length) % length;
    this.selected = next;
  }

  /** The block id of the currently selected slot. */
  getSelectedBlockId(): number {
    return this.slots[this.selected] ?? 0;
  }
}