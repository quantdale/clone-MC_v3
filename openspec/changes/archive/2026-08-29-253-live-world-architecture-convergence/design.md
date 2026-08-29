# Design: 253-live-world-architecture-convergence

## Context/current state

The repository currently contains a verified modern world-storage stack beside a legacy playable-world stack.

### Legacy live path

```text
Game
  -> World
       -> ChunkManager
            -> Chunk (16 x 64 x 16 bare block-id slab)
       -> additional stateOverlay for richer BlockStateId mutations
       -> legacy generation / mesh / light / readiness assumptions
```

`src/config/index.ts` still defines `CONFIG.chunk.height = 64`. The live `Game` constructs `World` without making `OVERWORLD_DIMENSION_TYPE` the world contract. `World` therefore still has production paths whose addressing/readiness/light behavior derives from the legacy slab model.

### Modern verified path

```text
DimensionType
  -> VerticalWorldAccess
       -> ChunkColumn(chunkX, chunkZ)
            -> lazy ChunkSection(sectionY)
                 -> PalettedContainer<BlockStateId>
```

`ChunkSection` already has property-preserving block-state storage, mesh versions, and deterministic serialization. `ChunkColumn` already has lazy sections, arbitrary vertical section range, dirty sections, heightmaps, generation status, serialization, and stale mesh-version checks. Existing persistence repositories can durably store section/column, entity and block-entity data.

The target is convergence, not replacement of these verified primitives.

## Target state

```text
Game
  -> activeDimension = OVERWORLD_DIMENSION_TYPE
  -> World
       -> LiveWorldStorage (thin dimension-aware facade)
            -> VerticalWorldAccess
                 -> ChunkColumn(chunkX, chunkZ)
                      -> ChunkSection(sectionY)
                           -> BlockStateId
       -> column residency / generation coordinator
       -> section render/light coordinator
       -> persistence coordinator
```

There is exactly one writable live block-state truth. Compatibility APIs may project from it, but may not maintain separately mutable slab/overlay copies.

## Invariants

1. Exactly one writable block-state authority exists for the live dimension.
2. The playable Overworld block Y range is `[-64,319]`; `-65` and `320` are out of range.
3. Coordinate math is floor-division correct for negative X/Y/Z.
4. Out-of-range reads/writes are safe and non-allocating.
5. Reading absent air does not materialize a section.
6. A resident horizontal column does not imply eager allocation/meshing of all vertical sections.
7. Property-bearing block states survive all live and durable round trips.
8. Dirty state and mesh/light invalidation are section-scoped where possible.
9. A stale async generation/mesh/light result never overwrites newer/unloaded state.
10. Generated terrain is deterministic for compatible seed/world-version inputs.
11. Durable/user edits override generated baseline and survive unload/reload.
12. Dirty unload cannot silently discard state.
13. Legacy migration is idempotent and preserves the only recoverable copy until canonical commit succeeds.
14. Entity/block-entity lifecycle remains exactly-once across column unload/reload.
15. Resource/job counts remain bounded under exploration, teleport, edit, save and worker churn.
16. Final release evidence remains exact-SHA and lineage-valid; historical orphaned evidence is preserved as historical, not relabeled as current proof.

## API and data model

### Live world facade

Prefer a thin wrapper over existing primitives:

```ts
interface LiveWorldStorage {
  readonly dimension: DimensionType;

  getBlockState(x: number, y: number, z: number): BlockState;
  getBlockStateId(x: number, y: number, z: number): BlockStateId;
  setBlockState(x: number, y: number, z: number, state: BlockState): boolean;

  getColumn(chunkX: number, chunkZ: number): ChunkColumn | undefined;
  ensureColumn(chunkX: number, chunkZ: number): ChunkColumn;
  removeColumn(chunkX: number, chunkZ: number): boolean;

  isInBuildRange(y: number): boolean;
}
```

`World.getBlock(x,y,z)` may remain as `getBlockState(...).blockId` where legacy callers intentionally consume IDs. `World.setBlock(..., blockId)` resolves the registry default state and writes canonical storage.

No permanent writable `Map<position, BlockStateId>` overlay is allowed.

### Column and section identity

Canonical residency identity is horizontal `(chunkX, chunkZ)`.

Section-scoped work uses `(chunkX, sectionY, chunkZ)` or an equivalent stable typed key. A 384-high Overworld must not be represented as six independently authoritative 64-high chunks.

### Dimension-derived bounds

