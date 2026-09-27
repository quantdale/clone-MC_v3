/**
 * Throwable splash potion entities (295). Pure simulation over 142
 * `stepProjectile`: vanilla throw vectors (player `shootFromRotation` with the
 * −20° pitch offset at speed 0.5; witch aim with `+0.2·horizontal` lift at
 * speed 0.75), gravity 0.05 / drag 0.99 flight, shatter on the first block or
 * entity contact, vanilla splash falloff (`1 − dist/4`, 1.0 on a direct hit)
 * and the instant/duration application plan, plus the vanilla witch potion
 * choice with a deterministic per-(entity, tick) roll. No Game, rendering or
 * persistence here — see `openspec/changes/295-throwable-splash-potion-entities/design.md`.
 *
 * Instant effects (`instant_damage`/`harming`, `instant_health`/`healing`)
 * are resolved here only; they are deliberately NOT registered in the status
 * effect registry (they have no duration).
 */
import type { CollisionResolver, ShapeWorld } from '../world/CollisionResolver';
import { stepProjectile, type ProjectileState, type ProjectileTarget } from './ProjectileCore';
import {
  POTION_SPLASH_RADIUS,
  buildSplashPayload,
  createPotionContents,
  type PotionContents,
  type PotionEffectData,
} from '../data/PotionItemData';

export const SPLASH_POTION_GRAVITY = 0.05;
export const SPLASH_POTION_DRAG = 0.99;
export const SPLASH_POTION_MAX_AGE_TICKS = 1200;
export const SPLASH_POTION_HITBOX = 0.25;
export const SPLASH_POTION_OWNER_IMMUNITY_TICKS = 5;
/** Live potion cap: spawns past it are refused (nothing consumed). */
export const SPLASH_POTION_CAP = 64;
export const PLAYER_POTION_THROW_SPEED = 0.5;
/** Vanilla lifts the throw's vertical component by 20° (`shootFromRotation(..., -20, ...)`). */
export const PLAYER_POTION_PITCH_OFFSET = (20 * Math.PI) / 180;
export const PLAYER_POTION_EYE_HEIGHT = 1.62;
export const POTION_SPAWN_EYE_DROP = 0.1;
export const WITCH_POTION_THROW_SPEED = 0.75;
export const WITCH_EYE_HEIGHT = 1.62;
/** Vanilla projectile pick margin: entity boxes are inflated by 0.3 for hits. */
export const SPLASH_POTION_HIT_MARGIN = 0.3;
/** Vertical inflate of the splash box (vanilla `inflate(4, 2, 4)`). */
export const SPLASH_VERTICAL_REACH = 2;
export const INSTANT_DAMAGE_BASE = 6;
export const INSTANT_HEALTH_BASE = 4;
/** Duration effects apply only when the scaled duration exceeds this (vanilla `i > 20`). */
export const MIN_SPLASH_DURATION_TICKS = 20;
/** Bounded shatter / throw history kept for observability. */
export const SPLASH_HISTORY_LIMIT = 16;

export const WITCH_SLOWNESS_MIN_DISTANCE = 8;
export const WITCH_POISON_MIN_HEALTH = 8;
export const WITCH_WEAKNESS_MAX_DISTANCE = 3;
export const WITCH_WEAKNESS_CHANCE = 0.25;

export type PotionThrower = 'player' | 'witch';
export type WitchPotionChoice = 'harming' | 'poison' | 'slowness' | 'weakness';
export type SplashTargetKind = 'player' | 'raid' | 'patrol';

export interface Vec3Velocity {
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
}

/** One living candidate for hits/splash; position is the feet. */
export interface SplashTarget {
  readonly kind: SplashTargetKind;
  readonly entityId: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly height: number;
}

export interface SplashOwner {
  readonly kind: SplashTargetKind;
  readonly entityId: number;
}

export interface LiveSplashPotion {
  readonly id: number;
  readonly state: ProjectileState;
  readonly contents: PotionContents;
  readonly thrower: PotionThrower;
  readonly owner: SplashOwner | null;
}

export interface SplashEffectApplication {
  readonly typeId: string;
  readonly durationSeconds: number;
  readonly amplifier: number;
}

export interface SplashApplication {
  readonly damage: number;
  readonly heal: number;
  readonly effects: readonly SplashEffectApplication[];
}

export interface SplashAffected {
  readonly target: SplashTarget;
  readonly intensity: number;
  readonly direct: boolean;
  readonly application: SplashApplication;
}

