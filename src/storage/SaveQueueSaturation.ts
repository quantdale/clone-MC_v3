/**
 * Dirty-save-queue saturation harness (238, save-queue-saturation). Drives 038 `DirtySaveQueue` at
 * worst-case volume: marks a bounded set of units, drains them in bounded batches through an injected
 * `SaveSink` (which may be slow or failing, deterministically), enforces a `maxPendingUnits` cap, and
 * evaluates a throughput budget. No-loss (a failed write is re-queued) and FIFO order are asserted by
 * the surrounding tests; this harness reports the achieved units-per-second and any lost units. Pure
 * and headless-safe.
 */
import { DirtySaveQueue, type SaveSink, type SaveUnit } from './DirtySaveQueue';

/** Budget thresholds for save-queue saturation. */
export interface SaveQueueSaturationConfig {
  /** Cap on pending units during marking; over-cap marks are dropped (bounded pending). */
  maxPendingUnits: number;
  /** Budget: achieved write rate, in units per second (higher is better). */
  maxUnitsPerSecond: number;
  /** Number of units marked and drained in a run. */
  iterations: number;
  /** Per-unit sink latency used by a deterministic injected sink (validated positive finite). */
  sinkWriteMillis: number;
}

/** One dimension of a save saturation budget evaluation. */
export interface SaveBudgetEntry {
  dimension: 'throughput';
  budget: number;
  actual: number;
  withinBudget: boolean;
}

/** The verdict of a save saturation run or standalone evaluation. */
export interface SaveSaturationReport {
  withinBudget: boolean;
  entries: SaveBudgetEntry[];
  /** Number of units successfully written. */
  unitsWritten: number;
  /** Number of marked units lost (never written, never pending). MUST be 0 (no-loss). */
  unitsLost: number;
  /** Number of marks rejected by the `maxPendingUnits` cap. */
  dropped: number;
  /** Achieved write rate in units/second. */
  unitsPerSecond: number;
}

const CONFIG_FIELDS: readonly (keyof SaveQueueSaturationConfig)[] = [
  'maxPendingUnits',
  'maxUnitsPerSecond',
  'iterations',
  'sinkWriteMillis',
];

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Validate an unknown value as `SaveQueueSaturationConfig`. Throws a descriptive error naming the
 * field for any non-positive/non-finite/non-numeric value or non-object input.
 */
export function validateSaveSaturationConfig(input: unknown): SaveQueueSaturationConfig {
  if (typeof input !== 'object' || input === null) {
    throw new Error('SaveQueueSaturationConfig: must be an object');
  }
  const r = input as Record<string, unknown>;
  for (const field of CONFIG_FIELDS) {
    if (!isPositiveFinite(r[field])) {
      throw new Error(`SaveQueueSaturationConfig: ${field} must be a positive finite number, got ${String(r[field])}`);
    }
  }
  return input as SaveQueueSaturationConfig;
}

/** Whether an achieved rate is within budget: finite, non-negative, and at or above the target. */
function withinRate(budget: number, actual: number): boolean {
  if (typeof actual !== 'number' || !Number.isFinite(actual) || actual < 0) return false;
  return actual >= budget;
}

/**
 * Evaluate the achieved write rate against the throughput budget. Note throughput is "higher is
 * better", so a dimension is within iff `actual >= budget` (unlike latency budgets).
 */
export function evaluateSaveSaturation(
  config: SaveQueueSaturationConfig,
  actual: { unitsPerSecond: number; dropped: number },
): SaveSaturationReport {
  const cfg = validateSaveSaturationConfig(config);
  const entry: SaveBudgetEntry = {
    dimension: 'throughput',
    budget: cfg.maxUnitsPerSecond,
    actual: actual.unitsPerSecond,
    withinBudget: withinRate(cfg.maxUnitsPerSecond, actual.unitsPerSecond),
  };
  return {
    withinBudget: entry.withinBudget,
    entries: [entry],
    unitsWritten: 0,
    unitsLost: 0,
    dropped: actual.dropped,
    unitsPerSecond: actual.unitsPerSecond,
  };
}

/** Batch size per `drain(sink, limit)` call (bounded, matches 038's bounded-work contract). */
const BATCH_LIMIT = 64;
/** Safety guard against an infinite drain loop under a permanently failing sink. */
const MAX_DRAIN_PASSES = 100000;

/**
 * Mark up to `config.iterations` units into `queue` (respecting `maxPendingUnits`, dropping over-cap
 * marks), drain them in bounded batches through the injected `sink`, and evaluate the achieved write
 * rate against the throughput budget. Reports written/lost/dropped counts. No-loss means a unit is
 * either written successfully or still pending; `unitsLost` must be 0.
 */
export async function runSaveSaturation(
  queue: DirtySaveQueue,
  sink: SaveSink,
  units: SaveUnit[],
  config: SaveQueueSaturationConfig,
  now: () => number,
): Promise<SaveSaturationReport> {
  const cfg = validateSaveSaturationConfig(config);
  const start = now();

  let marked = 0;
  let dropped = 0;
  for (const unit of units) {
    if (marked >= cfg.iterations) break;
    if (queue.size >= cfg.maxPendingUnits) {
      dropped++;
      continue;
    }
    queue.markDirty(unit);
    marked++;
  }

  let written = 0;
  let passes = 0;
  while (queue.size > 0 && passes < MAX_DRAIN_PASSES) {
    const beforeSize = queue.size;
    written += await queue.drain(sink, BATCH_LIMIT);
    passes++;
    // A drain that made no progress (every unit in the batch failed) cannot advance; stop to avoid
    // an infinite retry loop. The failing units remain pending (no-loss).
    if (queue.size >= beforeSize) break;
  }

  const end = now();
  const elapsedMs = Math.max(0, end - start);
  const unitsPerSecond = elapsedMs > 0 ? written / (elapsedMs / 1000) : Infinity;
  const unitsLost = marked - written - queue.size;

  const report = evaluateSaveSaturation(cfg, { unitsPerSecond, dropped });
  report.unitsWritten = written;
  report.unitsLost = unitsLost;
  // No-loss is a hard requirement: any lost unit fails the verdict regardless of throughput.
  report.withinBudget = report.withinBudget && unitsLost === 0;
  return report;
}
