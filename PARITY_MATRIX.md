# PARITY_MATRIX.md

- **Schema version:** `v1`
- **Generated:** 2026-08-25 (Change 252 VERIFIED and archived as `2026-08-25-252-wither-secondary-boss`; C252/MP-19.4-1 exact; 001–252 VERIFIED; provenance in `openspec/PROGRAM_STATE.json`)
- **Scope:** one row per planned numbered change `001`–`252` (FeatureId `C<number>`), plus master-plan-only feature areas (`MP-<section>-<seq>`).

## Sources of truth

| Source | Role |
|---|---|
| `openspec/CHANGE_SEQUENCE.md` | Canonical catalog of narrow outcomes for changes 001–250. |
| `MINECRAFT_PARITY_MASTER_PLAN.md` | Reference-behavior rationale, parity policy (§2.3), non-goals (§33). |
| `openspec/PROGRAM_STATE.json` | Authoritative per-change status (`validationResults[].status`). |
| `openspec/changes/<dir>/verification.md` | Per-change requirement-evidence record; `(VERIFIED)` marker cited as evidence. |

Directory-slug note: three directories use slugs that differ from the sequence text — `008-stack-data-components` and `009-slot-data-unification` (recorded in `openspec/CHANGE_SEQUENCE_OVERRIDES.md`) and `168-dispenser`. Citations below always use the real directory.

## Category taxonomy and decision rules

| Category | Decision rule | Evidence requirement |
|---|---|---|
| `exact` | Behavior matches the referenced Minecraft outcome as specified. Default for every implemented change unless a documented mechanism difference or platform constraint applies. | VERIFIED artifact citation required. |
| `equivalent` | Same player-visible outcome delivered through a locally-documented different mechanism (e.g. a custom protocol/format/boundary where the reference uses a proprietary one). The differing mechanism is itself specified, implemented, and verified. | VERIFIED artifact citation required + one-line known difference naming the local mechanism. |
| `approx` | Implements the core outcome under a documented browser/render/resource constraint with a recorded known difference (e.g. headless software-WebGL render measurement; original procedural assets instead of proprietary ones per master plan §33). | VERIFIED artifact citation required + constraint and known difference stated. |
| `deferred` | Planned but not yet implemented/verified. For `C` rows: remains in the 001–250 roadmap. For `MP` rows: named master-plan area not covered by any numbered change yet. | Roadmap rationale only; no evidence required. |
| `out-of-scope` | Requires proprietary assets/services or non-browser capability (master plan §33 guardrails: no Mojang/Microsoft assets, branding, or service infrastructure). | Rationale only; no evidence required. |

Boundary disambiguation: `exact` vs `equivalent` — if only the internal mechanism differs but the player-visible behavior and its rules match as specified, it is still `exact`; `equivalent` is reserved for outcomes whose reference mechanism is proprietary/unavailable and was deliberately replaced by a locally-documented one. `equivalent` vs `approx` — `equivalent` rows have no behavioral shortfall, only a substituted mechanism; `approx` rows record an actual known behavioral/fidelity difference caused by a platform or legal-resource constraint. `deferred` vs `out-of-scope` — `deferred` features remain planned work; `out-of-scope` features will never be implemented because they require proprietary assets/services or non-browser capability.

## Change matrix (C001–C250)

Narrow-outcome text is quoted from `openspec/CHANGE_SEQUENCE.md` (authoritative catalog); status is confirmed against `openspec/PROGRAM_STATE.json` (`validationResults`) and each change's `verification.md`.