For Overworld:

```text
minY = -64
height = 384
maxY = 319
minSectionY = floorDiv(-64, 16) = -4
sectionCount = 24
maxSectionY = 19
```

The exact values SHALL be derived from `DimensionType`, not duplicated across live systems.

## Control/data flow

### Boot / world composition

1. Load/freeze registries and world metadata.
2. Resolve the active dimension (`OVERWORLD_DIMENSION_TYPE`).
3. Open persistence and determine world/schema version.
4. Run/prepare legacy migration before destructive transition.
5. Construct canonical vertical storage from dimension + block-state registry.
6. Construct `World` around canonical storage and inject into gameplay/render/simulation systems.
7. Stream/load/generate spawn columns.
8. Restore durable edits, entities and block entities exactly once.
9. Build light/meshes only for resident/render-relevant materialized sections.
10. Mark playable readiness using dimension-aware surface/spawn semantics.

### Canonical read

```text
world xyz
 -> dimension bounds
 -> chunkX/chunkZ floorDiv(16)
 -> sectionY floorDiv(y,16)
 -> local xyz using negative-safe helper
 -> ChunkColumn / ChunkSection
 -> BlockState
```

Absent materialized storage returns air without allocation.

### Canonical write

```text
write intent
 -> bounds + validation
 -> resolve canonical BlockState
 -> ensure only required column/section
 -> set state
 -> update heightmaps
 -> mark dirty section/column
 -> invalidate affected render/light neighbors
 -> enqueue persistence / simulation consequences
```

All mutation pathways must eventually converge on this sequence or a semantically equivalent central mutation contract.

### Load/generation

For a missing column:

1. Check durable canonical column.
2. If legacy compatible data exists, migrate/merge according to schema/world version.
3. Otherwise generate baseline from the modern pipeline for seed/coordinates.
4. Commit generated `BlockState` results into canonical sections.
5. Apply durable edits/state over baseline.
6. Restore block entities/entities.
7. Advance generation status/readiness.
8. Queue required section light/meshing.

The executor must audit current worldgen composition before deciding which adapters remain. No permanent “six legacy slabs” architecture is accepted.

### Unload

1. Stop simulation ownership for the column outside simulation residency.
2. Reject/cancel stale queued work as residency/version changes.
3. If dirty, request durable commit.
4. If commit fails, retain/requeue ownership and surface storage health; do not silently drop.
5. Dispose section render/light resources exactly once.
6. Persist/deactivate entities/block entities as required.
7. Remove clean canonical column.

## Whole-repository consumer inventory

Before production edits, generate a machine-checkable inventory across tracked source/tests/scripts/config/OpenSpec files. The inventory must contain file, line/symbol if available, matched pattern, subsystem, risk, disposition and task owner.

Mandatory pattern families:

- `Chunk` / `ChunkManager` imports and type references;
- `CONFIG.chunk.height`, `seaLevel`, `bedrockY` where they encode old vertical authority;
- explicit `0..63`, `64`, `cy === 0`, `chunkY`, `cy` legacy-coordinate assumptions;
- `stateOverlay`, duplicate block-state maps/caches, alternate writable stores;
- legacy chunk serialization keys and bare-block-ID persistence;
- mesh/light/worker identities bound to old slabs;
- worldgen functions emitting old chunks rather than canonical states;
- collision/raycast/block mutation/tick/fluid/entity/block-entity direct legacy access;
- network/debug/test hooks exposing legacy representation;
- resource-budget counters expressed in obsolete chunk units.

Allowed dispositions:

`REMOVE`, `MIGRATE`, `PROJECTION_ONLY`, `MIGRATION_ONLY`, `TEST_ONLY`, `INTENTIONAL_COMPATIBILITY_WITH_EXPIRY`, `BLOCKER`.

Repeat the scan after implementation. Zero unclassified production hits are allowed.

## Detailed behavior

### Coordinate boundaries

Mandatory Y cases include:

`-65, -64, -33, -32, -17, -16, -1, 0, 15, 16, 31, 32, 63, 64, 319, 320`.

Also cover negative X/Z boundaries `-17,-16,-1,0,15,16`.

Tests SHALL verify both section index and local coordinate routing; `%`-based negative modulo bugs are prohibited.

### Block states

Default-state projection is allowed only for APIs intentionally setting a block by ID. Property-bearing writes SHALL retain state ID/properties through:

- immediate readback;
- adjacent section invalidation;
- column unload/reload;
- page/game save/reload;
- export/import;
- legacy migration where source format can represent the property.

### Generation semantics for existing worlds

Do not silently change the generated baseline of existing worlds. If old persisted worlds store only seed/version + sparse edits, generation compatibility must be explicit. If modern worldgen differs from the version that created the world, either preserve a compatible generator path/version or require a separately authorized world-upgrade policy.

### Spawn/readiness

Spawn and preload logic SHALL derive surface/bounds from canonical heightmaps/dimension metadata. It may not assume the terrain surface fits 0..63.

### Meshing

Each materialized renderable section owns its mesh version. A job captures section identity + version + required neighbor snapshot/version information. Application verifies residency and freshness before replacing geometry.

Boundary edit behavior:

- interior edit -> current section;
- face edit -> current section + existing face-sharing neighbor;
- no unconditional all-sections-in-column rebuild.

### Lighting

Skylight/blocklight/AO sampling uses canonical neighboring states and dimension bounds. Above-top/below-bottom behavior is explicit and dimension-specific. Removal/repropagation must remain correct after edits and unload/reload.

### Gameplay/simulation

World consumers shall depend on canonical `WorldAccess`-style interfaces rather than concrete legacy slabs whenever feasible. This includes:

- player physics/collision;
- raycast/selection;
- mining/placing;
- falling-block mutation;
- scheduled/random ticks;
- fluids and waterlogging;
- crop/fire/farmland/block behaviors;
- redstone-facing access used by current live behavior;
- item/entity/block-entity lifecycle;
- network/shared simulation snapshot adapters;
- test/debug hooks.

### Persistence and migration

Use existing repositories. Introduce version/schema migration only where required.

Migration sequence:

1. identify source version/form;
2. decode/validate without destructive mutation;
3. recreate compatible generated baseline if needed;
4. resolve edits to canonical states;
5. write canonical representation transactionally/durably;
6. verify durable readback where supported;
7. mark migration state complete;
8. only then allow old source to be retired according to policy.

Failure leaves recoverable source intact and reports degraded/blocked storage state.

### Entity/block-entity lifecycle

Ownership is horizontal-column based, not duplicated per vertical section. Column migration may change storage internals but must not duplicate furnace inventories, item entities, XP, AI entities, or block entities.

## Governance / CI repair

253 begins from a terminal state after 254. Its first implementation checkpoint must:

- add 253 to the post-terminal sequence in the correct historical position while preserving the override that 254 executed first;
- set 253 as the sole ACTIVE change in canonical state files;
- repair `validate-state` semantics so a new post-terminal ACTIVE epoch is representable under shallow CI checkout without deleting historical evidence;
- preserve strict final requirements for a full candidate SHA and canonical `gate` + `e2e` SUCCESS.

If GitHub Actions needs checkout-depth/history changes to validate lineage, prefer making the workflow provide the validator enough history rather than disabling ancestry checks.

## Failure modes

- **Out-of-range coordinate**: no mutation/allocation; return documented empty/rejection.
- **Missing section**: read air without materializing.
- **Corrupt durable column**: reject/quarantine/recover according to existing storage-health policy; never silently overwrite recoverable user state.
- **Legacy migration failure**: retain old source, surface failure, do not mark complete.
- **Dirty unload save failure**: keep/requeue dirty state; no drop.
- **Generation failure**: column remains non-ready and failure is visible/retriable; do not expose partial authoritative state as complete.
- **Stale async result**: discard safely; accounting decrements exactly once.
- **Geometry disposal race**: dispose superseded resources exactly once and never reuse stale geometry.
- **Entity/block-entity restoration race**: dedupe by stable identity; no resurrection/duplication.
- **Performance regression**: investigate algorithm/allocation/residency cause; do not mask with threshold inflation.
- **CI evidence mismatch**: verification remains incomplete until exact evidence is truthful.

## Compatibility/migration

Backward compatibility is mandatory for every durable format still accepted by the pre-253 runtime. Characterization fixtures must be captured before changing decoders.

Forward compatibility beyond documented schema versions is not implied; unsupported future/corrupt records should fail explicitly rather than being guessed.

## Performance/resource constraints

- absent air read: no section allocation;
- sparse column: allocation proportional to materialized content, not 24 sections by default;
- one block edit: localized dirty/mesh/light work;
- exploration/teleport churn: resident columns/sections/geometries/jobs plateau under configured distances/backpressure;
- generation/light/mesh jobs: bounded queue depth and stale cancellation/rejection;
- hot voxel reads/writes: avoid per-operation temporary object allocation where existing APIs allow;
- migration/save: bounded batches and failure-visible backpressure;
- Change-254 comparable benchmarks: no unexplained material regression.

