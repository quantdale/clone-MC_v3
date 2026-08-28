# Design: 076-fluid-state-levels

## Context / current state

015 fluid types exist (water/lava source/flowing variants). No per-cell fluid state with the MC
level model exists; 077 fluid ticking needs it.

## Target state

`FluidState { fluidId, level }` is a validated value type; pure helpers expose the MC-derived
semantics: source (0), flowing with surface height (1-7), falling with falling height (8-15).

## Invariants

- `level` is an integer in [0, 15] (validated at construction and by `validateFluidLevel`).
- `fluidId` is a non-negative integer (registry runtime id).
- `isFluidSource(state) === state.level === 0`.
- `isFluidFalling(state) === state.level >= 8`.
- `fluidSurfaceHeight(state)`: 0 → 1; 1-7 → `(8 - level) / 8`; 8-15 → 1 (falling renders full).
- `fluidFallingHeight(state)`: `level >= 8 ? level - 8 : 0`.
- All helpers are pure and deterministic.

## API and data model

```ts
// src/world/FluidState.ts (NEW)
export type FluidLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
export const FLUID_LEVEL_SOURCE = 0;
export const FLUID_LEVEL_MIN_FLOWING = 1;
export const FLUID_LEVEL_MAX_FLOWING = 7;
export const FLUID_LEVEL_MIN_FALLING = 8;
export const FLUID_LEVEL_MAX = 15;
export interface FluidState { readonly fluidId: number; readonly level: FluidLevel; }
export function validateFluidLevel(input: unknown): FluidLevel;
export function createFluidState(fluidId: number, level: number): FluidState;
export function isFluidSource(state: FluidState): boolean;
export function isFluidFalling(state: FluidState): boolean;
export function fluidSurfaceHeight(state: FluidState): number;
export function fluidFallingHeight(state: FluidState): number;
```

## Control / data flow

1. Simulation (077) builds states via `createFluidState(fluidRuntimeId, level)`.
2. Consumers query `isFluidSource`/`isFluidFalling` for behavior and `fluidSurfaceHeight`/
   `fluidFallingHeight` for rendering/flood logic.

## Detailed behavior

- Validation throws descriptive `Error`s naming the offending value.
- Level 0 is the source (full block); levels 1-7 flow with decreasing surface height
  (7/8 … 1/8); levels 8-15 are falling columns (full height) with `fallingHeight = level - 8`.

## Failure modes

- Invalid level/fluidId → construction/validation errors (no silent coercion).

## Compatibility / migration

Additive; 015 and all existing modules unchanged.

## Performance / resource constraints

All helpers are O(1); `FluidState` is a two-field plain object.

## Testing seams

- `tests/unit/FluidState.test.ts` (NEW): level validation matrix; construction; source/falling
  classification across all 16 levels; surface-height curve (0 → 1, 1 → 7/8, 7 → 1/8, 8 → 1,
  15 → 1); falling-height curve (8 → 0, 15 → 7, 7 → 0); purity.

## Observability / debugging

Helpers return plain numbers; tests assert exact values.

## Affected files / symbols

- `src/world/FluidState.ts` — NEW.
- `tests/unit/FluidState.test.ts` — NEW.

## Rejected alternatives

- *Boolean `falling` stored on the state*: redundant with `level >= 8` and can desync; deriving it
  keeps the state minimal and consistent.
- *Only source/flowing (drop falling)*: the change scope names falling metadata explicitly; the
  MC model includes it.
- *Level as part of the block state*: block-state integration is a later wiring; a standalone
  value type is the 077-ready primitive.

## Downstream dependencies

077-fluid-tick-dispatch schedules and applies fluid changes using these states; a later rendering
change consumes `fluidSurfaceHeight`/`fluidFallingHeight`.
