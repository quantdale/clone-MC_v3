# Ordered Minecraft-Parity Change Sequence

This is the canonical implementation order derived from `MINECRAFT_PARITY_MASTER_PLAN.md`.

## Ordering contract

- Every change title begins with a zero-padded number.
- Implementation proceeds strictly from lowest to highest number.
- A later change may be documented in advance, but MUST NOT be implemented until the immediately preceding change is eligible to advance.
- Each change is intentionally narrow. If implementation exposes a hidden prerequisite, add a new numbered change at the appropriate boundary rather than silently expanding scope.
- Target completion is 100%. 90% is the absolute minimum and requires the explicit exception process defined in `AGENTS.md`.

---

## Program control

| # | Change | Narrow outcome |
|---|---|---|
| 001 | `001-autonomous-program-control` | Durable `/goal`, state, checkpoint, ordering, and verification-gate protocol. |

## Data and registry foundation

| # | Change | Narrow outcome |
|---|---|---|
| 002 | `002-resource-id-foundation` | Namespaced `ResourceId` parsing, canonicalization, comparison, serialization, and tests. |
| 003 | `003-generic-registry-core` | Generic typed registry with stable runtime IDs, duplicate rejection, freeze/finalize semantics, and deterministic iteration. |
| 004 | `004-block-item-registry-separation` | Separate block types from inventory item types without changing gameplay behavior. |
| 005 | `005-tag-registry` | Data-driven tag membership and tag-to-tag references with cycle/error handling. |
| 006 | `006-block-property-schema` | Typed block property definitions and legal-value validation. |
| 007 | `007-block-state-runtime-registry` | Canonical block-state combinations mapped to compact runtime IDs. |
| 008 | `008-item-stack-components` | Extensible item-stack component map replacing hard-coded durability assumptions. |
| 009 | `009-inventory-stack-migration` | Migrate inventory/hotbar storage and snapshots to component-based `ItemStack`. |
| 010 | `010-recipe-data-model` | Registry-backed recipe schema independent of the current hard-coded recipe list. |
| 011 | `011-loot-table-data-model` | Deterministic loot-table primitives for block/entity drops and conditions. |
| 012 | `012-attribute-registry` | Typed attributes and modifiers with deterministic stacking rules. |
| 013 | `013-damage-type-registry` | Data-driven damage types and flags; preserve current fall/drown/lava semantics. |
| 014 | `014-status-effect-registry` | Status-effect type registry and serializable effect instances, without gameplay effects yet. |
| 015 | `015-fluid-registry` | Separate fluid types from blocks; water/lava become registry-backed fluids. |
| 016 | `016-biome-registry` | Registry-backed biome definitions replacing string-union biome identity. |
| 017 | `017-entity-type-registry` | Entity type definitions and runtime IDs, without AI expansion. |
| 018 | `018-block-entity-type-registry` | Block-entity type registry and block compatibility declarations. |
| 019 | `019-versioned-codec-framework` | Versioned validation/codec primitives for persistent and network-safe data. |
| 020 | `020-resource-data-loader` | Deterministic loading/validation of original game data from repository assets/data files. |

## Vertical world and chunk storage

| # | Change | Narrow outcome |
|---|---|---|
| 021 | `021-section-coordinate-model` | 16×16×16 section coordinates with correct negative X/Y/Z conversion. |
| 022 | `022-paletted-container` | Compact paletted storage primitive with deterministic serialization. |
| 023 | `023-chunk-section-storage` | `ChunkSection` block-state storage using paletted containers. |
| 024 | `024-chunk-column-storage` | `ChunkColumn` grouping vertical sections by X/Z. |
| 025 | `025-dimension-type-height-model` | Dimension-specific minY/height/logical-height and skylight metadata. |
| 026 | `026-vertical-world-access` | General world reads/writes across negative and high Y, removing the 0–63 slab restriction. |
| 027 | `027-vertical-neighbor-dirtying` | Dirty propagation across all six section faces including vertical boundaries. |
| 028 | `028-section-mesh-versioning` | Section-level mesh versions/stale-job protection. |
| 029 | `029-heightmap-storage` | Chunk-column motion-blocking/surface heightmap primitives. |
| 030 | `030-chunk-status-model` | Explicit generation lifecycle statuses independent of visibility. |
| 031 | `031-chunk-ticket-model` | Typed reasons/levels for keeping chunks loaded or ticking. |
| 032 | `032-render-vs-simulation-distance` | Distinguish rendering radius from simulation/ticking radius. |
| 033 | `033-vertical-streaming` | Stream required sections/columns around the player without single-layer assumptions. |

