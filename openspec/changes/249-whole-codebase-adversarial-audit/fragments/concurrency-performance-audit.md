# Concurrency + Performance audit fragment

Auditor scope: `audit-concurrency` (REQ-CO1..CO4) and `audit-performance` (REQ-PE1..PE3) of
change 249-whole-codebase-adversarial-audit. Read-only audit; this fragment is the only file
created.

## Coverage

### Scope examined

- Worker protocol: `src/rendering/WorkerJobProtocol.ts`, `src/rendering/WorkerMeshing.ts`,
  `src/worldgen/WorkerWorldgen.ts`, `src/rendering/WorkerSaturationHarness.ts`.
- Single-writer seams: `src/simulation/WorldTickProcess.ts`,
  `src/simulation/ServerSaveLifecycle.ts`, `src/simulation/MovementReconciler.ts` (228),
  `src/simulation/InventoryTransactionNetworking.ts` (231, header + validation surface).
- Scheduled tick ordering: `src/simulation/ScheduledTickQueue.ts`.
- Budget seams: `src/rendering/RenderPerformanceMonitor.ts`, `src/rendering/RenderBudget.ts`
  (header), `src/simulation/TickBudgetMonitor.ts` (existence/wiring),
  `src/simulation/ReleasePerformanceGate.ts`, `src/rendering/MemoryResourceBudget.ts`.
- Hot paths / legacy surfaces: `src/world/World.ts` (streaming queues, unload, preload,
  edit overlay), `src/world/ChunkMesher.ts`, `src/world/WorldCoordinates.ts`,
  `src/world/BlockRegistry.ts`, `src/rendering/TextureAtlas.ts`, `src/config/index.ts`,
  `src/engine/Game.ts` (wiring), `src/engine/Renderer.ts` (context loss only), `vite.config.ts`,
  `.github/workflows/ci.yml`.

### Method

Static review of the files above with exact line citations; targeted read-only grep sweeps
(`new Worker\(`, `postMessage|transfer`, `.filter(`, import-wiring greps over `src/engine`);
reconciliation of legacy `FULL_AUDIT_REPORT.md` findings; citation of recorded prior-change
results instead of re-running suites (no production code touched, no probes added).

### Prior evidence cited

- 238 (`238-worker-and-main-thread-stress/verification.md`): meshing burst median 1442.60 ms /
  64 jobs, mean 22.54 ms/job; worldgen 256-column burst median 67.47 ms, mean 0.264 ms/job;
  light/save/pathfinding saturation VERIFIED; frame/tick budget enforcement VERIFIED
  (TickBudgetMonitor.test.ts); full gate green (267 files / 3518 passed + 1 skipped).
- 239 (`239-long-session-memory-stress/verification.md`): long-exploration heap settled-median
  growth ≤ 8 MiB; teleport `loadedChunks` series 31,29,25,25,25,25; churn geometry plateau
  27,26,32,29,24,31; world-reload cycling ≤ 8 MiB; e2e 31/31 PASS.
- 247 (`247-performance-release-gate/verification.md`): fail-closed gate evaluation, tier
  minimums/ceilings semantics, canonical tick/load/save measurements all PASS; gate green
  (292 files / 3827 passed + 1 skipped).
- 075 (`075-render-performance-contract/verification.md`): RenderPerformanceMonitor lifecycle,
  boundary-equality-within vs malformed-violation semantics, determinism — all PASS.

### minimumMet: true (both categories)

Gaps:

- No dynamic probe was run against a *real* Web Worker (none exists in the tree — see
  249-CO-001). REQ-CO1/CO3/CO4 evidence is necessarily against the synchronous dispatchers and
  the 238 harness; a future change that introduces real workers must re-run these requirements.
- REQ-CO2's "save/network snapshot mid-tick" scenario was reviewed statically against
  `ServerSaveLifecycle` (single-threaded TickSystem drain, bounded batch per tick) and 228/231
  reconcilers; no runtime interleaving exists to stress because execution is single-threaded.

