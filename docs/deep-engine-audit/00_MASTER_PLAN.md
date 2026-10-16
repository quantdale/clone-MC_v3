# 00 — Executive Master Plan

## North-star outcome

Make `clone-MC_v3` feel materially closer to Minecraft in five coupled dimensions:

1. **Simulation feel:** stable 20-TPS-style deterministic gameplay semantics, predictable movement/collision, coherent fluids and entity motion.
2. **World fidelity:** richer terrain/biomes/structures/block states while keeping chunk streaming bounded.
3. **Visual fidelity:** voxel-appropriate lighting, AO, fog/sky/weather, water, animated/tinted materials and controlled shader polish.
4. **Performance:** smooth frame pacing on realistic hardware, no long main-thread chunk/worldgen stalls, bounded memory and GPU uploads.
5. **Engineering velocity:** systems become measurable, testable, data-driven and independently replaceable.

## Repository-specific starting point

[VERIFIED] The project is a browser TypeScript/Vite game with Three.js `^0.169.0`, Vitest, Playwright, ESLint and a Node >=20 toolchain. `package.json` describes a Three.js voxel sandbox with procedural terrain, chunk streaming and block interaction.

[VERIFIED] Major modules already exist under `src/engine`, `src/player`, `src/world`, `src/worldgen`, `src/rendering`, `src/simulation`, `src/storage`, `src/audio`, `src/inventory`, and `src/ui`.

[VERIFIED] The current engine has explicit `GameLoop`, `SimulationClock`, `RenderInterpolator`, `Renderer`, `InputManager`, and a large `Game.ts` composition/coordinator. The coexistence of these pieces is a good foundation, but it also makes update ownership/order an explicit audit target.

[VERIFIED] Player physics is custom AABB voxel collision with per-axis movement, displacement-based substeps, terminal velocity, 1-block configured step height, water/lava checks and farmland landing behavior. This is already beyond a toy controller, so the recommendation is **evolve it behind contracts**, not immediately replace it with a generic rigid-body engine.

[VERIFIED] World/render systems include `Chunk`, `ChunkColumn`, `ChunkSection`, `ChunkStatus`, `ChunkTicket`, `ChunkManager`, `ChunkMesher`, `CollisionResolver`; rendering includes `AmbientOcclusion`, `BlockLightEngine`, `LightStorage`, `LightUpdateEngine`, `GreedyMesher`, `FluidSurfaceMesher`, biome tinting and a memory-resource budget. The architecture is therefore already moving toward sectioned chunks, lighting and greedy meshing; optimization work must validate which paths are authoritative before adding parallel alternatives.

## Priority stack

| Priority | Program | Why now | Expected outcome |
|---|---|---|---|
| P0 | Baseline + instrumentation | prevents placebo optimization | reproducible CPU/GPU/memory/frame-time evidence |
| P0 | Simulation contract | every mechanic depends on update ordering/time | deterministic movement and tick semantics |
| P0 | Chunk/world pipeline ownership | world fidelity multiplies workload | bounded generation/meshing/upload queues |
| P1 | Meshing/render submission | voxel scenes become draw-call/vertex heavy | lower CPU render cost and GPU bandwidth |
| P1 | Lighting/material architecture | visual fidelity depends on stable mesh attributes | richer visuals without post-FX dependency |
| P1 | Physics parity | player feel is the most visible gameplay mismatch | consistent movement/collision/interactions |
| P2 | Worldgen/content depth | depends on fast streaming | biomes, structures, caves and coherent block states |
| P2 | Entity/survival parity | depends on simulation budgets | scalable mobs/projectiles/items |
| P2 | Persistence hardening | richer world state raises migration risk | versioned durable saves |
| P3 | Multiplayer | multiplies determinism/state requirements | authoritative network-ready architecture |

## Critical path

```text
Benchmark harness
  -> explicit simulation/tick ownership
  -> authoritative chunk lifecycle/status model
  -> worker-safe worldgen/meshing data contracts
  -> bounded CPU->GPU upload scheduler
  -> renderer submission/mesh/material budgets
  -> lighting/material fidelity
  -> biome/structure/content expansion
  -> entity/AI scale
  -> multiplayer (optional)
```

