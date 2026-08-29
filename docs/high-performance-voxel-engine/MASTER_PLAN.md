# High-Performance Voxel Engine — Implementation Master Plan

Status: **PLANNING PACKAGE — DO NOT ACTIVATE WHILE CHANGE 253 IS ACTIVE**

Repository: **quantdale/clone-MC_v3**

Authoritative target: transform the existing browser voxel engine into a substantially more scalable, low-stutter, worker-driven architecture while preserving gameplay correctness, deterministic world generation, save compatibility, voxel readability, and current visual quality.

This plan is intentionally repository-specific. It is not a generic transcription of the IGoByLotsOfNames Unity architecture and it does not require migrating the project to Unity, DOTS, Burst, WebGPU, Rust, or a new engine.

---

## 0. Control-plane and sequencing contract

At the time this plan was written:

- current active change: **253-live-world-architecture-convergence**
- Change 253 status: **ACTIVE**
- Change 254: **VERIFIED**
- next free post-terminal number is expected to be **255**, but the executor MUST re-read the repository control plane before assuming that number is still free.

Repository rules in AGENTS.md, openspec/AUTONOMOUS_GOAL.md, openspec/PROGRAM_STATE.json, openspec/CHANGE_SEQUENCE.md, openspec/CHANGE_SEQUENCE_OVERRIDES.md, openspec/REVIEW_HANDOFF.md, and openspec/SPEC_AUTHORING_PROTOCOL.md remain authoritative.

This performance campaign MUST NOT begin production implementation while Change 253 is incomplete. A future executor may prepare specifications in advance, but production code for this campaign begins only after Change 253 satisfies its advancement gate and the performance campaign has been activated under the next free numbered change.

The future numbered change should be named approximately:

**255-high-performance-voxel-engine**

Do not hard-code 255 if the sequence has moved. Use the next free owner-authorized number.

---

# 1. Mission

The goal is not merely to increase an FPS counter in an easy static scene. The goal is to make Clone MC V3 behave like a modern data-oriented voxel engine under the workloads that currently hurt it most:

- cold world startup;
- rapid exploration into never-generated terrain;
- repeated chunk load/unload cycles;
- fast camera rotation across dense terrain;
- forests and alpha-tested foliage;
- water-heavy coastlines;
- continuous block editing at section boundaries;
- lighting invalidation;
- long sessions;
- high render-distance configurations;
- eventual live multiplayer world streaming.

The architecture should converge on:

~~~text
Player / Camera
      |
      v
Visibility- and movement-aware streaming scheduler
      |
      +------------------+------------------+
      |                  |                  |
      v                  v                  v
 Full voxel          Coarse voxel       Far surface
 near field             LOD               LOD
      |                  |                  |
      +------------------+------------------+
                         |
                         v
                bounded priority work
                         |
           +-------------+-------------+
           |                           |
           v                           v
   world-generation workers       mesh workers
           |                           |
           +-------------+-------------+
                         |
                         v
                 CPU mesh-ready queue
                         |
                         v
                  GPU upload scheduler
                         |
                         v
                 Three.js / WebGL renderer
~~~

The primary rule is simple:

**Expensive world computation must not compete with input and rendering on the browser main thread unless there is no safe alternative.**

---

# 2. Verified repository baseline

The repository already contains many of the foundations needed for this campaign.

## 2.1 Existing systems to preserve and promote

Relevant existing code includes:

- src/engine/WorkerPool.ts
- src/rendering/WorkerJobProtocol.ts
- src/rendering/WorkerMeshing.ts
- src/rendering/MeshWorkerEntry.ts
- src/rendering/GreedyMesher.ts
- src/world/ChunkMesher.ts
- src/world/ChunkSection.ts
- src/world/ChunkColumn.ts
- src/world/CanonicalWorldStorage.ts
- src/world/VerticalWorldAccess.ts
- src/world/ChunkPipeline.ts
- src/world/ChunkStatus.ts
- src/world/ChunkTicket.ts
- src/rendering/RenderBudget.ts
- src/rendering/RenderPerformanceMonitor.ts
- src/rendering/MemoryResourceBudget.ts
- src/rendering/AmbientOcclusion.ts
- src/rendering/VertexLighting.ts
- src/rendering/FluidSurfaceMesher.ts
- src/rendering/LightStorage.ts
- src/rendering/LightUpdateEngine.ts
- src/world/TerrainGenerator.ts
- deterministic worldgen regression infrastructure
- fixed-tick simulation infrastructure
- voxel DDA interaction
- AABB voxel physics
- deterministic networking primitives and codecs

These systems are strategic assets. Do not replace them with a second competing architecture unless measurements and an ADR demonstrate that replacement is necessary.

## 2.2 Important current limitations

The live game still contains performance-relevant legacy behavior:

1. **Worker meshing is disabled in World.ts.**
   The current production path keeps useWorkers false.

