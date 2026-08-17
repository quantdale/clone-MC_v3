# Proposal: 243-redstone-automation-e2e

## Problem

The redstone and automation modules implemented across changes 154-172 —
`RedstoneSignal` (154), `RedstoneWire` (155), `RedstonePropagation` (156),
`RedstoneInputComponents` (157), `RedstoneTorch` (158), `RedstoneRepeater` (159),
`RedstoneComparator` (160), `RedstoneObserver` (161), `RedstoneConsumers` (162),
`PistonMovePlanner` (163), `PistonExecution` (164), `PistonStickyGroups` (165),
`HopperTransfer` (166), `DropperEject` (167), `DispenserBehavior` (168),
`ExplosionCore` (169), `TntPriming` (170), `RailBlockStates` (171), and
`MinecartPhysics` (172) — exist today as **pure, headless, individually
unit-tested modules**. Change 173 (`redstone-regression-worlds`) proves each
module's canonical timing in isolation (F1-F8), but nothing composes them into
**automation circuits** (a clock, a pulse divider, a T-flip-flop, a piston door,
an item-sorter-like hopper chain) and drives them through the two operations
that define the narrow outcome: **save/reload** and **chunk cycling**
(unload → reload of a chunk).

Critically, no test asserts that *pending scheduled work* survives these
operations. All redstone timing rides the 047 `ScheduledTickQueue`
(`scheduleRepeaterOutput`, `scheduleTorchUpdate`, `scheduleComparatorUpdate`,
`scheduleObserverPulseStart/End`, `scheduleLampOff`, `scheduleHopperTransfer`,
`scheduleDropperEject`, `scheduleDispenserEject`, `scheduleComponentRelease`).
A pending repeater output scheduled at absolute tick `T` must still fire at `T`
after a save/reload or chunk cycle — it must not be dropped, duplicated, or
re-anchored to `T + delay`. Circuit *state* (a latched T-flip-flop output, an
extended piston, a burnt-out torch, a hopper's in-flight item) must likewise be
round-tripped losslessly. No existing test covers this cross-module survival
matrix.

## Goals

- Deliver a **headless Vitest `RedstoneAutomationHarness`** (test-support
  infrastructure under `tests/`) that composes the **real** production redstone
  modules (never re-implementations) over an in-memory world fixture and a 047
  `ScheduledTickQueue`, and drives them with `SimulationHarness`-style
  deterministic stepping.
- Define and verify **six canonical automation circuits**: a **clock** (periodic
  oscillator), a **pulse divider** (frequency-dividing edge stream), a
  **T-flip-flop** (latching toggle), a **piston door** (piston-driven movable
  barrier), an **item-sorter-like hopper chain** (hopper→dropper/chest item
  pipeline), and a **torch burnout/recovery** edge case. Each has concrete,
  tick-exact completion assertions.
- Prove **timing survives save/reload and chunk cycling**: an absolute-tick
  scheduled event fires at the same tick after a round-trip as without one.
- Prove **circuit state survives** the operations: block states, latched
  outputs, extended-piston positions, container inventories, and the torch
  burnout tracker are round-tripped losslessly (no item loss or duplication).
- Prove **determinism and atomicity**: identical input yields an identical
  `stateHash()`; a malformed restore/save payload is rejected atomically and
  never partially committed.
- Add a **save/reload/chunk-cycle survival matrix** enumerating, per circuit,
  the asserted dimensions (timing, circuit state, pending scheduled work) across
  the operations (full save→reload via the 234 seams, single-chunk unload→
  reload, and unload-while-work-pending), plus failure scenarios.

## Non-goals

- **No new gameplay features.** This change does NOT implement, extend, or
  re-balance redstone propagation, components, pistons, hoppers, droppers,
  dispensers, TNT, rails, or minecarts beyond what the existing modules provide.
- **No wiring of redstone into the shipped `Game`/`World` runtime.** The modules
  are deliberately not wired into `src/engine/Game.ts` today; that wiring is a
  future feature change and is explicitly out of scope. The authoritative driver
  is the headless harness composing the real modules.
- **No extension of the 234 persistence codec.** `WorldSaveCodec`/`PersistentUnitKind`
  carries exactly five kinds (world-metadata, chunk-sections, block-entities,
  entities, player-state); a scheduled-tick unit kind is NOT added here. The
  harness round-trips the 047 queue through its existing
  `SerializedScheduledTickQueue` (v1) alongside the 234 seams for
  chunk-sections/block-entities. Adding the kind to 234 is adjacent scope for a
  later change.
- **No rendering, HUD, or UI changes; no multiplayer/network behavior.**
- No changes to any module in 154-172 or their unit suites; 173's F1-F8 remain
  untouched as the baseline.

## Preconditions

- All 154-172 modules exist, are pure/headless, and have green individual unit
  suites, including the 173 `RedstoneRegressionWorlds.test.ts` (F1-F8) baseline.
- `SimulationHarness` (055) provides `step`, `stepUntil`, `snapshot`, `restore`,
  `reset`, and `run`. `ScheduledTickQueue` (047) provides `serialize`/
  `deserialize` (`SerializedScheduledTickQueue` v1) with deterministic
  `(tickTime, seq)` pop order and per-position dedup. `RedstonePropagator` (156)
  provides `markDirty`/`settle`. `TorchBurnoutTracker` (158) provides
  `recordToggle`/`isBurnedOut`/`clear`.
- The 234 save seams exist: `createWorldSaveCodec` (`WorldSaveCodec`),
  `ServerSaveLifecycle` (`SaveLoadBoundary`, all-or-nothing `load`), and the
  `BlockEntityChunkRecord`/`SerializedChunkColumn` envelopes (036/035). The
  harness consumes these through their boundary seams with an in-memory fixture.
- The immediately preceding change (242) is verified and advancement is allowed
  before 243 is implemented.

## Dependencies

- `openspec/changes/055-simulation-test-harness` — `SimulationHarness`
  deterministic-stepping semantics the harness builds on.
- `openspec/changes/047-scheduled-tick-queue` — the timing spine; its
  `serialize`/`deserialize` is the survival-under-round-trip contract.
- `openspec/changes/234-server-world-persistence` — `WorldSaveCodec`/
  `ServerSaveLifecycle` seams for full-world save→reload of chunk-sections and
  block-entities.
- The 154-172 redstone/automation modules (their public, pure APIs are the
  harness contract surface).
- `openspec/changes/173-redstone-regression-worlds` — the F1-F8 canonical timing
  constants reused by the circuit fixtures (`REPEATER_DELAY_TICKS`,
  `COMPARATOR_UPDATE_DELAY_TICKS`, `HOPPER_TRANSFER_COOLDOWN_TICKS`,
  `DROPPER_EJECT_COOLDOWN_TICKS`, `TORCH_UPDATE_DELAY_TICKS`,
  `BURNOUT_TOGGLE_LIMIT`/`BURNOUT_WINDOW_TICKS`/`BURNOUT_RECOVERY_TICKS`,
  `OBSERVER_PULSE_START_DELAY_TICKS`/`OBSERVER_PULSE_DURATION_TICKS`,
  `LAMP_OFF_DELAY_TICKS`).
- `openspec/changes/036-block-entity-persistence-store` —
  `BlockEntityChunkRecord`/`SerializedBlockEntity` envelopes for container
  inventories (chest 27-slot payload via `ChestBlockEntity`).

## Proposed change

Author a complete OpenSpec package for `243-redstone-automation-e2e`:

1. `proposal.md`, `design.md`, `tasks.md`, `verification.md` per
   `SPEC_AUTHORING_PROTOCOL.md`.
2. Six capability specs under `specs/`:
   - `specs/automation-harness/spec.md` — the headless execution + persistence
     seam contract (deterministic stepping, snapshot/restore, save/reload via the
     234 seams, single-chunk cycling, state hash, atomic rejection).
   - `specs/clock-and-divider/spec.md` — the clock and pulse divider circuits and
     their tick-exact, phase-preserving timing survival.
   - `specs/t-flip-flop/spec.md` — the latching toggle circuit and state
     survival.
   - `specs/piston-door/spec.md` — the piston-driven door, extended state and
     moved-block-position survival.
   - `specs/item-sorter-chain/spec.md` — the hopper chain item counts and
     in-flight scheduled-transfer survival (no loss/duplication).
   - `specs/torch-burnout/spec.md` — the torch burnout/recovery state survival
     and recovery-timing edge case.

The package is documentation-only and contains no production code and no test
files. The implementing agent produces the harness (test-support infrastructure
under `tests/`), the circuit tests, the edge/failure tests, the determinism
tests, and the survival-matrix tests per these specs, then reconciles the
package with the actual implementation.

## Compatibility and migration

No stored/public data format changes. The harness round-trips existing state
through already-versioned contracts: `SerializedScheduledTickQueue` (047 v1),
`SerializedChunkColumn` (035), `BlockEntityChunkRecord`/`SerializedBlockEntity`
(036 v1, chest inventory payload via `serializeChestInventory`), and the 234
`WorldSaveCodec` envelope kinds. No browser-save format changes. No migration
needed. The 234 `PersistentUnitKind` union is NOT extended.

## Risks

- **Fixture fidelity**: an in-memory world fixture must behave enough like the
  real `World` for the modules (wire `isWire`/`isSolid`/`connectsToRedstone`,
  `RedstonePowerSource` power reads, piston/explosion/minecart world seams). The
  spec mandates using the real modules over the fixture and limiting fixture
  responsibilities to the injected module surfaces.
- **Phase drift after cycling**: if a scheduled event is re-anchored relative to
  the current tick instead of preserved at its absolute tick, the clock/divider
  phase shifts. The spec makes absolute-tick preservation the core MUST and
  pins both the not-due and due tick in every timing boundary.
- **Scheduled-tick persistence gap**: 234 does not persist the 047 queue. The
  spec scopes queue persistence to the harness's own round-trip through 047's
  `serialize`/`deserialize`, and records the 234 gap as a non-goal so it is not
  silently "fixed" here.
- **Adjacent scope**: wiring redstone into `Game` or extending the 234 codec
  would be large adjacent scope. Mitigation: the harness is the authoritative
  driver and lives under `tests/`; the specs enumerate explicit non-goals.
- **Exhaustive budget**: a clock run over many periods could need many ticks.
  The spec mandates a bounded step budget per scenario and a budget-exceeded
  (not success) result.

## Rollback strategy

Documentation-only change; revert by removing the authored directory. The
implementing agent's changes are test-support fixtures plus assertions; they do
not alter shipped runtime behavior, so reverting is safe. No data migration is
involved.

## Definition of Done

- All six circuits complete headlessly through the harness, each with concrete
  tick-exact completion assertions green.
- Every circuit's timing (absolute scheduled-event ticks), circuit state (block
  states, latches, extended pistons, container inventories, burnout), and
  pending scheduled work survive save→reload, single-chunk unload→reload, and
  unload-while-work-pending.
- Same-input rerun produces the same `stateHash()`.
- Every failure scenario aborts atomically and leaves state unchanged.
- The baseline gate passes: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `npm run test:e2e`.
- All spec requirements are reconciled with the actual implementation.

## Advancement gate

Target 100% task completion. The absolute floor is 90% with the documented
Advancement Exception path. No unresolved determinism, data-loss, or regression
blocker may remain; the baseline gate must pass.
