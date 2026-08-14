# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **053-game-event-framework — VERIFIED 100%**
- Active implementation change: **053-game-event-framework — VERIFIED**
- Next change: **054-deterministic-rng-streams — NOT YET ACTIVE (artifacts pending)**
- 053 task ledger: **4 total tasks, 4 completed**
- 053 completion: **100%**
- 053 mandatory game-event-framework requirements: **PASS**
- 053 required-test gate: **PASS — unit 658/658, E2E 19/19**
- 053 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `61a44fd109249d6d26630ee8e3cc25a5ce99063a`
- Next exact action: **Advance to 054-deterministic-rng-streams. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (054 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement named seed-derived RNG streams for simulation subsystems, verify full gate, commit + push, advance program state.**

## What 053 implemented

Change 053 adds the generic, decoupled gameplay event bus.

- `src/simulation/GameEventBus.ts` (NEW) — `GameEvent` (`type`/`tick`/`position?`/`data?`),
  `GameEventListener`, and `GameEventBus`: synchronous `emit` delivering to typed listeners then the
  `'*'` wildcard, each in subscription order, with per-listener defensive isolation; nested emits are
  queued on a shared in-flight queue and delivered after the current batch (no recursion); `on`
  returns an unsubscribe; `once` self-unsubscribes before invocation; `clear` empties everything.
- `tests/unit/GameEventBus.test.ts` (NEW) — 7 tests: typed + wildcard delivery, subscription order,
  unsubscribe/once, throwing-listener isolation, nested emits, payload fidelity, and clear.

## Validation evidence (053)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 658/658 (prior 651 + 7 new GameEventBus tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 053 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 053 suite
(7/7), the full unit suite (658/658, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 054 (pending artifacts)

`054-deterministic-rng-streams` is named in `CHANGE_SEQUENCE.md` with scope "Named seed-derived RNG
streams for simulation subsystems." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before
any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 053 verification.
Change 054 is the next change; its artifacts must be authored and validated before implementation
begins.
