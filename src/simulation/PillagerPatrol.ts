/**
 * Pillager patrols (291): deterministic, rate-limited patrol spawning near the
 * player plus a small owner that reuses the 284 raider entity backend and the
 * 288 pillager combat system over a dedicated patrol `EntityManager`.
 *
 * - `decidePatrolAttempt` — pure planner: gate precedence (no RNG draws on a
 *   gate skip), then a normative draw order (chance → anchor tries → size →
 *   captain → members). Exactly one captain per plan.
 * - `nextPatrolCooldown` — 6000 + nextInt(600) fixed ticks.
 * - `PillagerPatrolSystem` — cooldown countdown, one live roster, rollback on
 *   spawn failure, exactly-once death consumption, distance despawn, combat.
 *
 * Raid isolation (I6): nothing here imports or touches `RaidState`. The owner
 * reports captain deaths through a callback; Game maps that to its 285
 * `grantBadOmen` seam. Patrols are transient (never persisted).
 */
import type { EntityRegistry } from '../data/EntityType';
import type { ResourceId } from '../data/ResourceId';
import type { CollisionResolver, ShapeWorld } from '../world/CollisionResolver';
import type { EntityManager } from './EntityManager';
import type { PlayerTarget } from './HostileMobBaseline';
import {
  createEntityManagerRaidBackend,
  type RaidEntityBackend,
  type RaidEntityHandle,
} from './RaidEntityBackend';
import { RaiderCombatSystem } from './RaiderCombatBehavior';
import { isNight } from './SleepFramework';

export const PATROL_TYPE_KEY = 'pillager';
/** Accumulated play ticks (persisted `time_played`) before patrols may spawn: 5 in-game days (12000 ticks/day here). */
export const PATROL_MIN_WORLD_TICKS = 60000;
/** Minimum fixed ticks between natural attempts (half an in-game day here). */
export const PATROL_ATTEMPT_INTERVAL_TICKS = 6000;
/** Cooldown jitter: cooldown ∈ [INTERVAL, INTERVAL + JITTER - 1]. */
export const PATROL_ATTEMPT_JITTER_TICKS = 600;
/** Success iff `nextInt(DENOMINATOR) === 0` (1 in 5). */
export const PATROL_SPAWN_CHANCE_DENOMINATOR = 5;
/** Per-axis anchor offset magnitude ∈ [MIN_OFFSET, MIN_OFFSET + SPREAD - 1] = [24, 47]. */
export const PATROL_MIN_OFFSET = 24;
export const PATROL_OFFSET_SPREAD = 24;
export const PATROL_ANCHOR_TRIES = 4;
export const PATROL_MIN_SIZE = 2;
export const PATROL_MAX_SIZE = 4;
/** Non-captain member offset ∈ [-SCATTER, SCATTER] on X and Z. */
export const PATROL_MEMBER_SCATTER = 4;
/** Members farther than this (horizontal) from the player despawn without omen. */
export const PATROL_DESPAWN_DISTANCE = 128;
/** Bad Omen levels granted per captain kill (Game clamps to the 285 cap of 5). */
export const BAD_OMEN_PER_CAPTAIN = 1;

export type PatrolSkipReason =
  | 'INVALID_PLAYER'
  | 'DISABLED'
  | 'PEACEFUL'
  | 'SPECTATOR'
  | 'RAID_ACTIVE'
  | 'PATROL_ALIVE'
  | 'WORLD_TOO_YOUNG'
  | 'NIGHT'
  | 'NEAR_VILLAGE'
  | 'CHANCE'
  | 'NO_SURFACE';

export interface PatrolAttemptContext {
  readonly doMobSpawning: boolean;
  readonly difficulty: string;
  readonly spectator: boolean;
  /** Persisted `statistics.time_played` fixed ticks. */
  readonly worldTicks: number;
  /** 0..23999 day tick (274). */
  readonly dayTick: number;
  readonly raidActive: boolean;
  readonly patrolAlive: boolean;
  readonly nearVillage: boolean;
  readonly playerX: number;
  readonly playerY: number;
  readonly playerZ: number;
  /** Feet Y for a valid outdoor surface at integer column (x, z), else null. */
  readonly surfaceY: (x: number, z: number) => number | null;
}

export interface PatrolMemberPlan {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly captain: boolean;
}

export type PatrolAttemptDecision =
  | {
      readonly kind: 'SPAWN';
      readonly anchorX: number;
      readonly anchorY: number;
      readonly anchorZ: number;
      readonly members: readonly PatrolMemberPlan[];
    }
  | { readonly kind: 'SKIP'; readonly reason: PatrolSkipReason };

