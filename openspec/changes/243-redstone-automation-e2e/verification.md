# Verification: 243-redstone-automation-e2e

Status: IN PROGRESS (checkpoint: harness core + torch-burnout circuit)
Completion: 40% (6/15 tasks; gate-green subset)
Advancement allowed: false (below 90%, circuits 1-5 of 6 not yet implemented)

## Requirement evidence (implemented scope)

The harness composes the REAL production modules (`ScheduledTickQueue` 047,
`TorchBurnoutTracker` 158, the 234 `WorldSaveCodec`) over an in-memory fixture.
It MUST NOT re-implement timing/burnout logic. Implemented + tested scope:

| Requirement | Evidence | Status |
|---|---|---|
| progression-harness: deterministic construction | torch.test: "same input rerun produces an identical stateHash" | PASS |
| progression-harness: bounded deterministic stepping | torch.test: "stepUntil budget exhaustion returns steps taken and leaves the predicate false" | PASS |
| progression-harness: snapshot and restore mid-progression | torch.test: "restore(snapshot()) is idempotent"; saveReload/cycleChunk round-trips | PASS |
| progression-harness: atomic failure and abort | torch.test: "a malformed snapshot is rejected atomically (harness unchanged)" (AutomationError malformed_snapshot) | PASS |
| progression-harness: deterministic state hash | torch.test: "stateHash is stable for unchanged state" + same-seed equality | PASS |
| torch-burnout: 8 toggles safe, 9 burns out | torch.test: "exactly 8 toggles does not burn out; the 9th does" | PASS |
| torch-burnout: stays unlit then recovers | torch.test: "a burnt-out torch stays unlit, then recovers after BURNOUT_RECOVERY_TICKS of quiet" | PASS |
| torch-burnout: save/reload survival | torch.test: "a burnt-out torch state and toggle history survive saveReload with correct recovery"; "a healthy torch is unaffected by a saveReload round-trip" | PASS |
| torch-burnout: chunk-cycle survival | torch.test: "a burnt-out torch survives cycleChunk and recovers with correct timing" | PASS |

## Not yet implemented (remaining tasks)

- 2.1 full six-circuit `buildCircuit`/`probe` (clock, pulse-divider, t-flip-flop,
  piston-door, item-sorter-chain) — only `torch-burnout` built so far.
- 3.1 clock-and-divider, 3.2 t-flip-flop, 3.3 piston-door, 3.4 item-sorter-chain
  circuit tests.
- 3.6 full determinism + survival matrix across all six circuits.
- 4.1 remaining edge cases (duplicate scheduled entry dedup, cycleChunk-does-not-cancel
  a foreign pending entry, foreign worldId / duplicate block-entity key rejection).
- 4.2 confirm no shipped-game behavior changed (harness is test-support only; `Game.ts`
  /`World.ts`/154-172 modules untouched — already true).
- 4.3 full regression gate re-recorded at completion.

## Commands

| Command | Baseline (pre-243) | Result | Evidence/notes |
|---|---|---|---|
| npm run typecheck | PASS | PASS | `tsc --noEmit` clean (incl. new harness + tests) |
| npm run lint | PASS | PASS | `eslint .` clean |
| npm test | 282 files, 3648 passed / 1 skipped | PASS 283 files, 3658 passed / 1 skipped | +10 torch-burnout harness tests |
| npm run build | PASS | PASS | `tsc --noEmit && vite build` — 105 modules |
| npm run test:e2e | 35 passed (242) | (not re-run this checkpoint; 242 e2e unchanged by 243 test-support files) | 243 adds no e2e this checkpoint |

## Reconciliation notes

- The 047 `ScheduledTickQueue`, 156 `RedstonePropagator`, and 158 `TorchBurnoutTracker`
  exist with the described APIs (verified against source). `RedstonePropagator` is not
  yet driven by the harness (no wire circuit implemented); it will back the clock/divider
  and T-flip-flop circuits.
- `saveReload` round-trips `chunk-sections` through the real `createWorldSaveCodec`
  (`WorldSaveCodec` v1); 047 queue + burnout round-trip through an in-memory
  `SaveLoadBoundary`. The 234 codec does not persist the 047 queue (documented gap in
  design.md), so the queue is round-tripped via its own v1 contract alongside the codec.

## Final decision

IN PROGRESS — 40% task completion, gate-green for the implemented subset. Advancement to
VERIFIED blocked until all six circuits and the full survival matrix are implemented and
the full gate (incl. e2e) is green.
