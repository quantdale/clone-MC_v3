# Spec: live-world-architecture

## Contract

This capability defines the post-terminal production convergence required for Change 252. It governs the actual playable single-player world, not only headless primitives. The requirements below are the normative contract for authoritative world storage, dimension bounds, generation/streaming, rendering/lighting, gameplay consumers, persistence/migration, resource behavior, repository-wide audit, and final release evidence.

## Definitions

- **Canonical world store**: the single writable live block-state authority backed by dimension-aware `ChunkColumn`/`ChunkSection` storage, directly or through `VerticalWorldAccess`/a thin facade over it.
- **Legacy slab**: the original 16×64×16 `Chunk` block-id representation and any equivalent production store whose vertical authority is limited to the historical 0..63 range.
- **Canonical column**: one horizontal `(chunkX,chunkZ)` world column containing zero or more lazily materialized 16³ sections.
- **Section identity**: `(chunkX,sectionY,chunkZ)` or a semantically equivalent key that uniquely identifies one 16³ render/simulation storage section.
- **Legacy durable data**: any world/edit payload accepted by the shipped runtime before Change 252, including sparse/block-id forms.
- **Current release evidence**: release-authority evidence intended to support the present terminal candidate.
- **Historical release evidence**: preserved evidence from prior program epochs that is not authoritative for the current candidate.

## Invariants

The single-authority, Overworld-boundary, lazy-allocation, state-preservation, deterministic-generation, dirty-save, stale-worker, bounded-resource, and release-evidence invariants are defined in `design.md` and tested by the requirements below.

## Requirements

### Requirement REQ-1: Truthful post-terminal activation and release evidence

Change 252 MUST be represented as the sole active implementation change before production implementation begins, without rewriting the VERIFIED history of Changes 001–251. Historical non-ancestral release evidence MUST remain distinguishable from current release authority, and final candidate validation MUST continue to require lineage-valid exact-SHA canonical CI evidence rather than weakening ancestry or green-job checks.

#### Scenario: Activate a new post-terminal epoch
- **GIVEN** Change 251 is VERIFIED/archived and the prior state is terminal with no next change
- **WHEN** Change 252 begins implementation
- **THEN** the canonical sequence/state identifies `252-live-world-architecture-convergence` as the one active change
- **AND** 251 remains the last completed change until 252 is verified
- **AND** historical 001–251 artifacts are not renumbered or rewritten as incomplete.

#### Scenario: Preserve orphaned historical evidence honestly
- **GIVEN** a historical release-evidence SHA is not an ancestor of the current repository head
- **WHEN** state validation evaluates an ACTIVE post-terminal epoch
- **THEN** that SHA can be represented only as historical/non-authoritative evidence
- **AND** it is not relabeled as the current release candidate
- **AND** the historical record is not deleted merely to make validation pass.

#### Scenario: Close on exact current-lineage evidence
- **GIVEN** implementation is otherwise complete
- **WHEN** Change 252 is proposed for VERIFIED/terminal status
- **THEN** current release authority identifies a lineage-valid full commit SHA
- **AND** canonical GitHub Actions `gate` and `e2e` jobs for that exact candidate have SUCCESS conclusions
- **AND** the evidence is recorded by a later commit so the candidate does not claim its own SHA.

### Requirement REQ-2: One canonical live block-state authority

The playable world MUST have exactly one writable authoritative block-state store based on dimension-aware column/section storage. All live block reads and writes MUST resolve through that authority. The legacy slab and state overlay MUST NOT remain independent writable production authorities.

#### Scenario: Read through canonical state
- **GIVEN** a canonical block state exists at an in-range world coordinate
- **WHEN** gameplay reads the block through either the state API or the compatibility block-id API
- **THEN** both projections describe the same canonical state
- **AND** the block-id projection equals the canonical state's block id.

#### Scenario: Write a default-state block
- **GIVEN** gameplay writes a block by block id at an in-range coordinate
- **WHEN** the write commits
- **THEN** the registered default `BlockState` for that block id is stored canonically
- **AND** subsequent state and block-id reads observe that same value
- **AND** no parallel overlay/slab copy is required to preserve the write.

