# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **032-render-vs-simulation-distance — VERIFIED 100%**
- Active implementation change: **032-render-vs-simulation-distance — VERIFIED (advanced)**
- Next change: **033-vertical-streaming — NOT YET ACTIVE (artifacts pending)**
- 032 task ledger: **5 total tasks, 5 completed**
- 032 completion: **100%**
- 032 mandatory render-vs-simulation-distance requirements: **PASS**
- 032 required-test gate: **PASS — unit 478/478, E2E 19/19**
- 032 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `c972cc9488a07960de89e6c4a5de800b56b8a6e6`
- Next exact action: **Advance to 033-vertical-streaming. Author proposal/design/tasks/specs/vertical-streaming/spec.md/verification via SPEC_AUTHORING_PROTOCOL.md, validate, implement streaming of required sections/columns around the player without single-layer assumptions, verify full gate, commit + push, advance program state.**

## What 032 implemented

Change 032 introduced two independent, non-negative spatial radii around the player and a deterministic classifier between them:

- `src/config/index.ts` — new `simulationDistance` (default `6`, equal to `renderDistance`) plus `headless.simulationDistance` (`2`), so behavior is unchanged by default.
- `src/world/RenderSimulationDistance.ts` (new) — pure model holding `renderDistance` + `simulationDistance`, with `chebyshevDistance`, `isWithinRenderDistance`, `isWithinSimulationDistance`, `fromConfig`, and a non-negative-radius guard.
- `src/world/World.ts` — stores `simulationDistance` separately; adds `getRenderDistance()`, `getSimulationDistance()`, and `isChunkSimulating(cx,cz)` (gated on the simulation radius and the streaming center). `ensureChunks`/`unloadChunks`/`getReadyProgress` remain on the render radius.
- `src/engine/Game.ts` — new `runtimeSimulationDistance()` passed into `World`; `Environment` keeps the render radius.
- `tests/unit/RenderSimulationDistance.test.ts` — 11 tests (Chebyshev, boundary inclusion/exclusion per radius, diagonal case, negative-radius rejection, `fromConfig` defaults, and `World` integration with distinct render/sim radii).

## Validation evidence (032)

- typecheck: PASS
- lint: PASS
- unit: PASS 478/478 (prior 467 + 11 new RenderSimulationDistance tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 032 is **VERIFIED** at 5/5 (100%). All gates are green: typecheck, lint, full unit suite (478/478), production build, and the required E2E suite (19/19). No advancement exception was needed. The change is additive infrastructure; the streaming hot paths are untouched.

## Next change: 033 (pending artifacts)

`033-vertical-streaming` is named in `CHANGE_SEQUENCE.md` with scope "Stream required sections/columns around the player without single-layer assumptions." Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 032 verification. Change 033 is the next change; its artifacts must be authored and validated before implementation begins.