/** Minimal RNG surface (satisfied by `SeedRng`). */
export interface PatrolRng {
  nextInt(maxExclusive: number): number;
  nextBoolean(): boolean;
  nextFloat(): number;
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function safeSurface(ctx: PatrolAttemptContext, x: number, z: number): number | null {
  try {
    const y = ctx.surfaceY(x, z);
    return finite(y) ? y : null;
  } catch {
    return null;
  }
}

/**
 * Evaluate one patrol attempt. Natural attempts check every gate in the
 * normative order and consume no draws on a gate skip; `force` (debug seam)
 * keeps INVALID_PLAYER..SPECTATOR but skips the RAID_ACTIVE..CHANCE gates but keeps the identical draw order from
 * the anchor step onward. Never throws.
 */
export function decidePatrolAttempt(
  ctx: PatrolAttemptContext,
  rng: PatrolRng,
  opts: { readonly force?: boolean } = {},
): PatrolAttemptDecision {
  const force = opts.force === true;
  if (!finite(ctx.playerX) || !finite(ctx.playerY) || !finite(ctx.playerZ)) {
    return { kind: 'SKIP', reason: 'INVALID_PLAYER' };
  }
  if (ctx.doMobSpawning === false) return { kind: 'SKIP', reason: 'DISABLED' };
  if (ctx.difficulty === 'peaceful') return { kind: 'SKIP', reason: 'PEACEFUL' };
  if (ctx.spectator === true) return { kind: 'SKIP', reason: 'SPECTATOR' };
  if (!force) {
    if (ctx.raidActive === true) return { kind: 'SKIP', reason: 'RAID_ACTIVE' };
    if (ctx.patrolAlive === true) return { kind: 'SKIP', reason: 'PATROL_ALIVE' };
    if (!finite(ctx.worldTicks) || ctx.worldTicks < PATROL_MIN_WORLD_TICKS) {
      return { kind: 'SKIP', reason: 'WORLD_TOO_YOUNG' };
    }
    if (!finite(ctx.dayTick) || isNight(ctx.dayTick)) return { kind: 'SKIP', reason: 'NIGHT' };
    if (ctx.nearVillage === true) return { kind: 'SKIP', reason: 'NEAR_VILLAGE' };
    if (rng.nextInt(PATROL_SPAWN_CHANCE_DENOMINATOR) !== 0) {
      return { kind: 'SKIP', reason: 'CHANCE' };
    }
  }

  const px = Math.floor(ctx.playerX);
  const pz = Math.floor(ctx.playerZ);
  let anchor: { x: number; y: number; z: number } | null = null;
  for (let t = 0; t < PATROL_ANCHOR_TRIES && anchor === null; t++) {
    const sx = rng.nextBoolean() ? 1 : -1;
    const dx = PATROL_MIN_OFFSET + rng.nextInt(PATROL_OFFSET_SPREAD);
    const sz = rng.nextBoolean() ? 1 : -1;
    const dz = PATROL_MIN_OFFSET + rng.nextInt(PATROL_OFFSET_SPREAD);
    const ax = px + sx * dx;
    const az = pz + sz * dz;
    const y = safeSurface(ctx, ax, az);
    if (y !== null) anchor = { x: ax, y, z: az };
  }
  if (anchor === null) return { kind: 'SKIP', reason: 'NO_SURFACE' };

  const size = PATROL_MIN_SIZE + rng.nextInt(PATROL_MAX_SIZE - PATROL_MIN_SIZE + 1);
  const members: PatrolMemberPlan[] = [
    {
      x: anchor.x + 0.5,
      y: anchor.y,
      z: anchor.z + 0.5,
      yaw: rng.nextFloat() * Math.PI * 2,
      captain: true,
    },
  ];
  const span = PATROL_MEMBER_SCATTER * 2 + 1;
  for (let i = 1; i < size; i++) {
    const ox = rng.nextInt(span) - PATROL_MEMBER_SCATTER;
    const oz = rng.nextInt(span) - PATROL_MEMBER_SCATTER;
    const yaw = rng.nextFloat() * Math.PI * 2;
    const mx = anchor.x + ox;
    const mz = anchor.z + oz;
    const y = safeSurface(ctx, mx, mz);
    if (y === null) continue;
    members.push({ x: mx + 0.5, y, z: mz + 0.5, yaw, captain: false });
  }
  return {
    kind: 'SPAWN',
    anchorX: anchor.x + 0.5,
    anchorY: anchor.y,
    anchorZ: anchor.z + 0.5,
    members,
  };
}

/** Fixed ticks until the next natural attempt: [6000, 6599]. */
export function nextPatrolCooldown(rng: PatrolRng): number {
  return PATROL_ATTEMPT_INTERVAL_TICKS + rng.nextInt(PATROL_ATTEMPT_JITTER_TICKS);
}

export type PatrolClearReason = 'dispose' | 'pagehide' | 'raid-start' | 'replace' | 'despawn';

export interface PatrolSnapshot {
  readonly generation: number;
  readonly memberIds: readonly number[];
  readonly captainId: number | null;
  readonly anchor: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly cooldownTicks: number;
  readonly attempts: number;
  readonly lastDecision: PatrolAttemptDecision | null;
  readonly lastApplyOk: boolean | null;
}

export interface PatrolTickInput {
  /** Built lazily: only invoked when a natural attempt is due. */
  readonly context: () => PatrolAttemptContext;
  readonly simTick: number;
  readonly dt: number;
  readonly playerX: number;
  readonly playerZ: number;
  readonly getPlayerTarget: () => PlayerTarget | null;
  readonly world: ShapeWorld;
  readonly resolver: CollisionResolver;
  readonly onPlayerDamaged: (amount: number, sourceX: number, sourceZ: number, reason: string) => void;
  readonly playerMeleeRequested: boolean;
  readonly onCaptainKilled: () => void;
}

interface RosterMember {
  readonly handle: RaidEntityHandle;
  readonly captain: boolean;
}

export interface PillagerPatrolSystemOptions {
  readonly manager: EntityManager;
  readonly registry: EntityRegistry;
  readonly dimension: ResourceId;
  readonly rng: PatrolRng;
  /** Override the production EntityManager adapter (tests / failure injection). */
  readonly backend?: RaidEntityBackend;
}

/**
 * Owns one patrol roster, the attempt cooldown, and a dedicated
 * RaiderCombatSystem. Deaths are consumed exactly once; only the captain's
 * combat death invokes `onCaptainKilled`.
 */
export class PillagerPatrolSystem {
  private readonly manager: EntityManager;
  private readonly backend: RaidEntityBackend;
  private readonly combat: RaiderCombatSystem;
  private readonly rng: PatrolRng;
  private roster: RosterMember[] = [];
  private anchor: { x: number; y: number; z: number } | null = null;
  private generation = 0;
  private cooldown: number;
  private attempts = 0;
  private lastDecision: PatrolAttemptDecision | null = null;
  private lastApplyOk: boolean | null = null;

