# Spec: live-world-architecture

## Contract

This specification governs Change `253-live-world-architecture-convergence`. It applies to the actual playable single-player runtime, not only isolated/headless primitives. Mandatory behavior uses MUST/SHALL/MUST NOT language and is blocking until verified.

## Definitions

- **Canonical world store**: the one writable live block-state authority backed by dimension-aware `ChunkColumn`/`ChunkSection` storage, directly or through a thin facade over `VerticalWorldAccess`.
- **Legacy slab**: the historical `Chunk` representation whose live configured vertical span is 16×64×16 and whose primary storage is bare block IDs.
- **Canonical column**: one horizontal `(chunkX,chunkZ)` column containing lazily materialized vertical sections.
- **Section identity**: `(chunkX,sectionY,chunkZ)` or an equivalent typed key uniquely identifying one canonical 16³ section.
- **Property-bearing state**: a `BlockState` whose semantics cannot be represented safely by block ID alone.
- **Legacy durable data**: any world/edit payload accepted by the pre-253 shipped runtime.
- **Historical release evidence**: preserved evidence from an older program epoch that is not current-candidate authority.
- **Current release evidence**: evidence intended to prove the exact 253 terminal candidate.

## Invariants

1. One writable live block-state authority.
2. Playable Overworld block Y is `[-64,319]`.
3. Negative coordinate routing is floor-division correct.
4. Out-of-range/absent reads are non-allocating.
5. Sections are lazy.
6. Property-bearing states survive live/durable round trips.
7. Dirty/save/unload behavior cannot silently lose state.
8. Async worker results cannot overwrite newer/unloaded state.
9. Entity/block-entity restoration is exactly once.
10. Resource/job growth is bounded under configured residency/backpressure.
11. Existing-world migration is deterministic/idempotent/non-destructive until canonical commit.
12. Final release evidence remains exact-SHA and lineage-valid.

## Requirements

### Requirement REQ-1: Truthful 253 activation and post-terminal governance

253 MUST become the sole ACTIVE change before production implementation. VERIFIED history of 001–252/254 MUST remain historically truthful. The control plane MUST represent historical non-authoritative release evidence separately from current candidate evidence, and final verification MUST retain strict exact-SHA/ancestry/canonical-job requirements.

#### Scenario: Activate owner-authorized reserved change
- **GIVEN** 254 is VERIFIED and program state says to await authorization for reserved 253
- **WHEN** 253 production implementation begins
- **THEN** canonical sequence/state identifies `253-live-world-architecture-convergence` as the sole ACTIVE change
- **AND** 254 remains last completed until 253 verifies
- **AND** historical numbered artifacts are not rewritten as incomplete.

#### Scenario: Shallow CI validation
- **GIVEN** CI performs a shallow checkout and state validation needs ancestry evidence
- **WHEN** canonical validation runs
- **THEN** the workflow/validator obtains enough truthful history or uses a schema that explicitly distinguishes historical evidence
- **AND** ancestry checks are not silently disabled.

#### Scenario: Final release proof
- **GIVEN** all implementation tasks appear complete
- **WHEN** 253 is proposed for VERIFIED status
- **THEN** current release authority identifies a full candidate SHA in current lineage
- **AND** required canonical `gate` and `e2e` jobs for that exact candidate are SUCCESS
- **AND** evidence is recorded without a commit falsely claiming its own SHA.

### Requirement REQ-2: Exactly one writable canonical world authority

The playable world MUST route all authoritative block-state reads/writes through the canonical dimension-aware store. Legacy `Chunk`, edit/state overlays, caches, or adapters MUST NOT remain independent writable sources of truth.

#### Scenario: Compatibility block-ID read
- **GIVEN** a canonical property-bearing or default block state at a coordinate
- **WHEN** a compatibility `getBlock()`-style caller requests a block ID
- **THEN** the result equals the canonical state's `blockId`
- **AND** no slab/overlay lookup is required to determine truth.

#### Scenario: Compatibility block-ID write
- **GIVEN** a valid block ID and in-range coordinate
- **WHEN** legacy-compatible code writes by ID
- **THEN** the registered default `BlockState` is written canonically
- **AND** subsequent state/ID reads agree
- **AND** no second writable copy is created.

