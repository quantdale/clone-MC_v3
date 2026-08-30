# Spec: high-performance-voxel-engine

## Contract
Change 255 defines the production performance architecture for the live voxel renderer and streamer. It MUST improve scalability without changing canonical gameplay semantics, deterministic world output, save compatibility, or visual-layer meaning.

## Definitions
- **Canonical state**: `CanonicalWorldStorage` and its `ChunkColumn`/`ChunkSection` contents.
- **Section job**: one versioned mesh request for one canonical 16³ section and its dependencies.
- **Halo**: immutable one-voxel face-neighbor data required to decide boundary visibility/shading, clipped by dimension bounds.
- **Mesh-ready**: validated worker output not yet converted/attached to Three.js resources.
- **LOD0**: canonical interactive voxel representation. LOD1–LOD3 are presentation-only derived tiles.
- **Interactive work**: visible/near-field generation, meshing, lighting, simulation, and input-critical updates.

## Invariants
- Workers MUST NOT mutate canonical state, scene objects, persistence, or gameplay entities.
- Every async result MUST be identity-, protocol-, generation-, and dependency-version validated before commit.
- All queues, worker buffers, ready records, uploads, and LOD caches MUST have hard bounds.
- Existing four render layers, AO, lighting, tint, fluid semantics, transparency order, and material ownership MUST remain intact.
- LOD MUST NOT answer block reads, collision, interaction, simulation, persistence, or network authority.

## Requirements
### Requirement: Baseline evidence
The campaign MUST establish reproducible release-build measurements for cold spawn, forward streaming, spin, edit storm, lighting storm, forest, water coast, long traversal, and LOD horizon. Measurements MUST include commit/environment, frame p95/p99, main-thread work, worker throughput, queue depths, upload bytes/time, render-buffer size/DPR, and resource convergence.
#### Scenario: Repeatable baseline
- **GIVEN** the same seed, quality profile, browser configuration, and benchmark input
- **WHEN** the benchmark is run twice from a cold start
- **THEN** it records the declared metrics and identifies environment differences rather than silently merging results.

### Requirement: Halo-correct section snapshots
A section mesh request MUST contain validated target data and all required face-neighbor halo data/light/version dependencies. Dimension-out-of-range samples MUST follow an explicit boundary policy and MUST NOT be accidentally treated as an in-range air section.
#### Scenario: Horizontal border
- **GIVEN** a solid target boundary and a solid adjacent section cell
- **WHEN** the worker meshes the target
- **THEN** it emits no internal shared face and matches the reference mesher.
#### Scenario: Vertical dimension boundary
- **GIVEN** a target at the minimum or maximum dimension section
- **WHEN** the halo is captured
- **THEN** out-of-dimension cells are represented by the documented boundary policy, with no invalid storage access or phantom neighbor section.

### Requirement: Worker render-layer parity
The production worker path MUST preserve opaque, cutout, translucent, and fluid output, including existing AO, vertex lighting, tint, UV, fluid-height, and translucent ordering semantics.
#### Scenario: Mixed render layers
- **GIVEN** a fixture containing opaque, cutout, translucent, and fluid blocks
- **WHEN** it is meshed by the worker and reference paths
- **THEN** layer membership, geometry meaning, material order, and golden/reference comparison agree within the declared numeric tolerance.

### Requirement: Typed transferable ownership
Hot-path worker payloads MUST use validated typed buffers or equivalent compact transferable data. Producers MUST relinquish transferred ownership and consumers MUST reject malformed lengths, caps, duplicate ownership, and unexpected protocol versions without mutating canonical or scene state.
#### Scenario: Malformed payload
- **GIVEN** a payload with a wrong typed-buffer length or byte count above the configured cap
- **WHEN** it reaches the worker client
- **THEN** it is rejected, the job settles exactly once, and no partial geometry is attached.

### Requirement: Deterministic worker generation
Normal streaming generation MUST be executable through a versioned worker integration or have benchmark evidence proving an equivalent superior architecture. Worker output MUST be bit-equivalent to synchronous generation for the same seed/version/coordinates, and canonical commit MUST be atomic and edit-safe.
#### Scenario: Stale generation after edit
- **GIVEN** a generation result captured before a player edit or column replacement
- **WHEN** the result returns
- **THEN** it is rejected or requeued and MUST NOT overwrite the edit or newer column state.

### Requirement: Independent mesh-ready and upload stages
Worker completion MUST enqueue an intact validated record into a bounded mesh-ready queue. GPU geometry creation/attachment MUST be performed by a separate bounded scheduler using byte and time budgets; old visible geometry MUST remain until a complete replacement is ready.
#### Scenario: Upload storm
- **GIVEN** more worker results complete than one frame's upload budget permits
- **WHEN** the upload scheduler runs
- **THEN** it uploads only within the budget, defers intact records, and keeps the frame responsive without dropping visible geometry.

