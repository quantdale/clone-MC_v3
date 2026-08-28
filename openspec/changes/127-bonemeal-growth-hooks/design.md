# Design: 127-bonemeal-growth-hooks

## Context/current state
- Change 125 gave wheat an `age` property in `[0, 7]` (`src/world/CropGrowth.ts`), a random-tick
  growth behavior (`CropBlockBehavior.onRandomTick` → `growCropAt`), and `World.setBlockState` /
  `World.getBlockState` with an in-memory state overlay.
- Change 126 gave farmland `moisture` in `[0, 7]` and hydrated-farmland crop support reusing
  `growCropAt`.
- Change 120 added `InteractionAction 'use'`; `PlayerInteraction.update` emits `'use'` only when the
  targeted block is `BlockId.EnchantingTable`, and `Game.onInteractionAction` handles `'use'` by
  opening an enchanting session.
- `BlockId` catalog has **no Sapling block** and there is no sapling growth-stage state.
- `ItemId` is free at `34` (last used `Wheat = 33`); block id 34 is `Wheat`, 35 is `Farmland`.

## Target state
- `ItemId.BoneMeal = 34` with a registered, non-placeable item definition.
- `src/simulation/Bonemeal.ts` exposing a pure fertilization interface (`applyBonemeal`,
  `FertilizerRegistry`, `fertilizeWheat`, `bonemealTarget`).
- `PlayerInteraction` emits `'use'` when holding bone meal over a targeted block.
- `Game` consumes one bone meal on successful fertilization.
- Tree/sapling bonemeal documented as deferred; interface extensible for it.

## Invariants
- `WHEAT_GROW_STEP === 2`; `bonemealNextAge` returns only values in `[0, 7]`.
- `applyBonemeal`/`fertilizeWheat` never throw and never write on no-op/mature/non-wheat/air/
  capability-less/malformed-read cases.
- A bone meal is consumed exactly once per successful fertilization, never on a no-op.
- Adding bone meal changes no block id, no state enumeration, and no persistence format.

## API and data model
`src/simulation/Bonemeal.ts` (pure; no `Game`/`World` import):
```ts
export const WHEAT_GROW_STEP = 2;

export function bonemealNextAge(age: number): number;        // min(7, age+2), invalid->0
export function fertilizeWheat(world: BlockWorldAccess, x, y, z): boolean;

export type FertilizerFn = (world: BlockWorldAccess, x, y, z: number) => boolean;
export class FertilizerRegistry {
  register(blockId: number, fn: FertilizerFn): void;         // throws on invalid/duplicate
  get(blockId: number): FertilizerFn | undefined;
  has(blockId: number): boolean;
  get size(): number;
}
export function createDefaultFertilizerRegistry(): FertilizerRegistry; // wheat only
export function applyBonemeal(world, x, y, z, registry?): boolean;     // default registry
export function bonemealTarget(world, x, y, z, consume: () => void, registry?): boolean;
```

`ItemTypeDefinition` addition (additive field-free item):
```ts
{ id: ItemId.BoneMeal, resourceId: rid('bone_meal'), key: 'bone_meal', name: 'Bone Meal',
  iconTile: 36, stackSize: 64 }
```

## Control/data flow
1. Player right-clicks. `PlayerInteraction.update` sees the selected item id `=== ItemId.BoneMeal`
   with a targeted block → calls `this.onAction?.('use', targetBlockId)` (no placement).
2. `Game.onInteractionAction('use')` checks `isBonemealSelected()`; if true →
   `useBonemeal()`: reads `interaction.getTarget()`, calls
   `bonemealTarget(this.worldBlockAccess, x, y, z, () => this.inventory.consumeSelected())`.
3. `bonemealTarget` → `applyBonemeal` → `FertilizerRegistry.get(blockId)` → `fertilizeWheat` reads
   the wheat `age`, writes `{ age: bonemealNextAge(age) }` via `world.setBlockState`, returns `true`.
   On `true`, `consume()` runs once. On `false`, nothing is consumed.
4. Game renders hotbar and plays a sound when growth was applied.

## Detailed behavior
- `bonemealNextAge`: `!Number.isInteger(age) || age < 0 → 0`; else `Math.min(MAX_AGE, age + 2)`.
- `fertilizeWheat`: guard on `getBlockState`/`setBlockState` presence and `getBlockId === Wheat`;
  parse `age` defensively (throw → `false`); if `isMature` → `false`; else write and return `true`.
- `applyBonemeal` ignores `rng` (wheat rule is deterministic); the optional `rng` param exists only
  as a parity seam and is not consumed.
- `FertilizerRegistry.register`: throws on non-integer/negative id, non-function `fn`, duplicate.
- `Game.useBonemeal` no-ops (no consume) when `getTarget()` is null.

## Failure modes
- Throwing `getBlockState` → caught in `fertilizeWheat`, returns `false`, no write.
- Missing state capability → `false`, no write.
- No target / no-op fertilization → no consumption, no error.
- Invalid registry registration → descriptive `Error`, no partial entry.

## Compatibility/migration
- Additive item id 34; no block/state/persistence change; no migration. `BlockItemSeparation.test.ts`
  row 34 updated to include the item.

## Performance/resource constraints
- `applyBonemeal` is O(1) and only on a right-click; the default registry has one entry; no new
  per-tick/per-frame work.

## Testing seams
- `FertilizerRegistry` + pure `bonemealNextAge`/`fertilizeWheat`/`applyBonemeal`/`bonemealTarget` are
  tested with a fake `BlockWorldAccess` (no `Game`).
- `PlayerInteraction` emits `'use'` for bone meal via its existing fake-selector test setup.
- `bonemealTarget` is the consumption seam, tested with a consume counter.

## Observability/debugging
- `World.getBlockState` exposes the wheat `age`; `applyBonemeal`'s boolean distinguishes applied vs
  no-op. `Game.useBonemeal` emits a hotbar toast + sound on success.

## Affected files/symbols
- `src/inventory/ItemRegistry.ts` (`ItemId.BoneMeal`, new definition).
- `src/simulation/Bonemeal.ts` (new module).
- `src/player/PlayerInteraction.ts` (`update` bone-meal `'use'` branch).
- `src/engine/Game.ts` (`useBonemeal`, `isBonemealSelected`, `onInteractionAction` branch).
- Tests: `tests/unit/Bonemeal.test.ts` (new), `tests/unit/PlayerInteraction.test.ts`,
  `tests/unit/BlockItemSeparation.test.ts`.

## Rejected alternatives
- **Placement-style item**: rejected — bone meal must not place a block; it is a pure `'use'` item.
- **Maturing wheat in one use**: rejected — a fixed `+2` step keeps a deterministic, testable rule
  distinct from random-tick `+1` while still visibly accelerating growth.
- **PlayerInteraction directly consumes**: rejected — the codebase routes `'use'` to `Game`
  (enchanting-table pattern); keeping consumption in `Game` (via the testable `bonemealTarget`
  seam) is idiomatic and testable.
- **Adding a sapling block now**: rejected — no sapling block/stage exists; it is content work
  deferred to a later change and only documented here.

## Downstream dependencies
- Downstream changes (e.g. tree/sapling bonemeal, bone meal recipes) can add new
  `FertilizerRegistry.register` entries and a bone-meal recipe without changing the interface,
  item id, or persistence. No dependency on 128 (fire) is introduced.
