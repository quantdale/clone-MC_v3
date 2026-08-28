# Verification: 243-redstone-automation-e2e

Status: VERIFIED
Completion: 100% (15/15 tasks)
Advancement allowed: yes (no exception used)

## Requirement evidence

The harness composes the REAL production modules (`ScheduledTickQueue` 047,
`RedstonePropagator` 156, `TorchBurnoutTracker` 158, `RedstoneRepeater` 159,
`RedstoneComparator` 160, `RedstoneObserver` 161, `RedstoneConsumers` 162,
`RedstoneInputComponents` 157, `PistonMovePlanner`/`PistonExecution`/
`PistonStickyGroups` 163-165, `HopperTransfer` 166, `DropperEject` 167, the 234
`WorldSaveCodec`) over an in-memory fixture. No timing/burnout/propagation logic
is re-implemented.

| Spec requirement | Evidence | Status |
|---|---|---|
| automation-harness: deterministic construction | harness.test "two identically constructed harnesses driven by the same script produce identical stateHash" | PASS |
| automation-harness: bounded deterministic stepping | harness.test "a due event fires exactly once at its absolute tick"; "stepUntil budget exhaustion returns false..." | PASS |
| automation-harness: snapshot and restore mid-run | harness.test "restore(snapshot()) mid-run then continuing equals an uninterrupted run" (hash equality); torch.test idempotence | PASS |
| automation-harness: atomic failure and abort | harness.test table over six malformed payloads (wrong version, non-integer tick, foreign worldId, 047 version≠1 → malformed_scheduled_queue, duplicate block-entity key, malformed tuple), each asserting code + unchanged snapshot | PASS |
| automation-harness: full-world save→reload | harness.test "a pending event survives saveReload... rises exactly once at absolute tick 16"; circuits.test clock/divider/sorter round-trip tests | PASS |
| automation-harness: encode failure atomicity | harness.test "an encode failure leaves no partial world" (boundary throws on block-entities; hash unchanged) | PASS |
| automation-harness: single-chunk unload→reload | harness.test pending-inside-chunk edges [16,32]; foreign entry (500,64,0) not cancelled and fires at tick 30 | PASS |
| automation-harness: circuit building and probing | harness.test second build leaves first circuit's probe output untouched | PASS |
| automation-harness: deterministic state hash | harness.test hash stability + post-step change; torch.test same-seed equality | PASS |
| clock-and-divider: clock period | circuits.test "clock produces periodic rising edges at 0/16/32/48 with no mid-period edge and no burnout" | PASS |
| clock-and-divider: not-due/due ticks | circuits.test "no edge at 15, exactly one edge at 16" | PASS |
| clock-and-divider: clock survives save→reload with phase | circuits.test "mid-cycle saveReload preserves the next absolute edge and the phase" (edges [16,32] + hash equality vs uninterrupted run) | PASS |
| clock-and-divider: clock survives chunk cycle | circuits.test "mid-cycle cycleChunk preserves the next absolute edge and the stored state" | PASS |
| clock-and-divider: divider ratio ÷2 / ÷4 | circuits.test risings exactly [32,64] resp. [64,128], none at 16/32/48 | PASS |
| clock-and-divider: divider survives round-trips with phase | circuits.test saveReload + cycleChunk phase tests (off-half preserved at 24, rising exactly at 32) | PASS |
| t-flip-flop: toggle behavior | circuits.test alternating toggles [on,off,on,off]; stability over 8×16 ticks | PASS |
| t-flip-flop: latch survives save→reload (on/off) | circuits.test latched-on and latched-off round-trips; next edge toggles once | PASS |
| t-flip-flop: latch survives chunk cycle | circuits.test cycle preserves latch + probe map + correct next toggle | PASS |
| piston-door: open and close | circuits.test farthest-first push to D, C cleared, retract returns block to C | PASS |
| piston-door: open/closed survive save→reload | circuits.test extended and retracted round-trips | PASS |
| piston-door: door state survives chunk cycle | circuits.test open-state cycle with block-position map unchanged | PASS |
| item-sorter-chain: one-item cadence | circuits.test transfer not due at 7, moves one at 8; drop due at 16 (ejected length 1) | PASS |
| item-sorter-chain: full destination no-spill | circuits.test full dropper leaves source untouched (no partial depletion) | PASS |
| item-sorter-chain: counts survive save→reload | circuits.test counts + pending transfer preserved; fires once at absolute tick 16 | PASS |
| item-sorter-chain: counts survive chunk cycle | circuits.test same via cycleChunk | PASS |
| item-sorter-chain: multi-item conservation | circuits.test 40-tick run with saveReload@12 + cycleChunk@28 conserves total=9 at every step | PASS |
| torch-burnout: burnout threshold/recovery/round-trips | torch.test 10 tests (8 safe/9 burns, recovery timing, saveReload + cycleChunk survival, healthy torch unaffected) | PASS |
| determinism + survival matrix (3.6) | harness.test table-driven matrix: 6 circuits × {none, saveReload, cycleChunk} all reach the baseline stateHash | PASS |