| C001 | `001-autonomous-program-control` | Durable `/goal`, state, checkpoint, ordering, and verification-gate protocol. | exact | `openspec/changes/001-autonomous-program-control/verification.md` (VERIFIED) | — | VERIFIED |
| C002 | `002-resource-id-foundation` | Namespaced `ResourceId` parsing, canonicalization, comparison, serialization, and tests. | exact | `openspec/changes/002-resource-id-foundation/verification.md` (VERIFIED) | — | VERIFIED |
| C003 | `003-generic-registry-core` | Generic typed registry with stable runtime IDs, duplicate rejection, freeze/finalize semantics, and deterministic iteration. | exact | `openspec/changes/003-generic-registry-core/verification.md` (VERIFIED) | — | VERIFIED |
| C004 | `004-block-item-registry-separation` | Separate block types from inventory item types without changing gameplay behavior. | exact | `openspec/changes/004-block-item-registry-separation/verification.md` (VERIFIED) | — | VERIFIED |
| C005 | `005-tag-registry` | Data-driven tag membership and tag-to-tag references with cycle/error handling. | exact | `openspec/changes/005-tag-registry/verification.md` (VERIFIED) | — | VERIFIED |
| C006 | `006-block-property-schema` | Typed block property definitions and legal-value validation. | exact | `openspec/changes/006-block-property-schema/verification.md` (VERIFIED) | — | VERIFIED |
| C007 | `007-block-state-runtime-registry` | Canonical block-state combinations mapped to compact runtime IDs. | exact | `openspec/changes/007-block-state-runtime-registry/verification.md` (VERIFIED) | — | VERIFIED |
| C008 | `008-stack-data-components` | Extensible item-stack component map replacing hard-coded durability assumptions. | exact | `openspec/changes/008-stack-data-components/verification.md` (VERIFIED) | — | VERIFIED |
| C009 | `009-slot-data-unification` | Migrate inventory/hotbar storage and snapshots to component-based `ItemStack`. | exact | `openspec/changes/009-slot-data-unification/verification.md` (VERIFIED) | — | VERIFIED |
| C010 | `010-recipe-data-model` | Registry-backed recipe schema independent of the current hard-coded recipe list. | exact | `openspec/changes/010-recipe-data-model/verification.md` (VERIFIED) | — | VERIFIED |
| C011 | `011-loot-table-data-model` | Deterministic loot-table primitives for block/entity drops and conditions. | exact | `openspec/changes/011-loot-table-data-model/verification.md` (VERIFIED) | — | VERIFIED |
| C012 | `012-attribute-registry` | Typed attributes and modifiers with deterministic stacking rules. | exact | `openspec/changes/012-attribute-registry/verification.md` (VERIFIED) | — | VERIFIED |
| C013 | `013-damage-type-registry` | Data-driven damage types and flags; preserve current fall/drown/lava semantics. | exact | `openspec/changes/013-damage-type-registry/verification.md` (VERIFIED) | — | VERIFIED |
| C014 | `014-status-effect-registry` | Status-effect type registry and serializable effect instances, without gameplay effects yet. | exact | `openspec/changes/014-status-effect-registry/verification.md` (VERIFIED) | — | VERIFIED |
| C015 | `015-fluid-registry` | Separate fluid types from blocks; water/lava become registry-backed fluids. | exact | `openspec/changes/015-fluid-registry/verification.md` (VERIFIED) | — | VERIFIED |
| C016 | `016-biome-registry` | Registry-backed biome definitions replacing string-union biome identity. | exact | `openspec/changes/016-biome-registry/verification.md` (VERIFIED) | — | VERIFIED |
| C017 | `017-entity-type-registry` | Entity type definitions and runtime IDs, without AI expansion. | exact | `openspec/changes/017-entity-type-registry/verification.md` (VERIFIED) | — | VERIFIED |
| C018 | `018-block-entity-type-registry` | Block-entity type registry and block compatibility declarations. | exact | `openspec/changes/018-block-entity-type-registry/verification.md` (VERIFIED) | — | VERIFIED |
| C019 | `019-versioned-codec-framework` | Versioned validation/codec primitives for persistent and network-safe data. | exact | `openspec/changes/019-versioned-codec-framework/verification.md` (VERIFIED) | — | VERIFIED |
| C020 | `020-resource-data-loader` | Deterministic loading/validation of original game data from repository assets/data files. | exact | `openspec/changes/020-resource-data-loader/verification.md` (VERIFIED) | — | VERIFIED |
| C021 | `021-section-coordinate-model` | 16×16×16 section coordinates with correct negative X/Y/Z conversion. | exact | `openspec/changes/021-section-coordinate-model/verification.md` (VERIFIED) | — | VERIFIED |
| C022 | `022-paletted-container` | Compact paletted storage primitive with deterministic serialization. | exact | `openspec/changes/022-paletted-container/verification.md` (VERIFIED) | — | VERIFIED |
| C023 | `023-chunk-section-storage` | `ChunkSection` block-state storage using paletted containers. | exact | `openspec/changes/023-chunk-section-storage/verification.md` (VERIFIED) | — | VERIFIED |
| C024 | `024-chunk-column-storage` | `ChunkColumn` grouping vertical sections by X/Z. | exact | `openspec/changes/024-chunk-column-storage/verification.md` (VERIFIED) | — | VERIFIED |
| C025 | `025-dimension-type-height-model` | Dimension-specific minY/height/logical-height and skylight metadata. | exact | `openspec/changes/025-dimension-type-height-model/verification.md` (VERIFIED) | — | VERIFIED |
| C026 | `026-vertical-world-access` | General world reads/writes across negative and high Y, removing the 0–63 slab restriction. | exact | `openspec/changes/026-vertical-world-access/verification.md` (VERIFIED) | — | VERIFIED |
| C027 | `027-vertical-neighbor-dirtying` | Dirty propagation across all six section faces including vertical boundaries. | exact | `openspec/changes/027-vertical-neighbor-dirtying/verification.md` (VERIFIED) | — | VERIFIED |
| C028 | `028-section-mesh-versioning` | Section-level mesh versions/stale-job protection. | exact | `openspec/changes/028-section-mesh-versioning/verification.md` (VERIFIED) | — | VERIFIED |
| C029 | `029-heightmap-storage` | Chunk-column motion-blocking/surface heightmap primitives. | exact | `openspec/changes/029-heightmap-storage/verification.md` (VERIFIED) | — | VERIFIED |
| C030 | `030-chunk-status-model` | Explicit generation lifecycle statuses independent of visibility. | exact | `openspec/changes/030-chunk-status-model/verification.md` (VERIFIED) | — | VERIFIED |
| C031 | `031-chunk-ticket-model` | Typed reasons/levels for keeping chunks loaded or ticking. | exact | `openspec/changes/031-chunk-ticket-model/verification.md` (VERIFIED) | — | VERIFIED |
| C032 | `032-render-vs-simulation-distance` | Distinguish rendering radius from simulation/ticking radius. | exact | `openspec/changes/032-render-vs-simulation-distance/verification.md` (VERIFIED) | — | VERIFIED |
| C033 | `033-vertical-streaming` | Stream required sections/columns around the player without single-layer assumptions. | exact | `openspec/changes/033-vertical-streaming/verification.md` (VERIFIED) | — | VERIFIED |
| C034 | `034-indexeddb-world-metadata` | IndexedDB database/version/world metadata with typed repository boundary. | exact | `openspec/changes/034-indexeddb-world-metadata/verification.md` (VERIFIED) | — | VERIFIED |
| C035 | `035-indexeddb-chunk-section-store` | Persist/reload chunk columns and section block-state data. | exact | `openspec/changes/035-indexeddb-chunk-section-store/verification.md` (VERIFIED) | — | VERIFIED |
| C036 | `036-block-entity-persistence-store` | Separate persistent block-entity records per chunk. | exact | `openspec/changes/036-block-entity-persistence-store/verification.md` (VERIFIED) | — | VERIFIED |
| C037 | `037-entity-persistence-store` | Separate persistent entity records per chunk/dimension. | exact | `openspec/changes/037-entity-persistence-store/verification.md` (VERIFIED) | — | VERIFIED |
| C038 | `038-dirty-save-queue` | Incremental dirty-unit save queue with bounded work. | exact | `openspec/changes/038-dirty-save-queue/verification.md` (VERIFIED) | — | VERIFIED |
| C039 | `039-transactional-autosave` | Crash-resistant periodic autosave and pagehide flush policy. | exact | `openspec/changes/039-transactional-autosave/verification.md` (VERIFIED) | — | VERIFIED |
| C040 | `040-legacy-localstorage-migration` | Import existing sparse edit/player/inventory saves into the new world database. | exact | `openspec/changes/040-legacy-localstorage-migration/verification.md` (VERIFIED) | — | VERIFIED |
| C041 | `041-save-schema-migrations` | Ordered persistent schema/data-version migrations. | exact | `openspec/changes/041-save-schema-migrations/verification.md` (VERIFIED) | — | VERIFIED |
| C042 | `042-world-export-import` | Original world archive export/import with validation. | equivalent | `openspec/changes/042-world-export-import/verification.md` (VERIFIED) | Worlds export/import through the locally-defined `voxel-world` v1 `WorldArchive` format instead of a proprietary world file format; same portable backup/restore outcome. | VERIFIED |
| C043 | `043-storage-quota-recovery` | Quota/private-mode/storage failure detection, recovery, and user-safe behavior. | exact | `openspec/changes/043-storage-quota-recovery/verification.md` (VERIFIED) | — | VERIFIED |
| C044 | `044-fixed-20tps-clock` | Canonical deterministic 20 TPS simulation loop decoupled from render FPS. | exact | `openspec/changes/044-fixed-20tps-clock/verification.md` (VERIFIED) | — | VERIFIED |
| C045 | `045-render-interpolation` | Render interpolation and bounded catch-up without changing simulation truth. | exact | `openspec/changes/045-render-interpolation/verification.md` (VERIFIED) | — | VERIFIED |
| C046 | `046-singleplayer-pause-semantics` | Explicit pause rules for simulation, UI, and timers. | exact | `openspec/changes/046-singleplayer-pause-semantics/verification.md` (VERIFIED) | — | VERIFIED |
| C047 | `047-scheduled-tick-queue` | Deterministic scheduled block/fluid tick queue with dedupe and persistence hooks. | exact | `openspec/changes/047-scheduled-tick-queue/verification.md` (VERIFIED) | — | VERIFIED |
| C048 | `048-random-tick-system` | Seeded random-tick selection for eligible blocks in ticking chunks. | exact | `openspec/changes/048-random-tick-system/verification.md` (VERIFIED) | — | VERIFIED |
| C049 | `049-neighbor-update-queue` | Ordered bounded neighbor updates with recursion/overflow protection. | exact | `openspec/changes/049-neighbor-update-queue/verification.md` (VERIFIED) | — | VERIFIED |
| C050 | `050-block-behavior-dispatch` | Registry-selected block behavior modules instead of central block switches. | exact | `openspec/changes/050-block-behavior-dispatch/verification.md` (VERIFIED) | — | VERIFIED |
| C051 | `051-block-event-queue` | Local block events with deterministic ordering and bounded propagation. | exact | `openspec/changes/051-block-event-queue/verification.md` (VERIFIED) | — | VERIFIED |
| C052 | `052-block-entity-framework` | Tickable/non-tickable block-entity lifecycle wired to chunks. | exact | `openspec/changes/052-block-entity-framework/verification.md` (VERIFIED) | — | VERIFIED |
| C053 | `053-game-event-framework` | Generic gameplay events for future sensors/AI/advancements without coupling systems. | exact | `openspec/changes/053-game-event-framework/verification.md` (VERIFIED) | — | VERIFIED |
| C054 | `054-deterministic-rng-streams` | Named seed-derived RNG streams for simulation subsystems. | exact | `openspec/changes/054-deterministic-rng-streams/verification.md` (VERIFIED) | — | VERIFIED |
| C055 | `055-simulation-test-harness` | Headless tick stepping, fixture worlds, state assertions, and deterministic replay hooks. | exact | `openspec/changes/055-simulation-test-harness/verification.md` (VERIFIED) | — | VERIFIED |
| C056 | `056-voxel-shape-core` | Immutable composable voxel shapes for collision, selection, and occlusion. | exact | `openspec/changes/056-voxel-shape-core/verification.md` (VERIFIED) | — | VERIFIED |
| C057 | `057-shape-aware-player-collision` | Player collision queries use block collision shapes rather than full-cube assumptions. | exact | `openspec/changes/057-shape-aware-player-collision/verification.md` (VERIFIED) | — | VERIFIED |
| C058 | `058-shape-aware-raycast` | Selection/interactions raycast against selection shapes. | exact | `openspec/changes/058-shape-aware-raycast/verification.md` (VERIFIED) | — | VERIFIED |
| C059 | `059-block-model-data` | Original block-model geometry/texture-reference schema. | exact | `openspec/changes/059-block-model-data/verification.md` (VERIFIED) | — | VERIFIED |
| C060 | `060-blockstate-model-resolution` | Resolve block states to render models deterministically. | exact | `openspec/changes/060-blockstate-model-resolution/verification.md` (VERIFIED) | — | VERIFIED |
| C061 | `061-render-layer-model` | Opaque/cutout/translucent/emissive render-layer classification. | exact | `openspec/changes/061-render-layer-model/verification.md` (VERIFIED) | — | VERIFIED |
| C062 | `062-greedy-opaque-meshing` | Greedy merge compatible opaque cube faces with regression equivalence tests. | exact | `openspec/changes/062-greedy-opaque-meshing/verification.md` (VERIFIED) | — | VERIFIED |
| C063 | `063-template-partial-block-meshing` | Mesh slabs/stairs/panes/other model templates without full-cube assumptions. | exact | `openspec/changes/063-template-partial-block-meshing/verification.md` (VERIFIED) | — | VERIFIED |
| C064 | `064-worker-job-protocol` | Versioned transferable worker request/result protocol with stale result rejection. | exact | `openspec/changes/064-worker-job-protocol/verification.md` (VERIFIED) | — | VERIFIED |
| C065 | `065-worker-section-meshing` | Move section meshing off the main thread. | exact | `openspec/changes/065-worker-section-meshing/verification.md` (VERIFIED) | — | VERIFIED |
| C066 | `066-voxel-light-storage` | Section nibble arrays and light value accessors. | exact | `openspec/changes/066-voxel-light-storage/verification.md` (VERIFIED) | — | VERIFIED |
| C067 | `067-skylight-propagation` | Deterministic skylight initialization/propagation across sections. | exact | `openspec/changes/067-skylight-propagation/verification.md` (VERIFIED) | — | VERIFIED |
| C068 | `068-blocklight-propagation` | Luminance-source block-light propagation. | exact | `openspec/changes/068-blocklight-propagation/verification.md` (VERIFIED) | — | VERIFIED |
| C069 | `069-incremental-light-updates` | Correct light removal/repropagation after block edits. | exact | `openspec/changes/069-incremental-light-updates/verification.md` (VERIFIED) | — | VERIFIED |
| C070 | `070-light-aware-meshing` | Per-vertex light values enter generated meshes. | exact | `openspec/changes/070-light-aware-meshing/verification.md` (VERIFIED) | — | VERIFIED |
| C071 | `071-ambient-occlusion` | Minecraft-like local ambient occlusion at block vertices. | exact | `openspec/changes/071-ambient-occlusion/verification.md` (VERIFIED) | — | VERIFIED |
| C072 | `072-biome-tint-rendering` | Biome-controlled tint attributes for grass/foliage/water-like surfaces. | exact | `openspec/changes/072-biome-tint-rendering/verification.md` (VERIFIED) | — | VERIFIED |
| C073 | `073-animated-texture-metadata` | Time-based animated atlas frames without gameplay coupling. | exact | `openspec/changes/073-animated-texture-metadata/verification.md` (VERIFIED) | — | VERIFIED |
| C074 | `074-translucent-surface-rendering` | Dedicated translucent geometry handling and stable ordering policy. | exact | `openspec/changes/074-translucent-surface-rendering/verification.md` (VERIFIED) | — | VERIFIED |
| C075 | `075-render-performance-contract` | Draw-call, mesh-build, frame-time, memory, and render-distance budgets with automated measurement. | exact | `openspec/changes/075-render-performance-contract/verification.md` (VERIFIED) | — | VERIFIED |
| C076 | `076-fluid-state-levels` | Source/flowing fluid state with level/falling metadata. | exact | `openspec/changes/076-fluid-state-levels/verification.md` (VERIFIED) | — | VERIFIED |
| C077 | `077-fluid-tick-dispatch` | Scheduled fluid tick integration and bounded updates. | exact | `openspec/changes/077-fluid-tick-dispatch/verification.md` (VERIFIED) | — | VERIFIED |
| C078 | `078-water-flow-simulation` | Water downward/horizontal propagation and source rules. | exact | `openspec/changes/078-water-flow-simulation/verification.md` (VERIFIED) | — | VERIFIED |
| C079 | `079-lava-flow-simulation` | Slower dimension-aware lava propagation. | exact | `openspec/changes/079-lava-flow-simulation/verification.md` (VERIFIED) | — | VERIFIED |
| C080 | `080-water-lava-interactions` | Deterministic fluid-contact transformations. | exact | `openspec/changes/080-water-lava-interactions/verification.md` (VERIFIED) | — | VERIFIED |
| C081 | `081-waterlogging-state` | Waterlogged block-state support and fluid coexistence semantics. | exact | `openspec/changes/081-waterlogging-state/verification.md` (VERIFIED) | — | VERIFIED |
| C082 | `082-fluid-collision-movement` | Fluid immersion, movement drag, buoyancy, and eye-fluid state from fluid data. | exact | `openspec/changes/082-fluid-collision-movement/verification.md` (VERIFIED) | — | VERIFIED |
| C083 | `083-fluid-surface-meshing` | Level-aware fluid surface geometry and side heights. | exact | `openspec/changes/083-fluid-surface-meshing/verification.md` (VERIFIED) | — | VERIFIED |
| C084 | `084-fluid-regression-suite` | Deterministic fixtures for flow, boundaries, unload/reload, and performance. | exact | `openspec/changes/084-fluid-regression-suite/verification.md` (VERIFIED) | — | VERIFIED |
| C085 | `085-worldgen-stage-pipeline` | Explicit deterministic generation stages/status transitions. | exact | `openspec/changes/085-worldgen-stage-pipeline/verification.md` (VERIFIED) | — | VERIFIED |
| C086 | `086-worker-worldgen` | Off-main-thread generation jobs with versioned results. | exact | `openspec/changes/086-worker-worldgen/verification.md` (VERIFIED) | — | VERIFIED |
| C087 | `087-density-noise-router` | Reusable 3D density/noise composition primitives. | exact | `openspec/changes/087-density-noise-router/verification.md` (VERIFIED) | — | VERIFIED |
| C088 | `088-overworld-density-terrain` | Modern-height terrain from density functions, preserving deterministic seeds. | exact | `openspec/changes/088-overworld-density-terrain/verification.md` (VERIFIED) | — | VERIFIED |
| C089 | `089-climate-sampler` | Temperature/humidity/continentalness/erosion/weirdness-like climate fields. | exact | `openspec/changes/089-climate-sampler/verification.md` (VERIFIED) | — | VERIFIED |
| C090 | `090-biome-source` | Registry-driven biome selection from climate samples. | exact | `openspec/changes/090-biome-source/verification.md` (VERIFIED) | — | VERIFIED |
| C091 | `091-surface-rule-engine` | Layered biome/height/noise-driven surface replacement rules. | exact | `openspec/changes/091-surface-rule-engine/verification.md` (VERIFIED) | — | VERIFIED |
| C092 | `092-cave-carver-system` | Configurable 3D cave-carving stage independent of terrain density. | exact | `openspec/changes/092-cave-carver-system/verification.md` (VERIFIED) | — | VERIFIED |
| C093 | `093-aquifer-system` | Underground water/lava aquifer decisions. | exact | `openspec/changes/093-aquifer-system/verification.md` (VERIFIED) | — | VERIFIED |
| C094 | `094-configured-feature-core` | Data-driven worldgen feature definitions. | exact | `openspec/changes/094-configured-feature-core/verification.md` (VERIFIED) | — | VERIFIED |
| C095 | `095-placed-feature-core` | Placement modifiers, counts, rarity, height, biome and survival filters. | exact | `openspec/changes/095-placed-feature-core/verification.md` (VERIFIED) | — | VERIFIED |
| C096 | `096-ore-generation` | Registry/tag-driven ore configured/placed features. | exact | `openspec/changes/096-ore-generation/verification.md` (VERIFIED) | — | VERIFIED |
| C097 | `097-tree-feature-system` | Configurable trunk/foliage tree features replacing hard-coded tree placement. | exact | `openspec/changes/097-tree-feature-system/verification.md` (VERIFIED) | — | VERIFIED |
| C098 | `098-vegetation-features` | Grass/flowers/mushrooms/simple vegetation placed features. | exact | `openspec/changes/098-vegetation-features/verification.md` (VERIFIED) | — | VERIFIED |
| C099 | `099-structure-template-format` | Original structure template blocks/entities/connectors with transforms. | exact | `openspec/changes/099-structure-template-format/verification.md` (VERIFIED) | — | VERIFIED |
| C100 | `100-structure-placement-core` | Seeded spacing/separation/biome/terrain-aware placement. | exact | `openspec/changes/100-structure-placement-core/verification.md` (VERIFIED) | — | VERIFIED |
| C101 | `101-small-structure-baseline` | First simple generated structure end-to-end using the template system. | exact | `openspec/changes/101-small-structure-baseline/verification.md` (VERIFIED) | — | VERIFIED |
| C102 | `102-worldgen-golden-seeds` | Golden seed/hash/landmark regression fixtures across coordinates and versions. | exact | `openspec/changes/102-worldgen-golden-seeds/verification.md` (VERIFIED) | — | VERIFIED |
| C103 | `103-recipe-registry-loader` | Load/validate shaped, shapeless, and processing recipe definitions. | exact | `openspec/changes/103-recipe-registry-loader/verification.md` (VERIFIED) | — | VERIFIED |
| C104 | `104-player-2x2-crafting` | True 2×2 ingredient grid and result consumption semantics. | exact | `openspec/changes/104-player-2x2-crafting/verification.md` (VERIFIED) | — | VERIFIED |
| C105 | `105-crafting-table-3x3` | Crafting-table block interaction and 3×3 grid. | exact | `openspec/changes/105-crafting-table-3x3/verification.md` (VERIFIED) | — | VERIFIED |
| C106 | `106-container-menu-transaction-core` | Slot/menu transaction rules reusable by crafting and storage screens. | exact | `openspec/changes/106-container-menu-transaction-core/verification.md` (VERIFIED) | — | VERIFIED |
| C107 | `107-chest-block-entity` | Single chest inventory persistence and interaction. | exact | `openspec/changes/107-chest-block-entity/verification.md` (VERIFIED) | — | VERIFIED |
| C108 | `108-double-chest-composition` | Deterministic adjacent chest pairing/unpairing. | exact | `openspec/changes/108-double-chest-composition/verification.md` (VERIFIED) | — | VERIFIED |
| C109 | `109-furnace-block-entity` | Furnace inventory, timers, lit state, persistence. | exact | `openspec/changes/109-furnace-block-entity/verification.md` (VERIFIED) | — | VERIFIED |
| C110 | `110-furnace-recipes-and-fuels` | Smelting recipes, fuel values, XP output, transactional behavior. | exact | `openspec/changes/110-furnace-recipes-and-fuels/verification.md` (VERIFIED) | — | VERIFIED |
| C111 | `111-item-entity-drops` | World item entity spawning for block/entity drops. | exact | `openspec/changes/111-item-entity-drops/verification.md` (VERIFIED) | — | VERIFIED |
| C112 | `112-item-pickup-and-despawn` | Pickup delay, merge policy, inventory insertion, despawn timer. | exact | `openspec/changes/112-item-pickup-and-despawn/verification.md` (VERIFIED) | — | VERIFIED |
| C113 | `113-equipment-slots` | Armor/offhand/mainhand equipment state and inventory integration. | exact | `openspec/changes/113-equipment-slots/verification.md` (VERIFIED) | — | VERIFIED |
| C114 | `114-tool-tier-and-harvest-rules` | Mining level, preferred tools, correct drops/speeds through tags. | exact | `openspec/changes/114-tool-tier-and-harvest-rules/verification.md` (VERIFIED) | — | VERIFIED |
| C115 | `115-item-durability-repair` | General component-driven durability damage/break/repair rules. | exact | `openspec/changes/115-item-durability-repair/verification.md` (VERIFIED) | — | VERIFIED |
| C116 | `116-armor-protection` | Armor points/toughness/durability integrated into damage calculation. | exact | `openspec/changes/116-armor-protection/verification.md` (VERIFIED) | — | VERIFIED |
| C117 | `117-player-experience` | XP orbs/points/levels and persistence. | exact | `openspec/changes/117-player-experience/verification.md` (VERIFIED) | — | VERIFIED |
| C118 | `118-enchantment-registry` | Enchantment definitions, levels, applicability, conflict rules. | exact | `openspec/changes/118-enchantment-registry/verification.md` (VERIFIED) | — | VERIFIED |
| C119 | `119-enchantment-application` | Apply enchantment effects to mining/combat/durability pathways. | exact | `openspec/changes/119-enchantment-application/verification.md` (VERIFIED) | — | VERIFIED |
| C120 | `120-enchanting-table` | Table interaction, cost generation, XP/lapis-like payment using original data. | exact | `openspec/changes/120-enchanting-table/verification.md` (VERIFIED) | — | VERIFIED |
| C121 | `121-status-effect-runtime` | Effect ticking, duration/amplifier stacking, attribute hooks. | exact | `openspec/changes/121-status-effect-runtime/verification.md` (VERIFIED) | — | VERIFIED |
| C122 | `122-potion-item-data` | Potion contents in item components and consume/splash payload primitives. | exact | `openspec/changes/122-potion-item-data/verification.md` (VERIFIED) | — | VERIFIED |
| C123 | `123-brewing-stand` | Brewing block entity, recipes, fuel/timing/persistence. | exact | `openspec/changes/123-brewing-stand/verification.md` (VERIFIED) | — | VERIFIED |
| C124 | `124-food-component-runtime` | Hunger/saturation/effect application from item data. | exact | `openspec/changes/124-food-component-runtime/verification.md` (VERIFIED) | — | VERIFIED |
| C125 | `125-crop-growth` | Age block states, random-tick crop growth, drops. | exact | `openspec/changes/125-crop-growth/verification.md` (VERIFIED) | — | VERIFIED |
| C126 | `126-farmland-moisture` | Hydration, trampling/reversion rules, crop support. | exact | `openspec/changes/126-farmland-moisture/verification.md` (VERIFIED) | — | VERIFIED |
| C127 | `127-bonemeal-growth-hooks` | Fertilization interface and first crop/tree behavior. | exact | `openspec/changes/127-bonemeal-growth-hooks/verification.md` (VERIFIED) | — | VERIFIED |
| C128 | `128-fire-block-simulation` | Ignition, age, burn/spread/extinguish with bounded scheduled/random ticks. | exact | `openspec/changes/128-fire-block-simulation/verification.md` (VERIFIED) | — | VERIFIED |
| C129 | `129-entity-core` | Stable IDs, transforms, velocity, type, lifecycle, dimension ownership. | exact | `openspec/changes/129-entity-core/verification.md` (VERIFIED) | — | VERIFIED |
| C130 | `130-entity-collision-and-physics` | Shape-based world/entity movement and gravity for non-player entities. | exact | `openspec/changes/130-entity-collision-and-physics/verification.md` (VERIFIED) | — | VERIFIED |
| C131 | `131-entity-persistence-runtime` | Save/load persistent entities through the existing entity store. | exact | `openspec/changes/131-entity-persistence-runtime/verification.md` (VERIFIED) | — | VERIFIED |
| C132 | `132-entity-chunk-tracking` | Activate/deactivate entities based on chunk tickets/simulation distance. | exact | `openspec/changes/132-entity-chunk-tracking/verification.md` (VERIFIED) | — | VERIFIED |
| C133 | `133-entity-data-tracker` | Dirty synchronized property container for rendering/networking. | exact | `openspec/changes/133-entity-data-tracker/verification.md` (VERIFIED) | — | VERIFIED |
| C134 | `134-navigation-grid-query` | Walkability/cost queries from voxel shapes and fluids. | exact | `openspec/changes/134-navigation-grid-query/verification.md` (VERIFIED) | — | VERIFIED |
| C135 | `135-a-star-pathfinding` | Bounded deterministic path search with cancellation/stale guards. | exact | `openspec/changes/135-a-star-pathfinding/verification.md` (VERIFIED) | — | VERIFIED |
| C136 | `136-mob-goal-selector` | Prioritized interruptible AI goal framework. | exact | `openspec/changes/136-mob-goal-selector/verification.md` (VERIFIED) | — | VERIFIED |
| C137 | `137-mob-spawn-rules` | Light/biome/block/distance/category spawn predicates. | exact | `openspec/changes/137-mob-spawn-rules/verification.md` (VERIFIED) | — | VERIFIED |
| C138 | `138-mob-spawn-cycle` | Per-category caps and deterministic spawn attempts in ticking chunks. | exact | `openspec/changes/138-mob-spawn-cycle/verification.md` (VERIFIED) | — | VERIFIED |
| C139 | `139-passive-wander-ai` | Wander/look/avoid-water baseline behavior. | exact | `openspec/changes/139-passive-wander-ai/verification.md` (VERIFIED) | — | VERIFIED |
| C140 | `140-hostile-target-ai` | Target acquisition, chase, attack-range baseline behavior. | exact | `openspec/changes/140-hostile-target-ai/verification.md` (VERIFIED) | — | VERIFIED |
| C141 | `141-melee-combat-cooldown` | Java-like attack cooldown, damage, knockback, invulnerability frames. | exact | `openspec/changes/141-melee-combat-cooldown/verification.md` (VERIFIED) | — | VERIFIED |
| C142 | `142-projectile-core` | Projectile motion, collision, ownership, damage/event hooks. | exact | `openspec/changes/142-projectile-core/verification.md` (VERIFIED) | — | VERIFIED |
| C143 | `143-bow-and-arrow` | Charge/fire arrows, ammo, pickup behavior, damage. | exact | `openspec/changes/143-bow-and-arrow/verification.md` (VERIFIED) | — | VERIFIED |
| C144 | `144-shield-blocking` | Offhand shield use, directional blocking, durability/cooldown hooks. | exact | `openspec/changes/144-shield-blocking/verification.md` (VERIFIED) | — | VERIFIED |
| C145 | `145-passive-mob-baseline` | First fully interactive passive mob end-to-end. | exact | `openspec/changes/145-passive-mob-baseline/verification.md` (VERIFIED) | — | VERIFIED |
| C146 | `146-hostile-mob-baseline` | First fully interactive hostile mob end-to-end. | exact | `openspec/changes/146-hostile-mob-baseline/verification.md` (VERIFIED) | — | VERIFIED |
| C147 | `147-animal-breeding` | Love state, food triggers, child spawn, cooldown. | exact | `openspec/changes/147-animal-breeding/verification.md` (VERIFIED) | — | VERIFIED |
| C148 | `148-mob-drop-loot` | Entity death routes through loot tables and XP/item entities. | exact | `openspec/changes/148-mob-drop-loot/verification.md` (VERIFIED) | — | VERIFIED |
| C149 | `149-point-of-interest-system` | Persisted searchable POIs for villager-like AI. | exact | `openspec/changes/149-point-of-interest-system/verification.md` (VERIFIED) | — | VERIFIED |
| C150 | `150-villager-professions` | Profession/workstation assignment and schedules. | exact | `openspec/changes/150-villager-professions/verification.md` (VERIFIED) | — | VERIFIED |
| C151 | `151-villager-trading` | Trade offers, demand/use limits, XP/progression, transactional UI. | exact | `openspec/changes/151-villager-trading/verification.md` (VERIFIED) | — | VERIFIED |
| C152 | `152-raid-state-machine` | Settlement raid trigger/waves/win-loss persistence. | exact | `openspec/changes/152-raid-state-machine/verification.md` (VERIFIED) | — | VERIFIED |
| C153 | `153-boss-framework` | Boss health/events/arena lifecycle reusable by major bosses. | exact | `openspec/changes/153-boss-framework/verification.md` (VERIFIED) | — | VERIFIED |
| C154 | `154-redstone-signal-core` | Directional weak/strong signal queries and 0–15 power values. | exact | `openspec/changes/154-redstone-signal-core/verification.md` (VERIFIED) | — | VERIFIED |
| C155 | `155-redstone-wire-connectivity` | Wire block states, connection shapes, attenuation. | exact | `openspec/changes/155-redstone-wire-connectivity/verification.md` (VERIFIED) | — | VERIFIED |
| C156 | `156-redstone-update-order` | Deterministic scheduled neighbor propagation and loop protection. | exact | `openspec/changes/156-redstone-update-order/verification.md` (VERIFIED) | — | VERIFIED |
| C157 | `157-redstone-input-components` | Levers/buttons/plates signal generation and timing. | exact | `openspec/changes/157-redstone-input-components/verification.md` (VERIFIED) | — | VERIFIED |
| C158 | `158-redstone-torch` | Torch inversion/burnout semantics. | exact | `openspec/changes/158-redstone-torch/verification.md` (VERIFIED) | — | VERIFIED |
| C159 | `159-repeater` | Direction/delay/locking and scheduled output. | exact | `openspec/changes/159-repeater/verification.md` (VERIFIED) | — | VERIFIED |
| C160 | `160-comparator` | Compare/subtract modes and container signal reads. | exact | `openspec/changes/160-comparator/verification.md` (VERIFIED) | — | VERIFIED |
| C161 | `161-observer` | Detect block-state changes and emit pulses. | exact | `openspec/changes/161-observer/verification.md` (VERIFIED) | — | VERIFIED |
| C162 | `162-redstone-consumer-blocks` | Lamps, doors, trapdoors and simple powered-state consumers. | exact | `openspec/changes/162-redstone-consumer-blocks/verification.md` (VERIFIED) | — | VERIFIED |
| C163 | `163-piston-move-planner` | Validate bounded push chains, immovable blocks, destroy reactions. | exact | `openspec/changes/163-piston-move-planner/verification.md` (VERIFIED) | — | VERIFIED |
| C164 | `164-piston-execution` | Atomic block-state/block-entity moves and neighbor updates. | exact | `openspec/changes/164-piston-execution/verification.md` (VERIFIED) | — | VERIFIED |
| C165 | `165-slime-honey-move-groups` | Sticky adjacency rules and push grouping. | exact | `openspec/changes/165-slime-honey-move-groups/verification.md` (VERIFIED) | — | VERIFIED |
| C166 | `166-hopper-transfer` | Directional timed item transfer using menu/container transactions. | exact | `openspec/changes/166-hopper-transfer/verification.md` (VERIFIED) | — | VERIFIED |
| C167 | `167-dropper` | Inventory ejection into world/containers. | exact | `openspec/changes/167-dropper/verification.md` (VERIFIED) | — | VERIFIED |
| C168 | `168-dispenser` | Data/behavior-driven dispenser actions for initial items. | exact | `openspec/changes/168-dispenser/verification.md` (VERIFIED) | — | VERIFIED |
| C169 | `169-explosion-core` | Deterministic ray/strength block destruction, entity damage, drops. | exact | `openspec/changes/169-explosion-core/verification.md` (VERIFIED) | — | VERIFIED |
| C170 | `170-tnt-block-entity` | Priming, fuse, entity, redstone/fire integration. | exact | `openspec/changes/170-tnt-block-entity/verification.md` (VERIFIED) | — | VERIFIED |
| C171 | `171-rail-block-states` | Rail shapes, placement, neighbor updates. | exact | `openspec/changes/171-rail-block-states/verification.md` (VERIFIED) | — | VERIFIED |
| C172 | `172-minecart-physics` | Rail-constrained cart movement and collisions. | exact | `openspec/changes/172-minecart-physics/verification.md` (VERIFIED) | — | VERIFIED |
| C173 | `173-redstone-regression-worlds` | Headless canonical circuit fixtures and timing assertions. | exact | `openspec/changes/173-redstone-regression-worlds/verification.md` (VERIFIED) | — | VERIFIED |
| C174 | `174-dimension-manager` | Multiple loaded dimensions with independent world/chunk/tick state. | exact | `openspec/changes/174-dimension-manager/verification.md` (VERIFIED) | — | VERIFIED |
| C175 | `175-nether-dimension-type` | Nether bounds, no skylight, ambient rules and save namespace. | exact | `openspec/changes/175-nether-dimension-type/verification.md` (VERIFIED) | — | VERIFIED |
| C176 | `176-nether-world-generation` | Nether density/surface/biome baseline through existing worldgen pipeline. | exact | `openspec/changes/176-nether-world-generation/verification.md` (VERIFIED) | — | VERIFIED |
| C177 | `177-nether-portal-blocks` | Portal frame validation and portal block state/lifecycle. | exact | `openspec/changes/177-nether-portal-blocks/verification.md` (VERIFIED) | — | VERIFIED |
| C178 | `178-nether-portal-linking` | Coordinate scale, destination search/create, cooldown, safe placement. | exact | `openspec/changes/178-nether-portal-linking/verification.md` (VERIFIED) | — | VERIFIED |
| C179 | `179-nether-content-baseline` | Core Nether blocks/resources/mobs required for progression. | exact | `openspec/changes/179-nether-content-baseline/verification.md` (VERIFIED) | — | VERIFIED |
| C180 | `180-end-dimension-type` | End bounds/skylight/ambient/save rules. | exact | `openspec/changes/180-end-dimension-type/verification.md` (VERIFIED) | — | VERIFIED |
| C181 | `181-end-world-generation` | Main island/outer island baseline. | exact | `openspec/changes/181-end-world-generation/verification.md` (VERIFIED) | — | VERIFIED |
| C182 | `182-end-portal-progression` | Portal activation/teleport and return gateway behavior baseline. | exact | `openspec/changes/182-end-portal-progression/verification.md` (VERIFIED) | — | VERIFIED |
| C183 | `183-ender-dragon-boss` | Dragon boss lifecycle, crystals, damage phases, victory state. | exact | `openspec/changes/183-ender-dragon-boss/verification.md` (VERIFIED) | — | VERIFIED |
| C184 | `184-end-exit-progression` | Exit portal, boss completion persistence, post-boss state. | exact | `openspec/changes/184-end-exit-progression/verification.md` (VERIFIED) | — | VERIFIED |
| C185 | `185-advancement-framework` | Criteria/triggers/progress/rewards persistence. | exact | `openspec/changes/185-advancement-framework/verification.md` (VERIFIED) | — | VERIFIED |
| C186 | `186-core-progression-advancements` | Advancement chain covering survival-to-End progression. | exact | `openspec/changes/186-core-progression-advancements/verification.md` (VERIFIED) | — | VERIFIED |
| C187 | `187-statistics-framework` | Typed counters, persistence, event hooks and UI data. | exact | `openspec/changes/187-statistics-framework/verification.md` (VERIFIED) | — | VERIFIED |
| C188 | `188-world-difficulty` | Peaceful/easy/normal/hard knobs applied to spawn/damage/survival. | exact | `openspec/changes/188-world-difficulty/verification.md` (VERIFIED) | — | VERIFIED |
| C189 | `189-gamerule-framework` | Typed persisted gamerules queried by simulation. | exact | `openspec/changes/189-gamerule-framework/verification.md` (VERIFIED) | — | VERIFIED |
| C190 | `190-command-parser` | Headless-safe command syntax, permission context, typed arguments. | exact | `openspec/changes/190-command-parser/verification.md` (VERIFIED) | — | VERIFIED |
| C191 | `191-core-commands` | Time/weather/gamemode/give/teleport-like original commands for testing/admin. | exact | `openspec/changes/191-core-commands/verification.md` (VERIFIED) | — | VERIFIED |
| C192 | `192-creative-mode` | Flight, instant break, creative inventory, no survival depletion. | exact | `openspec/changes/192-creative-mode/verification.md` (VERIFIED) | — | VERIFIED |
| C193 | `193-hardcore-mode` | Hard difficulty lock and death-world semantics. | exact | `openspec/changes/193-hardcore-mode/verification.md` (VERIFIED) | — | VERIFIED |
| C194 | `194-adventure-mode` | Restricted breaking/placing using item components/tags. | exact | `openspec/changes/194-adventure-mode/verification.md` (VERIFIED) | — | VERIFIED |
| C195 | `195-spectator-mode` | Noclip flight, no interaction, spectator camera semantics. | exact | `openspec/changes/195-spectator-mode/verification.md` (VERIFIED) | — | VERIFIED |
| C196 | `196-weather-state` | Persisted rain/thunder timers and gamerule/time integration. | exact | `openspec/changes/196-weather-state/verification.md` (VERIFIED) | — | VERIFIED |
| C197 | `197-weather-rendering` | Original rain/thunder visuals/audio without changing simulation truth. | approx | `openspec/changes/197-weather-rendering/verification.md` (VERIFIED) | Constraint: master-plan §33 forbids proprietary assets. Original procedural weather visuals/audio approximate vanilla rain/thunder presentation without copying copyrighted effect assets. | VERIFIED |
| C198 | `198-sleep-and-time-skip` | Bed interaction, spawn point, occupancy, night skipping rules. | exact | `openspec/changes/198-sleep-and-time-skip/verification.md` (VERIFIED) | — | VERIFIED |
| C199 | `199-particle-system` | Pooled data-driven particles and gameplay event hooks. | exact | `openspec/changes/199-particle-system/verification.md` (VERIFIED) | — | VERIFIED |
| C200 | `200-sound-event-system` | Registry-driven positional/original sound events and categories. | approx | `openspec/changes/200-sound-event-system/verification.md` (VERIFIED) | Constraint: no proprietary sound assets. Positional sound events play original procedural WebAudio samples; timbres differ from vanilla sounds. | VERIFIED |
| C201 | `201-ambient-audio` | Original biome/environment ambience and music scheduling. | approx | `openspec/changes/201-ambient-audio/verification.md` (VERIFIED) | Constraint: no proprietary audio assets. Ambience/music are original procedural compositions on the same scheduling model; tracks differ from vanilla music. | VERIFIED |
| C202 | `202-inventory-screen-parity` | Drag/click/shift-click/hotbar swap/stack splitting semantics. | exact | `openspec/changes/202-inventory-screen-parity/verification.md` (VERIFIED) | — | VERIFIED |
| C203 | `203-container-screen-framework` | Reusable menu UI bound to transactional container state. | exact | `openspec/changes/203-container-screen-framework/verification.md` (VERIFIED) | — | VERIFIED |
| C204 | `204-recipe-book` | Known recipes, filtering/search, recipe placement helper. | exact | `openspec/changes/204-recipe-book/verification.md` (VERIFIED) | — | VERIFIED |
| C205 | `205-hud-parity` | Hearts, hunger, armor, air, XP, status effects, selected item and boss bars. | exact | `openspec/changes/205-hud-parity/verification.md` (VERIFIED) | — | VERIFIED |
| C206 | `206-settings-persistence` | Graphics/audio/control/gameplay settings stored independently of worlds. | exact | `openspec/changes/206-settings-persistence/verification.md` (VERIFIED) | — | VERIFIED |
| C207 | `207-keybinding-remap` | Conflict-aware remappable controls with persistence. | exact | `openspec/changes/207-keybinding-remap/verification.md` (VERIFIED) | — | VERIFIED |
| C208 | `208-accessibility-options` | UI scale, subtitles, reduced motion/screen effects, sensitivity and visibility options. | exact | `openspec/changes/208-accessibility-options/verification.md` (VERIFIED) | — | VERIFIED |
| C209 | `209-gamepad-controls` | Gamepad movement/look/actions/UI navigation. | exact | `openspec/changes/209-gamepad-controls/verification.md` (VERIFIED) | — | VERIFIED |
| C210 | `210-touch-controls` | Mobile touch HUD, look/movement, inventory interaction and responsive layout. | exact | `openspec/changes/210-touch-controls/verification.md` (VERIFIED) | — | VERIFIED |
| C211 | `211-internal-resource-pack-format` | Original assets organized by namespaced textures/models/sounds/metadata. | approx | `openspec/changes/211-internal-resource-pack-format/verification.md` (VERIFIED) | Constraint: no proprietary assets. Resource packs organize original/procedural textures/models/sounds; art differs visually from vanilla assets by legal necessity. | VERIFIED |
| C212 | `212-internal-data-pack-format` | Namespaced recipes/loot/tags/worldgen/advancements loaded through registries. | exact | `openspec/changes/212-internal-data-pack-format/verification.md` (VERIFIED) | — | VERIFIED |
| C213 | `213-resource-reload` | Validate and atomically reload data/resources in development without corrupting runtime state. | exact | `openspec/changes/213-resource-reload/verification.md` (VERIFIED) | — | VERIFIED |
| C214 | `214-localization-framework` | Translation keys, fallback locale, formatted parameters. | exact | `openspec/changes/214-localization-framework/verification.md` (VERIFIED) | — | VERIFIED |
| C215 | `215-block-item-content-expansion` | Expand block/item catalog through data-driven definitions, not new architecture. | exact | `openspec/changes/215-block-item-content-expansion/verification.md` (VERIFIED) | — | VERIFIED |
| C216 | `216-biome-content-expansion` | Expand biome catalog and feature combinations through the biome/worldgen registries. | exact | `openspec/changes/216-biome-content-expansion/verification.md` (VERIFIED) | — | VERIFIED |
| C217 | `217-structure-content-expansion` | Add progression-relevant structures via templates/placement rules. | exact | `openspec/changes/217-structure-content-expansion/verification.md` (VERIFIED) | — | VERIFIED |
| C218 | `218-mob-content-expansion` | Add additional passive/hostile/utility mobs through existing entity/AI primitives. | exact | `openspec/changes/218-mob-content-expansion/verification.md` (VERIFIED) | — | VERIFIED |
| C219 | `219-enchantment-potion-content-expansion` | Fill enchantment/effect/potion catalogs through existing registries. | exact | `openspec/changes/219-enchantment-potion-content-expansion/verification.md` (VERIFIED) | — | VERIFIED |
| C220 | `220-recipe-loot-content-expansion` | Fill crafting/processing/loot coverage for the expanded content catalog. | exact | `openspec/changes/220-recipe-loot-content-expansion/verification.md` (VERIFIED) | — | VERIFIED |
| C221 | `221-current-release-delta` | Isolated current-Minecraft-release behavior/content delta without destabilizing baseline architecture. | exact | `openspec/changes/221-current-release-delta/verification.md` (VERIFIED) | — | VERIFIED |
| C222 | `222-shared-simulation-package-boundary` | Extract deterministic simulation code so browser client and server can share it. | equivalent | `openspec/changes/222-shared-simulation-package-boundary/verification.md` (VERIFIED) | Browser client and dedicated TypeScript server share one deterministic simulation package instead of a unified game binary; same single-source-of-simulation-truth outcome. | VERIFIED |
| C223 | `223-network-protocol-codecs` | Versioned message IDs/codecs/validation and protocol compatibility rules. | equivalent | `openspec/changes/223-network-protocol-codecs/verification.md` (VERIFIED) | Custom versioned TypeScript message registry/codecs replace the reference wire protocol; same versioned, validated client/server messaging outcome. | VERIFIED |
| C224 | `224-dedicated-server-tick-loop` | Headless authoritative world tick process. | exact | `openspec/changes/224-dedicated-server-tick-loop/verification.md` (VERIFIED) | — | VERIFIED |
| C225 | `225-connection-lifecycle` | Connect/handshake/login-like local profile/disconnect/keepalive state machine. | exact | `openspec/changes/225-connection-lifecycle/verification.md` (VERIFIED) | — | VERIFIED |
| C226 | `226-server-chunk-streaming` | Interest-managed chunk/section snapshots and updates. | exact | `openspec/changes/226-server-chunk-streaming/verification.md` (VERIFIED) | — | VERIFIED |
| C227 | `227-server-player-movement` | Server-authoritative movement validation and teleport correction. | exact | `openspec/changes/227-server-player-movement/verification.md` (VERIFIED) | — | VERIFIED |
| C228 | `228-client-prediction-reconciliation` | Local prediction with authoritative correction/interpolation. | exact | `openspec/changes/228-client-prediction-reconciliation/verification.md` (VERIFIED) | — | VERIFIED |
| C229 | `229-entity-replication` | Spawn/despawn/tracked-data/transform replication. | exact | `openspec/changes/229-entity-replication/verification.md` (VERIFIED) | — | VERIFIED |
| C230 | `230-block-interaction-networking` | Authoritative break/place/use request validation and broadcast. | exact | `openspec/changes/230-block-interaction-networking/verification.md` (VERIFIED) | — | VERIFIED |
| C231 | `231-inventory-network-transactions` | Revisioned container/inventory actions with rejection/resync. | exact | `openspec/changes/231-inventory-network-transactions/verification.md` (VERIFIED) | — | VERIFIED |
| C232 | `232-combat-networking` | Authoritative attacks/projectiles/damage/knockback. | exact | `openspec/changes/232-combat-networking/verification.md` (VERIFIED) | — | VERIFIED |
| C233 | `233-chat-and-command-networking` | Server-routed chat and command execution context. | exact | `openspec/changes/233-chat-and-command-networking/verification.md` (VERIFIED) | — | VERIFIED |
| C234 | `234-server-world-persistence` | Server-owned save lifecycle using shared persistent codecs. | exact | `openspec/changes/234-server-world-persistence/verification.md` (VERIFIED) | — | VERIFIED |
| C235 | `235-reconnect-state-recovery` | Clean disconnect/reconnect and client state resynchronization. | exact | `openspec/changes/235-reconnect-state-recovery/verification.md` (VERIFIED) | — | VERIFIED |
| C236 | `236-multiplayer-load-tests` | Multi-client tick/chunk/entity/inventory performance and correctness fixtures. | exact | `openspec/changes/236-multiplayer-load-tests/verification.md` (VERIFIED) | — | VERIFIED |
| C237 | `237-network-adversarial-validation` | Malformed/duplicate/out-of-order/rate-abusive message handling and integrity tests. | exact | `openspec/changes/237-network-adversarial-validation/verification.md` (VERIFIED) | — | VERIFIED |
| C238 | `238-worker-and-main-thread-stress` | Saturate generation/meshing/light/save/path workers and enforce frame/tick budgets. | exact | `openspec/changes/238-worker-and-main-thread-stress/verification.md` (VERIFIED) | — | VERIFIED |
| C239 | `239-long-session-memory-stress` | Extended exploration/build/simulation memory and GPU resource leak validation. | exact | `openspec/changes/239-long-session-memory-stress/verification.md` (VERIFIED) | — | VERIFIED |
| C240 | `240-save-recovery-stress` | Abrupt close, partial write, migration, quota and import/export recovery matrix. | exact | `openspec/changes/240-save-recovery-stress/verification.md` (VERIFIED) | — | VERIFIED |
| C241 | `241-deterministic-replay-suite` | Recorded input/tick seeds reproduce authoritative state hashes. | exact | `openspec/changes/241-deterministic-replay-suite/verification.md` (VERIFIED) | — | VERIFIED |
| C242 | `242-survival-progression-e2e` | Fresh world through tools, food, shelter, Nether, End and boss completion headlessly. | exact | `openspec/changes/242-survival-progression-e2e/verification.md` (VERIFIED) | — | VERIFIED |
| C243 | `243-redstone-automation-e2e` | Representative automation circuits and timing survive save/reload/chunk cycling. | exact | `openspec/changes/243-redstone-automation-e2e/verification.md` (VERIFIED) | — | VERIFIED |
| C244 | `244-worldgen-regression-matrix` | Seed/coordinate/biome/structure/ore/cave golden matrix across supported versions. | exact | `openspec/changes/244-worldgen-regression-matrix/verification.md` (VERIFIED) | — | VERIFIED |
| C245 | `245-visual-regression-matrix` | Render/HUD/inventory/environment screenshots across quality settings and resolutions. | equivalent | `openspec/changes/245-visual-regression-matrix/verification.md` (VERIFIED) | Golden-image visual matrix captured from headless Chromium software WebGL (`workers: 1`) instead of real-GPU screenshots on physical devices; captured pixels may differ from consumer-GPU output. | VERIFIED |
| C246 | `246-input-accessibility-matrix` | Keyboard/mouse/gamepad/touch/accessibility interactions and focus-loss recovery. | exact | `openspec/changes/246-input-accessibility-matrix/verification.md` (VERIFIED) | — | VERIFIED |
| C247 | `247-performance-release-gate` | Release hardware tiers meet frame/tick/load/save/network budgets. | approx | `openspec/PROGRAM_STATE.json` validationResults (`247-performance-release-gate`: VERIFIED; commit d2e9770). Note: that change’s own `verification.md` was left stale ("NOT VERIFIED" header) — authoritative status is the JSON entry + published commit. | Constraint: budgets evaluated from headless browser measurement drivers (software WebGL), not physical release-hardware tiers; absolute frame/tick numbers differ from consumer hardware. | VERIFIED |
| C248 | `248-parity-matrix-reconciliation` | Every planned feature categorized exact/equivalent/approx/deferred/out-of-scope with evidence. | n/a | `openspec/changes/248-parity-matrix-reconciliation/verification.md` (VERIFIED) | This change: creates and reconciles `PARITY_MATRIX.md` itself (documentation-only). Historical note: a prior reconciliation pass left this row marked "in progress" after the work had closed; corrected 2026-08-23 against PROGRAM_STATE.json. | VERIFIED |
| C249 | `249-whole-codebase-adversarial-audit` | Security, correctness, reliability, data-loss, concurrency, performance and architecture audit. | n/a | `openspec/changes/249-whole-codebase-adversarial-audit/verification.md` (VERIFIED) | Documentation-only audit record (`report.md` + fragments); its blocking data-loss findings were remediated by the post-250 hardening interlock (`openspec/hardening/2026-08-21-post-250-production-persistence-hardening/`), superseding the historical `accepted` dispositions. | VERIFIED |
| C250 | `250-final-program-verification` | All mandatory changes verified, complete evidence archive, final release-readiness decision. | n/a | `openspec/changes/250-final-program-verification/verification.md` (VERIFIED) | Documentation-only evidence archive (`openspec/evidence/`); its READY decision is superseded for current release authority by the post-250 interlock and the 2026-08-23 certification package (see `PROGRAM_STATE.json` `releaseAuthority`). | VERIFIED |
| C251 | `251-live-furnace-production-integration` | Wire the verified furnace/block-entity stack into the playable Game: place, open, operate, persist, unload/reload, and break a furnace end-to-end. | exact | `openspec/changes/archive/2026-08-25-251-live-furnace-production-integration/verification.md` (VERIFIED) + `openspec/specs/live-furnace-integration/spec.md` (7 requirements, 9 scenarios) | — | VERIFIED |
| C252 | `252-wither-secondary-boss` | Close MP-19.4-1: player-driven Wither-like secondary boss — summon structure detection/consumption, invulnerable charge with exactly-once spawn explosion via the Explosion Core, three-head targeting, normal/blue skull projectiles over the projectile core, difficulty-scaled wither status effect, armored-phase projectile immunity, exactly-once Nether-Star reward through the loot pipeline, versioned persistence, live block-placement/Game integration. | exact | `openspec/changes/archive/2026-08-25-252-wither-secondary-boss/verification.md` (VERIFIED) + `specs/wither-boss/spec.md` in the same archive | Known differences (original-asset policy): original procedural visuals/audio; wire-level wither codecs deferred until a transport consumer exists; mobGriefing destroyable-filter seam not yet wired to a gamerule UI toggle. | VERIFIED |

