/**
 * Release performance gate (247): the closed hardware-tier set, the validated per-tier ×
 * per-domain budget matrix over the five measured domains (frame, tick, load, save, network),
 * the pure fail-closed gate evaluation, and the headless canonical-scenario measurement drivers
 * that produce a typed `ReleaseMeasurementBundle`.
 *
 * Evaluation rule (normative resolution): sustained-rate dimensions are MINIMUMS —
 * `minSustainedTicksPerSecond` and `networkSustainedTicksPerSecond` are within budget when
 * `actual >= budget`; every other dimension is a ceiling, within budget when
 * `actual <= budget`. Boundary equality counts as within budget in both directions (075/236
 * convention). A missing, non-numeric, non-finite, or negative actual is a violation in both
 * directions, so a broken measurement can never report a false pass; evaluation is total with
 * respect to bad actuals (it never throws on them). An unknown tier throws before any entry is
 * produced.
 *
 * The three structural network message ceilings are NON-TIERED invariants derived from the 236
 * `BASELINE_LOAD` defaults (4 clients, viewDistance 4 -> 81-column interest, 1024 tracked
 * entities, 40-slot inventory windows): the same value applies to every tier.
 *
 * Measurement drivers are headless and bounded: `CANONICAL_SIM` steps a `WorldTickProcess`
 * (224) 1200 ticks over a 17x17-column world with 64 entity systems; load/save run the 234
 * `ServerSaveLifecycle` against an in-memory timing `SaveLoadBoundary` over the canonical
 * snapshot (~868 units) and dirty set (514 units); frame/network actuals come from synthetic
 * tier-sized bundle builders until the 075 render scenario / 236 harness are wired at
 * verification time. Wall-clock timing here uses `Date.now()` — these are measurement helpers,
 * not simulation state. Pure modules elsewhere are untouched: the gate only consumes existing
 * seams.
 */
import { createWorldSaveCodec, type ServerWorldUnit } from './PersistentWorldCodecs';
import {
  ServerSaveLifecycle,
  type PersistedWorldSnapshot,
  type SaveLoadBoundary,
} from './ServerSaveLifecycle';
import { WorldTickProcess, type TickSystem } from './WorldTickProcess';
import { createDefaultBlockStateRegistry } from '../world/BlockStateRegistry';
import type { SerializedChunkColumn } from '../world/ChunkColumn';
import type { SaveUnit } from '../storage/DirtySaveQueue';
import type { WorldMetadata } from '../storage/WorldMetadata';
import type { PlayerStateRecord } from '../storage/PlayerStateRecord';
import type { BlockEntityChunkRecord } from '../storage/BlockEntityRecord';
import type { EntityChunkRecord } from '../storage/EntityRecord';

// ────────────────────────────────────────────────────────────────────────────
// Tiers and dimensions
// ────────────────────────────────────────────────────────────────────────────

/** A release hardware tier; the closed set is exactly {@link RELEASE_TIERS}. */
export type ReleaseTier = 'Low' | 'Medium' | 'High' | 'Ultra';

/** The closed, fixed-order release tier set. No other value is a legal tier. */
export const RELEASE_TIERS: readonly ReleaseTier[] = ['Low', 'Medium', 'High', 'Ultra'];

export type FrameBudgetDimension =
  | 'maxDrawCalls'
  | 'maxMeshBuildMillis'
  | 'maxFrameTimeMillis'
  | 'maxGeometryMemoryBytes'
  | 'maxRenderDistanceChunks';

export type TickBudgetDimension = 'minSustainedTicksPerSecond' | 'maxCanonicalTickRunMs';

export type LoadBudgetDimension = 'maxLoadMs';

export type SaveBudgetDimension = 'maxSaveFlushMs';

export type NetworkBudgetDimension =
  | 'networkSustainedTicksPerSecond'
  | 'maxNetworkRunMs'
  | 'maxChunkAddedPerClient'
  | 'maxEntitySpawnedPerClient'
  | 'maxInventoryAcceptedPerClient';

