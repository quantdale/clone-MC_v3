# Spec: audit-performance

## Contract

The performance audit verifies that frame/tick budgets and resource bounds hold under load, that
hot paths are free of algorithmic/allocation regressions, and that memory stays bounded over long
sessions. It relies on the worker/main-thread stress evidence from 238, long-session memory stress
from 239, the release performance gate from 247, and the render performance contract from 75. It
reconciles the legacy performance findings (`AUDIT-002` synchronous preload, `AUDIT-006/007/008/
009/016/017/019/020` hot-path costs, `AUDIT-021/022/023` build/CI) against the current tree.

## Definitions

- **Tick budget**: the fixed-20-TPS simulation time budget per tick (from change 44).
- **Frame budget**: the render time budget per frame (from change 75).
- **Hot path**: a routine that runs every tick/frame or per-chunk/per-message under normal load.
- **Resource bound**: a cap on a live structure (queues, geometries, edit overlay, entities).

## Invariants

- A sustained frame/tick-budget violation under load is a `performance` finding; it is `blocking`
  only if it causes a hang or progressive unresponsiveness (e.g. unbounded growth), else
  `non-blocking`.
- A memory leak that grows without bound over a normal lifecycle is `blocking` (see 239).

## Requirements

### Requirement: REQ-PE1 — Tick/frame budgets under load
The audit MUST verify that the fixed-tick and frame budgets hold under representative load, using
change 238/247/75 evidence, and MUST record any sustained violation.

#### Scenario: tick budget under churn
- **GIVEN** a chunk/meshing/worldgen churn scenario from change 238,
- **WHEN** the audit inspects tick time,
- **THEN** it MUST confirm the fixed-tick budget is met (citing 238/247 evidence or a bounded
  probe); a sustained overrun that causes the game to fall behind and never recover is recorded
  with its consequence.

#### Scenario: frame budget under render load
- **GIVEN** the render performance contract from change 75 and 247 release tiers,
- **WHEN** the audit inspects frame time,
- **THEN** it MUST confirm the frame budget is met on the documented hardware tiers (citing 75/247
  evidence); a sustained violation is `non-blocking` unless it causes a hang or unbounded
  resource growth, which is `blocking`.

### Requirement: REQ-PE2 — No hot-path algorithmic/allocation regression
The audit MUST verify that hot paths are free of avoidable super-linear algorithms and per-iteration
allocations, and reconcile the legacy `AUDIT-006/007/008/009/016/017` hot-path costs against the
current tree.

#### Scenario: legacy queue-sort reconciled
- **GIVEN** legacy `AUDIT-006` (per-frame full queue sort) and the current chunk/meshing queue
  implementation,
- **WHEN** the audit inspects the hot path,
- **THEN** it MUST confirm whether the per-frame sort still exists and record its current
  complexity/impact with evidence, mapping the legacy ID to `resolved`, `persists`, or a new
  finding.

#### Scenario: hot-path allocation detected
- **GIVEN** a routine that allocates per invocation on a per-frame/per-message path,
- **WHEN** the audit inspects it,
- **THEN** it MUST record the allocation with its rate and classify it (`non-blocking` unless it
  drives GC pressure into a budget violation, which is recorded under REQ-PE1).

### Requirement: REQ-PE3 — Memory boundedness over long sessions
The audit MUST verify memory stays bounded over a long session using the 239 memory-stress
evidence and the `MemoryResourceBudget` contract, and MUST reconcile legacy `AUDIT-020`/memory
concerns.

#### Scenario: long-session heap bounded
- **GIVEN** the 239 long-session memory scenarios and `MemoryResourceBudget` ceilings,
- **WHEN** the audit inspects memory,
- **THEN** it MUST confirm the settled-median heap/GPU ceilings hold (citing 239 evidence) and
  that live structures return to their ring/budget cardinalities after teleport/reload cycling;
  an unbounded growth is `blocking`.

#### Scenario: boundary — budget exactly met
- **GIVEN** a live structure whose size equals its budget exactly,
- **WHEN** the audit inspects it,
- **THEN** it MUST record it as within budget (boundary equality is acceptable per the
  `MemoryResourceBudget` contract) and note the boundary status in the evidence.

## Error and failure behavior

- A measurement seam that is unavailable (e.g. `performance.memory` in non-Chromium) is recorded
  as `gc: unavailable`/`insufficient evidence` per 239's rule, never asserted as a pass.
- A performance claim without a measured or cited number is not reported `confirmed`.

## Performance and resource bounds

The audit itself adds no runtime cost; any probe uses a time cap and bounded memory.

## Compatibility and migration

None — performance audit changes no runtime behavior.

## Security and integrity

Performance denial-of-service via unbounded input is cross-referenced from `security` (rate caps,
resource caps per 237 REQ-R4).

## Observability

Performance findings are traceable by ID; each cites the measured/cited number and the budget it
is compared against.

## Verification mapping

- REQ-PE1 → tick/frame budget evidence (238/247/75).
- REQ-PE2 → hot-path complexity/allocation review; legacy `AUDIT-006..009,016,017` reconciled.
- REQ-PE3 → memory boundedness evidence (239); boundary-equality case recorded.