### Requirement: Exact-once resource lifecycle
Stale, duplicate, cancelled, failed, unloaded, replaced, and context-loss paths MUST release owned worker buffers, geometry, listeners, and queue records exactly once. Resource counts MUST converge after bounded traversal/churn.
#### Scenario: Late result after unload
- **GIVEN** a section is unloaded while its worker result is pending
- **WHEN** the late result arrives
- **THEN** it is rejected, its buffers are released once, and no scene object or ownership map is recreated.

### Requirement: Intelligent bounded streaming
Admission priority MUST account for visibility/frustum, movement direction, distance, simulation urgency, LOD, and age with deterministic tie breaks. Hysteresis and starvation prevention MUST preserve the interactive ring under saturation; speculative far work MUST NOT starve interactive work.
#### Scenario: Saturated high-radius stream
- **GIVEN** generation/mesh queues are full during spawn or fast travel
- **WHEN** admission runs repeatedly
- **THEN** interactive visible work continues to make progress, no unbounded retry loop occurs, and priority ordering is reproducible.

### Requirement: Deterministic hierarchical LOD
The engine MUST provide deterministic LOD1/LOD2/LOD3 tiles derived from the same seed and generation version, with seam-safe transitions, bounded cache eviction, and edit invalidation. LOD tiles MUST be presentation-only and MUST NOT become canonical state.
#### Scenario: LOD transition
- **GIVEN** the camera crosses a LOD threshold in either direction
- **WHEN** tiles are selected
- **THEN** hysteresis prevents rapid thrashing, the transition has no visible unbounded gap, and LOD0 remains the gameplay source.
#### Scenario: Far edit
- **GIVEN** an edit affects a tile and one or more ancestors
- **WHEN** invalidation runs
- **THEN** affected tiles are rebuilt or conservatively retained until rebuilt, while canonical storage and gameplay reads remain unchanged.

### Requirement: Dynamic resolution
The renderer MUST expose a tier-bounded dynamic resolution controller with separate down/up thresholds, hysteresis, dwell time, bounded step changes, and deterministic invalid-metric behavior. It MUST not change simulation timing or camera semantics.
#### Scenario: Sustained overload
- **GIVEN** p95 frame time exceeds the active tier budget for the dwell interval
- **WHEN** the controller updates
- **THEN** internal render scale decreases by at most the configured step and remains within tier bounds.
#### Scenario: Recovery
- **GIVEN** frame time remains below the recovery threshold for the recovery dwell interval
- **WHEN** the controller updates
- **THEN** scale increases gradually, never oscillates on a single sample, and reports actual buffer dimensions.

### Requirement: Visual and compatibility preservation
Equivalent quality tiers MUST preserve existing visual systems and canonical save behavior. Any intentional pixel/LOD/material difference MUST have targeted golden evidence and documented product approval; reducing render distance or globally disabling visual systems MUST NOT be the acceptance strategy.
#### Scenario: Existing save reload
- **GIVEN** a save created before Change 255 with edits, lighting, and block entities
- **WHEN** it loads with worker/LOD paths enabled
- **THEN** canonical state and gameplay-visible edits match the pre-change behavior.

## Error and failure behavior
Malformed, stale, duplicate, foreign, cancelled, timed-out, or failed jobs are rejected without partial commit and settled exactly once. Worker loss triggers bounded retry or synchronous fallback. Queue caps reject/park work rather than allocate or spin. Upload failure preserves the previous visible group when possible. LOD failure omits or retains only derived far tiles. Invalid dynamic-resolution metrics retain the last valid scale.

## Performance and resource bounds
All queue/cache/buffer caps are configuration-validated and observable. Upload work MUST obey per-frame byte/time limits. Interactive work MUST have bounded admission latency under saturation. Benchmarks MUST report before/after values, not only pass/fail. Long traversal MUST show convergence of resident chunks, geometries, worker jobs, ready bytes, and LOD tiles.

## Compatibility and migration
No stored-data schema changes are permitted by this change. Protocol versions are explicit. Synchronous fallback remains available. Disposable LOD caches are rebuilt, never authoritative-loaded. Generation version and seed remain unchanged.

## Security and integrity
Workers receive only validated snapshots and immutable tables. No untrusted worker result may inject Three.js objects, arbitrary resource identifiers, unbounded lengths, or canonical writes. Bounds and identity checks occur before allocation/attachment.

## Observability
The monitor MUST expose worker queue depth/failures/retries, mesh-ready count/bytes/age, upload bytes/time/deferred count, LOD tile count/cache bytes, dynamic scale, and actual drawing-buffer dimensions. Debug output MUST distinguish CPU completion from GPU upload.

## Verification mapping
Baseline: tasks 1, 29, 36. Halo/parity/ownership: tasks 2–8. Live section path: tasks 9–11. Generation: tasks 12–14. Upload: tasks 15–18. Streaming: tasks 19–21. LOD: tasks 22–25. Dynamic resolution/observability/resources: tasks 26–28. Repository gate and handoff: tasks 30–37.
