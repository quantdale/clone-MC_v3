# Design: 255-high-performance-voxel-engine

## Context/current state
Change 253 made `CanonicalWorldStorage`/`ChunkColumn`/`ChunkSection` authoritative, but `World` still has a compatibility projection and a disabled worker path. `buildSectionPayload` creates JavaScript arrays, samples only the target section, and the worker result is packed-quads data expanded into `THREE.BufferGeometry` on the main thread. `TerrainGenerator.generateColumn` is deterministic but called by the live generation stage on the main thread. Mesh stage completion and upload bookkeeping occur in one synchronous attach operation. Streaming queues are bounded but distance/raster scheduling is not sufficient for high-radius or fast-turn workloads. `Renderer` has no measured dynamic pixel-budget controller and no far-terrain LOD.

## Target state
Canonical sections are immutable job snapshots. A worker-safe section mesh request contains typed transferable voxel/light/material data for the target plus a one-voxel face halo (and the explicit vertical neighbors required by the dimension bounds). The worker emits typed GPU-ready streams for opaque, cutout, translucent, and fluid layers. A bounded `MeshReadyQueue` hands validated results to a time/byte-bounded `GpuUploadScheduler`; only the scheduler creates/attaches Three.js resources. Deterministic column generation uses a versioned worker client with canonical main-thread commit. A scheduler ranks work by visibility, movement direction, distance, simulation urgency, LOD, and age. LOD0 canonical voxels are complemented by deterministic coarse/macro/far-surface tiles. Renderer pixel scale is controlled by a hysteretic budget controller.

## Invariants
1. Canonical storage is the only writable world truth; workers never mutate it.
2. Every asynchronous request carries protocol version, job identity, target identity, generation token, and relevant section/light version snapshot.
3. A stale, duplicate, foreign, malformed, cancelled, timed-out, or partial result is never visible and is settled exactly once.
4. Section border sampling uses canonical coordinates and dimension bounds; absent/out-of-range cells are handled by an explicit boundary policy, never an accidental air default.
5. Seed, coordinates, generation version, registry tables, and feature conflict order produce bit-equivalent canonical output before and after workerization.
6. Opaque, cutout, translucent, and fluid streams retain their layer/order/material semantics.
7. All queues and caches have explicit caps; unloading/replacement disposes owned geometry, buffers, jobs, and listeners exactly once.
8. LOD is presentation-only and can never satisfy collision, interaction, simulation, persistence, or networking reads.
9. Existing visual quality tiers and save formats remain compatible.

## API and data model
Conceptual contracts (names may consolidate into existing modules):

```ts
type MeshLayer = 'opaque' | 'cutout' | 'translucent' | 'fluid';
interface SectionSnapshot {
  requestId: string; sectionX: number; sectionY: number; sectionZ: number;
  generation: number; versionSnapshot: SectionVersionSnapshot;
  cells: Uint16Array; skyLight: Uint8Array; blockLight: Uint8Array;
  haloCells: Uint16Array; haloSkyLight: Uint8Array; haloBlockLight: Uint8Array;
  registryTableId: string; protocolVersion: number;
}
interface MeshReadyRecord {
  requestId: string; target: SectionIdentity; generation: number;
  versionSnapshot: SectionVersionSnapshot; layers: ReadonlyMap<MeshLayer, TypedGeometryData>;
  byteLength: number; lod: 0 | 1 | 2 | 3;
}
interface UploadBudget { maxBytes: number; maxMillis: number; }
```
Buffers are transferred only after the producer relinquishes ownership. No API exposes a mutable worker-owned buffer to canonical storage.

## Control/data flow
1. Streaming scheduler admits bounded generation, mesh, light, upload, and unload work.
2. Generation worker receives seed/version/column coordinates and static tables; it returns a deterministic column snapshot. Main thread validates identity/version and commits atomically.
3. Section snapshot builder captures target/halo voxels, light, and version dependencies without materializing unrelated sections.
4. Mesh worker processes the snapshot and returns typed layer streams. Main thread validates protocol, identity, token, versions, layer limits, and byte caps.
5. Valid records enter `MeshReadyQueue`; upload scheduler consumes only within frame byte/time budgets.
6. Upload creates geometries/material meshes, atomically replaces the prior section group, disposes superseded resources, and records bytes/time.
7. LOD scheduler builds deterministic tiles from seed/worldgen functions plus bounded edit overlays; transitions use overlap/skirt rules and hysteresis.
8. Renderer samples frame metrics and adjusts internal resolution within configured tier bounds; no gameplay state depends on pixel scale.

## Detailed behavior
### Worker meshing
The halo is one voxel around all six faces of a 16³ section, with dimension-aware vertical clipping. Cross-section dependencies are included in the snapshot/version set. The worker uses registry-derived immutable tables initialized once per worker. Empty sections still produce an explicit empty result so the stage can complete without a hidden retry loop. Layer routing follows the existing `RenderCategory`, translucent ordering, fluid surface rules, AO, vertex lighting, tint, and UV contracts.

