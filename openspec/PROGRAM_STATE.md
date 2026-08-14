# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **047-scheduled-tick-queue — VERIFIED 100%**
- Active implementation change: **047-scheduled-tick-queue — VERIFIED**
- Next change: **048-random-tick-system — NOT YET ACTIVE (artifacts pending)**
- 047 task ledger: **4 total tasks, 4 completed**
- 047 completion: **100%**
- 047 mandatory scheduled-tick-queue requirements: **PASS**
- 047 required-test gate: **PASS — unit 619/619, E2E 19/19**
- 047 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `25b20999721cf347ea4d9833289b352f78115377`
- Next exact action: **Advance to 048-random-tick-system. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (048 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement seeded random-tick selection for eligible blocks in ticking chunks, verify full gate, commit + push, advance program state.**

## What 047 implemented

Change 047 adds the deterministic scheduled tick queue for per-position block/fluid work.

- `src/simulation/ScheduledTickQueue.ts` (NEW) — `ScheduledTick` (`x`, `y`, `z`, `tickTime`),
  `SCHEDULED_TICK_QUEUE_VERSION = 1`, `validateSerializedScheduledTickQueue`, and `ScheduledTickQueue`:
  `schedule`/`scheduleIn` (position dedupe updates the due tick in place), `tick(nowTick)` pops due
  entries in deterministic `(tickTime, seq)` order, `has`/`cancel`/`clear`/`size`, and versioned
  `serialize`/`deserialize` with validate-before-mutate.
- `tests/unit/ScheduledTickQueue.test.ts` (NEW) — 8 tests: threshold pop, tie-break ordering, dedupe,
  `scheduleIn`, cancel/clear, round-trip equality, rejection leaving the queue unchanged, and invalid
  input rejection.

## Validation evidence (047)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 619/619 (prior 611 + 8 new ScheduledTickQueue tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 047 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 047 suite
(8/8), the full unit suite (619/619, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 048 (pending artifacts)

`048-random-tick-system` is named in `CHANGE_SEQUENCE.md` with scope "Seeded random-tick selection for
eligible blocks in ticking chunks." It builds on 044/047 by selecting which blocks receive a random
tick each game tick, deterministically. Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before
any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 047 verification.
Change 048 is the next change; its artifacts must be authored and validated before implementation
begins.
