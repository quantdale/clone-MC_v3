# Tasks: 308-reset-save-integrity

- [x] **T1.** Verify 307 completion/remote freshness; independently reproduce failure-reset dirty-edit loss and queue clear/failure resurrection.
- [x] **T2.** Complete and validate spec-first package, activation, sequence and file audit; record the separate epoch-retention finding without claiming it fixed.
- [x] **T3.** Add failing-first deterministic queue clear/failure/new-mark tests and reset failure/snapshot/concurrency/retry integration tests.
- [x] **T4.** Implement reset synchronization and clear cancellation without breaking newer marks, failure retry or existing save semantics; prove focused storage suites.
- [x] **T5.** Investigate direct raw metadata writes for reset races, reproduce and fix any corruption with tests or leave advancement blocked.
- [x] **T6.** Run full mandatory gates, browser reset/persistence and isolated multiplayer performance; reconcile every normative scenario and record evidence.
- [ ] **T7.** Review and publish the coherent checkpoint normally to `origin/main`; verify remote head and durable state.
