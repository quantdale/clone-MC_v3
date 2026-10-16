# Proposal: 173-redstone-regression-worlds

## Problem
154-172 built every redstone/automation system as pure, individually-tested modules, but nothing
asserts that they compose correctly *as circuits* — a repeater chain with exact 2-tick-per-stage
delays, a torch that burns out after exceeding its toggle limit, a piston chain that moves
farthest-first, a hopper→dropper item pipeline with tick-8 transfers, a TNT that detonates exactly
at fuse 0, a cart that follows rails and corners. 173 closes the section (154-173) with headless
canonical circuit fixtures and tick-exact timing assertions, so later changes (243's
redstone-automation-e2e, 248's parity matrix) have a stable cross-module baseline.

## Goals
A single regression suite, `tests/unit/RedstoneRegressionWorlds.test.ts`, with eight canonical
fixtures composing the section's pure modules against in-memory worlds and 047 queues:

1. **Repeater delay chain (159)** — a two-repeater chain fires at ticks 2 and 4 for a tick-0 input
   (`REPEATER_DELAY_TICKS[1] = 2`; nothing due at tick 1).
2. **Comparator modes + delay (160)** — compare/subtract are exact functions of the two clamped
   inputs; updates due exactly `COMPARATOR_UPDATE_DELAY_TICKS = 2` later.
3. **Torch inversion + burnout (158)** — `!attachmentPowered` inversion, full 15 signal when lit,
   and the burnout tracker: **exceeding** `BURNOUT_TOGGLE_LIMIT = 8` toggles within the window burns
   out; exactly 8 does not.
4. **Piston push chain (163/164)** — a three-block chain plans farthest-first and executes the move
   atomically (farthest block lands at the push target).
5. **Hopper→dropper item pipeline (166/167)** — a hopper transfer is due at tick 8 and moves exactly
   one item; a dropper drop is due at tick 16 and produces a `DroppedItem` descriptor.
6. **Dispenser plain-item parity (168)** — a plain item in a dispenser behaves exactly like a dropper
   container push.
7. **TNT detonation timeline (169/170)** — redstone-primed TNT is not due at fuse 1 and detonates
   exactly at fuse 0; `explodePrimedTnt` destroys the stone one block east and resolves its drop.
8. **Rail traversal + minecart timing (171/172)** — a straight rail constrains motion to its axis at
   `MINECART_MAX_SPEED`; a `corner_north_east` turns a north-bound cart onto the east axis.

## Non-goals
- **No production code changes at all** — 173 is a pure fixture/regression change (the section's
  closing gate, not a new system).
- **No full world simulator** — fixtures compose the pure modules directly (the 055
  `SimulationHarness` exists for wiring scenarios; the pure cores are the contract here).
- **No new registry entries, no characterization changes.**

## Preconditions
- Change 172 (`minecart-physics`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- The 158-172 module surfaces (repeater, comparator, torch, pistons, hopper, dropper, dispenser,
  explosion, TNT, rail, minecart) and 047's `ScheduledTickQueue`.

## Proposed change
1. `tests/unit/RedstoneRegressionWorlds.test.ts` (NEW) — the eight canonical fixtures above.

## Compatibility and migration
- Test-only change: no production files, no registry changes, no `Game.ts` edit, no schema/
  save-format change.

## Risks
- **Fixture drift from the modules' real semantics** (e.g. the burnout tracker's `>`-exceeds-limit
  rule). Mitigation: every fixture asserts against the documented module contracts and was verified
  against the actual implementations before being committed.
- **Timeline off-by-ones** in tick assertions. Mitigation: each timing fixture asserts both the
  not-due tick and the due tick.

## Rollback strategy
One test file; reverting removes the fixtures cleanly.

## Definition of Done
- All eight fixtures implemented and passing with tick-exact assertions.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. This change VERIFIES the section; advancing closes
the Redstone and automation section (154-173) in PROGRAM_STATE.md.