#### Scenario: Preserve a stateful write
- **GIVEN** a non-default valid `BlockState` with properties
- **WHEN** gameplay writes and later reads that state
- **THEN** the exact canonical state id/properties are preserved
- **AND** no conversion to a bare block id loses those properties.

#### Scenario: Audit remaining legacy references
- **GIVEN** Change 252 implementation is complete
- **WHEN** the post-migration repository audit scans legacy store symbols/keys
- **THEN** no production occurrence is an unclassified writable authority
- **AND** every retained occurrence is explicitly test-only, migration-only, or a read/projection compatibility adapter with documented disposition.

### Requirement REQ-3: Live Overworld dimension bounds and coordinate correctness

The playable single-player Overworld MUST use `OVERWORLD_DIMENSION_TYPE` with addressable block Y `[-64,319]`. Coordinate routing MUST be negative-safe and section-correct. Out-of-range reads/writes MUST be safe and MUST NOT materialize canonical storage.

#### Scenario: Lower bound
- **GIVEN** an otherwise valid world coordinate
- **WHEN** `y=-64` is read/written
- **THEN** the coordinate is in range and routes to the correct negative section/local coordinate.

#### Scenario: Below lower bound
- **GIVEN** no materialized storage is required at the target
- **WHEN** `y=-65` is read or written
- **THEN** the read returns the documented empty/out-of-range result
- **AND** the write has no world-state effect
- **AND** no column/section is allocated by that operation.

#### Scenario: Upper bound
- **GIVEN** an otherwise valid world coordinate
- **WHEN** `y=319` is read/written
- **THEN** the coordinate is in range and routes to the highest valid Overworld section.

#### Scenario: Above upper bound
- **GIVEN** no materialized storage is required at the target
- **WHEN** `y=320` is read or written
- **THEN** the operation cannot mutate canonical state
- **AND** it does not allocate a section.

#### Scenario: Section and sign boundaries
- **GIVEN** coordinates crossing `-1/0`, `15/16`, and `63/64` in Y and negative x/z chunk boundaries
- **WHEN** blocks are read/written
- **THEN** floor-division and local-coordinate routing selects the correct column/section/local cell
- **AND** no negative modulo bug aliases a different cell.

### Requirement REQ-4: Lazy, bounded column/section residency

Canonical columns and sections MUST remain lazy: reads of absent air MUST NOT allocate storage, and loading one horizontal Overworld column MUST NOT imply eager allocation or meshing of all 24 vertical sections. Residency/unload behavior MUST remain bounded under exploration.

#### Scenario: Read absent air
- **GIVEN** a valid in-range coordinate whose column/section has never been materialized
- **WHEN** the block state is read
- **THEN** air is returned
- **AND** the materialized column/section counts do not increase.

#### Scenario: Sparse high/low edits
- **GIVEN** an empty canonical column
- **WHEN** one block is written in a low section and one in a high section
- **THEN** only sections necessary for those writes and required metadata are materialized
- **AND** untouched vertical sections remain absent.

#### Scenario: Exploration churn
- **GIVEN** a bounded render/simulation distance and a long teleport/exploration sequence
- **WHEN** old columns leave residency
- **THEN** resident columns/sections/geometries/pending jobs converge within measured bounds
- **AND** unloaded clean resources are released.

### Requirement REQ-5: Modern Overworld generation and streaming feed canonical storage

The live missing-column generation path MUST use the verified modern Overworld generation architecture or an explicitly composed adapter over it, and generated output MUST commit into canonical block states across the true dimension range. Streaming/readiness MUST operate on canonical column/section lifecycle rather than independent 64-high authoritative slabs.

#### Scenario: Generate a new column
- **GIVEN** a seed and a missing in-range Overworld column
- **WHEN** the live game generates that column
- **THEN** generation is deterministic for the seed/coordinates
- **AND** produced blocks populate canonical sections at their world Y coordinates
- **AND** the column is not represented as six independently authoritative legacy slabs.

#### Scenario: Preserve user edits over generated baseline
- **GIVEN** a generated column with a durable user edit
- **WHEN** the column unloads and later regenerates/loads
- **THEN** the durable edit remains authoritative at its coordinate
- **AND** baseline generation does not overwrite it.

