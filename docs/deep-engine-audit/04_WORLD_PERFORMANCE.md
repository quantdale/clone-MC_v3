# 04 — World, Chunk Pipeline, Hardware Utilization and Performance

## Core observation

The codebase has already evolved beyond a single `Chunk` abstraction: current files include columns, sections, statuses and tickets. That is the right direction for scale. The next task is to make the lifecycle authoritative and measurable.

## Required chunk state machine

Document and enforce one monotonic pipeline, for example:

```text
ABSENT
 -> ALLOCATED
 -> GENERATED
 -> FEATURES
 -> LIGHTED
 -> MESH_QUEUED
 -> MESH_READY_CPU
 -> UPLOAD_QUEUED
 -> ACTIVE_GPU
 -> EVICTING
 -> ABSENT
```

Not every project needs those exact names, but each stage must have:

- owner;
- input version/generation ID;
- cancellation semantics;
- dependencies on neighbor sections;
- memory ownership;
- queue priority;
- timing metric.

`ChunkStatus.ts` and `ChunkTicket.ts` should become the single source of truth rather than allowing ad-hoc booleans across World/Game/render code.

## Streaming priorities

Prioritize work by more than Euclidean distance:

1. visible/front-facing sections near camera;
2. collision/simulation neighborhood;
3. interaction target neighborhood;
4. forward movement corridor;
5. remaining render-distance rings;
6. speculative/preload work.

Use hysteresis between load and unload radii to avoid churn at chunk boundaries. Separate render distance from simulation distance (already configured independently).

## Replace count budgets with time-aware budgets

Current config uses `generatePerFrame=2`, `meshPerFrame=3`, `unloadPerFrame=4`. Count budgets are predictable but do not reflect terrain complexity or device speed.

Recommended scheduler:

- retain hard count caps as safety limits;
- add time budgets (e.g. main-thread upload <= 1.5 ms/frame Medium);
- measure task duration EMA/p95;
- stop dispatch when remaining frame budget is too small;
- allow worker queues to remain busy independently.

## Worker architecture

### Phase A — transferable buffers
Move pure generation and meshing work to dedicated workers.

Worker input should be compact immutable data: seed, section coordinates, block-state palette/data, neighbor boundary slices, biome/light inputs, job version. Worker output should be transferable typed arrays for positions/normals/UV-or-layer/light/AO/index data plus metadata.

Use transfer lists so buffers change ownership rather than being copied. Pool/recycle buffers only after profiling proves allocation pressure.

### Phase B — worker pool
Size conservatively from `navigator.hardwareConcurrency`; do not consume every logical core. Start around `clamp(hardwareConcurrency - 2, 1, 4)` and benchmark. Keep the main/UI thread and browser/GPU driver room.

### Phase C — shared memory only if proven
`SharedArrayBuffer` + Atomics can reduce copying but adds race, determinism and deployment complexity and requires cross-origin isolation for normal browser use. Adopt only with an ADR and benchmarks that show meaningful benefit over transferables.

## Main-thread responsibilities

Even with workers, keep these bounded:

- job orchestration/cancellation;
- Three.js object creation and scene attachment unless a deliberate OffscreenCanvas renderer architecture is chosen;
- GPU buffer uploads;
- input/UI;
- final world-state commits.

Do not move rendering to `OffscreenCanvas` merely because it is available. It complicates DOM/UI integration and debugging. First remove worldgen/meshing stalls; those are the safer worker wins.

## Data layout

For voxel hot paths prefer compact numeric structures:

- typed block-state IDs/palettes per section;
- packed light values where practical;
- numeric/local-index arithmetic instead of repeated object creation;
- avoid string chunk keys in hottest loops if profiling confirms allocation/hash overhead;
- precompute registry arrays for hot block properties instead of chained `Map`/throwing lookups;
- reuse scratch vectors/arrays within meshing/collision loops.

Do not convert every map/object to typed arrays blindly. Optimize only hot structures with stable bounded IDs.

## Meshing strategy

1. Cull internal faces against neighbor occupancy/occlusion shape.
2. Split opaque/cutout/translucent/fluid streams.
3. Greedy merge compatible opaque/cutout quads.
4. Keep light/AO/tint in merge signature.
5. Build indexed typed arrays in workers.
6. Transfer to main thread.
7. Upload under frame budget.
8. dispose replaced geometry immediately after safe swap.

Version each mesh job. If section blocks/light change while a job is running, discard stale output rather than flashing old geometry.

## Culling

Three.js object frustum culling is useful only if scene objects correspond to meaningful chunk/section bounds. Verify bounding boxes/spheres after mesh rebuilds.

Recommended layers:

- distance culling via ticket/render radius;
- frustum culling per section or column mesh;
- optional coarse occlusion/HZB experiment only after draw-call/vertex profiling proves overdraw/submission remains material;
- portal/indoor occlusion is low priority for open terrain.

WebGL2 occlusion queries exist, but naive per-section queries can cost more CPU/GPU synchronization than they save. Treat as experimental.

## GPU upload discipline

GPU uploads can cause frame spikes even when CPU meshing is off-thread.

Track:

- bytes uploaded/frame;
- new BufferGeometry count/frame;
- upload queue depth/age;
- time from mesh-ready to visible;
- discarded stale mesh bytes.

Set a configurable upload byte/time budget. Prioritize nearest visible sections. Prewarm critical textures/resources before first reveal when appropriate.

## Memory lifecycle

Create a resource ownership ledger:

- CPU voxel storage/section;
- edit overlay/save state;
- worker input/output buffers;
- geometry attributes/index buffers;
- textures/materials;
- entities/particles/audio buffers.

A chunk unload is not complete until CPU references and GPU resources are released or intentionally cached under a bounded LRU.

Run a traversal test: move outward for N chunks, return, repeat 5 times, force natural GC opportunities, and verify heap/renderer resource counts converge instead of stair-stepping forever.

## World generation

Keep worldgen deterministic and pure by coordinate + seed. Build stages:

- climate/biome fields;
- base density/height terrain;
- caves/carvers;
- surface rules;
- ores/features;
- vegetation;
- structures;
- post-processing/block entities.

Feature placement crossing section borders must be order-independent or use deterministic region ownership so worker scheduling cannot change the resulting world.

## Benchmark scenes

1. **Spawn cold start:** fresh seed to controllable frame.
2. **Straight flight:** continuous forward travel at 2–4× normal sprint, 120 s.
3. **Spin stress:** stand at dense scene and rotate camera rapidly.
4. **Edit storm:** place/break 20 blocks/s across section borders.
5. **Lighting storm:** toggle emissive/opaque blocks in a compact region.
6. **Forest:** high cutout foliage/overdraw.
7. **Water coast:** translucent/fluid-heavy view.
8. **Entity crowd:** 100/250/500 entities with graded AI.
9. **Long session:** 30–60 min traversal/load-unload.

## Initial performance budgets

Budgets are engineering targets to validate, not current claims.

- 60 FPS Medium 1080p: frame p95 <= 16.7 ms, p99 <= 25 ms.
- main-thread scripting p95 <= 8 ms/frame ordinary play.
- worldgen+meshing worker throughput must exceed consumption during 2× sprint flight.
- main-thread GPU upload p95 <= 1.5 ms/frame, never >4 ms except cold load.
- no single chunk task >8 ms on main thread in steady state.
- input-to-camera response <= 1 presented frame under normal load.
- memory after traversal round trip <= baseline + 15% once caches settle.
- queue age p95 < 500 ms for visible-near mesh jobs; hard timeout/telemetry above 2 s.