# Performance Optimization Master Plan

**Repository:** `quantdale/clone-MC_v3`  
**Audit date:** 2026-08-25  
**Status:** Draft implementation plan based on current `main`  
**Scope:** Full-codebase structural audit with deep inspection of the live performance-critical paths: frame loop, simulation tick, chunk streaming, terrain generation, meshing, lighting, rendering, entities, player physics, persistence-facing caches, build configuration, and existing performance gates.

---

## 1. Executive diagnosis

The project is not primarily slow because of one bad loop or one bad Three.js setting. The dominant problem is architectural: **large, indivisible CPU jobs still execute synchronously on the browser main thread, and small world changes invalidate too much work.**

The repository contains several good performance primitives—bounded chunk queues, frame budget classes, worker infrastructure, a greedy mesher, monitoring, release budget contracts—but the highest-value pieces are either disabled, only partially integrated, or not measuring the live game. This creates a large gap between the intended architecture and the actual runtime hot path.

### Highest-impact root causes

1. **Terrain generation is synchronous on the main thread.** `World.processGeneration()` executes a complete `TerrainGenerator.generateChunk()` and light seeding after only checking an estimated cost. The task cannot yield once started.
2. **Production meshing is synchronous on the main thread.** `World.useWorkers` is hard-coded to `false`, so `ChunkMesher.mesh()` performs a complete 16×64×16 chunk mesh in the frame loop.
3. **The active mesher is face-culled, not production greedy meshing.** The current hot path can emit one quad per visible voxel face and performs expensive lighting/AO sampling per face.
4. **A single voxel edit can cause full-chunk remeshing.** Border edits can also remesh neighbors. Lighting propagation can cause another whole-chunk remesh, so edits can generate duplicate/redundant rebuild work.
5. **The existing worker meshing path is not safe to simply enable.** It submits 16³ sections independently, but each returned section calls `attachGeometries()`, which first removes all existing meshes for the chunk. Section results therefore replace/dispose one another instead of being aggregated or occupying stable section slots.
6. **The frame work-budget scheduler is advisory, not preemptive.** It reserves an estimated cost before a job, then records the real duration afterward. If the estimate is wrong, an expensive generation/mesh task can still exceed the frame budget by a wide margin.
7. **World generation repeats expensive deterministic work.** Height, biome/climate, spawn-distance checks, tree queries, and structure callbacks recompute data that can be cached once per chunk/column.
8. **Simulation contains avoidable repeated scans and allocations.** Random ticking scans all simulating chunks/sections at 20 TPS; item merging is O(n²); mob spawn cycles separately rebuild simulating chunk arrays; several hot structures use array `shift`, `indexOf`, `splice`, snapshots, and string keys.
9. **Rendering creates/disposes complete chunk geometry repeatedly.** Remeshing replaces Three.js meshes and BufferGeometry wholesale, increasing CPU allocation, GC pressure, GPU upload traffic, and driver synchronization.
10. **The release performance gate is not yet a live-game certification gate.** Parts of `ReleasePerformanceGate.ts`, especially frame/network fixture builders, are synthetic. A threshold-shaped fixture is not proof that the real browser frame pipeline meets the threshold.

### Optimization principle

Do **not** start by hand-tuning small array operations or lowering graphics quality. The correct order is:

> **measure the live game → move heavy work off the main thread → reduce invalidation granularity → reduce geometry/lighting work → optimize simulation/data structures → tune rendering quality adaptively.**

That order attacks the actual frame-time spikes rather than hiding them.

---

## 2. Current runtime architecture and why it stalls

### 2.1 Main-thread world streaming

`src/world/World.ts` runs streaming work every animation frame:

- `ensureChunks()`
- `processGeneration()`
- `processMeshing()`
- `processFallingBlocks()`
- `processLightUpdates()`
- unload processing
- monitoring

This design is reasonable only if each dispatched unit is guaranteed to be small. Today it is not.

`processGeneration()` can execute a complete terrain generation pass, edit overlay application, voxel counting, light seeding, neighbor invalidation, and mesh enqueue as one non-yielding operation.

