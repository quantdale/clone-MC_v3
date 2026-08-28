/**
 * Reusable boss framework (153): a validated boss-definition registry, an immutable
 * health/phase/arena-lifecycle state machine, a boss-bar HUD projection, and a strict `version: 1`
 * codec. Structurally mirrors 152's `RaidStateMachine` (immutable transitions + documented
 * terminal-state no-ops + atomic codec validation).
 *
 * `damageBoss` *reports* `phaseChanged`/`defeated` rather than publishing 053 `GameEventBus`
 * events, keeping this module decoupled and letting the caller decide what to emit — the same
 * "return the outcome, let the caller act" convention as 148's injected spawn sinks.
 *
 * No boss entity types, no AI/attacks, no arena block generation, no HUD rendering (205's scope),
 * no event-bus wiring, no persistence store, no `Game` wiring — see
 * `openspec/changes/153-boss-framework/design.md`.
 */
import { type ResourceId, createResourceId } from '../data/ResourceId';
import { Registry } from '../data/Registry';

/** One boss phase: a name and the health fraction at or below which it becomes active. */
export interface BossPhase {
  readonly name: string;
  readonly healthThreshold: number;
}

/** An immutable boss definition: identity, health pool, ordered phases, and bar color. */
export interface BossDefinition {
  readonly id: ResourceId;
  readonly key: string;
  readonly name: string;
  readonly maxHealth: number;
  /** Descending `healthThreshold` order; the first phase is always at `1`. */
  readonly phases: readonly BossPhase[];
  readonly barColor: string;
}

/** A boss fight's arena lifecycle status. */
export type BossStatus = 'SPAWNING' | 'ACTIVE' | 'DEFEATED';

/** One boss fight's complete, immutable state. */
export interface BossState {
  readonly bossKey: string;
  readonly status: BossStatus;
  readonly health: number;
  readonly phaseIndex: number;
  readonly ticks: number;
}

/** The renderable boss-bar projection consumed by a future HUD (205). */
export interface BossBarSnapshot {
  readonly name: string;
  readonly color: string;
  /** Health fraction in `[0, 1]`. */
  readonly progress: number;
  readonly phaseName: string;
}

/** Ticks a boss spends `SPAWNING` before becoming `ACTIVE`. */
export const BOSS_SPAWN_TICKS = 100;
/** Current schema version for {@link SerializedBoss}. */
export const BOSS_RECORD_VERSION = 1;

const KNOWN_STATUSES: readonly BossStatus[] = ['SPAWNING', 'ACTIVE', 'DEFEATED'];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonNegativeInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && Number.isFinite(v) && v >= 0;
}

function validateDefinition(def: BossDefinition): void {
  if (!isFiniteNumber(def.maxHealth) || def.maxHealth <= 0) {
    throw new Error(`BossRegistry: '${def.key}' maxHealth must be a finite number > 0`);
  }
  if (def.phases.length === 0) {
    throw new Error(`BossRegistry: '${def.key}' must declare at least one phase`);
  }
  const first = def.phases[0]!;
  if (first.healthThreshold !== 1) {
    throw new Error(`BossRegistry: '${def.key}' first phase threshold must be exactly 1`);
  }
  let previous = Infinity;
  for (const phase of def.phases) {
    if (!isFiniteNumber(phase.healthThreshold) || phase.healthThreshold < 0 || phase.healthThreshold > 1) {
      throw new Error(`BossRegistry: '${def.key}' phase '${phase.name}' threshold must be within [0, 1]`);
    }
    if (phase.healthThreshold >= previous) {
      throw new Error(`BossRegistry: '${def.key}' phase thresholds must strictly descend`);
    }
    previous = phase.healthThreshold;
  }
}

/** Registry of boss definitions built on the 003 generic registry core, validated then finalized. */
export class BossRegistry {
  private readonly inner: Registry<BossDefinition>;
  private readonly byKeyMap = new Map<string, BossDefinition>();

