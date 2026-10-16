# Spec: golden-comparison

## Contract

`goldenCompare` is a pure, headless-safe PNG comparison used by the capture harness.
It MUST support two modes selected by thresholds: **exact** (byte-identical PNGs
equal; any pixel difference fails) and **pixel-diff** (equal iff the fraction of
pixels where any channel differs by more than a channel tolerance is at most a
max-changed-fraction). It MUST return a structured result with no throwing for
comparison outcomes, and MUST be fully deterministic (no `Date`, no `Math.random`,
no global state).

## Definitions

- **Channel tolerance** (`channelTolerance`): the absolute per-channel difference
  (0-255) below which two pixels are considered equal; a pixel is "changed" when at
  least one of its R/G/B/A channels differs by more than this.
- **Changed fraction**: `changedPixels / totalPixels`.
- **Max changed fraction** (`maxChangedFraction`): the upper bound on changed
  fraction for a pixel-diff pass, in `[0, 1]`.
- **Exact mode**: `channelTolerance = 0` and `maxChangedFraction = 0`; equal iff every
  pixel matches exactly (equivalently, the PNGs are byte-identical, checked as a fast
  path).
- **Result**: `{ status: 'pass', mode, changedFraction }` for passes;
  `{ status: 'fail', reason, changedFraction?, changedPixels? }` for failures; and
  `{ status: 'missing-golden' }` when the golden buffer is `null`.

## Invariants

- `comparePng` is total for valid PNG buffers and `null` goldens: it never throws on
  a comparison; malformed input yields `{ status: 'fail', reason: 'decode-error' }`.
- Determinism: identical inputs and options always yield identical results.
- `changedFraction` is computed over the union of the two images' dimensions; images
  with different dimensions are a `dimension-mismatch` failure, never a partial
  comparison.
- Byte-identical PNGs are always `pass` regardless of mode.
- A `null` golden always yields `missing-golden`, regardless of mode.

## Requirements

### Requirement: exact-mode equality
In exact mode (`channelTolerance = 0`, `maxChangedFraction = 0`) `comparePng` MUST
return `pass` iff the actual and golden PNGs are byte-identical, and MUST return
`fail` when they differ.

#### Scenario: identical bytes pass
- **GIVEN** two PNG buffers that are byte-identical and exact-mode options
- **WHEN** `comparePng` runs
- **THEN** it returns `{ status: 'pass', mode: 'exact', changedFraction: 0 }`.

#### Scenario: any difference fails exact mode
- **GIVEN** two PNG buffers of equal dimensions that differ in exactly one pixel by
  one channel value (1) and exact-mode options
- **WHEN** `comparePng` runs
- **THEN** it returns `{ status: 'fail', reason: 'exceeded-threshold', changedFraction:
  1 / totalPixels }`.

### Requirement: pixel-diff tolerance boundary
In pixel-diff mode, `comparePng` MUST count a pixel as changed only when some channel
differs by more than `channelTolerance`, and MUST pass iff `changedFraction <=
maxChangedFraction`.

#### Scenario: boundary equality passes
- **GIVEN** two PNGs where the single differing pixel differs by exactly
  `channelTolerance` in one channel (not more), and `maxChangedFraction = 0`
- **WHEN** `comparePng` runs
- **THEN** it returns `pass` (the boundary pixel is not counted as changed).

#### Scenario: one over-tolerance pixel exceeds a zero bound
- **GIVEN** two PNGs where one pixel differs by `channelTolerance + 1` in a channel,
  `maxChangedFraction = 0`, and totalPixels `= 400`
- **WHEN** `comparePng` runs
- **THEN** it returns `fail` with `changedFraction = 1/400`.

#### Scenario: within max changed fraction passes
- **GIVEN** two PNGs where 100 of 10,000 pixels differ beyond tolerance
  (`changedFraction = 0.01`) and `maxChangedFraction = 0.01`
- **WHEN** `comparePng` runs
- **THEN** it returns `pass` with `changedFraction = 0.01`.