`processMeshing()` can execute an entire chunk mesh, build several typed arrays/BufferGeometry objects, dispose prior meshes, attach new meshes, and upload geometry as one non-yielding operation.

The current scheduler prevents starting another task when an *estimate* does not fit. It cannot stop a task that actually costs 5, 10, 20, or 50 ms.

### 2.2 Worker infrastructure exists but production does not use it

`src/world/World.ts` currently contains:

```ts
private readonly useWorkers = false;
```

So the worker pool and `MeshWorkerClient` do not remove the expensive active meshing work from the main thread.

There is an additional integration blocker: the worker path processes each vertical 16³ section independently, while `consumeWorkerMeshResult()` ultimately calls `attachGeometries()`. That function removes the complete previous chunk mesh before attaching the section result. If workers are enabled without redesign, asynchronous section completion can cause section replacement, flicker/missing geometry, unnecessary disposal, and repeated upload churn.

**Required conclusion:** worker meshing should not be toggled on as a one-line fix. The section-result ownership model must be corrected first.

### 2.3 Production meshing is too expensive per invalidation

`src/world/ChunkMesher.ts` iterates all 16×64×16 cells. For each non-air voxel it evaluates six faces. For each visible face it performs registry/neighbor work, atlas UV lookup, lighting sampling, AO sampling, tint/stream classification, then emits four vertices into output buffers.

The lighting sampler supplied by `World` performs world-coordinate lookups. AO/light sampling can therefore cascade into repeated coordinate conversion, chunk lookup, registry lookup, and light-storage access for each visible face corner.

A greedy mesher exists in `src/rendering/GreedyMesher.ts`, but it is not the live production chunk mesher. Its current implementation is also allocation-heavy (`VisibleCell[][]`, row arrays, per-cell objects, `boolean[][]`, `Map`-backed signature cache), so it should be treated as a correctness/reference implementation rather than enabled unchanged as the final optimized hot path.

### 2.4 Invalidation granularity is too broad

A changed block currently dirties and remeshes its entire 16×64×16 chunk. Horizontal boundary edits dirty whole neighboring chunks as well. Lighting propagation then tracks dirty chunks and can enqueue another full remesh after light changes.

This is the single biggest avoidable amplification factor in interactive gameplay:

- one block edit
- potentially two or more full chunk geometry rebuilds
- potentially another rebuild after light propagation
- full old geometry disposal
- full replacement upload

The rendering data should be split into **16³ mesh sections** (or another small fixed subchunk unit) with stable ownership. A block edit should invalidate only its section, plus directly affected neighbor sections at boundaries. Multiple invalidations in the same frame/tick must coalesce before a build is scheduled.

### 2.5 Terrain generation repeats work

`src/world/TerrainGenerator.ts` performs deterministic generation correctly, but repeats costly queries:

- height FBM per column;
- climate/biome sampling;
- `Math.hypot()` spawn-radius checks in several routines;
- cave/lava 3D noise across many cells;
- biome and height recomputation in tree placement;
- height/biome recomputation through structure-generator callbacks;
- temporary tree block arrays from configured feature generation.

A chunk-local generation context should compute and retain column-level values once and feed all later stages. Squared-distance comparisons should replace `Math.hypot()` where only a radius comparison is needed.

Generation should still ultimately move to workers; caching is complementary because it lowers worker CPU time and chunk latency.

### 2.6 Simulation work scales poorly with active world size

`Game.runFixedTick()` runs at 20 TPS and contains multiple full/large subsystem passes.

`tickRandomBlocks()` traverses loaded chunks, filters simulation-distance chunks, then calls `RandomTickSelector.selectEligible()` once for every 16³ section. At render/simulation distance 6 with a single 64-block-high chunk layer, the square can contain about 169 chunk columns and 676 sections. The selector can attempt many eligibility probes per section and allocates coordinate tuples/arrays for selected results.

Passive and hostile spawn cycles separately traverse the loaded world and construct fresh `Set<string>` and `ChunkCoord[]` collections. The simulating chunk-column set should be maintained once and shared by random ticks, spawning, block entities, and other simulation systems.