## Findings

### 249-CO-001

- id: 249-CO-001
- category: concurrency
- classification: non-blocking
- severity: high
- confidence: confirmed
- evidenceTier: static
- status: open
- title: No real Web Workers exist; the "worker job protocol" runs synchronously in-process
- affected: src/rendering/WorkerJobProtocol.ts, src/rendering/WorkerMeshing.ts, src/worldgen/WorkerWorldgen.ts, src/rendering/WorkerSaturationHarness.ts
- description: The versioned worker protocol (064/065/086) is implemented entirely as
  synchronous main-thread dispatchers. There is no `new Worker(...)` instantiation, no
  `postMessage`, and no transferable anywhere in `src/`. The 238 harness header itself states
  "the real 064/086 clients are pure, synchronous dispatchers — there is no async pool"
  (WorkerSaturationHarness.ts:4-6).
- trigger: Any expectation that REQ-CO1..CO4 have been validated under true cross-thread
  concurrency (late/duplicate messages arriving on a worker thread, buffer neutering after
  transfer, queue backpressure across an event loop).
- impact: None at runtime today — single-threaded execution cannot race, so there is no
  corruption path (hence non-blocking). But the concurrency guarantees are unproven for the
  architecture they were designed for; introducing real workers later would invalidate the
  current evidence.
- evidence:
  - Grep sweep `new Worker\(|postMessage|onmessage|transfer` over `src/` → zero matches in
    production code (recorded command, this session).
  - src/rendering/WorkerSaturationHarness.ts:4-6 (header admits synchronous dispatchers).
  - src/rendering/WorkerJobProtocol.ts:92-131 (WorkerJobClient resolves via direct method call
    contract, not message events).
- recommendation: When real workers are introduced (per master plan), re-run REQ-CO1..CO4 with
  a real-thread stress harness; keep the existing stale-rejection logic, which is correct as
  written.

### 249-CO-002

- id: 249-CO-002
- category: concurrency
- classification: non-blocking
- severity: medium
- confidence: confirmed
- evidenceTier: static
- status: open
- title: Worker clients, MovementReconciler, and TickBudgetMonitor are not wired into the production runtime
- affected: src/rendering/WorkerMeshing.ts, src/worldgen/WorkerWorldgen.ts, src/simulation/TickBudgetMonitor.ts, src/simulation/MovementReconciler.ts, src/engine/Game.ts
- description: No module under `src/engine/` or `src/main.ts` imports the worker clients, the
  movement reconciler (228), or the tick-budget monitor. The live game streams chunks through
  synchronous per-frame budgets in `World.update` (src/world/World.ts:443-461) and drives ticks
  through its own loop (src/engine/Game.ts:471,585-600). These frameworks are exercised only by
  unit tests and harnesses.
- trigger: Reviewing whether the concurrency/prediction machinery protects real gameplay state.
- impact: The machinery is effectively dead code in production; client prediction/reconciliation
  and tick-budget enforcement do not guard live state. Not blocking: the single-threaded game
  has no race to lose, and the unwired modules are correct in isolation.