2. **The current synchronous path still meshes legacy 16×64×16 slabs.**
   This is too coarse a remesh/culling unit for the architecture that Change 253 is converging toward.

3. **The worker mesher is not production-safe merely by toggling it on.**
   It currently processes 16³ section-local data without a complete neighboring voxel/light halo. Out-of-section samples are effectively treated as absent/air, which can create redundant boundary geometry and incorrect shading assumptions.

4. **The current worker kernel is opaque-oriented.**
   The production renderer must preserve the four rendering classes:
   - opaque;
   - cutout;
   - translucent;
   - fluid.

5. **Worker request payloads use heavyweight JavaScript arrays.**
   Per-job cells, skylight, block light, and registry-derived lists should move toward transferable typed arrays and static worker-side registry tables.

6. **Terrain generation remains capable of consuming material main-thread budget.**
   Deterministic generation is an excellent worker candidate.

7. **Meshing completion and GPU upload are still too tightly coupled.**
   Off-thread meshing alone will not prevent stalls if a burst of BufferGeometry creation/uploads lands on the main thread in one frame.

8. **Render distance remains fundamentally full-detail.**
   Increasing ordinary chunk radius cannot produce kilometer-scale visibility economically. A separate far-terrain representation is required.

9. **Renderer resolution can become expensive at high device pixel ratio.**
   A maximum DPR of 2 can make a nominal 1080p viewport render close to 4K internally on high-DPI displays.

---

# 3. Non-negotiable invariants

Every phase must preserve the following unless a separately approved product change says otherwise.

## Correctness

- Same world seed and generation version must produce identical canonical terrain.
- Existing saves must load without data loss or silent regeneration.
- Block edits must never disappear, duplicate, or apply to stale chunks.
- Lighting changes must not attach stale section meshes.
- Worker cancellation and stale-result rejection must remain exact.
- A chunk/section unload must release or intentionally bounded-cache CPU and GPU resources.
- No hidden interior face optimization may make legitimate visible faces disappear.

## Gameplay

- Mining, placement, collisions, step-up, swimming, fluids, mobs, block entities, furnace state, survival, and simulation must remain behaviorally compatible.
- No performance shortcut may reduce simulation correctness merely to improve render FPS.
- Simulation distance and render distance remain separate concepts.

## Visuals

- No solution may simply disable the visual layer to claim performance success.
- Existing lighting, per-vertex light, voxel ambient occlusion, biome tint, transparent materials, fluids, day/night, fog, clouds, and shadows must remain at least equivalent on the same quality tier unless a measured tier redesign explicitly replaces them.
- Visual quality changes need golden-image or targeted visual evidence.
- High-cost effects may be tiered, but Medium must remain visually coherent and attractive.

## Architecture

- Canonical ChunkColumn/ChunkSection world state wins over compatibility projections.
- Workers receive versioned immutable snapshots and may not mutate canonical world state directly.
- Main-thread integration is transactional: stale or partial batches never become visible.
- Every queue is bounded.
- Every asynchronous job has cancellation and generation/version semantics.
- Every new optimization has instrumentation sufficient to prove it helps.

---

# 4. Performance acceptance model

Do not optimize from anecdotes. Establish repeatable baselines first.

## 4.1 Mandatory benchmark scenes

Create or extend deterministic release-build benchmarks for:

1. **Cold spawn**
   - fresh world;
   - no warm caches;
   - time from app ready to controllable safe world.

2. **Straight-flight streaming**
   - deterministic seed;
   - continuous forward motion at 2× and 4× sprint;
   - minimum 120 seconds.

3. **Spin stress**
   - dense terrain;
   - rapid 360-degree repeated camera rotation.

4. **Edit storm**
   - place/break approximately 20 blocks/second;
   - intentionally cross horizontal and vertical section boundaries.

5. **Lighting storm**
   - repeated opaque/emissive changes in a compact region.

6. **Forest**
   - dense foliage/cutout geometry and overdraw.

7. **Water coast**
   - large visible translucent/fluid surfaces.

8. **Long traversal**
   - move outward, return, repeat;
   - verify resource convergence.

9. **LOD horizon**
   - once LOD exists, measure stationary horizon and fast travel transitions.

## 4.2 Metrics

Record at minimum:

- commit SHA;
- browser and version;
- OS;
- CPU;
- GPU / renderer backend string;
- resolution;
- actual render-buffer resolution;
- DPR / dynamic resolution scale;
- quality tier;
- render distance;
- simulation distance;
- seed;
- benchmark scene;
- warmup and measured duration;
- frame p50 / p95 / p99;
- average FPS;
- long frames over 25 ms and 50 ms;
- main-thread scripting time if obtainable;
- generation queue depth and oldest age;
- mesh queue depth and oldest age;
- upload queue depth and oldest age;
- worker utilization;
- worker stale/cancelled result counts;
- bytes uploaded per frame;
- draw calls;
- triangles;
- live geometries;
- live textures;
- estimated geometry memory;
- loaded columns/sections;
- retained memory/resource delta after traversal.

