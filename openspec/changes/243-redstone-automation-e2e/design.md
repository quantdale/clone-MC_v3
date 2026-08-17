# Design: 243-redstone-automation-e2e

## Context/current state

Authoring-time facts verified against the repository:

- The rendered game is composed in `src/engine/Game.ts`. It wires `SurvivalSystem`,
  `Inventory`, `Hotbar`, `ItemEntityManager`, mobs, and a single overworld
  `World`. **No redstone module is imported or wired by `Game.ts` or `World`.** The
  entire 154-172 redstone/automation arc is pure, headless, individually
  unit-tested code that communicates with the world only through injected
  surfaces (`RedstonePowerSource`, `WireWorld`, `PistonWorld`,
  `PistonExecutionWorld<TState>`, `StickyWorld`, `ExplosionWorld<S>`,
  `MinecartWorld`) and the 047 `ScheduledTickQueue`.
- `src/simulation/SimulationHarness.ts` (055) provides `step(times)`,
  `stepUntil(predicate, maxSteps)`, `snapshot()`, `restore(snapshot)`, `reset()`,
  and scoped `run(fn)`. `src/simulation/WorldTickProcess.ts` (224) is the
  production counterpart (`step`/`update`, `isStopped`/`lastError`/`reset`).
- `src/simulation/ScheduledTickQueue.ts` (047) is the timing spine for every
  redstone component. It de-duplicates by position, pops due entries in
  deterministic `(tickTime, seq)` order, and — the key survival seam — offers
  `serialize(): SerializedScheduledTickQueue` and
  `deserialize(data)` (version 1), both whole-payload validated.