Any changed resource budget must document old units, new units, before/after measurement, and why the new threshold reflects architecture rather than a regression waiver.

## Testing seams

### Unit

- coordinate math and bounds;
- `ChunkColumn` lazy allocation/heightmaps/dirty sections;
- `VerticalWorldAccess` canonical reads/writes;
- compatibility block-ID projection;
- stateful-property preservation;
- legacy migration codecs/idempotency;
- stale section-job identity;
- dirty unload failure behavior.

### Integration

- real `World` with canonical storage;
- live worldgen -> canonical column;
- renderer/light with vertical neighbor boundaries;
- collision/raycast/tick consumers at negative/high Y;
- `GamePersistence` save/unload/reload;
- entity/block-entity lifecycle.

### E2E

At least one real playable journey MUST:

1. boot the game through the normal composition root;
2. prove active dimension range;
3. reach/cause interaction below Y=0;
4. cross/edit a vertical section boundary;
5. use a property-bearing block state;
6. save/reload;
7. unload/reload the column;
8. verify exact state and gameplay/render consistency.

Existing core E2E remains a regression gate.

### Stress/bench

- Change-254 bench suite where comparable;
- exploration/teleport churn;
- dense multi-section edits;
- generation/mesh/light queue saturation;
- save/migration/dirty-queue churn;
- resource leak plateau checks.

## Observability/debugging

Expose test-safe read-only metrics sourced from canonical state:

- active dimension ID/minY/maxY/section range;
- resident column count;
- allocated section count;
- dirty column/section counts;
- pending generation/mesh/light/save jobs;
- section geometry count;
- entity/block-entity counts;
- storage/migration health;
- rejected stale-job counts if useful.

Debug hooks MUST project canonical truth and must not mutate a hidden legacy store.


## Phase 3 Audit — Worldgen Stage Graph (2026-08-28)

Audited `src/worldgen/**` (23 modules) and the live consumers (`src/world/TerrainGenerator.ts`, `src/world/World.ts`, `src/engine/Game.ts`). The repository contains two stage vocabularies with different responsibilities:

- `src/worldgen/GenerationPipeline.ts` defines the pure, reusable eight-stage vocabulary `TERRAIN -> CLIMATE -> BIOMES -> SURFACE -> CAVES -> FLUIDS -> FEATURES -> FINAL` and a monotonic per-column `advanceTo` state machine. It is covered by unit tests but is not imported by the live `TerrainGenerator` or `World` path.
- The live runtime uses `src/world/ChunkPipeline.ts` for bounded work queues/tokens and `src/world/ChunkStatus.ts` for the coarser column generation lifecycle. `World.processGeneration` advances queue stages `generate -> features -> light` around the generation call; it does not pretend that those queue stages are the individual pure worldgen stages.

Live terrain composition (`src/world/TerrainGenerator.ts`):
- Stages 1-2 CLIMATE/BIOMES: `ClimateSampler` per column cached as dense `Uint8Array` biome index (plains/forest/desert/taiga), spawn ring forced plains.
- Stages 3-5 TERRAIN/CAVES/SURFACE: per-column vertical sweep over `height = getHeightAt(x,z)` (fbm4), bedrock at `bedrockY`, stone/dirt bands, water fill at/below `seaLevel`, lava pockets via `isLavaAt`, caves via `isCaveAt` (dual 3D noise), declarative `SurfaceRuleEngine` (desert/taiga/underwater/grass) on `depthFromSurface 0..3`.
- Stage 6 ORES: `OreVeinFeature.stampChunkOreVeins` per owner chunk (region-hashed), only replaces stone.
- Stages 7-8 VEGETATION/STRUCTURES: `TreeFeature.buildTreeBlocks` per anchor column (owner canopy overlap recomputed identically) and `StructureGenerator.blocksForChunk` (region-owned starts, overwrite).

