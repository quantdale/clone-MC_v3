/**
 * Multi-client load-test harness (236).
 *
 * Pure headless composition of one authoritative `WorldTickProcess` plus `N` client sessions
 * (each bundling a `ConnectionLifecycle`, a `ChunkStreamManager`, a per-connection
 * `EntityReplicationManager` + `ClientEntityStore`, and an `InventoryTransactionValidator` +
 * `ClientInventoryReconciler`). `step`/`stepTo` advance the world exactly `ticks` fixed ticks
 * and after every world tick consume each client in a fixed order (ascending session index;
 * within a client chunks -> entities -> inventory), recording per-client per-tick load
 * metrics. `update` drives the same pipeline through the process clock, so scripted
 * timestamps make timing machine-independent.
 *
 * Scenario inputs are harness-owned so a run is fully replayable (055 conventions): every
 * `step`/`update`/`setClientCenter`/`putClientSnapshot`/`queueClientTransaction` operation is
 * logged, `snapshot()` captures the log, and `restore()` resets every component (through their
 * documented `reset()` hooks and re-seeding) and replays the log — restore-then-step equals a
 * fresh run. The consumed components are reached only through their existing public APIs; no
 * 224/225/226/229/231 module is modified.
 *
 * `MultiClientBudgets` + `validateMultiClientBudgets` + `evaluateMultiClientBudgets` mirror the
 * 075 render-budget pattern (boundary equality within budget; non-finite/negative actuals
 * violate). Strict `MultiClientHarness: <detail>` / `MultiClientBudgets: <detail>` validation,
 * no DOM/IO.
 */

import { SimulationClock } from '../engine/SimulationClock';
import { WorldTickProcess, type TickSystem } from './WorldTickProcess';
import {
  ChunkStreamManager,
  type ChunkSnapshot,
  type InterestDelta,
} from './ChunkStreaming';
import {
  ClientEntityStore,
  EntityReplicationManager,
  type EntityPosition,
  type EntitySpawnDescriptor,
} from './EntityReplication';
import {
  ClientInventoryReconciler,
  InventoryTransactionValidator,
  type InventoryTransaction,
  type ItemStack,
} from './InventoryTransactionNetworking';
import { ConnectionLifecycle } from './ConnectionLifecycle';

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

/** Per-session configuration, identical for every client of a scenario. */
export interface MultiClientSessionConfig {
  /** Chebyshev chunk interest radius in columns; positive integer. */
  readonly viewDistance: number;
  /** Entity tracking radius in blocks; positive finite (default 64). */
  readonly trackingRange?: number;
  /** Inventory window slot count; positive integer. */
  readonly windowSlots: number;
  /** Chunk snapshot store bound; positive integer (default 1024). */
  readonly maxSnapshots?: number;
  /** Entity pool bound; positive integer (default 1024). */
  readonly maxTracked?: number;
}

export interface MultiClientScenarioOptions {
  /** Number of client sessions; positive integer. */
  readonly clientCount: number;
  /** Identical per-session configuration. */
  readonly config: MultiClientSessionConfig;
  /** Entities seeded into every client's server-side manager (default 0). */
  readonly serverEntityCount?: number;
  /** `SimulationClock` tick cap (default 10). */
  readonly maxTicksPerFrame?: number;
  /** Injected clock for the scripted deterministic path (default fresh clock). */
  readonly clock?: SimulationClock;
  /**
   * World systems ticked by the authoritative process. A factory receives the constructed
   * client sessions, so scenario systems can drive per-tick entity churn (or throw) through
   * `entityServer`.
   */
  readonly systems?:
    | readonly TickSystem[]
    | ((clients: readonly ClientSession[]) => readonly TickSystem[]);
}

/** One simulated client session: per-connection state for every consumed sub-protocol. */
export interface ClientSession {
  readonly index: number;
  readonly connection: ConnectionLifecycle;
  readonly chunks: ChunkStreamManager;
  readonly entityServer: EntityReplicationManager;
  readonly entityClient: ClientEntityStore;
  readonly inventory: InventoryTransactionValidator;
  readonly reconciler: ClientInventoryReconciler;
}

/** Per-client, per-tick load counters. */
export interface ClientTickMetrics {
  readonly chunkAdded: number;
  readonly chunkUpdated: number;
  readonly chunkRemoved: number;
  readonly entitySpawned: number;
  readonly entityDespawned: number;
  readonly entityTransforms: number;
  readonly entityTrackedData: number;
  readonly inventoryAccepted: number;
  readonly inventoryRejected: number;
  readonly inventoryMutations: number;
}

/** A recorded per-client counter set plus the authoritative tick it was consumed at. */
export interface ClientTickRecord {
  readonly tick: number;
  readonly metrics: ClientTickMetrics;
}

