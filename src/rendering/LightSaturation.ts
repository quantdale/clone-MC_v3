/**
 * Main-thread light saturation harness (238, light-saturation). Composition helper over the
 * deterministic light engines (066-069) — the pure full-pass entry points (`computeSkyLight`,
 * `computeBlockLight`) and single-shot incremental update (`updateLightAfterEdit`) it drives are
 * unchanged by the bounded/versioned engine layer, so this harness measures the same semantics.
 * Drives at worst-case volume over a fixed dense volume, measuring full-pass
 * (067 `computeSkyLight` + 068 `computeBlockLight`) and incremental-edit-pass (069
 * `updateLightAfterEdit`) latency with an injectable clock, tracking bounded per-cell visits, and
 * evaluating full-pass/edit-pass latency budgets. Preserves 069 equivalence (incremental equals a
 * full recompute of the edited world) across a saturated edit sequence. Pure and headless-safe.
 */
import { computeSkyLight } from './SkyLightEngine';
import { computeBlockLight } from './BlockLightEngine';
import { updateLightAfterEdit, type LightUpdateWorld } from './LightUpdateEngine';

/** A block edit applied to the light world before its incremental update (069). */
export interface LightEdit<W extends LightUpdateWorld = LightUpdateWorld> {
  x: number;
  y: number;
  z: number;
  apply(world: W): void;
}

/** A light world that can clear its light arrays for a repeatable full pass. */
export interface DenseLightWorld extends LightUpdateWorld {
  /** Reset sky and block light to zero so a full pass is repeatable. */
  clearLight(): void;
}

/** Budget thresholds for light saturation. */
export interface LightSaturationConfig {
  /** Fixture volume width (16-column engine; validated positive finite). */
  volumeWidth: number;
  /** Fixture volume height (vertical span; validated positive finite). */
  volumeHeight: number;
  /** Fixture volume depth (16-column engine; validated positive finite). */
  volumeDepth: number;
  /** Budget: mean full-pass latency, in milliseconds. */
  maxFullPassMeanMillis: number;
  /** Budget: mean incremental-edit latency, in milliseconds. */
  maxEditMeanMillis: number;
  /** Number of passes/edits measured. */
  iterations: number;
}

const CONFIG_FIELDS: readonly (keyof LightSaturationConfig)[] = [
  'volumeWidth',
  'volumeHeight',
  'volumeDepth',
  'maxFullPassMeanMillis',
  'maxEditMeanMillis',
  'iterations',
];

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Validate an unknown value as `LightSaturationConfig`. Throws a descriptive error naming the field
 * for any non-positive/non-finite/non-numeric value or non-object input.
 */
export function validateLightSaturationConfig(input: unknown): LightSaturationConfig {
  if (typeof input !== 'object' || input === null) {
    throw new Error('LightSaturationConfig: must be an object');
  }
  const r = input as Record<string, unknown>;
  for (const field of CONFIG_FIELDS) {
    if (!isPositiveFinite(r[field])) {
      throw new Error(`LightSaturationConfig: ${field} must be a positive finite number, got ${String(r[field])}`);
    }
  }
  return input as LightSaturationConfig;
}

/** One dimension of a light saturation budget evaluation. */
export interface LightBudgetEntry {
  dimension: 'full-pass' | 'edit-pass';
  budget: number;
  actual: number;
  withinBudget: boolean;
}

/** The verdict of a light saturation run or standalone evaluation. */
export interface LightSaturationReport {
  withinBudget: boolean;
  entries: LightBudgetEntry[];
  /** Total cell visits across all full passes (bounded by volume × passes). */
  fullPassVisits: number;
  /** Total cell visits across all edit passes (bounded by volume × edits). */
  editVisits: number;
}

function withinLatency(budget: number, actual: number): boolean {
  if (typeof actual !== 'number' || !Number.isFinite(actual) || actual < 0) return false;
  return actual <= budget;
}

