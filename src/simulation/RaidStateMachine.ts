/**
 * Settlement raid state machine (152): a bounded, deterministic, immutable raid lifecycle —
 * trigger, escalating wave composition, per-wave raider tracking, win/loss resolution, and a
 * strict `version: 1` serialize/deserialize codec for outcome persistence.
 *
 * Structurally mirrors 123's `tickBrewing` (pure immutable per-tick state machine + strict
 * envelope) and 149's `SerializedPoi` codec (atomic validate-then-return). Deliberately
 * self-contained: zero imports, so it has no coupling to `EntityManager`/`World`/any registry —
 * matching 141's `MeleeCombat`.
 *
 * No raider entity types are registered anywhere (wave rosters name plain string type keys), no
 * mob spawning, no village-boundary detection, no bad-omen trigger, no IndexedDB store, no `Game`
 * wiring, no raid HUD — see `openspec/changes/152-raid-state-machine/design.md`.
 */

/** A raid's lifecycle status. */
export type RaidStatus = 'INACTIVE' | 'ACTIVE' | 'VICTORY' | 'DEFEAT';

/**
 * One raider type and count within a wave's roster. `typeKey` is a plain string, not a resolved
 * `ResourceId`: no raider entity type is registered in 017 yet (see the proposal's Non-goals), so
 * nothing here can be looked up against a registry today.
 */
export interface RaidWaveEntry {
  readonly typeKey: string;
  readonly count: number;
}

/** One raid's complete, immutable state. */
export interface RaidState {
  readonly status: RaidStatus;
  readonly centerX: number;
  readonly centerY: number;
  readonly centerZ: number;
  /** Waves spawned so far: `0` before the first wave, rising to at most `totalWaves`. */
  readonly waveIndex: number;
  readonly totalWaves: number;
  readonly raidersRemaining: number;
  readonly badOmenLevel: number;
  readonly ticks: number;
}

/** Wave count for a bad-omen level of 1. */
export const RAID_BASE_WAVES = 3;
/** Hard ceiling on a raid's wave count regardless of bad-omen level. */
export const RAID_MAX_WAVES = 7;
/** Ticks after which an uncleared raid is lost. */
export const RAID_TIMEOUT_TICKS = 12000;
/** Current schema version for {@link SerializedRaid}. */
export const RAID_RECORD_VERSION = 1;

const KNOWN_STATUSES: readonly RaidStatus[] = ['INACTIVE', 'ACTIVE', 'VICTORY', 'DEFEAT'];

/** The persisted-envelope shape for one raid. */
export interface SerializedRaid {
  readonly schemaVersion: 1;
  readonly status: RaidStatus;
  readonly centerX: number;
  readonly centerY: number;
  readonly centerZ: number;
  readonly waveIndex: number;
  readonly totalWaves: number;
  readonly raidersRemaining: number;
  readonly badOmenLevel: number;
  readonly ticks: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonNegativeInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && Number.isFinite(v) && v >= 0;
}

function clampNonNegative(v: number): number {
  return isFiniteNumber(v) && v > 0 ? Math.floor(v) : 0;
}

function isTerminal(state: RaidState): boolean {
  return state.status === 'VICTORY' || state.status === 'DEFEAT';
}

/**
 * Start an `ACTIVE` raid centered at `(centerX, centerY, centerZ)`. `totalWaves` is
 * `RAID_BASE_WAVES + max(0, badOmenLevel - 1)`, clamped to `RAID_MAX_WAVES`.
 */
export function startRaid(
  centerX: number,
  centerY: number,
  centerZ: number,
  badOmenLevel: number,
): RaidState {
  const omen = clampNonNegative(badOmenLevel);
  const totalWaves = Math.min(RAID_MAX_WAVES, RAID_BASE_WAVES + Math.max(0, omen - 1));
  return {
    status: 'ACTIVE',
    centerX,
    centerY,
    centerZ,
    waveIndex: 0,
    totalWaves,
    raidersRemaining: 0,
    badOmenLevel: omen,
    ticks: 0,
  };
}

/**
 * The deterministic raider roster for wave `waveIndex` (0-based) at `badOmenLevel`. Pure: the same
 * inputs always yield an identical roster (no RNG, no wall-clock, no shared state). Zero-count
 * entries are omitted; negative/non-finite inputs are clamped to `0`.
 */
export function waveComposition(waveIndex: number, badOmenLevel: number): RaidWaveEntry[] {
  const wave = clampNonNegative(waveIndex);
  const omen = clampNonNegative(badOmenLevel);

  const candidates: RaidWaveEntry[] = [
    { typeKey: 'pillager', count: 2 + wave },
    { typeKey: 'vindicator', count: wave },
    { typeKey: 'ravager', count: wave >= 2 ? 1 : 0 },
    { typeKey: 'witch', count: omen >= 3 ? 1 : 0 },
  ];
  return candidates.filter((entry) => entry.count > 0);
}

function totalRaiders(wave: readonly RaidWaveEntry[]): number {
  return wave.reduce((sum, entry) => sum + entry.count, 0);
}