/** Summed counters over a run (per client or across clients). */
export interface ClientTickTotals {
  readonly chunkAdded: number;
  readonly chunkUpdated: number;
  readonly chunkRemoved: number;
  readonly entitySpawned: number;
  readonly entityDespawned: number;
  readonly entityTransforms: number;
  readonly entityTrackedData: number;
  readonly inventoryAccepted: number;
  readonly inventoryRejected: number;
  readonly inventoryMutations: number;
}

/** Per-client-tick maxima over the run, used to build `MultiClientLoadMetrics`. */
export interface MultiClientPerTickMaxes {
  readonly chunkAdded: number;
  readonly entitySpawned: number;
  /** Max of `inventoryAccepted + inventoryRejected` over client-ticks. */
  readonly inventoryAcceptedRejected: number;
}

/** One operation of the harness operation log. */
export type HarnessOperation =
  | { readonly kind: 'step'; readonly ticks: number }
  | { readonly kind: 'update'; readonly nowMs: number }
  | { readonly kind: 'setCenter'; readonly client: number; readonly x: number; readonly z: number }
  | {
      readonly kind: 'setEntityCenter';
      readonly client: number;
      readonly x: number;
      readonly y: number;
      readonly z: number;
    }
  | { readonly kind: 'putSnapshot'; readonly client: number; readonly snapshot: ChunkSnapshot }
  | { readonly kind: 'queueTransaction'; readonly client: number; readonly tx: InventoryTransaction };

/** Log-based replay snapshot of the harness (055 conventions). */
export interface MultiClientHarnessSnapshot {
  readonly tick: number;
  readonly log: readonly HarnessOperation[];
}

/** Validated budget ceilings for the multi-client load fixtures. */
export interface MultiClientBudgets {
  /** Minimum sustained ticks/sec over the canonical run (wall clock). */
  readonly minTicksPerSecond: number;
  /** Maximum wall time for the canonical run, ms. */
  readonly maxElapsedMsForTicks: number;
  /** Maximum per-client-tick chunk `added` count (interest size). */
  readonly maxChunkAddedPerClient: number;
  /** Maximum per-client-tick entity `spawned` count (in-range tracked count). */
  readonly maxEntitySpawnedPerClient: number;
  /** Maximum per-client-tick inventory `accepted + rejected` count (queued transactions). */
  readonly maxInventoryAcceptedPerClient: number;
}

/** Measured actuals evaluated against a `MultiClientBudgets` contract. */
export interface MultiClientLoadMetrics {
  readonly sustainedTicksPerSecond: number;
  readonly elapsedMs: number;
  readonly maxChunkAddedPerClientTick: number;
  readonly maxEntitySpawnedPerClientTick: number;
  /** Max `accepted + rejected` over client-ticks. */
  readonly maxInventoryAcceptedPerClientTick: number;
}

/** One dimension of a budget evaluation. */
export interface MultiClientBudgetEntry {
  readonly dimension: keyof MultiClientBudgets;
  readonly budget: number;
  readonly actual: number;
  readonly withinBudget: boolean;
}

/** The full evaluation verdict: per dimension plus overall. */
export interface MultiClientBudgetReport {
  readonly withinBudget: boolean;
  readonly entries: MultiClientBudgetEntry[];
}

/** A named fixture scenario preset (data constants; tests attach systems/scripts). */
export interface MultiClientScenarioPreset {
  readonly name: string;
  readonly options: MultiClientScenarioOptions;
  readonly ticks: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Named fixture scenarios
// ────────────────────────────────────────────────────────────────────────────

/** Canonical load scenario: 4 clients, view distance 4 (81 columns), 1024 entities,
 *  40-slot windows, 1200 ticks; sustained >= 200 ticks/sec and <= 6000 ms wall time. */
export const BASELINE_LOAD: MultiClientScenarioPreset = {
  name: 'BASELINE_LOAD',
  options: {
    clientCount: 4,
    config: { viewDistance: 4, windowSlots: 40 },
    serverEntityCount: 1024,
  },
  ticks: 1200,
};

/** Chunk-churn scenario: 4 clients, view distance 6 (169 columns), moving centers. */
export const CHUNK_STRESS: MultiClientScenarioPreset = {
  name: 'CHUNK_STRESS',
  options: {
    clientCount: 4,
    config: { viewDistance: 6, windowSlots: 40, maxSnapshots: 512 },
    serverEntityCount: 256,
  },
  ticks: 2000,
};

/** Entity-churn scenario: 4 clients whose centers sweep entities in and out of range. */
export const ENTITY_CHURN: MultiClientScenarioPreset = {
  name: 'ENTITY_CHURN',
  options: {
    clientCount: 4,
    config: { viewDistance: 4, windowSlots: 40, maxTracked: 512 },
    serverEntityCount: 512,
  },
  ticks: 2000,
};

/** Inventory-burst scenario: 4 clients with dense queued transaction bursts. */
export const INVENTORY_BURST: MultiClientScenarioPreset = {
  name: 'INVENTORY_BURST',
  options: {
    clientCount: 4,
    config: { viewDistance: 4, windowSlots: 40 },
    serverEntityCount: 128,
  },
  ticks: 1000,
};

/** Default budgets for the `BASELINE_LOAD` canonical scenario (075 convention). */
export const DEFAULT_BASELINE_BUDGETS: MultiClientBudgets = {
  minTicksPerSecond: 200,
  maxElapsedMsForTicks: 6000,
  maxChunkAddedPerClient: 81,
  maxEntitySpawnedPerClient: 1024,
  maxInventoryAcceptedPerClient: 64,
};

// ────────────────────────────────────────────────────────────────────────────
// Validation helpers (MultiClientHarness: <detail>)
// ────────────────────────────────────────────────────────────────────────────

function fail(detail: string): never {
  throw new Error(`MultiClientHarness: ${detail}`);
}

function requireNonNegSafeInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function requirePositiveInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    fail(`${label} must be a positive safe integer`);
  }
  return value;
}

