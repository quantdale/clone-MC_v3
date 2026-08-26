# Proposal: 253-live-world-architecture-convergence

## Problem

The repository has two world architectures that do not yet converge in the playable runtime.

The live game still centers world authority on the original `Chunk`/`ChunkManager` slab path, configured as 16×64×16 in `src/config/index.ts`, while the repository also contains a verified modern vertical model built from `DimensionType`, `VerticalWorldAccess`, `ChunkColumn`, `ChunkSection`, paletted `BlockStateId` storage, section mesh versions, modern-height worldgen, and section persistence.

`Game` does not currently make `OVERWORLD_DIMENSION_TYPE` the authoritative live-world contract, and `World` still carries legacy vertical assumptions plus a separate block-state overlay. The consequence is split-brain world truth: modern capabilities can pass isolated/headless tests while the user-facing game executes a different storage and lifecycle model.

The repository control plane also has a known pre-existing post-terminal CI lineage issue. Completed Change 254 records that canonical `validate-state` fails under shallow-checkout release-SHA ancestry assumptions and assigns that repair to reserved Change 253. This campaign must therefore establish a truthful active post-terminal epoch before changing production world code.

## Goals

- Activate the owner-authorized reserved change as `253-live-world-architecture-convergence` without rewriting historical numbered work.
- Make `OVERWORLD_DIMENSION_TYPE` the live playable Overworld contract with block Y `[-64,319]`.
- Make dimension-aware `ChunkColumn`/`ChunkSection` block states the one writable live world authority.
- Remove the legacy slab and `World` state overlay as independent production sources of truth.
- Migrate generation, streaming, rendering, lighting, collision/raycast, block mutation, simulation, entities/block entities, persistence, import/export, debug hooks, and resource accounting to canonical world access.
- Preserve legacy world/save compatibility through deterministic, idempotent, non-destructive migration.
- Preserve all previously verified playable behavior and the performance improvements/baselines established by Change 254.
- Perform machine-checkable repository-wide pre/post scans so no legacy consumer is missed.
- Close the pre-existing post-terminal state/CI lineage defect without weakening final release-evidence requirements.
- Finish with full local gates plus exact published-head canonical CI evidence required by repository governance.

## Non-goals

- New game content, mobs, bosses, structures, items, dimensions, portals, redstone features, or UI redesign unrelated to convergence.
- Live Nether/End switching or a new multi-dimension UX.
- A third world-storage architecture.
- Rewriting the verified 001–252/254 historical OpenSpec archive.
- Resetting/deleting user worlds to avoid migration work.
- Broad inventory/title-screen refactors unrelated to world integration.
- Raising memory/performance thresholds merely to hide regressions.
- Weakening exact-SHA, ancestry, or canonical-CI verification rules.

## Preconditions

- Current remote `main` is fetched/pruned and `session_start_head` is recorded before executor edits.
- Completed 254 remains VERIFIED and archived.
- `CHANGE_SEQUENCE_OVERRIDES.md` is read and its dual-252/253 renumbering rule is obeyed.
- The current owner instruction authorizing the next campaign is treated as activation authorization for reserved 253.
- All artifacts in this 253 package pass `openspec/SPEC_AUTHORING_PROTOCOL.md` before production code changes.
- Current baseline state/CI defects are reproduced and recorded; failures must not be misrepresented as new 253 regressions.

## Dependencies

Primary existing architecture dependencies include:

- section/column/vertical coordinate and storage foundation: Changes 021–033;
- persistent world storage and migration: 034–043;
- block geometry/rendering/lighting: 056–075;
- worldgen architecture: 085–102;
- dimension infrastructure: later parity changes providing `DimensionType` and Overworld metadata;
- entity/block-entity persistence/lifecycle;
- deterministic simulation/test infrastructure;
- release/performance gates and Change 254 hot-path benchmarks.

Key implementation seams include:

- `src/engine/Game.ts`
- `src/config/index.ts`
- `src/world/World.ts`
- `src/world/Chunk.ts`
- `src/world/ChunkManager.ts`
- `src/world/ChunkColumn.ts`
- `src/world/ChunkSection.ts`
- `src/world/VerticalWorldAccess.ts`
- `src/data/DimensionType.ts`
- `src/worldgen/**`
- `src/rendering/**`
- live lighting/meshing/worker systems discovered by audit
- `src/storage/**`, especially `GamePersistence`, `ChunkSectionRepository`, migrations, dirty-save/autosave
- gameplay/simulation/entity/block-entity consumers found by the mandatory inventory.

## Proposed change

Converge the real playable runtime onto the already-implemented modern world primitives.

