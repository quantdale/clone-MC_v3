# Tasks: 310-container-and-transfer-component-integrity

- [x] **T1.** Author and validate complete spec-first change package, activate Change 310 in sequence overrides and program state, and update the file audit manifest.
- [x] **T2.** Add failing-first tests in `tests/unit/ChestBlockEntity.test.ts` and `tests/unit/FurnaceBlockEntity.test.ts` for component round-trip preservation and empty-slot component rejection.
- [x] **T3.** Implement component preservation and empty-slot validation in `src/world/ChestBlockEntity.ts` and `src/world/FurnaceBlockEntity.ts`, and verify all chest, double-chest, furnace, and smoker suites pass.
- [x] **T4.** Add failing-first tests in `tests/unit/HopperTransfer.test.ts` for component-aware destination matching (`menuComponentsEqual`), empty-slot component preservation, and 0-count component deletion.
- [x] **T5.** Implement component-aware transfer in `src/simulation/HopperTransfer.ts`, and verify all hopper transfer tests pass.
- [x] **T6.** Add failing-first tests in `tests/unit/DropperEject.test.ts` and `tests/unit/DispenserBehavior.test.ts` asserting component preservation on `DroppedItem` and 0-count component cleanup; implement in `DropperEject.ts` and `DispenserBehavior.ts`.
- [x] **T7.** Run full mandatory gates (`verify:all` + `test:perf:multiplayer`), reconcile durable state and parity matrix, publish checkpoint to `origin/main`, and verify remote head.