- evidence:
  - Grep `from '.*WorkerMeshing'|from '.*WorkerWorldgen'|from '.*TickBudgetMonitor'|from
    '.*MovementReconciler'` over `src/` → matches only in WorkerSaturationHarness.ts and test
    modules; zero matches under `src/engine/` (recorded command, this session).
  - src/engine/Game.ts:389-392 (preload enqueues into World's own queues, not worker jobs).
- recommendation: Either wire the reconciler/budget monitor into Game's update path or track
  them explicitly as headless-framework deliverables so later changes know their status.

### 249-CO-003

- id: 249-CO-003
- classification: non-blocking
- category: concurrency
- severity: medium
- confidence: confirmed
- evidenceTier: static
- status: open
- title: Failed worker results leak their callback/request entries in both worker clients
- affected: src/rendering/WorkerMeshing.ts, src/worldgen/WorkerWorldgen.ts
- description: In `MeshWorkerClient.handleMessage`, a result with `ok:false` returns early at
  WorkerMeshing.ts:133 before the callback entry is deleted (deletion happens only on the
  success path at WorkerMeshing.ts:138-139). `WorkerJobClient.resolveResult` already removed the
  pending entry (WorkerJobProtocol.ts:125), so `pendingCount` drops while the `callbacks` Map
  grows without bound under a sustained stream of failed results. The same shape exists in
  `WorldgenWorkerClient.handleMessage`: early returns at WorkerWorldgen.ts:126 (!ok) and
  WorkerWorldgen.ts:134 (identity mismatch) skip the deletes at WorkerWorldgen.ts:137-138, so
  both `callbacks` and `requests` entries leak.
- trigger: A worker repeatedly returning failures or mismatched identities for distinct job ids
  (not reachable today — see 249-CO-001/002: the clients are neither threaded nor wired in).
- impact: Unbounded Map growth proportional to failed-job count. Non-blocking because the
  clients are not in any production path and authoritative simulation state is never corrupted;
  it is a latent resource bound, not a live crash.
- evidence:
  - src/rendering/WorkerMeshing.ts:131-142 (early return skips callbacks.delete)
  - src/worldgen/WorkerWorldgen.ts:124-141 (early returns skip callbacks/requests.delete)
  - src/rendering/WorkerJobProtocol.ts:117-131 (pending deleted inside resolveResult)
- recommendation: Delete the callback/request entries whenever `resolveResult` returns a
  resolved outcome (ok or not), and add a failure-path unit test asserting `callbacks.size`
  returns to zero.

### 249-CO-004

- id: 249-CO-004
- category: concurrency
- classification: non-blocking
- severity: info
- confidence: confirmed
- evidenceTier: static
- status: not-an-issue
- title: REQ-CO3 transferable ownership trivially satisfied — no transferables are used
- affected: src/rendering/WorkerJobProtocol.ts, src/rendering/WorkerMeshing.ts, src/worldgen/WorkerWorldgen.ts
- description: All job payloads are plain structured-clone-safe data (arrays of numbers/null);
  nothing is transferred by reference, so double-transfer and use-after-transfer are impossible
  by construction. The cost side of this choice is copy overhead per job (a 4096-entry cells
  array plus two 4096-entry light arrays per mesh job), which is acceptable at measured rates
  (22.5 ms/job mean, 238).
- trigger: REQ-CO3 inspection.
- impact: None. Recorded so the requirement is explicitly closed rather than silently skipped.
- evidence:
  - src/rendering/WorkerJobProtocol.ts:19 ("transferables are a transport concern" — never
    exercised)
  - src/rendering/WorkerMeshing.ts:17-29 (payload is plain arrays)
  - Grep `transfer\(` over `src/` → zero matches (recorded command, this session).
- recommendation: If real workers arrive, consider transferring the section arrays instead of
  cloning, with ownership handed back per 249-CO-001's re-validation note.

### 249-CO-005

- id: 249-CO-005
- category: concurrency
- classification: non-blocking
- severity: low
- confidence: confirmed
- evidenceTier: static
- status: open
- title: ScheduledTickQueue.tick() scans and sorts the full pending map every call
- affected: src/simulation/ScheduledTickQueue.ts
- description: `tick(nowTick)` iterates every pending entry and sorts all due entries each time
  it runs (ScheduledTickQueue.ts:103-115), O(n + d log d) per tick where n = all pending.
  Ordering itself is deterministic and correct: `(tickTime, seq)` tie-break (line 110), seq
  preserved on re-schedule-in-place (lines 83-88), serialize restores in seq order
  (lines 139-157). There is no cap on `pending`, but entries are de-duplicated per position and
  only created by gameplay scheduling, so growth tracks player actions, not time.
- trigger: Very large pending sets (e.g. massive fluid/redstone scheduling) would make each
  tick scan the whole map.
- impact: Potential tick-budget pressure at extreme scale; no correctness or determinism risk.
  Non-blocking.
- evidence:
  - src/simulation/ScheduledTickQueue.ts:103-115 (full scan + sort)
  - src/simulation/ScheduledTickQueue.ts:80-89 (dedup by position key, stable seq)
- recommendation: If profiling shows pressure, bucket entries by due tick (timing-wheel) rather
  than scanning; keep the `(tickTime, seq)` order.

### 249-PE-001

- id: 249-PE-001
- category: performance
- classification: non-blocking
- severity: medium
- confidence: confirmed
- evidenceTier: mixed
- status: open
- title: Frame/tick/memory budgets are measurement-time contracts only; nothing enforces them at runtime
- affected: src/rendering/RenderPerformanceMonitor.ts, src/simulation/TickBudgetMonitor.ts, src/simulation/ReleasePerformanceGate.ts, src/rendering/MemoryResourceBudget.ts, src/engine/Game.ts
- description: The 075 monitor, 238 tick-budget monitor, 247 release gate, and 239 memory budget
  are pure evaluation seams consumed by tests/e2e. Nothing under `src/engine/` constructs them
  (grep of engine imports returns nothing), so a regression that blows the frame or tick budget
  in production is caught only when CI suites run, not adapted to at runtime (no dynamic render
  distance, no degradation path).
- trigger: A perf regression merged without running the measurement suites.
- impact: Budget violations reach users undetected until the next full gate run. Non-blocking
  per taxonomy (no hang/unbounded growth demonstrated; 239 shows bounded long sessions).
- evidence:
  - Grep `import.*(RenderPerformanceMonitor|TickBudgetMonitor|MemoryResourceBudget)` over
    `src/engine/` → zero matches (recorded command, this session).
  - src/rendering/RenderPerformanceMonitor.ts:21-107 (pure seam, injectable clock)
  - 075 verification: "DEFAULT_RENDER_BUDGET values are documented placeholders to be tuned by
    wiring."
  - Dynamic: 238/247 gate results green at their commits (cited above).
- recommendation: Wire `RenderPerformanceMonitor` begin/endFrame into the Game loop and log or
  adapt on sustained violation; keep the pure evaluators unchanged.

### 249-PE-002

- id: 249-PE-002
- category: performance
- classification: non-blocking
- severity: low
- confidence: confirmed
- evidenceTier: mixed
- status: open
- title: Release-gate tick throughput minimums measure synthetic lightweight systems, not the real 20-TPS simulation
- affected: src/simulation/ReleasePerformanceGate.ts
- description: The tick domain budgets (`minSustainedTicksPerSecond` 60..480,
  ReleasePerformanceGate.ts:146-149) are evaluated by `measureCanonicalTickRun`, which steps 64
  integer-sweep systems over a 289-entry array (ReleasePerformanceGate.ts:697-722) — not the
  real game's system set. The header acknowledges frame/network actuals are synthetic "until the
  075 render scenario / 236 harness are wired at verification time"
  (ReleasePerformanceGate.ts:23-27). A green tick gate therefore does not prove the real
  simulation meets 20 TPS on Low hardware.
- trigger: Reading a green 247 tick verdict as a claim about the shipped game.
- impact: Measurement-validity gap, not a code defect. Non-blocking; 247 records the wiring
  caveat and the e2e suite does exercise the real game.
- evidence:
  - src/simulation/ReleasePerformanceGate.ts:691-722 (synthetic workload)
  - src/simulation/ReleasePerformanceGate.ts:20-27 (header caveat)
  - Dynamic: 247 verification REQ-T1..T4 PASS (canonical measurements complete in tens of ms).
- recommendation: Before relying on the gate for release, replace the synthetic tick workload
  with the real system set (or a documented scaled proxy) and re-baseline the tier matrix.

### 249-PE-003

- id: 249-PE-003
- category: performance
- classification: non-blocking
- severity: low
- confidence: confirmed
- evidenceTier: static
- status: open
- title: Legacy hot-path allocations persist in mesher and coordinate keys (AUDIT-016/017/018)
- affected: src/world/ChunkMesher.ts, src/world/WorldCoordinates.ts, src/simulation/ScheduledTickQueue.ts, src/world/World.ts
- description: (a) Each mesh builds eight fresh growing arrays (ChunkMesher.ts:58-68). (b)
  `chunkKey` allocates a template string per call (WorldCoordinates.ts:41-44) and is called per
  candidate chunk in the per-frame ensureChunks scan (World.ts:501) plus per scheduled-tick
  operation via `positionKey` (ScheduledTickQueue.ts:64-66). (c) `isSolid` still chains two
  lookups (getBlock then registry.isSolid, World.ts:317-323).
- trigger: Steady-state streaming/ticking load.
- impact: Per-operation allocations on hot paths create GC pressure; measured budgets currently
  absorb it (238/239 evidence), so non-blocking.
- evidence:
  - src/world/ChunkMesher.ts:58-68
  - src/world/WorldCoordinates.ts:41-44; src/world/World.ts:501
  - src/simulation/ScheduledTickQueue.ts:64-66
  - src/world/World.ts:317-323
- recommendation: Numeric chunk keys (packed ints) and preallocated mesher scratch buffers if GC
  profiles ever threaten the frame budget.

### 249-PE-004

- id: 249-PE-004
- category: performance
- classification: non-blocking
- severity: info
- confidence: confirmed
- evidenceTier: mixed
- status: resolved
- title: Memory boundedness over long sessions holds (REQ-PE3) per 239 evidence and current-tree contract
- affected: src/rendering/MemoryResourceBudget.ts, src/world/World.ts
- description: The seven-dimension budget contract validates strictly (including extra-key
  rejection, MemoryResourceBudget.ts:180-196), treats malformed actuals as violations and
  boundary equality as within (MemoryResourceBudget.ts:199-202), matching the 239 convention.
  Live structures are capped in the tree: gen/mesh queues at `CONFIG.maxQueueSize` = 512
  (src/config/index.ts:92; guards World.ts:504,518,700,720), edit overlay LRU-capped at 10,000
  chunks (World.ts:80,784), retry mesh queue drained only while under cap (World.ts:566).
  239's recorded long-session scenarios (exploration heap ≤ 8 MiB settled-median growth,
  teleport series settling at 25 loaded chunks, churn geometry plateau ~24-32, reload cycling
  ≤ 8 MiB) confirm boundedness end-to-end.
