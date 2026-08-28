# Proposal: 252-live-world-architecture-convergence

## Problem

The repository contains a verified modern vertical-world architecture, but the playable runtime still uses the original 16×64×16 `Chunk` block-id slabs as its authoritative world store. `Game` does not provide the live `World` with `OVERWORLD_DIMENSION_TYPE`; `World` retains 0..63 and `cy === 0` assumptions in production paths; richer block states are partly carried in a separate overlay; and multiple verified systems remain headless/additive rather than consumed by the game.

This leaves a material architecture/parity defect: the codebase can claim modern-height storage, dimension types, persistence, worldgen and section rendering primitives while the user-facing game executes a different legacy model. It also makes future development more expensive because every feature must bridge two incompatible world representations.

The current terminal baseline has an independent governance defect: GitHub Actions run 32813182576 fails `validate-state` because historical release-authority/publication SHAs are not ancestors of current HEAD after published-history divergence. E2E passed; downstream gate steps were skipped. Change 252 must start from and eventually close on truthful repository state.

## Goals

- Make the actual playable Overworld use `OVERWORLD_DIMENSION_TYPE` and its `[-64, 319]` block range.
- Make `VerticalWorldAccess` / `ChunkColumn` / `ChunkSection` block states the canonical live block store.
- Remove the legacy `Chunk` slab and block-state overlay as independent production sources of truth.
- Migrate generation, streaming, meshing, lighting, simulation/gameplay consumers and persistence to the canonical architecture.
- Preserve existing saves and live behavior through deterministic compatibility migration.
- Preserve Change-251 furnace integration and previously working core gameplay.
- Keep allocation, generation, meshing, lighting and residency bounded through lazy sections and section-scoped work.
- Repair post-terminal control-plane assumptions sufficiently for Change 252 to be activated truthfully and, at completion, establish new lineage-valid exact-SHA release authority.
- Perform whole-codebase consumer audits before and after implementation so success is not inferred from a narrow changed-file review.

## Non-goals

- Live Nether/End switching, portal travel, or a multi-dimension UI.
- New bosses, mobs, redstone content, biomes, structures, inventory features, or other content expansion unrelated to the migration.
- Broad renderer restyling, asset replacement, UI redesign, or unrelated performance rewrites.
- Rewriting the already verified 001–251 historical OpenSpec archive.
- Force-pushing or reconstructing old Git history to make stale evidence appear ancestral.
- Replacing proven storage/generation/rendering primitives with a new third architecture when existing verified primitives can be converged.

## Preconditions

- Change 251 remains VERIFIED and archived.
- The planner-generated `.agent/EXECUTION_PROMPT.md` explicitly authorizes this post-terminal campaign.
- Before production edits, `CHANGE_SEQUENCE.md`, `PROGRAM_STATE.json`, and `PROGRAM_STATE.md` must be reconciled so 252 is the one active change and the pre-implementation spec gate passes.
- Current CI/state failure must be reproduced and recorded rather than silently ignored.

## Dependencies

Primary existing dependencies include Changes 021–033 (section/column/vertical storage and streaming), 034–043 (persistence/migration), 056–075 (rendering/lighting), 085–102 (modern worldgen), 174–180 (dimension types/manager), 222–240 (shared simulation/persistence/network/stress), and 251 (live furnace integration).

Important implementation seams include:

- `src/data/DimensionType.ts`
- `src/world/VerticalWorldAccess.ts`
- `src/world/ChunkColumn.ts`
- `src/world/ChunkSection.ts`
- `src/world/World.ts`
- `src/world/ChunkManager.ts`
- `src/world/Chunk.ts`
- `src/world/TerrainGenerator.ts`
- `src/worldgen/**`
- `src/rendering/**` and live chunk meshing/geometry ownership
- `src/engine/Game.ts`
- `src/storage/**` and live `GamePersistence` integration
- gameplay/simulation consumers discovered by the mandatory whole-codebase audit.

## Proposed change

Converge the live runtime on the modern world model in one coherent migration. First establish a truthful ACTIVE state and a machine-checkable inventory of every legacy world consumer. Then refactor the live `World`/streaming core so a dimension-aware canonical block-state access layer owns world data. Wire the real Overworld type from `Game`, feed the modern world-generation pipeline into columns/sections, migrate rendering/lighting/simulation consumers, and persist canonical column data through the verified repository/migration stack.

Compatibility adapters may be introduced only as temporary bridges with explicit removal criteria in this change. They must project from canonical state and may never become a second writable source of truth.

The migration must be validated on actual playable paths, not only headless unit modules. Negative Y, vertical section boundaries, unload/reload, save/reload, stateful blocks and the live furnace flow are mandatory integration cases.

## Compatibility and migration

Existing world/player data must remain readable. Legacy sparse edits/block-id snapshots must either be migrated deterministically into canonical block states or loaded through a compatibility path that writes canonical data before normal play continues. Migration must be idempotent, versioned, failure-visible and non-destructive until durable commit succeeds.

Block-state properties may not be collapsed to bare block IDs. Existing block entities and player state remain associated with the same world identity and positions. Import/export and recovery paths must operate on the migrated representation without duplicating or silently dropping edits.

## Risks

- Large fan-out: world storage touches generation, rendering, collision, simulation and persistence.
- Performance regression if full-height sections are eagerly allocated/meshed.
- Save incompatibility or silent loss if the legacy edit path is removed before migration is proven.
- Visual holes/stale geometry at vertical or horizontal section boundaries.
- Incorrect skylight/world-height assumptions at negative Y or top boundary.
- Tests may currently encode legacy 64-high behavior and require careful distinction between obsolete contract and real regression.
- Existing terminal governance state contains non-ancestral historical SHAs; deleting or relabeling evidence would create a false audit trail.

## Rollback strategy

Use incremental coherent checkpoints. Keep legacy decode/migration readers until new persistence compatibility is proven, but do not keep two writable world authorities. If a migration stage fails mandatory validation, revert that coherent unpublished stage or fix forward before publishing; never force-push published `main`. Persistent schema changes must be forward-migrated with versioned compatibility, not rolled back by deleting user data.

## Definition of Done

Change 252 is done only when the playable `Game` runs the Overworld through dimension-aware canonical section/column block states; production world access no longer relies on the 0..63 legacy slab or a separate mutable state overlay; generation/streaming/meshing/lighting/gameplay/persistence are integrated; legacy saves migrate safely; resource budgets remain defensible; all mandatory tests/gates pass; pre/post whole-repository audits find no unclassified Critical/High legacy-world integration defect; and a lineage-valid exact-SHA canonical CI candidate supports the new terminal release authority.

## Advancement gate

Advancement is allowed only at 100% task completion with all MUST/SHALL requirements verified, all mandatory validation green, no unresolved Critical/High correctness/data-loss/security/architecture blocker, exact-SHA canonical GitHub Actions `gate` and `e2e` SUCCESS for the terminal candidate, reconciled OpenSpec/state/parity evidence, archival of Change 252, and publication to verified `origin/main`.
