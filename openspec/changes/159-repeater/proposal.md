# Proposal: 159-repeater

## Problem
158's torch inverts instantly (after a fixed 2-tick delay); nothing in the codebase holds a signal
for a *configurable* duration or re-emits it unchanged. The repeater is vanilla's pure delay line —
1 to 4 redstone ticks, selectable by right-clicking — and it introduces the first component whose
output depends on more than its own front input: a **locked** repeater ignores its input entirely,
held at its last output, when a perpendicular repeater feeds power into its side.

## Goals
- A `redstone_repeater` block with `facing` (4-way), `delay` (1-4), `locked` (boolean), and
  `powered` (boolean) state — 4 × 4 × 2 × 2 = 64 states — and a placing item.
- `REPEATER_DELAY_TICKS`: the tick cost of each of the four delay settings (2/4/6/8, vanilla's
  redstone-tick-to-game-tick mapping, consistent with 158's `TORCH_UPDATE_DELAY_TICKS = 2` unit).
- `cycleRepeaterDelay(delay)`: 1→2→3→4→1, vanilla's right-click behaviour.
- `repeaterShouldLock(perpendicularPowered)`: locked iff a perpendicular neighbour is powered — pure
  predicate, mirroring 158's `torchShouldBeLit` shape.
- `scheduleRepeaterOutput`/`dueRepeaterOutputs`: the delay bridge onto 047's `ScheduledTickQueue`
  (this change's third consumer, after 157/158), using `REPEATER_DELAY_TICKS[delay]`.
- `resolveRepeaterOutput(currentInput, locked, currentPowered)`: the composed rule — a locked
  repeater holds its `currentPowered` value unchanged regardless of `currentInput`; an unlocked one
  follows `currentInput` (scheduled, not immediate — the caller applies this at the scheduled tick).
- `repeaterSignalStrength(powered)` and `repeaterStateProperties`.

## Non-goals
- **No `Game`/`World` wiring, no `BlockBehavior`, no interaction (right-click to cycle delay)** —
  the same integration surface 156-158 deferred.
- **No comparator/observer** — 160/161.
- **No diode-only-fires-on-rising-edge subtlety beyond what's modeled.** The repeater's "only
  re-triggers on an input change" behavior is expressed by the caller only calling
  `scheduleRepeaterOutput` when its sampled input changes — this module does not track "did the
  input change" itself, keeping it a pure function of whatever the caller decides to schedule.
- **No powered-vs-lit distinction for rendering** (a lit repeater's "arrow" visual) — models are
  059/060's scope, as with every prior redstone block.

## Preconditions
- Change 158 (`redstone-torch`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/RedstoneSignal.ts` (154, `MAX_SIGNAL_STRENGTH`/`MIN_SIGNAL_STRENGTH`/
  `Direction`/`OPPOSITE_DIRECTION`), `src/simulation/ScheduledTickQueue.ts` (047),
  `src/world/BlockRegistry.ts` + `src/inventory/ItemRegistry.ts`, `src/world/BlockPropertySchema.ts`.

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `REPEATER_SCHEMA` (`facing` named 4-way, `delay` integer
   1-4, `locked` boolean, `powered` boolean); `BlockId.RedstoneRepeater = 42`.
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.RedstoneRepeater = 42` placing it.
3. `src/simulation/RedstoneRepeater.ts` (NEW): delay constants/cycling, lock predicate, output
   resolution, the 047 scheduling bridge, and the state projection.

## Compatibility and migration
- One additive block id and one additive item id (none renumbered) plus one new simulation file.
  Requires the documented four block/item characterization-test updates (155/157/158's precedent).
  No `Game.ts` edit; no schema/save-format change.

## Risks
- **64 states is the largest single-block state count after redstone wire's 1296** — still trivial
  against 007's 65536-per-block cap; a test asserts the exact count.
- **Facing is modeled here** (unlike 157/158's omission) because a repeater's facing determines
  which side is "front" (input/output) versus "side" (lock input) — a *behavioral* distinction, not
  a purely visual one, so it cannot be deferred to a later model change the way plain
  attachment-facing was.

## Rollback strategy
One new file plus two additive registry entries and their test updates; reverting removes the
feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: registration + exact 64-state enumeration + item cross-reference; delay-tick
  mapping for all four settings; delay cycling including wraparound; the lock predicate; scheduling
  + due-ordering through 047 for all four delay settings; `resolveRepeaterOutput` locked-holds vs.
  unlocked-follows composition; signal strength; and state projection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
