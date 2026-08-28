/**
 * Tracks GPU / engine resources that need to be disposed so they can be
 * released together and cannot be leaked.
 *
 * When constructed with a `MemoryResourceLedger`, every tracked resource is
 * also accounted against a `ResourceCategory` (with an optional byte estimate),
 * and disposal reconciles the ledger so category counters return to zero.
 */
import type { MemoryResourceLedger, ResourceCategory } from '../rendering/MemoryResourceBudget';

/** Optional accounting metadata for a tracked resource. */
export interface TrackOptions {
  /** Ledger category to charge; required for ledger accounting. */
  category?: ResourceCategory;
  /** Owning subsystem tag (informational, forwarded to the ledger). */
  sourceTag?: string;
  /** Estimated memory footprint in bytes. */
  estimatedBytes?: number;
}

interface TrackedEntry {
  obj: { dispose(): void };
  options: TrackOptions | undefined;
}

export class ResourceManager {
  private readonly disposables: TrackedEntry[] = [];
  private readonly ledger: MemoryResourceLedger | undefined;

  constructor(ledger?: MemoryResourceLedger) {
    this.ledger = ledger;
  }

  /**
   * Registers a disposable for later cleanup. The options argument is optional
   * so existing call sites remain source-compatible.
   */
  track(obj: { dispose(): void }, options?: TrackOptions): void {
    this.disposables.push({ obj, options });
    if (this.ledger && options?.category) {
      this.ledger.register(options.category, options.sourceTag ?? 'ResourceManager', 1, options.estimatedBytes ?? 0);
    }
  }

  /** Disposes every tracked resource and clears the registry. */
  dispose(): void {
    if (this.disposables.length === 0) {
      return;
    }
    // Snapshot and clear the registry first so a throwing dispose cannot leave
    // it partially cleared — a later dispose() call would otherwise
    // double-dispose the already-released resources.
    const pending = this.disposables.splice(0);
    for (const { obj, options } of pending) {
      try {
        obj.dispose();
      } catch (err) {
        console.error('ResourceManager: failed to dispose a tracked resource', err);
      }
      if (this.ledger && options?.category) {
        this.ledger.release(options.category, options.sourceTag ?? 'ResourceManager', 1, options.estimatedBytes ?? 0);
      }
    }
  }
}