function requirePositiveFinite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail(`${label} must be a positive finite number`);
  }
  return value;
}

function isTickSystem(value: unknown): value is TickSystem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TickSystem).tick === 'function'
  );
}

function validateConfig(input: unknown): MultiClientSessionConfig {
  if (typeof input !== 'object' || input === null) {
    fail('config must be an object');
  }
  const c = input as Record<string, unknown>;
  let out: MultiClientSessionConfig = {
    viewDistance: requirePositiveInt(c.viewDistance, 'config.viewDistance'),
    windowSlots: requirePositiveInt(c.windowSlots, 'config.windowSlots'),
  };
  if (c.trackingRange !== undefined) {
    out = { ...out, trackingRange: requirePositiveFinite(c.trackingRange, 'config.trackingRange') };
  }
  if (c.maxSnapshots !== undefined) {
    out = { ...out, maxSnapshots: requirePositiveInt(c.maxSnapshots, 'config.maxSnapshots') };
  }
  if (c.maxTracked !== undefined) {
    out = { ...out, maxTracked: requirePositiveInt(c.maxTracked, 'config.maxTracked') };
  }
  return out;
}

function validateOptions(input: unknown): MultiClientScenarioOptions {
  if (typeof input !== 'object' || input === null) {
    fail('options must be an object');
  }
  const o = input as Record<string, unknown>;
  const clientCount = requirePositiveInt(o.clientCount, 'clientCount');
  const config = validateConfig(o.config);
  let out: MultiClientScenarioOptions = { clientCount, config };
  if (o.serverEntityCount !== undefined) {
    out = { ...out, serverEntityCount: requirePositiveInt(o.serverEntityCount, 'serverEntityCount') };
  }
  if (o.maxTicksPerFrame !== undefined) {
    out = { ...out, maxTicksPerFrame: requirePositiveInt(o.maxTicksPerFrame, 'maxTicksPerFrame') };
  }
  if (o.clock !== undefined) {
    const clock = o.clock as Record<string, unknown>;
    if (typeof clock !== 'object' || clock === null) {
      fail('clock must provide callable update and reset');
    }
    if (typeof clock.update !== 'function' || typeof clock.reset !== 'function') {
      fail('clock must provide callable update and reset');
    }
    out = { ...out, clock: o.clock as SimulationClock };
  }
  if (o.systems !== undefined) {
    const systems = o.systems;
    if (typeof systems === 'function') {
      out = {
        ...out,
        systems: systems as (clients: readonly ClientSession[]) => readonly TickSystem[],
      };
    } else if (Array.isArray(systems)) {
      for (let i = 0; i < systems.length; i++) {
        if (!isTickSystem(systems[i])) {
          fail(`systems ${i} must have a callable tick`);
        }
      }
      out = { ...out, systems: [...systems] as readonly TickSystem[] };
    } else {
      fail('systems must be an array or a function of the clients');
    }
  }
  return out;
}

function requireClientIndex(value: unknown, clientCount: number): number {
  const idx = requireNonNegSafeInt(value, 'clientIndex');
  if (idx >= clientCount) {
    fail(`clientIndex must be in [0, ${clientCount})`);
  }
  return idx;
}

const TRANSACTION_TYPES = new Set(['slot_click', 'hotbar_swap', 'drop', 'drag']);

function validateTransactionShape(tx: unknown): void {
  if (typeof tx !== 'object' || tx === null) {
    fail('transaction must be an object');
  }
  const t = tx as Record<string, unknown>;
  if (typeof t.type !== 'string' || !TRANSACTION_TYPES.has(t.type)) {
    fail('transaction type must be slot_click, hotbar_swap, drop, or drag');
  }
  requireNonNegSafeInt(t.stateId, 'transaction.stateId');
  if (t.windowId !== undefined) {
    requireNonNegSafeInt(t.windowId, 'transaction.windowId');
  }
  if (t.type === 'slot_click' || t.type === 'drag') {
    if (t.button !== 'left' && t.button !== 'right') {
      fail('transaction button must be left or right');
    }
  }
  if (t.type === 'drag') {
    if (t.phase !== 'start' && t.phase !== 'add' && t.phase !== 'end') {
      fail('drag phase must be start, add, or end');
    }
  }
  if (t.type === 'hotbar_swap') {
    requireNonNegSafeInt(t.hotbarSlot, 'transaction.hotbarSlot');
  }
  if (t.type === 'drop') {
    if (typeof t.whole !== 'boolean') {
      fail('transaction.whole must be a boolean');
    }
  }
}