- Timing constants (used by 173's F1-F8 and reused here):
  `REPEATER_DELAY_TICKS = {1:2, 2:4, 3:6, 4:8}`, `COMPARATOR_UPDATE_DELAY_TICKS = 2`,
  `TORCH_UPDATE_DELAY_TICKS = 2`, `BURNOUT_TOGGLE_LIMIT = 8`,
  `BURNOUT_WINDOW_TICKS = 60`, `BURNOUT_RECOVERY_TICKS = 60`,
  `OBSERVER_PULSE_START_DELAY_TICKS = 2`, `OBSERVER_PULSE_DURATION_TICKS = 2`,
  `LAMP_OFF_DELAY_TICKS = 4`, `BUTTON_ACTIVE_TICKS = 20`,
  `PLATE_RELEASE_DELAY_TICKS = 10`, `HOPPER_TRANSFER_COOLDOWN_TICKS = 8`,
  `DROPPER_EJECT_COOLDOWN_TICKS = 8`, `DISPENSER_EJECT_COOLDOWN_TICKS = 8`,
  `TNT_FUSE_TICKS_REDSTONE = 80`, `PISTON_PUSH_LIMIT = 12`. Wire propagation is
  immediate via `RedstonePropagator` (156) `markDirty`/`settle`; it is NOT a
  scheduled queue.
- `src/simulation/PersistentWorldCodecs.ts` (234) exposes `createWorldSaveCodec`
  (`WorldSaveCodec` with `encode`/`decode`) over five `PersistentUnitKind`s:
  world-metadata, chunk-sections, block-entities, entities, player-state.
  `src/simulation/ServerSaveLifecycle.ts` (234) is a `TickSystem` state machine
  (`unloaded → loading → running → flushing → closed`) with all-or-nothing `load`
  through an injected `SaveLoadBoundary`. **Neither persists the 047 queue** — a
  documented gap this change works around, not fixes.
- `src/storage/BlockEntityRecord.ts` (036) defines `SerializedBlockEntity`
  (`schemaVersion`/`typeKey`/`x`/`y`/`z`/`data`) and `BlockEntityChunkRecord`
  (`worldId|chunkX|chunkZ`). `src/world/ChestBlockEntity.ts` (107) serializes a
  27-slot inventory into the opaque `data` payload via
  `serializeChestInventory`/`deserializeChestInventory`. Hopper/dropper/dispenser
  inventories reuse the same `MenuSlot[]`/`BlockEntityInstance` shapes.
- `src/world/World.ts` performs chunk unload by removing a chunk from the
  `ChunkManager` while retaining its edit overlay; persisted reload is owned by
  the 035/036/037 stores. The harness models chunk cycling with the same
  semantic: unload drops the chunk's block states and block entities, reload
  restores them, and the 047 queue (and its pending entries) is preserved
  across the cycle.

### Current-state conclusion

Because no redstone circuit is wired into the rendered `Game`, the browser cannot
reach a clock or hopper chain today. The only faithful way to verify the narrow
outcome "representative automation circuits and timing survive save/reload and
chunk cycling" headlessly is a harness that composes the real production modules
directly — exactly the 242 progression-harness pattern. The harness is
test-support infrastructure under `tests/`; no shipped game code changes.

## Target state

After 243:

- A headless Vitest `RedstoneAutomationHarness` (under `tests/`) composes the real
  154-172 modules over an in-memory world fixture and a 047 `ScheduledTickQueue`,
  and provides `SimulationHarness`-style deterministic stepping plus the survival
  operations `saveReload()` and `cycleChunk(cx, cz)`.
- Six canonical circuits with concrete tick-exact completion assertions (see the
  capability specs).
- A save/reload/chunk-cycle survival matrix proving timing (absolute scheduled
  ticks), circuit state, and pending scheduled work survive full save→reload,
  single-chunk unload→reload, and unload-while-work-pending.
- Deterministic `stateHash()` and atomic rejection of malformed round-trip
  payloads.
- All spec requirements reconciled with the implementation and the baseline gate
  green.

## Invariants

- The harness MUST compose the real production modules; it MUST NOT re-implement
  propagation, timing, piston movement, item transfer, or explosion logic.
- All redstone timing MUST ride a single harness-owned 047 `ScheduledTickQueue`;
  wire propagation MUST ride 156's `RedstonePropagator`. No ad-hoc tick fields.
- A scheduled event MUST be preserved at its **absolute** due tick across
  save/reload and chunk cycling; it MUST NOT be re-anchored relative to the
  current tick, dropped, or duplicated.
- A failed action or malformed round-trip payload MUST leave harness state
  unchanged (atomic).
- Snapshot/restore is a pure state round-trip: stepping forward after restore
  yields results identical to a fresh run from that point.
- Scenarios MUST run under a bounded step budget; exceeding it is a
  budget-exceeded result, never success.
- All round-trips MUST go through existing versioned contracts
  (`SerializedScheduledTickQueue` v1, 036/035 envelopes, 234 `WorldSaveCodec`);
  no new wire or save format is introduced.
- Redstone is deterministic (no random draws in 154-172), so the harness needs no
  RNG; `stateHash()` provides a reproducible fingerprint over serialized state.

## API and data model

The harness is test-support code; its shape is intent (sketches describe the
seam, not shipped runtime behavior). All identifiers reference existing
production symbols.

```ts
// tests/support/RedstoneAutomationHarness.ts (intent)
import type { ScheduledTickQueue } from '../../src/simulation/ScheduledTickQueue';
import { RedstonePropagator, type WirePowerStore } from '../../src/simulation/RedstonePropagation';
import { TorchBurnoutTracker } from '../../src/simulation/RedstoneTorch';
import type { RedstonePowerSource } from '../../src/simulation/RedstoneSignal';
import type { WorldSaveCodec } from '../../src/simulation/PersistentWorldCodecs';
import type { MenuSlot } from '../../src/inventory/MenuTransaction';

export type CircuitKind =
  | 'clock' | 'pulse-divider' | 't-flip-flop'
  | 'piston-door' | 'item-sorter-chain' | 'torch-burnout';

export interface RedstoneAutomationHarnessOptions {
  readonly worldId: string;
  /** The real 234 codec; the harness supplies only the fixture/boundary. */
  readonly codec: WorldSaveCodec;
  /** In-memory SaveLoadBoundary fixture (034-040 repository stand-in). */
  readonly boundary: SaveLoadBoundary;
}

export interface AutomationStateSnapshot {
  tick: number;
  /** 047 queue serialize() output (the timing survival contract). */
  scheduledTicks: SerializedScheduledTickQueue;
  /** Chunk block-state records (035-shape) keyed by worldId|chunkX|chunkZ. */
  chunkSections: readonly SerializedChunkColumn[];
  /** Block-entity records (036-shape) for containers (hopper/dropper/dispenser/chest). */
  blockEntities: readonly BlockEntityChunkRecord[];
  /** 158 burnout tracker serialized toggle history per torch id. */
  burnoutToggles: Record<string, readonly number[]>;
}

export class RedstoneAutomationHarness {
  constructor(opts: RedstoneAutomationHarnessOptions);
  /** Build and place one canonical circuit; returns its probe position(s). */
  buildCircuit(kind: CircuitKind): CircuitProbe;
  step(times?: number): number;                    // SimulationHarness-style
  stepUntil(predicate: () => boolean, maxSteps: number): number;
  snapshot(): AutomationStateSnapshot;             // validates-first
  restore(s: AutomationStateSnapshot): void;       // atomic rejection
  reset(): void;
  /** Full-world save→reload: encode→write→read→decode→restore through the 234 seams
   *  (chunk-sections, block-entities) + 047 queue serialize/deserialize. */
  async saveReload(): Promise<void>;
  /** Unload then reload one chunk, preserving block states, block entities, and
   *  the scheduled ticks whose positions live in that chunk. */
  cycleChunk(chunkX: number, chunkZ: number): void;
  stateHash(): string;                             // deterministic fingerprint
  /** Read the current stored value at a probe (power, lit, extended, slot, ...). */
  probe(circuit: CircuitProbe): unknown;
}
```

The harness drives the modules through their real entry points
(`RedstonePropagator.markDirty`/`settle`, `scheduleRepeaterOutput`/
`dueRepeaterOutputs`, `scheduleTorchUpdate`/`dueTorchUpdates`,
`TorchBurnoutTracker.recordToggle`/`isBurnedOut`,
`scheduleComparatorUpdate`/`dueComparatorUpdates`,
`scheduleObserverPulseStart/End`/`dueObserverPulseStarts/Ends`,
`scheduleLampOff`/`dueLampOffs`, `scheduleHopperTransfer`/`dueHopperTransfers`,
`transferOneItem`, `scheduleDropperEject`/`dueDropperEjects`,
`ejectFromDropper`, `scheduleDispenserEject`/`dueDispenserEjects`,
`dispenseFromDispenser`, `planPistonPush`/`executePistonPush`/
`pistonShouldBeExtended`, `extendPushPlanWithStickyGroup`, `primeTnt`/
`tickPrimedTnt`/`primedTntIsDue`). The world fixture implements the injected
module surfaces with block states stored per chunk and container inventories as
`MenuSlot[]` per position (the 036 block-entity payload).

### The clock's canonical timing

All redstone timing is a function of the module constants, so the canonical
circuits have exactly derivable periods. The harness's canonical **clock** is a
torch-and-repeater loop whose output produces a rising edge exactly every
`CLOCK_PERIOD_TICKS` ticks. For the canonical topology (two inverting torches and
a repeater loop whose round-trip delay is `2 × REPEATER_DELAY_TICKS[d]` per
stage, chosen so the torch never exceeds `BURNOUT_TOGGLE_LIMIT` toggles within
`BURNOUT_WINDOW_TICKS`), the documented constant is **`CLOCK_PERIOD_TICKS = 16`**
(loop delay 8 ticks × two inversions). The spec pins this constant and the
absolute-edge preservation contract; the implementing agent confirms the exact
topology against the modules and the constant in the final reconciliation.

The canonical **pulse divider** divides the clock edge stream: a divide-by-`N`
divider emits an output rising edge every `N × CLOCK_PERIOD_TICKS`, with the
first output edge exactly `N × CLOCK_PERIOD_TICKS` after the first input edge.
The specs pin `N = 2` and `N = 4`.

## Control/data flow

1. Construct the harness with a `worldId`, the real 234 `WorldSaveCodec`, and an
   in-memory `SaveLoadBoundary`. Register a 047 queue, a 156 `RedstonePropagator`
   over a `WireWorld`/`RedstonePowerSource` fixture, a 158 `TorchBurnoutTracker`,
   a per-chunk block-state container, and a per-position `MenuSlot[]` block-entity
   container.
2. `buildCircuit(kind)` places the canonical circuit by writing block states and
   container inventories into the fixture and returning a `CircuitProbe` (a
   position + an accessor the harness's `probe` uses to read power/lit/extended/
   slot state at an assertion point).
3. `step(times)` advances the fixed tick counter and, per tick, pops the 047 queue
   (`due*`) and dispatches each due event into the real module (scheduling
   downstream events), then settles wire propagation via `RedstonePropagator.settle`
   and advances the burnout tracker. Step order is deterministic.
4. `stepUntil(predicate, maxSteps)` steps until the predicate holds or the budget
   is exhausted, returning the number of steps taken (budget-exceeded is not
   success).
5. **Save/reload** (`saveReload()`): (a) capture `scheduledTicks =
   queue.serialize()`; (b) encode chunk-sections and block-entities through the
   234 `WorldSaveCodec.encode` and write via the boundary; (c) reset the harness;
   (d) `ServerSaveLifecycle.load`-style all-or-nothing read → `codec.decode` →
   restore chunk-sections/block-entities; (e) `queue.deserialize(scheduledTicks)`
   and restore the burnout tracker. After this the world and its pending timing
   are exactly as before the round-trip.
6. **Chunk cycling** (`cycleChunk(cx, cz)`): capture the chunk's block states and
   block entities, drop them, then restore them, and preserve (not drop) every 047
   entry whose position lies in that chunk — the pending ticks survive the chunk
   drop exactly as the edit overlay survives `World` unload.
7. After the final action, `stateHash()` is taken over `AutomationStateSnapshot`;
   the circuit test asserts each completion condition.
8. Survival scenarios call `snapshot()`/`saveReload()`/`cycleChunk()` at a chosen
   point, then continue; the continued event sequence and absolute ticks must
   equal a run without the interruption.
9. Failure scenarios inject a malformed payload (wrong 047 version, foreign
   worldId, duplicate block-entity key, missing scheduled entry) and assert the
   harness rejects it atomically.

## Detailed behavior

### The save/reload/chunk-cycle survival matrix (normative)

For each of the six circuits, the matrix asserts three dimensions across three
operations, plus a failure dimension:

| Dimension | Assertion |
|---|---|
| **Timing** | Every scheduled event's absolute due tick is preserved: an event due at tick `T` before the operation fires at tick `T` after it, never at `T ± k`. Each timing assertion checks both the not-due tick and the due tick. |
| **Circuit state** | Block states (lit torches, powered wires, repeater `powered`/`locked`/`delay`, comparator `powered`/`mode`, observer `powered`/`facing`, piston `extended`/`facing`, lamp `lit`, hopper/dropper/dispenser `enabled`) and container inventories (`MenuSlot[]` counts) are losslessly round-tripped. |
| **Pending scheduled work** | The 047 queue's per-position pending entries (and their due ticks) are preserved exactly; no entry is dropped or duplicated. |

| Operation | Scope |
|---|---|
| **Full save→reload** | `saveReload()` through the 234 codec/lifecycle for chunk-sections/block-entities + 047 queue serialize/deserialize. |
| **Single-chunk unload→reload** | `cycleChunk(cx, cz)` for a chunk the circuit spans; the other chunks are untouched. |
| **Unload-while-work-pending** | A circuit operation performed with a scheduled event still queued and due in the future; the event survives and fires at its original absolute tick. |

Failure scenarios: a malformed save payload (047 `version !== 1`, foreign
`worldId`, duplicate `BlockEntityChunkRecord` key, out-of-range chunk coords) and
a malformed `restore` snapshot are rejected atomically (harness unchanged); a
pending scheduled event for a position is never silently cancelled by a
`cycleChunk` that does not own it.

### Circuit timing summaries

- **Clock**: a rising edge at ticks `0, 16, 32, ...` (`CLOCK_PERIOD_TICKS = 16`),
  with no edge between consecutive multiples. After a cycle, the next edge still
  fires at the original absolute multiple.
- **Pulse divider (÷2, ÷4)**: output edges at ticks `2N×16` and `4N×16`
  respectively relative to the first input edge; phase (which half/quarter the
  output is in) is preserved across a cycle.
- **T-flip-flop**: each input edge toggles the output; after an even number of
  edges the output is off, after an odd number on; the latched output is stable
  with no input; a cycle preserves the latched state and the next edge toggles it
  correctly.
- **Piston door**: a piston extends on power (farthest-first push of the door
  block via 163/164/165) and the moved block lands at its destination with the
  source cleared; a cycle preserves `extended`, the pushed block's position, and
  the cleared source.
- **Item-sorter-like hopper chain**: a hopper transfer due at tick 8 moves exactly
  one item; a dropper ejection due at tick 16 ejects one; a cycle at a point with
  a pending transfer preserves the pending due tick and the item moves exactly
  once (no loss, no duplication). Exact `MenuSlot[]` counts are asserted before
  and after.
- **Torch burnout**: a torch exceeding `BURNOUT_TOGGLE_LIMIT` (8) toggles within
  `BURNOUT_WINDOW_TICKS` (60) is burnt out (unlit); the burnout state and toggle
  history survive a cycle; the torch stays unlit until `BURNOUT_RECOVERY_TICKS`
  (60) of quiet since its last toggle, then recovers.

## Failure modes

- Malformed round-trip payload (047 `version !== 1`; foreign `worldId`; duplicate
  `BlockEntityChunkRecord` key; out-of-range chunk coords; malformed
  `AutomationStateSnapshot`) → atomic rejection, harness unchanged, descriptive
  error.
- Step budget exhausted → budget-exceeded result, never success.
- A `cycleChunk` that does not own a pending scheduled position MUST NOT cancel
  that entry.
- A duplicate scheduled event (re-scheduling a position already pending) MUST
  update the due tick in place (047 dedup), not duplicate the entry.
- A full save→reload that fails partway MUST NOT leave a half-restored world
  (234 all-or-nothing semantics honored by the harness).

## Compatibility/migration

No stored/public data format changes. Round-trips use `SerializedScheduledTickQueue`
v1, `SerializedChunkColumn` (035), `BlockEntityChunkRecord`/`SerializedBlockEntity`
(036 v1) with the chest payload via `ChestBlockEntity`, and the 234 `WorldSaveCodec`
kinds. The 234 `PersistentUnitKind` union is NOT extended (a documented non-goal).
No migration.

## Performance/resource constraints

- Each scenario MUST run under a bounded `maxSteps` budget. The clock/divider
  circuits run a small number of periods (a few hundred ticks at most).
- `stateHash()` is computed once per completed run (O(state) serialization), not
  per tick.
- The fixture is small: only the circuit's chunks and container inventories. No
  hot path in the shipped game is touched.

## Testing seams

- **Headless harness (authoritative)**: Vitest, `SimulationHarness` semantics +
  in-memory fixture + real 047/156/158 modules + the real 234 `WorldSaveCodec`
  over an in-memory `SaveLoadBoundary`. This is where circuits, determinism,
  save/reload, chunk cycling, and failure/abort are asserted.
- **Survival matrix seam**: `saveReload()`, `cycleChunk(cx, cz)`, and
  `snapshot()`/`restore()` are the operations every circuit test routes through.
- **Determinism seam**: `stateHash()` over `AutomationStateSnapshot`; two runs
  with the same input must match.

## Observability/debugging

- `stateHash()` gives a single reproducible fingerprint; mismatch pinpoints a
  nondeterminism source.
- Per-circuit probes (`probe`) and the not-due/due tick assertions localize
  whether the break was timing, circuit state, or a dropped/duplicated scheduled
  entry.
- The survival matrix table (circuit × dimension × operation) is the canonical
  scenario index, matching the capability specs.

## Affected files/symbols

- New (test-support): `tests/support/RedstoneAutomationHarness.ts` (and small
  fixture helpers), plus new spec test files under `tests/unit/`.
- Read-only consumers (referenced, not modified): `ScheduledTickQueue`,
  `RedstonePropagation`/`RedstonePropagator`, `RedstoneWire`, `RedstoneSignal`,
  `RedstoneTorch`/`TorchBurnoutTracker`, `RedstoneRepeater`, `RedstoneComparator`,
  `RedstoneObserver`, `RedstoneConsumers`, `RedstoneInputComponents`,
  `PistonMovePlanner`, `PistonExecution`, `PistonStickyGroups`, `HopperTransfer`,
  `DropperEject`, `DispenserBehavior`, `TntPriming`, `ExplosionCore`,
  `RailBlockStates`, `MinecartPhysics`, `PersistentWorldCodecs`
  (`createWorldSaveCodec`), `ServerSaveLifecycle` (`SaveLoadBoundary`),
  `BlockEntityRecord`, `ChestBlockEntity`, `SimulationHarness`,
  `WorldTickProcess`, `MenuTransaction` (`MenuSlot`).
- No change to `src/engine/Game.ts`, `src/world/World.ts`, or any module in
  154-172. The shipped runtime is untouched.

## Rejected alternatives

- **Wiring redstone into the rendered `Game`/`World`** so the browser E2E drives
  circuits: rejected — large adjacent scope, requires block-registry wiring and a
  feature change, not an E2E change. The headless harness is the authoritative
  driver.
- **Extending the 234 codec to persist scheduled ticks**: rejected — adjacent
  scope that changes a production persistence contract; 243 only round-trips the
  047 queue through its existing v1 contract. The gap is recorded as a non-goal.
- **Faking the redstone modules in the harness**: rejected — the point is
  end-to-end verification of the real modules.
- **Reusing 173's F1-F8 as the only fixture set**: rejected — F1-F8 are single
  module-pair baselines; 243 composes them into circuits and adds the
  survival-over-round-trip dimension F1-F8 do not exercise.
- **Driving through `WorldTickProcess` only**: allowed but not required; the spec
  mandates `SimulationHarness`-style snapshot/restore semantics, and either
  stepper may back the harness.

## Downstream dependencies

- The implementing agent must reconcile these artifacts with the actual
  implementation before marking 243 VERIFIED (`SPEC_AUTHORING_PROTOCOL.md` final
  reconciliation).
- 244/245 (worldgen/visual regression matrices) are out of scope; no redstone
  behavior is asserted there, and no work here silently belongs to them.
- Program-state files (`PROGRAM_STATE.json`, `PROGRAM_STATE.md`) are updated by
  the implementing agent only after verification evidence is gathered.
