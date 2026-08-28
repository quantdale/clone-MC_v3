# Spec: memory-resource-budgets

## Contract

`MemoryResourceBudget` MUST define the live-resource dimensions `loadedChunks`, `pendingJobs`,
`meshGeometries`, `editOverlayChunks`, `blockEntities`, `activeEntities`, and `itemEntities`;
`validateMemoryResourceConfig` MUST accept exactly a `MemoryResourceConfig` whose fields are positive
integers and MUST reject anything else with an error naming the offending field;
`evaluateResourceBudget(config, snapshot)` MUST report per-dimension `withinBudget = actual <= budget`
(non-finite, negative, missing, or non-numeric actuals violate their dimension) plus an overall verdict
(within only when every dimension is). The module MUST be pure and deterministic: identical
`(config, snapshot)` inputs MUST produce identical reports. This spec is the **headless-unit-tested**
half of change 239; the browser-measured half is `long-session-leak-validation`.

## Definitions

- **Dimension**: one of the seven `MemoryResourceDimension` fields above.
- **Snapshot**: a `LiveResourceSnapshot` — plain non-negative counts for each dimension.
- **Budget/ceiling**: a positive-integer cap per dimension. `DEFAULT_MEMORY_RESOURCE_BUDGET` is derived
  from the current runtime caps (see Invariants) and is the ceiling used when a scenario does not
  override it.
- **Within budget**: `actual <= budget`.

## Invariants

- Every `MemoryResourceConfig` field is a positive integer.
- Per-dimension `withinBudget = actual <= budget`; non-finite, negative, NaN, missing, or non-numeric
  actuals violate.
- Overall `withinBudget` = every dimension within budget.
- Default ceilings match current runtime caps:
  - `maxLoadedChunks` = `(2·r+1)² × layerCount` where `r = max(R, preloadRadius)` — the engine retains
    chunks up to its unload limit (`renderDistance + 1`), and the boot preload radius (`CONFIG.preloadRadius`
    = 3) is always ≤ `R + 1`, so preloaded chunks are never immediately evicted and the residency ceiling
    is driven by the larger of the streaming ring and the preload ring. Desktop `R=6` → 169; headless
    `R=2` (preload radius 3) → 49;
  - `maxPendingJobs` = `CONFIG.maxQueueSize` (512) + `maxLoadedChunks` (retry-queue bound);
  - `maxMeshGeometries` = `2 × maxLoadedChunks` + a fixed allowance (40) for constant-shape geometries;
  - `maxEditOverlayChunks` = 10,000 (`World.EDIT_OVERLAY_MAX_CHUNKS`);
  - `maxBlockEntities` = 4,096; `maxActiveEntities` = `SPAWN_CAP` + 256; `maxItemEntities` = 1,024.
    (The last three are documented defaults the implementing agent may tune with a recorded rationale.)
- Evaluation is total: malformed actuals yield violations, never exceptions; an invalid config throws.

## Requirements

### Requirement: config validation
`validateMemoryResourceConfig(input)` MUST accept exactly a valid `MemoryResourceConfig` (all seven
fields positive integers, nothing else) and MUST throw a descriptive error naming the offending field
otherwise.

#### Scenario: valid config accepted
- **GIVEN** a `MemoryResourceConfig` with seven positive integers and no extra keys
- **WHEN** validation runs
- **THEN** it returns the same value (narrowed), unchanged.

#### Scenario: invalid values rejected
- **GIVEN** a field equal to 0, a negative, fractional, NaN, Infinity, a non-number, a missing field, or
  an extra unknown key
- **WHEN** validation runs
- **THEN** it throws an error naming the offending field/key, and no state is created.

### Requirement: evaluation
`evaluateResourceBudget(config, snapshot)` MUST produce exactly one entry per dimension in a fixed
order and the overall verdict.

#### Scenario: all dimensions within budget
- **GIVEN** a snapshot at or below every configured budget
- **WHEN** evaluation runs
- **THEN** every entry has `withinBudget: true` and the report's `withinBudget` is true.

#### Scenario: single dimension violation
- **GIVEN** a snapshot where exactly `loadedChunks` exceeds `maxLoadedChunks`
- **WHEN** evaluation runs
- **THEN** the `loadedChunks` entry is false, all other entries are true, and the overall verdict is
  false.

#### Scenario: boundary equality
- **GIVEN** `actual === budget` for a dimension
- **WHEN** evaluation runs
- **THEN** that dimension is within budget.

#### Scenario: malformed actuals
- **GIVEN** a negative, NaN, Infinity, missing, or non-numeric actual for any dimension
- **WHEN** evaluation runs
- **THEN** that dimension violates and the overall verdict is false; evaluation does not throw.

#### Scenario: entry order is fixed
- **GIVEN** any valid config and snapshot
- **WHEN** evaluation runs twice
- **THEN** both reports list the dimensions in the same fixed order
  (`loadedChunks, pendingJobs, meshGeometries, editOverlayChunks, blockEntities, activeEntities,
  itemEntities`).

### Requirement: default ceilings reflect runtime caps
`DEFAULT_MEMORY_RESOURCE_BUDGET` MUST hold the ceilings stated in the Invariants, so a default
evaluation flags any chunk that is not unloaded, any queue that exceeds its bound, any geometry growth
beyond the per-chunk ×2 budget, or any edit-overlay growth beyond 10,000 chunks.

#### Scenario: desktop default ceilings
- **GIVEN** `DEFAULT_MEMORY_RESOURCE_BUDGET` with desktop `R=6`
- **WHEN** inspected
- **THEN** `maxLoadedChunks === 169`, `maxPendingJobs === 512 + 169`, `maxMeshGeometries ===
  2·169 + 40`, `maxEditOverlayChunks === 10_000`.

#### Scenario: headless default ceilings
- **GIVEN** `DEFAULT_MEMORY_RESOURCE_BUDGET` derived with headless `R=2` (preload radius 3)
- **WHEN** inspected
- **THEN** `maxLoadedChunks === 49` and `maxMeshGeometries === 2·49 + 40`.

### Requirement: determinism
Identical `(config, snapshot)` inputs MUST produce identical reports.

#### Scenario: repeated evaluation agrees
- **GIVEN** two evaluations with the same config and the same snapshot
- **WHEN** both run
- **THEN** their reports are deeply equal (entries and verdict).

## Error and failure behavior

- Invalid configs throw descriptive errors naming the field.
- Evaluation is total: malformed actuals (negative, NaN, Infinity, missing, non-numeric) yield a
  violating entry and an overall `withinBudget: false`, never an exception.

## Performance and resource bounds

`validateMemoryResourceConfig` is O(fields); `evaluateResourceBudget` is O(dimensions) and allocates one
small report object plus one entry object per dimension. No per-frame cost in production.

## Compatibility and migration

Additive: one new module plus one unit-test file. No existing module or behavior changes; no stored
data or serialized format changes.

## Security and integrity

Not applicable: no I/O; all inputs validated; evaluation is total and side-effect-free.

## Observability

Reports name each failing dimension with budget vs actual, so a reviewer sees which residency cap was
violated. Unit tests assert exact values and entry order.

## Verification mapping

- `tests/unit/MemoryResourceBudget.test.ts` — config validation matrix; evaluation scenarios (all
  within, single violation, boundary equality, malformed actuals, fixed entry order); default-ceiling
  derivation (desktop + headless); determinism (deeply equal reports).