  constructor(opts: PillagerPatrolSystemOptions) {
    this.manager = opts.manager;
    this.rng = opts.rng;
    this.backend =
      opts.backend ??
      createEntityManagerRaidBackend({
        manager: opts.manager,
        registry: opts.registry,
        dimension: opts.dimension,
      });
    this.combat = new RaiderCombatSystem({ manager: opts.manager, registry: opts.registry });
    this.cooldown = nextPatrolCooldown(this.rng);
  }

  /** Whether a patrol roster is live (non-empty). */
  isAlive(): boolean {
    return this.roster.length > 0;
  }

  getMemberIds(): number[] {
    return this.roster.map((m) => m.handle.entityId);
  }

  getCaptainId(): number | null {
    return this.roster.find((m) => m.captain)?.handle.entityId ?? null;
  }

  getCooldownTicks(): number {
    return this.cooldown;
  }

  snapshot(): PatrolSnapshot {
    return {
      generation: this.generation,
      memberIds: this.getMemberIds(),
      captainId: this.getCaptainId(),
      anchor: this.anchor ? { ...this.anchor } : null,
      cooldownTicks: this.cooldown,
      attempts: this.attempts,
      lastDecision: this.lastDecision,
      lastApplyOk: this.lastApplyOk,
    };
  }

  /**
   * One natural attempt now (cooldown is redrawn regardless of outcome). A
   * SPAWN is applied; spawn failures roll back to an empty roster.
   */
  runAttempt(ctx: PatrolAttemptContext): PatrolAttemptDecision {
    const effective: PatrolAttemptContext = { ...ctx, patrolAlive: ctx.patrolAlive || this.isAlive() };
    const decision = decidePatrolAttempt(effective, this.rng);
    this.attempts++;
    this.lastDecision = decision;
    this.lastApplyOk = decision.kind === 'SPAWN' ? this.apply(decision) : null;
    this.cooldown = nextPatrolCooldown(this.rng);
    return decision;
  }

  /**
   * Debug seam: bypass the RAID_ACTIVE..CHANCE gates and the cooldown, replace
   * any live patrol (no omen), and apply a planned patrol.
   */
  forceSpawn(ctx: PatrolAttemptContext): PatrolAttemptDecision {
    this.clear('replace');
    const decision = decidePatrolAttempt(ctx, this.rng, { force: true });
    this.lastDecision = decision;
    this.lastApplyOk = decision.kind === 'SPAWN' ? this.apply(decision) : null;
    return decision;
  }