function validateSnapshotEnvelope(snapshot: unknown): void {
  if (typeof snapshot !== 'object' || snapshot === null) {
    fail('snapshot must be an object');
  }
  const s = snapshot as Record<string, unknown>;
  if (typeof s.key !== 'string' || !Number.isInteger(s.x) || !Number.isInteger(s.z)) {
    fail('snapshot key/coordinates must be present');
  }
  requireNonNegSafeInt(s.tick, 'snapshot.tick');
  if (!Array.isArray(s.sections) || s.sections.length === 0) {
    fail('snapshot sections must be a non-empty array');
  }
}

function isHarnessOperation(value: unknown): value is HarnessOperation {
  if (typeof value !== 'object' || value === null) return false;
  const op = value as Record<string, unknown>;
  switch (op.kind) {
    case 'step':
      return typeof op.ticks === 'number' && Number.isSafeInteger(op.ticks) && (op.ticks as number) > 0;
    case 'update':
      return typeof op.nowMs === 'number' && Number.isFinite(op.nowMs);
    case 'setCenter':
      return (
        typeof op.client === 'number' &&
        Number.isInteger(op.x) &&
        Number.isInteger(op.z)
      );
    case 'setEntityCenter':
      return (
        typeof op.client === 'number' &&
        Number.isFinite(op.x) &&
        Number.isFinite(op.y) &&
        Number.isFinite(op.z)
      );
    case 'putSnapshot':
      return typeof op.client === 'number';
    case 'queueTransaction':
      return typeof op.client === 'number';
    default:
      return false;
  }
}

function isHarnessSnapshot(value: unknown, clientCount: number): value is MultiClientHarnessSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  if (typeof s.tick !== 'number' || !Number.isSafeInteger(s.tick) || (s.tick as number) < 0) {
    return false;
  }
  if (!Array.isArray(s.log)) return false;
  for (const op of s.log) {
    if (!isHarnessOperation(op)) return false;
    const record = op as Record<string, unknown>;
    if (record.kind === 'setCenter' || record.kind === 'setEntityCenter' || record.kind === 'putSnapshot' || record.kind === 'queueTransaction') {
      if (
        typeof record.client !== 'number' ||
        !Number.isSafeInteger(record.client) ||
        (record.client as number) < 0 ||
        (record.client as number) >= clientCount
      ) {
        return false;
      }
    }
    if (record.kind === 'putSnapshot') {
      try {
        validateSnapshotEnvelope(record.snapshot);
      } catch {
        return false;
      }
    }
    if (record.kind === 'queueTransaction') {
      try {
        validateTransactionShape(record.tx);
      } catch {
        return false;
      }
    }
  }
  return true;
}

/** Deterministic entity placement shared by the harness seeding and the fixtures: an 8x8
 *  grid in x/z (each axis in [-14, 14]) with y = floor(index / 64) * 3. Every index < 1024
 *  lies within trackingRange 64 of the origin, so a client centered at the origin
 *  replicates all of them. */
export function scenarioEntityPosition(index: number): EntityPosition {
  requireNonNegSafeInt(index, 'entity index');
  const x = (((index % 8) as number) - 3.5) * 4;
  const z = ((Math.floor(index / 8) % 8) - 3.5) * 4;
  const y = Math.floor(index / 64) * 3;
  return { x, y, z };
}

function scenarioEntity(index: number): EntitySpawnDescriptor {
  return { id: index, type: 'load_entity', position: scenarioEntityPosition(index) };
}

// ────────────────────────────────────────────────────────────────────────────
// MultiClientMetricsCollector
// ────────────────────────────────────────────────────────────────────────────

const EMPTY_TOTALS: ClientTickTotals = {
  chunkAdded: 0,
  chunkUpdated: 0,
  chunkRemoved: 0,
  entitySpawned: 0,
  entityDespawned: 0,
  entityTransforms: 0,
  entityTrackedData: 0,
  inventoryAccepted: 0,
  inventoryRejected: 0,
  inventoryMutations: 0,
};