Exact live composition is `Game -> TerrainGenerator -> World.processGeneration -> TerrainGenerator.generateColumn -> ChunkColumn/ChunkSection`. `Game` constructs `TerrainGenerator` and passes it to `World` with `OVERWORLD_DIMENSION_TYPE`; `World` obtains/creates the canonical horizontal column, calls `generateColumn(column, stateRegistry)` once when `ChunkStatus` is below `Full`, and then synchronizes the bounded slab projection for meshing/compatibility. `generateColumn` writes registered `BlockState`s directly into canonical sections for `column.minY..column.maxY` (Overworld `-64..319`), while air is omitted so untouched sections remain lazy. `generateChunk(Chunk)` remains only a compatibility projection and is not used for missing-column generation in the live path.

This is the selected live adapter/composition for Phase 3: pure `src/worldgen/**` helpers remain independently testable; `TerrainGenerator` is the composition adapter; `World` owns canonical storage and queue/lifecycle orchestration; `Game` supplies the active dimension and generator. There is no permanent authoritative six-slab worldgen architecture. Existing-world edits are applied after the generated baseline by the projection/durability bridge, so regeneration does not overwrite canonical edits.
Streaming/generation/status reconciled around horizontal columns + sections: `World` derives `minChunkY = floor(minY/64)` and `chunkLayerCount = ceil(height/64)` from the active `DimensionType` (Overworld: -1 and 6), iterates `cy` in `[minChunkY, minChunkY+chunkLayerCount)` in `ensureChunks`, `preloadChunks`, `getReadyProgress`, and `RenderSimulationDistance` (render/simulation Chebyshev radii remain horizontal). `preload radius 1` therefore enqueues at most `9*6=54` slabs but the canonical column stays lazy (only ~8-12 sections materialized for stone terrain, verified via `allocatedSectionCount()`).

Durable edits: `applyEditOverlay` (and column-level `applyColumnDurable` via overlay/durability bridge) runs AFTER the baseline generation/sync, so a regen after unload cannot overwrite stored player edits. The overlay remains projection-only LRU (`EDIT_OVERLAY_MAX_CHUNKS`) over the single writable truth `CanonicalWorldStorage -> VerticalWorldAccess`.

## Affected files/symbols

Expected direct impact:

- control: `openspec/**`, `scripts/validate-state.mjs`, CI workflow history/checkouts if required;
- composition: `src/engine/Game.ts`;
- world: `src/world/World.ts`, `ChunkManager.ts`, `Chunk.ts`, `VerticalWorldAccess.ts`, `ChunkColumn.ts`, `ChunkSection.ts`, coordinate/world-access adapters;
- dimension: `src/data/DimensionType.ts` and active dimension registry/manager;
- generation: `src/worldgen/**` and legacy generation bridge;
- rendering/lighting/workers: every audited live consumer;
- gameplay/simulation/entities/block entities: every audited direct legacy consumer;
- persistence: `src/storage/**`, codecs/migrations/import/export;
- tests: focused unit/integration/bench/E2E and audit inventory fixtures.

The pre-audit may expand this list. An affected consumer is in scope if migration is required to make canonical world truth real; that is not uncontrolled scope expansion.

## Modularity guidance

Do not make `Game.ts` or `World.ts` the permanent home for all migration mechanics. Prefer cohesive modules such as:

- `LiveWorldStorage` / canonical world facade;
- `WorldResidencyCoordinator`;
- `WorldGenerationAdapter`;
- `SectionRenderCoordinator`;
- `WorldPersistenceCoordinator` or narrow adapters over existing persistence;
- typed canonical section/chunk keys.

Names are illustrative; fit existing repository conventions. Extraction is required only where it reduces coupling and can be verified, not as a cosmetic rewrite.

## Rejected alternatives

- **Keep legacy `Chunk` authoritative and only increase height** — rejects canonical state/property architecture and perpetuates split truth.
- **Permanent state overlay over block IDs** — two writable truths can diverge.
- **Third world store** — duplicates verified primitives.
- **Six authoritative 64-high slabs per horizontal column** — preserves the wrong residency/storage identity and encourages eager work.
- **Reset old worlds** — unacceptable data loss.
- **Flatten BlockState to BlockId for persistence** — loses properties.
- **Disable ancestry/exact-SHA checks to make CI green** — weakens release integrity.
- **Raise performance budgets without measurements** — hides regressions.

## Downstream dependencies

Convergence makes later dimension switching, full modern-height gameplay, richer stateful content, large structures/entities, networking/shared simulation, and future optimization campaigns operate on honest live architecture rather than adapter debt. It also reduces false confidence from isolated subsystem verification.
## Phase 4 Defect — Live Streaming Under Queue Saturation (2026-08-28)

