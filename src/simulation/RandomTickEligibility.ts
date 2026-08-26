import type { BlockRegistry } from '../world/BlockRegistry';
import type { BlockBehaviorRegistry } from './BlockBehavior';

/**
 * Registry-derived id→has-random-tick lookup table (254).
 *
 * The random-tick selector probes eligibility up to hundreds of times per
 * section per tick. This table replaces the historical two-lookup probe
 * (blockRegistry.get(id).key → behaviorRegistry.getBehavior(key)) with one
 * typed-array read while deriving every decision from exactly the same
 * registries, so results are bit-identical for registered ids. Ids outside the
 * current table trigger a rebuild; unregistered ids fall through to the direct
 * path so exception behavior (unknown block id) is identical too.
 */
export class RandomTickEligibility {
  private table: Uint8Array | null = null;

  constructor(
    private readonly blocks: BlockRegistry,
    private readonly behaviors: BlockBehaviorRegistry,
  ) {}

  /** Whether block `id` has an `onRandomTick` behavior hook. */
  has(id: number): boolean {
    const table = this.table;
    if (table !== null && id >= 0 && id < table.length) {
      return table[id] === 1;
    }
    let maxId = -1;
    for (const def of this.blocks.all()) {
      if (def.id > maxId) maxId = def.id;
    }
    if (maxId >= 0) {
      const next = new Uint8Array(Math.max(maxId + 1, table?.length ?? 0));
      for (const def of this.blocks.all()) {
        next[def.id] =
          typeof this.behaviors.getBehavior(def.key).onRandomTick === 'function' ? 1 : 0;
      }
      this.table = next;
      if (id >= 0 && id < next.length) {
        return next[id] === 1;
      }
    }
    // Unregistered id: identical behavior to the direct lookup (may throw).
    return (
      typeof this.behaviors.getBehavior(this.blocks.get(id).key).onRandomTick === 'function'
    );
  }
}