## 4.3 Initial targets

Treat these as acceptance targets to prove on available hardware, not fabricated claims.

For Medium 1080p on a reasonable mid-tier discrete GPU or strong modern iGPU:

- frame p95 <= 16.7 ms during steady ordinary play;
- frame p99 <= 25 ms outside explicit stress;
- no recurring >50 ms frame spikes from generation/meshing;
- main-thread world work should normally fit comfortably below half the 16.7 ms frame;
- GPU upload work target <= 1.5 ms p95 per frame;
- visible-near mesh queue age p95 < 500 ms;
- block-edit-to-visible-remesh p95 < 100 ms near the player;
- worker generation+meshing throughput must exceed consumption during sustained 2× sprint traversal;
- after round-trip exploration and cache settling, retained world/render resources should converge within +15% of the initial settled baseline;
- no monotonic geometry/texture growth.

The campaign must report measured numbers before and after each major architecture phase.

---

# 5. Phase 0 — Baseline and observability hardening

Before changing the fast path:

1. Wire RenderPerformanceMonitor into the real release composition wherever metrics are currently partial.
2. Verify renderer.info is sampled after world rendering.
3. Track:
   - draw calls;
   - triangles;
   - geometry count;
   - texture count;
   - mesh build CPU time;
   - GPU upload bytes;
   - all streaming queue depths;
   - oldest queue age;
   - worker pool utilization;
   - discarded stale jobs.
4. Add benchmark export format suitable for before/after comparison.
5. Pin deterministic benchmark seeds and camera routes.
6. Run the full baseline on the current live path.
7. Archive raw baseline results under the future OpenSpec change verification evidence.

No major optimization phase may be declared successful without comparison against this baseline.

---

# 6. Phase 1 — Make worker meshing correct before making it live

This is the first major implementation target.

## 6.1 Do not flip useWorkers blindly

The current worker path is experimental. It must first become output-equivalent to the canonical synchronous renderer for all supported block render classes.

## 6.2 Add a one-voxel section halo

The worker must not interpret every out-of-section coordinate as air.

Replace a core-only concept:

~~~text
16 × 16 × 16
~~~

with a snapshot that can answer all immediate neighbor and corner-shading queries:

~~~text
18 × 18 × 18 logical sample volume
= 16³ core + 1-cell halo on every side
~~~

An implementation may physically store an 18³ dense array, or use a compact core plus six faces/twelve edges/eight corners, but the API exposed to the mesher must behave as a complete one-cell halo.

The halo must include enough information for:

- face visibility against adjacent sections;
- sky light;
- block light;
- ambient-occlusion occupancy;
- render layer/classification where needed.

Only the central 16³ section emits geometry. Halo cells are read-only context.

## 6.3 Snapshot consistency

The worker request must capture canonical version state for:

- target section;
- six face-neighbor sections;
- light versions needed by shading.

If any dependency changes before integration, reject the batch and resubmit.

The existing SectionVersionSnapshot system should remain the basis rather than inventing another stale-token mechanism.

## 6.4 Complete render-layer support

The worker path must produce all live streams:

- opaque;
- cutout;
- translucent;
- fluid.

Recommended rules:

### Opaque
Use greedy merging with a merge signature that includes all visible-material invariants needed for correctness.

### Cutout
Greedy merge only when texture/material/light/tint/animation semantics remain correct. Template/model blocks may use template geometry instead.

### Translucent
Use conservative face generation unless a proven merge policy preserves sorting/material behavior.

### Fluid
Use the existing FluidSurfaceMesher semantics or an equivalent worker-safe extraction path. Do not treat water as ordinary opaque cubes.

## 6.5 Greedy merge correctness

The merge signature must prevent invalid merges across differences in:

- block/material identity;
- face texture/layer;
- orientation;
- tint class;
- animation class;
- render layer;
- any shading property whose interpolation would materially change the intended output.

The existing greedy mesher deliberately computes lighting/AO at the emitted merged quad corners. Validate that this remains visually equivalent to the intended voxel shading across long quads and section boundaries.

## 6.6 Required tests

Add deterministic fixtures for:

- solid section surrounded by solid neighbors: no interior boundary faces;
- solid section next to air: correct exterior faces;
- horizontal and vertical section boundaries;
- checkerboard boundaries;
- water touching water across sections;
- water touching solid/air;
- glass/translucent boundaries;
- foliage/cutout;
- mixed block textures;
- biome-tint boundary;
- light gradient across section boundary;
- AO corner cases across section edge/corner;
- block edit invalidating only required sections;
- stale result after neighbor edit;
- worker crash/retry;
- cancellation on unload;
- duplicate result;
- malformed result;
- golden geometry equivalence against the accepted synchronous reference.

