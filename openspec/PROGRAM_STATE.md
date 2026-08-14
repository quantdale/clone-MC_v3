# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **059-block-model-data — VERIFIED 100%**
- Active implementation change: **059-block-model-data — VERIFIED**
- Next change: **060-blockstate-model-resolution — NOT YET ACTIVE (artifacts pending)**
- 059 task ledger: **4 total tasks, 4 completed**
- 059 completion: **100%**
- 059 mandatory block-model-data requirements: **PASS**
- 059 required-test gate: **PASS — unit 700/700, E2E 19/19**
- 059 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `68a93dd80e9ad896f47af082d6c9d962813b2aae`
- Next exact action: **Advance to 060-blockstate-model-resolution. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (060 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement deterministic blockstate to model resolution, verify full gate, commit + push, advance program state.**

## What 059 implemented

Change 059 adds the validated block model data schema.

- `src/data/BlockModel.ts` (NEW) — `ModelFace` (`up`/`down`/`north`/`south`/`east`/`west`),
  `BlockModelFace` (`texture`, optional `uv`/`cullface`), `BlockModelElement` (`from`/`to` in model
  units `[0, 16]`, per-face data), `BlockModel` (`parent?`, `textures`, `elements`), strict
  `validateBlockModel` (finite/range/`from < to` coordinates, face keys, `uv` length, non-empty
  textures), and `BlockModelRegistry` (register/get/has/size/clear, duplicate rejection).
- `tests/unit/BlockModel.test.ts` (NEW) — 6 tests: minimal slab-like model acceptance, invalid
  element rejection, invalid face rejection, optional fields (`parent`/`cullface`/`uv`), and registry
  round-trip + duplicate rejection.

## Validation evidence (059)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 700/700 (prior 694 + 6 new BlockModel tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 059 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 059 suite
(6/6), the full unit suite (700/700, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 060 (pending artifacts)

`060-blockstate-model-resolution` is named in `CHANGE_SEQUENCE.md` with scope "Resolve block states to
render models deterministically." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before
any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 059 verification.
Change 060 is the next change; its artifacts must be authored and validated before implementation
begins.