`ItemEntityManager.mergeEntities()` copies the order array, creates a `Set`, then performs nested pair scanning: O(n²) distance checks in the worst case. `removeItemEntity()` also uses `order.indexOf()` + `splice()`. This will degrade badly in farms/explosions/large drop piles. Item entities need a spatial hash/grid and O(1)-style stable removal bookkeeping.

### 2.7 Several long-lived structures use O(n) LRU/queue operations

Examples in `World.ts`:

- `editOverlayAccessOrder.indexOf()` + `splice()` on every touch, with a 10,000-chunk cap;
- `stateOverlayWriteOrder.indexOf()` + `splice()`;
- `retryMeshQueue.shift()` and `.find()`;
- repeated string keys such as `` `${x},${y},${z}` `` in hot queues/sets.

These are not the first bottlenecks to fix, but they become significant in long sessions and should be replaced after the worker/invalidation architecture is corrected.

### 2.8 Player collision path allocates unnecessarily

`PlayerPhysics` and `CollisionResolver` are not the dominant bottleneck, but the fixed-tick path creates many short-lived objects:

- `boxOf()` returns new object literals repeatedly;
- spread copies such as `{ ...box, y: result.y }`;
- `CollisionResolver.move()` allocates result objects;
- `translate()` allocates a new AABB for each candidate collision-shape box;
- `sampleMedium()` constructs a new sample array and returns a new contact object.

Once the major world bottlenecks are fixed, this path should be converted to reusable scratch structures / output parameters because it runs continuously at 20 TPS.

### 2.9 Renderer defaults are expensive on high-DPI systems

`Renderer.ts` always requests antialiasing, enables PCF soft shadows when configured, and permits device pixel ratio up to 2. A 2560×1600 or similar high-DPI display at DPR 2 can drive a very large fragment workload. High quality also increases render distance and shadow-map size.

This should be solved with **adaptive resolution / quality**, not by globally lowering visual quality. GPU frame time should control a dynamic DPR ceiling and optional expensive effects.

### 2.10 Existing performance certification is incomplete

`src/simulation/ReleasePerformanceGate.ts` defines useful tier budgets, but its documentation explicitly says frame/network actuals can come from synthetic tier-sized bundle builders until real scenarios are wired. This means the gate can validate gate logic without validating the live Three.js game.

The repository needs a browser-driven performance scenario that measures the actual production bundle, actual renderer, actual chunk generation, actual meshing, actual traversal, and actual block-edit stress.

---

## 3. Performance targets and non-negotiable gates

Targets should be hardware-tiered, but the following should become the default Medium/high-value acceptance envelope.

### Runtime frame targets

- 60 Hz target: **p50 ≤ 16.7 ms**, **p95 ≤ 20 ms**, **p99 ≤ 28 ms** during normal traversal.
- No main-thread long task >50 ms during steady exploration after initial load.
- Background world work on main thread: **≤2 ms p95 per rendered frame** after worker migration.
- Main-thread generation work: effectively zero except orchestration/transfer/attachment.
- Main-thread CPU mesh construction: effectively zero except geometry object creation/upload.
- No more than one bounded GPU upload slice per frame; hard byte/time ceiling must be enforced rather than only observed.

### Streaming targets

- Spawn safety ring first-visible latency recorded and tier-gated.
- Forward traversal must not produce repeated queue starvation/rebuild oscillation.
- Queue oldest-age p95 and p99 must be measured.
- Stale worker results must be rejected without causing visible holes or repeated full rebuilds.

### Memory/GC targets

- Heap reaches a steady plateau during a 10-minute travel loop instead of monotonically increasing.
- Geometry count returns near baseline after travel away/back stress.
- No per-frame large-array allocation in meshing, random ticks, entity merges, or simulation-chunk collection.
- GPU geometry disposal/recreation rate must fall sharply under repeated single-block edits.

### Correctness constraints

Performance work must preserve:

- deterministic terrain for a fixed seed;
- save format and edit durability;
- block behavior and lighting semantics;
- mesh visual equivalence;
- stale-result rejection;
- chunk load/unload correctness;
- fixed-tick determinism where it is part of the contract.

