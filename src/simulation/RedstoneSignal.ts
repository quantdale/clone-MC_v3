/**
 * Redstone signal core (154): the foundational power model every later redstone change (155-173)
 * reads — a direction vocabulary, the 0-15 signal domain and its helpers, an injected
 * `RedstonePowerSource` world surface, and the direct/indirect power queries.
 *
 * Deliberately import-free (152/141's precedent) and world-agnostic: `RedstonePowerSource` is
 * injected rather than imported, the same seam 145's `PassiveMobWorld` and 148's spawn sinks use,
 * so tests supply a plain object literal and no `World`/`BlockRegistry` dependency exists.
 *
 * No wire block or propagation (155), no scheduled update order (156), no components (157-161),
 * no block-registry additions, no `Game` wiring, and no quasi-connectivity ("BUD") emulation —
 * see `openspec/changes/154-redstone-signal-core/design.md`.
 */

/**
 * A block-face direction. Minecraft convention: north = -z, south = +z, east = +x, west = -x,
 * up = +y, down = -y. Declared locally (rather than imported from 099's `StructureTemplate.ts`,
 * which has a structurally identical type) to avoid a `simulation → worldgen` dependency;
 * TypeScript's structural typing keeps the two freely interchangeable.
 */
export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

/** All six directions, in a fixed deterministic order. */
export const DIRECTIONS: readonly Direction[] = ['north', 'south', 'east', 'west', 'up', 'down'];

/** Each direction's opposite. Involutive: applying it twice returns the original. */
export const OPPOSITE_DIRECTION: Readonly<Record<Direction, Direction>> = Object.freeze({
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
  up: 'down',
  down: 'up',
} as const);

/** Each direction's unit `(dx, dy, dz)` offset. */
export const DIRECTION_OFFSETS: Readonly<Record<Direction, readonly [number, number, number]>> = Object.freeze({
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
} as const);

/** The position one block from `(x, y, z)` in `direction`. */
export function offsetInDirection(
  x: number,
  y: number,
  z: number,
  direction: Direction,
): [number, number, number] {
  const [dx, dy, dz] = DIRECTION_OFFSETS[direction];
  return [x + dx, y + dy, z + dz];
}

/** The lowest legal signal strength (no power). */
export const MIN_SIGNAL_STRENGTH = 0;
/** The highest legal signal strength. */
export const MAX_SIGNAL_STRENGTH = 15;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Constrain `value` to an integer within `[MIN_SIGNAL_STRENGTH, MAX_SIGNAL_STRENGTH]`. A
 * non-finite input yields `MIN_SIGNAL_STRENGTH` (treated as no signal).
 */
export function clampSignal(value: number): number {
  if (!isFiniteNumber(value)) return MIN_SIGNAL_STRENGTH;
  return Math.max(MIN_SIGNAL_STRENGTH, Math.min(MAX_SIGNAL_STRENGTH, Math.trunc(value)));
}

/**
 * `signal` decayed by one per block of `distance`, floored at `MIN_SIGNAL_STRENGTH`. A
 * non-positive or non-finite `distance` is treated as `0`, so `attenuate(s, 0) === clampSignal(s)`.
 */
export function attenuate(signal: number, distance: number): number {
  const base = clampSignal(signal);
  const steps = isFiniteNumber(distance) && distance > 0 ? Math.trunc(distance) : 0;
  return Math.max(MIN_SIGNAL_STRENGTH, base - steps);
}

/** The clamped maximum of `values`, or `MIN_SIGNAL_STRENGTH` when empty (reads as unpowered). */
export function strongestSignalFrom(values: readonly number[]): number {
  let best = MIN_SIGNAL_STRENGTH;
  for (const value of values) {
    const clamped = clampSignal(value);
    if (clamped > best) best = clamped;
  }
  return best;
}

/**
 * The caller-supplied world surface. `direction` is the face of the queried block that power would
 * be emitted *from*, toward the neighbour asking.
 */
export interface RedstonePowerSource {
  /** Power that drives components but is not re-conducted through solid blocks. */
  getWeakPower(x: number, y: number, z: number, direction: Direction): number;
  /** Power that makes the receiving block itself a power source. */
  getStrongPower(x: number, y: number, z: number, direction: Direction): number;
  /** Whether the block re-emits power it receives (a full solid block does). */
  isConductive(x: number, y: number, z: number): boolean;
}

/**
 * The maximum strong power any of the six neighbours emits into `(x, y, z)`. Reads only
 * `getStrongPower` — weak power never contributes here. Every source value is clamped, so a
 * misbehaving source cannot produce an out-of-domain result. Exactly 6 source calls.
 */
export function getDirectPower(
  source: RedstonePowerSource,
  x: number,
  y: number,
  z: number,
): number {
  let best = MIN_SIGNAL_STRENGTH;
  for (const direction of DIRECTIONS) {
    const [nx, ny, nz] = offsetInDirection(x, y, z, direction);
    // The neighbour's face pointing back at (x, y, z).
    const power = clampSignal(source.getStrongPower(nx, ny, nz, OPPOSITE_DIRECTION[direction]));
    if (power > best) best = power;
  }
  return best;
}

/**
 * The maximum of `(x, y, z)`'s own direct power and the direct power of each *conductive*
 * neighbour — vanilla's "a strongly-powered solid block powers what touches it" rule. Recurses
 * exactly one level (a conductive neighbour's `getDirectPower`, never its `getIndirectPower`), so
 * two adjacent conductive blocks cannot loop. At most 42 source calls.
 */
export function getIndirectPower(
  source: RedstonePowerSource,
  x: number,
  y: number,
  z: number,
): number {
  let best = getDirectPower(source, x, y, z);
  for (const direction of DIRECTIONS) {
    const [nx, ny, nz] = offsetInDirection(x, y, z, direction);
    if (!source.isConductive(nx, ny, nz)) continue;
    const conducted = getDirectPower(source, nx, ny, nz);
    if (conducted > best) best = conducted;
  }
  return best;
}

/** Whether `(x, y, z)` sees any power at all (directly or conducted through a solid neighbour). */
export function isBlockPowered(
  source: RedstonePowerSource,
  x: number,
  y: number,
  z: number,
): boolean {
  return getIndirectPower(source, x, y, z) > MIN_SIGNAL_STRENGTH;
}
