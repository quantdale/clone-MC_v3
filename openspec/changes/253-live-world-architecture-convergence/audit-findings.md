# Audit Findings: 253-live-world-architecture-convergence

Audit date: 2026-08-26 (Asia/Manila)
Planning head observed: `a8021f55ef233fb8aa0f983905a22a3859add88a`
Scope: repository control plane, source architecture, live composition, world storage/generation/streaming, rendering/lighting, gameplay/simulation consumers, persistence/migration, tests/CI, performance/resource constraints, and autonomous-execution handoff.

## Executive verdict

The highest-value next campaign is the already-reserved `253-live-world-architecture-convergence`.

The repository has a mature, verified modern vertical-world architecture, but the playable game still carries a legacy 16×64×16 `Chunk` slab as the live world authority. The modern `DimensionType` + `VerticalWorldAccess` + `ChunkColumn` + `ChunkSection` path exists beside it rather than being the single source of truth used by the real `Game` runtime. This split forces translation layers, keeps historical Y assumptions alive in production code, weakens save/state guarantees for stateful blocks, and creates a recurring gap between “verified subsystem exists” and “playable game actually consumes it.”

This campaign should converge existing systems. It should not create a third world model.

## Control-plane findings

### A1 — 253 is explicitly reserved and awaiting owner activation — CRITICAL / campaign-selection

`openspec/CHANGE_SEQUENCE_OVERRIDES.md` states that the original planning-only convergence campaign was concurrently numbered 252, that 252 was consumed by the Wither secondary-boss change, and that the convergence campaign MUST be activated under the next free number `253-live-world-architecture-convergence` when its own activation decision arrives.

`openspec/PROGRAM_STATE.json` is currently terminal after 254 and its `nextExactAction` explicitly says to await product authorization to activate 253. The owner instruction that caused this audit is that authorization.

Disposition: activate 253 as the next implementation campaign. Do not renumber historical 001–252/254 artifacts.

### A2 — `.agent/EXECUTION_PROMPT.md` is stale — HIGH

The existing prompt still calls this campaign “Change 252,” was planned from an old head, and describes the legacy height baseline as if that planning checkpoint were still current. The mission remains correct, but numbering, current baseline, CI disposition, and execution pacing must be refreshed before handoff.

Disposition: replace it with a 253 bootstrap that points to the new OpenSpec package and 12-hour prompt queue.

### A3 — post-terminal CI lineage validation is a known pre-existing defect — HIGH

The completed 254 verification records canonical CI red both before and after 254 because `validate-state` encounters release-SHA lineage assumptions under shallow checkout; the same record assigns repair ownership to reserved 253 workstream A. The local typecheck/lint/unit/build baseline is green; the E2E suite has one separately documented environment-marginal jump scenario.

Disposition: reproduce before code changes, repair truthfully, and never weaken final exact-SHA/canonical-job evidence requirements simply to get green output.

## Live-world architecture findings

### W1 — live configuration still defines a 16×64×16 slab — CRITICAL

`src/config/index.ts` still exposes `CONFIG.chunk.height = 64`, `seaLevel = 32`, and `bedrockY = 0` to the legacy runtime. Those values may remain as compatibility/world-version constants where explicitly justified, but they must not define the addressable height of the modern playable Overworld.

Target: live Overworld bounds derive from `OVERWORLD_DIMENSION_TYPE` (`minY=-64`, height 384, max block Y 319).

### W2 — legacy `Chunk` remains a writable production store — CRITICAL

`src/world/Chunk.ts` is the original flat block-id slab model and is consumed by `ChunkManager`/`World`. The representation does not natively model arbitrary section Y or full property-bearing block states.

Target: production authority becomes canonical block states in lazy `ChunkColumn`/`ChunkSection` storage. Any retained `Chunk` usage must be explicitly migration-only, test-only, or a read-only projection with an expiry/removal decision.

### W3 — modern section/column storage is already implemented — POSITIVE / reuse

`src/world/ChunkSection.ts` provides paletted block-state storage, monotonic mesh versions, deterministic serialization, and state-aware access.

`src/world/ChunkColumn.ts` provides lazy vertical sections, arbitrary `minSectionY`/`sectionCount`, dirty-section tracking, surface and motion-blocking heightmaps, generation status, serialization, and stale-section mesh-version checks.