#### Scenario: above max changed fraction fails
- **GIVEN** two PNGs where 101 of 10,000 pixels differ beyond tolerance
  (`changedFraction = 0.0101`) and `maxChangedFraction = 0.01`
- **WHEN** `comparePng` runs
- **THEN** it returns `fail` with `reason: 'exceeded-threshold'`.

#### Scenario: channel tolerance ignores small noise
- **GIVEN** two PNGs whose only differences are channels differing by at most
  `channelTolerance - 1` and `maxChangedFraction = 0`
- **WHEN** `comparePng` runs
- **THEN** it returns `pass` (sub-tolerance noise is not a changed pixel).

### Requirement: dimension mismatch
`comparePng` MUST fail with `reason: 'dimension-mismatch'` when the decoded
dimensions differ, and MUST NOT attempt a per-pixel comparison.

#### Scenario: mismatched dimensions fail
- **GIVEN** an actual PNG of 1280×720 and a golden PNG of 1920×1080
- **WHEN** `comparePng` runs
- **THEN** it returns `{ status: 'fail', reason: 'dimension-mismatch' }`.

### Requirement: missing golden
`comparePng` MUST return `{ status: 'missing-golden' }` when the golden buffer is
`null`, regardless of mode or thresholds.

#### Scenario: null golden
- **GIVEN** `goldenPng = null` and any valid options
- **WHEN** `comparePng` runs
- **THEN** it returns `{ status: 'missing-golden' }`.

### Requirement: malformed input is reported, not thrown
`comparePng` MUST return `{ status: 'fail', reason: 'decode-error' }` for an actual
or golden buffer that `pngjs` cannot decode, without throwing.

#### Scenario: corrupt golden
- **GIVEN** a valid actual PNG and a corrupt/truncated golden buffer
- **WHEN** `comparePng` runs
- **THEN** it returns `{ status: 'fail', reason: 'decode-error' }`.

#### Scenario: corrupt actual
- **GIVEN** a corrupt actual buffer and a valid golden PNG
- **WHEN** `comparePng` runs
- **THEN** it returns `{ status: 'fail', reason: 'decode-error' }`.

### Requirement: determinism
Identical (actual, golden, options) inputs MUST produce identical results across
repeated calls.

#### Scenario: repeated calls agree
- **GIVEN** the same actual/golden buffers and the same options
- **WHEN** `comparePng` runs twice
- **THEN** both results are deeply equal.

## Error and failure behavior

- Comparison never throws for valid-PNG inputs; decode failures map to
  `reason: 'decode-error'`.
- `dimension-mismatch`, `exceeded-threshold`, and `decode-error` are distinct failure
  reasons so the harness can report precisely.
- `missing-golden` is a distinct status so the harness can distinguish "no golden"
  from "golden differs".

## Performance and resource bounds

- A byte-identity fast path returns before decoding, so equal PNGs cost O(1) beyond
  the buffer comparison.
- Decoding and per-pixel comparison are O(w×h) over the union dimensions, with no
  allocations beyond the two decoded buffers and the result object.

## Compatibility and migration

- Additive: a new pure test-support module plus its unit test; no shipped module is
  touched and no dependency is added (`pngjs` already exists).

## Security and integrity

- No I/O and no global state; all input is validated; oversized/decoder-rejected
  buffers surface as `decode-error` rather than crashing.

## Observability

- Results carry the status, mode, changed fraction, and pixel counts needed to build
  the harness's report; `writeDiffPng` is a deterministic helper that writes a
  human-inspectable diff artifact under `test-results/`.

## Verification mapping

| Requirement | Test / command |
|---|---|
| Exact-mode equality | `tests/unit/GoldenCompare.test.ts` › exact mode |
| Pixel-diff tolerance boundary | › pixel-diff boundaries |
| Dimension mismatch | › dimension mismatch |
| Missing golden | › missing golden |
| Malformed input | › decode error |
| Determinism | › determinism |
