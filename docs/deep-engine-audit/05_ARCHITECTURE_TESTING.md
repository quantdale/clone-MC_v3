# 05 — Architecture, Testing, Persistence, CI and Observability

## Architecture objective

Keep the existing module decomposition, but make system contracts explicit enough that performance work can occur without semantic drift.

## System boundaries

Recommended ownership:

- **Engine:** clocks, lifecycle, input snapshot, orchestration, renderer facade.
- **World:** authoritative block/block-state, chunk/section lifecycle, block entities, queries.
- **Worldgen:** pure deterministic population pipeline.
- **Simulation:** fixed-tick mechanics, scheduled/random ticks, fluids, redstone-like future systems.
- **Player:** state + controller + interaction + physics, not world streaming.
- **Entities:** entity state/tick/AI/spatial index; if currently elsewhere, establish a clear home.
- **Rendering:** CPU mesh generation contracts, light representation, materials, GPU scene resources.
- **Storage:** versioned save schema/migrations and persistence backend.
- **UI/audio:** presentation driven by events/state snapshots, not mutation of world internals.

## `Game.ts` strategy

Do not split it mechanically. First classify every field and method into:

- construction/wiring;
- fixed simulation tick;
- render-frame update;
- user command handling;
- persistence;
- lifecycle/disposal;
- debug/test hooks.

Then extract cohesive services only when there is a testable boundary. `Game` may remain the composition root while becoming much thinner.

## Data-driven registries

The presence of `BlockPropertySchema`, `BlockRegistry` and `BlockStateRegistry` is a strong base. Extend the same registry concept for:

- collision/selection/occlusion shapes;
- render layer/material class;
- texture face/layer and animation;
- light emission/opacity;
- hardness/tool requirements/drops;
- sound group;
- fluid behavior;
- placement/state transition rules;
- block entity type.

Generate or validate dense runtime lookup tables at startup so hot loops do not perform schema validation or exception-driven lookup.

## Observability

Create an in-game debug/perf overlay with ring-buffered metrics:

- FPS and frame p50/p95/p99;
- simulation TPS and accumulated debt;
- CPU update/render/world/physics/entity timings;
- GPU frame timing when `EXT_disjoint_timer_query_webgl2` is supported;
- Three.js `renderer.info` calls/triangles/geometries/textures;
- visible/loaded/simulated sections;
- generation/light/mesh/upload queue depths and oldest job age;
- worker utilization and jobs completed/discarded;
- mesh bytes uploaded/frame;
- heap/resource estimate where available;
- save queue/status;
- selected block/entity coordinates/state.

Expose benchmark export as JSON so CI/local runs can compare revisions.

## Testing pyramid

### Pure unit tests

- coordinate transforms and negative coordinates;
- palettes/section indexing;
- block-state schema and registry invariants;
- PRNG/noise deterministic vectors;
- DDA edge/corner/tie cases;
- collision clipping and block shapes;
- movement traces;
- light propagation/removal;
- greedy-mesh fixtures;
- fluid level transitions;
- save schema validation/migration.

### Property/fuzz tests

- world↔chunk↔local coordinate round trips;
- set/get block under random coordinates;
- mesher never emits internal faces between opaque full cubes;
- no invalid indices/NaN vertex values;
- collision resolution leaves player non-penetrating;
- deterministic worldgen independent of job order;
- serialize→deserialize preserves state.

### Integration tests

- chunk lifecycle with cancellation and stale job result;
- border edits invalidate both sides correctly;
- light crosses section boundary and removes correctly;
- generation→mesh→upload state machine;
- unload/reload preserves edits;
- pause/background resume does not run unbounded catch-up.

### E2E/browser tests

Keep Playwright for high-value workflows: start game, pointer lock/fallback, walk/jump, break/place, inventory, save/reload, seed determinism, settings/quality tier, context-loss UI where testable.

### Visual regression

Use deterministic camera/seed/time/weather fixtures. Compare images with small thresholds, but also retain semantic metrics (draw calls, visible sections, material counts) so a screenshot pass cannot hide a performance regression.

## Performance tests

Do not make noisy absolute browser timing a hard PR gate initially. Use two levels:

- **PR smoke:** deterministic workload counts, queue bounds, no long synchronous algorithmic regressions, draw-call/geometry ceilings in fixed scene.
- **scheduled/reference runner:** stable hardware/browser with frame-time and memory budgets.

Store benchmark metadata: commit, browser/GPU renderer, resolution/DPR, quality preset, seed, scene, warmup duration, sample count.

## Persistence

The earlier audit describes localStorage-based sparse edit persistence. Current repository contains `src/storage`, and main's latest commit message references persistence hardening. Re-audit the current storage code before touching it.

Target save architecture:

- versioned schema;
- world identity/seed/version metadata;
- atomic-ish write protocol (new snapshot → validate → swap pointer where backend allows);
- bounded dirty queues;
- migrations with rollback/backups;
- separation of regenerated terrain from user/world mutations;
- block entities/entities included explicitly;
- corruption recovery path.

Move to IndexedDB when world state grows beyond a compact edit overlay or asynchronous larger writes become necessary. Do not migrate merely for fashion.

## Security/test hooks

Earlier audit flagged a `?e2e` control surface. Keep test APIs tree-shaken/compile-time gated or strongly restricted in production builds. Add CSP where deployment permits. If shared memory is adopted, document COOP/COEP and third-party embed consequences.

## CI

Required gates:

1. install with lockfile;
2. typecheck;
3. lint;
4. unit/integration tests;
5. production build;
6. Playwright smoke suite;
7. save-schema/state validation;
8. dependency/license/security checks;
9. deterministic benchmark smoke artifact;
10. optional visual snapshots.

Cache Playwright browsers/npm appropriately, but never let cache hide lockfile drift.

## Release observability

Because this is a browser game, capture recoverable diagnostics without requiring invasive analytics: build version, browser/GPU capability summary, last fatal error, context-loss count, save migration version. For a personal/local build this can remain local and exportable rather than uploaded.