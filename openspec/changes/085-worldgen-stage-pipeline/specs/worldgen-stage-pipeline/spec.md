# Spec: worldgen-stage-pipeline

## Contract

`GenerationPipeline` MUST track per-column generation stages through the fixed ordered
`GENERATION_STAGES` vocabulary with monotonic forward-only transitions: `advanceTo` MUST advance
to a later stage, treat a same-stage call as a no-op, and throw on backward transitions; `getStage`
MUST default to the first stage for unknown columns; `isComplete` MUST be true exactly at the final
stage. All behavior MUST be deterministic and column-independent.

## Definitions

- **Stage order**: `TERRAIN, CLIMATE, BIOMES, SURFACE, CAVES, FLUIDS, FEATURES, FINAL`.
- **Transition**: `{ columnKey, from, to, advanced }` (`advanced` false for same-stage no-ops).

## Invariants

- `stageIndex` reflects the vocabulary order.
- `nextStage` returns the following stage, or null at `FINAL`.
- `validateGenerationStage` accepts exactly the vocabulary ids.
- `advanceTo` never moves backward and never throws for same-stage calls.
- Column statuses never affect each other.

## Requirements

### Requirement: vocabulary
`GENERATION_STAGES` MUST be the ordered vocabulary; `stageIndex`/`nextStage`/`validateGenerationStage`
MUST implement its semantics.

#### Scenario: order and next
- **GIVEN** the vocabulary
- **WHEN** indices and next-stage queries run
- **THEN** `stageIndex('SURFACE')` is 3, `nextStage('SURFACE')` is `'CAVES'`, and
  `nextStage('FINAL')` is null.

#### Scenario: validation
- **GIVEN** a stage id not in the vocabulary (e.g., `'MOON'`) or a non-string
- **WHEN** validation runs
- **THEN** it throws a descriptive error.

### Requirement: transitions
`advanceTo` MUST implement forward-only semantics with records.

#### Scenario: forward advance
- **GIVEN** a column at `TERRAIN`
- **WHEN** `advanceTo(x, z, 'SURFACE')` runs
- **THEN** the transition records from `TERRAIN` to `SURFACE` with `advanced: true`, and
  `getStage` returns `SURFACE`.

#### Scenario: same-stage no-op
- **GIVEN** a column at `SURFACE`
- **WHEN** `advanceTo(x, z, 'SURFACE')` runs
- **THEN** the transition records `advanced: false` and the stage is unchanged.

#### Scenario: backward rejected
- **GIVEN** a column at `SURFACE`
- **WHEN** `advanceTo(x, z, 'TERRAIN')` runs
- **THEN** it throws and the stage is unchanged.

### Requirement: status queries
`getStage`, `isAtLeast`, and `isComplete` MUST reflect the recorded stage.

#### Scenario: default and completion
- **GIVEN** an unknown column and a column advanced to `FINAL`
- **WHEN** queries run
- **THEN** the unknown column's stage is `TERRAIN` and `isComplete` is false; the final column's
  `isComplete` is true; `isAtLeast(x, z, 'CAVES')` is true only for columns at or past `CAVES`.

### Requirement: independence and determinism
Column statuses MUST be independent; identical operation sequences MUST produce identical states.

#### Scenario: isolated columns
- **GIVEN** two columns advanced differently
- **WHEN** both are queried
- **THEN** each reports its own stage; repeated sequences produce equal results.

## Error and failure behavior

- Invalid stages and backward transitions throw descriptive errors; no partial mutation.

## Performance and resource bounds

O(1) per column operation (Map-backed).

## Compatibility and migration

Additive; no existing modules touched.

## Security and integrity

Not applicable.

## Observability

Transitions record from/to stages; tests assert exact sequences.

## Verification mapping

- `tests/unit/GenerationPipeline.test.ts` — vocabulary, transitions, status queries, independence,
  determinism.