/**
 * Spawn the next wave: increments `waveIndex` and seeds `raidersRemaining` with that wave's summed
 * raider count, returning the roster. Returns the input state unchanged with an empty roster when
 * the raid is terminal or every wave has already spawned.
 */
export function spawnWave(state: RaidState): { state: RaidState; wave: RaidWaveEntry[] } {
  if (isTerminal(state) || state.status !== 'ACTIVE' || state.waveIndex >= state.totalWaves) {
    return { state, wave: [] };
  }
  const wave = waveComposition(state.waveIndex, state.badOmenLevel);
  return {
    state: {
      ...state,
      waveIndex: state.waveIndex + 1,
      raidersRemaining: totalRaiders(wave),
    },
    wave,
  };
}

/**
 * Record one raider death: decrements `raidersRemaining`, floored at `0`. Returns the input state
 * unchanged for a non-`ACTIVE` raid.
 */
export function recordRaiderDeath(state: RaidState): RaidState {
  if (state.status !== 'ACTIVE') return state;
  return { ...state, raidersRemaining: Math.max(0, state.raidersRemaining - 1) };
}

/**
 * Advance the raid one tick. A terminal raid is returned unchanged. Otherwise `ticks` advances;
 * exceeding `RAID_TIMEOUT_TICKS` yields `DEFEAT`; a still-contested wave (`raidersRemaining > 0`)
 * just advances the clock; a cleared wave either spawns the next one (returned as `spawned`) or,
 * once every wave has been cleared, yields `VICTORY`.
 */
export function tickRaid(state: RaidState): { state: RaidState; spawned: RaidWaveEntry[] | null } {
  if (state.status !== 'ACTIVE') {
    return { state, spawned: null };
  }

  const ticked: RaidState = { ...state, ticks: state.ticks + 1 };

  if (ticked.ticks > RAID_TIMEOUT_TICKS) {
    return { state: { ...ticked, status: 'DEFEAT' }, spawned: null };
  }
  if (ticked.raidersRemaining > 0) {
    return { state: ticked, spawned: null };
  }
  if (ticked.waveIndex >= ticked.totalWaves) {
    return { state: { ...ticked, status: 'VICTORY' }, spawned: null };
  }

  const result = spawnWave(ticked);
  return { state: result.state, spawned: result.wave };
}

/** Serialize `state` to the strict `version: 1` envelope. Pure; never throws. */
export function serializeRaid(state: RaidState): SerializedRaid {
  return {
    schemaVersion: RAID_RECORD_VERSION,
    status: state.status,
    centerX: state.centerX,
    centerY: state.centerY,
    centerZ: state.centerZ,
    waveIndex: state.waveIndex,
    totalWaves: state.totalWaves,
    raidersRemaining: state.raidersRemaining,
    badOmenLevel: state.badOmenLevel,
    ticks: state.ticks,
  };
}

/**
 * Reconstruct a {@link RaidState} from an untrusted payload. Validates the schema version, the
 * status vocabulary, finite coordinates/ticks, non-negative integer counters, and the
 * `waveIndex <= totalWaves` cross-field invariant. Throws before returning anything on any defect.
 */
export function deserializeRaid(input: unknown): RaidState {
  if (typeof input !== 'object' || input === null) {
    throw new Error('RaidStateMachine: malformed raid payload');
  }
  const r = input as Record<string, unknown>;
  if (r.schemaVersion !== RAID_RECORD_VERSION) {
    throw new Error(`RaidStateMachine: unsupported schemaVersion ${String(r.schemaVersion)}`);
  }
  if (typeof r.status !== 'string' || !KNOWN_STATUSES.includes(r.status as RaidStatus)) {
    throw new Error(`RaidStateMachine: unknown raid status ${String(r.status)}`);
  }
  if (!isFiniteNumber(r.centerX) || !isFiniteNumber(r.centerY) || !isFiniteNumber(r.centerZ)) {
    throw new Error('RaidStateMachine: center coordinates must be finite numbers');
  }
  if (!isNonNegativeInteger(r.ticks)) {
    throw new Error('RaidStateMachine: ticks must be a non-negative integer');
  }
  if (
    !isNonNegativeInteger(r.waveIndex) ||
    !isNonNegativeInteger(r.totalWaves) ||
    !isNonNegativeInteger(r.raidersRemaining) ||
    !isNonNegativeInteger(r.badOmenLevel)
  ) {
    throw new Error('RaidStateMachine: wave/raider/omen counters must be non-negative integers');
  }
  if (r.waveIndex > r.totalWaves) {
    throw new Error(`RaidStateMachine: waveIndex ${r.waveIndex} exceeds totalWaves ${r.totalWaves}`);
  }

  return {
    status: r.status as RaidStatus,
    centerX: r.centerX,
    centerY: r.centerY,
    centerZ: r.centerZ,
    waveIndex: r.waveIndex,
    totalWaves: r.totalWaves,
    raidersRemaining: r.raidersRemaining,
    badOmenLevel: r.badOmenLevel,
    ticks: r.ticks,
  };
}
