# Design: 078-water-flow-simulation

## Context / current state

076 fluid states and 077 bounded dispatch exist. No water behavior exists; 084 fixtures will need
deterministic flow.

## Target state

`stepWaterCell(world, waterFluidId, x, y, z)` implements one deterministic water step for one cell
and reports which positions changed (the caller re-schedules them through 077 at
`WATER_FLOW_INTERVAL`).

## Invariants

- Levels: 0 = source, 1-7 = flowing, 8-15 = falling (076 semantics; falling height ignored by
  flow).
- Neighbor order for horizontal spread is fixed: `-x, +x, -z, +z`.
- Step order per cell: (1) downward spawn, (2) falling-to-flowing conversion at ground,
  (3) horizontal spread, (4) source formation, (5) decay.
- Falling cells are never overwritten horizontally.
- Downward spawn only into an empty replaceable cell (water below → no spawn).
- `affected` contains exactly the cells whose fluid changed (below, spread targets, or the cell
  itself when it converts/forms a source/decays).

## API and data model

```ts
// src/simulation/WaterFlowEngine.ts (NEW)
export interface WaterWorldAccess {
  getFluidState(x: number, y: number, z: number): FluidState | null;
  setFluidState(x: number, y: number, z: number, state: FluidState | null): void;
  /** Air and improvable water are replaceable; blocks and lava are not. */
  isReplaceable(x: number, y: number, z: number): boolean;
}
export const WATER_FLOW_INTERVAL = 5;
export const MAX_FLOW_LEVEL = 7;
export const FALLING_LEVEL = 8;
export interface WaterStepResult {
  changed: boolean;
  /** Positions whose fluid changed; the caller re-schedules these. */
  affected: Array<[number, number, number]>;
}
export function stepWaterCell(
  world: WaterWorldAccess,
  waterFluidId: number,
  x: number, y: number, z: number,
): WaterStepResult;
```

## Control / data flow

1. The 077 handler calls `stepWaterCell` for each due tick.
2. The engine reads the cell's state; non-water cells are a no-op.
3. Rules run in the fixed order above; every fluid write appends to `affected`.
4. The caller schedules every `affected` position at `currentTick + WATER_FLOW_INTERVAL`.

## Detailed behavior

- Downward spawn: if the cell below has no fluid and is replaceable, set it to falling (level 8);
  sources, flowing, and falling all do this.
- Falling at ground: if below is blocked (not empty-replaceable), the falling cell converts to
  flowing level 7 (and returns — spreading happens on its next step).
- Horizontal spread (below blocked): sources propose level 1; flowing L proposes `min(L+1, 7)`.
  A neighbor is a valid target when replaceable and (no fluid, or fluid level in 1-7 and greater
  than the proposal). Falling neighbors are never targeted.
- Source formation: after spread, a flowing cell with ≥ 2 horizontal source neighbors becomes a
  source.
- Decay: after spread/formation, a flowing cell (1-7) with no water above and no horizontal
  neighbor at a level < its own advances `level + 1`; at level 7 it is removed (fluid null).
- A source never decays; a cell that still has a feeder (any horizontal neighbor with a lower
  level) does not decay.

## Failure modes

- World accessor exceptions propagate (caller bug); no partial-write protection (the engine writes
  through the accessor as it goes — documented; accessors are trusted).

## Compatibility / migration

Additive. No existing module changes; 076 states are consumed as-is.

## Performance / resource constraints

One step is O(1) cell reads/writes (≤ 5 neighbor reads, ≤ 4 writes); no allocation beyond the
result object and affected array.

## Testing seams

- `tests/unit/WaterFlowEngine.test.ts` (NEW):
  - downward spawn from source/flowing/falling; no spawn onto existing water;
  - falling column continuation and ground conversion;
  - conversion-then-spread sequence;
  - source/flowing horizontal spread incl. improvement of worse water and the level cap;
  - falling never overwritten;
  - source formation (2 horizontal sources);
  - decay ladder incl. removal at 7, feeder and water-above guards;
  - non-water no-op; affected correctness; determinism.

## Observability / debugging

`WaterStepResult` exposes `changed`/`affected`; tests assert exact resulting worlds.

## Affected files / symbols

- `src/simulation/WaterFlowEngine.ts` — NEW.
- `tests/unit/WaterFlowEngine.test.ts` — NEW.

## Rejected alternatives

- *Whole-lake BFS per tick*: not per-cell, breaks the 077 bounded model.
- *Random tick order*: nondeterministic; 084 fixtures need determinism.
- *Falling cells overwritable horizontally*: waterfalls collapse; excluded by design.

## Downstream dependencies

079 lava flow mirrors the engine; 080 interactions layer on top; 084 builds deterministic flow
fixtures over this engine; the world wiring binds it to 077 with `WATER_FLOW_INTERVAL`.
