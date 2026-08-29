# Agent Execution Instruction — High-Performance Voxel Engine Campaign

Repository: **quantdale/clone-MC_v3**

Primary planning source:

**docs/high-performance-voxel-engine/MASTER_PLAN.md**

This instruction is intended for a capable autonomous coding agent operating from the repository root.

---

# Mission

Implement the High-Performance Voxel Engine master plan completely and safely, but **only when repository sequencing permits it**.

The objective is to transform Clone MC V3 into a worker-driven, section-oriented, scalable voxel engine with:

- production-correct worker meshing;
- 16³ section render ownership;
- transferable typed worker data;
- GPU-ready worker mesh output;
- workerized deterministic world generation;
- bounded GPU upload scheduling;
- visibility/movement-aware streaming priority;
- hierarchical far-terrain LOD;
- dynamic render resolution;
- optional later GPU attribute packing and visual upgrades;
- strong performance instrumentation;
- no sacrifice of gameplay correctness, determinism, save compatibility, or equivalent-tier visual quality.

Do not implement a superficial FPS patch. Execute this as an architecture campaign.

---

# Mandatory startup procedure

Before touching production code, do all of the following.

1. Synchronize safely with the current remote main branch.
2. Record the current origin/main SHA as session_start_head.
3. Read, in this exact repository-defined order:
   - AGENTS.md
   - openspec/AUTONOMOUS_GOAL.md
   - openspec/PROGRAM_STATE.json
   - openspec/PROGRAM_STATE.md
   - openspec/CHANGE_SEQUENCE.md
   - openspec/CHANGE_SEQUENCE_OVERRIDES.md
   - openspec/REVIEW_HANDOFF.md
   - all files in the current active numbered change
   - openspec/SPEC_AUTHORING_PROTOCOL.md
   - docs/high-performance-voxel-engine/MASTER_PLAN.md
4. Inspect actual Git state and current code. Never assume this instruction reflects the latest implementation.
5. Determine whether the current active numbered change is still 253-live-world-architecture-convergence or another change.

Repository state is authoritative.

---

# Sequencing rule — do not violate this

At the time this instruction was authored, Change 253 was still ACTIVE and Change 254 was already VERIFIED.

Therefore:

## If Change 253 is still ACTIVE

Do **not** start the high-performance campaign yet.

Continue Change 253 from its first unchecked, unblocked task until it reaches its normal verification gate.

You must:

- preserve Change 253 scope discipline;
- finish the canonical ChunkColumn/ChunkSection architecture convergence;
- run the mandatory checks;
- resolve all Critical/High issues;
- update durable state;
- publish coherent checkpoints to origin/main;
- reach VERIFIED before activating the performance campaign.

Do not smuggle high-performance campaign work into Change 253 unless it is strictly required to complete an existing 253 requirement.

## If Change 253 is VERIFIED and no newer active change blocks this campaign

Use the next free owner-authorized numbered change.

The expected number is **255**, with a name approximately:

**255-high-performance-voxel-engine**

However, do not assume 255 is free. Re-read the control plane. If another owner-authorized change has consumed that number, use the next free number.

---

# OpenSpec authoring requirement

Before modifying production code for this campaign:

1. Create a complete numbered OpenSpec package using openspec/SPEC_AUTHORING_PROTOCOL.md.
2. Derive the package from docs/high-performance-voxel-engine/MASTER_PLAN.md.
3. Include at minimum:
   - proposal.md
   - design.md
   - tasks.md
   - verification.md
   - complete normative specs under specs/**
   - agent prompt/execution material if the repository pattern requires it.
4. Update the sequence/control-plane files only as permitted by the repository protocol.
5. Mark the new change ACTIVE only when all prerequisites are satisfied.
6. Do not touch production code until the package is internally complete enough to drive implementation.

The master plan is strategic architecture. The numbered OpenSpec change is the executable normative contract.

---

# Execution philosophy

You are expected to make substantial architectural changes where necessary.

Do not preserve inefficient code merely because it already exists.

At the same time, do not replace proven systems gratuitously.

Prefer to **promote and complete** the repository's existing architecture:

- WorkerPool;
- WorkerJobProtocol;
- WorkerMeshing;
- MeshWorkerEntry;
- GreedyMesher;
- ChunkSection;
- ChunkColumn;
- CanonicalWorldStorage;
- VerticalWorldAccess;
- ChunkPipeline;
- SectionVersionSnapshot;
- RenderBudget;
- RenderPerformanceMonitor;
- MemoryResourceBudget;
- AmbientOcclusion;
- VertexLighting;
- FluidSurfaceMesher;
- TerrainGenerator;
- deterministic worldgen regression infrastructure.

Do not create a competing second engine unless benchmarks and an ADR prove the existing architecture cannot satisfy the requirements.

---

# Absolute rule: profile first

Before major implementation work, establish the current release-build baseline.

Create or extend deterministic benchmark scenarios covering:

- cold spawn;
- 2× sprint straight traversal;
- 4× sprint traversal;
- rapid camera spin;
- section-boundary block edit storm;
- lighting storm;
- dense forest;
- water coastline;
- repeated long traversal/load-unload;
- later, LOD horizon transition.

Record:

- frame p50/p95/p99;
- average FPS;
- >25 ms and >50 ms long frames;
- draw calls;
- triangles;
- geometry count;
- texture count;
- generation queue depth/age;
- mesh queue depth/age;
- upload queue depth/age;
- worker utilization;
- stale/cancelled worker results;
- GPU upload bytes/frame;
- loaded columns/sections;
- resource/memory convergence;
- resolution, DPR/render scale, quality, seed, browser, OS, CPU/GPU, commit SHA.

Do not claim an optimization worked without comparable before/after evidence.

---

# Implementation order

Execute the campaign in this order unless the activated OpenSpec package contains a repository-evidence-based reason to change sequencing.

---

## Phase 1 — Make worker meshing correct

Do NOT begin by changing World.ts useWorkers from false to true.

The current worker path must first be made production-correct.

### Required work

- add complete one-cell neighboring voxel/light context around each 16³ section;
- make the worker mesher aware of section boundaries;
- prevent duplicate internal faces between adjacent loaded sections;
- preserve cross-section ambient occlusion and vertex lighting;
- preserve exact stale-result/version semantics;
- support all render streams:
  - opaque;
  - cutout;
  - translucent;
  - fluid;
- ensure fluid geometry follows FluidSurfaceMesher or equivalent semantics;
- ensure transparent/cutout blocks are not silently omitted;
- ensure greedy merges preserve all required material/tint/animation/render-layer invariants.

### Mandatory tests

Cover at minimum:

- solid-solid section boundary;
- solid-air section boundary;
- vertical boundaries;
- edges/corners;
- water-water;
- water-solid;
- water-air;
- glass/translucent;
- foliage/cutout;
- biome tint;
- light gradients;
- AO across section edges/corners;
- edit while worker job is active;
- unload while worker job is active;
- superseded generation;
- malformed result;
- duplicate result;
- worker failure/retry;
- geometry parity/golden reference.

Only after this phase passes may the worker path become a candidate for production default.

---

## Phase 2 — Typed transferable worker data

Replace hot-path JavaScript arrays and per-job registry scans.

Use typed arrays where safe.

Likely direction:

- block/state IDs in Uint16Array or another type consistent with the canonical ID domain;
- packed sky/block light in Uint8Array if appropriate;
- static dense registry lookup tables initialized once per worker;
- transfer lists for ArrayBuffers.

Do not force Uint8 if block-state identity can exceed 255.

Do not use SharedArrayBuffer yet.

Benchmark transferable buffers first.

---

## Phase 3 — GPU-ready worker output

Do not send object-heavy quad lists back to the main thread as the final architecture.

Move pure geometry construction into workers.

Workers should return final typed streams for:

- positions;
- normals or compact face encoding;
- texture/UV data;
- lighting;
- AO;
- tint;
- indices;
- bounds;
- byte accounting.

Main thread responsibilities should be limited to:

- version validation;
- BufferGeometry creation/binding;
- atomic scene replacement;
- GPU upload;
- resource disposal.

Avoid large temporary JS object graphs.

---

## Phase 4 — Make ChunkSection the live render unit

After Change 253 convergence, use canonical 16³ sections for:

- mesh ownership;
- invalidation;
- versioning;
- frustum bounds;
- GPU replacement;
- worker jobs.

Do not keep 16×64×16 compatibility slabs as the hot render/remesh unit.

Block edits should invalidate the minimum required dependency set.

Test:

- interior edit;
- face edit;
- vertical face edit;
- edge edit;
- corner edit;
- light dependency changes;
- simultaneous neighbor edits.

Do not solve correctness by remeshing the whole world or whole column.

---

## Phase 5 — Workerize deterministic world generation

Move pure TerrainGenerator work off the main thread.

Worker inputs should be compact and versioned.

Worker outputs should integrate into canonical section/column storage transactionally.

Preserve:

- world seed determinism;
- TERRAIN_GENERATION_VERSION behavior;
- worldgen regression matrices;
- structure/feature ownership;
- save compatibility.

Worker scheduling order must never alter generated terrain.

Do not mutate THREE or DOM state from worldgen workers.

---

## Phase 6 — Add a separate GPU upload queue

Do not attach every completed worker result immediately.

Create a CPU mesh-ready queue and a bounded upload scheduler.

Prioritize:

1. nearest visible sections;
2. player safety/collision neighborhood;
3. forward movement corridor;
4. interaction area;
5. older waiting jobs;
6. far/LOD work.

Enforce:

- bytes/frame cap;
- elapsed upload-time budget;
- stale-result rejection before upload;
- atomic replacement;
- exact geometry disposal.

Target approximately <=1.5 ms p95 main-thread upload work on Medium where available hardware permits.

---

## Phase 7 — Improve streaming priority

Move beyond distance-only scheduling.

Use a score incorporating:

- distance;
- camera facing;
- frustum visibility;
- player movement direction;
- interaction priority;
- collision/simulation criticality;
- job age;
- LOD level;
- preload/speculative status.

Retain hysteresis.

Prevent starvation.

Do not let rear speculative terrain delay an immediately visible hole ahead of the player.

---

## Phase 8 — Implement hierarchical far-terrain LOD

This is mandatory for genuinely large view distances.

Do not attempt to render an 8 km horizon by loading full canonical interactive voxel sections to 8 km.

Implement a hierarchy approximately like:

### LOD0
Full 1 m voxels near the player.

### LOD1
2–4 m coarse voxel representation.

### LOD2
4–16 m macro terrain representation.

### LOD3
Surface-only far terrain / heightfield / clipmap-like horizon representation.

Actual distance thresholds must come from benchmarks.

Requirements:

- same seed/generation version drives all LODs;
- deterministic convergence toward canonical near terrain;
- no underground generation for far horizon unless visible/needed;
- seam suppression through aligned grids, skirts, overlap, fade, snapped edges, or equivalent;
- bounded tile cache;
- LOD hysteresis;
- explicit edit invalidation policy;
- no simulation authority in far presentation LOD.

The user should be able to see much farther without multiplying full-detail chunk state linearly.

---

## Phase 9 — Dynamic render resolution

Decouple world render-buffer resolution from CSS viewport and raw devicePixelRatio.

Use a slow/hysteretic resolution controller based on frame-time statistics.

Do not allow rapid oscillation.

Preserve UI sharpness.

Allow explicit quality/user limits.

This is a GPU optimization, not a replacement for world-pipeline work.

---

## Phase 10 — GPU packing/custom terrain shader, only if justified

First make the architecture correct and workerized.

Then measure GPU bandwidth/geometry memory.

Only if material:

- pack light/AO/tint attributes;
- consider integer/local section position encoding;
- consider face-normal encoding;
- consider texture arrays;
- introduce a dedicated terrain shader.

Do not replace MeshLambertMaterial solely because a custom shader sounds more advanced.

Every shader change requires visual regression evidence.

---

## Phase 11 — Optional visual upgrades

Only after stable performance headroom exists.

Prefer:

- atmospheric horizon tied to far LOD;
- water Fresnel;
- depth-based water tint;
- subtle water distortion;
- stabilized shadows;
- optional high-tier light shafts;
- optional SSAO if proven valuable.

Do not make these Medium-tier baseline requirements without GPU budget:

- heavy volumetric ray marching;
- planar reflections;
- motion blur;
- depth of field;
- mandatory TAA;
- bloom-heavy post-processing.

Do not sacrifice voxel clarity.

---

# Things you are explicitly forbidden to do

Do not:

- lower render distance drastically and declare success;
- disable the visual layer globally to manufacture FPS;
- set useWorkers true without fixing worker boundary/render-layer correctness;
- treat out-of-section worker samples as air;
- create one object/mesh per voxel;
- create unbounded worker or upload queues;
- block the main thread waiting for worker completion;
- apply stale worker results;
- upload all ready meshes in one frame;
- generate full underground voxel volumes for kilometer-distance horizon rendering;
- migrate the project to Unity;
- rewrite the project in Rust;
- make WebGPU mandatory;
- add SharedArrayBuffer before transferable-buffer evidence;
- add WASM without proof that a remaining CPU kernel is a bottleneck;
- split sections into many directional meshes without draw-call evidence;
- break worldgen determinism;
- break saves;
- break furnace/block-entity persistence;
- break multiplayer protocol foundations;
- remove current graphics quality merely for benchmark gains;
- skip validation because the change is large.

---

# Performance/correctness decision rule

For each proposed optimization:

1. identify the measured bottleneck;
2. define the expected mechanism of improvement;
3. implement the smallest coherent architecture change that solves it;
4. test correctness;
5. run the relevant benchmark;
6. compare before/after;
7. keep it only if the result is positive or strategically required for a later proven phase;
8. document the result.

If an optimization increases complexity but produces no meaningful gain, revert or simplify it.

---

# Quality gate

The campaign is not complete because "it feels faster."

Completion requires:

- all OpenSpec MUST/SHALL requirements verified;
- all tasks complete, preferably 100%;
- no unresolved Critical/High correctness, data-loss, determinism, compatibility, concurrency, or performance issues;
- npm run typecheck PASS;
- npm run lint PASS;
- npm test PASS;
- npm run build PASS;
- npm run test:e2e PASS;
- campaign-specific performance suites PASS;
- long-traversal resource test PASS;
- visual regression evidence PASS;
- save migration/backward compatibility PASS;
- deterministic worldgen regression PASS;
- worker stale/cancellation tests PASS;
- LOD seam/transition validation PASS;
- measured before/after dossier recorded.

Do not use the 90% advancement exception for work that materially affects the architecture or a MUST/SHALL performance requirement.

---

# Long-running autonomous behavior

Work headlessly.

Do not ask routine confirmation questions.

When context becomes large:

- checkpoint tasks;
- checkpoint verification;
- checkpoint PROGRAM_STATE;
- record exact next action;
- commit coherent work;
- publish according to REVIEW_HANDOFF.

A fresh agent must be able to resume from repository state alone.

Do not leave important implementation only in an uncommitted worktree.

---

# Git/publication contract

Follow AGENTS.md and openspec/REVIEW_HANDOFF.md exactly.

For every autonomous development session:

- start from current origin/main;
- record session_start_head;
- do not rewrite published history;
- checkpoint coherent repository state;
- commit intended changes;
- publish directly to origin/main;
- verify the remote head;
- record published_head;
- report:
  - active numbered change;
  - status;
  - completed/total tasks;
  - completion percentage;
  - validation results;
  - blockers;
  - next exact action.

If the remote moves, reconcile safely. Never force-push merely to complete the handoff.

---

# Final success condition

The result should not merely benchmark faster in a static world.

The player should observe:

- responsive input during world generation;
- no major traversal freezes;
- smaller localized remeshes;
- fast terrain appearance ahead of movement;
- stable performance while workers are busy;
- bounded GPU upload spikes;
- substantially larger practical view distance;
- far horizon terrain without full-detail memory explosion;
- visual quality at least equivalent on the same tier;
- correct saves and deterministic worlds;
- no resource growth across long exploration.

The engine should end the campaign structurally prepared for future large worlds and live multiplayer rather than requiring another fundamental performance rewrite.

Execute aggressively, but validate every architectural layer before promoting it to the live path.
