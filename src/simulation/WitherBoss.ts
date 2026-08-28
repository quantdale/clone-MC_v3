/**
 * Wither boss core (252): deterministic simulation building on BossFramework + ExplosionCore + ProjectileCore.
 *
 * One authoritative WitherState per boss, wrapping BossState (health/phase/status) plus
 * positional, targeting, cooldown, and lifecycle extras. All transitions are pure and
 * return new state; inputs are not mutated.
 *
 * Constants mirror vanilla-inspired values documented in design.md.
 */
import {
  type BossDefinition,
  type BossState,
  startBossFight,
  damageBoss,
  healBoss,
  phaseForHealthFraction,
  serializeBoss,
  deserializeBoss,
} from './BossFramework';
import type { ExplosionWorld } from './ExplosionCore';

export const WITHER_MAX_HEALTH = 300;
export const WITHER_CHARGE_TICKS = 220;
export const WITHER_SPAWN_EXPLOSION_STRENGTH = 7;
export const WITHER_SKULL_STRENGTH = 1;
export const WITHER_BLUE_SKULL_STRENGTH = 2.5;
export const WITHER_ARMORED_THRESHOLD = 0.5;
export const WITHER_REGEN_PER_TICK = 0.05; // 1 per 20 ticks
export const WITHER_KILL_HEAL = 5;
export const WITHER_TARGET_RANGE = 40;
export const WITHER_TARGET_ACQUIRE_INTERVAL = 20;
export const WITHER_SKULL_COOLDOWN = 40;
export const WITHER_SIDE_OFFSET = 20;
export const WITHER_SKULL_DAMAGE = 8;
export const WITHER_BLUE_SKULL_DAMAGE = 12;
export const WITHER_MAX_SKULLS = 12;
export const WITHER_RECORD_VERSION = 1;

export type WitherStatus = BossState['status'];

export interface WitherState {
  readonly id: number;
  readonly bossState: BossState;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly sideHeadYaws: readonly [number, number];
  readonly targets: readonly [number | null, number | null, number | null];
  readonly skullCooldowns: readonly [number, number, number];
  readonly invulnerableTicks: number;
  readonly hasSpawnExploded: boolean;
  readonly hasDroppedReward: boolean;
}

export interface WitherTickContext {
  world?: ExplosionWorld<unknown>;
  difficulty?: 'peaceful' | 'easy' | 'normal' | 'hard';
  mobGriefing?: boolean; // default true
  /** All candidate targets in world, each with id, x,y,z, alive, isUndead. */
  candidates?: readonly WitherCandidate[];
  /** Deterministic RNG: returns float in [0,1). Seeded per wither+tick if omitted, uses fallback. */
  rng?: () => number;
  /** Whether to actually apply block destruction via world; if false, explosion is computed but not applied. */
  applyBlocks?: boolean;
}

export interface WitherCandidate {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly alive: boolean;
  readonly isUndead?: boolean;
}

export interface WitherTickResult {
  readonly state: WitherState;
  readonly spawnedSkulls: readonly WitherSpawnedSkull[];
  readonly spawnExplosion: readonly [number, number, number] | null;
  readonly healed: number;
}

export interface WitherSpawnedSkull {
  readonly kind: 'normal' | 'blue';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly targetId: number;
  readonly headIndex: number;
}

export interface WitherDamageResult {
  readonly state: WitherState;
  readonly phaseChanged: boolean;
  readonly defeated: boolean;
  readonly damageApplied: number;
}

// Deterministic LCG for wither when no RNG injected
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function createWither(
  id: number,
  x: number, y: number, z: number,
  definition: BossDefinition,
): WitherState {
  if (!Number.isInteger(id) || id < 0) throw new Error('WitherBoss: id must be non-negative integer');
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) throw new Error('WitherBoss: position must be finite');
  const bossState = startBossFight(definition);
  return {
    id,
    bossState: { ...bossState, bossKey: definition.key },
    x, y, z,
    yaw: 0,
    pitch: 0,
    sideHeadYaws: [0, 0],
    targets: [null, null, null],
    skullCooldowns: [WITHER_SIDE_OFFSET, WITHER_SKULL_COOLDOWN, WITHER_SKULL_COOLDOWN],
    invulnerableTicks: WITHER_CHARGE_TICKS,
    hasSpawnExploded: false,
    hasDroppedReward: false,
  };
}