A performance change is not accepted if it wins FPS by silently changing world output.

---

## 4. Phase 0 — Build a real performance baseline first

**Priority: P0 / mandatory before implementation claims**

### Deliverables

1. Add a browser performance harness using the production build.
2. Add repeatable scenarios:
   - stationary spawn after warm-up;
   - straight-line traversal across new terrain;
   - sprint traversal/rapid chunk-boundary crossing;
   - rapid place/break edit loop;
   - light-emitting block edit loop;
   - dense transparent/fluid scene;
   - item-drop pile / merge stress;
   - mob simulation stress;
   - 10-minute travel + return memory test.
3. Collect:
   - frame p50/p95/p99/max;
   - long tasks;
   - generation CPU/worker time;
   - mesh CPU/worker time;
   - upload bytes and upload time;
   - queue depths and oldest age;
   - draw calls / triangles / geometry count;
   - JS heap samples;
   - chunk first-visible latency;
   - stale/cancelled jobs;
   - remeshes per logical block edit.
4. Wire the browser scenario into `ReleasePerformanceGate` instead of using a synthetic frame bundle for release certification.
5. Persist benchmark JSON artifacts so before/after commits can be compared.

### Files

- `src/rendering/RenderPerformanceMonitor.ts`
- `src/simulation/ReleasePerformanceGate.ts`
- `src/world/World.ts`
- `src/engine/Game.ts`
- `tests/e2e/` or a dedicated `tests/perf/`
- `scripts/`
- `package.json`

### Acceptance

No optimization PR may claim a performance win without before/after numbers from the same deterministic scenario and build mode.

---

## 5. Phase 1 — Make the worker pipeline real and safe

**Priority: P0 / highest expected frame-time win**

### 5.1 Define worker-owned chunk jobs

Create an explicit worker pipeline for:

1. generation;
2. light-seed preparation where practical;
3. section meshing.

The main thread should own orchestration, visible scene state, input, simulation authority, and final GPU object creation. CPU-heavy pure/deterministic transforms should be workers.

### 5.2 Fix worker section ownership before enabling it

Replace current “each section result replaces the chunk” behavior with one of these models:

**Preferred:** stable per-section render slots.

- `ChunkRenderGroup` owns four 16³ section slots for a 16×64×16 chunk.
- each slot independently owns opaque/cutout/translucent/fluid geometries;
- a returned section updates only its own slot;
- chunk unload disposes all slots;
- a block edit invalidates one section (+ adjacent section where required).

Alternative: aggregate all returned sections into a chunk-generation result and attach once only after every required section has completed. This lowers draw calls but delays partial visibility and makes fine-grained edit rebuilds harder, so stable section slots are preferable.

### 5.3 Use transferable typed arrays

Do not transport `number[]` / object-heavy cell payloads.

- blocks: compact typed array matching block-id range;
- sky/block light: packed nibble/byte arrays;
- registry flags: cached worker-side tables initialized once;
- UVs/material classes: compact immutable lookup tables initialized once;
- mesh output: transferable typed arrays.

Do not rebuild `opaqueIds` for every section.

### 5.4 Correct cancellation/versioning

Every request/result must include:

- chunk packed key;
- section index;
- generation token;
- mesh/dirty version;
- request id.

The worker pool must support multiple in-flight chunks without a mutable global generation token that can accidentally invalidate unrelated requests.

### 5.5 Worker pool sizing

Default to a conservative pool such as:

`max(1, min(4, hardwareConcurrency - 1))`

Then benchmark. More workers are not automatically faster; too many can increase memory bandwidth contention and main-thread transfer pressure.

### Acceptance

- worker path enabled by default on supported browsers;
- no missing sections under out-of-order result completion;
- deterministic mesh parity tests pass;
- stale/cancel stress passes;
- p99 frame spikes during new-terrain traversal materially improve;
- no one-line fallback silently returns to sync meshing under ordinary supported configurations.

---

## 6. Phase 2 — Section-level dirty tracking and remesh coalescing

**Priority: P0**

### Design

Introduce a `SectionDirtyTracker` keyed by packed chunk/section id with flags such as:

- geometry dirty;
- lighting dirty;
- border X-/X+/Y-/Y+/Z-/Z+;
- queued/in-flight;
- superseded version.

For a single block edit:

1. dirty its 16³ section;
2. if the block is on a section boundary, dirty only the adjacent section that can expose/cull a face;
3. collect lighting invalidations;
4. wait until the coalescing point for the frame/tick;
5. submit at most one new mesh request per dirty section version.

Do not enqueue a full chunk mesh immediately from both `setBlock()` and the later light-drain path.

### Lighting integration

Short term:
- remesh only lighting-affected sections, not whole chunks.

Longer term:
- decouple lighting from geometry entirely where possible;
- consider a section light texture/volume or separately updateable vertex-light buffer;
- geometry should not be rebuilt if only light values changed and topology did not.

### Acceptance

A block edit in the middle of a section should rebuild one section, not 16,384 voxels of whole-chunk geometry. Repeated edits to the same section before worker completion should collapse into the newest version instead of generating a backlog.

---

## 7. Phase 3 — Replace the active mesher with an allocation-light production greedy mesher

**Priority: P1, after section ownership is correct**

### Do not directly promote the existing `GreedyMesher.ts` unchanged

It is valuable as a reference/correctness implementation but currently allocates nested arrays, objects, maps, and output quad objects per slice/build.

### Production implementation

Build an allocation-light section mesher that:

- uses flat typed scratch arrays for the 16×16 face mask;
- packs the complete merge signature into integers where feasible;
- reuses consumed bitsets/masks;
- emits directly into growable typed mesh builders;
- avoids intermediate `OpaqueFaceQuad[]` objects;
- samples lighting/AO only for the final merged quad corners;
- uses worker-local compact lookup tables instead of registry object lookups;
- handles opaque/cutout/translucent/fluid classes with clear merge rules.

### Neighbor data

Supply a one-cell halo (or six boundary planes) with each section payload so face culling/AO does not call through the main-thread world abstraction and does not require worker round trips.

### Acceptance

- golden visible-face equivalence against reference implementation;
- large reduction in triangles/vertices for flat terrain;
- lower worker CPU time and allocation rate;
- no merge across incompatible material/tint/animation/light-topology rules.

---

## 8. Phase 4 — Optimize terrain generation data flow

**Priority: P1**

### Chunk-local generation context

For every chunk generation request, create/reuse dense column caches for:

- height;
- biome id;
- climate fields needed downstream;
- spawn protected-region flag;
- surface metadata.

Trees and structures must consume this context rather than call `getHeightAt()` / `getBiomeAt()` again for columns already computed.

### Remove avoidable math

Replace radius checks such as:

```ts
Math.hypot(x, z) <= radius
```

with squared comparisons:

```ts
x * x + z * z <= radius * radius
```

in hot deterministic loops.

### Feature emission

Avoid allocating complete block arrays for every tree candidate when a callback/iterator or reusable template can stamp directly into the chunk.

### Noise

Profile before rewriting algorithms. If noise is still dominant after caching and workerization:

- batch/cache column noise;
- precompute octave constants;
- use typed scratch buffers;
- evaluate WASM only if profiling proves a worthwhile win after JS hot paths are cleaned up.

Do not change terrain output without an explicit world-version migration decision.

---

## 9. Phase 5 — Make simulation scale with entities/active chunks

**Priority: P1/P2**

### 9.1 Cache the simulating chunk set

Maintain one reusable active/simulating chunk-column list that updates only when the player crosses a chunk boundary or simulation distance changes.

Reuse it for:

- random ticks;
- passive/hostile spawn cycles;
- block entities;
- world life;
- other distance-gated simulation.

Avoid rebuilding string sets and coordinate arrays independently in each subsystem.

### 9.2 Random ticking

Refactor `RandomTickSelector` hot usage so it can write into caller-provided scratch output or invoke a callback rather than allocate arrays/tuples per section.

If parity allows it, batch one chunk's four vertical sections in one call. Keep deterministic hashing/order unchanged.

### 9.3 Item entities

Replace O(n²) pairwise merge with a spatial hash keyed by small world cells/chunks and item id. Nearby candidates only should be tested.