`src/world/VerticalWorldAccess.ts` provides negative-safe dimension-aware mapping from world coordinates into canonical columns/sections.

Target: reuse and harden these primitives instead of adding another storage abstraction.

### W4 — live `Game` does not compose `World` with the active Overworld dimension — CRITICAL

The real `src/engine/Game.ts` constructs `World` without binding `OVERWORLD_DIMENSION_TYPE` as the live world contract. Modern dimension metadata therefore does not control the whole playable path.

Target: the composition root explicitly owns/selects the active `DimensionType`; `World` and all downstream consumers derive bounds/section counts from it.

### W5 — `World` remains split-brain — CRITICAL

Current `src/world/World.ts` still constructs the legacy `ChunkManager` generation path and carries a separate block-state overlay for richer states. Legacy range assumptions remain in world-facing operations such as surface/preload/light logic.

Target: exactly one writable canonical block-state store. `getBlock()` may remain as a compatibility projection from canonical `BlockState.blockId`; block-id writes resolve the registry default state and write canonical storage. No independent writable overlay survives verification.

## Generation and streaming findings

### G1 — modern worldgen exists but live authority remains legacy — HIGH

The roadmap contains verified modern-height generation stages under `src/worldgen/**`, while the playable `World` still receives/generated legacy chunks through `ChunkManager`.

Target: audit the actual modern worldgen stage graph, then use the narrowest adapter that emits canonical block states into one horizontal `ChunkColumn` across the active dimension range. Do not generate six independent 64-high authoritative slabs as the permanent solution.

### G2 — residency identity must be reconciled — HIGH

Legacy runtime accounting commonly treats a loaded `Chunk` as a complete world unit. The canonical architecture is horizontal column residency plus lazily materialized sections and section-scoped render/light jobs.

Target: render distance and simulation distance remain horizontal; allocation, meshing, lighting, invalidation, and job identity become section-aware. Loading a column must not imply allocating or meshing every possible section.

## Rendering / lighting findings

### R1 — section mesh-versioning exists and should become live identity — HIGH

`ChunkSection.meshVersion` and `ChunkColumn.sectionMeshVersion()/isSectionStale()` already provide a strong stale-job contract.

Target: live mesh ownership is `(chunkX, sectionY, chunkZ)` (or semantically equivalent), and async results are applied only if residency/identity/version still match.

### R2 — vertical-boundary invalidation is a required integration gate — HIGH

A block edit at Y 15/16, 63/64, -1/0, or any section face can affect both meshes and light propagation.

Target: dirty only the mutated section plus existing face-sharing neighbors. Prove vertical and horizontal cases. One edit must not trigger unconditional full-column remesh/relight.

### R3 — hidden legacy light clamps must be removed — HIGH

Live `World` still contains legacy-height assumptions in sunlight/light initialization paths.

Target: all live skylight/blocklight/AO/tint neighbor reads are dimension-aware and canonical-state-backed from -64 through 319, with out-of-range handling explicit.

## Gameplay / simulation findings

### S1 — every world consumer needs migration, not only `World.ts` — CRITICAL

The migration fans out through player collision/shape queries, raycast/selection, mining/placing, falling blocks, scheduled/random ticks, fluids, block behavior, redstone-facing access, item/entity/block-entity lifecycle, debug/test hooks, networking/shared simulation snapshots, and any system using legacy chunk keys or Y clamps.

Target: run a machine-checkable pre-scan and assign every occurrence a disposition. Repeat after implementation and require zero unclassified Critical/High production occurrences.

### S2 — property-bearing block states are the correctness litmus test — HIGH

A migration that preserves block IDs but flattens properties is not acceptable. Stateful blocks, waterlogging, rails/redstone-related states, crops, furnace-facing/lit state where modeled, portals, and similar data must round-trip through the canonical path without an overlay.

Target: tests must prove state-id/property preservation through read/write, unload/reload, save/reload, and import/export.

## Persistence / migration findings

### P1 — mature persistence primitives already exist — POSITIVE / reuse

`src/storage/` already contains `ChunkSectionRepository`, dirty-save/autosave coordination, data migrations, legacy localStorage migration, entity/block-entity repositories, import/export-related infrastructure, and a large live `GamePersistence` integration layer.