## Persistent world storage

| # | Change | Narrow outcome |
|---|---|---|
| 034 | `034-indexeddb-world-metadata` | IndexedDB database/version/world metadata with typed repository boundary. |
| 035 | `035-indexeddb-chunk-section-store` | Persist/reload chunk columns and section block-state data. |
| 036 | `036-block-entity-persistence-store` | Separate persistent block-entity records per chunk. |
| 037 | `037-entity-persistence-store` | Separate persistent entity records per chunk/dimension. |
| 038 | `038-dirty-save-queue` | Incremental dirty-unit save queue with bounded work. |
| 039 | `039-transactional-autosave` | Crash-resistant periodic autosave and pagehide flush policy. |
| 040 | `040-legacy-localstorage-migration` | Import existing sparse edit/player/inventory saves into the new world database. |
| 041 | `041-save-schema-migrations` | Ordered persistent schema/data-version migrations. |
| 042 | `042-world-export-import` | Original world archive export/import with validation. |
| 043 | `043-storage-quota-recovery` | Quota/private-mode/storage failure detection, recovery, and user-safe behavior. |

## Fixed-tick simulation primitives

| # | Change | Narrow outcome |
|---|---|---|
| 044 | `044-fixed-20tps-clock` | Canonical deterministic 20 TPS simulation loop decoupled from render FPS. |
| 045 | `045-render-interpolation` | Render interpolation and bounded catch-up without changing simulation truth. |
| 046 | `046-singleplayer-pause-semantics` | Explicit pause rules for simulation, UI, and timers. |
| 047 | `047-scheduled-tick-queue` | Deterministic scheduled block/fluid tick queue with dedupe and persistence hooks. |
| 048 | `048-random-tick-system` | Seeded random-tick selection for eligible blocks in ticking chunks. |
| 049 | `049-neighbor-update-queue` | Ordered bounded neighbor updates with recursion/overflow protection. |
| 050 | `050-block-behavior-dispatch` | Registry-selected block behavior modules instead of central block switches. |
| 051 | `051-block-event-queue` | Local block events with deterministic ordering and bounded propagation. |
| 052 | `052-block-entity-framework` | Tickable/non-tickable block-entity lifecycle wired to chunks. |
| 053 | `053-game-event-framework` | Generic gameplay events for future sensors/AI/advancements without coupling systems. |
| 054 | `054-deterministic-rng-streams` | Named seed-derived RNG streams for simulation subsystems. |
| 055 | `055-simulation-test-harness` | Headless tick stepping, fixture worlds, state assertions, and deterministic replay hooks. |

## Block geometry and rendering

| # | Change | Narrow outcome |
|---|---|---|
| 056 | `056-voxel-shape-core` | Immutable composable voxel shapes for collision, selection, and occlusion. |
| 057 | `057-shape-aware-player-collision` | Player collision queries use block collision shapes rather than full-cube assumptions. |
| 058 | `058-shape-aware-raycast` | Selection/interactions raycast against selection shapes. |
| 059 | `059-block-model-data` | Original block-model geometry/texture-reference schema. |
| 060 | `060-blockstate-model-resolution` | Resolve block states to render models deterministically. |
| 061 | `061-render-layer-model` | Opaque/cutout/translucent/emissive render-layer classification. |
| 062 | `062-greedy-opaque-meshing` | Greedy merge compatible opaque cube faces with regression equivalence tests. |
| 063 | `063-template-partial-block-meshing` | Mesh slabs/stairs/panes/other model templates without full-cube assumptions. |
| 064 | `064-worker-job-protocol` | Versioned transferable worker request/result protocol with stale result rejection. |
| 065 | `065-worker-section-meshing` | Move section meshing off the main thread. |
| 066 | `066-voxel-light-storage` | Section nibble arrays and light value accessors. |
| 067 | `067-skylight-propagation` | Deterministic skylight initialization/propagation across sections. |
| 068 | `068-blocklight-propagation` | Luminance-source block-light propagation. |
| 069 | `069-incremental-light-updates` | Correct light removal/repropagation after block edits. |
| 070 | `070-light-aware-meshing` | Per-vertex light values enter generated meshes. |
| 071 | `071-ambient-occlusion` | Minecraft-like local ambient occlusion at block vertices. |
| 072 | `072-biome-tint-rendering` | Biome-controlled tint attributes for grass/foliage/water-like surfaces. |
| 073 | `073-animated-texture-metadata` | Time-based animated atlas frames without gameplay coupling. |
| 074 | `074-translucent-surface-rendering` | Dedicated translucent geometry handling and stable ordering policy. |
| 075 | `075-render-performance-contract` | Draw-call, mesh-build, frame-time, memory, and render-distance budgets with automated measurement. |

