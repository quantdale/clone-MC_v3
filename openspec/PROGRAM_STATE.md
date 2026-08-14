# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **061-render-layer-model — VERIFIED 100%**
- Active implementation change: **061-render-layer-model — VERIFIED**
- Next change: **062-greedy-opaque-meshing — NOT YET ACTIVE (artifacts pending)**
- 061 task ledger: **4 total tasks, 4 completed**
- 061 completion: **100%**
- 061 mandatory render-layer-model requirements: **PASS**
- 061 required-test gate: **PASS — unit 711/711, E2E 19/19**
- 061 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `e8eb69ed93523ae2b32f88aea8e874476bba8947`
- Next exact action: **Advance to 062-greedy-opaque-meshing. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (062 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement greedy merge compatible opaque cube faces with regression equivalence tests, verify full gate, commit + push, advance program state.**

## What 061 implemented

Change 061 adds the canonical render layer classification.

- `src/rendering/RenderLayer.ts` (NEW) — `RenderLayer` (`opaque`/`cutout`/`translucent`/`emissive`),
  `RENDER_LAYERS` in pinned order, `isRenderLayer`/`parseRenderLayer` (validated, case-sensitive),
  `compareLayers` (pinned order), and `RenderLayerRegistry` (`setLayer`/`getLayer` with default
  `opaque`/`has`/`size`/`clear`; unknown layers rejected).
- `tests/unit/RenderLayer.test.ts` (NEW) — 6 tests: layer set + parse matrix, strict ordering across
  all pairs, and registry default/round-trip/validation/clear.

## Validation evidence (061)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 711/711 (prior 705 + 6 new RenderLayer tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 061 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 061 suite
(6/6), the full unit suite (711/711, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 062 (pending artifacts)

`062-greedy-opaque-meshing` is named in `CHANGE_SEQUENCE.md` with scope "Greedy merge compatible
opaque cube faces with regression equivalence tests." Per `AGENTS.md`, a change lacking full
artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 061 verification.
Change 062 is the next change; its artifacts must be authored and validated before implementation
begins.