  constructor(definitions: BossDefinition[]) {
    this.inner = new Registry<BossDefinition>();
    for (const def of definitions) {
      validateDefinition(def);
      this.inner.register(def.id, def);
      this.byKeyMap.set(def.key, def);
    }
    this.inner.finalize();
  }

  get finalized(): boolean {
    return this.inner.finalized;
  }

  get size(): number {
    return this.inner.size;
  }

  get(id: ResourceId): BossDefinition {
    return this.inner.get(id);
  }

  getOptional(id: ResourceId): BossDefinition | undefined {
    return this.inner.getOptional(id);
  }

  has(id: ResourceId): boolean {
    return this.inner.has(id);
  }

  /** Lookup by short key string (e.g. `'ender_dragon'`). Undefined when absent. */
  getByKey(key: string): BossDefinition | undefined {
    return this.byKeyMap.get(key);
  }

  /** All definitions in ascending registration order (deterministic). */
  entries(): readonly BossDefinition[] {
    return this.inner.entries().map((entry) => entry.value);
  }
}

const bossId = (key: string): ResourceId => createResourceId('minecraft', `boss/${key}`);

/**
 * A representative default catalog: `ender_dragon` (183's future consumer) and `wither` (a later
 * secondary-boss change). Not an exhaustive or exactly-vanilla catalog.
 */
export function createDefaultBossRegistry(): BossRegistry {
  return new BossRegistry([
    {
      id: bossId('ender_dragon'),
      key: 'ender_dragon',
      name: 'Ender Dragon',
      maxHealth: 200,
      phases: [
        { name: 'perching', healthThreshold: 1 },
        { name: 'strafing', healthThreshold: 0.6 },
        { name: 'enraged', healthThreshold: 0.25 },
      ],
      barColor: '#c060ff',
    },
    {
      id: bossId('wither'),
      key: 'wither',
      name: 'Wither',
      maxHealth: 300,
      phases: [
        { name: 'ranged', healthThreshold: 1 },
        { name: 'armored', healthThreshold: 0.5 },
      ],
      barColor: '#303030',
    },
  ]);
}

/**
 * The index of the phase active at `fraction` of max health: the last phase whose
 * `healthThreshold` is `>=` the (clamped) fraction. Pure.
 */