## Commands

| Command | Baseline (pre-243) | Result | Evidence/notes |
|---|---|---|---|
| npm run typecheck | PASS | PASS | `tsc --noEmit` clean incl. all new test files |
| npm run lint | PASS | PASS | `eslint .` clean |
| npm test | 282 files, 3648 passed / 1 skipped | PASS 285 files, 3694 passed / 1 skipped | +36 tests: 22 circuits (3.1-3.4) + 14 harness-spec/matrix/adversarial (3.6/4.1); torch suite updated for boolean `stepUntil` per spec |
| npm run build | PASS | PASS | `tsc --noEmit && vite build` — dist emitted |
| npm run test:e2e | 35 passed (242) | PASS 35 passed (7.6m) | 243 adds no e2e; 242 suite unchanged and green |

## Reconciliation notes (final)

- **CLOCK_PERIOD_TICKS = 16 confirmed by measurement.** The canonical topology is a
  torch + delay-3 repeater ring (6-tick repeater + 2-tick torch update per half-cycle).
  Two measured failure modes shaped the fixture: a return row directly beside the main
  line both step-connects into the repeater's input line (latching the loop) and
  perpendicularly powers the repeater (locking it on); the shipped row therefore runs
  two blocks south of the main line. The output wire is settled once at build so the
  first rising edge lands at tick 0, matching the spec scenario.
- **Repeater input is directional in the harness driver** (`repeaterInputPower`: back
  face only). An omnidirectional read sees the repeater's own powered output wire and
  latches it on forever. This is World-driver wiring, not a change to any 154-172 module.
- **Divider semantics**: the ÷N divider is a counter chain over the real clock edges —
  the ÷2 output stage toggles every edge (period 32), the ÷4 stage every second edge
  (period 64) — giving first output rising edges at exactly N×16 as specified. The
  build pre-toggles the output torch and seeds `prevInput=1` so the tick-0 edge is the
  chain's first edge rather than being double-counted.
- **Sticky retract origin**: an extended sticky piston's head occupies the position in
  front of its body, so `applyPiston(retract)` plans the pull from the head position;
  this models 165's pull without placing a head block.
- **saveReload scope**: the 234 codec does not persist the 047 queue (documented gap in
  design.md), so the queue round-trips through its own v1 contract alongside the codec.
  Chunk-sections AND block-entities units are encoded/decoded through the real
  `createWorldSaveCodec` per occupied chunk, validated against the captured state
  before any mutation (all-or-nothing), then the full snapshot (including component
  props the id-based column cannot carry) is committed atomically.
- **stepUntil returns boolean** per the automation-harness spec ("MUST return false…
  when the budget is exhausted"); the earlier torch-suite assertion was updated to the
  spec'd semantics.
- **Item pipeline**: hopper pushes from its own inventory into its facing container
  (`transferOneItem`, 166); dropper ejects via `ejectFromDropper` (167) into a
  container or, facing air, into the harness's ejected log (the item-entity stand-in);
  conservation covers stages + ejected items.

## Not yet implemented

- Nothing. All 15 tasks are complete with evidence above.

## Final decision

VERIFIED — 15/15 tasks (100%), every MUST/SHALL requirement reconciled with passing
evidence, full gate green (typecheck, lint, unit 285 files / 3694 passed + 1 skipped,
build, e2e 35/35), no unresolved blocker, no advancement exception used. Change 244
(worldgen-regression-matrix) is eligible to activate.
