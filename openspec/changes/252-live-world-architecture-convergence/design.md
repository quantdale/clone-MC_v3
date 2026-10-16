# Design: 252-live-world-architecture-convergence

## Context/current state

The codebase contains two world architectures.

The live path is still centered on `src/world/Chunk.ts`: a flat block-id array for a 16×64×16 slab. `ChunkManager` keeps a `Map<string, Chunk>` and explicitly preserves that map as the source of truth for existing `World.ts` callers. `CONFIG.chunk.height` remains 64. `World` has gained partial dimension-derived streaming fields but continues to use the legacy manager for block access, rejects or clamps multiple operations outside the legacy slab, and carries richer `BlockStateId` mutations in a separate overlay.

The modern path is already implemented and verified in isolation: `ChunkSection` stores 16³ block states in a `PalettedContainer`; `ChunkColumn` groups lazy vertical sections and owns dirty sections, mesh versions, heightmaps, status and serialization; `VerticalWorldAccess` maps arbitrary world Y into columns/sections using `DimensionType`; and `OVERWORLD_DIMENSION_TYPE` defines minY -64 and height 384. Modern worldgen also exists under `src/worldgen`, including a -64..320 terrain model.

`Game.ts` currently constructs `World` without passing the Overworld `DimensionType`. Therefore the user-facing runtime does not consume the full modern architecture even though historical verification records many of its pieces as complete.

At planner baseline `254d259c3193b6d7a74d04bf5a117309cd00794a`, canonical Actions run 32813182576 has a successful E2E job and a failed gate job. The gate stops at `validate-state`: the terminal release-authority and publication-history blocks contain commit SHAs outside current HEAD ancestry. This is an evidence-lineage/schema problem, not evidence that later skipped typecheck/lint/unit/build steps failed.

## Target state

There is one writable live world authority:

```text
Game
  -> active DimensionType (OVERWORLD_DIMENSION_TYPE)
  -> World
       -> canonical VerticalWorldAccess / equivalent dimension-aware facade
            -> ChunkColumn (x,z)
                 -> lazy ChunkSection (sectionY)
                      -> PalettedContainer<BlockStateId>
```

Generation, rendering, lighting, interaction, simulation and persistence all consume/project from this authority. Bare `BlockId` remains a derived value where old interfaces still require it; it is not independently persisted or mutated. The old `Chunk` slab is either removed from production or retained only in explicitly test/migration-only code with no writable runtime authority.

## Invariants

1. Exactly one canonical writable block-state store exists per live dimension.
2. The live Overworld addressable block Y range is `[-64, 319]`; `-65` and `320` are out of range.
3. Out-of-range reads are safe and non-allocating; out-of-range writes are no-ops/rejections according to the documented live API and never allocate sections.
4. Empty sections are lazy. Reading air does not materialize a column/section.
5. Block-state properties survive read/write, unload/reload, save/reload and import/export.
6. Dirty and mesh-version invalidation is section-scoped. Boundary writes dirty the affected section and only existing neighboring sections that share a face.
7. Generation for a given seed/coordinate is deterministic.
8. User edits override regenerated terrain and are not lost on unload/reload.
9. No migration mutates/destroys the only durable copy until the replacement representation is durably committed.
10. A compatibility bridge can read legacy data but cannot create a second writable source of truth.
11. Resource accounting is based on actual columns/sections/jobs/geometries, not an obsolete assumption that one loaded legacy slab equals one modern world column.
12. Terminal release authority references only evidence valid under the current ancestry/schema; orphaned historical evidence remains historical and is never rewritten as current proof.

## API and data model

### Live world facade

Prefer converging `World` on the existing `VerticalWorldAccess` rather than inventing another store. `World` may wrap it to preserve current gameplay APIs:

```ts
interface LiveWorldStorage {
  readonly dimension: DimensionType;
  getBlockState(x: number, y: number, z: number): BlockState;
  setBlockState(x: number, y: number, z: number, state: BlockState): void;
  getColumn(cx: number, cz: number): ChunkColumn | undefined;
  ensureColumn(cx: number, cz: number): ChunkColumn;
  removeColumn(cx: number, cz: number): boolean;
}
```

`World.getBlock()` may remain as a compatibility projection returning `getBlockState(...).blockId` where callers only understand ids. `World.setBlock(id)` must resolve the registry default state and write the canonical state store. Stateful writes use `setBlockState` directly.