/**
 * Evaluate measured light latencies against the budget. A dimension is within iff `actual <= budget`;
 * malformed actuals violate; overall is within only when every dimension is.
 */
export function evaluateLightSaturation(
  config: LightSaturationConfig,
  actual: { fullPassMeanMillis: number; editMeanMillis: number },
): LightSaturationReport {
  const cfg = validateLightSaturationConfig(config);
  const entries: LightBudgetEntry[] = [
    { dimension: 'full-pass', budget: cfg.maxFullPassMeanMillis, actual: actual.fullPassMeanMillis, withinBudget: withinLatency(cfg.maxFullPassMeanMillis, actual.fullPassMeanMillis) },
    { dimension: 'edit-pass', budget: cfg.maxEditMeanMillis, actual: actual.editMeanMillis, withinBudget: withinLatency(cfg.maxEditMeanMillis, actual.editMeanMillis) },
  ];
  return { withinBudget: entries.every((entry) => entry.withinBudget), entries, fullPassVisits: 0, editVisits: 0 };
}

/** Count every method call on the world while `fn` runs (a bounded cell-visit metric). */
function countWorldCalls(world: object, fn: (w: object) => void): number {
  let count = 0;
  const proxy = new Proxy(world, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args: unknown[]): unknown => {
          count++;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return value;
    },
  });
  fn(proxy);
  return count;
}

/**
 * Run `iterations` full sky+block passes over the dense volume (clearing light before each pass for
 * repeatability), time each with the injectable clock, and evaluate the mean against the full-pass
 * budget. Returns the report plus the total cells visited across passes.
 */
export function runLightSaturation(
  world: DenseLightWorld,
  config: LightSaturationConfig,
  now: () => number,
): LightSaturationReport {
  const cfg = validateLightSaturationConfig(config);
  const latencies: number[] = [];
  let visits = 0;

  for (let i = 0; i < cfg.iterations; i++) {
    world.clearLight();
    const before = now();
    visits += countWorldCalls(world, (w) => {
      computeSkyLight(w as never);
      computeBlockLight(w as never);
    });
    const after = now();
    latencies.push(Math.max(0, after - before));
  }

  const mean = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const entry: LightBudgetEntry = {
    dimension: 'full-pass',
    budget: cfg.maxFullPassMeanMillis,
    actual: mean,
    withinBudget: withinLatency(cfg.maxFullPassMeanMillis, mean),
  };
  return { withinBudget: entry.withinBudget, entries: [entry], fullPassVisits: visits, editVisits: 0 };
}

/**
 * Apply up to `iterations` edits through `updateLightAfterEdit` (mutating the world before each
 * update), time each with the injectable clock, and evaluate the mean against the edit-pass budget.
 * Returns the report plus the total cells visited across edits.
 */
export function runLightEditSaturation<W extends LightUpdateWorld>(
  world: W,
  edits: LightEdit<W>[],
  config: LightSaturationConfig,
  now: () => number,
): LightSaturationReport {
  const cfg = validateLightSaturationConfig(config);
  const latencies: number[] = [];
  let visits = 0;
  let applied = 0;

  for (const edit of edits) {
    if (applied >= cfg.iterations) break;
    edit.apply(world);
    const before = now();
    visits += countWorldCalls(world, (w) => {
      updateLightAfterEdit(w as unknown as LightUpdateWorld, edit.x, edit.y, edit.z);
    });
    const after = now();
    latencies.push(Math.max(0, after - before));
    applied++;
  }

  const mean = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const entry: LightBudgetEntry = {
    dimension: 'edit-pass',
    budget: cfg.maxEditMeanMillis,
    actual: mean,
    withinBudget: withinLatency(cfg.maxEditMeanMillis, mean),
  };
  return { withinBudget: entry.withinBudget, entries: [entry], fullPassVisits: 0, editVisits: visits };
}
