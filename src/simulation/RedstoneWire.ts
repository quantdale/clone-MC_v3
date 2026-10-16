/**
 * Redstone wire connectivity (155): the connection-shape rules deciding which neighbours a wire
 * meets (including stepping up and down a block), the local rule computing a wire's own power from
 * its sources and connected neighbours, and the projection into the 006/007 block-state property
 * record.
 *
 * `WireWorld` is injected rather than imported, mirroring 154's `RedstonePowerSource` seam, so this
 * module needs no `World`/`BlockRegistry` dependency and tests supply plain object literals.
 *
 * `computeWirePower` reads each neighbour's *stored* power rather than recomputing it recursively:
 * iterating this local rule to a fixed point with deterministic ordering and loop protection is
 * 156's titled scope. Because attenuation is always at least 1, a wire can never sustain its own
 * signal through a neighbour — which is what makes that future fixed-point iteration terminate.
 *
 * No network propagation/ordering (156), no components (157-161), no `Game` wiring, no wire mesh
 * model, no quasi-connectivity — see `openspec/changes/155-redstone-wire-connectivity/design.md`.
 */
import {
  attenuate,
  clampSignal,
  getIndirectPower,
  offsetInDirection,
  MIN_SIGNAL_STRENGTH,
  type RedstonePowerSource,
} from './RedstoneSignal';

/** How a wire meets one horizontal neighbour. */
export type WireConnection = 'none' | 'side' | 'up';

/** The four horizontal directions a wire can connect along. */
export type HorizontalDirection = 'north' | 'south' | 'east' | 'west';

/** All horizontal directions, in a fixed deterministic order. */
export const HORIZONTAL_DIRECTIONS: readonly HorizontalDirection[] = ['north', 'south', 'east', 'west'];

/** One wire's resolved connection per horizontal direction. */
export type WireConnections = Readonly<Record<HorizontalDirection, WireConnection>>;

/** The caller-supplied world surface this module needs (injected, 154's seam). */
export interface WireWorld {
  /** Whether the block at this position is redstone wire. */
  isWire(x: number, y: number, z: number): boolean;
  /** Whether the block at this position is a full solid block (blocks climbing, conducts). */
  isSolid(x: number, y: number, z: number): boolean;
  /** Whether a non-wire block here accepts or emits redstone (a component). */
  connectsToRedstone(x: number, y: number, z: number): boolean;
  /** The stored power of the wire at this position; `0` when it is not a wire. */
  getWirePower(x: number, y: number, z: number): number;
}

/**
 * The connection shape for each horizontal direction. Branch order is fixed and significant:
 * a wire/connectable neighbour wins over a step-up, and a step-up wins over a descent.
 *
 * - `'side'` when the neighbour is a wire or connectable component;
 * - else `'up'` when the neighbour is solid, a wire sits above it, and the block above *this* wire
 *   is not solid (a solid ceiling caps the wire and forbids climbing);
 * - else `'side'` when the neighbour is non-solid and a wire sits below it (a descent; vanilla has
 *   no distinct "down" state — the lower wire reports its own `'up'`);
 * - else `'none'`.
 */
export function resolveWireConnections(
  world: WireWorld,
  x: number,
  y: number,
  z: number,
): WireConnections {
  const ceilingIsSolid = world.isSolid(x, y + 1, z);
  const result: Record<HorizontalDirection, WireConnection> = {
    north: 'none',
    south: 'none',
    east: 'none',
    west: 'none',
  };

  for (const direction of HORIZONTAL_DIRECTIONS) {
    const [nx, ny, nz] = offsetInDirection(x, y, z, direction);

    if (world.isWire(nx, ny, nz) || world.connectsToRedstone(nx, ny, nz)) {
      result[direction] = 'side';
      continue;
    }
    if (world.isSolid(nx, ny, nz)) {
      if (!ceilingIsSolid && world.isWire(nx, ny + 1, nz)) {
        result[direction] = 'up';
      }
      continue;
    }
    if (world.isWire(nx, ny - 1, nz)) {
      result[direction] = 'side';
    }
  }

  return result;
}

/**
 * The power this wire should hold: the maximum of the external power 154 reports at its position
 * and each connected neighbouring wire's stored power attenuated by one. Never exceeds either
 * contributor, and always lands within 154's signal domain.
 */
export function computeWirePower(
  world: WireWorld,
  powerSource: RedstonePowerSource,
  x: number,
  y: number,
  z: number,
): number {
  let best = clampSignal(getIndirectPower(powerSource, x, y, z));
  const connections = resolveWireConnections(world, x, y, z);

  for (const direction of HORIZONTAL_DIRECTIONS) {
    const connection = connections[direction];
    if (connection === 'none') continue;
    const [nx, ny, nz] = offsetInDirection(x, y, z, direction);

    // Resolve which cell actually holds the connected wire: the neighbour itself, the cell above
    // it (a climb), or the cell below it (a descent).
    let wy = ny;
    if (connection === 'up') {
      wy = ny + 1;
    } else if (!world.isWire(nx, ny, nz) && world.isWire(nx, ny - 1, nz)) {
      wy = ny - 1;
    }
    if (!world.isWire(nx, wy, nz)) continue;

    const contributed = attenuate(world.getWirePower(nx, wy, nz), 1);
    if (contributed > best) best = contributed;
  }

  return best;
}

/**
 * Project `power` and `connections` into the property record `REDSTONE_WIRE_SCHEMA` enumerates,
 * ready for `World.setBlockState`. `power` is clamped into the signal domain.
 */
export function wireStateProperties(
  power: number,
  connections: WireConnections,
): Record<string, number | string> {
  return {
    power: clampSignal(power),
    north: connections.north,
    south: connections.south,
    east: connections.east,
    west: connections.west,
  };
}

/** The unpowered, fully-disconnected wire state (matches the block's registered default). */
export const DEFAULT_WIRE_CONNECTIONS: WireConnections = Object.freeze({
  north: 'none',
  south: 'none',
  east: 'none',
  west: 'none',
} as const);

/** Re-exported for callers projecting an unpowered wire without importing 154 directly. */
export const UNPOWERED_WIRE_POWER = MIN_SIGNAL_STRENGTH;
