# Design: 171-rail-block-states

## Context/current state
- 154's `RedstoneSignal.ts` exports `DIRECTION_OFFSETS` (unit offsets per `Direction`), reused here
  for horizontal neighbor sampling. 166-170 established the "caller samples, this module computes"
  discipline; rails are the first block whose *shape* is a pure function of neighbor presence/height.
- Vanilla's rail has 10 shapes chosen from its four horizontal neighbors: same-level neighbors form
  straights/corners; a neighbor one block higher makes the rail ascend toward it.

## Target state
- `src/simulation/RailBlockStates.ts` holding the shape type, the deterministic resolver, the
  neighbor sampler, the support rule, the connection projection, and the state projection; a `rail`
  block (10 states) and its placing item.

## Invariants
- `resolveRailShape` is total over all neighbor combinations and deterministic. Precedence:
  1. north+south present → straight (`ascending_north` if north is elevated, `ascending_south` if
     south is, else `north_south`);
  2. east+west present → straight (same rule for `ascending_east/west`, else `east_west`);
  3. two perpendicular **same-level** (0) neighbors → the corner;
  4. a single neighbor → `ascending_<dir>` if elevated (1), else the flat straight of its axis
     (`north_south` for n/s, `east_west` for e/w);
  5. no neighbors → `north_south`.
- An elevated (level 1) neighbor NEVER forms a corner — it ascends instead.
- `railNeighborInfo` returns `{ present: true, level: 0 }` for a rail at the same height,
  `{ present: true, level: 1 }` for a rail one block higher, and `{ present: false, level: 0 }`
  otherwise.
- `railHasSupport` is `world.isSolidSupport(world.getBlockState(x, y - 1, z))`.
- `RAIL_SHAPES` is the single source of truth for the 10 shape values; `RAIL_SCHEMA` spreads it.

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const RAIL_SCHEMA = new BlockPropertySchema([
  { kind: 'named', name: 'shape', values: [...RAIL_SHAPES] },
]);
// BlockId.Rail = 54; ItemId.Rail = 54

// src/simulation/RailBlockStates.ts (new)
export type RailShape =
  | 'north_south' | 'east_west'
  | 'ascending_east' | 'ascending_west' | 'ascending_north' | 'ascending_south'
  | 'corner_north_east' | 'corner_north_west' | 'corner_south_east' | 'corner_south_west';
export const RAIL_SHAPES: readonly RailShape[]; // all 10, stable order

export type HorizontalDirection = 'north' | 'south' | 'east' | 'west';
export type RailLevel = 0 | 1;
export interface RailNeighbor { readonly present: boolean; readonly level: RailLevel; }

export interface RailNeighborWorld<S> {
  getBlockState(x: number, y: number, z: number): S;
  isRail(state: S): boolean;
}
export interface RailSupportWorld<S> {
  getBlockState(x: number, y: number, z: number): S;
  isSolidSupport(state: S): boolean;
}

export function railNeighborInfo<S>(
  world: RailNeighborWorld<S>, x: number, y: number, z: number,
  direction: HorizontalDirection,
): RailNeighbor;
export function resolveRailShape(neighbors: {
  readonly north?: RailLevel; readonly south?: RailLevel;
  readonly east?: RailLevel; readonly west?: RailLevel;
}): RailShape;
export function railShapeConnections(shape: RailShape): readonly HorizontalDirection[];
export function railHasSupport<S>(world: RailSupportWorld<S>, x: number, y: number, z: number): boolean;
export function railStateProperties(shape: RailShape): Record<string, string>;
```

## Control/data flow
1. A future wiring change samples the four horizontal neighbors via `railNeighborInfo`, feeds the
   levels into `resolveRailShape`, and writes the resulting shape back to the rail's block state —
   this is the neighbor-update loop.
2. Placement checks `railHasSupport` on the block below before allowing the rail to exist; removing
   the support (wiring) drops the rail item.
3. `railShapeConnections` gives the same loop (and future rendering/collision) the connected
   directions for any shape.

## Detailed behavior
- The resolver is deliberately pure: no world access, no ordering dependence — the same neighbor set
  always yields the same shape.
- `railNeighborInfo` checks the same-height position first, then the +1 position; a rail two blocks
  higher or one lower does not connect (vanilla has no downward shape).
- `RAIL_SCHEMA`'s legal values are spread from `RAIL_SHAPES`, so the module and the registry cannot
  drift; the schema test asserts the 10-value enumeration.

## Failure modes
- No function throws for well-formed inputs; `resolveRailShape` is total; invalid `shape` inputs to
  `railShapeConnections` are impossible at the type level (exhaustive switch).

## Compatibility/migration
- One additive block id and one additive item id; one new simulation file; three characterization
  updates (rail is the 20th multi-state block, 10 states). No `Game.ts` edit; no schema/save-format
  change.

## Performance/resource constraints
- All functions are O(1); 10 new block states. No hot-path or stored-data change beyond the additive
  block/item.

## Testing seams
- The whole module is tested with in-memory `RailNeighborWorld`/`RailSupportWorld` string worlds and
  the real block/item/state registries — no `World` of any kind.

## Observability/debugging
- `RailShape` values are self-describing; `railShapeConnections` makes a shape's connectivity
  inspectable.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts` (edits).
- `src/simulation/RailBlockStates.ts` (new).
- Tests: `tests/unit/RailBlockStates.test.ts` (new) + three characterization updates.

## Rejected alternatives
- **Modeling each rail shape as its own boolean property (e.g. `north`, `east`, …)**: rejected —
  vanilla models one `shape` property, and a 10-value named property keeps the state space exact.
- **Inlining the 10 values into `RAIL_SCHEMA` instead of spreading `RAIL_SHAPES`**: rejected — two
  copies would drift; the spread keeps one source of truth.
- **Having `resolveRailShape` sample the world itself**: rejected — the section's discipline is
  caller-supplied seams; sampling is `railNeighborInfo`, resolution is pure.

## Downstream dependencies
- 172 (`minecart-physics`) consumes `railShapeConnections`/`resolveRailShape` for rail-constrained
  movement; powered/detector rails (a later content change) reuse the same shape machinery.