function validateClientMetrics(metrics: unknown): ClientTickMetrics {
  if (typeof metrics !== 'object' || metrics === null) {
    fail('metrics must be an object');
  }
  const m = metrics as Record<string, unknown>;
  const out: ClientTickMetrics = {
    chunkAdded: requireNonNegSafeInt(m.chunkAdded, 'metrics.chunkAdded'),
    chunkUpdated: requireNonNegSafeInt(m.chunkUpdated, 'metrics.chunkUpdated'),
    chunkRemoved: requireNonNegSafeInt(m.chunkRemoved, 'metrics.chunkRemoved'),
    entitySpawned: requireNonNegSafeInt(m.entitySpawned, 'metrics.entitySpawned'),
    entityDespawned: requireNonNegSafeInt(m.entityDespawned, 'metrics.entityDespawned'),
    entityTransforms: requireNonNegSafeInt(m.entityTransforms, 'metrics.entityTransforms'),
    entityTrackedData: requireNonNegSafeInt(m.entityTrackedData, 'metrics.entityTrackedData'),
    inventoryAccepted: requireNonNegSafeInt(m.inventoryAccepted, 'metrics.inventoryAccepted'),
    inventoryRejected: requireNonNegSafeInt(m.inventoryRejected, 'metrics.inventoryRejected'),
    inventoryMutations: requireNonNegSafeInt(m.inventoryMutations, 'metrics.inventoryMutations'),
  };
  return out;
}

function addTotals(a: ClientTickTotals, b: ClientTickTotals): ClientTickTotals {
  return {
    chunkAdded: a.chunkAdded + b.chunkAdded,
    chunkUpdated: a.chunkUpdated + b.chunkUpdated,
    chunkRemoved: a.chunkRemoved + b.chunkRemoved,
    entitySpawned: a.entitySpawned + b.entitySpawned,
    entityDespawned: a.entityDespawned + b.entityDespawned,
    entityTransforms: a.entityTransforms + b.entityTransforms,
    entityTrackedData: a.entityTrackedData + b.entityTrackedData,
    inventoryAccepted: a.inventoryAccepted + b.inventoryAccepted,
    inventoryRejected: a.inventoryRejected + b.inventoryRejected,
    inventoryMutations: a.inventoryMutations + b.inventoryMutations,
  };
}

/** Aggregates per-client, per-tick load counters; validates every recorded value. */
export class MultiClientMetricsCollector {
  private readonly clientCount: number;
  private readonly records: { tick: number; metrics: ClientTickMetrics }[][];

  constructor(clientCount: number) {
    this.clientCount = requirePositiveInt(clientCount, 'clientCount');
    this.records = [];
    for (let i = 0; i < this.clientCount; i++) {
      this.records.push([]);
    }
  }

  /** Record one client-tick counter set. All values validated before any mutation. */
  recordClientTick(clientIndex: number, tick: number, metrics: ClientTickMetrics): void {
    const idx = requireClientIndex(clientIndex, this.clientCount);
    const t = requireNonNegSafeInt(tick, 'tick');
    const validated = validateClientMetrics(metrics);
    this.records[idx]!.push({ tick: t, metrics: validated });
  }

  /** The per-client recorded observation sequence (defensive copies), oldest tick first. */
  clientTickRecords(clientIndex: number): readonly ClientTickRecord[] {
    const idx = requireClientIndex(clientIndex, this.clientCount);
    return this.records[idx]!.map((r) => ({ tick: r.tick, metrics: { ...r.metrics } }));
  }

  /** Summed counters for one client over the whole run. */
  clientTotals(clientIndex: number): ClientTickTotals {
    const idx = requireClientIndex(clientIndex, this.clientCount);
    let total = { ...EMPTY_TOTALS };
    for (const r of this.records[idx]!) {
      total = addTotals(total, r.metrics);
    }
    return total;
  }

  /** Summed counters across every client over the whole run. */
  totals(): ClientTickTotals {
    let total = { ...EMPTY_TOTALS };
    for (let i = 0; i < this.clientCount; i++) {
      total = addTotals(total, this.clientTotals(i));
    }
    return total;
  }

  /** Maxima over every client-tick, for building `MultiClientLoadMetrics`. */
  perClientTickMaxes(): MultiClientPerTickMaxes {
    let chunkAdded = 0;
    let entitySpawned = 0;
    let inventoryAcceptedRejected = 0;
    for (let i = 0; i < this.clientCount; i++) {
      for (const r of this.records[i]!) {
        if (r.metrics.chunkAdded > chunkAdded) chunkAdded = r.metrics.chunkAdded;
        if (r.metrics.entitySpawned > entitySpawned) entitySpawned = r.metrics.entitySpawned;
        const acceptedRejected = r.metrics.inventoryAccepted + r.metrics.inventoryRejected;
        if (acceptedRejected > inventoryAcceptedRejected) {
          inventoryAcceptedRejected = acceptedRejected;
        }
      }
    }
    return { chunkAdded, entitySpawned, inventoryAcceptedRejected };
  }