#### Scenario: Property-bearing write
- **GIVEN** a valid non-default `BlockState`
- **WHEN** it is written and read back
- **THEN** exact state semantics/properties are preserved
- **AND** no flattening to bare ID occurs.

#### Scenario: Post-audit authority scan
- **GIVEN** implementation is complete
- **WHEN** the exhaustive scanner finds remaining legacy-store references
- **THEN** every occurrence is classified as non-authoritative/test/migration/projection compatibility or blocks verification
- **AND** no unclassified production writable authority remains.

### Requirement REQ-3: Dimension-derived Overworld bounds and coordinate correctness

The real playable Overworld MUST bind `OVERWORLD_DIMENSION_TYPE`. Valid block Y MUST be `[-64,319]`. Bounds, section ranges and vertical iteration SHALL derive from the dimension contract rather than legacy chunk height literals.

#### Scenario: Lower valid bound
- **GIVEN** an otherwise valid coordinate
- **WHEN** Y is `-64`
- **THEN** read/write is in range and routes to the correct negative section/local Y.

#### Scenario: Below lower bound
- **GIVEN** no preexisting allocation is required
- **WHEN** Y is `-65`
- **THEN** read returns documented empty/out-of-range behavior
- **AND** write has no world-state effect
- **AND** no column/section is allocated.

#### Scenario: Upper valid bound
- **GIVEN** an otherwise valid coordinate
- **WHEN** Y is `319`
- **THEN** read/write is in range and routes to the highest valid section.

#### Scenario: Above upper bound
- **GIVEN** no preexisting allocation is required
- **WHEN** Y is `320`
- **THEN** mutation is rejected/no-op per API
- **AND** no section is allocated.

#### Scenario: Negative and section boundaries
- **GIVEN** coordinates crossing `-17/-16`, `-1/0`, `15/16`, `31/32`, `63/64` and equivalent X/Z boundaries
- **WHEN** reads/writes are performed
- **THEN** floor division/local-coordinate routing selects the exact intended cell
- **AND** negative modulo cannot alias a different cell.

### Requirement REQ-4: Lazy and bounded column/section residency

Canonical storage MUST remain lazy. An absent-air read MUST NOT allocate a section. Horizontal column residency MUST NOT imply eager allocation/meshing of all possible vertical sections. Residency/resources MUST converge within measured bounds under exploration/unload.

#### Scenario: Read untouched air
- **GIVEN** a valid coordinate in a never-materialized section
- **WHEN** canonical block state is read
- **THEN** air is returned
- **AND** allocated section count does not increase.

#### Scenario: Sparse edits
- **GIVEN** an otherwise empty column
- **WHEN** blocks are written in two distant vertical sections
- **THEN** only required sections/metadata materialize
- **AND** untouched sections remain absent.

#### Scenario: Exploration churn
- **GIVEN** bounded render/simulation distance and a long teleport/exploration workload
- **WHEN** old columns leave residency
- **THEN** resident columns, sections, geometries and pending jobs plateau within documented limits
- **AND** clean unloaded resources are released.

### Requirement REQ-5: Modern generation feeds canonical storage

The live missing-column generation path MUST produce canonical block states into canonical columns/sections using the verified modern generation architecture or an explicitly documented compatible adapter. Six independent 64-high authoritative slabs MUST NOT be the final representation.

#### Scenario: Fresh generated column
- **GIVEN** a seed/world version and missing column
- **WHEN** live generation completes
- **THEN** output is deterministic for the same inputs
- **AND** blocks are stored at true world Y in canonical sections
- **AND** readiness/status describes the canonical column.

#### Scenario: Existing world with sparse edits
- **GIVEN** a legacy world whose durable representation is compatible baseline + edits
- **WHEN** it loads under 253
- **THEN** the compatible baseline semantics are preserved
- **AND** durable edits override generated baseline
- **AND** no user edit is overwritten by regeneration.

#### Scenario: Spawn readiness
- **GIVEN** a new/loadable playable world
- **WHEN** preload/readiness/spawn selection runs
- **THEN** it uses dimension-aware canonical height/surface information
- **AND** does not assume the surface lies in 0..63.