## Exit gate

Worker meshing must be correctness-equivalent before it can become the default live path.

---

# 7. Phase 2 — Replace heavyweight worker messages with transferable typed data

After correctness:

## 7.1 Worker initialization tables

Send stable registry-derived tables to each worker at initialization rather than rebuilding metadata for every section request.

Potential worker-side tables:

- block flags: opaque / cutout / translucent / fluid / emissive;
- top/side/bottom texture layer identifiers;
- tint class;
- animation class;
- block/model class;
- light emission where needed.

These should use dense IDs and typed arrays where practical.

## 7.2 Voxel payload

Move from Array<number|null> to a typed representation.

Preferred initial representation:

- Uint16Array for block/state IDs if the live ID domain fits;
- reserve zero for air where compatible;
- preserve canonical block-state identity if the current world architecture requires more than block ID.

Do not force Uint8 if the canonical state space can exceed 255.

## 7.3 Lighting payload

Sky and block light are each 0..15, so they can be packed:

~~~text
high nibble: sky light
low nibble: block light
~~~

Use a Uint8Array when this measurably reduces transfer/allocation overhead and does not complicate correctness.

## 7.4 Transfer ownership

Use postMessage transfer lists for buffers.

Worker inputs and outputs should avoid deep structured cloning of thousands of JavaScript numbers.

## 7.5 Pooling

Only add reusable ArrayBuffer pools after measuring allocation/GC pressure. Do not prematurely introduce complex ownership reuse if transferables are sufficient.

## Exit gate

The typed transfer path must reduce allocation/serialization overhead without changing rendered output or stale-result safety.

---

# 8. Phase 3 — Workers produce GPU-ready streams

The worker should eventually perform all pure CPU geometry work.

Preferred output per render stream:

- positions;
- normals or compact face encoding;
- UVs or texture-layer IDs;
- sky/block light;
- AO;
- tint;
- indices;
- bounding metadata;
- exact byte counts.

The main thread should not expand a quad list into another large set of temporary JavaScript objects.

Target path:

~~~text
canonical snapshot
 -> worker
 -> visibility
 -> greedy/template/fluid extraction
 -> final typed vertex/index streams
 -> transferable ArrayBuffers
 -> main-thread BufferGeometry attachment
 -> bounded GPU upload
~~~

The main thread remains responsible for:

- validating versions;
- THREE.BufferGeometry creation;
- binding attributes;
- scene attachment;
- safe swap;
- disposing replaced resources;
- final renderer submission.

## Required optimization discipline

Avoid per-quad/per-vertex object allocation in worker hot loops.

Use:

- dense typed output builders;
- growable buffers with controlled resizing;
- integer loop arithmetic;
- precomputed face tables;
- registry lookup arrays;
- reusable scratch storage.

Measure before introducing unsafe or WASM code.

---

# 9. Phase 4 — Make 16³ ChunkSection the live render/remesh unit

This phase must build on the convergence work of Change 253.

The desired canonical rendering relationship is:

~~~text
ChunkColumn
  -> lazy ChunkSection 16³
      -> independent mesh lifecycle
      -> independent invalidation/version
      -> independent frustum bounds
~~~

The legacy 16×64×16 Chunk projection must not remain the authoritative hot rendering unit.

## Benefits

- one block edit invalidates a smaller geometry region;
- vertical culling becomes meaningful;
- worker jobs are smaller and more parallel;
- mesh uploads are smaller;
- air sections cost little or nothing;
- far-terrain LOD can align to section/macro-section boundaries;
- lighting invalidation can target exact section dependencies.

## Requirements

- per-section mesh version;
- per-section light version;
- face-neighbor dependency snapshot;
- scene object bounds from exact section world coordinates;
- no accidental one-mesh-per-block behavior;
- render streams remain material grouped;
- empty sections emit no geometry and preferably no THREE object.

## Section-border edit contract

An edit in the interior of a section ordinarily invalidates that section's mesh and lighting dependencies only.

An edit on a face may invalidate the adjacent section.

An edit on an edge/corner may affect shading dependencies in more than one neighbor. The invalidation algorithm must be explicitly tested rather than conservatively remeshing an entire column/world.

---

# 10. Phase 5 — Move deterministic world generation to workers

TerrainGenerator is designed around deterministic seed + coordinates and is therefore a strong worker candidate.

## Worker input

At minimum:

- world seed;
- generation version;
- dimension identity/settings;
- column coordinates;
- any static registry/worldgen tables initialized once.

## Worker output

Prefer canonical section-oriented data:

- generated section block/state buffers;
- heightmap data needed by downstream systems;
- biome/climate data where persistently useful;
- generation metadata/version;
- feature/structure results required for deterministic integration.

