# Design: 154-redstone-signal-core

## Context/current state
- No redstone concept exists anywhere in the codebase — no power values, no signal queries, no
  wire, no components.
- 099's `src/worldgen/StructureTemplate.ts` already declares a `Direction` type
  (`'north' | 'south' | 'east' | 'west' | 'up' | 'down'`) with the Minecraft convention documented
  (north = −z, south = +z, east = +x, west = −x, up = +y, down = −y). 154 re-declares a
  structurally identical type locally rather than importing it, to avoid a `simulation → worldgen`
  dependency — the same call 146 made re-declaring `HostileMobWorld` instead of importing 145's
  identical shape. Structural typing means the two are freely interchangeable at call sites.
- The codebase's established seam for "this module needs world data but must stay testable" is an
  injected interface (145's `PassiveMobWorld`, 148's spawn sinks, 152's zero-import purity). 154
  uses `RedstonePowerSource` the same way, so no `World`/`BlockRegistry` import is needed and tests
  supply a plain object literal.

## Target state
- `src/simulation/RedstoneSignal.ts`: the direction vocabulary, the 0-15 signal domain and its
  helpers, the `RedstonePowerSource` injection interface, and the three power queries
  (`getDirectPower`, `getIndirectPower`, `isBlockPowered`) every later redstone change reads.

## Invariants
- `clampSignal(v)` always returns an integer within `[MIN_SIGNAL_STRENGTH, MAX_SIGNAL_STRENGTH]`;
  a non-finite input yields `MIN_SIGNAL_STRENGTH`.
- `OPPOSITE_DIRECTION[OPPOSITE_DIRECTION[d]] === d` for every direction.
- `offsetInDirection(x, y, z, d)` moves exactly one block along exactly one axis, and applying the
  opposite direction returns the original coordinate.
- `attenuate(signal, distance)` never returns below `MIN_SIGNAL_STRENGTH` nor above the clamped
  input signal; `attenuate(s, 0) === clampSignal(s)`.
- `strongestSignalFrom([])` is `MIN_SIGNAL_STRENGTH`; otherwise it is the clamped maximum.
- `getDirectPower` reads **only** `getStrongPower`, never `getWeakPower`.
- `getIndirectPower(...) >= getDirectPower(...)` always (it is a max that includes direct power).
- Every query returns a value in `[MIN_SIGNAL_STRENGTH, MAX_SIGNAL_STRENGTH]` regardless of what a
  (possibly misbehaving) `RedstonePowerSource` returns — every source value is clamped on read.

## API and data model
```ts
// src/simulation/RedstoneSignal.ts

/** Minecraft convention: north = -z, south = +z, east = +x, west = -x, up = +y, down = -y. */
export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
export const DIRECTIONS: readonly Direction[];
export const OPPOSITE_DIRECTION: Readonly<Record<Direction, Direction>>;
export const DIRECTION_OFFSETS: Readonly<Record<Direction, readonly [number, number, number]>>;
export function offsetInDirection(x: number, y: number, z: number, direction: Direction): [number, number, number];

export const MIN_SIGNAL_STRENGTH = 0;
export const MAX_SIGNAL_STRENGTH = 15;
export function clampSignal(value: number): number;
export function attenuate(signal: number, distance: number): number;
export function strongestSignalFrom(values: readonly number[]): number;

/**
 * The caller-supplied world surface. `direction` is the face of the queried block that the power
 * would be emitted *from*, toward the neighbour asking.
 */
export interface RedstonePowerSource {
  getWeakPower(x: number, y: number, z: number, direction: Direction): number;
  getStrongPower(x: number, y: number, z: number, direction: Direction): number;
  /** Whether the block conducts (re-emits) power it receives — a full solid block does. */
  isConductive(x: number, y: number, z: number): boolean;
}

export function getDirectPower(source: RedstonePowerSource, x: number, y: number, z: number): number;
export function getIndirectPower(source: RedstonePowerSource, x: number, y: number, z: number): number;
export function isBlockPowered(source: RedstonePowerSource, x: number, y: number, z: number): boolean;
```

## Control/data flow
1. **Direct power**: for each of the six directions `d`, step to the neighbour at
   `offsetInDirection(x, y, z, d)` and read `source.getStrongPower(nx, ny, nz, OPPOSITE_DIRECTION[d])`
   — the neighbour's face pointing back at `(x, y, z)`. Return the clamped maximum.
2. **Indirect power**: start from `getDirectPower(...)`. Then, for each neighbour that
   `source.isConductive(nx, ny, nz)` reports `true`, compute *that neighbour's* own direct power
   (`getDirectPower(source, nx, ny, nz)`) and fold it into the maximum — this is vanilla's
   "a strongly-powered solid block powers what touches it" rule. A non-conductive neighbour
   contributes nothing beyond whatever it already emitted directly.
3. **isBlockPowered**: `getIndirectPower(...) > MIN_SIGNAL_STRENGTH`.
4. **Attenuation** (155's future use): `attenuate(signal, distance)` = `clampSignal(signal) -
   distance`, floored at `MIN_SIGNAL_STRENGTH`, with a non-positive/non-finite `distance` treated
   as `0`.

## Detailed behavior
- `getIndirectPower` deliberately recurses exactly **one** level (a conductive neighbour's *direct*
  power, not its indirect power). That bound is what makes the query terminating and matches
  vanilla: power conducts through one solid block, not arbitrarily far. Recursing on
  `getIndirectPower` instead would infinite-loop between two adjacent conductive blocks — an
  explicitly-considered and rejected shape.
- Every value read from `source` is passed through `clampSignal` before use, so a source returning
  `-5`, `99`, or `NaN` can never produce an out-of-domain result. This is the module's defence
  against a future misbehaving `World` adapter.
- `attenuate` takes an explicit `distance` (rather than assuming 1) so 155 can compute a wire's
  value at N blocks from its source in one call.
- `strongestSignalFrom([])` returns `MIN_SIGNAL_STRENGTH` rather than throwing or returning
  `-Infinity`, so a component with no inputs reads as unpowered — the correct default.

## Failure modes
- No function throws for any input, including a `RedstonePowerSource` returning out-of-domain or
  non-finite values (all clamped). A source callback that itself throws propagates unmodified
  (matching 140's documented `findNearestTarget` convention — a caller's query bug should surface).

## Compatibility/migration
- One new, additive file; **zero imports**; no existing module edited; no schema/save-format
  change; no migration.

## Performance/resource constraints
- `getDirectPower` is exactly 6 source calls. `getIndirectPower` is at most 6 + 6×6 = 42 source
  calls (six neighbours, each possibly triggering its own six-face direct query) — bounded and
  constant, with no recursion beyond the documented single level.

## Testing seams
- Every function is tested with a plain object-literal `RedstonePowerSource` — no `World`,
  `BlockRegistry`, or `Game` dependency of any kind.

## Observability/debugging
- All functions are pure with plain numeric returns; no separate debug hook is warranted.

## Affected files/symbols
- `src/simulation/RedstoneSignal.ts` (new).
- Tests: `tests/unit/RedstoneSignal.test.ts` (new).

## Rejected alternatives
- **Importing 099's `Direction` from `src/worldgen/StructureTemplate.ts`**: rejected — it would
  create a `simulation → worldgen` dependency for a six-string union; structural typing makes the
  local declaration fully interchangeable. (A future consolidation change could hoist a shared
  `Direction` into `src/math/`, but that edits 099's file and is out of scope here.)
- **Making `getIndirectPower` recurse on itself**: rejected — two adjacent conductive blocks would
  recurse forever. One level of conduction is both terminating and vanilla-correct.
- **Reading the world directly (importing `World`/`BlockRegistry`)**: rejected — an injected
  interface keeps the module import-free and testable with object literals, matching 145/148/152's
  established seam.
- **Emulating quasi-connectivity ("BUD") here**: rejected — it is a piston-specific vanilla quirk,
  not part of the general signal model; documented in the proposal's Non-goals so 163/164 can
  decide deliberately rather than inheriting a silent omission.

## Downstream dependencies
- 155 (`redstone-wire-connectivity`) consumes `attenuate`, `clampSignal`, and the direction helpers
  to model wire state and connection shapes.
- 156 (`redstone-update-order`) drives propagation using these queries.
- 157-162 (levers/torches/repeaters/comparators/observers/consumers) all gate on
  `isBlockPowered`/`getIndirectPower`.
- 163/164 (pistons) additionally decide whether to model quasi-connectivity on top of this core.
