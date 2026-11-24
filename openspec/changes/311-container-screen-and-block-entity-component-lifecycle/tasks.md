# Tasks: 311-container-screen-and-block-entity-component-lifecycle

- [x] T1: Add failing-first unit tests for `MenuTransaction` slot/cursor hygiene, `InventoryScreenParity` component drag/gather/equality, `BrewingStandBlockEntity` hygiene/consumption, and `LiveBlockEntityHost` equality.
- [x] T2: Enforce strict slot and cursor component hygiene in `src/inventory/MenuTransaction.ts` (`validateSlot` and `validateCursor` reject components on null items).
- [x] T3: Implement component preservation, matching, and cleanup in `src/inventory/InventoryScreenParity.ts` (`dragEnd` preserves/matches/sets components, `doubleClickGather` matches/carries/cleans components, `sameSlot` and `sameMenu` compare components).
- [x] T4: Implement empty slot component rejection and clean slot depletion in `src/world/BrewingStandBlockEntity.ts` (`validateSlot` rejects components on null items, `consumeOne` deletes components upon count reaching 0).
- [x] T5: Implement component-aware state equality in `src/engine/LiveBlockEntityHost.ts` (`brewingStateEquals` and `furnaceStateEquals` use `menuComponentsEqual`).
- [x] T6: Run targeted test suites and regression tests across `tests/unit/MenuTransaction*.test.ts`, `tests/unit/InventoryScreenParity.test.ts`, `tests/unit/BrewingStandBlockEntity.test.ts`, and `tests/unit/LiveBlockEntityHost.test.ts`.
- [x] T7: Review requirement evidence, run full 13 `verify:all` gates and isolated multiplayer performance, update program state, and publish checkpoint to `origin/main`.
