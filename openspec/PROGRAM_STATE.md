# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **050-block-behavior-dispatch — VERIFIED 100%**
- Active implementation change: **050-block-behavior-dispatch — VERIFIED**
- Next change: **051-block-event-queue — NOT YET ACTIVE (artifacts pending)**
- 050 task ledger: **4 total tasks, 4 completed**
- 050 completion: **100%**
- 050 mandatory block-behavior-dispatch requirements: **PASS**
- 050 required-test gate: **PASS — unit 638/638, E2E 19/19**
- 050 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `5a0a6ca31aa5d6678e3b735e77b2becb508908d4`
- Next exact action: **Advance to 051-block-event-queue. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (051 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement local block events with deterministic ordering and bounded propagation, verify full gate, commit + push, advance program state.**

## What 050 implemented

Change 050 adds registry-selected block behavior dispatch, replacing the future central-switch pattern.

- `src/simulation/BlockBehavior.ts` (NEW) — `BlockWorldAccess` (minimal `getBlockId`/`setBlockId`),
  `BlockBehaviorContext` (`x`/`y`/`z`/`tick`/`world`), `BlockBehavior` with optional hooks
  (`onScheduledTick`/`onRandomTick`/`onNeighborChanged`/`onPlaced`/`onBroken`), the frozen shared
  `DEFAULT_BLOCK_BEHAVIOR`, and `BlockBehaviorRegistry` (`register` with validation + duplicate
  rejection, `getBehavior` with default fallback, `hasBehavior`, `size`, `clear`).
- `tests/unit/BlockBehavior.test.ts` (NEW) — 5 tests: default dispatch (shared object), per-key
  isolation, registration validation, hook invocation with a mock world (position/tick recorded), and
  clear.

## Validation evidence (050)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 638/638 (prior 633 + 5 new BlockBehavior tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 050 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 050 suite
(5/5), the full unit suite (638/638, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed. Fixed-tick simulation primitives 044-050 (clock, interpolation,
pause, scheduled/random/neighbor queues, behavior dispatch) are complete.

## Next change: 051 (pending artifacts)

`051-block-event-queue` is named in `CHANGE_SEQUENCE.md` with scope "Local block events with
deterministic ordering and bounded propagation." Per `AGENTS.md`, a change lacking full artifacts is a
hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 050 verification.
Change 051 is the next change; its artifacts must be authored and validated before implementation
begins.