### Requirement REQ-6: Section-scoped meshing and stale-result safety

Live mesh ownership and invalidation MUST align with canonical section identity/version. Async results MUST NOT replace current geometry when identity/residency/version is stale.

#### Scenario: Interior block edit
- **GIVEN** a meshed resident section
- **WHEN** an interior block changes
- **THEN** that section is invalidated/versioned
- **AND** unrelated sections are not remeshed solely because they share a column.

#### Scenario: Section-face edit
- **GIVEN** an existing face-sharing neighbor section
- **WHEN** a boundary block changes
- **THEN** the affected section and required face-sharing neighbor are invalidated
- **AND** non-neighbor sections are not invalidated without a documented dependency.

#### Scenario: Stale worker response
- **GIVEN** a render/light job captured an older identity/version
- **WHEN** the section changes/unloads/replaces before result arrival
- **THEN** the result is discarded safely
- **AND** current geometry/state is unchanged
- **AND** job accounting is decremented exactly once.

### Requirement REQ-7: Dimension-aware live lighting

Live skylight, blocklight, AO and related neighbor sampling MUST consume canonical states and active dimension bounds. Hidden legacy 0..63 clamps MUST NOT affect valid negative/high-Y content.

#### Scenario: Negative-Y lighting
- **GIVEN** canonical content below Y=0
- **WHEN** lighting/meshing samples neighbors
- **THEN** values are derived from canonical in-range states
- **AND** the content is not treated as out of world solely because Y is negative.

#### Scenario: Top boundary lighting
- **GIVEN** content at/near Y=319
- **WHEN** skylight or neighbor sampling crosses the top boundary
- **THEN** above-world behavior follows dimension policy
- **AND** no out-of-range allocation occurs.

#### Scenario: Light update after edit
- **GIVEN** a light-affecting block changes on a vertical section boundary
- **WHEN** incremental removal/repropagation runs
- **THEN** affected sections converge to the correct light state
- **AND** no persistent seam remains after remesh.

### Requirement REQ-8: Gameplay and simulation consume canonical world access

All live gameplay/simulation consumers discovered by the pre-audit MUST use canonical dimension-aware access or a read/projection adapter over it. Valid negative/high-Y coordinates MUST participate in normal gameplay.

#### Scenario: Player collision below zero
- **GIVEN** canonical solid terrain below Y=0
- **WHEN** the player moves through it
- **THEN** collision observes canonical shapes/blocks
- **AND** the player neither clips through solids nor collides with imaginary legacy bounds.

#### Scenario: Mine/place across vertical boundary
- **GIVEN** target cells straddling a section boundary such as 15/16 or 63/64
- **WHEN** the player mines/places
- **THEN** the correct canonical sections mutate
- **AND** render/light/persistence consequences observe the same truth.

#### Scenario: Tick-driven mutation outside old slab assumptions
- **GIVEN** a valid tickable/block/fluid behavior at negative or upper-section Y
- **WHEN** its scheduled/random/live update runs
- **THEN** canonical reads/writes execute normally
- **AND** the update is not skipped because the coordinate lies outside historical 0..63.

### Requirement REQ-9: Entity and block-entity lifecycle remains exactly once

Column migration/residency MUST preserve stable entity/block-entity identity across load/unload/reload. Vertical section representation MUST NOT duplicate ownership.

#### Scenario: Block entity unload/reload
- **GIVEN** a persistent block entity at any valid Y
- **WHEN** its column unloads then reloads
- **THEN** exactly one logical instance is restored at the same position/state
- **AND** inventory/timer data is neither lost nor duplicated.

#### Scenario: Entity unload/reload
- **GIVEN** a persistent entity in a canonical column
- **WHEN** residency cycles
- **THEN** entity identity/state is restored exactly once
- **AND** no duplicate/resurrected instance appears from section-level storage changes.

### Requirement REQ-10: Durable canonical persistence and safe legacy migration

Every supported pre-253 durable world format MUST remain recoverable through deterministic, versioned compatibility/migration. Canonical block-state data MUST use existing repository/migration infrastructure rather than a competing save system. Failures MUST be visible and MUST NOT silently destroy the only recoverable state.