Replace `order.indexOf()`/`splice()` removal with:

- dense array + id→index map + swap-remove, if strict insertion order is not externally required; or
- linked/stable structure if insertion order is part of a contract.

Collection should query nearby spatial cells instead of snapshotting every live item.

### 9.4 Mob systems

Profile AI/pathfinding and renderer sync separately. Add cadence tiers:

- near player: full tick;
- medium: reduced AI cadence;
- far but simulating: coarse cadence;
- outside sim distance: no tick.

Do not call expensive pathfinding on every mob every tick. Cache paths and stagger repaths.

### 9.5 Catch-up policy

`FixedTickDriver` is capped, which is good, but after a long render stall several expensive simulation ticks can still land in one rendered frame. Add observability for catch-up counts and consider degrading non-authoritative/non-critical work (spawn scans, cosmetic sync, some AI thinking) when catch-up is active.

---

## 10. Phase 6 — Fix queue, key, and LRU data structures

**Priority: P2**

### Chunk pipeline

Current bounded arrays are small, so this is not P0. After architectural work:

- replace best/worst O(n) queue scans with a bounded binary heap or bucketed priority queues if profiling shows meaningful queue CPU;
- cache oldest timestamp rather than scanning every queue for monitoring;
- use packed numeric keys consistently on hot internal paths;
- retain string keys only at API/persistence/debug boundaries.

### Retry/falling/light queues

Replace `.shift()` queues with ring buffers/deques.

### LRU caches

Replace array-based access-order LRUs with O(1) structures. JavaScript `Map` reinsertion can implement a simple insertion-order LRU:

- `delete(key)` then `set(key, value)` to touch;
- evict `map.keys().next().value`.

If the cache value map must remain separate, use a linked index. Do not run `indexOf()` across up to 10,000 keys on every touch.

---

## 11. Phase 7 — Reduce physics/collision allocation

**Priority: P2, profile-gated**

Refactor `PlayerPhysics` / `CollisionResolver` to reuse scratch objects:

- caller-owned movement result;
- mutable/reused collision box;
- no `{ ...box }` copies in the hot loop;
- translate shape coordinates arithmetically instead of allocating world AABB objects;
- reusable medium/support records;
- module/class-level fixed fluid sample offsets.

The purpose is not to change collision behavior; it is to reduce 20-TPS garbage and improve GC consistency after the world pipeline no longer dominates.

---

## 12. Phase 8 — GPU/rendering optimization and adaptive quality

**Priority: P1/P2 depending on measured GPU bottleneck**

### Upload budgeting

`uploadBytesPerFrameCap` must become a real dispatch constraint. Before constructing/attaching geometry, queued completed worker meshes should pass through a GPU-upload queue with both:

- time budget;
- byte budget.

Do not upload several multi-megabyte geometry sets in one frame just because their workers completed together.

### Geometry lifetime

With section slots:

- replace only dirty section geometry;
- reuse `THREE.Mesh` objects and swap/dispose geometry where possible;
- avoid scene remove/add churn for every rebuild;
- keep material instances shared.

### Draw calls

Section meshes increase object count, so measure the tradeoff. Options if draw calls become limiting:

- merge stable neighboring section geometries opportunistically after streaming settles;
- use geometry groups/material grouping;
- consider multi-draw/indirect-style approaches only if browser/Three support and profiling justify complexity.

Do not sacrifice section-level update granularity prematurely just to minimize draw calls.

### Shadows

- restrict shadow casters to a near-player radius;
- terrain well beyond shadow distance should not cast shadows;
- benchmark PCFSoftShadowMap cost;
- update shadow camera region only when necessary.

### Adaptive DPR/quality

Add a slow-feedback controller based on sustained frame/GPU pressure:

1. reduce DPR within a floor/ceiling;
2. reduce shadow map/resolution or shadow distance;
3. disable/reduce secondary effects/cloud cost;
4. only then reduce render distance.

Avoid oscillation with hysteresis and multi-second sampling windows.

---

## 13. Phase 9 — Build/startup optimization

**Priority: P2/P3**

