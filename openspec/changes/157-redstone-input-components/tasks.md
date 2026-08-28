# Tasks: 157-redstone-input-components

## Implementation
- [x] `src/world/BlockRegistry.ts`: `POWERED_SCHEMA`; `BlockId.Lever = 38`,
      `BlockId.StoneButton = 39`, `BlockId.PressurePlate = 40` with definitions (non-solid,
      breakable, `powered: false` default, dropping their items).
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.Lever = 38`, `ItemId.StoneButton = 39`,
      `ItemId.PressurePlate = 40`, each with `placeBlock`.
- [x] `src/simulation/RedstoneInputComponents.ts`: `RedstoneComponentKind`,
      `BUTTON_ACTIVE_TICKS`, `PLATE_RELEASE_DELAY_TICKS`, `componentSignalStrength`.
- [x] `toggleLever`, `ButtonPress` + `pressButton`, `platePowered`, `plateReleaseTick`.
- [x] `scheduleComponentRelease` / `dueComponentReleases` (047 bridge).
- [x] `componentStateProperties`.

## Tests
- [x] `tests/unit/RedstoneInputComponents.test.ts`: each block carries `POWERED_SCHEMA` + default.
- [x] Each item places its block; `validateItemBlockCrossReferences` passes.
- [x] Each block enumerates exactly 2 states with an unpowered default.
- [x] `componentSignalStrength` powered case for all three kinds.
- [x] `componentSignalStrength` unpowered case for all three kinds.
- [x] `toggleLever` flips.
- [x] `toggleLever` is an involution.
- [x] `pressButton` sets the correct release tick.
- [x] Re-pressing a button extends its release.
- [x] `platePowered` occupied / empty / invalid-count cases.
- [x] `scheduleComponentRelease` returns false and schedules nothing for a lever.
- [x] A button release is not due before its tick.
- [x] A button release fires at its tick.
- [x] Two components due on the same tick release in deterministic, repeatable order.
- [x] `componentStateProperties` projection matches the schema.
- [x] Characterization updates: `BlockRegistry` / `BlockPropertySchema` / `BlockStateRegistry` /
      `BlockItemSeparation` tests updated for the three new blocks and items.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (21/21).
- [x] Full `npm test` passes (180 files, 2120/2120 — prior 2099 + 21 new).
- [x] `npm run build` passes (registry edits in the live graph; the simulation module has no Game.ts consumer yet).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 158-redstone-torch).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