function clampHealth(v: number, max: number): number {
  return Math.max(0, Math.min(max, v));
}

function isUndeadCandidate(c: WitherCandidate): boolean {
  return !!c.isUndead;
}

function distanceSq(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

/** Acquire up to 3 targets deterministically. */
function acquireTargets(
  state: WitherState,
  candidates: readonly WitherCandidate[],
  rangeSq: number,
): readonly [number | null, number | null, number | null] {
  // Filter valid
  const valid = candidates.filter(c => c.alive && !isUndeadCandidate(c) && isFiniteNumber(c.x) && isFiniteNumber(c.y) && isFiniteNumber(c.z));
  // Bound to 30, sorted by id ascending for determinism before distance
  const bounded = valid.slice().sort((a, b) => a.id - b.id).slice(0, 30);
  // Now sort by distance to wither, tie breaker id
  const withDist = bounded.map(c => ({ c, d: distanceSq(state.x, state.y, state.z, c.x, c.y, c.z) }))
    .filter(v => v.d <= rangeSq)
    .sort((a, b) => a.d - b.d || a.c.id - b.c.id);
  const picked: (number | null)[] = [null, null, null];
  const used = new Set<number>();
  for (let head = 0; head < 3; head++) {
    for (const { c } of withDist) {
      if (used.has(c.id)) continue;
      // Also skip if candidate is already one of the existing targets that is still valid? We re-pick fresh each interval.
      picked[head] = c.id;
      used.add(c.id);
      break;
    }
  }
  return picked as [number | null, number | null, number | null];
}

function yawTowards(ox: number, oz: number, tx: number, tz: number): number {
  const dx = tx - ox;
  const dz = tz - oz;
  return Math.atan2(dz, dx) * 180 / Math.PI;
}

/**
 * Main tick. Pure: returns new state plus side effects (spawned skulls, explosion).
 * Deterministic given same state + context + rng sequence.
 */
export function tickWither(
  state: WitherState,
  definition: BossDefinition,
  _tick: number,
  ctx: WitherTickContext = {},
): WitherTickResult {
  if (state.bossState.status === 'DEFEATED') {
    return { state, spawnedSkulls: [], spawnExplosion: null, healed: 0 };
  }
  let bossState = state.bossState;
  let x = state.x, y = state.y, z = state.z;
  let yaw = state.yaw; const pitch = state.pitch;
  const sideYaws = state.sideHeadYaws.slice() as [number, number];
  let targets = state.targets.slice() as [number | null, number | null, number | null];
  const cooldowns = state.skullCooldowns.slice() as [number, number, number];
  let invuln = state.invulnerableTicks;
  let hasExploded = state.hasSpawnExploded;
  let healed = 0;

  // Increment BossFramework ticks via manual emulation (we own 220 not 100)
  const prevTicks = bossState.ticks;
  const newTicks = prevTicks + 1;
  let status = bossState.status;
  if (status === 'SPAWNING' && newTicks >= WITHER_CHARGE_TICKS) {
    status = 'ACTIVE';
    invuln = 0;
  } else if (status === 'SPAWNING') {
    invuln = Math.max(0, WITHER_CHARGE_TICKS - newTicks);
  }
  bossState = { ...bossState, ticks: newTicks, status };

  // Spawn explosion exactly once at transition
  let spawnExplosion: readonly [number, number, number] | null = null;
  if (status === 'ACTIVE' && !hasExploded && newTicks >= WITHER_CHARGE_TICKS) {
    spawnExplosion = [x, y, z];
    hasExploded = true;
    // Explosion block handling is caller's responsibility via computed result; we just signal.
  }

  // Passive regen when ACTIVE and not max
  if (status === 'ACTIVE' && bossState.health < definition.maxHealth && bossState.health > 0) {
    const newHealth = clampHealth(bossState.health + WITHER_REGEN_PER_TICK, definition.maxHealth);
    healed = newHealth - bossState.health;
    if (healed > 0) {
      const phaseIndex = phaseForHealthFraction(definition, newHealth / definition.maxHealth);
      bossState = { ...bossState, health: newHealth, phaseIndex };
    }
  }

  // Target acquisition every 20 ticks when ACTIVE
  const candidates = ctx.candidates ?? [];
  if (status === 'ACTIVE' && newTicks % WITHER_TARGET_ACQUIRE_INTERVAL === 0) {
    const rangeSq = WITHER_TARGET_RANGE * WITHER_TARGET_RANGE;
    const newTargets = acquireTargets({ ...state, bossState, x, y, z } as WitherState, candidates, rangeSq);
    // Validate existing targets still alive/in range; if head's target died, it will be replaced by acquisition.
    // Our acquisition already picks fresh; preserve if still valid and not overdue? Simplify: replace wholesale.
    targets = newTargets.slice() as [number | null, number | null, number | null];
    // Validate that each target is still valid (if candidate disappeared, null it)
    const validIds = new Set(candidates.filter(c => c.alive && !isUndeadCandidate(c)).map(c => c.id));
    for (let i = 0; i < 3; i++) {
      const tid = (targets as (number | null)[])[i] as number | null;
      if (tid !== null && !validIds.has(tid)) (targets as (number | null)[])[i] = null;
    }
  } else if (status === 'ACTIVE') {
    // Invalidate dead/out-of-range targets even between acquire intervals
    const aliveMap = new Map(candidates.map(c => [c.id, c]));
    for (let i = 0; i < 3; i++) {
      const tid = (targets as (number | null)[])[i] as number | null;
      if (tid === null) continue;
      const c = aliveMap.get(tid);
      if (!c || !c.alive || isUndeadCandidate(c) || distanceSq(x, y, z, c.x, c.y, c.z) > WITHER_TARGET_RANGE * WITHER_TARGET_RANGE) {
        (targets as (number | null)[])[i] = null;
      }
    }
  }

  // Update head yaws towards targets if any
  const targetMap = new Map((candidates).map(c => [c.id, c]));
  if ((targets as (number | null)[])[0] !== null) {
    const t = targetMap.get((targets as (number | null)[])[0] as number);
    if (t) yaw = yawTowards(x, z, t.x, t.z);
  }
  for (let i = 1; i < 3; i++) {
    const tid = (targets as (number | null)[])[i] as number | null;
    if (tid !== null) {
      const t = targetMap.get(tid);
      if (t) (sideYaws as number[])[i - 1] = yawTowards(x, z, t.x, t.z);
    }
  }

  // Movement when ACTIVE: hover towards primary target
  if (status === 'ACTIVE') {
    const primaryId = targets[0];
    let tx = x, ty = y, tz = z;
    let hasPrimary = false;
    if (primaryId !== null) {
      const t = targetMap.get(primaryId);
      if (t) { tx = t.x; ty = t.y + 3; tz = t.z; hasPrimary = true; }
    }
    const isArmored = bossState.phaseIndex === 1; // wither definition phases: ranged@1, armored@0.5
    const speed = isArmored ? 0.45 : 0.3;
    const vertSpeed = isArmored ? 0.3 : 0.2;
    if (hasPrimary) {
      const dx = tx - x;
      const dy = ty - y;
      const dz = tz - z;
      const horiz = Math.sqrt(dx * dx + dz * dz);
      if (horiz > 0.1) {
        x += (dx / horiz) * Math.min(speed, horiz);
        z += (dz / horiz) * Math.min(speed, horiz);
        yaw = yawTowards(x, z, tx, tz);
      }
      if (Math.abs(dy) > 0.1) {
        y += Math.sign(dy) * Math.min(vertSpeed, Math.abs(dy));
      }
    } else {
      // Idle hover small bob
      y += Math.sin(newTicks * 0.1) * 0.02;
    }
  }

  // Skull firing
  const spawnedSkulls: WitherSpawnedSkull[] = [];
  const rng = ctx.rng ?? makeRng(state.id * 1000003 + newTicks);
  if (status === 'ACTIVE') {
    const isArmored = bossState.phaseIndex === 1;
    for (let head = 0; head < 3; head++) {
      (cooldowns as number[])[head] = Math.max(0, ((cooldowns as number[])[head] as number) - 1);
      const tid = (targets as (number | null)[])[head] as number | null;
      if (tid === null) continue;
      if (((cooldowns as number[])[head] as number) > 0) continue;
      const t = targetMap.get(tid);
      if (!t) continue;
      // Determine kind: blue only when armored and random 20%
      let kind: 'normal' | 'blue' = 'normal';
      if (isArmored) {
        const roll = rng();
        if (roll < 0.2) kind = 'blue';
        // Central head more likely blue? Keep same prob
      }
      // Compute velocity towards target
      const headOffsets: readonly [number, number, number][] = [
        [0, 1.5, 0],
        [-0.8, 0.8, 0],
        [0.8, 0.8, 0],
      ];
      const off = headOffsets[head]!;
      const ox = x + off[0];
      const oy = y + off[1];
      const oz = z + off[2];
      const dx = t.x - ox;
      const dy = t.y + 0.5 - oy;
      const dz = t.z - oz;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      // Actually use constants: normal 1.5, blue 0.9
      const s = kind === 'blue' ? 0.9 : 1.5;
      const vx = (dx / len) * s;
      const vy = (dy / len) * s;
      const vz = (dz / len) * s;
      spawnedSkulls.push({ kind, x: ox, y: oy, z: oz, vx, vy, vz, targetId: tid, headIndex: head });
      (cooldowns as number[])[head] = WITHER_SKULL_COOLDOWN;
    }
  }

  const newState: WitherState = {
    id: state.id,
    bossState,
    x, y, z,
    yaw, pitch,
    sideHeadYaws: sideYaws,
    targets,
    skullCooldowns: cooldowns,
    invulnerableTicks: invuln,
    hasSpawnExploded: hasExploded,
    hasDroppedReward: state.hasDroppedReward,
  };
  return { state: newState, spawnedSkulls, spawnExplosion, healed };
}

export function damageWither(
  state: WitherState,
  definition: BossDefinition,
  amount: number,
  isProjectile: boolean,
): WitherDamageResult {
  if (state.bossState.status === 'DEFEATED' || !isFiniteNumber(amount) || amount <= 0) {
    return { state, phaseChanged: false, defeated: false, damageApplied: 0 };
  }
  // Invulnerable during charge
  if (state.bossState.status === 'SPAWNING' || state.invulnerableTicks > 0) {
    return { state, phaseChanged: false, defeated: false, damageApplied: 0 };
  }
  // Armored projectile immunity
  const isArmored = state.bossState.phaseIndex === 1 || (state.bossState.health / definition.maxHealth) <= WITHER_ARMORED_THRESHOLD;
  // Use phaseIndex computed, but also threshold check for edge where heal just crossed
  if (isArmored && isProjectile) {
    return { state, phaseChanged: false, defeated: false, damageApplied: 0 };
  }
  const result = damageBoss(state.bossState, definition, amount);
  const newState: WitherState = { ...state, bossState: result.state };
  // If defeated and not yet dropped reward, mark? Actually reward is separate
  return { state: newState, phaseChanged: result.phaseChanged, defeated: result.defeated, damageApplied: amount };
}

export function healWither(state: WitherState, definition: BossDefinition, amount: number): WitherState {
  if (state.bossState.status === 'DEFEATED' || !isFiniteNumber(amount) || amount <= 0) return state;
  const newBoss = healBoss(state.bossState, definition, amount);
  if (newBoss === state.bossState) return state;
  return { ...state, bossState: newBoss };
}

/** Heal on kill: +5 if victim not undead. */
export function onWitherKill(state: WitherState, definition: BossDefinition, victimIsUndead: boolean): WitherState {
  if (victimIsUndead) return state;
  return healWither(state, definition, WITHER_KILL_HEAL);
}

export function isWitherArmored(state: WitherState, definition: BossDefinition): boolean {
  const fraction = state.bossState.health / definition.maxHealth;
  return fraction <= WITHER_ARMORED_THRESHOLD || state.bossState.phaseIndex === 1;
}

export function bossBarProgress(state: WitherState): number {
  if (state.bossState.status === 'SPAWNING') {
    // Charge progress 0->1
    const elapsed = WITHER_CHARGE_TICKS - state.invulnerableTicks;
    return Math.max(0, Math.min(1, elapsed / WITHER_CHARGE_TICKS));
  }
  return Math.max(0, Math.min(1, state.bossState.health / WITHER_MAX_HEALTH));
}

export interface SerializedWither {
  readonly v: 1;
  readonly id: number;
  readonly boss: ReturnType<typeof serializeBoss>;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly sideHeadYaws: readonly [number, number];
  readonly targets: readonly [number | null, number | null, number | null];
  readonly skullCooldowns: readonly [number, number, number];
  readonly invulnerableTicks: number;
  readonly hasSpawnExploded: boolean;
  readonly hasDroppedReward: boolean;
}

export function serializeWither(state: WitherState): SerializedWither {
  return {
    v: 1,
    id: state.id,
    boss: serializeBoss(state.bossState),
    x: state.x, y: state.y, z: state.z,
    yaw: state.yaw, pitch: state.pitch,
    sideHeadYaws: state.sideHeadYaws,
    targets: state.targets,
    skullCooldowns: state.skullCooldowns,
    invulnerableTicks: state.invulnerableTicks,
    hasSpawnExploded: state.hasSpawnExploded,
    hasDroppedReward: state.hasDroppedReward,
  };
}

export function deserializeWither(input: unknown): WitherState {
  if (typeof input !== 'object' || input === null) throw new Error('WitherBoss: malformed payload');
  const r = input as Record<string, unknown>;
  if (r.v !== 1) throw new Error(`WitherBoss: unsupported version ${String(r.v)}`);
  if (!Number.isInteger(r.id) || (r.id as number) < 0) throw new Error('WitherBoss: id must be non-negative integer');
  if (!isFiniteNumber(r.x) || !isFiniteNumber(r.y) || !isFiniteNumber(r.z)) throw new Error('WitherBoss: position must be finite');
  if (!isFiniteNumber(r.yaw) || !isFiniteNumber(r.pitch)) throw new Error('WitherBoss: yaw/pitch must be finite');
  const side = r.sideHeadYaws as unknown;
  if (!Array.isArray(side) || side.length !== 2 || !side.every(isFiniteNumber)) throw new Error('WitherBoss: sideHeadYaws must be [number,number]');
  const targets = r.targets as unknown;
  if (!Array.isArray(targets) || targets.length !== 3 || !targets.every(v => v === null || (Number.isInteger(v) && (v as number) >= 0))) throw new Error('WitherBoss: targets must be [id|null x3]');
  const cds = r.skullCooldowns as unknown;
  if (!Array.isArray(cds) || cds.length !== 3 || !cds.every(v => Number.isInteger(v) && (v as number) >= 0)) throw new Error('WitherBoss: skullCooldowns must be [int x3]');
  if (!Number.isInteger(r.invulnerableTicks) || (r.invulnerableTicks as number) < 0) throw new Error('WitherBoss: invulnerableTicks must be non-negative integer');
  if (typeof r.hasSpawnExploded !== 'boolean' || typeof r.hasDroppedReward !== 'boolean') throw new Error('WitherBoss: hasSpawnExploded/hasDroppedReward must be boolean');
  const bossState = deserializeBoss(r.boss);
  return {
    id: r.id as number,
    bossState,
    x: r.x as number, y: r.y as number, z: r.z as number,
    yaw: r.yaw as number, pitch: r.pitch as number,
    sideHeadYaws: side as [number, number],
    targets: targets as [number | null, number | null, number | null],
    skullCooldowns: cds as [number, number, number],
    invulnerableTicks: r.invulnerableTicks as number,
    hasSpawnExploded: r.hasSpawnExploded as boolean,
    hasDroppedReward: r.hasDroppedReward as boolean,
  };
}

export function serializeWithers(states: readonly WitherState[]): SerializedWither[] {
  return states.map(serializeWither);
}

export function deserializeWithers(input: unknown): WitherState[] {
  if (!Array.isArray(input)) throw new Error('WitherBoss: withers payload must be array');
  return input.map(deserializeWither);
}

/** Protected blocks for wither explosions: bedrock, portal, wither skull? */
export const WITHER_PROTECTED_IDS = new Set<number>([6, 55]);

export function shouldWitherDestroyBlock(blockId: number, mobGriefing: boolean): boolean {
  if (!mobGriefing) return false;
  if (WITHER_PROTECTED_IDS.has(blockId)) return false;
  // Unbreakable blocks hardness Infinity already filtered via isDestroyable? We'll double guard.
  return true;
}

/** Helper for Game to compute wither explosion via core, passing protection filter. */
export function witherExplosionWorld<S>(
  base: ExplosionWorld<S>,
  mobGriefing: boolean,
): ExplosionWorld<S> {
  return {
    getBlockState: base.getBlockState,
    isAir: base.isAir,
    isDestroyable: (s) => {
      if (!mobGriefing) return false;
      if (!base.isDestroyable(s)) return false;
      // If base can answer protection via high resistance, respect it
      return true;
    },
    blastResistance: base.blastResistance,
    dropFor: base.dropFor,
  };
}
