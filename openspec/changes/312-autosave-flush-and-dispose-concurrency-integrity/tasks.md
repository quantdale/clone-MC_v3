# Tasks: 312-autosave-flush-and-dispose-concurrency-integrity

- [x] T1: Add failing-first unit tests in `tests/unit/AutosaveCoordinator.test.ts` and `tests/unit/GamePersistence.test.ts` proving concurrent `tick()`/`flush()` early exit (`outstandingSize > 0`), concurrent `flush()` interleaving, and `GamePersistence.dispose()` / `flush()` dropping or exiting before queued `rawWrites` settle.
- [x] T2: Serialize `AutosaveCoordinator.flush()`, suppress `tick()` while flushing, wait for external in-flight queue drains inside `flushExclusive()`, and join the queue mutex before returning in `src/storage/AutosaveCoordinator.ts`.
- [x] T3: Add bounded `settleRawWrites()` in `src/storage/GamePersistence.ts` and await raw metadata writes alongside `coordinator.flush()` in both `dispose()` (before repository `close()`) and `flush()`.
- [x] T4: Run focused unit suites (`AutosaveCoordinator.test.ts`, `GamePersistence.test.ts`, `RecoveryBackupAndAtomicReset.test.ts`, `DirtySaveQueue.test.ts`, and `*Persistence.test.ts`) and `tests/e2e/persistence.spec.ts` to confirm failures turn green with zero regressions.
- [x] T5: Run full unit suite (`npm test`), coverage (`npm run test:coverage`), fast verification gates (`verify:deps`, `validate-state`, `typecheck`, `lint`, `build`, `check-release-bundle`, `verify:file-audit`, `verify:orphans`, `verify:mcp`, `verify:visual-goldens`), and Playwright E2E (`npm run test:e2e`).
- [x] T6: Run isolated multiplayer performance (`npm run test:perf:multiplayer`) and verify all requirements against test evidence.
- [x] T7: Update `tasks.md`, `verification.md`, `PARITY_MATRIX.md` (`C312`), `PROGRAM_STATE.json`, `PROGRAM_STATE.md`, and `file-audit-manifest.json`, commit cleanly, and push directly to `origin/main`.