No `Map<chunkKey, Map<cell, BlockStateId>>` overlay is permitted in the end state.

### Residency identity

Canonical residency identity is horizontal `(chunkX, chunkZ)` plus section index when section-specific work is needed. Avoid representing a 384-high world as six independent 64-high authoritative chunks. If existing generation/job APIs remain `(cx,cy,cz)` temporarily, `cy` must be treated as a compatibility/section job coordinate and results committed into one canonical column.

### Generation adapter

The live generation pipeline should consume the verified modern worldgen primitives and emit block states into canonical sections. A bounded adapter may translate sparse `TerrainColumn`/feature outputs into section writes. It must use world Y and the active dimension bounds, not `CONFIG.chunk.height`.

The implementation must audit how existing biome/surface/carver/aquifer/feature/structure stages compose before deciding whether to replace `TerrainGenerator` wholesale or use it as a temporary bridge. The final production path must not regenerate six independent legacy slabs with inconsistent terrain rules.

### Rendering identity

Render ownership should be keyed by `(chunkX, sectionY, chunkZ)` or an equivalent explicit section key. Each renderable section carries an observed mesh version; worker results are applied only if the column/section is still resident and the version/identity matches. Neighbor boundary edits invalidate adjacent section meshes.

### Persistence identity

Use existing `SerializedChunkColumn` / `ChunkSectionRepository` and migration infrastructure as the durable canonical representation. Legacy sparse edit data should map to resolved `BlockStateId`s before durable write. Block entities remain separately persisted but keyed to positions whose containing canonical column lifecycle is coordinated.

## Control/data flow

### Boot

1. Build/fetch registries.
2. Resolve `OVERWORLD_DIMENSION_TYPE`.
3. Open world persistence and run any required legacy migration.
4. Construct canonical storage with the dimension + block-state registry.
5. Construct `World` around that storage and pass it to gameplay/render/simulation systems.
6. Load/stream spawn columns; generate missing columns; merge durable edits/state.
7. Build section meshes/lights only for resident/render-relevant sections.
8. Mark world ready when the same user-visible readiness contract is satisfied without assuming a 64-high slab.

### Read/write

```text
world coordinate
 -> dimension bounds
 -> column (floorDiv x,z by 16)
 -> section (floorDiv y by 16)
 -> local coordinates
 -> canonical BlockState
```

Writes update canonical state, heightmaps/dirty state, neighbor dirtying and downstream scheduled persistence/render work through one mutation path.

### Unload/reload

Before a dirty column is dropped, durable state must be committed or the unload must remain pending/failed visibly. Unload disposes associated render/light resources and cancels/rejects stale worker jobs. Reload restores canonical column state and block entities without duplicating furnace/item/entity state.

## Detailed behavior

### Bounds and coordinates

Mandatory boundary cases include `-65,-64,-1,0,15,16,63,64,319,320`. Negative section coordinates must use existing floor-division/local-coordinate helpers, not `%` semantics that produce negative local coordinates.

### Block states

Default-state projection is allowed only for APIs that intentionally set a block by id. Existing stateful blocks (wheat age, portals, rails, redstone, furnace lit/facing where modeled, waterlogging or other schemas) must not be flattened by persistence or world access.

### Whole-codebase consumer audit

Before edits, record every production occurrence of:

- imports/usages of `Chunk` and `ChunkManager`;
- `CHUNK_DIMENSIONS.height`, `CONFIG.chunk.height`, `chunk.cy`, vertical `cy` legacy keys;
- explicit `y < 0`, `y >= 64` or equivalent old-range checks;
- `cy === 0` or serialization assumptions that only slab zero exists;
- `stateOverlay` or alternative block-state maps;
- geometry/light/save keys based on old `(cx,cy,cz)` semantics;
- worldgen paths that emit bare ids into legacy chunks;
- tests/E2E debug hooks that only observe the legacy representation.

Each occurrence gets a disposition and owner task. After implementation, repeat the audit and require zero unclassified production occurrences.

### Governance baseline

