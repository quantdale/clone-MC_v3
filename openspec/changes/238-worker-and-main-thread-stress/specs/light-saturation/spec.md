# Spec: light-saturation

## Contract

Saturation drives light propagation (066-069) at worst-case volume and MUST hold measurable latency
budgets for full sky/block passes and incremental-edit passes over a fixed dense volume, MUST keep
each light pass cell-visited count bounded (no runaway BFS), and MUST preserve 069 equivalence
(`updateLightAfterEdit` equals a full recompute of the edited world) across a saturated edit sequence.
All functional suites are deterministic with an injectable clock; only wall-clock latency suites use
the documented median-with-warmup protocol.

## Definitions

- **Full pass**: one `computeSkyLight` plus one `computeBlockLight` over a fixed volume
  (`volumeWidth × volumeHeight × volumeDepth`).
- **Edit pass**: one `updateLightAfterEdit` call for a block edit at a given cell.
- **Dense volume**: a fixture volume whose cells are mostly opaque with a bounded number of lit cells
  and open shafts, representative of worst-case propagation.
- **Light budget**: `maxFullPassMeanMillis` and `maxEditMeanMillis` measured as means over
  `iterations` passes.

## Invariants

- `volumeWidth/volumeHeight/volumeDepth`, `iterations`, and every budget field are positive finite
  numbers (validated).
- A light pass over the fixture visits each cell a bounded number of times; the total visited-cell
  count is a monotone function of the volume, not of the number of times the engine is invoked.
- `updateLightAfterEdit` output equals a full `computeSkyLight`+`computeBlockLight` of the edited
  world (069 equivalence) for every edit in the saturated sequence.
- Fixed neighbor order (067/068/069) is preserved; identical worlds/edits/scripted clocks yield
  identical light arrays and identical measurements.

## Requirements

### Requirement: full-pass latency budget
`runLightSaturation` MUST run `iterations` full sky/block passes over the dense volume, time each
with the injectable clock, and evaluate the mean against `maxFullPassMeanMillis`.

#### Scenario: full pass within budget
- **GIVEN** a dense fixture and a config whose `maxFullPassMeanMillis` exceeds the measured mean
- **WHEN** `runLightSaturation` runs
- **THEN** the report's `withinBudget` is true and the full-pass entry names a mean at or below the
  budget.

#### Scenario: full-pass budget violation
- **GIVEN** a fixture whose measured mean full-pass latency exceeds `maxFullPassMeanMillis`
- **WHEN** `runLightSaturation` runs
- **THEN** the full-pass entry has `withinBudget: false` and the report's `withinBudget` is false.

### Requirement: incremental-edit latency budget
`runLightEditSaturation` MUST apply a fixed edit sequence of `iterations` edits through
`updateLightAfterEdit`, time each with the injectable clock, and evaluate the mean against
`maxEditMeanMillis`.

#### Scenario: edits within budget
- **GIVEN** a dense fixture and an edit sequence whose mean edit latency is at or below
  `maxEditMeanMillis`
- **WHEN** `runLightEditSaturation` runs
- **THEN** the edit entry is within budget and the report verdict reflects it.

#### Scenario: edit budget violation
- **GIVEN** an edit sequence whose measured mean edit latency exceeds `maxEditMeanMillis`
- **WHEN** `runLightEditSaturation` runs
- **THEN** the edit entry has `withinBudget: false` and the report's `withinBudget` is false.

### Requirement: bounded propagation
Each full pass and each edit pass MUST visit a bounded number of cells that scales with the volume
(not with the number of invocations), so a saturated light workload cannot grow into a runaway BFS.

#### Scenario: repeated passes stay bounded
- **GIVEN** a dense fixture and a large `iterations`
- **WHEN** full and edit passes run repeatedly
- **THEN** the total cells visited scales with volume × passes and does not grow super-linearly
  between identical passes.

### Requirement: 069 equivalence under saturation
For every edit in the saturated sequence, the resulting light arrays MUST equal a full recompute of
the same edited world.

#### Scenario: edit sequence equals full recompute
- **GIVEN** a dense fixture, an edit sequence, and a fresh copy of the same world
- **WHEN** the edited copy applies `updateLightAfterEdit` for each edit and the fresh copy is fully
  recomputed after applying the same edits
- **THEN** the sky and block light arrays are identical at every cell.

### Requirement: determinism
Identical worlds, identical edit sequences, and identical scripted clocks MUST produce identical light
arrays and identical measurements.

#### Scenario: scripted clocks agree
- **GIVEN** two fixtures with identical worlds, edits, and scripted clocks
- **WHEN** each runs the same light-saturation suite
- **THEN** the resulting light arrays and reports are deeply equal.

## Error and failure behavior

- `validateLightSaturationConfig` throws a descriptive error for non-finite, non-positive, or
  non-numeric fields, and for non-object input.
- Out-of-volume edits are rejected by the light world's bounds and MUST NOT corrupt in-range cells.
- A malformed light array value (outside [0, 15]) is rejected by the underlying storage/engine and
  MUST NOT be silently clamped by the harness.

## Performance and resource bounds

Passes are O(volume) with bounded per-cell visits. Wall-clock latency suites use the documented
protocol: discard one warmup run, then measure the median of at least 3 runs via `performance.now()`.
Starting budgets are validated constants; actual medians and any tuning are recorded in
`verification.md`.

## Compatibility and migration

Additive and read-only over 066-069; no change to light storage, engines, or serialization. No
migration.

## Security and integrity

All config and light values validated; bounds checking prevents out-of-volume writes. Determinism
guards against order-dependent corruption under repeated edits.

## Observability

Reports name the full-pass/edit dimension with budget vs actual mean. The equivalence fixture
provides a cell-level diff assertion so any divergence under saturation is located precisely.

## Verification mapping

- `tests/unit/LightSaturation.test.ts` — full-pass and edit-pass latency budgets and verdicts,
  bounded-visit assertion, 069 equivalence across the saturated edit sequence, scripted-clock
  determinism, config validation, out-of-volume-edit rejection.