## Master-plan-only features

Feature areas named in `MINECRAFT_PARITY_MASTER_PLAN.md` that no single numbered change covers:

| FeatureId | Feature | Reference area | Category | Evidence | Known differences / rationale | Status |
|---|---|---|---|---|---|---|
| MP-19.4-1 | Wither-like secondary boss | §19.4 names a second major boss after combat/summon-pattern/block-destruction systems stabilize; implemented by C252 building on C153/C169/C183. | exact | `openspec/changes/archive/2026-08-25-252-wither-secondary-boss/verification.md` (VERIFIED) | Known differences (documented, original-asset policy): procedural visuals/audio instead of proprietary assets; wire-level wither message codecs deferred until a transport consumer exists (229 descriptors carry spawns/transforms); mobGriefing=false destroyable-filter seam present but not yet wired to a gamerule UI toggle. | VERIFIED |
| MP-33-1 | Proprietary-service/asset features (Realms-like official infrastructure, Mojang assets/branding/decompiled code) | §2.3 and §33 explicitly exclude service-dependent and proprietary-asset features. | out-of-scope | — | Requires proprietary Mojang/Microsoft services, assets, and branding; forbidden by §33 legal guardrails and the original-asset policy. | n/a |

**Coverage note (master plan → changes):** every other master-plan feature area maps onto numbered changes, so no further MP rows are invented: §2.2 secondary targets → C193/C194/C195 (hardcore/adventure/spectator), C209/C210 (gamepad/touch), C222–C237 (dedicated-authoritative-server multiplayer), C208 (Bedrock-inspired QoL/accessibility options); §17.4 utility/tameable mobs → C218 mob-content expansion; §25 performance → C075, C238–C240, C247; §26 test strategy → C055, C102, C173, C241–C247; §27 save compatibility/migrations → C040/C041; §30 Detailed Feature Checklist areas → the phase-mapped changes 002–221 (content-breadth bullets land via C215–C220).

## Summary

| Category | Rows |
|---|---|
| exact | 241 (incl. C252 and MP-19.4-1 Wither-like secondary boss via C252) |
| equivalent | 4 |
| approx | 5 |
| out-of-scope | 1 (MP-33-1 proprietary services/assets) |
| n/a (documentation) | 3 (C248, C249, C250) |
| **Total rows** | **254** (252 change rows + 2 master-plan rows) |

Change-rows-only split: exact 240 / equivalent 4 / approx 5 / n/a 3 = 252.

**Coverage statement:** every planned change 001–252 appears in exactly one row (bijective `C001`…`C252`, no duplicates, no orphan rows), every completed change maps to at least one row citing its VERIFIED artifact, and `scripts/validate-state.mjs` cross-checks matrix rows against `PROGRAM_STATE.json` so a VERIFIED change can never silently regress to `deferred`/`planned` here. The two additional `MP-*` rows cover master-plan areas outside the numbered sequence; MP-19.4-1 is now closed `exact` by C252.