First, rebaseline the checkout and activate a truthful 253 post-terminal epoch. Reproduce and repair the known state-validation lineage defect without weakening final proof. Generate a repository-wide legacy-consumer inventory from the actual checkout and add characterization tests around current world/save behavior.

Second, make the live `World` own or wrap a single canonical dimension-aware block-state store. Preserve compatibility APIs only as projections. Remove independent writable slab/overlay state. Convert residency to horizontal columns with lazy vertical sections.

Third, bind `OVERWORLD_DIMENSION_TYPE` in the real composition root and feed the modern generation pipeline into canonical sections. Reconcile readiness, streaming, unload, spawn, rendering, lighting, simulation and gameplay with dimension-aware section identity.

Fourth, route durable state through the existing section-column persistence/migration stack. Legacy payloads must be read-old/write-new, idempotent, failure-visible, and non-destructive until canonical commit succeeds.

Finally, run the same repository-wide audit again, eliminate/classify every remaining legacy occurrence, preserve Change-254 performance properties, execute full gates/E2E/stress, reconcile OpenSpec/state/evidence with the implementation, publish to `origin/main`, and obtain exact candidate canonical CI evidence.

## Compatibility and migration

Existing accepted world/player/entity/block-entity data MUST remain recoverable.

The executor must first characterize every live legacy payload format. If old worlds persist only generated baseline + sparse edits, migration must preserve semantic world identity: reproduce the compatible baseline for that world version/seed and apply durable edits as canonical states. It must not silently reinterpret an old world through a materially different generation baseline unless separately authorized.

Migration SHALL be versioned and idempotent. It MUST NOT destroy or overwrite the only recoverable source until replacement canonical data is durably committed. Re-running startup after success MUST NOT duplicate edits, entities, block entities, inventories, item entities, or other persistent state.

Block-state properties MUST survive canonical write/unload/reload/save/export/import. Bare block IDs are compatibility projections only when that interface intentionally requests an ID/default state.

## Performance and resource position

Change 253 is an architectural migration, not a license for eager full-height allocation.

- Empty/absent sections remain lazy.
- Reads of absent air do not allocate sections.
- Horizontal residency does not imply materializing/meshing every Overworld section.
- Meshing/lighting invalidation is section-scoped.
- Worker queues and stale-result handling remain bounded.
- Existing Change-254 hot-path benchmarks are a regression baseline where semantically comparable.
- If resource units change, measurements and budget semantics must be updated honestly; thresholds may not be inflated to convert regressions into passes.

## Risks

- Large fan-out across generation, rendering, physics/simulation, entities, and persistence.
- Silent world corruption/data loss during migration or dirty unload.
- State-property flattening when bridging old block-ID APIs.
- Mesh/light holes or stale results at vertical section boundaries.
- Performance/memory blowup from eager modern-height materialization.
- Test suites may encode the old 64-high implementation rather than the intended modern contract.
- `Game.ts`/`World.ts` can become larger monoliths if migration logic is piled into them instead of extracting cohesive adapters.
- Historical release-evidence SHAs may be outside current ancestry; deleting evidence or weakening validation would create a false audit trail.

## Rollback strategy

Work in coherent checkpoints. Keep legacy decoders/migration readers while compatibility is required, but never keep two writable live authorities.

If a production migration stage fails mandatory validation, fix forward or revert that unpublished coherent stage. Do not force-push published history. Persistent schema transitions must preserve recoverability through versioned migration rather than deleting user data.

## Definition of Done

253 is complete only when:

- the real playable `Game` binds an active Overworld dimension and live block Y is `[-64,319]`;
- one canonical dimension-aware block-state store owns live world truth;
- legacy `Chunk`/overlay state is not a second writable production authority;
- generation/streaming/rendering/lighting/gameplay/simulation/entity/persistence consumers use or project from canonical state;
- legacy worlds migrate/load without silent loss and migration is idempotent/failure-safe;
- property-bearing states round-trip through live persistence;
- negative-Y and vertical-section-boundary real-play journeys pass;
- resource behavior stays bounded and Change-254 performance regressions are investigated/fixed;
- pre/post exhaustive scans leave no unclassified Critical/High legacy-world or split-truth defect;
- all mandatory repository gates, stress checks and E2E pass according to documented repository policy;
- exact published-head canonical CI evidence is truthful and lineage-valid;
- OpenSpec tasks/spec/verification/state match actual implementation;
- completion is 100% unless the repository's explicit advancement-exception rules legitimately apply.

## Advancement gate

Advancement is allowed only when every MUST/SHALL requirement in the 253 capability spec is verified, all mandatory tests/checks pass, no unresolved Critical/High correctness/data-loss/corruption/determinism/compatibility/security/architecture blocker remains, task completion satisfies repository policy, the intended work is published to `origin/main`, and final release evidence is recorded truthfully for the exact candidate.