## Fluids

| # | Change | Narrow outcome |
|---|---|---|
| 076 | `076-fluid-state-levels` | Source/flowing fluid state with level/falling metadata. |
| 077 | `077-fluid-tick-dispatch` | Scheduled fluid tick integration and bounded updates. |
| 078 | `078-water-flow-simulation` | Water downward/horizontal propagation and source rules. |
| 079 | `079-lava-flow-simulation` | Slower dimension-aware lava propagation. |
| 080 | `080-water-lava-interactions` | Deterministic fluid-contact transformations. |
| 081 | `081-waterlogging-state` | Waterlogged block-state support and fluid coexistence semantics. |
| 082 | `082-fluid-collision-movement` | Fluid immersion, movement drag, buoyancy, and eye-fluid state from fluid data. |
| 083 | `083-fluid-surface-meshing` | Level-aware fluid surface geometry and side heights. |
| 084 | `084-fluid-regression-suite` | Deterministic fixtures for flow, boundaries, unload/reload, and performance. |

## World generation architecture

| # | Change | Narrow outcome |
|---|---|---|
| 085 | `085-worldgen-stage-pipeline` | Explicit deterministic generation stages/status transitions. |
| 086 | `086-worker-worldgen` | Off-main-thread generation jobs with versioned results. |
| 087 | `087-density-noise-router` | Reusable 3D density/noise composition primitives. |
| 088 | `088-overworld-density-terrain` | Modern-height terrain from density functions, preserving deterministic seeds. |
| 089 | `089-climate-sampler` | Temperature/humidity/continentalness/erosion/weirdness-like climate fields. |
| 090 | `090-biome-source` | Registry-driven biome selection from climate samples. |
| 091 | `091-surface-rule-engine` | Layered biome/height/noise-driven surface replacement rules. |
| 092 | `092-cave-carver-system` | Configurable 3D cave-carving stage independent of terrain density. |
| 093 | `093-aquifer-system` | Underground water/lava aquifer decisions. |
| 094 | `094-configured-feature-core` | Data-driven worldgen feature definitions. |
| 095 | `095-placed-feature-core` | Placement modifiers, counts, rarity, height, biome and survival filters. |
| 096 | `096-ore-generation` | Registry/tag-driven ore configured/placed features. |
| 097 | `097-tree-feature-system` | Configurable trunk/foliage tree features replacing hard-coded tree placement. |
| 098 | `098-vegetation-features` | Grass/flowers/mushrooms/simple vegetation placed features. |
| 099 | `099-structure-template-format` | Original structure template blocks/entities/connectors with transforms. |
| 100 | `100-structure-placement-core` | Seeded spacing/separation/biome/terrain-aware placement. |
| 101 | `101-small-structure-baseline` | First simple generated structure end-to-end using the template system. |
| 102 | `102-worldgen-golden-seeds` | Golden seed/hash/landmark regression fixtures across coordinates and versions. |

## Crafting, containers, equipment, and progression primitives

