# Proposal: 032-render-vs-simulation-distance

## Problem

The world collapses two distinct spatial concepts into a single `CONFIG.renderDistance`:

- **rendering radius** — how far chunk columns are loaded, generated, meshed, and
  drawn around the player;
- **simulation/ticking radius** — how far chunks are actively simulated (block
  ticks, entity/spatial ticks, spawn rules).

`World` uses `renderDistance` for streaming (`ensureChunks`), unloading
(`unloadChunks`), and readiness (`getReadyProgress`), and there is no first-class
notion of a simulation radius. Change 031 established ticket *levels* (with
`TICKING_LEVEL`) that answer *why* a chunk is held, but nothing maps those levels
to a *spatial radius*. Future parity changes (entity/block ticking, mob spawning)
therefore cannot gate on a distinct simulation radius without retrofitting it later.

## Goals

- Introduce an independent, configurable **simulation/ticking radius** alongside
  the existing rendering radius.
- Provide a deterministic classifier that, given a player chunk coordinate, decides
  whether an arbitrary chunk is within the rendering radius and/or the simulation
  radius.
- Integrate the two radii into `World` so that loading/unloading stays tied to the
  rendering radius while simulation gating is tied to the simulation radius.
- Wire the runtime so the desktop and headless sessions can distinguish the two.

## Non-goals

- Implementing the actual block/entity tick loop (a later change consumes the
  classifier added here via `World.isChunkSimulating`).
- Changing render-distance visuals, fog, or default magnitudes.
- Changing unload cadence or queue budgets.

## Preconditions

- Change 031 (`chunk-ticket-model`) is VERIFIED; `src/world/ChunkTicket.ts` exists
  with `TICKING_LEVEL`, `isTickingLevel`, and `ChunkTicketManager`.
- `npm test` and `npm run test:e2e` are green at the 031 baseline (467 unit / 19 e2e).

## Dependencies

- `src/world/ChunkTicket.ts` — ticket-level semantics that the simulation radius
  will eventually gate against.
- `src/config/index.ts` — central tunables.
- `src/world/World.ts` — streaming/unloading owner.
- `src/engine/Game.ts` — runtime wiring of `World` and `Environment`.

## Proposed change

Add `CONFIG.simulationDistance` (default equal to `renderDistance`; headless
override equal to `headless.renderDistance`). Add a new pure module
`src/world/RenderSimulationDistance.ts` holding both radii and exposing
`isWithinRenderDistance`/`isWithinSimulationDistance` (Chebyshev distance). `World`
stores the simulation distance independently of the render distance: streaming and
unloading continue to use the render distance, while a new `isChunkSimulating`
gate uses the simulation distance. `Game` passes the runtime simulation distance
into `World`; `Environment` continues to receive the render distance.

## Compatibility and migration

New config fields only. Defaults equal the existing render distance, so behavior is
unchanged unless a downstream change sets them apart. No persisted or public data
formats change.

## Risks

- A `World` constructed without `simulationDistance` now falls back to
  `CONFIG.simulationDistance`. Because the default equals `renderDistance`, the
  simulation scope is unchanged versus the prior single-radius model.

## Rollback strategy

Revert the change commit. No persisted state, migrations, or public API removals
are involved.

## Definition of Done

- `CONFIG.simulationDistance` (+ headless) present.
- `src/world/RenderSimulationDistance.ts` implemented and unit-tested.
- `World` exposes `getRenderDistance`, `getSimulationDistance`, and
  `isChunkSimulating`; streaming/unloading unchanged (render radius).
- `Game` distinguishes the two radii at runtime.
- Full gate green (typecheck/lint/unit/e2e); 032 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
`npm run test:e2e` must all pass. Unit count grows by the 032 suite; E2E stays
19/19.
