# Design: 081-waterlogging-state

## Context / current state

Fluids occupy whole cells (076-080). MC waterlogged cells hold a block plus water; the water in a
waterlogged cell is a source (0) or falling (8-15) — flowing levels never coexist.

## Target state

`WaterloggedCell { blockId, waterLevel }` is a validated value; helpers convert between fluid
levels and waterlogged levels and manage waterlog/unwaterlog transitions deterministically.

## Invariants

- `waterLevel` is 0 or in [8, 15] (source or falling); 1-7 is rejected by validation.
- Fluid → waterlogged conversion: 0 → 0; 1-7 → 0 (flowing water waterlogs at source level);
  8-15 → unchanged.
- Waterlogged → fluid conversion: 0 → 0; 8-15 → unchanged.
- `withWaterLevel(cell, null)` returns null (the cell is no longer waterlogged).
- `isWaterloggable` is pure membership in a caller-supplied id set.

## API and data model

```ts
// src/world/Waterlogging.ts (NEW)
export interface WaterloggedCell {
  readonly blockId: number;
  /** 0 (source) or 8-15 (falling); flowing levels never coexist with a block. */
  readonly waterLevel: FluidLevel;
}
export function validateWaterloggingLevel(level: number): FluidLevel; // 0 or 8-15 only
export function waterlog(blockId: number, level: number): WaterloggedCell;
export function waterloggingLevelFromFluid(fluidLevel: number): FluidLevel;
export function fluidLevelFromWaterlogging(waterLevel: FluidLevel): FluidLevel;
export function withWaterLevel(cell: WaterloggedCell, level: FluidLevel | null): WaterloggedCell | null;
export function isWaterloggable(blockId: number, waterloggableIds: ReadonlySet<number>): boolean;
```

## Control / data flow

1. The wiring detects water flowing into a cell holding a waterloggable block and calls
   `waterlog(blockId, waterloggingLevelFromFluid(level))`.
2. When water leaves, `withWaterLevel(cell, null)` yields the plain block; `fluidLevelFromWaterlogging`
   tells the flow engine the level to spawn.
3. Flow reads `waterLevel` of waterlogged cells when computing neighbors.

## Detailed behavior

- Validation rejects 1-7, out-of-range, fractional, and non-number levels with descriptive errors.
- Conversions never throw (total over valid inputs).

## Failure modes

- Invalid levels/block ids throw at validation/construction.

## Compatibility / migration

Additive; 076 types reused.

## Performance / resource constraints

O(1) everywhere; `WaterloggedCell` is a two-field object.

## Testing seams

- `tests/unit/Waterlogging.test.ts` (NEW): level validation (0, 8-15 accepted; 1-7 and others
  rejected), waterlog construction, both conversion directions, withWaterLevel transitions,
  isWaterloggable membership, purity.

## Observability / debugging

Helpers return plain values asserted exactly in tests.

## Affected files / symbols

- `src/world/Waterlogging.ts` — NEW.
- `tests/unit/Waterlogging.test.ts` — NEW.

## Rejected alternatives

- *Allow flowing levels in waterlogged cells*: contradicts MC semantics (waterlogged water is a
  source); the conversion rule handles incoming flowing water explicitly.
- *Store a full `FluidState`*: the fluid id is implied (water); a level-only field keeps the
  model minimal.

## Downstream dependencies

The world wiring waterlogs cells during 078/079 flow; 083 fluid surface meshing reads waterlogged
levels; 084 fixtures cover waterlogged flow.