| # | Change | Narrow outcome |
|---|---|---|
| 103 | `103-recipe-registry-loader` | Load/validate shaped, shapeless, and processing recipe definitions. |
| 104 | `104-player-2x2-crafting` | True 2×2 ingredient grid and result consumption semantics. |
| 105 | `105-crafting-table-3x3` | Crafting-table block interaction and 3×3 grid. |
| 106 | `106-container-menu-transaction-core` | Slot/menu transaction rules reusable by crafting and storage screens. |
| 107 | `107-chest-block-entity` | Single chest inventory persistence and interaction. |
| 108 | `108-double-chest-composition` | Deterministic adjacent chest pairing/unpairing. |
| 109 | `109-furnace-block-entity` | Furnace inventory, timers, lit state, persistence. |
| 110 | `110-furnace-recipes-and-fuels` | Smelting recipes, fuel values, XP output, transactional behavior. |
| 111 | `111-item-entity-drops` | World item entity spawning for block/entity drops. |
| 112 | `112-item-pickup-and-despawn` | Pickup delay, merge policy, inventory insertion, despawn timer. |
| 113 | `113-equipment-slots` | Armor/offhand/mainhand equipment state and inventory integration. |
| 114 | `114-tool-tier-and-harvest-rules` | Mining level, preferred tools, correct drops/speeds through tags. |
| 115 | `115-item-durability-repair` | General component-driven durability damage/break/repair rules. |
| 116 | `116-armor-protection` | Armor points/toughness/durability integrated into damage calculation. |
| 117 | `117-player-experience` | XP orbs/points/levels and persistence. |
| 118 | `118-enchantment-registry` | Enchantment definitions, levels, applicability, conflict rules. |
| 119 | `119-enchantment-application` | Apply enchantment effects to mining/combat/durability pathways. |
| 120 | `120-enchanting-table` | Table interaction, cost generation, XP/lapis-like payment using original data. |
| 121 | `121-status-effect-runtime` | Effect ticking, duration/amplifier stacking, attribute hooks. |
| 122 | `122-potion-item-data` | Potion contents in item components and consume/splash payload primitives. |
| 123 | `123-brewing-stand` | Brewing block entity, recipes, fuel/timing/persistence. |
| 124 | `124-food-component-runtime` | Hunger/saturation/effect application from item data. |
| 125 | `125-crop-growth` | Age block states, random-tick crop growth, drops. |
| 126 | `126-farmland-moisture` | Hydration, trampling/reversion rules, crop support. |
| 127 | `127-bonemeal-growth-hooks` | Fertilization interface and first crop/tree behavior. |
| 128 | `128-fire-block-simulation` | Ignition, age, burn/spread/extinguish with bounded scheduled/random ticks. |

## Entity framework and mobs

| # | Change | Narrow outcome |
|---|---|---|
| 129 | `129-entity-core` | Stable IDs, transforms, velocity, type, lifecycle, dimension ownership. |
| 130 | `130-entity-collision-and-physics` | Shape-based world/entity movement and gravity for non-player entities. |
| 131 | `131-entity-persistence-runtime` | Save/load persistent entities through the existing entity store. |
| 132 | `132-entity-chunk-tracking` | Activate/deactivate entities based on chunk tickets/simulation distance. |
| 133 | `133-entity-data-tracker` | Dirty synchronized property container for rendering/networking. |
| 134 | `134-navigation-grid-query` | Walkability/cost queries from voxel shapes and fluids. |
| 135 | `135-a-star-pathfinding` | Bounded deterministic path search with cancellation/stale guards. |
| 136 | `136-mob-goal-selector` | Prioritized interruptible AI goal framework. |
| 137 | `137-mob-spawn-rules` | Light/biome/block/distance/category spawn predicates. |
| 138 | `138-mob-spawn-cycle` | Per-category caps and deterministic spawn attempts in ticking chunks. |
| 139 | `139-passive-wander-ai` | Wander/look/avoid-water baseline behavior. |
| 140 | `140-hostile-target-ai` | Target acquisition, chase, attack-range baseline behavior. |
| 141 | `141-melee-combat-cooldown` | Java-like attack cooldown, damage, knockback, invulnerability frames. |
| 142 | `142-projectile-core` | Projectile motion, collision, ownership, damage/event hooks. |
| 143 | `143-bow-and-arrow` | Charge/fire arrows, ammo, pickup behavior, damage. |
| 144 | `144-shield-blocking` | Offhand shield use, directional blocking, durability/cooldown hooks. |
| 145 | `145-passive-mob-baseline` | First fully interactive passive mob end-to-end. |
| 146 | `146-hostile-mob-baseline` | First fully interactive hostile mob end-to-end. |
| 147 | `147-animal-breeding` | Love state, food triggers, child spawn, cooldown. |
| 148 | `148-mob-drop-loot` | Entity death routes through loot tables and XP/item entities. |
| 149 | `149-point-of-interest-system` | Persisted searchable POIs for villager-like AI. |
| 150 | `150-villager-professions` | Profession/workstation assignment and schedules. |
| 151 | `151-villager-trading` | Trade offers, demand/use limits, XP/progression, transactional UI. |
| 152 | `152-raid-state-machine` | Settlement raid trigger/waves/win-loss persistence. |
| 153 | `153-boss-framework` | Boss health/events/arena lifecycle reusable by major bosses. |

