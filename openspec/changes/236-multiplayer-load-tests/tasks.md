# Tasks: 236-multiplayer-load-tests

## 1. Baseline and characterization

- [x] 1.1 Verify the 231 baseline is green (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`) and record unit/e2e counts.
- [x] 1.2 Characterize the public surfaces the harness consumes (WorldTickProcess 224, ChunkStreamManager 226, EntityReplicationManager/ClientEntityStore 229, InventoryTransactionValidator/ClientInventoryReconciler 231, ConnectionLifecycle 225), confirm no existing multi-client fixture or server coordinator exists, and define the named fixture scenarios and concrete budget defaults in design.md and the performance spec: `BASELINE_LOAD` (4 clients, viewDistance 4, 1024 entities, 40-slot windows, 1200 ticks; ≥ 200 ticks/sec; ≤ 6000 ms), `CHUNK_STRESS`, `ENTITY_CHURN`, `INVENTORY_BURST`.

## 2. Fixture harness implementation

- [x] 2.1 Implement scenario/session types and `MultiClientHarness` construction in `src/simulation/MultiClientLoadHarness.ts`: one authoritative `WorldTickProcess` plus `N` client sessions (connection + chunks + entity server/client + inventory validator/reconciler), with strict `MultiClientHarness: <detail>` validation of `clientCount`/`config`.
- [x] 2.2 Implement deterministic stepping: `step(ticks)` advances the world process, then consumes each client (ascending index; chunks → entities → inventory) into chunk `pendingUpdates`, entity `collectUpdates`/`applyBatch`, and queued inventory transactions; `stepTo` bounded stepping; `reset()`; per-055 snapshot/restore replay hooks.
- [x] 2.3 Implement `MultiClientMetricsCollector` (per-client, per-tick chunk/entity/inventory counters; validated non-negative integers; `clientTotals(i)`/`totals()`/`reset()`) and `MultiClientBudgets`, `validateMultiClientBudgets`, `evaluateMultiClientBudgets` (per-dimension + overall verdict; boundary equality within budget; non-finite/negative actuals are violations), mirroring the 075 render-budget pattern.

## 3. Correctness fixtures (unit tests)

- [x] 3.1 Write tick fixtures: two/three clients step against one process to the same tick; a throwing system stops every client with the failed tick uncounted; `reset()` restores a clean state (REQ-C1, REQ-C2).
- [x] 3.2 Write chunk fixtures: first-center enters the full interest set exactly once; one-column move yields the exact entered/left delta; late snapshot surfaces as an update; `maxSnapshots` eviction; identical clients produce identical sequences (REQ-C3).
- [x] 3.3 Write entity fixtures: exact-once spawn/despawn; deltas only for tracked entities; client store converges to the authoritative in-range set; `maxTracked` enforced (REQ-C4).
- [x] 3.4 Write inventory fixtures: accepted prediction confirms and clears the reconciler; rejection rolls back to the authoritative snapshot; wrong `stateId` and duplicate/end-without-start drag rejected; two clients on a shared window converge (REQ-C5).
- [x] 3.5 Write multi-client convergence, determinism/replay, and boundary/failure fixtures (interleaved ops converge; identical runs identical; restore-then-step equals fresh run; out-of-range/NaN/invalid-tick inputs throw without mutation) (REQ-C6, REQ-C7, REQ-C8).

## 4. Performance fixtures and regression gate

- [x] 4.1 Write performance fixtures with the scripted clock (deterministic timing and message totals identical across runs and immune to wall-clock perturbation, REQ-P1, REQ-P5) and with the wall clock (canonical `BASELINE_LOAD` meets the sustained ticks/sec budget and the elapsed ceiling, recording actuals, REQ-P3, REQ-P7).
- [x] 4.2 Write per-tick message-ceiling fixtures and a 10,000-tick bounded-resource fixture (chunk/entity stores within capacity; reconciler predictions empty at quiescence) (REQ-P2, REQ-P4, REQ-P6).
- [x] 4.3 Run the full baseline gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`) and confirm no regressions.
- [x] 4.4 Record actual performance numbers and requirement evidence in `verification.md`; update `PROGRAM_STATE.json` and `PROGRAM_STATE.md`; advance change to VERIFIED.
