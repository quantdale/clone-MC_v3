/**
 * Redstone torch (158): the first *inverting* component — lit exactly when its attachment block is
 * **not** powered. That single inversion is what makes NOT/NOR/AND gates and latches possible.
 *
 * Because a torch can drive a circuit that drives the torch, it also needs burnout: a torch
 * toggling too rapidly within a window switches off and stays off until things go quiet.
 *
 * Burnout deliberately lives *outside* `torchShouldBeLit`. The inversion is a one-line rule that
 * must stay trivially correct and independently testable; burnout is a stateful heuristic the
 * caller applies on top. Folding them together would hide which rule caused an unlit torch.
 *
 * Update timing rides on 047's `ScheduledTickQueue`, the same primitive 157 established (and 159's
 * repeater delay will reuse). No facing/attachment-direction state (models are 059/060's scope —
 * `torchShouldBeLit` takes a plain boolean, so this module needs no world interface at all), no
 * `Game`/`World` wiring — see `openspec/changes/158-redstone-torch/design.md`.
 */
import { MAX_SIGNAL_STRENGTH, MIN_SIGNAL_STRENGTH } from './RedstoneSignal';
import type { ScheduledTick, ScheduledTickQueue } from './ScheduledTickQueue';

/** Ticks between a neighbour change and the torch reacting (vanilla's 1 redstone tick). */
export const TORCH_UPDATE_DELAY_TICKS = 2;
/** Toggles within the window that a torch tolerates before burning out. */
export const BURNOUT_TOGGLE_LIMIT = 8;
/** Window over which toggles are counted toward burnout. */
export const BURNOUT_WINDOW_TICKS = 60;
/** Quiet ticks required after the last toggle before a burnt-out torch recovers. */
export const BURNOUT_RECOVERY_TICKS = 60;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function normalizeTick(tick: number): number {
  return isFiniteNumber(tick) ? tick : 0;
}

/**
 * The inversion: a torch is lit exactly when the block it is attached to is unpowered. Nothing
 * else is folded in — burnout is the caller's to apply on top.
 */
export function torchShouldBeLit(attachmentPowered: boolean): boolean {
  return !attachmentPowered;
}

/** Full signal while lit, nothing otherwise. */
export function torchSignalStrength(lit: boolean): number {
  return lit ? MAX_SIGNAL_STRENGTH : MIN_SIGNAL_STRENGTH;
}

/** Schedule a torch to re-evaluate `TORCH_UPDATE_DELAY_TICKS` after `currentTick`. */
export function scheduleTorchUpdate(
  queue: ScheduledTickQueue,
  x: number,
  y: number,
  z: number,
  currentTick: number,
): void {
  queue.schedule(x, y, z, normalizeTick(currentTick) + TORCH_UPDATE_DELAY_TICKS);
}

/** Pop every torch update due at or before `nowTick`, in 047's deterministic order. */
export function dueTorchUpdates(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[] {
  return queue.tick(nowTick);
}

/**
 * Per-torch rapid-toggle tracking. `recordToggle` prunes on write — entries older than
 * `BURNOUT_WINDOW_TICKS` before the incoming tick are dropped — so per-torch memory stays bounded
 * by the toggle limit no matter how long the world runs.
 */
export class TorchBurnoutTracker {
  private readonly toggles = new Map<number, number[]>();

  /** Record a lit↔unlit transition for `torchId` at `tick`. */
  recordToggle(torchId: number, tick: number): void {
    const now = normalizeTick(tick);
    const retained = (this.toggles.get(torchId) ?? []).filter((t) => now - t < BURNOUT_WINDOW_TICKS);
    retained.push(now);
    this.toggles.set(torchId, retained);
  }

  /** Toggles still inside the burnout window as of `tick`. */
  toggleCount(torchId: number, tick: number): number {
    const now = normalizeTick(tick);
    const recorded = this.toggles.get(torchId);
    if (!recorded) return 0;
    return recorded.filter((t) => now - t < BURNOUT_WINDOW_TICKS).length;
  }

  /**
   * Whether `torchId` is burnt out at `tick`: its retained toggle count exceeded
   * `BURNOUT_TOGGLE_LIMIT`, and fewer than `BURNOUT_RECOVERY_TICKS` have passed since its **last
   * recorded toggle** (so a torch still being driven by a live loop never recovers mid-loop).
   */
  isBurnedOut(torchId: number, tick: number): boolean {
    const now = normalizeTick(tick);
    const recorded = this.toggles.get(torchId);
    if (!recorded || recorded.length === 0) return false;

    const last = recorded[recorded.length - 1]!;
    if (now - last >= BURNOUT_RECOVERY_TICKS) return false;

    const windowed = recorded.filter((t) => last - t < BURNOUT_WINDOW_TICKS).length;
    return windowed > BURNOUT_TOGGLE_LIMIT;
  }

  /** Clear one torch's history, or every torch's when called with no argument. */
  clear(torchId?: number): void {
    if (torchId === undefined) {
      this.toggles.clear();
    } else {
      this.toggles.delete(torchId);
    }
  }
}

/** Project a torch's lit flag into the property record `LIT_SCHEMA` enumerates. */
export function torchStateProperties(lit: boolean): Record<string, boolean> {
  return { lit };
}