Converging the live Overworld multiplied the streaming work set by the vertical
layer count: at the desktop render distance of 6 the resident set is
`13 x 13 x 6 = 1014` chunks against pipeline queues capped at 64 (`generate`)
and 96 (`mesh`). Queue saturation is therefore the *normal* boot condition for
the playable game, and two latent defects in `World` only reproduce once the
queues are actually full.

Almost no existing gate could see either defect. The unit harness and every
E2E spec that boots normally run below saturation —
`CONFIG.headless.renderDistance` is 1 on the `navigator.webdriver` path
(narrowed from 2 in `2be9695` to fix E2E boot time), which loads
`3 x 3 x 6 = 54` chunks and never fills a queue. The playable desktop path was
effectively the only configuration that saturated, so a green boot gate
coexisted with a game that could not boot.

The one exception is `tests/e2e/visual-regression.spec.ts`, which injects
`renderDistance` 2 and 4 through the `__voxelQualityProfile` E2E seam. `Game`
reads that seam as `quality?.renderDistance ?? runtimeRenderDistance()`, so it
bypasses the headless override and does saturate. D1 froze each of its 60 cells
against a 30-minute per-test timeout — the mechanism behind the canonical CI
`e2e` run recorded as "CANCELLED (hung >60m)" in `3cc55a5`. See
`verification.md` for the measured attribution of every local E2E failure.

### D1 — Parked-mesh re-admission never terminated (CRITICAL)

`processMeshing` re-admitted mesh jobs that had been parked while the mesh
queue was at capacity:

```ts
while (this.retryMeshQueue.length > 0) {
  const job = this.retryMeshQueue.shift()!;
  this.retryMeshSet.delete(job.key);
  const chunk = this.chunkManager.getChunk(job.cx, job.cy, job.cz);
  if (chunk) this.enqueueMeshWithRetry(chunk);
}
```

When the mesh queue is full and the job's priority does not beat the queue's
worst entry, `ChunkPipeline.enqueue` returns false, so `enqueueMeshWithRetry`
re-parks the job — at the **tail** of the same queue the loop is draining from
the head. The length never reaches zero: the loop spins forever inside one
frame, hard-locking the main thread. The user-visible symptom is a browser
frozen on the loading screen at whatever progress the last painted frame
showed; the tab stops responding entirely (`page.evaluate` never returns).

Fix: bound the drain by the parked count on entry, and stop at the first job
that re-parks — a saturated queue has no room for the rest either, and each
probe calls `ensureMeshableRecord`, which cancels and resets the chunk's
pipeline record. Probing every parked job every frame would thrash every
resident chunk's record; probing one costs nothing. Shifting before re-parking
rotates the queue head, so no parked job is starved.

### D2 — `ensureChunks` filled the bounded generate queue far-edge-first (HIGH)

`ensureChunks` scanned `dx = -rd..rd`, `dz = -rd..rd` in raster order and
`break scan`s as soon as the generate queue is at its cap. Scan order — not
job priority — therefore decides what gets queued at all: the walk starts at
the far corner of the render distance, fills all 64 slots with `Rings`-priority
chunks, and aborts before ever reaching the spawn ring. Chunks in the
`getReadyProgress` safety ring were left resident-but-ungenerated with no
queued generation job (`queuedKeys.generate` false), so readiness parked below
1 and the loading screen stayed up until the far rings happened to drain.

Fix: `streamScanOffsets(rd)` caches the column offsets ordered nearest-first by
Chebyshev distance (matching `streamPriorityFor`'s tiers), rebuilt only when
the render distance changes. The spawn ring is now queued first, so the bounded
queue always holds the most boot-critical work.

### Measured effect

Headless Chromium launched with `--use-angle=swiftshader` (software WebGL,
~11 FPS) against the Vite dev server, fresh profile, with
`navigator.webdriver` spoofed to false via an init script so the desktop
`renderDistance` 6 path is taken. Wall-clock figures are inflated by software
rasterization; the comparison between rows is the signal:

| Build | Loading screen | Spawn-ring progress |
| --- | --- | --- |
| Before | never clears (main thread hard-locked ~15s after boot) | freezes at 44% |
| D1 only | clears at ~84s | 44% for ~35s, then climbs |
| D1 + D2 | clears at 15-28s across runs | monotonic, e.g. 40/68/88/100 |

Resident chunk creation also stays bounded at the 294-chunk spawn preload
instead of ballooning past 760 far-edge chunks before the spawn ring finishes.
