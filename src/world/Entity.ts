/**
 * General entity core (129).
 *
 * A stable, minimal runtime entity model shared by future entity kinds: a
 * dense monotonic runtime id, a registered type (017 `EntityRegistry`), a
 * transform (position + yaw/pitch), velocity, a lifecycle state, and the
 * dimension it currently belongs to. This is the data shape only; identity
 * minting, storage, and lifecycle transitions are owned by `EntityManager`
 * (129, `src/simulation/EntityManager.ts`). Physics/collision (130),
 * persistence (131), chunk-based activation (132), and the dirty data
 * tracker (133) build on this shape without changing it, and are explicit
 * non-goals here; `ItemEntityManager`/`XpOrbManager` are not migrated onto it.
 */
import type { ResourceId } from '../data/ResourceId';

/** An entity's spatial transform: position plus horizontal/vertical look angles (degrees). */
export interface EntityTransform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
}

/** An entity's stored motion, consumed by future physics (130). */
export interface EntityVelocity {
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
}

/** The zero-velocity constant, the default for a spawn that supplies none. */
export const ZERO_VELOCITY: EntityVelocity = Object.freeze({ vx: 0, vy: 0, vz: 0 });

/** An entity's lifecycle state. `ACTIVE` entities are live; `REMOVED` entities are dead. */
export type EntityLifecycleState = 'ACTIVE' | 'REMOVED';

/** A live (or formerly live) entity instance: identity, registered type, transform, velocity, dimension, lifecycle. */
export interface EntityInstance {
  /** Stable non-negative integer, unique for the lifetime of its owning `EntityManager`. */
  readonly id: number;
  /** The 017 `EntityRegistry` resource id this instance was spawned as. Immutable after spawn. */
  readonly typeId: ResourceId;
  transform: EntityTransform;
  velocity: EntityVelocity;
  /** The dimension this entity currently belongs to; the one identity field mutable post-spawn. */
  dimension: ResourceId;
  state: EntityLifecycleState;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Whether every field of `t` is a finite number. */
export function isValidTransform(t: EntityTransform): boolean {
  return (
    isFiniteNumber(t.x) &&
    isFiniteNumber(t.y) &&
    isFiniteNumber(t.z) &&
    isFiniteNumber(t.yaw) &&
    isFiniteNumber(t.pitch)
  );
}

/** Whether every field of `v` is a finite number. */
export function isValidVelocity(v: EntityVelocity): boolean {
  return isFiniteNumber(v.vx) && isFiniteNumber(v.vy) && isFiniteNumber(v.vz);
}