export interface ReleaseBudgetConfig {
  frame: Record<ReleaseTier, Record<FrameBudgetDimension, number>>;
  tick: Record<ReleaseTier, Record<TickBudgetDimension, number>>;
  load: Record<ReleaseTier, Record<LoadBudgetDimension, number>>;
  save: Record<ReleaseTier, Record<SaveBudgetDimension, number>>;
  network: Record<ReleaseTier, Record<NetworkBudgetDimension, number>>;
}

// ────────────────────────────────────────────────────────────────────────────
// Concrete budget matrix (design.md `DEFAULT_RELEASE_BUDGETS`)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Structural network message ceilings (236 `BASELINE_LOAD` bounds), identical for every tier:
 * 81 = the viewDistance-4 interest columns added per client's first epoch; 1024 = the in-range
 * tracked-entity spawn bound; 40 = queued inventory transactions accepted per client (the 236
 * 40-slot window queue bound).
 */
export const NETWORK_MAX_CHUNK_ADDED_PER_CLIENT = 81;
export const NETWORK_MAX_ENTITY_SPAWNED_PER_CLIENT = 1024;
export const NETWORK_MAX_INVENTORY_ACCEPTED_PER_CLIENT = 40;

function networkRow(
  throughputMin: number,
  runCeilingMs: number,
): Record<NetworkBudgetDimension, number> {
  return {
    networkSustainedTicksPerSecond: throughputMin,
    maxNetworkRunMs: runCeilingMs,
    maxChunkAddedPerClient: NETWORK_MAX_CHUNK_ADDED_PER_CLIENT,
    maxEntitySpawnedPerClient: NETWORK_MAX_ENTITY_SPAWNED_PER_CLIENT,
    maxInventoryAcceptedPerClient: NETWORK_MAX_INVENTORY_ACCEPTED_PER_CLIENT,
  };
}

/**
 * The concrete per-tier × per-domain budget matrix (design.md). Frame/load/save/network
 * elapsed values are ceilings; `minSustainedTicksPerSecond` and
 * `networkSustainedTicksPerSecond` are minimums (see the module header).
 */
