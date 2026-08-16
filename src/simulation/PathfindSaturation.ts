/**
 * Pathfinding saturation harness (238, pathfinding-saturation). Drives bounded A* (135 `findPath`
 * over 134 `NavigationGridQuery`) at worst-case volume over a fixed world: runs `iterations` searches,
 * measures per-search latency with an injectable clock, tracks the max node expansions, and evaluates
 * a mean-latency budget while enforcing the `maxExpansions` cap. Pure and headless-safe.
 */
import { findPath, type PathNode } from './AStarPathfinding';
import type { NavigationWorld } from './NavigationGridQuery';

/** Budget thresholds for pathfinding saturation. */
export interface PathfindSaturationConfig {
  /** Hard cap on node expansions per search (135 default 2048). */
  maxExpansions: number;
  /** Budget: mean per-search latency, in milliseconds. */
  maxMeanSearchMillis: number;
  /** Number of searches measured. */
  iterations: number;
}

/** One dimension of a pathfinding saturation budget evaluation. */
export interface PathfindBudgetEntry {
  dimension: 'latency';
  budget: number;
  actual: number;
  withinBudget: boolean;
}

/** The verdict of a pathfinding saturation run or standalone evaluation. */
export interface PathfindSaturationReport {
  withinBudget: boolean;
  latency: PathfindBudgetEntry;
  /** Largest `expanded` observed across the searches (must be ≤ `maxExpansions`). */
  maxExpanded: number;
}

const CONFIG_FIELDS: readonly (keyof PathfindSaturationConfig)[] = [
  'maxExpansions',
  'maxMeanSearchMillis',
  'iterations',
];

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Validate an unknown value as `PathfindSaturationConfig`. Throws a descriptive error naming the
 * field for any non-positive/non-finite/non-numeric value or non-object input.
 */
export function validatePathfindSaturationConfig(input: unknown): PathfindSaturationConfig {
  if (typeof input !== 'object' || input === null) {
    throw new Error('PathfindSaturationConfig: must be an object');
  }
  const r = input as Record<string, unknown>;
  for (const field of CONFIG_FIELDS) {
    if (!isPositiveFinite(r[field])) {
      throw new Error(`PathfindSaturationConfig: ${field} must be a positive finite number, got ${String(r[field])}`);
    }
  }
  return input as PathfindSaturationConfig;
}

function withinLatency(budget: number, actual: number): boolean {
  if (typeof actual !== 'number' || !Number.isFinite(actual) || actual < 0) return false;
  return actual <= budget;
}

/**
 * Evaluate the measured mean latency and max expansions against the budget. The latency dimension is
 * within iff `actual <= budget`; the overall verdict additionally requires `maxExpanded <=
 * maxExpansions`.
 */
export function evaluatePathfindSaturation(
  config: PathfindSaturationConfig,
  actual: { meanSearchMillis: number; maxExpanded: number },
): PathfindSaturationReport {
  const cfg = validatePathfindSaturationConfig(config);
  const latency: PathfindBudgetEntry = {
    dimension: 'latency',
    budget: cfg.maxMeanSearchMillis,
    actual: actual.meanSearchMillis,
    withinBudget: withinLatency(cfg.maxMeanSearchMillis, actual.meanSearchMillis),
  };
  const expansionWithin = actual.maxExpanded <= cfg.maxExpansions;
  return { withinBudget: latency.withinBudget && expansionWithin, latency, maxExpanded: actual.maxExpanded };
}

/**
 * Run `iterations` bounded searches over the fixed world (start → goal) with `maxExpansions`, time
 * each with the injectable clock, track the max `expanded`, and evaluate the mean-latency budget. A
 * non-standable start yields `null` per 135 and contributes 0 expansions.
 */
export function runPathfindSaturation(
  world: NavigationWorld,
  start: PathNode,
  goal: PathNode,
  config: PathfindSaturationConfig,
  now: () => number,
): PathfindSaturationReport {
  const cfg = validatePathfindSaturationConfig(config);
  const latencies: number[] = [];
  let maxExpanded = 0;

  for (let i = 0; i < cfg.iterations; i++) {
    const before = now();
    const result = findPath(world, start, goal, {
      height: 2,
      maxExpansions: cfg.maxExpansions,
      isCancelled: () => false,
    });
    const after = now();
    latencies.push(Math.max(0, after - before));
    if (result !== null) maxExpanded = Math.max(maxExpanded, result.expanded);
  }

  const mean = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  return evaluatePathfindSaturation(cfg, { meanSearchMillis: mean, maxExpanded });
}
