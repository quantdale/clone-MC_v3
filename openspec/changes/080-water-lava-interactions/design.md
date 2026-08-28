# Design: 080-water-lava-interactions

## Context / current state

Water (078) and lava (079) flow independently. No contact transformation exists; MC converts the
meeting fluids into blocks.

## Target state

`resolveFluidContact(water, lava)` is a pure function implementing the classic MC table;
`applyFluidContact` clears both fluid cells and places the resulting block at the lava cell.

## Invariants

- Levels: water/lava level 0 = source; levels 1-7 = flowing; 8-15 = falling (076). For
  interactions, falling counts as flowing for both fluids; only level 0 is a source.
- Table: lava source + any water → OBSIDIAN; flowing lava + water source → STONE; flowing lava +
  flowing water → COBBLESTONE; either side null → NONE.
- Apply: non-NONE results clear both fluid cells and place the block at the lava position; NONE
  never mutates.
- Fixed, deterministic behavior; pure resolver.

## API and data model

```ts
// src/simulation/FluidInteraction.ts (NEW)
export type FluidContactResult = 'OBSIDIAN' | 'COBBLESTONE' | 'STONE' | 'NONE';
export interface InteractionBlockIds { obsidian: number; cobblestone: number; stone: number; }
export interface FluidInteractionWorld {
  getFluidState(x: number, y: number, z: number): FluidState | null;
  setFluidState(x: number, y: number, z: number, state: FluidState | null): void;
  setBlockState(x: number, y: number, z: number, blockId: number): void;
}
export function resolveFluidContact(water: FluidState | null, lava: FluidState | null): FluidContactResult;
export function applyFluidContact(
  world: FluidInteractionWorld, ids: InteractionBlockIds,
  waterX: number, waterY: number, waterZ: number,
  lavaX: number, lavaY: number, lavaZ: number,
): FluidContactResult;
```

## Control / data flow

1. The wiring (after fluid steps) detects a water/lava adjacency and calls `applyFluidContact`
   with both positions.
2. The resolver classifies each fluid (null / source / flowing incl. falling) and returns the
   transformation.
3. For non-NONE results: water fluid removed, lava fluid removed, block placed at the lava cell.
4. The wiring re-schedules the affected cells (077).

## Detailed behavior

- Classification: `null` → none; level 0 → source; level 1-15 → flowing.
- Table lookup as in Invariants.
- Apply writes through the world accessor in fixed order: remove water, remove lava, place block.

## Failure modes

- None: resolver is total; apply's world accessors are trusted (exceptions propagate).

## Compatibility / migration

Additive; no existing module changes.

## Performance / resource constraints

O(1); no allocation beyond the result string.

## Testing seams

- `tests/unit/FluidInteraction.test.ts` (NEW): full resolver matrix (both fluids ×
  source/flowing/falling, null sides), apply placements per result kind, NONE non-mutation,
  falling classifications, determinism.

## Observability / debugging

Results are plain strings; tests assert exact placements.

## Affected files / symbols

- `src/simulation/FluidInteraction.ts` — NEW.
- `tests/unit/FluidInteraction.test.ts` — NEW.

## Rejected alternatives

- *Fold interactions into the flow engines*: couples flow with block placement; a standalone
  resolver is testable and wiring-agnostic.
- *Place the block at the water cell*: MC forms the block at the lava cell for classic
  interactions; documented and tested.

## Downstream dependencies

The world wiring triggers contacts after 078/079 steps; 081 waterlogging coexists via separate
state.