## Redstone and automation

| # | Change | Narrow outcome |
|---|---|---|
| 154 | `154-redstone-signal-core` | Directional weak/strong signal queries and 0–15 power values. |
| 155 | `155-redstone-wire-connectivity` | Wire block states, connection shapes, attenuation. |
| 156 | `156-redstone-update-order` | Deterministic scheduled neighbor propagation and loop protection. |
| 157 | `157-redstone-input-components` | Levers/buttons/plates signal generation and timing. |
| 158 | `158-redstone-torch` | Torch inversion/burnout semantics. |
| 159 | `159-repeater` | Direction/delay/locking and scheduled output. |
| 160 | `160-comparator` | Compare/subtract modes and container signal reads. |
| 161 | `161-observer` | Detect block-state changes and emit pulses. |
| 162 | `162-redstone-consumer-blocks` | Lamps, doors, trapdoors and simple powered-state consumers. |
| 163 | `163-piston-move-planner` | Validate bounded push chains, immovable blocks, destroy reactions. |
| 164 | `164-piston-execution` | Atomic block-state/block-entity moves and neighbor updates. |
| 165 | `165-slime-honey-move-groups` | Sticky adjacency rules and push grouping. |
| 166 | `166-hopper-transfer` | Directional timed item transfer using menu/container transactions. |
| 167 | `167-dropper` | Inventory ejection into world/containers. |
| 168 | `168-dispenser-behavior-dispatch` | Data/behavior-driven dispenser actions for initial items. |
| 169 | `169-explosion-core` | Deterministic ray/strength block destruction, entity damage, drops. |
| 170 | `170-tnt-block-entity` | Priming, fuse, entity, redstone/fire integration. |
| 171 | `171-rail-block-states` | Rail shapes, placement, neighbor updates. |
| 172 | `172-minecart-physics` | Rail-constrained cart movement and collisions. |
| 173 | `173-redstone-regression-worlds` | Headless canonical circuit fixtures and timing assertions. |

## Dimensions and major progression

| # | Change | Narrow outcome |
|---|---|---|
| 174 | `174-dimension-manager` | Multiple loaded dimensions with independent world/chunk/tick state. |
| 175 | `175-nether-dimension-type` | Nether bounds, no skylight, ambient rules and save namespace. |
| 176 | `176-nether-world-generation` | Nether density/surface/biome baseline through existing worldgen pipeline. |
| 177 | `177-nether-portal-blocks` | Portal frame validation and portal block state/lifecycle. |
| 178 | `178-nether-portal-linking` | Coordinate scale, destination search/create, cooldown, safe placement. |
| 179 | `179-nether-content-baseline` | Core Nether blocks/resources/mobs required for progression. |
| 180 | `180-end-dimension-type` | End bounds/skylight/ambient/save rules. |
| 181 | `181-end-world-generation` | Main island/outer island baseline. |
| 182 | `182-end-portal-progression` | Portal activation/teleport and return gateway behavior baseline. |
| 183 | `183-ender-dragon-boss` | Dragon boss lifecycle, crystals, damage phases, victory state. |
| 184 | `184-end-exit-progression` | Exit portal, boss completion persistence, post-boss state. |
| 185 | `185-advancement-framework` | Criteria/triggers/progress/rewards persistence. |
| 186 | `186-core-progression-advancements` | Advancement chain covering survival-to-End progression. |
| 187 | `187-statistics-framework` | Typed counters, persistence, event hooks and UI data. |
| 188 | `188-world-difficulty` | Peaceful/easy/normal/hard knobs applied to spawn/damage/survival. |
| 189 | `189-gamerule-framework` | Typed persisted gamerules queried by simulation. |
| 190 | `190-command-parser` | Headless-safe command syntax, permission context, typed arguments. |
| 191 | `191-core-commands` | Time/weather/gamemode/give/teleport-like original commands for testing/admin. |
| 192 | `192-creative-mode` | Flight, instant break, creative inventory, no survival depletion. |
| 193 | `193-hardcore-mode` | Hard difficulty lock and death-world semantics. |
| 194 | `194-adventure-mode` | Restricted breaking/placing using item components/tags. |
| 195 | `195-spectator-mode` | Noclip flight, no interaction, spectator camera semantics. |

