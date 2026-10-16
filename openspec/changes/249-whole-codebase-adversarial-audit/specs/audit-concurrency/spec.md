# Spec: audit-concurrency

## Contract

The concurrency audit verifies that the multi-threaded and async execution model is sound: worker
job protocol correctness (versioning, stale-result rejection, cancellation), single-writer
discipline over authoritative simulation state, transferable/buffer ownership (no double-transfer,
no use-after-transfer), and message ordering/backpressure under worker saturation. It relies on
the worker job protocol work from 64/86, the worker/main-thread stress evidence from 238, and the
client-prediction/reconciliation work from 228/231.

## Definitions

- **Authoritative simulation state**: the state the fixed-tick simulation owns and that render,
  save, and network must read but not mutate concurrently.
- **Worker job**: a unit of work (meshing, worldgen, light) offloaded to a Web Worker with a
  versioned request/result.
- **Transferable ownership**: the exclusive right to a buffer after it is transferred to/from a
  worker.

## Invariants

- A race that corrupts authoritative simulation state is `blocking`.
- A double-transfer or use-after-transfer of a shared buffer is `blocking`.
- A concurrency claim is `confirmed` only with a stress observation (238) or a direct code
  citation; otherwise it is `low`/`blocked`.

## Requirements

### Requirement: REQ-CO1 — Worker protocol versioning and stale-result rejection
The audit MUST verify that worker requests/results are versioned and that stale or out-of-order
results are rejected (change 64/86/238).

#### Scenario: stale result rejected
- **GIVEN** a worker that returns a result for an older job after a newer job has started,
- **WHEN** the result arrives,
- **THEN** the version guard MUST reject the stale result and MUST NOT apply it to newer state;
  the audit MUST confirm this with 238 stress evidence or a probe, and an unguarded late result
  that overwrites fresher state is `blocking`.

#### Scenario: out-of-order results
- **GIVEN** two jobs completing out of order,
- **WHEN** results are applied,
- **THEN** the audit MUST confirm results are applied by job identity/version, not arrival order;
  applying the wrong result to a slot is `blocking`.

### Requirement: REQ-CO2 — Single-writer discipline over authoritative simulation state
The audit MUST verify that authoritative simulation state is mutated by exactly one writer at a
time and that render/save/network paths read it without concurrent mutation, using the
simulation/render boundary and 228/231 reconciliation evidence.

#### Scenario: render reads without mutation
- **GIVEN** a render pass reading simulation state (chunk meshes, entity transforms, inventory),
- **WHEN** the audit inspects the seam,
- **THEN** it MUST confirm the render pass does not mutate authoritative state and either sees a
  consistent snapshot or is version-guarded; a render-path mutation of authoritative state is a
  finding, `blocking` if it corrupts a tick's result.

#### Scenario: save/network read during tick
- **GIVEN** a save or network snapshot taken while the simulation is mid-tick,
- **WHEN** the audit inspects it,
- **THEN** it MUST confirm the snapshot is a consistent point-in-time view (via the 228/231/234
  snapshot/reconciliation mechanisms) and not a torn read; a torn read that persists inconsistent
  state is `blocking`.

### Requirement: REQ-CO3 — Transferable/buffer ownership
The audit MUST verify that buffers transferred to/from workers are not double-transferred and not
used after transfer.

#### Scenario: no use-after-transfer
- **GIVEN** a buffer transferred to a worker for a job,
- **WHEN** the audit inspects ownership,
- **THEN** it MUST confirm the main thread does not read/write the buffer after transfer until it
  is transferred back; a use-after-transfer is `blocking`.

#### Scenario: no double-transfer
- **GIVEN** a buffer that is part of a recycled/pooled job,
- **WHEN** the audit inspects it,
- **THEN** it MUST confirm the buffer is transferred back exactly once and re-registered before
  reuse; a double-transfer that loses the buffer is `blocking`.

### Requirement: REQ-CO4 — Message ordering and backpressure under saturation
The audit MUST verify that under worker/main-thread saturation (change 238) message queues stay
bounded and ordering is preserved where the protocol requires it.

#### Scenario: saturated worker queue bounded
- **GIVEN** a burst of worker jobs exceeding the steady-state rate (238),
- **WHEN** the audit inspects the queue,
- **THEN** it MUST confirm the pending-job queue stays within its cap (`CONFIG.maxQueueSize` and
  per-job caps) and does not grow without bound; unbounded growth under saturation is `blocking`.

#### Scenario: ordering preserved where required
- **GIVEN** a protocol that depends on ordered delivery (e.g. a per-slot job sequence),
- **WHEN** the audit verifies it,
- **THEN** it MUST confirm ordering is preserved or version-reconciled; an ordering violation that
  yields wrong state is `blocking`.

## Error and failure behavior

- A worker that terminates mid-job must not leave the main thread waiting forever (238); a
  silent hang is `blocking`.
- A concurrency defect reproducible only under real load (not headless) is recorded
  `low`/`blocked` with an explicit note.

## Performance and resource bounds

Concurrency review is bounded and headless; saturation probes use the existing 238 harness with a
time cap.

## Compatibility and migration

None — concurrency audit changes no runtime behavior.

## Security and integrity

Concurrency defects reachable via hostile network input are cross-referenced from `security`.

## Observability

Concurrency findings are traceable by ID; each cites the worker protocol or shared-state seam and
its evidence.

## Verification mapping

- REQ-CO1 → worker versioning/stale-result evidence (64/86/238).
- REQ-CO2 → single-writer/consistent-snapshot evidence (228/231/234).
- REQ-CO3 → transfer ownership inspection.
- REQ-CO4 → saturation queue/ordering evidence (238).