  private apply(decision: Extract<PatrolAttemptDecision, { kind: 'SPAWN' }>): boolean {
    if (this.roster.length > 0) return false;
    const generation = this.generation + 1;
    const spawned: RosterMember[] = [];
    try {
      for (const m of decision.members) {
        const handle = this.backend.spawn({
          typeKey: PATROL_TYPE_KEY,
          x: m.x,
          y: m.y,
          z: m.z,
          yaw: m.yaw,
          waveIndex: 0,
          raidGeneration: generation,
        });
        spawned.push({ handle, captain: m.captain });
      }
    } catch {
      for (const s of spawned) this.backend.despawn(s.handle);
      return false;
    }
    if (spawned.filter((s) => s.captain).length !== 1) {
      for (const s of spawned) this.backend.despawn(s.handle);
      return false;
    }
    this.generation = generation;
    this.roster = spawned;
    this.anchor = { x: decision.anchorX, y: decision.anchorY, z: decision.anchorZ };
    this.combat.clear();
    return true;
  }

  /**
   * Consume one member death exactly once. Returns whether the id was a live
   * member and whether it was the captain. Unknown/duplicate ids → both false.
   */
  consumeDeath(entityId: number): { member: boolean; captain: boolean } {
    const idx = this.roster.findIndex((m) => m.handle.entityId === entityId);
    if (idx < 0) return { member: false, captain: false };
    const captain = this.roster[idx]?.captain === true;
    this.roster.splice(idx, 1);
    if (this.roster.length === 0) this.anchor = null;
    return { member: true, captain };
  }

  /** Remove every member without granting anything. */
  clear(_reason: PatrolClearReason): void {
    for (const m of this.roster) this.backend.despawn(m.handle);
    this.roster = [];
    this.anchor = null;
    this.combat.clear();
  }

  /**
   * Apply combat damage to a member; a death is consumed and the captain's
   * death invokes `onCaptainKilled`. Returns whether the member died.
   */
  damageMember(entityId: number, amount: number, onCaptainKilled: () => void): boolean {
    if (!this.roster.some((m) => m.handle.entityId === entityId)) return false;
    const result = this.combat.damageRaider(entityId, amount, (id) => {
      this.handleDeath(id, onCaptainKilled);
    });
    return result.died;
  }

  private handleDeath(entityId: number, onCaptainKilled: () => void): void {
    const { captain } = this.consumeDeath(entityId);
    if (captain) onCaptainKilled();
  }

  /** Drop members whose entity vanished and despawn members beyond range (no omen). */
  private pruneAndDespawn(playerX: number, playerZ: number): void {
    if (this.roster.length === 0) return;
    const keep: RosterMember[] = [];
    for (const m of this.roster) {
      if (!this.backend.isAlive(m.handle)) continue;
      const e = this.manager.get(m.handle.entityId);
      if (e && finite(playerX) && finite(playerZ)) {
        const d = Math.hypot(e.transform.x - playerX, e.transform.z - playerZ);
        if (d > PATROL_DESPAWN_DISTANCE) {
          this.backend.despawn(m.handle);
          continue;
        }
      }
      keep.push(m);
    }
    this.roster = keep;
    if (keep.length === 0) {
      this.anchor = null;
      this.combat.clear();
    }
  }

  /** One unpaused fixed tick: prune/despawn → cooldown/attempt → combat. */
  tick(input: PatrolTickInput): void {
    this.pruneAndDespawn(input.playerX, input.playerZ);
    this.cooldown -= 1;
    if (this.cooldown <= 0) {
      let ctx: PatrolAttemptContext | null = null;
      try {
        ctx = input.context();
      } catch {
        ctx = null;
      }
      if (ctx) {
        this.runAttempt(ctx);
      } else {
        this.cooldown = nextPatrolCooldown(this.rng);
      }
    }
    this.tickCombat(input);
  }

  /** Combat only (debug seam + tick tail). */
  tickCombat(input: Omit<PatrolTickInput, 'context'>): void {
    const ids = this.getMemberIds();
    if (ids.length === 0 && this.combat.getProjectileCount() === 0) return;
    const anchor = this.anchor ?? { x: input.playerX, y: 0, z: input.playerZ };
    this.combat.tick({
      dt: input.dt,
      simTick: input.simTick,
      paused: false,
      center: anchor,
      trackedIds: ids,
      getPlayerTarget: input.getPlayerTarget,
      world: input.world,
      resolver: input.resolver,
      onPlayerDamaged: input.onPlayerDamaged,
      onRaiderDied: (id) => this.handleDeath(id, input.onCaptainKilled),
      playerMeleeRequested: input.playerMeleeRequested,
    });
  }
}