## Determinism

Worker scheduling order must not change terrain.

Cross-column features must remain:

- owner-region deterministic; or
- independently reproducible from coordinates/seed; or
- committed through deterministic conflict resolution already defined by worldgen.

Existing worldgen regression matrices must pass unchanged unless an intentional worldgen version change is separately authorized.

## Generation pipeline

Target:

~~~text
stream request
 -> generation worker
 -> canonical column/sections ready
 -> light seed/update
 -> mesh worker
 -> mesh-ready queue
 -> upload
~~~

Generation worker completion may not directly mutate scene state.

## Worker pool strategy

A single shared pool may service generation and meshing with explicit priority classes, or separate small pools may be justified if benchmark data shows starvation.

Do not consume every logical CPU core.

Start from the repository's conservative model:

~~~text
clamp(hardwareConcurrency - 2, 1, 4)
~~~

then benchmark.

Gameplay-critical near-visible meshing should normally outrank speculative far worldgen.

---

# 11. Phase 6 — Decouple CPU mesh completion from GPU upload

Workerization does not solve GPU/main-thread stalls if dozens of completed meshes are attached in one frame.

Introduce a real **mesh-ready/upload queue**.

## Mesh-ready record

Each record should carry:

- section identity;
- generation/version snapshot;
- render stream buffers;
- byte size;
- priority;
- time ready;
- bounds;
- LOD level;
- replacement geometry handle if applicable.

## Upload scheduler

Admit uploads according to:

- visible near sections first;
- collision/gameplay neighborhood;
- forward movement corridor;
- current camera frustum;
- age starvation prevention;
- configured byte cap;
- configured elapsed-time cap.

Maintain both:

- hard bytes/frame safety cap;
- time-aware main-thread upload budget.

Initial Medium target:

- approximately <= 1.5 ms p95 upload work/frame;
- no ordinary frame should consume a large burst merely because many workers finish simultaneously.

## Atomic swap

For remesh:

1. keep old visible geometry until replacement is ready;
2. validate version;
3. create/bind new geometry;
4. attach new geometry;
5. remove old geometry;
6. dispose old buffers;
7. update accounting.

Never show half a section's new render streams while siblings are stale/failed if the batch contract requires atomic visual replacement.

---

# 12. Phase 7 — Visibility- and movement-aware streaming priority

Distance alone is insufficient.

Create a score that can incorporate:

- Euclidean/Chebyshev distance;
- current camera frustum;
- camera forward dot product;
- player movement direction;
- collision/simulation criticality;
- interaction target proximity;
- already-visible hole prevention;
- job age;
- LOD level;
- preload/speculative status.

Conceptually:

~~~text
highest:
  near visible + player safety + forward corridor

then:
  visible side terrain
  near simulation dependencies
  interaction dependencies

then:
  rear terrain
  far LOD refresh

lowest:
  speculative preload
~~~

The exact weights must be benchmarked.

## Hysteresis

Keep load/unload hysteresis and add LOD hysteresis to prevent rapid thrashing when crossing distance thresholds.

---

# 13. Phase 8 — Hierarchical far-terrain LOD

This is the architectural requirement for kilometer-scale visibility.

Do not attempt an 8 km horizon by loading ordinary full-detail interactive sections out to 8 km.

## 13.1 Representation tiers

Use measured thresholds, but the intended structure is:

### LOD0 — interactive full voxels

Approximate range: near player, e.g. 0–128 m or another benchmarked radius.

- canonical 1 m voxels;
- caves;
- structures;
- block entities;
- full lighting;
- collision;
- interaction;
- simulation where inside simulation distance.

### LOD1 — coarse voxel

Approximate range: 128–512 m.

- 2 m or 4 m representative cells;
- preserve surface silhouette and major materials;
- no gameplay simulation;
- no block interaction;
- derived deterministically from canonical generation functions/data.

### LOD2 — macro terrain

Approximate range: 512 m–2 km.

- 4–16 m cells or compact height/macro mesh;
- preserve terrain shape, biome color, large water bodies, tree massing if cheap;
- aggressively merged.

### LOD3 — far surface / horizon

Approximate range: 2–8 km.

- surface-only heightfield or clipmap-like representation;
- no underground voxel volume;
- derived directly from seed/worldgen height/biome functions;
- extremely low draw/submission count.

Thresholds are examples, not requirements. Choose measured values.

## 13.2 Why surface-only far terrain

At kilometer distances, caves and underground voxels are invisible.

Representing them wastes:

- memory;
- generation work;
- mesh work;
- transfer bandwidth;
- GPU vertices.

Far LOD should therefore use the minimum world representation required to preserve horizon geometry and biome identity.

## 13.3 Deterministic convergence

The same seed/generation version must drive all LOD levels.

As a location approaches the player:

~~~text
LOD3 surface
 -> LOD2 macro
 -> LOD1 coarse voxel
 -> LOD0 canonical voxel
~~~

Visible differences must be controlled.

## 13.4 Transition seams

Use one or more of:

- power-of-two aligned grids;
- skirts;
- overlapping rings;
- dither/fade transition;
- snapped shared-edge vertices;
- geomorphing if justified.

Do not permit cracks, floating seams, or large terrain pops.

## 13.5 Edit visibility

Player edits need not rewrite the entire far terrain hierarchy instantly.

Define an edit propagation policy:

- near LOD always exact;
- mid LOD may rebuild affected macro tiles;
- very distant terrain may ignore small edits below visible scale;
- large edits/structures should invalidate corresponding far tiles if their silhouette materially changes.

This policy must be explicit and deterministic.

---

# 14. Phase 9 — GPU data packing and terrain shader

Do this only after workerization and upload scheduling are proven.

The current MeshLambertMaterial path is simple and maintainable. Do not replace it prematurely.

However, voxel geometry contains highly compressible attributes:

- local section position is small integer range;
- face normal has six directions;
- sky light has 16 values;
- block light has 16 values;
- AO has four values;
- texture layer is integer;
- tint can be quantized if quality remains acceptable.

Potential packed layout can reduce geometry memory and GPU bandwidth.

## Staged approach

### Stage A
Keep Float32 GPU attributes but eliminate JS object/clone overhead.

### Stage B
Normalize selected scalar attributes into Uint8/Uint16 BufferAttributes.

### Stage C
Introduce a dedicated terrain ShaderMaterial or carefully controlled shader customization that reconstructs:
- face normals;
- light response;
- AO;
- tint;
- texture addressing.

### Stage D
If texture-atlas bleeding or greedy UV repetition becomes limiting, evaluate texture arrays on WebGL2.

Every step requires visual golden comparison and GPU/frame measurement.

---

# 15. Phase 10 — Dynamic render resolution

Do not let devicePixelRatio silently multiply pixel cost beyond what the frame budget can sustain.

Introduce a render scale independent from CSS viewport size.

Possible allowed scales:

- 0.75;
- 1.0;
- 1.25;
- 1.5;
- higher only on hardware with sustained headroom.

Use hysteresis and slow adjustment based on frame-time statistics.

Requirements:

- UI remains rendered at appropriate sharpness;
- world scale changes do not cause oscillation every few frames;
- quality tier defines min/max scale;
- explicit user override remains possible;
- visual tests cover resolution transitions.

This can provide substantial GPU headroom without reducing world complexity.

---

# 16. Phase 11 — Visual upgrades only after the frame architecture is stable

The campaign must not trade the existing visual layer away, but expensive graphics should be added in a controlled tiered manner.

## Keep as baseline

- per-vertex voxel AO;
- sky/block light;
- biome tint;
- day/night;
- fog;
- current shadow baseline where affordable;
- water transparency;
- cloud/environment presentation.

## High-value visual upgrades

Once performance headroom exists:

1. improved atmospheric horizon synchronized with far LOD;
2. water Fresnel response;
3. depth-based water tint;
4. subtle flow/normal distortion on High;
5. stabilized shadow camera;
6. better shadow cascade strategy only if measured;
7. optional screen-space light shafts on High/Ultra;
8. optional SSAO only if voxel AO is insufficient in a demonstrated scene.

## Explicit non-goals for baseline

Do not make these mandatory for Medium:

- full volumetric ray marching;
- planar water reflections;
- heavy deferred pipeline rewrite;
- mandatory TAA;
- motion blur;
- depth of field;
- bloom-heavy presentation.

TAA in particular can soften voxel edges and cause ghosting. It is an experiment, not a required modernization checkbox.

---

# 17. Phase 12 — WASM/SIMD only for proven kernels

JavaScript is not automatically the primary bottleneck.

Do not port hot code to Rust/WASM until workerized typed-array JavaScript is benchmarked.

Potential later WASM candidates:

- greedy meshing;
- voxel LOD downsampling;
- noise/worldgen;
- large light-propagation kernels.

A WASM migration requires evidence that:

- CPU kernel time is material after workerization;
- JS/typed arrays remain the bottleneck;
- transfer/marshal overhead does not erase the gain;
- determinism remains identical;
- build complexity is acceptable.

SharedArrayBuffer similarly requires an ADR and measured benefit over transferable buffers.

---

# 18. Networking alignment

The performance architecture should remain compatible with the existing deterministic networking stack.

Future live multiplayer world sync should prefer:

~~~text
server:
  seed
  generation version
  authoritative entity state
  block-edit deltas
  persistent authoritative changes

client:
  deterministic base generation
  local render LOD
  applies authoritative deltas
~~~

A handshake must include terrain generation/version identity. A seed alone is insufficient if client and server generation algorithms differ.