export interface SplashShatter {
  readonly potionId: number;
  readonly thrower: PotionThrower;
  readonly cause: 'block' | 'entity';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly directHit: SplashTarget | null;
  readonly effects: readonly PotionEffectData[];
  readonly affected: readonly SplashAffected[];
}

const INSTANT_DAMAGE_IDS: ReadonlySet<string> = new Set([
  'minecraft:effect/instant_damage',
  'minecraft:effect/harming',
]);
const INSTANT_HEALTH_IDS: ReadonlySet<string> = new Set([
  'minecraft:effect/instant_health',
  'minecraft:effect/healing',
]);

export function isInstantDamageEffect(typeId: string): boolean {
  return INSTANT_DAMAGE_IDS.has(typeId);
}

export function isInstantHealthEffect(typeId: string): boolean {
  return INSTANT_HEALTH_IDS.has(typeId);
}

function finite(...values: number[]): boolean {
  return values.every((v) => typeof v === 'number' && Number.isFinite(v));
}

/** True only for SPLASH contents (NORMAL and LINGERING are not throwable here). */
export function isThrowableSplash(contents: PotionContents | null | undefined): boolean {
  return !!contents && contents.kind === 'SPLASH' && Array.isArray(contents.customEffects);
}

export type SplashThrowRefusal =
  | 'NO_INTERACT'
  | 'DEATH_SCREEN'
  | 'EMPTY_HAND'
  | 'NOT_POTION'
  | 'NOT_SPLASH';

/**
 * Player use-action rule (295): whether the held stack can be thrown and
 * whether throwing consumes it. Spectators (`canInteract` false) and the death
 * screen refuse; only a non-empty Potion stack with SPLASH contents throws;
 * `consume` mirrors 265 `depletesItems` (survival/adventure yes, creative no).
 * A later cap refusal must still leave the stack untouched.
 */
export function splashThrowDecision(input: {
  canInteract: boolean;
  deathScreenOpen: boolean;
  depletesItems: boolean;
  stackCount: number;
  isPotionItem: boolean;
  contents: PotionContents | null | undefined;
}): { throw: true; consume: boolean } | { throw: false; reason: SplashThrowRefusal } {
  if (!input.canInteract) return { throw: false, reason: 'NO_INTERACT' };
  if (input.deathScreenOpen) return { throw: false, reason: 'DEATH_SCREEN' };
  if (!(input.stackCount > 0)) return { throw: false, reason: 'EMPTY_HAND' };
  if (!input.isPotionItem) return { throw: false, reason: 'NOT_POTION' };
  if (!isThrowableSplash(input.contents)) return { throw: false, reason: 'NOT_SPLASH' };
  return { throw: true, consume: input.depletesItems };
}

/**
 * Player throw velocity (blocks/tick). Repo convention: pitch up positive,
 * yaw with −Z forward. Vanilla lifts only the vertical component by 20°.
 */
export function playerPotionThrowVelocity(yaw: number, pitch: number): Vec3Velocity | null {
  if (!finite(yaw, pitch)) return null;
  const cp = Math.cos(pitch);
  const dx = -Math.sin(yaw) * cp;
  const dy = Math.sin(pitch + PLAYER_POTION_PITCH_OFFSET);
  const dz = -Math.cos(yaw) * cp;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 0)) return null;
  const k = PLAYER_POTION_THROW_SPEED / len;
  return { vx: dx * k, vy: dy * k, vz: dz * k };
}

/** Spawn point for a player-thrown potion (eye − 0.1). */
export function playerPotionSpawn(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x, y: y + PLAYER_POTION_EYE_HEIGHT - POTION_SPAWN_EYE_DROP, z };
}

/** Vanilla witch aim: `(dx, dy + 0.2·d3, dz)` at 0.75 toward the target eye (−1.1). */
export function witchPotionThrowVelocity(
  from: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
): Vec3Velocity | null {
  if (!finite(from.x, from.y, from.z, target.x, target.y, target.z)) return null;
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d3 = Math.hypot(dx, dz);
  const dy = target.y + PLAYER_POTION_EYE_HEIGHT - 1.1 - from.y;
  const ay = dy + d3 * 0.2;
  const len = Math.hypot(dx, ay, dz);
  if (!(len > 0)) return null;
  const k = WITCH_POTION_THROW_SPEED / len;
  return { vx: dx * k, vy: ay * k, vz: dz * k };
}

