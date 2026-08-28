# 06 — Minecraft-Like Parity Roadmap

This is a **behavioral inspiration roadmap**, not a mandate to copy Mojang assets, branding, source code or proprietary content. Follow Minecraft Usage Guidelines/EULA and use original or properly licensed assets.

## Phase 0 — Rebaseline current main

**Tasks**
- run build/typecheck/lint/unit/E2E;
- capture package/browser/GPU environment;
- trace active runtime paths for clocks, chunk lifecycle, greedy meshing, lighting, storage and entities;
- record all benchmark scenes from `07_BENCHMARKS_RISKS.md`;
- reconcile older root audit docs with current code.

**Exit:** no “unknown active path” in critical simulation/world/rendering systems; baseline artifact committed to an implementation branch later.

## Phase 1 — Simulation contract

**Tasks**
- define fixed logical tick and render interpolation contract;
- enumerate system order and mutation ownership;
- add deterministic input replay;
- make pause/background behavior explicit;
- establish block/entity/random/scheduled tick queues with hard budgets.

**Exit:** deterministic replay of 10,000 ticks matches on repeat; no unbounded catch-up.

## Phase 2 — Chunk lifecycle and worker foundation

**Tasks**
- consolidate `ChunkStatus`/`ChunkTicket` as authoritative state;
- define section/column ownership and neighbor dependencies;
- create cancellable/versioned worldgen and mesh jobs;
- workerize pure generation first, meshing second;
- transfer typed arrays;
- bound ready/upload queues;
- stale results are dropped safely.

**Exit:** straight-flight stress does not create monotonic queue growth; main-thread chunk tasks meet budget.

## Phase 3 — Render submission and mesh correctness

**Tasks**
- benchmark `GreedyMesher` against authoritative current mesher;
- split opaque/cutout/translucent/fluid geometry;
- merge only attribute-compatible faces;
- validate section bounds/frustum culling;
- deduplicate materials/textures;
- add upload byte/time scheduler;
- audit disposal on replacement/unload.

**Exit:** stable resource counts after traversal; draw-call target met in benchmark scenes; no border holes or stale mesh flashes.

## Phase 4 — Physics and interaction parity

**Tasks**
- add block-state collision/selection/occlusion shapes;
- support partial blocks;
- formalize support/friction/slipperiness;
- add sneak/crouch edge behavior;
- add climbables;
- model fluid immersion/drag/buoyancy/flow;
- separate entity/projectile collision policies;
- shape-aware block raycast;
- golden movement trace suite.

**Exit:** all movement/shape fixtures pass at 30/60/120/144-Hz render rates with invariant fixed-tick result.

## Phase 5 — Lighting/material fidelity

**Tasks**
- verify skylight/block-light add/remove propagation across section boundaries;
- per-vertex voxel AO;
- biome tints;
- time-of-day environment state;
- animated textures;
- water/lava shader tiers;
- stable directional shadows;
- fog/sky/cloud/star/weather coherence;
- visual regression fixtures.

**Exit:** lighting edits remain bounded; no full-world relight; Medium meets GPU budget; Low has clean fallback.

## Phase 6 — Worldgen parity depth

**Tasks**
- climate/biome field architecture;
- surface rules;
- cave systems and ravines/carvers;
- ore distributions;
- vegetation feature decorators;
- deterministic structures with region ownership;
- spawn-safe generation and biome transitions;
- seed snapshot tests.

**Exit:** generation order/worker count does not change world result; 100 fixed seed probes match saved hashes.

## Phase 7 — Gameplay systems

Prioritize cohesive loops over feature count:

- block breaking hardness/tool tiers/drops;
- crafting and recipes;
- health/hunger/food/status effects;
- inventory/container interactions;
- farming/growth;
- furnaces/brewing if in scope;
- items/XP;
- hostile/passive entities;
- projectiles/combat;
- beds/spawn/day-night consequences;
- weather effects.

Use data registries for recipes, loot and block/item behavior where possible.

**Exit:** one full survival loop (spawn → gather → craft → shelter → combat/save/reload) is robust before adding breadth.

## Phase 8 — Entity scale and AI

**Tasks**
- entity spatial index/chunk partition;
- activation ranges and simulation LOD;
- navigation budget and path cache;
- sensory/target updates at lower cadence than movement when safe;
- pooled particles/items only when profiling shows GC pressure;
- instanced/simple renderers for crowds where applicable.

**Exit:** 250-entity benchmark meets simulation budget; sleeping/out-of-range entities consume negligible CPU.

## Phase 9 — Persistence and long-session hardening

**Tasks**
- versioned save/migrations;
- autosave/dirty batching;
- block entities/entities;
- corruption recovery;
- unload/reload torture;
- context-loss recovery;
- 60-minute traversal soak;
- dependency/license audit.

**Exit:** no progressive memory/resource leak; save migration and recovery fixtures pass.

## Phase 10 — Optional multiplayer

Only after deterministic simulation and persistence contracts stabilize.

Recommended design:

- authoritative server state;
- client input commands with sequence numbers;
- snapshot/delta replication;
- interpolation for remote entities;
- prediction/reconciliation only where latency requires it;
- chunk interest management;
- server-side validation of placement/break/reach/movement.

Do not attempt lockstep simulation over browser clients as the default architecture.

## Features intentionally deferred

- WebGPU rewrite;
- ray tracing/path tracing;
- mandatory SSAO/bloom/TAA;
- complex rigid-body physics for the whole world;
- full redstone-equivalent system before tick scheduling is proven;
- unlimited world-height expansion before section pipeline budgets are proven;
- multiplayer before deterministic/save contracts.

## “Make it look like the real thing” priority order

For perceived parity per engineering cost, implement in this order:

1. movement/camera/input feel;
2. texture scale/filtering + block silhouettes;
3. skylight/block light/AO;
4. fog/sky/day-night;
5. terrain/biome composition;
6. water and foliage behavior;
7. animation/sounds/particles;
8. weather;
9. higher-end shadows/post polish.

A game with correct movement, silhouettes, light and atmosphere will read as Minecraft-like much sooner than one with expensive post-processing but incorrect mechanics.