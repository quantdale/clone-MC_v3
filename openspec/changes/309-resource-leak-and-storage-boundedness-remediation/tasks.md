# Tasks: 309-resource-leak-and-storage-boundedness-remediation

- [x] **T1.** Author and validate complete spec-first change package, activate Change 309 in sequence overrides and program state, and update the file audit manifest.
- [x] **T2.** Add failing-first tests in `tests/unit/DirtySaveQueue.test.ts` for epoch map boundedness (including 10,000 distinct-key probe and clear-while-in-flight pruning).
- [x] **T3.** Implement bounded epoch map pruning in `src/storage/DirtySaveQueue.ts`, expose `retainedEpochCount`, and verify all `DirtySaveQueue` tests pass.
- [x] **T4.** Add failing-first tests in `tests/unit/GameLifecycleTeardown.test.ts` asserting Wither skull mesh/material reuse, despawn child mesh cleanup, and complete subsystem disposal on `Game.dispose()`.
- [x] **T5.** Implement Wither skull static geometry/material reuse, despawn mesh cleanup, and complete subsystem teardown in `src/engine/Game.ts`.
- [x] **T6.** Run full mandatory gates (`verify:deps`, `validate-state`, `typecheck`, `lint`, `npm test`, `build`, `verify:all`, `test:perf:multiplayer`) and verify zero regressions.
- [x] **T7.** Review evidence, reconcile durable state, publish checkpoint to `origin/main`, and verify remote head.
