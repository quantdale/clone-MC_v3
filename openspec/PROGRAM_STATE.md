# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **049-neighbor-update-queue — VERIFIED 100%**
- Active implementation change: **049-neighbor-update-queue — VERIFIED**
- Next change: **050-block-behavior-dispatch — NOT YET ACTIVE (artifacts pending)**
- 049 task ledger: **4 total tasks, 4 completed**
- 049 completion: **100%**
- 049 mandatory neighbor-update-queue requirements: **PASS**
- 049 required-test gate: **PASS — unit 633/633, E2E 19/19**
- 049 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `86149ae286d06cd0f5d6d0db04bec037e8bb10af`
- Next exact action: **Advance to 050-block-behavior-dispatch. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (050 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement registry-selected block behavior modules instead of central block switches, verify full gate, commit + push, advance program state.**

## What 049 implemented

Change 049 adds the ordered, bounded neighbor-update queue for immediate block cascades.

- `src/simulation/NeighborUpdateQueue.ts` (NEW) — `NeighborUpdateHandler` and `NeighborUpdateQueue`:
  FIFO processing with position dedupe, `maxPerDrain` budget (default 64), `maxQueueSize` cap (default
  4096) with drop-newest `false` return, iterative handler-enqueue cascades (never re-entering
  `drain`, so no stack growth), and `size`/`has`/`clear`.
- `tests/unit/NeighborUpdateQueue.test.ts` (NEW) — 6 tests: FIFO order + budget split across drains,
  dedupe, A→B→C cascade in one drain, overflow drop, state queries, and throwing-handler abort
  semantics.

## Validation evidence (049)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 633/633 (prior 627 + 6 new NeighborUpdateQueue tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 049 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 049 suite
(6/6), the full unit suite (633/633, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 050 (pending artifacts)

`050-block-behavior-dispatch` is named in `CHANGE_SEQUENCE.md` with scope "Registry-selected block
behavior modules instead of central block switches." It builds on 047-049 by attaching behavior to
block types via a registry. Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before
any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 049 verification.
Change 050 is the next change; its artifacts must be authored and validated before implementation
begins.
