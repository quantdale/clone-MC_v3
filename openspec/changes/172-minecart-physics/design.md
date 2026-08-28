# Design: 172-minecart-physics

## Context/current state
- 171's `RailBlockStates.ts` defines the ten `RailShape` values; nothing consumes them yet. Vanilla
  minecarts are entities whose motion is constrained by the rail shape in their cell — this change
  models that as a pure one-tick advance over a caller-supplied world seam, exactly like 169's
  explosion core (and with the same zero-registry footprint).

## Target state
- `src/simulation/MinecartPhysics.ts` holding `MinecartState`, the `MinecartWorld` seam, the
  shape-following rules, off-rail physics, and the collision rule.

## Invariants
- `tickMinecart` never mutates its inputs and is deterministic for a fixed world.
- On rails, `vy = 0` for straights; `vy = vx` (`ascending_east`), `vy = -vx` (`ascending_west`),
  `vy = -vz` (`ascending_north`), `vy = vz` (`ascending_south`) — one block up per block horizontal.
- On rails, speed components are clamped to `[-MINECART_MAX_SPEED, MINECART_MAX_SPEED]`.
- A corner turns the cart only from a pure incoming axis (the other horizontal component exactly 0);
  any other arrival zeroes both horizontal components (stops at the corner).
- Off rails: `vy -= MINECART_GRAVITY`; `vx`/`vz` scale by `MINECART_OFFRAIL_DECAY`.
- If the next cell is blocking, the cart returns the current position with all velocities zeroed.

## API and data model
```ts
// src/simulation/MinecartPhysics.ts (new)
export interface MinecartState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
}
export interface MinecartWorld {
  getRailShapeAt(x: number, y: number, z: number): RailShape | null;
  isBlocking(x: number, y: number, z: number): boolean;
}
export const MINECART_MAX_SPEED = 0.4;
export const MINECART_GRAVITY = 0.04;
export const MINECART_OFFRAIL_DECAY = 0.98;
export function minecartOnRails(state: MinecartState, world: MinecartWorld): boolean;
export function tickMinecart(state: MinecartState, world: MinecartWorld): MinecartState;
```

## Control/data flow
1. The caller (a future wiring change) owns the cart's `MinecartState` and the `MinecartWorld` seam
   (rail shapes from block states, `isBlocking` from solidity).
2. Each fixed tick it calls `tickMinecart(state, world)` and stores the returned state.
3. `minecartOnRails` is the caller's cheap "is the cart riding" query.

## Detailed behavior
- The rail-following rules are the deterministic essence of vanilla's per-tick cart update: straights
  slide; ascents couple `vy` to the slope direction (rising toward the elevated end, falling away);
  corners turn pure-axis arrivals; speed is clamped; off-rail carts fall and coast down.
- The corner rule requires `vx === 0` or `vz === 0` exactly — this is sound because a cart reaching
  a corner from a straight arrives with a zeroed cross axis (straights zero it), and a cart
  approaching diagonally stops instead of teleporting onto an axis.
- Collisions are cell-level: the cart cannot *enter* a blocking cell; approaching carts stop at the
  last non-blocking position, and falling carts land on the cell above solid ground.

## Failure modes
- No function throws for well-formed inputs; non-finite inputs produce NaN positions (documented —
  the caller is responsible for valid state, consistent with the section's other cores).

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- `tickMinecart` is O(1) (one shape query + one blocking query); no hot-path or stored-data change.

## Testing seams
- The whole module is tested with in-memory `MinecartWorld` fixtures (a rail-shape map + a blocking
  set) — no `World`/entity of any kind.

## Observability/debugging
- `MinecartState` is a plain value; `minecartOnRails` makes the riding state explicit.

## Affected files/symbols
- `src/simulation/MinecartPhysics.ts` (new).
- Tests: `tests/unit/MinecartPhysics.test.ts` (new). No other files.

## Rejected alternatives
- **Modeling rail-following as a polyline path (position along segments)**: rejected — overkill for
  a core; per-tick velocity shaping matches the fixed-tick architecture and is trivially testable.
- **Adding a minecart item/entity now**: rejected — entities/registry belong to a later wiring/
  content change; the physics is the narrow outcome.
- **AABB collisions against precise block faces**: rejected — cell-level blocking is deterministic,
  bounded, and sufficient for the fixed-tick model; precise AABBs are a rendering/entity concern.

## Downstream dependencies
- 173 (`redstone-regression-worlds`) is the section-closing change; a future wiring change owns real
  cart entities and world seams, and 242's survival e2e uses this core for rail transport.
