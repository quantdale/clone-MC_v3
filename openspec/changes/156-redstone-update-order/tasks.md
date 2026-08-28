# Tasks: 156-redstone-update-order

## Implementation
- [x] `src/simulation/RedstonePropagation.ts`: `WirePowerStore`, `PropagationResult`,
      `RedstonePropagatorOptions` types.
- [x] `RedstonePropagator` constructor composing 049's `NeighborUpdateQueue` with the injected
      world/source/store.
- [x] `markDirty` / `markNeighborsDirty` / `pendingCount`.
- [x] `propagate` (fixed-point drain: skip non-wire, recompute via 155, write + enqueue only on
      change, `maxUpdates` bound with `hitLimit` reporting and a preserved backlog).
- [x] `settle` (repeat `propagate` until empty or `maxSettleRounds`, accumulating counts).

## Tests
- [x] `tests/unit/RedstonePropagation.test.ts`: straight-run attenuation case.
- [x] Signal-stops-at-zero beyond 15 blocks case.
- [x] Drain-to-zero after source removal case.
- [x] Wire-ring termination case (`hitLimit` false).
- [x] Determinism across two independent runs case.
- [x] Re-settle idempotence (`changed: 0`, no writes) case.
- [x] `maxUpdates` trips with `hitLimit` and a preserved backlog case.
- [x] Non-wire dirty position writes nothing case.
- [x] `markNeighborsDirty` enqueues six positions case.
- [x] Regression guard: a bound trip never dequeues a position it does not handle.
- [x] `settle` converges across rounds despite a tight per-pass `maxUpdates`.
- [x] Vertical (climb/descent) propagation case — a signal travels up a staircase of wires.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation (12/12).
- [x] Full `npm test` passes (179 files, 2099/2099 — prior 2087 + 12 new).
- [x] `npm run build` passes (103 modules — additive/unconsumed, no Game.ts consumer).
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (new validationResults entry, next change
      pointer to 157-redstone-input-components).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
