# Spec: audit-reliability

## Contract

The reliability audit verifies that runtime failure conditions are detected and handled without
corruption or unresponsiveness: GPU/context faults, pointer-lock faults, worker/job failures,
disposal correctness, error isolation, and bounded growth under sustained load. It relies on the
worker/main-thread stress evidence from change 238 and memory stress from 239, and reconciles the
legacy reliability findings (`AUDIT-001` WebGL context loss, `AUDIT-003` pointer-lock feedback,
`AUDIT-005` edit-overlay eviction, `AUDIT-011` dispose isolation, `AUDIT-025` retry) against the
current tree.

## Definitions

- **Runtime fault**: a failure occurring after successful initialization (GPU context loss,
  pointer-lock refusal, worker crash, quota/storage error, resource exhaustion).
- **Disposal**: releasing owned resources (GPU geometry/textures, workers, listeners, store
  handles) when an owner is torn down.

## Invariants

- An unhandled runtime fault that freezes or corrupts the game is a `blocking` finding.
- A disposal gap that leaks resources across a normal lifecycle (reload/unload/teardown) is
  reported with evidence from 238/239 or a probe.

## Requirements

### Requirement: REQ-R1 — Runtime fault handlers present and effective
The audit MUST verify that the documented runtime fault handlers exist and behave: WebGL context
loss (`src/engine/Renderer.ts`), pointer-lock error (`src/engine/InputManager.ts`), and any
worker/job error path. For each, it MUST confirm a recovery or a user-visible error state, and
reconcile legacy `AUDIT-001`/`AUDIT-003`.

#### Scenario: context loss recovery state
- **GIVEN** the current `webglcontextlost`/`webglcontextrestored` handlers in `src/engine/Renderer.ts`,
- **WHEN** the audit verifies them,
- **THEN** it MUST confirm a defined outcome (recovery path or a user-visible error state that does
  not silently freeze), record `AUDIT-001` as `resolved` or note any residual gap as a new
  finding, and evidence the claim.

#### Scenario: pointer-lock refusal feedback
- **GIVEN** the `pointerlockerror` handler in `src/engine/InputManager.ts`,
- **WHEN** the audit verifies it,
- **THEN** it MUST confirm the failure is surfaced or at least leaves the game in a consistent,
  re-interactable state, and record `AUDIT-003`'s reconciliation status with evidence.

### Requirement: REQ-R2 — Worker/job failure isolation and stale-result rejection
The audit MUST verify that worker/job failures are isolated and that stale or out-of-order job
results are rejected, using change 238/64/86 evidence.

#### Scenario: stale worker result
- **GIVEN** the worker job protocol (versioned jobs, `064`, `086`) and 238 stress evidence,
- **WHEN** the audit inspects the seam,
- **THEN** it MUST confirm stale results are rejected or version-guarded and record the evidence;
  an unguarded late result that overwrites fresher state is `blocking`.

#### Scenario: worker crash isolation
- **GIVEN** a worker that throws or is terminated,
- **WHEN** the audit inspects handling,
- **THEN** it MUST confirm the main thread does not corrupt authoritative state and the job is
  retried or surfaced; a silent hang is a `blocking` finding.

### Requirement: REQ-R3 — Disposal correctness
The audit MUST verify that owners dispose their resources on unload/reload/teardown without leaks
or double-dispose errors, using 239 memory evidence and targeted inspection of the engine,
renderer, world, storage, and audio teardown paths.

#### Scenario: unload disposes geometry
- **GIVEN** a chunk unload path and its `geometry` disposal (per 239 characterization),
- **WHEN** the audit verifies disposal,
- **THEN** it MUST confirm per-chunk GPU/geometry resources are released on unload and record the
  239 evidence; a leak across the normal unload/reload cycle is a finding.

#### Scenario: double-dispose safety
- **GIVEN** a teardown that may run twice,
- **WHEN** the audit inspects it,
- **THEN** it MUST confirm the second dispose is a no-op or safe (no throw, no use-after-free);
  an error on repeated teardown is a `non-blocking` finding unless it corrupts state.

### Requirement: REQ-R4 — Bounded growth under sustained load
The audit MUST verify that queues, caches, and overlay structures are bounded under sustained
load (no unbounded growth that would hang or crash), using 238/239 evidence and the
`MemoryResourceBudget` contract.

#### Scenario: edit-overlay bound reconciled
- **GIVEN** the edit overlay cap and its eviction strategy,
- **WHEN** the audit verifies boundedness,
- **THEN** it MUST confirm the overlay is capped (LRU or equivalent) and reconcile legacy
  `AUDIT-005` (FIFO eviction) to its current status; silent unbounded growth is `blocking`.

#### Scenario: queue bound under churn
- **GIVEN** a sustained chunk/meshing/save churn (238/239 scenarios),
- **WHEN** the audit verifies queue bounds,
- **THEN** it MUST confirm every queue stays within its configured cap (`CONFIG.maxQueueSize`,
  pending-job caps) with 238/239 evidence; a queue that grows without bound is `blocking`.

## Error and failure behavior

- A fault handler that exists only in dev and not in the production build is recorded with the
  build context noted.
- A fault handler whose recovery path itself can corrupt state is `blocking` (unrecoverable
  race / corruption).

## Performance and resource bounds

Reliability is boundedness of exactly the structures under review; no new unbounded structure is
introduced.

## Compatibility and migration

None — reliability audit changes no runtime behavior.

## Security and integrity

Runtime-fault paths that could be triggered by hostile input (quota exhaustion, crafted archive)
are cross-referenced from `security`.

## Observability

Reliability findings are traceable by ID; each cites the fault handler or bounded structure and
its evidence.

## Verification mapping

- REQ-R1 → context-loss and pointer-lock handler evidence; `AUDIT-001`/`003` reconciled.
- REQ-R2 → worker stale-result/crash evidence (64/86/238).
- REQ-R3 → disposal evidence (239).
- REQ-R4 → bounded-growth evidence (238/239); `AUDIT-005` reconciled.
