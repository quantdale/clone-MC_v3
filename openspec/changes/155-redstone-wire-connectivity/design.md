# Design: 155-redstone-wire-connectivity

## Context/current state
- 154 shipped `attenuate`, `clampSignal`, the `Direction` vocabulary, `offsetInDirection`, and the
  `RedstonePowerSource`-based `getIndirectPower` — all import-free and injected. 155 is its first
  consumer.
- 006's `BlockPropertySchema` supports `integer` and `named` property kinds; 007's
  `BlockStateRegistry` enumerates the Cartesian product per block and enforces
  `MAX_STATES_PER_BLOCK = 65536`, requiring a `defaultState` that must appear in the enumeration.
  Existing schemas (`WHEAT_SCHEMA`, `FARMLAND_SCHEMA`, `FIRE_SCHEMA`) are all single-integer; wire
  is the first multi-property block, which is exactly the case 006/007 were built for.
- The shared legacy numeric id space is asserted exhaustively by
  `tests/unit/BlockItemSeparation.test.ts`; every prior change that added a block or item
  (125 wheat, 148 porkchop/rotten flesh) updated that table as documented, non-regression test
  maintenance. 155 does the same.

## Target state
- `BlockId.RedstoneWire = 37` with `REDSTONE_WIRE_SCHEMA` (power + four named sides);
  `ItemId.Redstone = 37` placing it.
- `src/simulation/RedstoneWire.ts`: the connection-shape resolver, the local power rule, and the
  state projection — all pure, over an injected `WireWorld`.

## Invariants
- `REDSTONE_WIRE_SCHEMA` enumerates exactly `16 × 3⁴ = 1296` states; the default state is
  `power: 0` with all four sides `none`, and that combination is always within the enumeration.
- `resolveWireConnections` returns exactly one `WireConnection` per horizontal direction, always one
  of `'none' | 'side' | 'up'`.
- A connection is `'up'` only when the block above the *querying* wire is non-solid (a solid block
  above caps the wire and forbids climbing).