- trigger: Long sessions, teleport/reload cycling, chunk churn.
- impact: None — requirement met; boundary-equality case honored per spec.
- evidence:
  - 239 verification rows cited in Coverage (all PASS; e2e 31/31).
  - src/rendering/MemoryResourceBudget.ts:151-166,199-202
  - src/config/index.ts:92; src/world/World.ts:504,518,566,700,720,784
- recommendation: None.

### 249-PE-005

- id: 249-PE-005
- category: performance
- classification: non-blocking
- severity: info
- confidence: confirmed
- evidenceTier: mixed
- status: resolved
- title: Tick/frame budget evidence (REQ-PE1) holds within documented tiers per 238/247/075
- affected: src/simulation/WorldTickProcess.ts, src/rendering/RenderPerformanceMonitor.ts, src/simulation/ReleasePerformanceGate.ts
- description: Fixed-tick driving is bounded catch-up via SimulationClock's maxTicksPerFrame
  (WorldTickProcess.ts:74-85), a throwing system stops the process rather than spinning
  (WorldTickProcess.ts:80-84,134-138). Measured evidence: 238 meshing mean 22.54 ms/job and
  worldgen mean 0.264 ms/job under saturation, all saturation suites VERIFIED; 247 canonical
  tick/load/save measurements complete in tens of ms against ceilings of 150-1200 ms; 075
  monitor semantics verified deterministic. Residual caveats are tracked separately as
  249-PE-001 (runtime enforcement) and 249-PE-002 (synthetic tick workload).
