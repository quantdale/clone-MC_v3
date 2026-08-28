# Tasks: 168-dispenser

## Implementation
- [x] `src/world/BlockRegistry.ts`: `DISPENSER_SCHEMA` (facing 5-way, enabled); `BlockId.Dispenser = 52`
      with its definition and default state.
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.Dispenser = 52` with `placeBlock`.
- [x] `src/simulation/DispenserBehavior.ts`: `DispenserFacing` type; `DISPENSER_EJECT_COOLDOWN_TICKS`.
- [x] `DispenserBehaviorKind`; `DispenserItemBehavior`; `DISPENSER_ITEM_BEHAVIORS` (initial vanilla
      set: arrow/snowball/egg/fire_charge/fireball/experience_bottle/flint_and_steel).
- [x] `getDispenserBehavior(item)` (table lookup; `null` for plain items).
- [x] `DispenserAction` (behavior / container / drop / none).
- [x] `dispenseFromDispenser` (special item -> `behavior` consuming one; plain item delegates to 167's
      `ejectFromDropper`; empty source -> `none`).
- [x] `dispenserShouldTransfer` (inverted: `!powered`).
- [x] `dispenserOutputPosition` (154's `offsetInDirection`).
- [x] `scheduleDispenserEject` / `dueDispenserEjects` (047 bridge).
- [x] `dispenserStateProperties`.

## Tests
- [x] `tests/unit/DispenserBehavior.test.ts`: block carries schema + default.
- [x] Item places the block; cross-reference passes.
- [x] Block enumerates exactly 10 states including the default.
- [x] Behavior-table lookup returns a behavior for a known special item; `null` for a plain item.
- [x] The initial special-item set is present in the table.
- [x] `dispenserShouldTransfer` returns `true` when unpowered, `false` when powered.
- [x] `dispenserOutputPosition` follows the given facing (all five facings).
- [x] `dispenseFromDispenser`: empty source is a `none` no-op.
- [x] Special item yields `behavior` with source decremented by one and the right payload.
- [x] Plain item delegates to a container push (merges).
- [x] Plain item delegates to a world `drop` when facing no container.
- [x] Full container yields `none` with source untouched (no spill).
- [x] Scheduling not-due-before-tick case.
- [x] Scheduling fires-at-tick case.
- [x] Same-tick ejections deterministically ordered (repeatable).
- [x] `dispenserStateProperties` projection matches the schema.
- [x] Characterization updates for the new block/item (BlockRegistry 40→41, BlockStateRegistry total
      + dispenser branch, BlockPropertySchema STATEFUL set).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2280/2280 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 169-explosion-core).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