Target: make canonical columns/sections flow through the existing versioned persistence architecture. Do not introduce a competing world save database or parallel durable representation.

### P2 — migration must be read-old/write-new, idempotent, and non-destructive — CRITICAL

The legacy game may persist sparse edits rather than a full generated terrain snapshot. Existing world semantics must not be silently replaced by a different terrain baseline.

Target: characterize every accepted legacy payload first; preserve seed/world-version semantics; apply durable edits to canonical state; keep the only recoverable legacy source untouched until canonical commit succeeds; make repeat startup idempotent.

### P3 — unload is a durability boundary — CRITICAL

Dropping a dirty canonical column before durable persistence would create data loss.

Target: dirty unload must save successfully or remain resident/requeued/visibly failed. Quota/private-mode/partial-write/corruption paths must not falsely mark completion.

## Performance / resource findings

### O1 — 254 performance gains are a regression baseline — HIGH

Change 254 introduced measured hot-path improvements and a durable benchmark suite. 253 may structurally replace some optimized legacy surfaces, but it must not discard performance evidence or reintroduce per-voxel allocation / unbounded queue growth.

Target: run the 254 bench suite before and after affected stages; rebaseline only when the unit of work legitimately changes and preserve equivalent or defensibly improved budgets.

### O2 — large orchestration hotspots remain architecture risk — MEDIUM/HIGH

`Game.ts`, `World.ts`, `SurvivalInventory.ts`, and `TitleScreenUI.ts` have historically been major monoliths. 253 directly touches `Game.ts` and `World.ts`, so adding another layer of orchestration inside them would increase long-term risk.

Target: extract cohesive world composition/residency/persistence/render adapters when doing so reduces coupling and is covered by tests. Do not perform unrelated UI/inventory rewrites.

## Test / verification findings

### T1 — repository already has strong unit/E2E infrastructure — POSITIVE

The repository uses Vitest and Playwright and the autonomous protocol requires typecheck, lint, full unit, build, and E2E. 254 reports 4,346 passing unit tests (+1 skip) and a documented 47/48 local E2E baseline.

Target: add characterization first, then focused tests per task, then full regression. Never rewrite failing tests to codify a regression without an explicit normative spec change.

### T2 — new end-to-end journey must exercise the real vertical world — HIGH

Target minimum live journey: create/load a world; reach valid Y below zero; collide/move normally; place/mine property-bearing blocks across a section boundary; save; reload; verify exact states; unload/reload the containing column; verify again; ensure render/light updates are visible/canonical.

## Mandatory machine-checkable exhaustive scan

Static planner inspection identifies the architectural fault line, but 253 implementation must begin with a repository-wide inventory generated from the checkout itself so no file or consumer is omitted. The scan MUST cover all tracked source/test/config/script/OpenSpec files and at minimum classify occurrences of:

- imports/references to `Chunk` and `ChunkManager`;
- `CONFIG.chunk.height`, old sea/bedrock assumptions, explicit `0..63`, `64`, or other vertical clamps where they encode slab authority;
- `cy`, `chunkY`, `sectionY`, `cy === 0`, old `(cx,cy,cz)` keys;
- `stateOverlay` and any duplicate block-state maps/caches with write authority;
- geometry/light/job keys tied to legacy chunk identity;
- persistence codecs/records that store bare IDs where state IDs are required;
- worldgen outputs that bypass canonical state storage;
- collision/raycast/tick/fluid/entity/block-entity APIs that access legacy slab data directly;
- debug/E2E hooks that inspect a legacy representation instead of canonical state;
- resource metrics/budgets whose units assume one slab = one column.

Every result must receive one of: `REMOVE`, `MIGRATE`, `PROJECTION_ONLY`, `MIGRATION_ONLY`, `TEST_ONLY`, `INTENTIONAL_COMPATIBILITY_WITH_EXPIRY`, or `BLOCKER`.

## Campaign decision

Proceed with **Change 253: Live World Architecture Convergence**.

Success means the playable game has one dimension-aware canonical world truth, not merely that more modern subsystems exist in isolation. All Critical/High findings above are blocking until fixed or explicitly disproved by evidence.