export const DEFAULT_RELEASE_BUDGETS: ReleaseBudgetConfig = {
  frame: {
    Low: {
      maxDrawCalls: 500,
      maxMeshBuildMillis: 4,
      maxFrameTimeMillis: 33.3,
      maxGeometryMemoryBytes: 134217728,
      maxRenderDistanceChunks: 8,
    },
    Medium: {
      maxDrawCalls: 1000,
      maxMeshBuildMillis: 6,
      maxFrameTimeMillis: 16.7,
      maxGeometryMemoryBytes: 268435456,
      maxRenderDistanceChunks: 12,
    },
    High: {
      maxDrawCalls: 1500,
      maxMeshBuildMillis: 8,
      maxFrameTimeMillis: 16.7,
      maxGeometryMemoryBytes: 402653184,
      maxRenderDistanceChunks: 16,
    },
    Ultra: {
      maxDrawCalls: 2500,
      maxMeshBuildMillis: 12,
      maxFrameTimeMillis: 16.7,
      maxGeometryMemoryBytes: 536870912,
      maxRenderDistanceChunks: 24,
    },
  },
  tick: {
    Low: { minSustainedTicksPerSecond: 60, maxCanonicalTickRunMs: 20000 },
    Medium: { minSustainedTicksPerSecond: 120, maxCanonicalTickRunMs: 10000 },
    High: { minSustainedTicksPerSecond: 240, maxCanonicalTickRunMs: 5000 },
    Ultra: { minSustainedTicksPerSecond: 480, maxCanonicalTickRunMs: 2500 },
  },
  load: {
    Low: { maxLoadMs: 1200 },
    Medium: { maxLoadMs: 600 },
    High: { maxLoadMs: 300 },
    Ultra: { maxLoadMs: 150 },
  },
  save: {
    Low: { maxSaveFlushMs: 1500 },
    Medium: { maxSaveFlushMs: 750 },
    High: { maxSaveFlushMs: 375 },
    Ultra: { maxSaveFlushMs: 190 },
  },
  network: {
    Low: networkRow(120, 10000),
    Medium: networkRow(200, 6000),
    High: networkRow(400, 3000),
    Ultra: networkRow(800, 1500),
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Config validation
// ────────────────────────────────────────────────────────────────────────────

const FRAME_DIMENSIONS: readonly FrameBudgetDimension[] = [
  'maxDrawCalls',
  'maxMeshBuildMillis',
  'maxFrameTimeMillis',
  'maxGeometryMemoryBytes',
  'maxRenderDistanceChunks',
];
const TICK_DIMENSIONS: readonly TickBudgetDimension[] = [
  'minSustainedTicksPerSecond',
  'maxCanonicalTickRunMs',
];
const LOAD_DIMENSIONS: readonly LoadBudgetDimension[] = ['maxLoadMs'];
const SAVE_DIMENSIONS: readonly SaveBudgetDimension[] = ['maxSaveFlushMs'];
const NETWORK_DIMENSIONS: readonly NetworkBudgetDimension[] = [
  'networkSustainedTicksPerSecond',
  'maxNetworkRunMs',
  'maxChunkAddedPerClient',
  'maxEntitySpawnedPerClient',
  'maxInventoryAcceptedPerClient',
];

const DOMAIN_DIMENSIONS: Readonly<Record<string, readonly string[]>> = {
  frame: FRAME_DIMENSIONS,
  tick: TICK_DIMENSIONS,
  load: LOAD_DIMENSIONS,
  save: SAVE_DIMENSIONS,
  network: NETWORK_DIMENSIONS,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reject any non-positive-finite value, naming the full field path. */
function requirePositiveFinite(field: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(
      `ReleasePerformanceGate: ${field} must be a positive finite number (got ${String(value)})`,
    );
  }
}

/** Reject keys not in `expected`, then reject expected keys that are absent. */
function checkExactKeys(
  obj: Record<string, unknown>,
  expected: readonly string[],
  unknownKeyError: (key: string) => Error,
  missingKeyError: (key: string) => Error,
): void {
  for (const key of Object.keys(obj)) {
    if (!expected.includes(key)) throw unknownKeyError(key);
  }
  for (const key of expected) {
    if (!(key in obj)) throw missingKeyError(key);
  }
}

/**
 * Validate an unknown input as a full release budget matrix: every domain present (no extra
 * domains), every tier row present in every domain (no extra tiers), every documented dimension
 * present per row (no extra dimensions), and every value a positive finite number. Throws
 * `ReleasePerformanceGate: <field>` naming the offending field path; never returns a partial
 * config. On success returns the same value, narrowed (the input is not mutated or copied).
 */
export function validateReleaseBudgetConfig(input: unknown): ReleaseBudgetConfig {
  if (!isPlainObject(input)) {
    throw new Error(`ReleasePerformanceGate: config must be an object (got ${String(input)})`);
  }
  const domains = Object.keys(DOMAIN_DIMENSIONS);
  for (const key of Object.keys(input)) {
    if (!domains.includes(key)) {
      throw new Error(`ReleasePerformanceGate: unknown config domain '${key}'`);
    }
  }
  for (const domain of domains) {
    const domainValue = input[domain];
    if (!isPlainObject(domainValue)) {
      throw new Error(`ReleasePerformanceGate: config.${domain} must be an object`);
    }
    checkExactKeys(
      domainValue,
      RELEASE_TIERS,
      (tier) => new Error(`ReleasePerformanceGate: unknown ${domain} tier '${tier}'`),
      (tier) =>
        new Error(
          `ReleasePerformanceGate: ${domain}.${tier} must be an object (missing tier row)`,
        ),
    );
    const dimensions = DOMAIN_DIMENSIONS[domain];
    if (dimensions === undefined) {
      throw new Error(`ReleasePerformanceGate: unknown config domain '${domain}'`);
    }
    for (const tier of RELEASE_TIERS) {
      const rowValue = domainValue[tier];
      if (!isPlainObject(rowValue)) {
        throw new Error(
          `ReleasePerformanceGate: ${domain}.${tier} must be an object (missing tier row)`,
        );
      }
      checkExactKeys(
        rowValue,
        dimensions,
        (dimension) => new Error(`ReleasePerformanceGate: unknown ${domain} dimension '${dimension}'`),
        (dimension) =>
          new Error(
            `ReleasePerformanceGate: ${domain}.${tier}.${dimension} must be a positive finite number (got undefined)`,
          ),
      );
      for (const dimension of dimensions) {
        requirePositiveFinite(`${domain}.${tier}.${dimension}`, rowValue[dimension]);
      }
    }
  }
  return input as unknown as ReleaseBudgetConfig;
}

// ────────────────────────────────────────────────────────────────────────────
// Measurement bundle and gate evaluation
// ────────────────────────────────────────────────────────────────────────────

/** The measured actuals for one gate evaluation, keyed by domain. */
export interface ReleaseMeasurementBundle {
  tier: ReleaseTier;
  frame: {
    drawCalls: number;
    meshBuildMillis: number;
    frameTimeMillis: number;
    geometryMemoryBytes: number;
    renderDistanceChunks: number;
  };
  tick: { sustainedTicksPerSecond: number; canonicalTickRunMs: number };
  load: { loadMs: number };
  save: { saveFlushMs: number };
  network: {
    sustainedTicksPerSecond: number;
    networkRunMs: number;
    maxChunkAddedPerClient: number;
    maxEntitySpawnedPerClient: number;
    maxInventoryAcceptedPerClient: number;
  };
}

/** One evaluated dimension: its budget, the measured actual, and the verdict. */
export interface ReleaseBudgetEntry {
  dimension: string;
  tier: ReleaseTier;
  budget: number;
  actual: number;
  withinBudget: boolean;
}

/** The fail-closed gate report: one entry per dimension plus the overall verdict. */
export interface ReleaseGateReport {
  tier: ReleaseTier;
  withinBudget: boolean;
  entries: ReleaseBudgetEntry[];
}

interface DimensionRule {
  readonly domain: string;
  /** Budget-matrix dimension name (also the report entry name). */
  readonly dimension: string;
  /** Bundle field the actual is read from. */
  readonly field: string;
  /** True when the budget is a minimum (within = actual >= budget). */
  readonly minimum: boolean;
}

/** Ordered evaluation table: 5 frame + 2 tick + 1 load + 1 save + 5 network = 14 rules. */
const DIMENSION_RULES: readonly DimensionRule[] = [
  { domain: 'frame', dimension: 'maxDrawCalls', field: 'drawCalls', minimum: false },
  { domain: 'frame', dimension: 'maxMeshBuildMillis', field: 'meshBuildMillis', minimum: false },
  { domain: 'frame', dimension: 'maxFrameTimeMillis', field: 'frameTimeMillis', minimum: false },
  {
    domain: 'frame',
    dimension: 'maxGeometryMemoryBytes',
    field: 'geometryMemoryBytes',
    minimum: false,
  },
  {
    domain: 'frame',
    dimension: 'maxRenderDistanceChunks',
    field: 'renderDistanceChunks',
    minimum: false,
  },
  {
    domain: 'tick',
    dimension: 'minSustainedTicksPerSecond',
    field: 'sustainedTicksPerSecond',
    minimum: true,
  },
  { domain: 'tick', dimension: 'maxCanonicalTickRunMs', field: 'canonicalTickRunMs', minimum: false },
  { domain: 'load', dimension: 'maxLoadMs', field: 'loadMs', minimum: false },
  { domain: 'save', dimension: 'maxSaveFlushMs', field: 'saveFlushMs', minimum: false },
  {
    domain: 'network',
    dimension: 'networkSustainedTicksPerSecond',
    field: 'sustainedTicksPerSecond',
    minimum: true,
  },
  { domain: 'network', dimension: 'maxNetworkRunMs', field: 'networkRunMs', minimum: false },
  {
    domain: 'network',
    dimension: 'maxChunkAddedPerClient',
    field: 'maxChunkAddedPerClient',
    minimum: false,
  },
  {
    domain: 'network',
    dimension: 'maxEntitySpawnedPerClient',
    field: 'maxEntitySpawnedPerClient',
    minimum: false,
  },
  {
    domain: 'network',
    dimension: 'maxInventoryAcceptedPerClient',
    field: 'maxInventoryAcceptedPerClient',
    minimum: false,
  },
];

function assertKnownTier(tier: unknown): asserts tier is ReleaseTier {
  if (typeof tier !== 'string' || !RELEASE_TIERS.includes(tier as ReleaseTier)) {
    throw new Error(`ReleasePerformanceGate: unknown tier '${String(tier)}'`);
  }
}

/** Read `bundle[domain][field]` totally: absent domains/fields read as `undefined`. */
function readActual(bundle: unknown, domain: string, field: string): unknown {
  if (!isPlainObject(bundle)) return undefined;
  const domainValue = bundle[domain];
  if (!isPlainObject(domainValue)) return undefined;
  return domainValue[field];
}

/**
 * Evaluate a measurement bundle against one tier's budget row (pure, deterministic). Unknown
 * tiers throw `ReleasePerformanceGate: unknown tier '<x>'` before any entry is produced. Each
 * dimension reports `withinBudget` per the module-header rule (minimums vs ceilings, boundary
 * equality within); a missing/non-numeric/non-finite/negative actual is reported as a violation
 * with `actual` normalized to `NaN` when non-numeric — evaluation never throws on bad actuals.
 * The overall verdict is within only when every entry of the selected tier is within budget.
 */
export function evaluateReleaseGate(
  config: ReleaseBudgetConfig,
  tier: ReleaseTier,
  bundle: ReleaseMeasurementBundle,
): ReleaseGateReport {
  assertKnownTier(tier);
  const entries: ReleaseBudgetEntry[] = [];
  for (const rule of DIMENSION_RULES) {
    // A malformed (unvalidated) config row fails closed: a non-numeric budget compares false.
    const domainConfig = config[rule.domain as keyof ReleaseBudgetConfig] as unknown;
    const row = isPlainObject(domainConfig) ? domainConfig : {};
    const rawRow = row[tier];
    const cells = isPlainObject(rawRow) ? rawRow : {};
    const rawBudget = cells[rule.dimension];
    const budget = typeof rawBudget === 'number' ? rawBudget : Number.NaN;
    const rawActual = readActual(bundle, rule.domain, rule.field);
    const numeric = typeof rawActual === 'number';
    const actual = numeric ? rawActual : Number.NaN;
    const usable = numeric && Number.isFinite(rawActual) && (rawActual as number) >= 0;
    const withinBudget = usable
      ? rule.minimum
        ? (rawActual as number) >= budget
        : (rawActual as number) <= budget
      : false;
    entries.push({ dimension: rule.dimension, tier, budget, actual, withinBudget });
  }
  const withinBudget = entries.every((entry) => entry.withinBudget);
  return { tier, withinBudget, entries };
}

// ────────────────────────────────────────────────────────────────────────────
// Synthetic frame/network bundles (fixture builders; task 3.4)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the frame actuals for `tier` with every value sitting exactly at that tier's ceiling
 * (a boundary-equality pass). Overrides replace individual actuals — raise one above its
 * ceiling to demonstrate a frame violation, lower one to demonstrate headroom. Unknown tiers
 * throw like `evaluateReleaseGate`.
 */
export function syntheticFrameBundle(
  tier: ReleaseTier,
  overrides?: Partial<ReleaseMeasurementBundle['frame']>,
): ReleaseMeasurementBundle['frame'] {
  assertKnownTier(tier);
  const row = DEFAULT_RELEASE_BUDGETS.frame[tier];
  return {
    drawCalls: row.maxDrawCalls,
    meshBuildMillis: row.maxMeshBuildMillis,
    frameTimeMillis: row.maxFrameTimeMillis,
    geometryMemoryBytes: row.maxGeometryMemoryBytes,
    renderDistanceChunks: row.maxRenderDistanceChunks,
    ...overrides,
  };
}

/**
 * Build the network actuals for `tier` with throughput/run-ms sitting exactly at that tier's
 * budgets (a boundary-equality pass) and the three structural message ceilings at their
 * tier-independent constants. Overrides replace individual actuals. Unknown tiers throw like
 * `evaluateReleaseGate`.
 */
export function syntheticNetworkBundle(
  tier: ReleaseTier,
  overrides?: Partial<ReleaseMeasurementBundle['network']>,
): ReleaseMeasurementBundle['network'] {
  assertKnownTier(tier);
  const row = DEFAULT_RELEASE_BUDGETS.network[tier];
  return {
    sustainedTicksPerSecond: row.networkSustainedTicksPerSecond,
    networkRunMs: row.maxNetworkRunMs,
    maxChunkAddedPerClient: row.maxChunkAddedPerClient,
    maxEntitySpawnedPerClient: row.maxEntitySpawnedPerClient,
    maxInventoryAcceptedPerClient: row.maxInventoryAcceptedPerClient,
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Canonical fixtures and headless measurement drivers
// ────────────────────────────────────────────────────────────────────────────

/** World id used by the canonical load/save fixtures. */
export const CANONICAL_WORLD_ID = 'release-gate-canonical';

/** `CANONICAL_SIM` world size: 17×17 = 289 chunk columns. */
export const CANONICAL_SIM_COLUMN_COUNT = 289;

/** `CANONICAL_SIM` entity count (each entity is one lightweight `TickSystem`). */
export const CANONICAL_SIM_ENTITY_COUNT = 64;

/** `CANONICAL_SIM` run length in ticks. */
export const CANONICAL_SIM_TICKS = 1200;

/** Sections declared per canonical snapshot chunk column (24 × 16 = 384 blocks tall). */
export const CANONICAL_SNAPSHOT_SECTIONS_PER_COLUMN = 24;

/** Columns in the canonical world snapshot (17×17 = 289). */
export const CANONICAL_SNAPSHOT_COLUMN_COUNT = 289;

/** Units in the canonical dirty set: 512 chunk columns + metadata + player state. */
export const CANONICAL_SAVE_DIRTY_UNIT_COUNT = 514;

function canonicalColumns(): Array<{ chunkX: number; chunkZ: number }> {
  const columns: Array<{ chunkX: number; chunkZ: number }> = [];
  for (let x = -8; x <= 8; x++) {
    for (let z = -8; z <= 8; z++) {
      columns.push({ chunkX: x, chunkZ: z });
    }
  }
  return columns;
}

function canonicalMetadata(worldId: string): WorldMetadata {
  return {
    schemaVersion: 1,
    worldId,
    seed: 42,
    dimensionId: 'minecraft:overworld',
    minY: -64,
    height: 384,
    createdAt: 1000,
    updatedAt: 2000,
  };
}

function canonicalPlayerState(worldId: string): PlayerStateRecord {
  return {
    key: worldId,
    worldId,
    seed: 42,
    position: [1.5, 64, 2.5],
    yaw: 90,
    pitch: -5,
    inventory: { slots: [] },
    survival: { health: 20 },
    experience: { level: 3 },
  };
}

/**
 * One materialized all-air section per column (16³ slots, 4-bit palette, 512 zero words) so
 * the canonical load exercises real section deserialization while staying bounded.
 */
function canonicalSectionPayload(airId: number): {
  version: number;
  capacity: number;
  bitsPerEntry: number;
  palette: number[];
  storage: number[];
} {
  return {
    version: 1,
    capacity: 4096,
    bitsPerEntry: 4,
    palette: [airId],
    storage: new Array<number>(512).fill(0),
  };
}

/**
 * Build `CANONICAL_WORLD_SNAPSHOT`: 289 chunk columns (24 sections each, one materialized
 * all-air section) + 1 metadata record + 1 player-state record + 289 block-entity chunks +
 * 289 entity chunks, with small payloads per column.
 */
export function createCanonicalWorldSnapshot(worldId: string = CANONICAL_WORLD_ID): PersistedWorldSnapshot {
  const registry = createDefaultBlockStateRegistry();
  const section = canonicalSectionPayload(registry.getDefaultState(0).id);
  const columns: SerializedChunkColumn[] = canonicalColumns().map(({ chunkX, chunkZ }) => ({
    version: 1,
    chunkX,
    chunkZ,
    sectionCount: CANONICAL_SNAPSHOT_SECTIONS_PER_COLUMN,
    minSectionY: -4,
    sections: { 4: section },
  }));
  const blockEntityChunks: BlockEntityChunkRecord[] = canonicalColumns().map(
    ({ chunkX, chunkZ }) => ({
      key: `${worldId}|${chunkX}|${chunkZ}`,
      worldId,
      chunkX,
      chunkZ,
      entities: [],
    }),
  );
  const entityChunks: EntityChunkRecord[] = canonicalColumns().map(({ chunkX, chunkZ }) => ({
    key: `${worldId}|${chunkX}|${chunkZ}`,
    worldId,
    chunkX,
    chunkZ,
    entities: [],
  }));
  return {
    metadata: canonicalMetadata(worldId),
    playerState: canonicalPlayerState(worldId),
    columns,
    blockEntityChunks,
    entityChunks,
  };
}

/**
 * Build `CANONICAL_SAVE_DIRTY`: 512 dirty chunk-column units (a 16×32 coordinate span) plus
 * the metadata and player-state units. Column values serialize to the same small canonical
 * column shape the snapshot uses, so every unit passes codec encode.
 */
export function createCanonicalSaveDirtyUnits(worldId: string = CANONICAL_WORLD_ID): ServerWorldUnit[] {
  const registry = createDefaultBlockStateRegistry();
  const section = canonicalSectionPayload(registry.getDefaultState(0).id);
  const units: ServerWorldUnit[] = [];
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 32; z++) {
      const chunkX = x;
      const chunkZ = z;
      const column: SerializedChunkColumn = {
        version: 1,
        chunkX,
        chunkZ,
        sectionCount: CANONICAL_SNAPSHOT_SECTIONS_PER_COLUMN,
        minSectionY: -4,
        sections: { 4: section },
      };
      units.push({
        kind: 'chunk-sections',
        worldId,
        chunkX,
        chunkZ,
        value: { chunkX, chunkZ, serialize: () => column },
      });
    }
  }
  units.push({ kind: 'world-metadata', worldId, chunkX: 0, chunkZ: 0, value: canonicalMetadata(worldId) });
  units.push({
    kind: 'player-state',
    worldId,
    chunkX: 0,
    chunkZ: 0,
    value: canonicalPlayerState(worldId),
  });
  return units;
}

/**
 * In-memory `SaveLoadBoundary` whose reads/writes resolve on a fresh event-loop turn (like
 * real async persistence) so measured load/flush wall time is nonzero and measurable. Reads
 * serve the fixed snapshot; nothing is stored.
 */
function createTimingBoundary(snapshot: PersistedWorldSnapshot | null): SaveLoadBoundary {
  const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
  return {
    async readWorld(_worldId: string): Promise<PersistedWorldSnapshot | null> {
      await settle();
      return snapshot;
    },
    async write(_unit: SaveUnit): Promise<void> {
      await settle();
    },
    async writePlayerState(_record: PlayerStateRecord): Promise<void> {
      await settle();
    },
  };
}

/** Result of {@link measureCanonicalTickRun}. */
export interface CanonicalTickRunMeasurement {
  /** `1200 / (canonicalTickRunMs / 1000)`; `Infinity` if the run rounded to 0 ms. */
  sustainedTicksPerSecond: number;
  /** Wall-clock elapsed ms around `step(1200)`. */
  canonicalTickRunMs: number;
  /** True when the process stopped (a system threw) or did not complete 1200 ticks. */
  stopped: boolean;
}

/**
 * Measure `CANONICAL_SIM` headlessly: build a `WorldTickProcess` (224) whose system set is one
 * world sweeper plus 64 lightweight entity systems, each touching a 289-entry column array
 * every tick (deterministic integer work, no clocks or randomness), then `step(1200)` and time
 * it with `Date.now()`. Bounded: targets well under 2 s wall time.
 */
export function measureCanonicalTickRun(): CanonicalTickRunMeasurement {
  const columns = new Array<number>(CANONICAL_SIM_COLUMN_COUNT).fill(0);
  const sweep = (offset: number, tick: number): void => {
    let sum = 0;
    for (let i = 0; i < columns.length; i++) {
      const value = columns[i] ?? 0;
      sum += value;
      columns[(i + offset) % columns.length] = (value + tick) % 7;
    }
    columns[offset] = sum % 7;
  };
  const systems: TickSystem[] = [{ tick: (t) => sweep(0, t) }];
  for (let entity = 0; entity < CANONICAL_SIM_ENTITY_COUNT; entity++) {
    const offset = (entity * 13) % CANONICAL_SIM_COLUMN_COUNT;
    systems.push({ tick: (t) => sweep(offset, t + entity) });
  }
  const process = new WorldTickProcess({ systems });
  const startedAt = Date.now();
  process.step(CANONICAL_SIM_TICKS);
  const elapsedMs = Date.now() - startedAt;
  return {
    sustainedTicksPerSecond: elapsedMs > 0 ? CANONICAL_SIM_TICKS / (elapsedMs / 1000) : Infinity,
    canonicalTickRunMs: elapsedMs,
    stopped: process.isStopped || process.tick !== CANONICAL_SIM_TICKS,
  };
}

/** Result of {@link measureCanonicalLoad}. */
export interface CanonicalLoadMeasurement {
  /** Wall-clock ms from the first boundary call through the resolved `LoadResult`. */
  loadMs: number;
  /** The lifecycle outcome: only `'loaded'` is a valid measurement. */
  outcome: string;
}

/**
 * Measure the canonical world-snapshot load headlessly: a timing in-memory boundary serves
 * `CANONICAL_WORLD_SNAPSHOT` (289 columns + metadata + player state + 289 block-entity chunks
 * + 289 entity chunks) to a real 234 `ServerSaveLifecycle` through the real shared codec, and
 * the wall time from the first `readWorld` call to the resolved `LoadResult` is recorded.
 */
export async function measureCanonicalLoad(): Promise<CanonicalLoadMeasurement> {
  const codec = createWorldSaveCodec({ registry: createDefaultBlockStateRegistry() });
  const boundary = createTimingBoundary(createCanonicalWorldSnapshot());
  let startedAt: number | null = null;
  const timedBoundary: SaveLoadBoundary = {
    readWorld: (worldId) => {
      if (startedAt === null) startedAt = Date.now();
      return boundary.readWorld(worldId);
    },
    write: (unit) => boundary.write(unit),
    writePlayerState: (record) => boundary.writePlayerState(record),
  };
  const lifecycle = new ServerSaveLifecycle({
    codec,
    boundary: timedBoundary,
    storageGate: { canWrite: () => true },
  });
  const result = await lifecycle.load(CANONICAL_WORLD_ID, () => undefined);
  const loadMs = Date.now() - (startedAt ?? Date.now());
  return { loadMs, outcome: result.outcome };
}

/** Result of {@link measureCanonicalSaveFlush}. */
export interface CanonicalSaveFlushMeasurement {
  /** Wall-clock ms around `flush()` + `saveAndClose()` over the canonical dirty set. */
  saveFlushMs: number;
  /** True only when the queue drained to empty and the lifecycle reached `'closed'`. */
  drained: boolean;
}

/**
 * Measure the canonical dirty-set flush headlessly: a fresh 234 lifecycle reaches `'running'`
 * (empty load), `CANONICAL_SAVE_DIRTY` (512 columns + metadata + player state) is marked dirty,
 * then `flush()` + `saveAndClose()` are timed with `Date.now()` until `pendingCount === 0` and
 * state `'closed'`.
 */
export async function measureCanonicalSaveFlush(): Promise<CanonicalSaveFlushMeasurement> {
  const codec = createWorldSaveCodec({ registry: createDefaultBlockStateRegistry() });
  const lifecycle = new ServerSaveLifecycle({
    codec,
    boundary: createTimingBoundary(null),
    storageGate: { canWrite: () => true },
  });
  await lifecycle.load(CANONICAL_WORLD_ID, () => undefined); // outcome 'created' -> running
  for (const unit of createCanonicalSaveDirtyUnits()) {
    lifecycle.markDirty(unit);
  }
  const startedAt = Date.now();
  await lifecycle.flush();
  await lifecycle.saveAndClose();
  const saveFlushMs = Date.now() - startedAt;
  return {
    saveFlushMs,
    drained: lifecycle.pendingCount === 0 && lifecycle.state === 'closed',
  };
}