  /** Clear every recorded counter. */
  reset(): void {
    for (let i = 0; i < this.clientCount; i++) {
      this.records[i]!.length = 0;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Budget validation and evaluation
// ────────────────────────────────────────────────────────────────────────────

const BUDGET_DIMENSIONS: readonly (keyof MultiClientBudgets)[] = [
  'minTicksPerSecond',
  'maxElapsedMsForTicks',
  'maxChunkAddedPerClient',
  'maxEntitySpawnedPerClient',
  'maxInventoryAcceptedPerClient',
];

const METRIC_KEYS: Record<keyof MultiClientBudgets, keyof MultiClientLoadMetrics> = {
  minTicksPerSecond: 'sustainedTicksPerSecond',
  maxElapsedMsForTicks: 'elapsedMs',
  maxChunkAddedPerClient: 'maxChunkAddedPerClientTick',
  maxEntitySpawnedPerClient: 'maxEntitySpawnedPerClientTick',
  maxInventoryAcceptedPerClient: 'maxInventoryAcceptedPerClientTick',
};

/** Dimensions where the actual is a floor (`actual >= budget`); the rest are ceilings. */
const INVERTED_DIMENSIONS: ReadonlySet<keyof MultiClientBudgets> = new Set(['minTicksPerSecond']);

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Validate an unknown value as `MultiClientBudgets`. Returns the same value (narrowed) on
 *  success; throws a descriptive `MultiClientBudgets:` error naming the offending field. */
export function validateMultiClientBudgets(input: unknown): MultiClientBudgets {
  if (typeof input !== 'object' || input === null) {
    throw new Error('MultiClientBudgets: must be an object');
  }
  const r = input as Record<string, unknown>;
  for (const dimension of BUDGET_DIMENSIONS) {
    if (!isPositiveFinite(r[dimension])) {
      throw new Error(
        `MultiClientBudgets: ${dimension} must be a positive finite number, got ${String(r[dimension])}`,
      );
    }
  }
  return r as unknown as MultiClientBudgets;
}

function withinBudget(dimension: keyof MultiClientBudgets, budget: number, actual: number): boolean {
  if (typeof actual !== 'number' || !Number.isFinite(actual) || actual < 0) return false;
  return INVERTED_DIMENSIONS.has(dimension) ? actual >= budget : actual <= budget;
}

/** Evaluate measured load metrics against the budget contract. Malformed actuals (non-finite
 *  or negative) violate their dimension; the overall verdict is within only when every
 *  dimension is. */
export function evaluateMultiClientBudgets(
  budgets: MultiClientBudgets,
  actual: MultiClientLoadMetrics,
): MultiClientBudgetReport {
  const entries: MultiClientBudgetEntry[] = BUDGET_DIMENSIONS.map((dimension) => {
    const measured = actual[METRIC_KEYS[dimension]];
    return {
      dimension,
      budget: budgets[dimension],
      actual: measured,
      withinBudget: withinBudget(dimension, budgets[dimension], measured),
    };
  });
  return { withinBudget: entries.every((entry) => entry.withinBudget), entries };
}

// ────────────────────────────────────────────────────────────────────────────
// MultiClientHarness
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_TRACKING_RANGE = 64;
const DEFAULT_MAX_SNAPSHOTS = 1024;
const DEFAULT_MAX_TRACKED = 1024;
const DEFAULT_MAX_TICKS_PER_FRAME = 10;

/** Composition base of one authoritative world process plus N client sessions. */
export class MultiClientHarness {
  private readonly options: MultiClientScenarioOptions;
  private readonly process_: WorldTickProcess;
  private readonly clients_: ClientSession[] = [];
  private readonly metrics_: MultiClientMetricsCollector;
  private readonly queues: InventoryTransaction[][] = [];
  private readonly log: HarnessOperation[] = [];
  private readonly initialWindow: (ItemStack | null)[];

  constructor(options: MultiClientScenarioOptions) {
    const validated = validateOptions(options);
    this.options = validated;
    const config = validated.config;
    const clientCount = validated.clientCount;
    const entityCount = validated.serverEntityCount ?? 0;
    const trackingRange = config.trackingRange ?? DEFAULT_TRACKING_RANGE;
    const maxTracked = config.maxTracked ?? DEFAULT_MAX_TRACKED;
    const maxSnapshots = config.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS;
    this.initialWindow = new Array<null>(config.windowSlots).fill(null);

    for (let i = 0; i < clientCount; i++) {
      const connection = new ConnectionLifecycle();
      connection.connect(`client-${i}`);
      connection.connected();
      connection.handshakeAccepted(`client-${i}`);
      const chunks = new ChunkStreamManager({ viewDistance: config.viewDistance, maxSnapshots });
      const entityServer = new EntityReplicationManager({ trackingRange, maxTracked });
      for (let e = 0; e < entityCount; e++) {
        entityServer.upsertEntity(scenarioEntity(e));
      }
      const entityClient = new ClientEntityStore();
      const inventory = new InventoryTransactionValidator({ slots: this.initialWindow });
      const reconciler = new ClientInventoryReconciler();
      this.clients_.push({
        index: i,
        connection,
        chunks,
        entityServer,
        entityClient,
        inventory,
        reconciler,
      });
      this.queues.push([]);
    }

    const systemsInput = validated.systems;
    const systems =
      typeof systemsInput === 'function'
        ? systemsInput(this.clients_)
        : (systemsInput ?? []);
    if (!Array.isArray(systems)) {
      fail('systems factory must return an array');
    }
    for (let i = 0; i < systems.length; i++) {
      if (!isTickSystem(systems[i])) {
        fail(`systems ${i} must have a callable tick`);
      }
    }

    const clock =
      validated.clock ?? new SimulationClock({ maxTicksPerFrame: validated.maxTicksPerFrame ?? DEFAULT_MAX_TICKS_PER_FRAME });
    this.process_ = new WorldTickProcess({ systems, clock });
    this.metrics_ = new MultiClientMetricsCollector(clientCount);
  }

  /** The authoritative world process. */
  get process(): WorldTickProcess {
    return this.process_;
  }

  /** The client sessions, ascending index order. */
  get clients(): readonly ClientSession[] {
    return this.clients_;
  }

  /** The load-metric collector. */
  get metrics(): MultiClientMetricsCollector {
    return this.metrics_;
  }

  /**
   * Advance exactly `ticks` world ticks; after every world tick every client consumes its
   * chunk updates, entity batch, and queued inventory transactions in fixed order and the
   * collector records per-client counters. Non-integer or `<= 0` ticks is a no-op returning 0.
   * Rethrows any system failure after stopping the process (the failed tick is uncounted and
   * no client consumes it).
   */
  step(ticks: number): number {
    if (!Number.isSafeInteger(ticks) || ticks <= 0) return 0;
    this.log.push({ kind: 'step', ticks });
    for (let i = 0; i < ticks; i++) {
      this.process_.step(1);
      this.consumeTick(this.process_.tick);
    }
    return ticks;
  }

  /**
   * Feed one wall-clock timestamp through the process clock (scripted timestamps give
   * deterministic timing). Consumes and records every emitted tick in fixed order. Returns
   * the number of ticks run.
   */
  update(nowMs: number): number {
    if (!Number.isFinite(nowMs)) return 0;
    this.log.push({ kind: 'update', nowMs });
    const before = this.process_.tick;
    const emitted = this.process_.update(nowMs);
    const after = this.process_.tick;
    for (let t = before + 1; t <= after; t++) {
      this.consumeTick(t);
    }
    return emitted;
  }

  /**
   * Bounded condition stepping (055-style): step until `process.tick >= targetTick` or
   * `maxSteps` ticks were taken. Returns the number of steps taken.
   */
  stepTo(targetTick: number, maxSteps: number): number {
    const target = requireNonNegSafeInt(targetTick, 'targetTick');
    const max = requirePositiveInt(maxSteps, 'maxSteps');
    let steps = 0;
    while (this.process_.tick < target && steps < max) {
      this.step(1);
      steps++;
    }
    return steps;
  }

  /** Move a client's chunk interest center (logged scenario input). Returns the key-sorted
   *  entered/left delta of this move (226 semantics). */
  setClientCenter(clientIndex: number, x: number, z: number): InterestDelta {
    const idx = requireClientIndex(clientIndex, this.clients_.length);
    const delta = this.clients_[idx]!.chunks.setCenter(x, z);
    this.log.push({ kind: 'setCenter', client: idx, x, z });
    return delta;
  }

  /** Move a client's entity tracking center (logged scenario input). */
  setClientEntityCenter(clientIndex: number, x: number, y: number, z: number): void {
    const idx = requireClientIndex(clientIndex, this.clients_.length);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      fail('entity center coordinates must be finite numbers');
    }
    this.clients_[idx]!.entityServer.setCenter(x, y, z);
    this.log.push({ kind: 'setEntityCenter', client: idx, x, y, z });
  }

  /** Store a chunk snapshot for a client (logged scenario input). */
  putClientSnapshot(clientIndex: number, snapshot: ChunkSnapshot): void {
    const idx = requireClientIndex(clientIndex, this.clients_.length);
    this.clients_[idx]!.chunks.putSnapshot(snapshot);
    this.log.push({ kind: 'putSnapshot', client: idx, snapshot });
  }

  /** Append a transaction to a client's per-session queue, drained at the next consume
   *  pass (logged scenario input). Full 231 validation happens at drain time. */
  queueClientTransaction(clientIndex: number, tx: InventoryTransaction): void {
    const idx = requireClientIndex(clientIndex, this.clients_.length);
    validateTransactionShape(tx);
    this.queues[idx]!.push(tx);
    this.log.push({ kind: 'queueTransaction', client: idx, tx });
  }

  /** The number of transactions queued (not yet drained) for a client. */
  queuedTransactionCount(clientIndex: number): number {
    const idx = requireClientIndex(clientIndex, this.clients_.length);
    return this.queues[idx]!.length;
  }

  /** Capture the operation log for deterministic replay. */
  snapshot(): MultiClientHarnessSnapshot {
    const log: HarnessOperation[] = this.log.map((op) => {
      switch (op.kind) {
        case 'step':
          return { kind: 'step', ticks: op.ticks };
        case 'update':
          return { kind: 'update', nowMs: op.nowMs };
        case 'setCenter':
          return { kind: 'setCenter', client: op.client, x: op.x, z: op.z };
        case 'setEntityCenter':
          return { kind: 'setEntityCenter', client: op.client, x: op.x, y: op.y, z: op.z };
        case 'putSnapshot':
          return {
            kind: 'putSnapshot',
            client: op.client,
            snapshot: {
              key: op.snapshot.key,
              x: op.snapshot.x,
              z: op.snapshot.z,
              tick: op.snapshot.tick,
              sections: op.snapshot.sections.map((s) => ({ y: s.y, data: [...s.data] })),
            },
          };
        case 'queueTransaction':
          return { kind: 'queueTransaction', client: op.client, tx: { ...op.tx } };
      }
    });
    return { tick: this.process_.tick, log };
  }

  /**
   * Restore a captured snapshot: validates the whole snapshot first (on rejection the harness
   * is unchanged), then resets every component to its pristine constructed state and replays
   * the captured operation log, so restore-then-step equals a fresh run.
   */
  restore(snapshot: MultiClientHarnessSnapshot): void {
    if (!isHarnessSnapshot(snapshot, this.clients_.length)) {
      fail('malformed harness snapshot');
    }
    this.reset();
    for (const op of snapshot.log) {
      this.applyOperation(op);
    }
    this.log.length = 0;
    for (const op of snapshot.log) {
      this.log.push(op);
    }
  }

  /** Restore the pristine constructed state: process, every client component (connection
   *  re-connected, chunk store/accumulators cleared, entity managers re-seeded, client
   *  stores/inventory/reconciler cleared), collector, queues, and log. */
  reset(): void {
    this.process_.reset();
    const entityCount = this.options.serverEntityCount ?? 0;
    for (const client of this.clients_) {
      client.connection.reset();
      client.connection.connect(`client-${client.index}`);
      client.connection.connected();
      client.connection.handshakeAccepted(`client-${client.index}`);
      client.chunks.reset();
      client.entityServer.reset();
      for (let e = 0; e < entityCount; e++) {
        client.entityServer.upsertEntity(scenarioEntity(e));
      }
      client.entityClient.reset();
      client.inventory.reset(this.initialWindow);
      client.reconciler.reset();
    }
    this.metrics_.reset();
    for (const queue of this.queues) {
      queue.length = 0;
    }
    // NB: open transactions in the queues are scenario inputs; the log is cleared with them.
    this.log.length = 0;
  }

  /** The per-tick consume pass: chunks -> entities -> inventory, per client ascending. */
  private consumeTick(tick: number): void {
    for (const client of this.clients_) {
      const chunkUpdate = client.chunks.pendingUpdates(tick);
      const batch = client.entityServer.collectUpdates(tick);
      client.entityClient.applyBatch(batch);
      const queue = this.queues[client.index]!;
      let accepted = 0;
      let rejected = 0;
      let mutations = 0;
      for (const tx of queue) {
        const result = client.inventory.processTransaction(tx);
        client.reconciler.reconcile(result);
        if (result.accepted) {
          accepted++;
          mutations += result.mutations.length;
        } else {
          rejected++;
        }
      }
      queue.length = 0;
      this.metrics_.recordClientTick(client.index, tick, {
        chunkAdded: chunkUpdate.added.length,
        chunkUpdated: chunkUpdate.updated.length,
        chunkRemoved: chunkUpdate.removed.length,
        entitySpawned: batch.spawned.length,
        entityDespawned: batch.despawned.length,
        entityTransforms: batch.transforms.length,
        entityTrackedData: batch.trackedData.length,
        inventoryAccepted: accepted,
        inventoryRejected: rejected,
        inventoryMutations: mutations,
      });
    }
  }

  /** Execute one operation without logging (used by restore replay). */
  private applyOperation(op: HarnessOperation): void {
    switch (op.kind) {
      case 'step':
        for (let i = 0; i < op.ticks; i++) {
          this.process_.step(1);
          this.consumeTick(this.process_.tick);
        }
        return;
      case 'update': {
        const before = this.process_.tick;
        this.process_.update(op.nowMs);
        const after = this.process_.tick;
        for (let t = before + 1; t <= after; t++) {
          this.consumeTick(t);
        }
        return;
      }
      case 'setCenter':
        this.clients_[op.client]!.chunks.setCenter(op.x, op.z);
        return;
      case 'setEntityCenter':
        this.clients_[op.client]!.entityServer.setCenter(op.x, op.y, op.z);
        return;
      case 'putSnapshot':
        this.clients_[op.client]!.chunks.putSnapshot(op.snapshot);
        return;
      case 'queueTransaction':
        this.queues[op.client]!.push(op.tx);
        return;
    }
  }
}