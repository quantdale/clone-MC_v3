# Spec: engine-hot-paths

## Contract

The live engine's hottest read paths — voxel block access, per-cell light storage access,
random-tick selection, collision shape resolution, and HUD DOM updates — MUST produce
results bit-identical to the pre-254 implementation while eliminating steady-state
per-call/per-attempt allocations on those paths. This spec covers only behavior-preserving
performance changes; no functional, storage, protocol, or API surface changes are in scope.

## Definitions

- **Hot path**: code executed ≥ hundreds of times per rendered frame or simulation tick.
- **Memo**: `World`'s one-entry chunk cache validated by `ChunkManager.revision`.
- **Eligibility table**: `Game`'s lazily built id→has-random-tick byte table.

## Invariants

- Deterministic selection: random-tick cells remain a pure function of
  `(seed, sectionX, sectionY, sectionZ, tick, attempt)`.
- Error classes and messages from touched validation code are unchanged.
- All public exports keep names and signatures.

## Requirements

### Requirement: Allocation-free world block reads with exact semantics (R1)

`World.getBlock(x, y, z)` SHALL perform no heap allocation on any call in steady state
(no coordinate tuples, no chunk-key strings) and SHALL return exactly what the pre-254
implementation returns: `BlockId.Air` for non-integer coordinates; `BlockId.Air` when the
containing chunk is not loaded; the stored block id otherwise. `World.isSolid` SHALL preserve
the invisible sub-bedrock floor (`true` for every integer cell with `y < CONFIG.bedrockY`,
including negative y) and otherwise return `registry.isSolid(getBlock(...))`.

#### Scenario: Unloaded chunk reads as air without allocations
- **GIVEN** a World with no chunks loaded
- **WHEN** `getBlock(12345, 40, -999)` is called
- **THEN** the result is `BlockId.Air`
- **AND** the call allocates no arrays or strings (verified by forcing GC pressure in a stress loop
  and by code inspection of the compiled path).

#### Scenario: Non-integer coordinates resolve to air
- **GIVEN** a generated World containing stone at (8, 8, 8)
- **WHEN** `getBlock(8.5, 8, 8)`, `getBlock(8, NaN, 8)`, and `getBlock(8, 8, Infinity)` are called
- **THEN** each returns `BlockId.Air`

### Requirement: Memo correctness across chunk lifecycle (R2)

The World chunk memo SHALL be invalidated whenever the underlying chunk map mutates
(create, remove, dispose). A stale memo SHALL never surface a removed or replaced chunk's
data; reads after unload SHALL behave identically to a cold lookup.

#### Scenario: Unloaded chunk reverts to air through a warm memo
- **GIVEN** a World streaming chunk (0,0,0) whose block (8,8,8) was just read via `getBlock`
- **WHEN** the chunk is unloaded (player moves away; `removeChunk` runs) and `getBlock(8,8,8)` is called again
- **THEN** the result is `BlockId.Air`, not the previously memoized stone

#### Scenario: Reloaded chunk is visible through the memo
- **GIVEN** the same World after chunk (0,0,0) regenerates
- **WHEN** `getBlock(8,8,8)` is called
- **THEN** it returns the regenerated terrain id

### Requirement: Light storage numeric section cache transparency (R3)

`WorldLightStorage`'s numeric section cache SHALL be observationally identical to direct map
lookups: values written into a section are immediately visible via subsequent gets;
`deleteSection` removes values and invalidates cached identity; `clear` empties all sections;
`restore` replaces content; missing sections read 0; malformed coordinates still throw
`RangeError` with the existing message format.

#### Scenario: Cache does not resurrect deleted sections
- **GIVEN** light written at (1, 70, 1)
- **WHEN** `deleteSection(0, 4, 0)` runs and `getSkyLight(1, 70, 1)` is called twice consecutively
- **THEN** both calls return 0

#### Scenario: Malformed input still throws the documented RangeError
- **GIVEN** any storage state
- **WHEN** `getSkyLight(1.5, 0, 0)`, `setSkyLight(0, -1, 0, 3)`, or a local accessor receives
  out-of-range `[0,16)` locals or non-integers
- **THEN** a `RangeError` with the pre-254 message text is thrown

### Requirement: Allocation-free section-local indexing (R4)

`SectionLightStorage` accessors SHALL compute nibble indices directly without allocating an
intermediate coordinate object, preserving index layout `x + y*16 + z*256`, validation order
(x, then y, then z), and rejection of non-integers/out-of-range locals with the existing
message `SectionLightStorage: local coordinates must be in [0, 16): <value>`.

#### Scenario: Index equivalence at boundaries
- **GIVEN** any section storage
- **WHEN** values are written via (x,y,z) accessors at corners (0,0,0), (15,15,15), (0,15,7)
- **THEN** reads return the identical values and `NibbleArray.serialize()` output matches the
  layout produced by the pre-254 implementation for the same writes

### Requirement: Bit-identical random-tick selection without hot-loop allocations (R5)

