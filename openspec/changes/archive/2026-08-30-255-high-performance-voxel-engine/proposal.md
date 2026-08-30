# Proposal: 255-high-performance-voxel-engine

## Problem
The live world now owns canonical dimension-aware storage, but the production render path still performs important generation/meshing work on the main thread. Worker meshing is disabled, worker payloads allocate nested JavaScript arrays and lack a complete neighbor halo, worker output is expanded into GPU geometry on the main thread, world generation is not connected to a worker, and mesh completion is not independently scheduled from GPU upload. Full-detail streaming also scales poorly because there is no far-terrain representation and renderer pixel cost follows device pixel ratio without a budget controller.

## Goals
- Make section meshing production-worker-backed on supported browsers without changing canonical world ownership.
- Use complete immutable section snapshots, including neighbor/lighting halo data, transferable typed buffers, and all four render layers.
- Move deterministic normal streaming world generation behind a versioned worker integration with bounded priority/backpressure and synchronous fallback.
- Introduce bounded mesh-ready and GPU-upload queues with transactional stale rejection, byte/time budgets, atomic scene swaps, and exact resource disposal.
- Make streaming priority visibility-, movement-, and simulation-aware while preserving bounded hysteresis.
- Add deterministic hierarchical far-terrain LOD that is presentation-only, edit-aware, and seam-safe.
- Add measured dynamic render resolution and observability, preserving visual quality tiers.
- Establish reproducible before/after benchmark evidence and full regression coverage.

## Non-goals
- No gameplay-rule, save-format, network-protocol, world-seed, or generation-version change.
- No WebGPU, WASM/SIMD, SharedArrayBuffer, engine migration, or proprietary asset/source reuse.
- No global disabling of shadows, lighting, AO, fluids, entities, or simulation to improve metrics.
- No claim that a feature is complete merely because a flag exists; each fast path requires parity and failure evidence.
- No redesign of multiplayer authority; far LOD is never authoritative simulation state.

## Preconditions
- Change 253 is VERIFIED and archived; `CanonicalWorldStorage`, `ChunkColumn`, `ChunkSection`, section version snapshots, stale-result rejection, and resource disposal are the authoritative seams.
- Change 254 hot-path optimizations and benchmarks remain behavior-preserving baseline.
- Existing worker protocol, `WorkerPool`, `MeshWorkerClient`, `WorldgenWorker`, render budget, memory budget, and visual/worldgen regression suites remain available.
- `origin/main` is the session-start review boundary.

## Dependencies
- `src/world/World.ts`, `ChunkMesher`, canonical section/light storage, `WorkerPool`, worker protocols, `Renderer`, and existing deterministic regression infrastructure.
- The existing five-command repository gate plus new focused worker/upload/LOD/dynamic-resolution/benchmark tests.

## Proposed change
Implement the campaign in gated groups: baseline characterization; halo-correct worker section meshing; typed transferable payloads and GPU-ready layer streams; live section ownership and worker default with safe fallback; workerized deterministic generation; independent mesh-ready/upload scheduling; movement/visibility-aware streaming; hierarchical LOD; dynamic resolution and final certification. Each group is feature-flagged until its parity and failure tests pass, then the validated path becomes the supported production default.

## Compatibility and migration
Canonical storage and all persisted records remain unchanged. Existing saves load through the existing migration path. Worker messages are versioned and rejected on mismatch; unsupported browsers or worker construction failures fall back to the synchronous path without blocking the frame. LOD caches are disposable presentation caches and are invalidated/rebuilt from canonical state and seed/version after reload.

## Risks
Worker payload ownership, halo boundary errors, stale results, worker loss, queue starvation, GPU upload bursts, LOD seams, dynamic-resolution oscillation, and resource leaks. The design requires bounded queues, generation/version tokens, cancellation, timeout/error recovery, hysteresis, instrumentation, and reference/golden comparisons before enablement.

## Rollback strategy
Every production fast path has an explicit configuration switch. On worker, parity, upload, LOD, or renderer failure, disable only that path and retain canonical synchronous/fallback behavior. Reverting the change removes only new modules and wiring; no save migration or data rewrite is required.

## Definition of Done
All normative requirements in the capability spec are implemented and tested; section worker meshing, deterministic worker generation, independent upload scheduling, intelligent streaming, LOD, and dynamic resolution are live on supported configurations with safe fallbacks; visual/determinism/save/edit/light/simulation regressions pass; benchmark scenes produce reproducible before/after evidence; resource counts remain bounded; the baseline gate passes; all Critical/High findings are resolved; OpenSpec state and published Git history are coherent.

## Advancement gate
100% of tasks and all MUST/SHALL requirements must pass. A 90–99.99% exception is permitted only under the repository advancement rule and may not omit a mandatory production requirement. The final checkpoint must be committed, pushed normally to `origin/main`, and the remote head verified.