## Environment, UX, and accessibility

| # | Change | Narrow outcome |
|---|---|---|
| 196 | `196-weather-state` | Persisted rain/thunder timers and gamerule/time integration. |
| 197 | `197-weather-rendering` | Original rain/thunder visuals/audio without changing simulation truth. |
| 198 | `198-sleep-and-time-skip` | Bed interaction, spawn point, occupancy, night skipping rules. |
| 199 | `199-particle-system` | Pooled data-driven particles and gameplay event hooks. |
| 200 | `200-sound-event-system` | Registry-driven positional/original sound events and categories. |
| 201 | `201-ambient-audio` | Original biome/environment ambience and music scheduling. |
| 202 | `202-inventory-screen-parity` | Drag/click/shift-click/hotbar swap/stack splitting semantics. |
| 203 | `203-container-screen-framework` | Reusable menu UI bound to transactional container state. |
| 204 | `204-recipe-book` | Known recipes, filtering/search, recipe placement helper. |
| 205 | `205-hud-parity` | Hearts, hunger, armor, air, XP, status effects, selected item and boss bars. |
| 206 | `206-settings-persistence` | Graphics/audio/control/gameplay settings stored independently of worlds. |
| 207 | `207-keybinding-remap` | Conflict-aware remappable controls with persistence. |
| 208 | `208-accessibility-options` | UI scale, subtitles, reduced motion/screen effects, sensitivity and visibility options. |
| 209 | `209-gamepad-controls` | Gamepad movement/look/actions/UI navigation. |
| 210 | `210-touch-controls` | Mobile touch HUD, look/movement, inventory interaction and responsive layout. |

## Resource/data packs and content breadth

| # | Change | Narrow outcome |
|---|---|---|
| 211 | `211-internal-resource-pack-format` | Original assets organized by namespaced textures/models/sounds/metadata. |
| 212 | `212-internal-data-pack-format` | Namespaced recipes/loot/tags/worldgen/advancements loaded through registries. |
| 213 | `213-resource-reload` | Validate and atomically reload data/resources in development without corrupting runtime state. |
| 214 | `214-localization-framework` | Translation keys, fallback locale, formatted parameters. |
| 215 | `215-block-item-content-expansion` | Expand block/item catalog through data-driven definitions, not new architecture. |
| 216 | `216-biome-content-expansion` | Expand biome catalog and feature combinations through the biome/worldgen registries. |
| 217 | `217-structure-content-expansion` | Add progression-relevant structures via templates/placement rules. |
| 218 | `218-mob-content-expansion` | Add additional passive/hostile/utility mobs through existing entity/AI primitives. |
| 219 | `219-enchantment-potion-content-expansion` | Fill enchantment/effect/potion catalogs through existing registries. |
| 220 | `220-recipe-loot-content-expansion` | Fill crafting/processing/loot coverage for the expanded content catalog. |
| 221 | `221-current-release-delta` | Isolated current-Minecraft-release behavior/content delta without destabilizing baseline architecture. |

## Multiplayer

| # | Change | Narrow outcome |
|---|---|---|
| 222 | `222-shared-simulation-package-boundary` | Extract deterministic simulation code so browser client and server can share it. |
| 223 | `223-network-protocol-codecs` | Versioned message IDs/codecs/validation and protocol compatibility rules. |
| 224 | `224-dedicated-server-tick-loop` | Headless authoritative world tick process. |
| 225 | `225-connection-lifecycle` | Connect/handshake/login-like local profile/disconnect/keepalive state machine. |
| 226 | `226-server-chunk-streaming` | Interest-managed chunk/section snapshots and updates. |
| 227 | `227-server-player-movement` | Server-authoritative movement validation and teleport correction. |
| 228 | `228-client-prediction-reconciliation` | Local prediction with authoritative correction/interpolation. |
| 229 | `229-entity-replication` | Spawn/despawn/tracked-data/transform replication. |
| 230 | `230-block-interaction-networking` | Authoritative break/place/use request validation and broadcast. |
| 231 | `231-inventory-network-transactions` | Revisioned container/inventory actions with rejection/resync. |
| 232 | `232-combat-networking` | Authoritative attacks/projectiles/damage/knockback. |
| 233 | `233-chat-and-command-networking` | Server-routed chat and command execution context. |
| 234 | `234-server-world-persistence` | Server-owned save lifecycle using shared persistent codecs. |
| 235 | `235-reconnect-state-recovery` | Clean disconnect/reconnect and client state resynchronization. |
| 236 | `236-multiplayer-load-tests` | Multi-client tick/chunk/entity/inventory performance and correctness fixtures. |
| 237 | `237-network-adversarial-validation` | Malformed/duplicate/out-of-order/rate-abusive message handling and integrity tests. |