#### Scenario: Valid legacy migration
- **GIVEN** a supported legacy payload
- **WHEN** the world opens under 253
- **THEN** semantic edits resolve to canonical states at the same coordinates
- **AND** canonical durable commit succeeds before migration completion is recorded
- **AND** associated player/entity/block-entity state remains coherent.

#### Scenario: Idempotent retry/startup
- **GIVEN** migration completed once
- **WHEN** startup/migration logic runs again
- **THEN** canonical state is not duplicated
- **AND** edits/entities/block entities/inventories/item entities remain exactly once.

#### Scenario: Save/migration failure
- **GIVEN** quota, private mode, corruption, partial write or repository failure
- **WHEN** canonical save/migration cannot durably commit
- **THEN** the failure is surfaced through storage health/blocking behavior
- **AND** dirty/recoverable source state remains retained/retriable
- **AND** success is not recorded falsely.

#### Scenario: Import/export round trip
- **GIVEN** canonical columns plus associated player/entity/block-entity state
- **WHEN** export then import completes
- **THEN** semantically equivalent canonical state is restored
- **AND** property-bearing states are not flattened or duplicated.

### Requirement REQ-11: Property-bearing states survive all required round trips

Block-state properties MUST remain semantically equivalent through canonical mutation, unload/reload, save/reload and import/export. Compatibility APIs MUST NOT silently reduce property-bearing states to bare IDs.

#### Scenario: Live round trip
- **GIVEN** a non-default valid state
- **WHEN** it is written, section/column unloads, and reloads
- **THEN** the same state semantics are observed.

#### Scenario: Durable round trip
- **GIVEN** a persistent non-default state
- **WHEN** game save/reload and export/import occur
- **THEN** state properties remain equivalent in every restored representation.

### Requirement REQ-12: Performance/resource behavior remains bounded and evidence-based

253 MUST NOT introduce eager full-height allocation, unbounded worker/resource growth, or unexplained material regression in semantically comparable Change-254 hot paths. Budget changes MUST be justified by measured unit/architecture changes rather than threshold inflation.

#### Scenario: Sparse modern-height column
- **GIVEN** a resident column with content in few sections
- **WHEN** resource metrics are sampled
- **THEN** allocated sections/geometries scale with materialized/rendered content
- **AND** a fixed 24-section allocation is not required.

#### Scenario: Dense edit stress
- **GIVEN** bounded dense multi-section edits
- **WHEN** generation/mesh/light/save pipelines are stressed
- **THEN** queues/resources remain within documented backpressure bounds
- **AND** one edit does not cause unconditional full-column remesh/relight.

#### Scenario: Budget change
- **GIVEN** old resource units no longer describe canonical architecture
- **WHEN** a release threshold changes
- **THEN** verification records old/new units and before/after measurements
- **AND** rationale explains the architectural meaning
- **AND** the change is not made solely to convert failure into pass.

#### Scenario: Comparable 254 benchmark
- **GIVEN** a 254 benchmark remains semantically applicable
- **WHEN** it is run after migration
- **THEN** any material regression is investigated and resolved or explicitly blocked
- **AND** no benchmark is removed merely because it regressed.

### Requirement REQ-13: Exhaustive pre/post repository audit

253 MUST run a machine-checkable whole-repository legacy-world consumer scan before production migration and again after implementation. Every relevant occurrence MUST have a disposition and task owner. No unresolved Critical/High production split-truth, data-loss, correctness, stale-worker, compatibility or resource defect may remain at verification.

#### Scenario: Pre-audit coverage
- **GIVEN** production world changes have not begun
- **WHEN** the scanner runs
- **THEN** tracked source/tests/config/scripts/OpenSpec are scanned
- **AND** required pattern families from `audit-findings.md` are classified
- **AND** every production hit has an owning task/disposition.

#### Scenario: Post-audit closure
- **GIVEN** implementation tasks are complete
- **WHEN** the scanner and downstream dependency audit rerun
- **THEN** zero unclassified production hits remain
- **AND** every Critical/High finding is fixed or proven not applicable with evidence
- **AND** Medium/Low residual debt is explicitly recorded rather than hidden.

