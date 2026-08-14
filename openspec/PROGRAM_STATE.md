# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **068-blocklight-propagation — VERIFIED 100%**
- Active implementation change: **068-blocklight-propagation — VERIFIED**
- Next change: **069-incremental-light-updates — NOT YET ACTIVE (artifacts pending)**
- 068 task ledger: **4 total tasks, 4 completed**
- 068 completion: **100%**
- 068 mandatory blocklight-propagation requirements: **PASS**
- 068 required-test gate: **PASS — unit 754/754, E2E 19/19**
- 068 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `2749b103e55ec81c80fec79445499a0ecc03e03a`
- Next exact action: **Advance to 069-incremental-light-updates. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (069 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement correct light removal/repropagation after block edits, verify full gate, commit + push, advance program state.**

## What 068 implemented

Change 068 adds luminance-source block-light propagation.

- `src/rendering/BlockLightEngine.ts` (NEW) — `BlockLightWorld` and `computeBlockLight`: seeds every
  luminance source (clamped to 15, including opaque sources like glowstone) in deterministic
  `(x, z, y)` order, then propagates with the 067-style FIFO BFS (value `v` raises non-opaque
  neighbors to `v - 1`; fixed neighbor order); sources are never dimmed; deterministic.
- `tests/unit/BlockLightEngine.test.ts` (NEW) — 5 tests: torch falloff, opaque glowstone emission,
  around-corner propagation, full-wall blocking, and determinism.

## Validation evidence (068)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 754/754 (prior 749 + 5 new BlockLightEngine tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 068 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 068 suite
(5/5), the full unit suite (754/754, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 069 (pending artifacts)

`069-incremental-light-updates` is named in `CHANGE_SEQUENCE.md` with scope "Correct light
removal/repropagation after block edits." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before
any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 068 verification.
Change 069 is the next change; its artifacts must be authored and validated before implementation
begins.