#### Scenario: Stream through vertical content
- **GIVEN** a resident horizontal column with non-air content in multiple vertical sections
- **WHEN** the player traverses those heights
- **THEN** required sections can become render/simulation ready without changing the column's canonical block truth
- **AND** unrelated empty sections need not allocate.

#### Scenario: Spawn/readiness
- **GIVEN** a fresh playable Overworld
- **WHEN** startup readiness and spawn selection complete
- **THEN** they use dimension-aware surface/bounds semantics
- **AND** startup remains bounded without assuming the surface is within `0..63`.

### Requirement REQ-6: Section-scoped meshing, lighting, and stale-result safety

Live meshing and lighting MUST consume canonical section/block-state data and dimension bounds. Mesh identity/versioning MUST be section-scoped, and stale/duplicate/mismatched asynchronous results MUST NOT replace current geometry.

#### Scenario: Edit inside one section
- **GIVEN** a resident meshed section
- **WHEN** one interior block changes
- **THEN** that section's mesh version/dirty state advances
- **AND** unrelated vertical sections are not remeshed solely because they share a column.

#### Scenario: Edit on a section face
- **GIVEN** adjacent existing sections sharing a horizontal or vertical face
- **WHEN** a block on that face changes
- **THEN** the affected section and required face-sharing neighbor are invalidated
- **AND** no non-neighbor section is invalidated without a documented dependency.

#### Scenario: Stale worker response
- **GIVEN** a mesh/light job was submitted for an earlier section identity/version
- **WHEN** the section changes, unloads, or is replaced before the response arrives
- **THEN** the response is discarded without replacing current geometry/state
- **AND** pending-job accounting remains bounded.

#### Scenario: Dimension-aware light query
- **GIVEN** canonical content below Y=0 or near Y=319
- **WHEN** skylight/block-light/AO/vertex-light inputs are evaluated for live rendering
- **THEN** sampling honors the Overworld dimension bounds and canonical neighboring states
- **AND** no hidden 0..63 clamp changes the result.

### Requirement REQ-7: Gameplay and simulation operate across canonical vertical world access

Every live gameplay/simulation consumer discovered by the pre-migration audit MUST use canonical dimension-aware world access or an equivalent read/projection adapter over it. Core interaction MUST work across negative Y and section boundaries without duplicating block truth.

#### Scenario: Player movement below zero
- **GIVEN** generated/canonical terrain below Y=0
- **WHEN** the player moves/collides through it
- **THEN** collision resolution observes canonical shapes/blocks
- **AND** the player is neither allowed through solid terrain nor blocked by nonexistent legacy-slab bounds.

#### Scenario: Mine and place across a vertical section boundary
- **GIVEN** target cells at Y=15 and Y=16 (and equivalently 63/64)
- **WHEN** the player mines/places blocks across the boundary
- **THEN** canonical states update in the correct sections
- **AND** selection/collision/render invalidation observes the updates.

#### Scenario: Tick-driven mutation outside legacy range
- **GIVEN** a live tickable block/fluid/falling-block behavior at a valid negative-Y or upper-section coordinate
- **WHEN** its scheduled/random/live update runs
- **THEN** reads/writes use canonical in-range access
- **AND** the update is not skipped merely because the coordinate lies outside 0..63.

#### Scenario: Entity/block-entity column lifecycle
- **GIVEN** entities or block entities located in a canonical column at any valid Y
- **WHEN** the column unloads and reloads
- **THEN** lifecycle/persistence associates them with the same world positions exactly once
- **AND** no duplicate or orphan instance is created by vertical-section migration.

### Requirement REQ-8: Legacy world compatibility and durable canonical persistence

Existing durable world data accepted before Change 252 MUST remain recoverable through a versioned deterministic migration/compatibility path. Canonical column/block-state data MUST persist through existing repository/migration infrastructure, and migration/save failures MUST be visible without silently destroying the only recoverable state.

#### Scenario: Migrate a valid legacy world
- **GIVEN** a supported legacy world/edit payload
- **WHEN** the world is opened after Change 252
- **THEN** its semantic block edits are converted/resolved into canonical states at the same coordinates
- **AND** successful durable canonical commit preserves player/entity/block-entity associations
- **AND** normal play continues from canonical storage.