`RandomTickSelector.selectForSection`/`selectEligible` SHALL select exactly the same indices/
positions as the pre-254 implementation for every `(seed, sectionX, sectionY, sectionZ, tick)`
input and attempt count, including the bounded-attempts cap behavior. The per-attempt path
SHALL NOT allocate rest-args arrays or `LocalCoord` objects. The exported variadic `hash32`
SHALL remain available with unchanged outputs.

#### Scenario: Golden sequence equivalence
- **GIVEN** fixed inputs (seed 1337, section (-3, 1, 5), tick 1000)
- **WHEN** `selectForSection` and `selectEligible` run with the eligibility predicate
  `(x,y,z) => ((x*31 + y*17 + z*13) & 63) === 0`
- **THEN** the returned sequences equal the sequences recorded from the pre-254 implementation
  for the same inputs (golden vectors pinned in tests), across at least 200 attempts of
  bounded sampling

### Requirement: Registry-derived eligibility table equivalence (R6)

`Game.tickRandomBlocks` SHALL decide random-tick eligibility through a byte table derived
from the same `blockRegistry`/`behaviorRegistry` pair, and its decisions SHALL be identical
to direct registry lookups for every registered id; ids not covered by the current table
SHALL take the legacy lookup path (including exception behavior) and extend the table.

#### Scenario: Table matches direct lookups for the full default catalog
- **GIVEN** the production registries
- **WHEN** every registered block id is probed through both the table path and the direct path
- **THEN** all decisions agree

### Requirement: Collision shape adapter contract preservation (R7)

`PlayerPhysics`'s `ShapeWorld` adapter SHALL preserve the exact `WorldAccess` two-query
contract — `world.isSolid(x, y, z)` decides solidity (including any implementation-defined
invisible floor), and only solid cells resolve a shape via the block id. A single-lookup
derivation through `registry.isSolid(getBlock(...))` is FORBIDDEN because it changes behavior
for `WorldAccess` implementations whose `isSolid` is not registry-derived.

#### Scenario: Sub-floor solidity preserved
- **GIVEN** the physics adapter over any World
- **WHEN** `getCollisionShape(5, -3, 5)` is called
- **THEN** the result equals `shapes.getCollisionShape(BlockId.Air)` exactly as before

#### Scenario: Surface equivalence sweep
- **GIVEN** a generated mixed-terrain World region
- **WHEN** every cell in a 64³ sample volume is resolved through old and new adapters
- **THEN** every result is identical

### Requirement: Change-detected HUD DOM writes (R8)

HUD chip setters (`setFPS`, `setSelectedName`, `setSurvival`, `setWorldTime`) SHALL assign
`textContent` only when the rendered string differs from the last assignment. Rendered output
SHALL be unchanged for identical input sequences.

#### Scenario: Repeated identical updates write once
- **GIVEN** a HUD over a stub element counting assignments
- **WHEN** `setWorldTime(12.5)` is called five times consecutively
- **THEN** exactly one assignment occurs and the displayed text matches the pre-254 rendering

### Requirement: Benchmark coverage (R9)

A vitest bench suite SHALL exist covering world block-read throughput, light-storage cell
access throughput, and random-tick selection throughput, runnable via the repository test
toolchain, and verification.md SHALL record baseline and post-change numbers from the same
machine/session class.

#### Scenario: Bench suite runs green
- **WHEN** `npx vitest bench --run tests/bench/hot-paths.bench.ts` executes
- **THEN** all benches complete without error

### Requirement: Full regression gate (R10)

The campaign SHALL leave `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
and `npm run test:e2e` passing with no skipped mandatory suites, plus
`node scripts/validate-state.mjs` PASS for the reconciled program state.

#### Scenario: Gate green at closure
- **WHEN** all six commands run at the final head
- **THEN** all exit successfully

## Error and failure behavior

Preserved exactly as specified per requirement; no new failure modes introduced.

## Performance and resource bounds

- Steady-state `getBlock`: 0 allocations/call (baseline: 3).
- Light cell get/set: 0 allocations/call on warm sections (baseline: ≥1 object + ≥1 string).
- Random-tick attempts: 0 allocations/attempt (baseline: ≥2).
- Measured via tests/bench/hot-paths.bench.ts; numbers recorded in verification.md.

## Compatibility and migration

None required.

## Security and integrity

No security-relevant surfaces touched; all validation remains in place (no weakened checks).

## Observability

Benchmarks serve as the observable record; no runtime telemetry changes.

## Verification mapping

| Requirement | Evidence |
|---|---|
| R1 | tests/unit/HotPathEquivalence.test.ts + bench |
| R2 | tests/unit/WorldChunkMemo.test.ts |
| R3/R4 | tests/unit/LightStorageFastPath.test.ts |
| R5 | tests/unit/RandomTickGolden.test.ts |
| R6 | tests/unit/RandomTickEligibilityTable.test.ts |
| R7 | tests/unit/PlayerPhysicsShapeEquivalence.test.ts |
| R8 | tests/unit/HudWriteDeduplication.test.ts |
| R9 | tests/bench/hot-paths.bench.ts + verification.md numbers |
| R10 | gate command log in verification.md |