export function phaseForHealthFraction(definition: BossDefinition, fraction: number): number {
  const f = isFiniteNumber(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  let index = 0;
  for (let i = 0; i < definition.phases.length; i++) {
    if (definition.phases[i]!.healthThreshold >= f) index = i;
  }
  return index;
}

/** A fresh `SPAWNING` fight at full health in phase 0. */
export function startBossFight(definition: BossDefinition): BossState {
  return {
    bossKey: definition.key,
    status: 'SPAWNING',
    health: definition.maxHealth,
    phaseIndex: 0,
    ticks: 0,
  };
}

/** The outcome of one {@link damageBoss} call. */
export interface BossDamageResult {
  readonly state: BossState;
  readonly phaseChanged: boolean;
  readonly defeated: boolean;
}

/**
 * Apply `amount` damage: reduces health (floored at 0), recomputes the phase, and transitions to
 * `DEFEATED` at 0 health. Reports `phaseChanged`/`defeated` so a caller can fire 053 events or
 * update a HUD without diffing states itself. A non-positive/non-finite `amount` or an
 * already-`DEFEATED` boss is a no-op with both flags `false` (so a death event can never
 * double-fire).
 */
export function damageBoss(
  state: BossState,
  definition: BossDefinition,
  amount: number,
): BossDamageResult {
  if (state.status === 'DEFEATED' || !isFiniteNumber(amount) || amount <= 0) {
    return { state, phaseChanged: false, defeated: false };
  }
  const health = Math.max(0, state.health - amount);
  const phaseIndex = phaseForHealthFraction(definition, health / definition.maxHealth);
  const defeated = health === 0;
  return {
    state: {
      ...state,
      health,
      phaseIndex,
      status: defeated ? 'DEFEATED' : state.status,
    },
    phaseChanged: phaseIndex !== state.phaseIndex,
    defeated,
  };
}

/**
 * Restore `amount` health, capped at `maxHealth`, recomputing the phase (so healing back above a
 * threshold restores the earlier phase). A non-positive/non-finite `amount` is a no-op, and a
 * `DEFEATED` boss is returned unchanged — this framework never revives a defeated boss.
 */
export function healBoss(state: BossState, definition: BossDefinition, amount: number): BossState {
  if (state.status === 'DEFEATED' || !isFiniteNumber(amount) || amount <= 0) {
    return state;
  }
  const health = Math.min(definition.maxHealth, state.health + amount);
  return {
    ...state,
    health,
    phaseIndex: phaseForHealthFraction(definition, health / definition.maxHealth),
  };
}

/**
 * Advance one tick, promoting a `SPAWNING` boss to `ACTIVE` once `ticks` reaches
 * {@link BOSS_SPAWN_TICKS}. A `DEFEATED` boss is returned unchanged.
 */
export function tickBossFight(state: BossState): BossState {
  if (state.status === 'DEFEATED') return state;
  const ticks = state.ticks + 1;
  const status: BossStatus = state.status === 'SPAWNING' && ticks >= BOSS_SPAWN_TICKS ? 'ACTIVE' : state.status;
  return { ...state, ticks, status };
}

/** The renderable boss-bar projection for `state` (205's future HUD input). */
export function bossBarSnapshot(state: BossState, definition: BossDefinition): BossBarSnapshot {
  const progress = Math.max(0, Math.min(1, state.health / definition.maxHealth));
  const phase = definition.phases[state.phaseIndex] ?? definition.phases[0]!;
  return {
    name: definition.name,
    color: definition.barColor,
    progress,
    phaseName: phase.name,
  };
}

/** The persisted-envelope shape for one boss fight. */
export interface SerializedBoss {
  readonly schemaVersion: 1;
  readonly bossKey: string;
  readonly status: BossStatus;
  readonly health: number;
  readonly phaseIndex: number;
  readonly ticks: number;
}

/** Serialize `state` to the strict `version: 1` envelope. Pure; never throws. */
export function serializeBoss(state: BossState): SerializedBoss {
  return {
    schemaVersion: BOSS_RECORD_VERSION,
    bossKey: state.bossKey,
    status: state.status,
    health: state.health,
    phaseIndex: state.phaseIndex,
    ticks: state.ticks,
  };
}

/**
 * Reconstruct a {@link BossState} from an untrusted payload. Validates the schema version, the
 * status vocabulary, a non-negative finite health, and non-negative integer `phaseIndex`/`ticks`.
 * Throws before returning anything on any defect.
 */
export function deserializeBoss(input: unknown): BossState {
  if (typeof input !== 'object' || input === null) {
    throw new Error('BossFramework: malformed boss payload');
  }
  const r = input as Record<string, unknown>;
  if (r.schemaVersion !== BOSS_RECORD_VERSION) {
    throw new Error(`BossFramework: unsupported schemaVersion ${String(r.schemaVersion)}`);
  }
  if (typeof r.bossKey !== 'string' || r.bossKey.length === 0) {
    throw new Error('BossFramework: bossKey must be a non-empty string');
  }
  if (typeof r.status !== 'string' || !KNOWN_STATUSES.includes(r.status as BossStatus)) {
    throw new Error(`BossFramework: unknown boss status ${String(r.status)}`);
  }
  if (!isFiniteNumber(r.health) || r.health < 0) {
    throw new Error('BossFramework: health must be a finite number >= 0');
  }
  if (!isNonNegativeInteger(r.phaseIndex) || !isNonNegativeInteger(r.ticks)) {
    throw new Error('BossFramework: phaseIndex and ticks must be non-negative integers');
  }

  return {
    bossKey: r.bossKey,
    status: r.status as BossStatus,
    health: r.health,
    phaseIndex: r.phaseIndex,
    ticks: r.ticks,
  };
}