#### Scenario: Preserve stateful properties
- **GIVEN** a durable stateful block whose property-bearing state is representable in the supported source format
- **WHEN** it is saved, unloaded, reloaded, exported, and imported
- **THEN** the canonical block-state id/properties remain equivalent through every round trip.

#### Scenario: Idempotent migration
- **GIVEN** a legacy world has completed canonical migration once
- **WHEN** startup/migration logic runs again
- **THEN** no duplicate column, edit, entity, block entity, furnace inventory, or item entity is created
- **AND** canonical state remains unchanged except normal runtime evolution.

#### Scenario: Migration/write failure
- **GIVEN** quota/storage/corruption/partial-write failure prevents durable canonical commit
- **WHEN** migration or unload-save runs
- **THEN** the failure is surfaced through the existing health/blocking mechanism
- **AND** the only recoverable legacy/canonical dirty state is not silently discarded
- **AND** completion is not recorded falsely.

### Requirement REQ-9: Existing live furnace and core gameplay regressions are prohibited

Change 252 MUST preserve the verified Change-251 furnace live journey and previously passing core playable interactions unless a behavior is explicitly changed by this specification. Any migration-induced regression at Critical/High severity MUST be fixed before verification.

#### Scenario: Furnace full lifecycle
- **GIVEN** the live furnace integration verified by Change 251
- **WHEN** a player places, opens, inserts fuel/input, smelts, collects output, walks away, saves/reloads, unloads/reloads, and breaks the furnace
- **THEN** inventory, cook/burn state, XP, persistence and break semantics remain correct
- **AND** no duplication, loss or resurrection is introduced by column migration.

#### Scenario: Existing core E2E suite
- **GIVEN** a previously passing mandatory playable scenario
- **WHEN** the full E2E suite runs on Change 252
- **THEN** it passes or any intentional contract change is explicitly authorized and re-specified
- **AND** an unexplained regression blocks verification.

### Requirement REQ-10: Resource and performance behavior remains bounded and evidence-based

The modern-height migration MUST NOT rely on eager full-height allocation/meshing or unbounded job/resource growth. Any release-budget change MUST be justified by measured architecture evidence rather than raising thresholds to hide a regression.

#### Scenario: Sparse modern-height column
- **GIVEN** a resident column whose world data is non-air in only a few sections
- **WHEN** resource accounting is sampled
- **THEN** allocated sections and section geometries scale with actual materialized/rendered sections rather than a fixed 24-per-column allocation.

#### Scenario: Dense edit stress
- **GIVEN** a bounded dense-edit workload
- **WHEN** generation/mesh/light/save pipelines are stressed
- **THEN** queue/job/resource counts remain bounded by documented backpressure/resource limits
- **AND** stale jobs/resources are released.

#### Scenario: Budget modification
- **GIVEN** an existing release/resource threshold appears incompatible with the new architecture
- **WHEN** an executor changes that threshold
- **THEN** verification contains before/after measurements and a unit-semantics rationale
- **AND** the threshold is not changed solely to convert a failing measurement into PASS.

### Requirement REQ-11: Whole-codebase pre/post audit covers downstream effects

Change 252 MUST include repository-wide consumer/dependency audits before and after implementation. The post-migration audit MUST leave no unclassified Critical/High legacy-world integration, data-loss, correctness, concurrency, performance, or architecture finding.

#### Scenario: Pre-migration inventory
- **GIVEN** production implementation has not begun
- **WHEN** the legacy-consumer audit runs
- **THEN** direct and downstream consumers across source/tests/config/persistence/render/simulation are inventoried
- **AND** each relevant occurrence receives a disposition/task owner rather than reviewing only recently changed files.

#### Scenario: Post-migration scan
- **GIVEN** implementation tasks are complete
- **WHEN** the same/broader audit is repeated
- **THEN** every remaining legacy occurrence is classified
- **AND** any remaining Critical/High production authority or unsafe compatibility path blocks verification until fixed.

