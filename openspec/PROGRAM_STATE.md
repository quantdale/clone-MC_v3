# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **051-block-event-queue — VERIFIED 100%**
- Active implementation change: **051-block-event-queue — VERIFIED**
- Next change: **052-block-entity-framework — NOT YET ACTIVE (artifacts pending)**
- 051 task ledger: **4 total tasks, 4 completed**
- 051 completion: **100%**
- 051 mandatory block-event-queue requirements: **PASS**
- 051 required-test gate: **PASS — unit 644/644, E2E 19/19**
- 051 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `982a0547ad0e6b89040b6cf1e84fe7f32421c688`
- Next exact action: **Advance to 052-block-entity-framework. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (052 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement tickable/non-tickable block-entity lifecycle wired to chunks, verify full gate, commit + push, advance program state.**

## What 051 implemented

Change 051 adds the local block event queue (Minecraft's `addBlockEvent` mechanism).

- `src/simulation/BlockEventQueue.ts` (NEW) — `BlockEvent` (`x`/`y`/`z`/`blockId`/`eventId`/`param`)
  and `BlockEventQueue`: `add` with per-`(position, eventId)` dedupe and newest-param-wins (Java
  parity), `maxQueueSize` cap with drop-newest `false` return; `drain(handler)` delivers FIFO bounded
  by `maxPerDrain`; `size`/`clear`.
- `tests/unit/BlockEventQueue.test.ts` (NEW) — 6 tests: FIFO + budget split, dedupe/param update,
  eventId coexistence at one position, overflow drop, size/clear, and throwing-handler abort.

## Validation evidence (051)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 644/644 (prior 638 + 6 new BlockEventQueue tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 051 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 051 suite
(6/6), the full unit suite (644/644, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 052 (pending artifacts)

`052-block-entity-framework` is named in `CHANGE_SEQUENCE.md` with scope "Tickable/non-tickable
block-entity lifecycle wired to chunks." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before
any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 051 verification.
Change 052 is the next change; its artifacts must be authored and validated before implementation
begins.