### Requirement REQ-14: Real playable vertical-world certification

At least one Playwright/live-game journey MUST prove the canonical architecture through the normal `Game` composition root rather than only direct unit construction.

#### Scenario: Negative-Y + section-boundary + durable journey
- **GIVEN** the game boots normally
- **WHEN** the test reaches or deterministically prepares valid content below Y=0, crosses/edits a vertical section boundary, mutates a property-bearing state, saves/reloads, and cycles column residency
- **THEN** player collision/interaction/rendering observe canonical truth
- **AND** exact state survives save/reload and unload/reload
- **AND** no legacy-only debug mutation is used as a shortcut to satisfy the requirement.

### Requirement REQ-15: Full regression and publication gate

Previously passing mandatory behavior MUST remain passing unless an explicit 253 normative requirement intentionally changes it. 253 MUST close with repository gates, stress/bench evidence, exact publication to `origin/main`, and canonical CI required by governance.

#### Scenario: Full local gate
- **GIVEN** 253 implementation is ready for verification
- **WHEN** mandatory local commands run
- **THEN** `validate-state`, typecheck, lint, unit, coverage policy, build and full E2E satisfy repository requirements
- **AND** any pre-existing failure classification is demonstrated against `session_start_head`, not asserted without evidence.

#### Scenario: Exact published candidate
- **GIVEN** local verification is complete
- **WHEN** the candidate is pushed
- **THEN** remote `origin/main` is refetched and exact published SHA recorded
- **AND** required canonical CI jobs correspond to that exact candidate/evidence protocol
- **AND** a failed mandatory canonical job blocks VERIFIED status until repaired.

## Error and failure behavior

- Invalid/out-of-range world writes have no canonical mutation/allocation.
- Corrupt/unsupported durable data fails visibly; recoverable source is not silently overwritten.
- Dirty unload failure retains/requeues state.
- Stale async results are discarded safely and accounting remains correct.
- Generation failure does not expose a partially generated column as complete.
- Entity/block-entity restoration deduplicates stable identity.
- Validation/CI evidence mismatch blocks verification; evidence is never fabricated.

## Performance and resource bounds

Exact numeric ceilings may continue to use repository release budgets, but their units must describe canonical columns/sections/jobs. Mandatory qualitative bounds:

- absent-air read allocates zero sections;
- sparse column does not allocate all 24 sections by default;
- one interior block edit does not force full-column remesh/relight;
- queue/residency/resource counts plateau under bounded churn;
- comparable Change-254 hot paths do not regress materially without a blocking investigation.

## Compatibility and migration

Backward compatibility is mandatory for all pre-253 formats actually accepted by the runtime. Unsupported future/corrupt formats may reject explicitly. Existing-world generation semantics must not silently change merely because live storage becomes modern-height.

## Security and integrity

This campaign has no new authentication boundary, but data integrity is critical. Persistent writes/migrations must reject malformed records, avoid silent truncation/duplication, and preserve exact release-evidence truth. No history rewrite/force-push is permitted by this spec.

## Observability

Verification/debugging SHOULD expose read-only canonical metrics for active dimension bounds, resident columns, allocated sections, dirty state, pending generation/mesh/light/save jobs, geometry counts, entities/block entities, stale-job rejects and storage/migration health. Debug hooks MUST project canonical truth and MUST NOT maintain a hidden writable legacy store.

## Verification mapping

- REQ-1 -> Phase 0 governance tests + canonical state/CI evidence.
- REQ-2/3/4 -> canonical storage/coordinate/lazy-allocation unit + integration tests.
- REQ-5 -> deterministic worldgen + live readiness/spawn integration.
- REQ-6/7 -> section mesh/light boundary and stale-job tests + visual/E2E evidence.
- REQ-8/9 -> gameplay/simulation/entity lifecycle integration + E2E.
- REQ-10/11 -> legacy fixtures, migration idempotency/failure, save/reload/import/export tests.
- REQ-12 -> Change-254 benches + resource/stress metrics.
- REQ-13 -> pre/post machine inventory + adversarial downstream audit.
- REQ-14 -> mandatory normal-composition Playwright journey.
- REQ-15 -> full local gate + exact published-head canonical CI.