/** Spawn point for a witch-thrown potion (eye − 0.1). */
export function witchPotionSpawn(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x, y: y + WITCH_EYE_HEIGHT - POTION_SPAWN_EYE_DROP, z };
}

/**
 * Splash intensity for one target: 1 for the direct hit, else `1 − dist/4`
 * when the impact is inside the inflated box (±4 horizontal, ±2 around the
 * body vertically) and `distSq < 16` to the feet; 0 = unaffected.
 */
export function splashIntensity(
  impact: { x: number; y: number; z: number },
  target: SplashTarget,
  direct: boolean,
): number {
  if (direct) return 1;
  if (!finite(impact.x, impact.y, impact.z, target.x, target.y, target.z, target.height)) return 0;
  const dx = target.x - impact.x;
  const dy = target.y - impact.y;
  const dz = target.z - impact.z;
  if (Math.abs(dx) > POTION_SPLASH_RADIUS || Math.abs(dz) > POTION_SPLASH_RADIUS) return 0;
  if (impact.y < target.y - SPLASH_VERTICAL_REACH) return 0;
  if (impact.y > target.y + target.height + SPLASH_VERTICAL_REACH) return 0;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq >= POTION_SPLASH_RADIUS * POTION_SPLASH_RADIUS) return 0;
  return Math.max(0, Math.min(1, 1 - Math.sqrt(distSq) / POTION_SPLASH_RADIUS));
}

/**
 * Vanilla application plan at `intensity`: instant harming/healing amounts
 * `floor(i·(base << amp) + 0.5)`; duration effects scaled in ticks and kept
 * only above 20 ticks (duration returned in seconds, amplifier unchanged).
 */
export function resolveSplashApplication(
  effects: readonly PotionEffectData[],
  intensity: number,
): SplashApplication {
  const i = finite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0;
  let damage = 0;
  let heal = 0;
  const out: SplashEffectApplication[] = [];
  if (i <= 0) return { damage, heal, effects: out };
  for (const effect of effects) {
    const amp = Math.max(0, Math.min(30, Math.floor(effect.amplifier)));
    if (isInstantDamageEffect(effect.typeId)) {
      damage += Math.floor(i * (INSTANT_DAMAGE_BASE << amp) + 0.5);
    } else if (isInstantHealthEffect(effect.typeId)) {
      heal += Math.floor(i * (INSTANT_HEALTH_BASE << amp) + 0.5);
    } else {
      const ticks = Math.floor(i * effect.duration * 20 + 0.5);
      if (ticks > MIN_SPLASH_DURATION_TICKS) {
        out.push({ typeId: effect.typeId, durationSeconds: ticks / 20, amplifier: effect.amplifier });
      }
    }
  }
  return { damage, heal, effects: out };
}

/** Vanilla witch rule table (target is never a raider here). */
export function chooseWitchPotion(input: {
  horizontalDistance: number;
  targetHealth: number;
  hasEffect: (key: string) => boolean;
  roll: number;
}): WitchPotionChoice {
  const d3 = input.horizontalDistance;
  if (d3 >= WITCH_SLOWNESS_MIN_DISTANCE && !input.hasEffect('slowness')) return 'slowness';
  if (input.targetHealth >= WITCH_POISON_MIN_HEALTH && !input.hasEffect('poison')) return 'poison';
  if (d3 <= WITCH_WEAKNESS_MAX_DISTANCE && !input.hasEffect('weakness') && input.roll < WITCH_WEAKNESS_CHANCE) {
    return 'weakness';
  }
  return 'harming';
}

