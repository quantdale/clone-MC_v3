# Design: 170-tnt-block-entity

## Context/current state
- 169's `ExplosionCore.ts` provides `computeExplosion` over a caller-supplied `ExplosionWorld<S>`
  seam but has no consumer. 162 established the "powered ⇒ active" consumer rule (lamp/door/trapdoor)
  and 166-168 the inverted `!powered` lockout — TNT is a **powered** consumer (162-style), plus a
  fire-adjacency trigger, and the design doc flags this inversion relative to the immediately
  preceding modules deliberately.
- Vanilla TNT is a stateless block: no blockstate properties. When primed, the block becomes air and
  a PrimedTnt *entity* takes over with a fuse. This change models that entity as a pure `PrimedTnt`
  descriptor, exactly as 167 modeled a world drop as `DroppedItem`.

## Target state
- `src/simulation/TntPriming.ts` holding the trigger, fuse semantics, the `PrimedTnt` descriptor,
  the tick bridge, and the 169-integration `explodePrimedTnt`; a stateless `tnt` block (1 state) and
  its placing item.

## Invariants
- `tntShouldPrime(powered, fireAdjacent)` is exactly `powered || fireAdjacent` (162-style consumer,
  NOT the 166-168 inversion).
- `tntFuseTicks('redstone') === 80`, `tntFuseTicks('fire') === 20` (deterministic stand-in for
  vanilla's random 10-30).
- `tickPrimedTnt` reduces `fuseTicks` by exactly the elapsed ticks, clamping at 0; non-finite or
  negative elapsed leaves the descriptor unchanged; `primedTntIsDue` is `fuseTicks <= 0`.
- `explodePrimedTnt` runs `computeExplosion` with `center = [x + 0.5, y + 0.5, z + 0.5]` and
  `strength = primed.strength` (default `TNT_STRENGTH = 4`); non-finite positions are handled by
  169's own short-circuit.

## API and data model
```ts
// src/world/BlockRegistry.ts (edit) — stateless def, no propertySchema
// BlockId.Tnt = 53; ItemId.Tnt = 53

// src/simulation/TntPriming.ts (new)
export const TNT_STRENGTH = 4;
export const TNT_FUSE_TICKS_REDSTONE = 80;
export const TNT_FUSE_TICKS_FIRE = 20;

export type TntPrimingCause = 'redstone' | 'fire';

export interface PrimedTnt {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly fuseTicks: number;
  readonly strength: number;
}

export function tntFuseTicks(cause: TntPrimingCause): number;
export function tntShouldPrime(powered: boolean, fireAdjacent: boolean): boolean;
export function primeTnt(x: number, y: number, z: number, cause: TntPrimingCause, strength?: number): PrimedTnt;
export function tickPrimedTnt(primed: PrimedTnt, elapsedTicks: number): PrimedTnt;
export function primedTntIsDue(primed: PrimedTnt): boolean;
export function explodePrimedTnt<S>(primed: PrimedTnt, world: ExplosionWorld<S>): ExplosionResult;
```

## Control/data flow
1. A future wiring change samples `powered` and fire adjacency; when `tntShouldPrime` is true, the
   block is replaced with air and `primeTnt(x, y, z, cause)` produces the `PrimedTnt` descriptor.
2. Each tick, `tickPrimedTnt(primed, 1)` counts the fuse down; when `primedTntIsDue` becomes true,
   the wiring calls `explodePrimedTnt(primed, world)` and applies the returned `destroyed`/`drops` to
   the real world (164-style snapshot-then-apply).
3. `explodePrimedTnt` is the first consumer of 169: it forwards the descriptor's position (block
   center) and strength straight into `computeExplosion`.

## Detailed behavior
- The block is stateless: one registry state, `isEmpty` schema. A dedicated test pins the
  single-state enumeration, and the stateful-block characterization tests (BlockStateRegistry /
  BlockPropertySchema) need **no** edits — TNT falls into their single-state branch.
- Fire priming uses a fixed 20-tick fuse instead of vanilla's random 10-30, consistent with 169's
  no-random-roll stance; the deviation is documented in the proposal.
- `explodePrimedTnt` does not mutate the world: the caller receives positions and applies them,
  keeping this module pure and reusing 169's tested core unchanged.

## Failure modes
- Non-finite/negative elapsed ticks are ignored (`normalizeTicks`), so the fuse never moves
  backwards or to NaN; `computeExplosion` handles non-finite positions itself.

## Compatibility/migration
- One additive stateless block id and one additive item id; one new simulation file; one
  characterization update (BlockRegistry count 41→42). No `Game.ts` edit; no schema/save-format
  change.

## Performance/resource constraints
- `tickPrimedTnt` is O(1); `explodePrimedTnt` inherits 169's bounded march (~24k world queries at
  strength 4). No hot-path or stored-data change beyond the additive block/item.

## Testing seams
- The whole module is tested with a real 169-style in-memory `ExplosionWorld<string>` and the real
  block/item/state registries — no `World`/entity of any kind.

## Observability/debugging
- `PrimedTnt` is a plain value (fuseTicks visible); `primedTntIsDue` makes the detonation moment
  explicit.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts` (edits).
- `src/simulation/TntPriming.ts` (new).
- Tests: `tests/unit/TntPriming.test.ts` (new) + the one BlockRegistry characterization update.

## Rejected alternatives
- **Modeling the fuse with a random roll for fire priming**: rejected — deterministic core
  (consistent with 169); fixed 20 documented.
- **Adding blockstate properties to TNT (e.g. an `unstable`/`primed` flag)**: rejected — vanilla's
  TNT block is stateless; priming replaces the block with air and a `PrimedTnt` descriptor, which is
  both faithful and simpler.
- **Implementing the entity as a real 129-entity**: rejected — that requires the entity framework's
  tick/persistence wiring; a pure descriptor is the section's established pattern (167's `DroppedItem`).

## Downstream dependencies
- A future wiring change applies `explodePrimedTnt` results to the world, spawns real entities, and
  drives the fixed-clock ticks.
- 172 (`minecart-physics`) and later mobs (creeper in 218) reuse the same primed-explosive shape or
  169's core.