The executor must append `252-live-world-architecture-convergence` to the post-terminal section of `CHANGE_SEQUENCE.md` before production code, then set 252 ACTIVE in canonical JSON/Markdown state. Because the current validator was written around a terminal program, its ACTIVE-state semantics may require repair. Such repair must increase truthfulness: it may distinguish current release evidence from historical orphaned evidence, but may not stop checking that a final candidate is a full 40-hex ancestor/self recorded by a later commit with both canonical jobs green.

## Failure modes

- **Missing/corrupt column data:** quarantine/reject according to existing persistence health patterns; generate only when safe and never silently overwrite a recoverable durable edit.
- **Migration failure:** keep old durable data intact, surface a degraded/blocked state, and do not mark migration complete.
- **Worker stale result:** discard without mutating current geometry/state.
- **Unload save failure:** retain dirty in-memory ownership or requeue; no silent drop.
- **Out-of-range write:** no mutation/allocation.
- **Generation failure:** keep column non-ready and retry/fail visibly; do not expose half-generated authoritative state as full.
- **CI evidence mismatch:** terminal verification remains blocked until exact current-lineage evidence is valid.

## Compatibility/migration

A versioned migration must support the currently shipped durable formats and any legacy local/sparse edit form still accepted by `GamePersistence`. Characterization tests must capture representative old payloads before implementation. The migration path should be read-old/write-new and idempotent; a second startup after successful migration must not duplicate columns, edits, entities, block entities or furnace inventories.

If current generated terrain is not durably stored in full and only edits are stored, migration must preserve that model's semantic result: regenerate the same baseline appropriate to the compatible world version/seed, then apply edits as canonical states. If modern worldgen intentionally changes baseline terrain for existing worlds, that is a separate product migration decision and must not be silently bundled; prefer preserving existing world semantics unless explicit repository evidence authorizes regeneration differences.

## Performance/resource constraints

- Empty section allocation stays lazy.
- A simple read of air may not allocate a section.
- A loaded horizontal column does not imply 24 allocated or meshed sections.
- Section remeshes are localized; a one-block edit must not rebuild all vertical sections unless measured evidence shows a justified exceptional case.
- Worker/backpressure caps and stale-result rejection remain bounded.
- Memory/resource gates must be re-expressed in real units where necessary. Budget changes require measurement evidence and architectural rationale, not threshold inflation.
- Exploration, teleport churn, dense edits and save flushes must not introduce unbounded maps, geometries, queued jobs or dirty-save units.

## Testing seams

Use unit seams at `VerticalWorldAccess`, `ChunkColumn`, generation adapters, section render identity, migration codecs and persistence repositories. Use integration tests with real `World` and `GamePersistence` boundaries. Use Playwright for a real playable journey that descends below Y=0, edits across a vertical section boundary, reloads, and verifies block state persistence. Keep existing deterministic seed/golden tests and furnace E2E intact.

## Observability/debugging

Retain or add test-safe observables for active dimension id/range, resident column count, allocated section count, pending generation/mesh jobs, geometry count, dirty columns and storage health. Debug hooks must project canonical state and must not mutate a hidden legacy store.

## Affected files/symbols

Expected core impact includes `Game.ts`, `World.ts`, `ChunkManager.ts`, `Chunk.ts`, `WorldCoordinates.ts`, live terrain generation/streaming code, chunk/section meshing and geometry lifecycle, light adapters, persistence integration, resource-budget measurements, and tests/E2E. The mandatory audit may discover additional consumers; those are in scope when required for canonical convergence.

## Rejected alternatives

- **Keep legacy `Chunk` live and merely pass a DimensionType:** rejected; it preserves dual architecture and cannot represent canonical block states/full-height sections cleanly.
- **Maintain a permanent block-state overlay over block ids:** rejected; two writable truths can diverge and complicate persistence.
- **Create a third live world store:** rejected; verified section/column primitives already exist.
- **Generate six 64-high legacy chunks per column indefinitely:** rejected as an end state because it perpetuates slab identity, memory/mesh churn and translation complexity.
- **Delete old saves or reset worlds:** rejected due data-loss/compatibility requirements.
- **Relax release-evidence ancestry checks:** rejected; the schema should distinguish history from current authority without weakening final proof.

## Downstream dependencies

Completing this convergence unlocks honest live consumption of the already modeled Nether/End, portals, modern-height worldgen, section streaming, block-state-heavy systems, server/shared simulation and future large content campaigns. It also removes a major source of false-positive parity claims where headless verification does not imply playable integration.