- trigger: Representative-load scenarios from 238/247.
- impact: None beyond the tracked caveats.
- evidence:
  - WorldTickProcess.ts:74-104 (bounded clock-fed update; direct step)
  - 238/247/075 verification rows cited in Coverage.
- recommendation: None here; see 249-PE-001/002.

## Legacy reconciliation

| Legacy ID | Category (mine?) | Status | Current-tree evidence |
|---|---|---|---|
| AUDIT-002 | performance | resolved | `preloadChunks` now only enqueues work for the normal per-frame budgets; doc comment says exactly that (src/world/World.ts:950-976); called from src/engine/Game.ts:389-392; generation processed at `CONFIG.budgets.generatePerFrame` (src/world/World.ts:529-531). No synchronous generate+mesh loop remains. |
| AUDIT-006 | performance | resolved | Per-frame full sort replaced by dirty-flag gating: sort runs only when `genQueueDirty`/`meshQueueDirty` or the stream center moved (src/world/World.ts:443-455, 464-474). |
| AUDIT-007 | performance | resolved | No `.filter(` remains anywhere in src/world/World.ts (grep, this session); unload path uses flag-driven iteration (World.ts:459-461). |
| AUDIT-008 | performance | resolved (mitigated) | `registry.get` still throws on unknown ids (src/world/BlockRegistry.ts:345-348), but all world-entry writes validate ids first via `registry.has` (src/world/World.ts:184,271,373), so the throw is unreachable from normal hot-path input. |
| AUDIT-009 | performance | resolved | `uv()` serves from a cache: "cached, no per-call allocation" (src/rendering/TextureAtlas.ts:590-593). |
| AUDIT-016 | performance | persists (non-blocking) | Mesher still allocates 8 growing arrays per mesh (src/world/ChunkMesher.ts:58-68); tracked as 249-PE-003. |
| AUDIT-017 | performance | persists (non-blocking) | String `chunkKey` allocation persists (src/world/WorldCoordinates.ts:41-44) and now also lives in ScheduledTickQueue.positionKey (src/simulation/ScheduledTickQueue.ts:64-66); tracked as 249-PE-003. |
| AUDIT-018 | performance | persists (non-blocking) | `isSolid` double lookup chain persists (src/world/World.ts:317-323); tracked as 249-PE-003. |
| AUDIT-019 | performance | persists (mitigated, non-blocking) | No explicit frustum-culling hints found in src/engine/Renderer.ts (grep, this session); Three.js default per-object frustum culling applies, and merged per-chunk geometry keeps object counts low (239 churn plateau ~24-32 geometries). |
| AUDIT-020 | performance | resolved (mitigated) | Draw calls are now bounded by merged per-chunk meshes; 239 records geometry counts plateauing at ~24-32 under churn, far below the legacy 500+ draw-call concern; 247 frame budgets (maxDrawCalls 500-2500/tier) provide the contract. Confidence: high on mechanism, medium on absolute draw-call count (not directly measured this session). |
| AUDIT-021 | performance/build | resolved | Vite manualChunks splits three.js into its own vendor chunk; chunkSizeWarningLimit lowered to 500 (vite.config.ts:15-21). |
| AUDIT-022 | performance/build | resolved | Playwright browser caching present via actions/cache on ~/.cache/ms-playwright (.github/workflows/ci.yml:47-49). |
| AUDIT-023 | performance/build | resolved | Artifact upload present (2 `upload-artifact` uses in .github/workflows/ci.yml, grep count this session); dependency audits also added (ci.yml:70-73). |

Legacy IDs outside my categories (AUDIT-001/003/004/005/010-015/024-030) are left to their
assigned auditors; AUDIT-001 context-loss handlers were incidentally confirmed still present
(src/engine/Renderer.ts:63-64,113-114).