The app already splits Three.js into a vendor chunk, so bundle work is no longer the same issue described by the old audit.

Still measure:

- initial JS parse/eval;
- texture atlas generation;
- registry/data initialization;
- loading-screen first paint;
- first playable frame.

Potential work:

- lazy-load systems not needed for initial single-player spawn;
- avoid constructing dormant framework modules before needed;
- bundle analyze production output;
- defer non-critical UI/network/replay tooling initialization.

Do not pursue code splitting as a substitute for runtime CPU optimization.

---

## 14. Required tests for the optimization campaign

### Worker correctness

- out-of-order section completion;
- cancellation while in flight;
- edit while previous mesh is in flight;
- unload/reload while generation or mesh is in flight;
- worker crash/restart fallback policy;
- multiple chunks with different generation tokens concurrently.

### Mesh parity

- golden face/topology comparison against reference mesher;
- chunk-border culling;
- transparent/cutout/fluid boundaries;
- AO/light corner parity;
- section boundary edits;
- repeated edits coalesce to latest visible result.

### Worldgen determinism

- fixed seed hashes unchanged for representative chunk corpus;
- worker count/order does not change chunk output;
- trees/structures crossing chunk boundaries remain deterministic.

### Lighting

- emissive place/remove;
- skylight opening/closing;
- edits on section/chunk boundaries;
- no stale light-only update overwrites newer topology.

### Streaming stress

- sprint across chunk boundaries for several minutes;
- teleport repeatedly across distant areas;
- reverse direction at queue saturation;
- unload while retries/results are pending;
- no holes, duplicate meshes, leaked geometry, or stranded lifecycle records.

### Simulation

- random-tick replay hash unchanged;
- item merge result parity;
- entity removal/collection parity;
- active chunk cache updates correctly when crossing boundaries.

### Memory

- geometry count/heap plateau after travel-away/travel-back loop;
- no retained old typed arrays from worker transfer/result queues;
- cache caps verified under >10k edited/state chunks.

---

## 15. Recommended implementation sequence

### Campaign A — Measurement truth

1. Live browser performance harness.
2. Production benchmark scenarios.
3. Real frame metrics wired to release gate.
4. Baseline JSON checked into/report artifact workflow.

**Do not proceed to declaring optimization success without this campaign.**

### Campaign B — Main-thread evacuation

1. Correct per-section render ownership.
2. Correct worker request/version aggregation.
3. Transferable compact payloads.
4. Enable worker meshing.
5. Move terrain generation to worker jobs.
6. Add hard upload queue/budget.

Expected result: largest improvement in p95/p99 frame time while traversing new terrain.

### Campaign C — Invalidation reduction

1. Section dirty tracker.
2. Border-aware invalidation.
3. Edit/light coalescing.
4. Section-only geometry replacement.
5. Light-only update path where topology unchanged.

Expected result: large improvement during mining/building and lighting edits, lower GPU churn.

### Campaign D — Mesher/worldgen CPU efficiency

1. Flat allocation-light greedy mesher.
2. Worker lookup tables and halo input.
3. Chunk-local worldgen column context.
4. Eliminate repeated biome/height/radius work.
5. Remove tree/feature temporary allocations where material.

Expected result: faster worker turnaround, lower memory bandwidth and queue latency.

### Campaign E — Simulation scalability

1. Shared active chunk list.
2. Allocation-free/batched random ticks.
3. Spatial item-entity merge/collection.
4. Mob cadence/pathfinding profiling and throttling.
5. Physics scratch-object cleanup.

Expected result: stable 20 TPS with higher entity/world activity.

### Campaign F — GPU/adaptive quality

1. Real upload cap.
2. Stable mesh objects/geometry lifetime.
3. Shadow radius/caster tuning.
4. Adaptive DPR/effects.
5. Draw-call consolidation only if measured necessary.

---

## 16. File-by-file priority map

### P0

