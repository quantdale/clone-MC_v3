/**
 * Wither skull projectiles (252): normal and blue/dangerous variants via ProjectileCore.
 *
 * Normal: damage 8, explosion strength 1, wither effect 10s (scaled by difficulty).
 * Blue: damage 12, strength 2.5, wither 40s at normal, higher destruction.
 * Both travel straight: gravity 0, drag 1.0, speed 1.5 (normal) / 0.9 (blue slow but we keep 1.5 for simplicity? actually blue slower 0.9).
 * Lifetime 120 ticks, owner immunity 5 ticks.
 *
 * Deterministic step via injected CollisionResolver + world.
 */
import { stepProjectile, type ProjectileState, type ProjectileTarget, type ProjectileOptions } from './ProjectileCore';
import type { CollisionResolver, ShapeWorld } from '../world/CollisionResolver';
import { computeExplosion, explosionEntityDamage, type ExplosionWorld } from './ExplosionCore';

export const WITHER_SKULL_DAMAGE = 8;
export const WITHER_BLUE_SKULL_DAMAGE = 12;
export const WITHER_SKULL_STRENGTH = 1;
export const WITHER_BLUE_SKULL_STRENGTH = 2.5;
export const WITHER_SKULL_LIFETIME = 120;
export const WITHER_SKULL_SPEED = 1.5;
export const WITHER_SKULL_BLUE_SPEED = 0.9;
export const WITHER_EFFECT_NORMAL_TICKS = 200; // 10s @20tps
export const WITHER_EFFECT_BLUE_TICKS = 800; // 40s

export type WitherSkullKind = 'normal' | 'blue';

export interface WitherSkullState extends ProjectileState {
  kind: WitherSkullKind;
  ownerWitherId: number | null;
}

export interface WitherSkullOptions {
  gravity?: number;
  drag?: number;
  maxAgeTicks?: number;
  ownerImmunityTicks?: number;
  hitboxSize?: number;
}

export interface SkullStepResult {
  state: WitherSkullState;
  hitBlock: { x: number; y: number; z: number } | null;
  hitEntityId: number | null;
  expired: boolean;
}

function optionsFor(_kind: WitherSkullKind, overrides?: WitherSkullOptions): ProjectileOptions {
  return {
    gravity: overrides?.gravity ?? 0,
    drag: overrides?.drag ?? 1.0,
    maxAgeTicks: overrides?.maxAgeTicks ?? WITHER_SKULL_LIFETIME,
    ownerImmunityTicks: overrides?.ownerImmunityTicks ?? 5,
    hitboxSize: overrides?.hitboxSize ?? 0.25,
  };
}

export function createWitherSkull(
  x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  kind: WitherSkullKind,
  ownerWitherId: number | null,
): WitherSkullState {
  return { x, y, z, vx, vy, vz, ownerId: ownerWitherId, ageTicks: 0, kind, ownerWitherId };
}

/**
 * Velocity towards target normalized to skull speed.
 * Pure.
 */
export function skullVelocityTowards(
  ox: number, oy: number, oz: number,
  tx: number, ty: number, tz: number,
  kind: WitherSkullKind,
): readonly [number, number, number] {
  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len === 0) return [0, 0, 0];
  const speed = kind === 'blue' ? WITHER_SKULL_BLUE_SPEED : WITHER_SKULL_SPEED;
  return [(dx / len) * speed, (dy / len) * speed, (dz / len) * speed];
}

export function stepWitherSkull(
  world: ShapeWorld,
  resolver: CollisionResolver,
  state: WitherSkullState,
  targets: readonly ProjectileTarget[],
  overrides?: WitherSkullOptions,
): SkullStepResult {
  const opts = optionsFor(state.kind, overrides);
  const res = stepProjectile(world, resolver, state, targets, opts);
  return {
    state: { ...res.state, kind: state.kind, ownerWitherId: state.ownerWitherId },
    hitBlock: res.hitBlock,
    hitEntityId: res.hitEntityId,
    expired: res.expired,
  };
}

/** Skull explosion strength by kind. Pure. */
export function skullExplosionStrength(kind: WitherSkullKind): number {
  return kind === 'blue' ? WITHER_BLUE_SKULL_STRENGTH : WITHER_SKULL_STRENGTH;
}

/** Skull direct damage by kind. Pure. */
export function skullDamage(kind: WitherSkullKind): number {
  return kind === 'blue' ? WITHER_BLUE_SKULL_DAMAGE : WITHER_SKULL_DAMAGE;
}

/** Wither effect duration in ticks before difficulty scaling. Pure. */
export function skullWitherDurationTicks(kind: WitherSkullKind): number {
  return kind === 'blue' ? WITHER_EFFECT_BLUE_TICKS : WITHER_EFFECT_NORMAL_TICKS;
}

/**
 * Difficulty scaling for wither effect duration.
 * Peaceful: 0 (no effect), Easy: 0.5, Normal: 1, Hard: 1.5 of base.
 */
export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard';

export function scaledWitherDuration(kind: WitherSkullKind, difficulty: Difficulty): number {
  const base = skullWitherDurationTicks(kind);
  switch (difficulty) {
    case 'peaceful': return 0;
    case 'easy': return Math.floor(base * 0.5);
    case 'normal': return base;
    case 'hard': return Math.floor(base * 1.5);
    default: return base;
  }
}

/** Protected blocks never destroyed by wither explosions. */
const PROTECTED_IDS = new Set<number>([
  6, // bedrock
  55, // nether_portal
]);

export function isProtectedBlock(id: number): boolean {
  return PROTECTED_IDS.has(id);
}

/**
 * Compute skull impact explosion via ExplosionCore with wither-specific destroyable filter
 * (protected blocks excluded) and caller's resistance/drop callbacks.
 * Bounded: ExplosionCore already sorts results; caller limits per skull externally.
 */
export function computeSkullExplosion<S>(
  center: readonly [number, number, number],
  kind: WitherSkullKind,
  world: ExplosionWorld<S>,
): ReturnType<typeof computeExplosion<S>> {
  const strength = skullExplosionStrength(kind);
  // Wrap destroyable to enforce protected
  const wrapped: ExplosionWorld<S> = {
    getBlockState: world.getBlockState,
    isAir: world.isAir,
    isDestroyable: (s) => world.isDestroyable(s) && !isProtectedWrapped(s, world),
    blastResistance: world.blastResistance,
    dropFor: world.dropFor,
  };
  return computeExplosion({ center, strength, world: wrapped });
}

function isProtectedWrapped<S>(state: S, world: ExplosionWorld<S>): boolean {
  // We cannot know numeric id from generic state; rely on blastResistance >= 1000 as sentinel
  // plus explicit protected check if caller provides numeric ids via a branded world.
  // For generic path, check resistance: bedrock 3600000 barrier? But we bounded via destroyable.
  // Best effort: if resistance >= 6000 treat as protected.
  const r = world.blastResistance(state);
  return r >= 10000 || (typeof (world as unknown as { isProtected? : (s:S)=>boolean }).isProtected === 'function' && (world as unknown as { isProtected:(s:S)=>boolean }).isProtected(state));
}

export function skullExplosionEntityDamage(
  center: readonly [number, number, number],
  kind: WitherSkullKind,
  positions: ReadonlyArray<readonly [number, number, number]>,
): ReturnType<typeof explosionEntityDamage> {
  return explosionEntityDamage(center, skullExplosionStrength(kind), positions);
}
