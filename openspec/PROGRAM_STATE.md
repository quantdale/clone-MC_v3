# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **046-singleplayer-pause-semantics — VERIFIED 100%**
- Active implementation change: **046-singleplayer-pause-semantics — VERIFIED**
- Next change: **047-scheduled-tick-queue — NOT YET ACTIVE (artifacts pending)**
- 046 task ledger: **4 total tasks, 4 completed**
- 046 completion: **100%**
- 046 mandatory singleplayer-pause-semantics requirements: **PASS**
- 046 required-test gate: **PASS — unit 611/611, E2E 19/19**
- 046 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `ff6aafd4849a91832e71bf8ec932e8b20765cefa`
- Next exact action: **Advance to 047-scheduled-tick-queue. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (047 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement a deterministic scheduled block/fluid tick queue with dedupe and persistence hooks, verify full gate, commit + push, advance program state.**

## What 046 implemented

Change 046 adds explicit, reason-based singleplayer pause semantics.

- `src/engine/PauseManager.ts` (NEW) — `PAUSE_REASONS` vocabulary (`menu-open`, `pointer-lock-lost`,
  `window-blur`, `auto-pause`) and `PauseManager`: idempotent `pause`/`resume` over a reason Set;
  `isPaused` true while any reason is active (the game loop gates the 044 clock on it); `reasons`;
  `onChange` transition-only listeners with unsubscribe; `resumeAll`; defensive listener invocation.
- `tests/unit/PauseManager.test.ts` (NEW) — 6 tests: single/multi-reason transitions, idempotency +
  unknown-resume no-op, listener firing on transitions only + unsubscribe, `resumeAll`, and a throwing
  listener not breaking others.

## Validation evidence (046)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 611/611 (prior 605 + 6 new PauseManager tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 046 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 046 suite
(6/6), the full unit suite (611/611, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed. Fixed-tick primitives 044-046 (clock, interpolation, pause) are
complete.

## Next change: 047 (pending artifacts)

`047-scheduled-tick-queue` is named in `CHANGE_SEQUENCE.md` with scope "Deterministic scheduled
block/fluid tick queue with dedupe and persistence hooks." It builds on 044 by scheduling per-position
ticks at fixed game times. Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before
any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 046 verification.
Change 047 is the next change; its artifacts must be authored and validated before implementation
begins.
