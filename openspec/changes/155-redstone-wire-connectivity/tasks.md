# Tasks: 155-redstone-wire-connectivity

## Implementation
- [x] `src/world/BlockRegistry.ts`: `REDSTONE_WIRE_SCHEMA` (power 0-15 + four named sides);
      `BlockId.RedstoneWire = 37`; the block definition (non-solid, non-opaque, breakable,
      hardness 0, `dropItem` → `minecraft:redstone`, default state power 0 / all sides `none`).
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.Redstone = 37` with `placeBlock` →
      `minecraft:redstone_wire`.
- [x] `src/simulation/RedstoneWire.ts`: `WireConnection`, `HorizontalDirection`,
      `HORIZONTAL_DIRECTIONS`, `WireConnections`, `WireWorld` interface.
- [x] `resolveWireConnections` (documented branch order: wire/connectable → step-up with ceiling
      guard → descent → none).
- [x] `computeWirePower` (max of 154's `getIndirectPower` and each connected wire's power
      attenuated by one).
- [x] `wireStateProperties`.

## Tests
- [x] `tests/unit/RedstoneWire.test.ts`: the block resolves with its schema and default state.
- [x] The `redstone` item places the wire block; `validateItemBlockCrossReferences` passes.
- [x] `BlockStateRegistry` enumerates exactly 1296 wire states including the default.
- [x] `resolveWireConnections` wire-neighbour `'side'` case.
- [x] `resolveWireConnections` connectable-component `'side'` case.
- [x] `resolveWireConnections` step-up `'up'` case.
- [x] `resolveWireConnections` solid-ceiling blocks step-up case.
- [x] `resolveWireConnections` descent-reported-as-`'side'` case.
- [x] `resolveWireConnections` isolated-wire all-`'none'` case.
- [x] `computeWirePower` external-power case.
- [x] `computeWirePower` neighbour-minus-one case.
- [x] `computeWirePower` strongest-contributor case.
- [x] `computeWirePower` isolated-unpowered-zero case.
- [x] `computeWirePower` neighbour-at-one-contributes-nothing case.
- [x] `computeWirePower` up/down attenuation parity case.
- [x] `wireStateProperties` key/value projection case.
- [x] `wireStateProperties` clamps an out-of-domain power case.
- [x] `tests/unit/BlockItemSeparation.test.ts`: legacy-id table + placeable-item list updated for
      the new block/item (non-regression maintenance).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (24/24).
- [x] Full `npm test` passes (178 files, 2087/2087 — prior 2063 + 24 new).
- [x] `npm run build` passes (103 modules; the new simulation module has no Game.ts consumer yet, but the block/item registry edits are in the live graph).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 156-redstone-update-order).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