Far LOD is presentation-only and never becomes authoritative simulation state.

---

# 19. Draw-call and culling policy

## Keep

- meaningful section-level frustum culling;
- distance/LOD culling;
- FrontSide/backface GPU culling;
- material grouping.

## Do not automatically copy directional submesh splitting

Splitting every section into six direction meshes can reduce vertex shading but multiply draw calls.

Only implement direction-partitioned submission if profiling proves:

- vertex processing/overdraw is the bottleneck;
- added draw calls do not make CPU submission worse.

## Occlusion culling

Do not implement per-section WebGL occlusion queries by default.

Evaluate coarse HZB/occlusion only after:
- section frustum culling;
- LOD;
- greedy meshing;
- draw-call consolidation

are already measured and insufficient.

---

# 20. Memory and resource ownership

Create or extend an explicit accounting ledger for:

- canonical section block/state buffers;
- compatibility projections during migration;
- light storage;
- worker request buffers;
- worker result buffers;
- mesh-ready buffers;
- THREE.BufferGeometry attributes/index buffers;
- materials;
- textures;
- LOD tile caches;
- entities;
- particles;
- audio resources.

Every resource must have an owner and release condition.

## Required stress test

Repeat:

1. start at origin;
2. travel N chunks;
3. return;
4. travel a different direction;
5. return;
6. repeat at least five cycles;
7. allow queues to drain and GC opportunities;
8. verify resource counts settle.

A staircase that never converges is a release blocker.

---

# 21. Suggested implementation file map

The executor should adapt to the post-253 repository state, but likely areas include:

## Existing files to evolve

- src/world/World.ts
- src/world/ChunkManager.ts
- src/world/ChunkPipeline.ts
- src/world/ChunkSection.ts
- src/world/ChunkColumn.ts
- src/world/ChunkMesher.ts
- src/world/TerrainGenerator.ts
- src/engine/WorkerPool.ts
- src/engine/Renderer.ts
- src/rendering/WorkerMeshing.ts
- src/rendering/WorkerJobProtocol.ts
- src/rendering/MeshWorkerEntry.ts
- src/rendering/GreedyMesher.ts
- src/rendering/FluidSurfaceMesher.ts
- src/rendering/RenderBudget.ts
- src/rendering/RenderPerformanceMonitor.ts
- src/rendering/MemoryResourceBudget.ts
- src/config/index.ts

## Likely new modules

Names are suggestions only:

- src/rendering/SectionMeshSnapshot.ts
- src/rendering/MeshReadyQueue.ts
- src/rendering/GpuUploadScheduler.ts
- src/worldgen/WorldgenWorkerEntry.ts
- src/worldgen/WorkerWorldGeneration.ts
- src/world/LodManager.ts
- src/world/LodTile.ts
- src/world/LodDownsampler.ts
- src/rendering/FarTerrainRenderer.ts
- src/rendering/TerrainMaterial.ts
- src/rendering/DynamicResolutionController.ts
- src/performance/VoxelBenchmarkHarness.ts

Do not create abstractions solely because this list names them. Consolidate with existing modules where that is cleaner.

---

# 22. Campaign breakdown

The future OpenSpec package should turn this master plan into smaller verifiable task groups.

Recommended implementation order:

## Campaign A — Baseline and worker-mesh correctness
- benchmark baseline;
- halo snapshots;
- complete render-layer worker output;
- parity/golden tests.

## Campaign B — Typed transfers and GPU-ready output
- registry initialization tables;
- typed section/light payloads;
- transferable buffers;
- final worker mesh streams.

## Campaign C — Live 16³ section rendering
- section render ownership;
- section invalidation;
- live worker meshing default;
- sync fallback retained temporarily.

## Campaign D — Workerized world generation
- deterministic worker entry;
- priority scheduling;
- canonical integration;
- worldgen regression.

## Campaign E — GPU upload decoupling
- mesh-ready queue;
- upload bytes/time budget;
- atomic geometry swaps;
- disposal/accounting.

## Campaign F — Streaming intelligence
- camera/movement-aware priorities;
- starvation prevention;
- hysteresis.

## Campaign G — Far-terrain LOD
- LOD data contract;
- coarse voxel tiers;
- far surface tiles;
- transitions;
- edit invalidation policy.

## Campaign H — GPU compaction and dynamic resolution
- packed attributes only if measured;
- dedicated terrain shader if justified;
- dynamic resolution controller.

## Campaign I — Visual headroom and final certification
- atmosphere/water improvements;
- optional high-tier effects;
- long-run memory;
- release hardware matrix;
- before/after dossier.

A single numbered OpenSpec change may contain all groups if it remains manageable, but the task structure must preserve these gates. Do not enable later architecture before the prerequisite layer is validated.

---

# 23. Feature flags and rollback strategy

Every risky fast path should initially have a controlled switch.

