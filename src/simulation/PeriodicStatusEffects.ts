/**
 * Periodic player status effects (296): vanilla poison / regeneration /
 * wither ticks.
 *
 * Vanilla `MobEffectInstance.tick` asks the effect
 * `shouldApplyEffectTickThisTick(duration, amplifier)` with
 * `interval = base >> amplifier` (`interval > 0 ? duration % interval == 0 :
 * true`) and only then counts the duration down. Poison (base 25) deals 1
 * magic damage while health > 1, regeneration (base 50) heals 1 while below
 * max health and wither (base 40) deals 1 wither damage that can kill.
 *
 * This module is pure: it owns no clocks or state. The schedule is a function
 * of the effect's remaining duration and amplifier only, so an effect restored
 * from a save (292) keeps exactly the same cadence. The caller runs
 * {@link tickPeriodicStatusEffects} once per unpaused fixed tick, before the
 * duration count-down, and routes damage/heal through its own mode, armor and
 * death rules.
 */

import { createResourceId, type ResourceId } from '../data/ResourceId';

/** Vanilla poison interval base (ticks). */
export const POISON_INTERVAL_TICKS = 25;
/** Vanilla regeneration interval base (ticks). */
export const REGENERATION_INTERVAL_TICKS = 50;
/** Vanilla wither interval base (ticks). */
export const WITHER_INTERVAL_TICKS = 40;
/** Fixed simulation rate the durations are converted with. */
export const PERIODIC_TICKS_PER_SECOND = 20;

export type PeriodicEffectKind = 'poison' | 'regeneration' | 'wither';

/** Deterministic application order (status-effect registry order). */
export const PERIODIC_EFFECT_ORDER: readonly PeriodicEffectKind[] = Object.freeze([
  'poison',
  'regeneration',
  'wither',
]);

const BASE_INTERVAL: Readonly<Record<PeriodicEffectKind, number>> = {
  poison: POISON_INTERVAL_TICKS,
  regeneration: REGENERATION_INTERVAL_TICKS,
  wither: WITHER_INTERVAL_TICKS,
};

const TYPE_IDS: Readonly<Record<PeriodicEffectKind, ResourceId>> = {
  poison: createResourceId('minecraft', 'effect/poison'),
  regeneration: createResourceId('minecraft', 'effect/regeneration'),
  wither: createResourceId('minecraft', 'effect/wither'),
};

function isKind(kind: unknown): kind is PeriodicEffectKind {
  return kind === 'poison' || kind === 'regeneration' || kind === 'wither';
}

/** Status-effect type id (`minecraft:effect/<kind>`) of a periodic kind. */
export function periodicEffectTypeId(kind: PeriodicEffectKind): ResourceId {
  return TYPE_IDS[kind];
}

/**
 * Ticks between applications: `max(1, base >> amplifier)` (vanilla applies
 * every tick once the shift reaches 0). The amplifier is floored and clamped
 * to [0, 31] because JavaScript shifts wrap at 32. Unknown kinds → 0.
 */
export function periodicIntervalTicks(kind: PeriodicEffectKind, amplifier: number): number {
  if (!isKind(kind)) return 0;
  const amp = Number.isFinite(amplifier) ? Math.min(31, Math.max(0, Math.floor(amplifier))) : 0;
  return Math.max(1, BASE_INTERVAL[kind] >> amp);
}

/** Remaining duration in whole fixed ticks: `max(0, round(seconds · 20))`. */
export function remainingDurationTicks(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(0, Math.round(seconds * PERIODIC_TICKS_PER_SECOND));
}

/**
 * Vanilla schedule: apply on this tick iff there is remaining duration and it
 * is divisible by the interval (checked before the tick's count-down).
 */
export function shouldApplyPeriodicTick(
  kind: PeriodicEffectKind,
  remainingTicks: number,
  amplifier: number,
): boolean {
  const interval = periodicIntervalTicks(kind, amplifier);
  if (interval <= 0) return false;
  if (!Number.isInteger(remainingTicks) || remainingTicks <= 0) return false;
  return remainingTicks % interval === 0;
}

export type PeriodicDamageReason = 'magic' | 'wither';

export type PeriodicEffectAction =
  | { readonly type: 'damage'; readonly kind: PeriodicEffectKind; readonly amount: 1; readonly reason: PeriodicDamageReason }
  | { readonly type: 'heal'; readonly kind: PeriodicEffectKind; readonly amount: 1 };

/**
 * What a due effect does to a target with `health` / `maxHealth`: poison 1
 * magic damage only while health > 1 (so it never takes the last half
 * heart), wither 1 wither damage (may kill), regeneration heal 1 only while
 * below max. Non-finite health or non-positive health (dead) → nothing.
 */
export function resolvePeriodicEffect(
  kind: PeriodicEffectKind,
  health: number,
  maxHealth: number,
): PeriodicEffectAction | null {
  if (!isKind(kind) || !Number.isFinite(health) || !Number.isFinite(maxHealth) || health <= 0) return null;
  switch (kind) {
    case 'poison':
      return health > 1 ? { type: 'damage', kind, amount: 1, reason: 'magic' } : null;
    case 'wither':
      return { type: 'damage', kind, amount: 1, reason: 'wither' };
    case 'regeneration':
      return health < maxHealth ? { type: 'heal', kind, amount: 1 } : null;
  }
}

/** Minimal live view of an active effect (satisfied by `StatusEffectInstance`). */
export interface PeriodicEffectView {
  /** Remaining duration in seconds. */
  readonly duration: number;
  readonly amplifier: number;
}

/** Minimal effect lookup (satisfied by `StatusEffectManager`). */
export interface PeriodicEffectSource {
  get(typeId: ResourceId): PeriodicEffectView | undefined;
}

/** Health owner the actions are applied to (the caller's rules decide outcomes). */
export interface PeriodicEffectTarget {
  readonly health: number;
  readonly maxHealth: number;
  damage(amount: number, reason: PeriodicDamageReason): void;
  heal(amount: number): void;
}

/**
 * One fixed-tick pass in {@link PERIODIC_EFFECT_ORDER}. Each effect is read
 * live from `effects` immediately before it is evaluated, so effects cleared
 * by a death earlier in the pass (respawn clears effects) are skipped, and
 * health is read live so the poison floor / regen cap see prior actions.
 * Returns the actions handed to the target (the target's own rules may still
 * refuse them, e.g. creative mode or i-frames).
 */
export function tickPeriodicStatusEffects(
  effects: PeriodicEffectSource,
  target: PeriodicEffectTarget,
): PeriodicEffectAction[] {
  const applied: PeriodicEffectAction[] = [];
  for (const kind of PERIODIC_EFFECT_ORDER) {
    const inst = effects.get(TYPE_IDS[kind]);
    if (!inst) continue;
    const ticks = remainingDurationTicks(inst.duration);
    if (!shouldApplyPeriodicTick(kind, ticks, inst.amplifier)) continue;
    const action = resolvePeriodicEffect(kind, target.health, target.maxHealth);
    if (!action) continue;
    if (action.type === 'damage') target.damage(action.amount, action.reason);
    else target.heal(action.amount);
    applied.push(action);
  }
  return applied;
}
