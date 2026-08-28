# Proposal: 236-multiplayer-load-tests

## Problem

Changes 222-235 built the shared simulation boundary (222), network protocol codecs (223), the
headless authoritative tick process (224), connection lifecycle (225), server chunk streaming
(226), entity replication (229), and inventory network transactions (231) as standalone pure
modules. None of them has been exercised under multiple simultaneous clients, and there is no
reusable, deterministic way to measure how the combined system behaves (and how fast it runs)
when several clients tick, stream chunks, receive entity replicas, and submit inventory
transactions against a single authoritative world. Without fixtures, regressions in correctness
(convergence, exact-once deltas, rollback) and performance (throughput, per-tick message volume)
can slip in unnoticed as the multiplayer stack is wired together.

## Goals

- Provide a pure headless fixture harness that composes `N` simulated client sessions against one
  authoritative `WorldTickProcess`, so multi-client scenarios are deterministic and
  unit-testable.
- Provide correctness fixtures over the tick process, chunk streaming, entity replication, and
  inventory transactions: exact-once deltas, deterministic ordering, client-to-authoritative
  convergence, rollback on rejection, bounded capacity, and failure-stops-everything semantics.
- Provide performance fixtures with a headless measurement method: a per-client, per-tick metric
  collector and a validated budget evaluator (mirroring the 075 render-budget pattern) with
  concrete, measurable budgets (minimum sustained ticks/sec, per-tick message ceilings, and an
  elapsed wall-time regression ceiling).
- Make all fixtures reproducible independent of machine speed via a scripted injectable clock,
  plus a separate wall-clock throughput measurement.

## Non-goals

- No new gameplay/network protocol. The harness consumes the existing `WorldTickProcess`,
  `ChunkStreamManager`, `EntityReplicationManager`/`ClientEntityStore`,
  `InventoryTransactionValidator`/`ClientInventoryReconciler`, and `ConnectionLifecycle` APIs
  without modifying them.
- No combat networking fixtures. Change 232 `combat-networking` (VERIFIED) is not composed by
  this change; combat message load is not part of this change's scope.
- No adversarial/malformed-message validation or rate-abuse testing. Malformed, out-of-order, and
  rate-abusive handling is the narrow outcome of change 237 `network-adversarial-validation` and
  is deliberately deferred. This change only asserts the *existing* modules' documented rejection
  behaviors (`wrong_state_id`, `drag_not_started`, out-of-range) through deterministic fixtures,
  not a general fuzzer.
- No real transport (WebSocket), no browser rendering, and no DOM. Everything is headless and
  shareable per the 222 boundary.

## Preconditions

- Change 235 `reconnect-state-recovery` is VERIFIED (program state).
- The modules the fixtures consume exist and are headless-safe: `WorldTickProcess` (224),
  `ChunkStreamManager` (226), `EntityReplicationManager`/`ClientEntityStore` (229),
  `InventoryTransactionValidator`/`ClientInventoryReconciler` (231), `ConnectionLifecycle` (225),
  `NetworkProtocol` codecs (223), `SimulationHarness` (055).
- `npm test` (3346 unit) and `npm run test:e2e` (22) green at the 235 baseline.

## Dependencies

- Pure TypeScript module `src/simulation/MultiClientLoadHarness.ts` (NEW), following the 222-231
  conventions (`Module: <detail>` throws, strict validation, deterministic execution, no DOM/IO).
- Measurement pattern from 075 `RenderPerformanceMonitor`/`RenderBudget` (injectable clock,
  validated config, per-dimension evaluator).
- Unit-test conventions in `tests/unit/` (Vitest, node environment).

## Proposed change

- **NEW** `src/simulation/MultiClientLoadHarness.ts`:
  - `MultiClientScenario` / `MultiClientSession`: a deterministic composition of one authoritative
    `WorldTickProcess` plus `N` client sessions, each session bundling a `ConnectionLifecycle`, a
    `ChunkStreamManager`, an `EntityReplicationManager` + `ClientEntityStore`, and an
    `InventoryTransactionValidator` + `ClientInventoryReconciler`.
  - `MultiClientHarness.step(ticks)` / `stepTo` / `update(nowMs)`: advances the world process,
    then after every world tick consumes each client's chunk updates (`pendingUpdates`), entity
    batches (`collectUpdates` → `ClientEntityStore.applyBatch`), and queued inventory
    transactions, in a fixed deterministic order (ascending session index; within a client
    chunks → entities → inventory).
  - `MultiClientMetricsCollector`: per-tick, per-client counters for chunk / entity / inventory
    message volumes and inventory accept/reject counts, with per-client per-tick records,
    client/aggregate totals, and per-client-tick maxes for budget evaluation.
  - `MultiClientBudgets`, `validateMultiClientBudgets`, `evaluateMultiClientBudgets`: a typed,
    validated budget contract (minimum sustained ticks/sec, per-tick message ceilings, elapsed
    wall-time ceiling) with a per-dimension + overall verdict, mirroring 075.
  - Named fixture scenarios: `BASELINE_LOAD`, `CHUNK_STRESS`, `ENTITY_CHURN`, `INVENTORY_BURST`
    (exported scenario presets).
- **NEW** `tests/unit/multi-client-correctness.test.ts`: correctness fixtures (see the
  `multi-client-correctness-fixtures` spec).
- **NEW** `tests/unit/multi-client-performance.test.ts`: performance fixtures (see the
  `multi-client-performance-fixtures` spec).

## Compatibility and migration

Additive. No existing module or public symbol changes; the harness only imports and drives the
existing 224-231 modules. No stored/persistent data, no save format, no protocol version change.

## Risks

- Wall-clock throughput is machine-dependent. Mitigation: budgets are ceilings that catch
  regressions, actuals are recorded in `verification.md`, and the deterministic fixtures (scripted
  clock) provide machine-independent evidence of message-volume and tick correctness. The
  normative throughput/elapsed verdicts come from the canonical isolated measurement
  (`MC_CANONICAL=1 npx vitest run tests/unit/multi-client-performance.test.ts`), so parallel
  suite load never produces a false verdict.
- Overly tight budgets could flake in CI. Mitigation: budgets are conservative ceilings; boundary
  equality counts as within budget (075 convention).
- Overlap with 237 adversarial validation. Mitigation: explicit non-goal; only the existing
  modules' documented rejection paths are asserted, never a fuzzer.

## Rollback strategy

Revert the commit; the change is additive with no consumers in production paths.

## Definition of Done

- The harness composes `N` clients against one authoritative `WorldTickProcess` and steps them
  deterministically.
- All correctness-fixtures requirements (REQ-C1..REQ-C8) and performance-fixtures requirements
  (REQ-P1..REQ-P7) are verified by unit tests.
- Budget evaluator is validated and the canonical scenario's throughput/elapsed ceilings are
  measured and recorded.
- Baseline gate `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e` all PASS; unit count grows by the 236 suites, e2e stays green.

## Advancement gate

100% task completion; all MUST/SHALL requirements verified; regression gate green.