Examples:

- worker section meshing;
- worker worldgen;
- GPU-ready worker stream path;
- LOD manager;
- dynamic resolution;
- packed terrain shader.

Rules:

1. fallback path must remain usable during validation;
2. feature flag must not fork canonical gameplay state;
3. after a fast path is certified and fallback is no longer needed, delete obsolete duplicate code rather than carrying permanent architecture debt;
4. rollback must never require save migration reversal.

---

# 24. Test strategy

## Unit

- halo indexing;
- merge signatures;
- boundary face culling;
- render-layer routing;
- packed light encode/decode;
- typed payload validation;
- stale version rejection;
- queue priority;
- starvation prevention;
- upload budget;
- LOD sampling/downsampling;
- LOD transition selection;
- dynamic resolution controller.

## Integration

- worker pool + mesh worker;
- generation worker + canonical storage;
- section edit -> invalidation -> worker -> upload -> visible;
- vertical neighbor edits;
- unload during job;
- reload after cancellation;
- context loss/recovery;
- save/load with worker pipeline active.

## Golden

- worker vs reference geometry;
- lighting/AO edge fixtures;
- screenshots by quality tier;
- LOD seam scenes;
- water/foliage scenes.

## Performance

- all benchmark scenes from Section 4;
- worker saturation;
- long traversal memory;
- render-distance scaling;
- LOD scaling.

## Full gate

At final verification, at minimum run the repository-required commands:

~~~text
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
~~~

plus the new performance and long-session harnesses defined by the activated change.

---

# 25. Explicit anti-patterns

The executor MUST NOT:

- solve FPS by drastically lowering default render distance and calling the campaign complete;
- disable shadows, clouds, fluids, lighting, AO, or entities globally to claim success;
- set useWorkers true without fixing worker correctness first;
- treat a 16³ worker section boundary as air;
- move THREE objects into workers;
- create a GameObject/object per voxel equivalent;
- allocate large nested JS arrays in hot loops when typed data is appropriate;
- use unbounded queues;
- apply stale worker results;
- block the main thread waiting synchronously for workers;
- upload every ready mesh in one frame;
- generate full underground voxel volumes for the 8 km horizon;
- implement WebGPU as a prerequisite;
- port the entire project to another engine/language;
- add SharedArrayBuffer complexity before transferable-buffer benchmarks;
- add WASM because it sounds fast without profiling;
- split every section into many draw calls without measuring submission cost;
- implement heavy post-processing before the world pipeline is stable;
- sacrifice determinism, persistence, or multiplayer compatibility for FPS.

---

# 26. Definition of done

This campaign is complete only when all of the following are true:

1. Change 253 has already been verified and the performance campaign was activated legitimately.
2. The live rendering unit is section-oriented and consistent with canonical world storage.
3. Production meshing runs through the validated worker architecture on supported browsers, with a safe fallback where required.
4. Worker meshing handles opaque, cutout, translucent, and fluid geometry correctly.
5. Neighbor halo data prevents internal boundary faces and shading errors.
6. Worker messages use efficient transferable typed data on hot paths.
7. Pure mesh geometry generation is off the main thread.
8. Deterministic world generation is off-thread for normal streaming, or evidence proves another architecture is superior.
9. GPU uploads are independently queued and bounded.
10. Streaming priority accounts for visibility/movement/gameplay urgency rather than distance alone.
11. A hierarchical far-terrain LOD system exists and materially extends practical view distance without full-detail chunk explosion.
12. Main-thread frame spikes caused by world generation/meshing are eliminated or reduced below the accepted performance budget.
13. Existing visual quality on equivalent tiers is preserved or improved.
14. Save compatibility, determinism, block editing, lighting, simulation, and networking foundations remain correct.
15. Long traversal does not leak unbounded CPU/GPU resources.
16. Full typecheck/lint/unit/build/e2e gates pass.
17. Performance results include reproducible before/after measurements.
18. All Critical/High findings discovered by adversarial review are resolved.
19. OpenSpec tasks, verification evidence, program state, and Git history are coherent.
20. The final coherent checkpoint is published to origin/main and the published head is verified.

---

# 27. North-star outcome

The finished system should feel fundamentally different from the current brute-force streaming model:

- exploration should not cause major freezes;
- the render thread should remain responsive while terrain is generated;
- sections should appear according to player need rather than arbitrary queue order;
- block edits should remesh tiny localized regions;
- far terrain should remain visible far beyond the interactive chunk ring;
- increasing view distance should scale through cheaper representations rather than linearly multiplying full-detail world state;
- worker throughput, upload work, and GPU cost should each be observable and independently controlled;
- visual quality should be protected instead of being the first thing sacrificed.

This is the browser/Three.js translation of the high-performance voxel-engine principles demonstrated in the reference video, adapted to the actual architecture already present in Clone MC V3.