Do not start multiplayer, heavy post-processing, large biome expansion, or thousands of entities before the first six nodes are stable.

## Architectural choices

### Physics
**Recommended:** keep a voxel-specialized kinematic controller and generalize collision shapes. Use a rigid-body library only for independent dynamic bodies where it proves useful. Minecraft-like player movement is not well served by handing the avatar wholesale to a generic rigid-body solver because exact step, friction, liquid, sneak, ladder, block-shape and interaction semantics matter more than physical realism.

### Timing
**Recommended:** render with `requestAnimationFrame`, simulate gameplay at an explicit fixed quantum (target 20 logical ticks/s for Minecraft-style systems) with a bounded accumulator, while player/camera presentation can use interpolation. Cap catch-up ticks to avoid a spiral of death. Keep render FPS independent from logical TPS.

### Workers
**Recommended:** first workerize pure world generation and mesh construction using transferable typed arrays. Do not start with `SharedArrayBuffer`. Structured clone + transferables are easier to reason about; adopt shared memory only if profiling proves copying/ownership transfer is a real bottleneck and deployment can support cross-origin isolation.

### Rendering backend
**Recommended near term:** retain Three.js/WebGL2 and optimize the architecture around it. Treat WebGPU as an experimental backend track, not a prerequisite. A migration before fixing world/mesh submission will merely move the same architectural stalls to a newer API.

## Quality tiers

Expose explicit quality presets instead of silently scaling everything together:

- **Low:** reduced render distance, no dynamic shadows, cheaper water/clouds, DPR cap 1.0–1.25.
- **Medium:** voxel AO + block/skylight, moderate shadows, normal atmosphere, DPR cap ~1.5.
- **High:** longer distance, high-res shadow map, richer water/cloud shaders, selective post effects, DPR cap up to 2.
- **Adaptive:** lower DPR/shadow distance/render distance only after sustained GPU/CPU pressure; use hysteresis to prevent oscillation.

## Definition of “without compromising performance”

A visual feature is acceptable only if it has:

- a measurable GPU/CPU cost;
- a quality-tier switch or scalable parameter;
- a regression budget;
- a fallback on unsupported/slow hardware;
- no unbounded per-frame allocation;
- no synchronous world/chunk work introduced into the render-critical path.

## Milestone sequence

### M0 — Truthful baseline
Instrument frame CPU time, GPU time where supported, long frames, draw calls, triangles, geometries/textures, chunk queue depths, generation/meshing/upload latency, heap/resource estimates and interaction latency.

### M1 — Simulation foundation
Make update order explicit. Define tick ownership for player, block/fluid/random ticks, entities, AI, world streaming and visual interpolation. Add deterministic replay fixtures.

### M2 — World pipeline
Unify chunk states/tickets/section ownership. Separate generation, lighting, meshing, upload and activation. Move pure CPU stages off main thread behind cancellation/version tokens.

### M3 — Render efficiency
Validate greedy meshing coverage, split opaque/cutout/translucent paths, dedupe materials, minimize draw calls, bound GPU uploads, improve culling, eliminate hot-path allocations.

### M4 — Physics and interaction parity
Generalize voxel collision shapes; tune movement by captured parity fixtures; add crouch/sneak, ladders/climbable surfaces, fluid drag/buoyancy, knockback and entity collisions as scoped.

### M5 — Lighting/graphics
Finish skylight/block-light propagation contracts, per-vertex AO, biome tint, fog/sky/day-night, water/lava surfaces, texture animation and tiered shadows. Add visual-regression scenes.

### M6 — World/content
Biomes, caves, ores, structures, vegetation, weather, richer block states and survival mechanics under deterministic seed fixtures.

### M7 — Scale/hardening
Long-play memory tests, traversal torture, save migrations, context loss/recovery, browser/device matrix, CI perf smoke tests and release budgets.

## Stop conditions

Pause feature expansion when any of these persist:

- p95 frame time breaches target for two benchmark revisions;
- chunk generation/meshing backlog grows without bound during straight-line flight;
- memory climbs monotonically after repeated load/unload cycles;
- deterministic replay diverges;
- a save migration cannot round-trip safely;
- visual tier cannot be disabled independently when it causes regression.