- `src/world/World.ts` — split orchestration from synchronous heavy work; section ownership; dirty coalescing; real upload queue.
- `src/rendering/WorkerMeshing.ts` — production worker transport/versioning.
- `src/engine/WorkerPool.ts` — robust pool/cancellation/telemetry.
- `src/world/ChunkMesher.ts` — remove from main-thread production path; eventually replace with section greedy builder.
- `src/world/TerrainGenerator.ts` — workerization + generation context.
- `src/rendering/RenderPerformanceMonitor.ts` — live benchmark metrics.
- `src/simulation/ReleasePerformanceGate.ts` — replace synthetic live-frame certification with measured bundle.

### P1

- `src/rendering/GreedyMesher.ts` — convert reference algorithm into flat allocation-light worker implementation.
- `src/rendering/LightUpdateEngine.ts` / `LightStorage.ts` — section dirty output and light/topology separation.
- `src/world/ChunkPipeline.ts` — section/job lifecycle + better stale/cancel semantics.
- `src/engine/Game.ts` — shared active-chunk list; catch-up telemetry; reduce duplicate subsystem scans.
- `src/simulation/RandomTickSelector.ts` — caller-owned scratch/callback API.
- `src/simulation/ItemEntityManager.ts` — spatial indexing and efficient removal.
- mob baseline/AI/render-sync modules — cadence and spatial scaling.
- `src/engine/Renderer.ts` — adaptive DPR/quality hooks and GPU metrics integration.

### P2

- `src/player/PlayerPhysics.ts`
- `src/world/CollisionResolver.ts`
- edit/state overlay LRU structures in `World.ts`
- retry/falling queue structures
- build/startup lazy-loading targets

---

## 17. Anti-goals / mistakes to avoid

1. **Do not just lower render distance** and call it optimized.
2. **Do not flip `useWorkers = true` without fixing section result ownership.**
3. **Do not keep full-chunk invalidation after adding workers.** Workers reduce main-thread cost but still waste CPU and delay visible updates if rebuild scope remains excessive.
4. **Do not trust synthetic performance fixtures as runtime certification.**
5. **Do not rewrite noise/physics in WASM before profiling shows the JavaScript implementation remains material after architectural fixes.**
6. **Do not trade determinism for speed without an explicit compatibility decision.**
7. **Do not add more queues without clear ownership/version semantics.** The current architecture already has pipeline + retry + dirty state; consolidation is preferable to another parallel backlog.
8. **Do not optimize draw-call count in isolation.** A whole-chunk mesh may reduce draw calls while making edits catastrophically expensive. Measure total frame/GPU behavior.
9. **Do not benchmark development mode.** Use the production Vite build in an actual browser.
10. **Do not accept average FPS as the primary metric.** p95/p99 frame time, long tasks, chunk latency, GC, and upload spikes matter more for perceived smoothness.

---

## 18. Definition of done

The optimization program is complete only when all of the following are true:

- current live-game benchmark scenarios are automated and reproducible;
- release performance gates consume real browser measurements for frame-critical dimensions;
- terrain generation does not perform large synchronous chunk work on the main thread;
- production meshing is worker-backed and deterministic;
- worker section results cannot overwrite sibling sections;
- block edits rebuild only the minimum affected section set;
- lighting changes do not automatically force unnecessary whole-chunk geometry rebuilds;
- GPU uploads are hard-budgeted per frame;
- active simulation chunk lists are reused instead of repeatedly rebuilt;
- item merging/collection no longer has whole-world O(n²)/O(n) behavior in common paths;
- long-session LRU/queue operations avoid repeated linear scans where they are hot;
- memory stabilizes under travel/edit stress;
- p95/p99 frame-time and chunk-load latency targets pass on declared hardware tiers;
- deterministic/correctness regression suites stay green.

---

## 19. Bottom line

The codebase has many individually thoughtful systems, but the performance architecture is currently **half-migrated**: workers, greedy meshing, budgeting, and release gates exist, while the actual production path still performs the most expensive work synchronously and invalidates at whole-chunk granularity.

The fastest route to a genuinely smooth game is therefore not a collection of small optimizations. It is to finish that migration:

**real measurement → worker-owned generation/meshing → stable section rendering → minimal dirty regions → coalesced lighting/geometry updates → scalable simulation → adaptive GPU quality.**

That sequence should be treated as the authoritative optimization roadmap.