- `computeWirePower` always returns a value within 154's signal domain, and never exceeds the
  maximum of (external power at the position, each connected wire's power − 1).
- `computeWirePower` never reads a neighbouring wire's power without attenuating it by at least 1,
  so a wire can never sustain or amplify its own signal through a neighbour.
- `wireStateProperties(power, connections)` always produces a record whose keys exactly match
  `REDSTONE_WIRE_SCHEMA`'s property names.

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const REDSTONE_WIRE_SCHEMA = new BlockPropertySchema([
  { kind: 'integer', name: 'power', min: 0, max: 15 },
  { kind: 'named', name: 'north', values: ['none', 'side', 'up'] },
  { kind: 'named', name: 'south', values: ['none', 'side', 'up'] },
  { kind: 'named', name: 'east',  values: ['none', 'side', 'up'] },
  { kind: 'named', name: 'west',  values: ['none', 'side', 'up'] },
]);
// BlockId.RedstoneWire = 37; ItemId.Redstone = 37

// src/simulation/RedstoneWire.ts (new)
export type WireConnection = 'none' | 'side' | 'up';
export type HorizontalDirection = 'north' | 'south' | 'east' | 'west';
export const HORIZONTAL_DIRECTIONS: readonly HorizontalDirection[];
export type WireConnections = Readonly<Record<HorizontalDirection, WireConnection>>;

/** Caller-supplied world surface (injected, mirroring 154's RedstonePowerSource seam). */
export interface WireWorld {
  isWire(x: number, y: number, z: number): boolean;
  isSolid(x: number, y: number, z: number): boolean;
  /** Whether a non-wire block at this position accepts/emits redstone (a component). */
  connectsToRedstone(x: number, y: number, z: number): boolean;
  /** The stored power of the wire at this position; 0 when it is not a wire. */
  getWirePower(x: number, y: number, z: number): number;
}

export function resolveWireConnections(world: WireWorld, x: number, y: number, z: number): WireConnections;
export function computeWirePower(
  world: WireWorld,
  powerSource: RedstonePowerSource,
  x: number, y: number, z: number,
): number;
export function wireStateProperties(power: number, connections: WireConnections): Record<string, number | string>;
```

## Control/data flow
1. **Connection resolution** — for each horizontal direction `d`, with neighbour `n = offset(d)`:
   a. If `world.isWire(n)` or `world.connectsToRedstone(n)` → `'side'`.
   b. Else if `world.isSolid(n)` and `world.isWire(above n)` and **not** `world.isSolid(above self)`
      → `'up'` (the wire climbs the neighbouring block).
   c. Else if **not** `world.isSolid(n)` and `world.isWire(below n)` → `'side'` (the wire descends;
      vanilla renders this as a side connection, not a distinct state).
   d. Else → `'none'`.
2. **Local power** — `computeWirePower`:
   a. Start from `getIndirectPower(powerSource, x, y, z)` (154) — a component or strongly-powered
      block adjacent to the wire.
   b. Resolve connections; for each non-`'none'` side, read the connected wire's power at the
      appropriate cell (same level for `'side'` when the neighbour is a wire, the cell above for
      `'up'`, the cell below for a descending `'side'`) and fold in `attenuate(thatPower, 1)`.
   c. Return the clamped maximum.
3. **State projection** — `wireStateProperties(power, connections)` →
   `{ power, north, south, east, west }`, ready for `World.setBlockState` (125's path).

## Detailed behavior
- Branch order in `resolveWireConnections` matters and is fixed as written: a wire/component
  neighbour always wins over a step-up, and a step-up always wins over a descent. This mirrors
  vanilla's own precedence and makes the function total and deterministic.
- The "block above self is not solid" guard on the `'up'` branch is the one asymmetry worth
  calling out: it is the *querying* wire's ceiling that blocks climbing, not the neighbour's.
- For the descending case (branch 1c) the connection is reported as `'side'` because vanilla has no
  distinct "down" wire state — the wire below simply connects upward as its own `'up'`. This means
  a descent is represented once on each participant, from its own perspective.
- `computeWirePower` reads a *stored* neighbour power via `world.getWirePower` rather than
  recursively recomputing it. That keeps the function O(1) with no recursion and is precisely why
  ordered propagation is 156's job: iterating this local rule to a fixed point is the propagation
  algorithm, and doing it correctly (with loop protection and deterministic ordering) is that
  change's titled scope.
- Because attenuation is always at least 1, a wire reading its neighbours can never hold its own
  value up — the classic "signal never sustains itself in a loop" property, which is what makes
  156's fixed-point iteration terminate.
- The block is registered as non-solid, non-opaque, breakable, `hardness` 0 (instant-break, like
  vanilla dust), dropping `minecraft:redstone`.

## Failure modes
- No function in `RedstoneWire.ts` throws for well-formed inputs; all power values are clamped
  through 154's helpers. A `WireWorld` callback that itself throws propagates unmodified (154/140's
  documented convention).
- 007's `BlockStateRegistry` throws at construction if the default state is not in the enumeration —
  a test asserts the exact state count and default so a schema mistake fails loudly and immediately.

## Compatibility/migration
- Two additive registry entries (`BlockId.RedstoneWire = 37`, `ItemId.Redstone = 37` — no existing
  id renumbered) and one new simulation file. `BlockItemSeparation.test.ts`'s legacy-id table and
  placeable-item list need the documented, non-regression update. No `Game.ts` edit; no
  schema/save-format change (block states are already persisted through 125's existing overlay);
  no migration.

## Performance/resource constraints
- `resolveWireConnections` makes at most ~4 × 5 = 20 `WireWorld` calls; `computeWirePower` adds
  154's bounded `getIndirectPower` (≤42 source calls) plus ≤4 stored-power reads. All constant.
- 1296 enumerated wire states is ~2% of 007's 65536-per-block cap.

## Testing seams
- `RedstoneWire.ts` is tested with plain object-literal `WireWorld` / `RedstonePowerSource`
  implementations — no `World`, `BlockRegistry`, or `Game` dependency.
- The schema/registration side is tested against the real `BlockRegistry`/`ItemTypeRegistry`/
  `BlockStateRegistry`, asserting the exact enumerated count, the default state, and the
  block↔item cross-reference.

## Observability/debugging
- `wireStateProperties` output is the same record shape the debug overlay would show for any
  stateful block; no separate hook is warranted.

## Affected files/symbols
- `src/world/BlockRegistry.ts` (edit: `REDSTONE_WIRE_SCHEMA`, `BlockId.RedstoneWire`, the block def).
- `src/inventory/ItemRegistry.ts` (edit: `ItemId.Redstone` + its def).
- `src/simulation/RedstoneWire.ts` (new).
- Tests: `tests/unit/RedstoneWire.test.ts` (new), `tests/unit/BlockItemSeparation.test.ts` (edit).

## Rejected alternatives
- **Keeping wire a pure model with no registered block** (154's shape): rejected — 155's titled
  outcome is literally "wire block *states*"; without registration there is no state space to
  enumerate and 007 gets no exercise on its first multi-property block.
- **Adding a distinct `'down'` connection value**: rejected — vanilla has no such state; a descent
  is already fully described by the lower wire's own `'up'`, and adding it would inflate the state
  space by 4× for no behavioural gain.
- **Recursively computing neighbour power inside `computeWirePower`**: rejected — it would either
  loop forever on a wire ring or require visited-set bookkeeping that duplicates 156's loop
  protection. Reading stored power keeps this rule local, O(1), and correctly composable.
- **Attaching a `BlockBehavior` and recomputing wire power on neighbour updates now**: rejected —
  that *is* 156, and doing it here without deterministic ordering and loop protection would produce
  exactly the nondeterminism the change sequence orders these changes to avoid.

## Downstream dependencies
- 156 (`redstone-update-order`) iterates `computeWirePower` over a dirty set with deterministic
  ordering and loop protection, and attaches the behavior that keeps stored power current.
- 157-162 supply real `connectsToRedstone` implementations for levers/torches/repeaters/
  comparators/observers/consumers.
- 059/060's model work can later give wire a proper connected-shape mesh driven by the per-side
  state this change introduces.