/** Deterministic roll in [0, 1) from (entity id, sim tick). */
export function witchPotionRoll(entityId: number, simTick: number): number {
  let h = (Math.floor(entityId) | 0) ^ Math.imul(Math.floor(simTick) | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Vanilla witch potion contents; splash keeps the full base duration. */
export function witchPotionContents(choice: WitchPotionChoice): PotionContents {
  switch (choice) {
    case 'poison':
      return createPotionContents({
        base: 'minecraft:potion/poison',
        kind: 'SPLASH',
        customEffects: [{ typeId: 'minecraft:effect/poison', duration: 45, amplifier: 0 }],
      });
    case 'slowness':
      return createPotionContents({
        base: 'minecraft:potion/slowness',
        kind: 'SPLASH',
        customEffects: [{ typeId: 'minecraft:effect/slowness', duration: 90, amplifier: 0 }],
      });
    case 'weakness':
      return createPotionContents({
        base: 'minecraft:potion/weakness',
        kind: 'SPLASH',
        customEffects: [{ typeId: 'minecraft:effect/weakness', duration: 90, amplifier: 0 }],
      });
    case 'harming':
    default:
      return createPotionContents({
        base: 'minecraft:potion/harming',
        kind: 'SPLASH',
        customEffects: [{ typeId: 'minecraft:effect/instant_damage', duration: 0, amplifier: 0 }],
      });
  }
}

function sameOwner(owner: SplashOwner | null, target: SplashTarget): boolean {
  return !!owner && owner.kind === target.kind && owner.entityId === target.entityId;
}

/** Candidates a potion can hit/affect: witch potions only see the player (I9). */
export function splashScope(thrower: PotionThrower, targets: readonly SplashTarget[]): SplashTarget[] {
  return thrower === 'witch' ? targets.filter((t) => t.kind === 'player') : [...targets];
}

/** Owns every live splash potion; the Game applies returned shatters. */
export class SplashPotionSystem {
  private potions: LiveSplashPotion[] = [];
  private nextId = 1;

  get count(): number {
    return this.potions.length;
  }

  getPotions(): readonly LiveSplashPotion[] {
    return this.potions;
  }

  clear(): void {
    this.potions = [];
  }

  /** Add a potion; null (refused) past the cap or for a non-finite state. */
  spawn(input: {
    x: number;
    y: number;
    z: number;
    velocity: Vec3Velocity;
    contents: PotionContents;
    thrower: PotionThrower;
    owner: SplashOwner | null;
  }): LiveSplashPotion | null {
    const { x, y, z, velocity } = input;
    if (!finite(x, y, z, velocity.vx, velocity.vy, velocity.vz)) return null;
    if (!isThrowableSplash(input.contents)) return null;
    if (this.potions.length >= SPLASH_POTION_CAP) return null;
    const potion: LiveSplashPotion = {
      id: this.nextId++,
      state: { x, y, z, vx: velocity.vx, vy: velocity.vy, vz: velocity.vz, ownerId: null, ageTicks: 0 },
      contents: input.contents,
      thrower: input.thrower,
      owner: input.owner,
    };
    this.potions.push(potion);
    return potion;
  }

  /** Step every potion once; returns the shatters produced this tick. */
  tick(world: ShapeWorld, resolver: CollisionResolver, targets: readonly SplashTarget[]): SplashShatter[] {
    const shatters: SplashShatter[] = [];
    const surviving: LiveSplashPotion[] = [];
    for (const potion of this.potions) {
      const scope = splashScope(potion.thrower, targets);
      const projectileTargets: ProjectileTarget[] = scope.map((t, i) => ({
        id: i,
        x: t.x,
        y: t.y + t.height / 2,
        z: t.z,
        radius: t.height / 2 + SPLASH_POTION_HIT_MARGIN,
      }));
      const ownerIndex = scope.findIndex((t) => sameOwner(potion.owner, t));
      const step = stepProjectile(
        world,
        resolver,
        { ...potion.state, ownerId: ownerIndex >= 0 ? ownerIndex : null },
        projectileTargets,
        {
          gravity: SPLASH_POTION_GRAVITY,
          drag: SPLASH_POTION_DRAG,
          maxAgeTicks: SPLASH_POTION_MAX_AGE_TICKS,
          ownerImmunityTicks: SPLASH_POTION_OWNER_IMMUNITY_TICKS,
          hitboxSize: SPLASH_POTION_HITBOX,
        },
      );
      if (step.expired) continue;
      const hitIndex = step.hitEntityId;
      if (hitIndex === null && !step.hitBlock) {
        surviving.push({ ...potion, state: { ...step.state, ownerId: null } });
        continue;
      }
      const direct = hitIndex !== null ? scope[hitIndex] ?? null : null;
      const impact = { x: step.state.x, y: step.state.y, z: step.state.z };
      const effects = buildSplashPayload(potion.contents).effects;
      const affected: SplashAffected[] = [];
      for (const target of scope) {
        const isDirect = direct === target;
        const intensity = splashIntensity(impact, target, isDirect);
        if (intensity <= 0) continue;
        affected.push({ target, intensity, direct: isDirect, application: resolveSplashApplication(effects, intensity) });
      }
      shatters.push({
        potionId: potion.id,
        thrower: potion.thrower,
        cause: direct ? 'entity' : 'block',
        x: impact.x,
        y: impact.y,
        z: impact.z,
        directHit: direct,
        effects,
        affected,
      });
    }
    this.potions = surviving;
    return shatters;
  }
}