#### Scenario: Changed-code downstream review
- **GIVEN** a migrated subsystem has downstream callers not directly edited
- **WHEN** the final adversarial review runs
- **THEN** those callers and relevant tests are reviewed for behavioral/regression impact
- **AND** discovered Critical/High regressions receive fixes plus regression oracles.

### Requirement REQ-12: Full certification and publication gate

Change 252 MUST reach 100% task completion with every normative scenario evidenced, all mandatory local repository gates passing, no unresolved Critical/High blocker, and exact-SHA canonical CI success before it is VERIFIED/archived. Final state and the planner handoff MUST match the published repository truth.

#### Scenario: Local full gate
- **GIVEN** implementation is proposed complete
- **WHEN** required local validation runs
- **THEN** state validation, typecheck, lint, unit, coverage, build, dependency audits, file audit, targeted stress/regression checks, and full E2E satisfy repository thresholds
- **AND** failures/skips are not hidden as passes.

#### Scenario: Canonical CI failure
- **GIVEN** a published candidate whose canonical `gate` or `e2e` job fails
- **WHEN** verification is evaluated
- **THEN** Change 252 remains not VERIFIED
- **AND** the failure is diagnosed/fixed/re-published before another candidate is evaluated.

#### Scenario: Verified archival
- **GIVEN** all tasks/scenarios/gates including exact-SHA canonical CI are complete
- **WHEN** the change closes
- **THEN** OpenSpec/state/parity evidence is reconciled to actual implementation
- **AND** the change is archived according to repository convention
- **AND** `.agent/EXECUTION_PROMPT.md` is marked `COMPLETED`
- **AND** final `origin/main` equals the reported published head.

## Error and failure behavior

Failure requirements are expressed explicitly in REQ-3, REQ-6, REQ-8, REQ-11, and REQ-12. Out-of-range access is non-mutating/non-allocating; stale asynchronous results are discarded; durable migration/save failure retains recoverable state and blocks false completion; CI/local-gate failures block verification.

## Performance and resource bounds

REQ-4 and REQ-10 define the required resource behavior. Exact numeric budgets remain those of current validated release/resource gates unless measured evidence during this change justifies a dimension/unit correction. Empty-section laziness, section-scoped remesh/lighting, bounded queues/backpressure, and convergence under exploration churn are mandatory scenarios.

## Compatibility and migration

REQ-8 governs supported legacy data. The implementation should prefer read-old/write-new versioned migration over permanent dual-write compatibility. The exact set of supported legacy payloads is determined and frozen by the pre-migration characterization inventory before production migration code changes.

## Security and integrity

The primary integrity risks are silent data loss, duplicated authoritative state, corrupted migration, stale asynchronous writes, false verification evidence, and uncontrolled resource growth. REQ-1, REQ-2, REQ-6, REQ-8, REQ-10, REQ-11, and REQ-12 provide pass/fail scenarios for those risks. Existing repository dependency/security audit requirements remain part of the final gate.

## Observability

Verification should expose active dimension id/bounds, resident canonical columns, allocated sections, dirty columns/sections, pending generation/mesh/light jobs, section geometry count, entity/block-entity counts, storage health, and migration status through production-safe or test-only projections of canonical state. Observability must not introduce a separate mutation path.

## Verification mapping

| Requirement | Primary evidence |
|---|---|
| REQ-1 | State/sequence diff, validator tests, `npm run validate-state`, canonical CI evidence |
| REQ-2 | World/storage unit+integration tests, pre/post legacy scan |
| REQ-3 | Boundary/negative-coordinate unit+integration tests |
| REQ-4 | allocation/residency tests and memory stress metrics |
| REQ-5 | modern worldgen/streaming integration and deterministic fixtures |
| REQ-6 | section mesh/light tests, worker stale-result tests, visual/integration evidence |
| REQ-7 | gameplay/simulation integration and negative-Y E2E |
| REQ-8 | migration/repository/recovery/import-export tests |
| REQ-9 | Change-251 furnace tests/E2E plus complete regression suite |
| REQ-10 | resource/performance measurements and stress tests |
| REQ-11 | machine-checkable pre/post audit artifacts and final adversarial review |
| REQ-12 | full local gate, published candidate, canonical exact-SHA `gate`+`e2e`, archival/state evidence |