## Final hardening and parity verification

| # | Change | Narrow outcome |
|---|---|---|
| 238 | `238-worker-and-main-thread-stress` | Saturate generation/meshing/light/save/path workers and enforce frame/tick budgets. |
| 239 | `239-long-session-memory-stress` | Extended exploration/build/simulation memory and GPU resource leak validation. |
| 240 | `240-save-recovery-stress` | Abrupt close, partial write, migration, quota and import/export recovery matrix. |
| 241 | `241-deterministic-replay-suite` | Recorded input/tick seeds reproduce authoritative state hashes. |
| 242 | `242-survival-progression-e2e` | Fresh world through tools, food, shelter, Nether, End and boss completion headlessly. |
| 243 | `243-redstone-automation-e2e` | Representative automation circuits and timing survive save/reload/chunk cycling. |
| 244 | `244-worldgen-regression-matrix` | Seed/coordinate/biome/structure/ore/cave golden matrix across supported versions. |
| 245 | `245-visual-regression-matrix` | Render/HUD/inventory/environment screenshots across quality settings and resolutions. |
| 246 | `246-input-accessibility-matrix` | Keyboard/mouse/gamepad/touch/accessibility interactions and focus-loss recovery. |
| 247 | `247-performance-release-gate` | Release hardware tiers meet frame/tick/load/save/network budgets. |
| 248 | `248-parity-matrix-reconciliation` | Every planned feature categorized exact/equivalent/approx/deferred/out-of-scope with evidence. |
| 249 | `249-whole-codebase-adversarial-audit` | Security, correctness, reliability, data-loss, concurrency, performance and architecture audit. |
| 250 | `250-final-program-verification` | All mandatory changes verified, complete evidence archive, final release-readiness decision. |

---

## Why the order is strict

The sequence intentionally front-loads architecture. Examples:

- Hundreds of blocks cannot be safely added before registries, tags, block states, item components, and data loading exist.
- Modern-height terrain cannot be added before section/column storage and vertical world access exist.
- Redstone cannot be trustworthy before scheduled ticks, neighbor updates, block states, block entities, and deterministic simulation exist.
- Mobs cannot scale before entity persistence, tracking, navigation, AI goals, spawn rules, loot and fixed ticks exist.
- Multiplayer cannot be correct before the simulation is deterministic, serializable, and separated from presentation.

Do not bypass these dependencies for visible feature count.

---

## Post-terminal epoch (explicitly authorized work)

The numbered program 001–250 is COMPLETE and VERIFIED. That history is never rewritten. New
numbered changes may be authorized only by an explicit product/owner decision (as with the
2026-08-23 authorization of Change 251) and follow the same lifecycle, ordering, and gate
rules as the original sequence:

| # | Change | Narrow outcome |
|---|---|---|
| 251 | `251-live-furnace-production-integration` | Wire the verified furnace/block-entity/recipe/fuel/container/persistence infrastructure into the playable Game: place, open, operate, persist, unload/reload, and break a furnace without duplication, loss, or headless-only shortcuts. |
| 252 | `252-wither-secondary-boss` | Close MP-19.4-1: player-driven Wither-like secondary boss end-to-end — summon structure detection/consumption, invulnerable charge with exactly-once spawn explosion via the Explosion Core, three-head targeting, normal/blue skull projectiles over the projectile core, difficulty-scaled wither status effect, armored-phase projectile immunity, exactly-once Nether-Star reward through the loot pipeline, versioned persistence, live block-placement/Game integration, and full regression/gate coverage. |
| 254 | `254-whole-codebase-performance-optimization` | Owner-authorized (2026-08-26) behavior-preserving hot-path optimization campaign: allocation-free voxel access with revision-guarded chunk memo, numeric-cached light storage, fixed-arity random-tick hashing with golden equivalence, registry-derived eligibility table, single-lookup collision adapter, change-detected HUD writes, and a durable vitest bench suite — no functional/API/storage changes. |