### Generation
Generation requests are column-scoped and deterministic. Worker output is data-only and may be rejected on any mismatch. Main-thread commit checks the column status/version and edit durability state, then applies one transaction; a stale completion is dropped and requeued with bounded retry/backoff. A worker error, timeout, or unsupported environment marks only that request failed and uses the synchronous fallback.

### Upload and disposal
`MeshReadyQueue` has a hard record and byte cap. `GpuUploadScheduler` uses measured EMA estimates plus a strict per-frame byte/time budget. A record that cannot fit remains queued; it is not partially attached. Atomic replacement preserves the currently visible group until the replacement is complete. Every rejected or superseded geometry/buffer is disposed once, including optional-material and unload paths.

### Streaming priority
Priority is a deterministic tuple: urgency class, frustum/visibility score, movement-direction score, simulation ticket, LOD, Chebyshev distance, age, and canonical key. Ties resolve by canonical coordinate order. Load/unload and LOD thresholds have hysteresis. A bounded admission pass must continue to service the spawn/interactive ring under queue saturation.

### LOD
LOD0 is canonical interactive storage. LOD1 is deterministic coarse voxel occupancy/material data, LOD2 is macro terrain, and LOD3 is far surface/biome geometry. Tiles are keyed by dimension, seed, generation version, LOD, and tile coordinate. Edits invalidate the affected tile and bounded ancestors; if an edit cannot be represented at a far tier, the tile remains conservative until rebuilt. Cross-tier seams use skirts/overlap and are covered by deterministic fixtures.

### Dynamic resolution
The controller consumes a rolling p95 frame-time signal and GPU/frame budget, clamps scale to the active quality tier, uses separate down/up thresholds, minimum dwell time, and bounded step changes. It never changes simulation tick rate or camera projection semantics. Renderer resize applies the controller's scale once per accepted change and reports actual drawing-buffer dimensions.

## Failure modes
- Worker creation/termination/message error: settle pending jobs, dispose owned buffers, record error, retry with bounded backoff or fallback.
- Protocol/identity/version mismatch: reject without mutation; sibling batch is cancelled or requeued transactionally.
- Queue saturation: reject admission or park with bounded retry; never spin or allocate unboundedly.
- Upload budget exhaustion: defer intact record; visible old geometry remains.
- LOD failure: retain previous tile or omit only the far tile; LOD0 remains authoritative.
- Dynamic-resolution invalid metrics: retain last valid scale and emit a diagnostic counter.

## Compatibility/migration
No persisted schema changes. Worker protocol versions are additive and independently validated. Existing local/remote saves, edits, light state, block entities, and network snapshots continue to use canonical formats. Feature flags permit per-path rollback. LOD caches are disposable and never loaded as authoritative data.

## Performance/resource constraints
Worker requests/results and ready records are bounded by configurable byte/count caps. No ordinary frame may upload beyond its byte/time budget; target upload work is <=1.5 ms p95 on the release baseline. Near-field interactive work must not be starved by speculative generation/LOD. Benchmark evidence must report startup, streaming, edit/light storms, forest, water, long traversal, LOD horizon, frame p95/p99, main-thread work, worker throughput, upload bytes, actual buffer resolution, and resource convergence.

## Testing seams
Pure typed payload validation, halo extraction, layer routing, generation equivalence, priority ordering, LOD sampling/downsampling/seams, upload budgeting, dynamic-resolution control, and resource accounting are unit-testable. Integration tests use fake workers with delayed/duplicate/foreign/error results, canonical storage, real protocol clients, and deterministic fake clocks. Existing worldgen, visual, streaming, memory, save, lighting, and E2E suites remain regression gates.

## Observability/debugging
Extend `RenderPerformanceMonitor` with worker queue depth, mesh-ready depth/bytes, upload bytes/time/deferred count, worker failures/retries, LOD tile counts, dynamic scale, and actual drawing-buffer dimensions. Debug output must distinguish CPU mesh-ready time from GPU upload time and identify the oldest interactive job.

## Affected files/symbols
Likely: `World.ts`, `ChunkMesher.ts`, `WorkerMeshing.ts`, `MeshWorkerEntry.ts`, `WorkerJobProtocol.ts`, `WorkerPool.ts`, `TerrainGenerator.ts`, `WorkerWorldgen.ts`, `Renderer.ts`, `RenderBudget.ts`, `RenderPerformanceMonitor.ts`, `MemoryResourceBudget.ts`, `config`, and new queue/LOD/dynamic-resolution/benchmark modules. Tests are added under `tests/unit`, `tests/bench`, `tests/e2e`, and visual fixtures only where output changes are intentionally equivalent.

## Rejected alternatives
Blindly enabling `useWorkers`; treating section boundaries as air; sending nested JS arrays; creating Three.js objects in workers; synchronous main-thread waits; uploading every completed mesh in one frame; lowering render distance or disabling visual systems; full underground generation for the horizon; WebGPU/WASM before profiling; SharedArrayBuffer before transferable buffers are measured.

## Downstream dependencies
Future visual/material or network work must consume the worker/upload/LOD contracts rather than bypassing them. Far LOD must remain excluded from authoritative multiplayer chunk/entity state. Any intentional generation or visual change requires a separate versioned proposal and updated golden evidence.
