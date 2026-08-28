# Minecraft-Parity Master Plan

## Purpose

This document is the long-range engineering plan for evolving `clone-MC_v3` from its current polished browser voxel-survival game into a much deeper, Minecraft-like sandbox whose mechanics, systemic depth, world simulation, progression, content breadth, and user experience are as close as practical to modern Minecraft while remaining an original implementation.

This is **not** a plan to copy Mojang/Microsoft source code, proprietary textures, sounds, music, branding, or other protected game assets. The target is behavioral and systems parity using original code, original/procedural assets, and independently authored data.

The project should treat **Minecraft: Java Edition 26.2 / the 2026 modern Java gameplay baseline** as the stable parity reference, while treating later 26.3+ game-drop content as a rolling optional compatibility layer. New Minecraft releases should not destabilize the core architecture; they should enter through registries, data files, feature modules, and tracked parity deltas.

---

# 1. Executive Summary

The repository already has a strong prototype foundation:

- Three.js + TypeScript + Vite browser runtime.
- Seeded deterministic terrain.
- 16×64×16 chunk storage.
- Horizontal chunk streaming with bounded generation/meshing budgets.
- Face-culled chunk meshing.
- DDA voxel targeting.
- First-person movement, sprinting, jumping, swimming, step-up, collision, fall damage, drowning, and lava damage.
- Break/place interactions with hardness-based mining.
- 9-slot hotbar + 27-slot storage inventory.
- Stack counts and durable tools.
- Nine recipes.
- Health, hunger, saturation, regeneration, death/respawn.
- Ores, caves, lava pockets, four simple climate biomes, trees, water, sand/gravel falling.
- Passive ambient critters.
- Day/night cycle, clouds, shadows, fog, procedural textures, procedural audio.
- localStorage persistence for sparse block edits and player state.
- Strict TypeScript, ESLint, Vitest, Playwright, CI, and OpenSpec-based development.

The repository is therefore **not starting from zero**. However, the current architecture is sized for a compact single-player voxel game, not Minecraft-scale simulation.

The major architectural blockers are:

1. The world is a single vertical slab (`cy === 0`, Y 0–63).
2. Blocks, tools, drops, and items share one small numeric registry.
3. Block state is only a block ID; there is no generalized block-state/property model.
4. Persistence is sparse localStorage, not section/chunk/region persistence.
5. Lighting is scene lighting, not voxel sky light + block light.
6. Fluids are blocks, not level-based flowing simulations.
7. Simulation lacks scheduled ticks, random ticks, neighbor updates, block entities, and event propagation.
8. Meshing only handles full cubes and two coarse render categories.
9. World generation is a small set of hand-coded noise rules, not a composable biome/feature/structure pipeline.
10. The item/crafting model cannot represent modern recipes, components, containers, equipment, enchantments, brewing, smithing, food effects, projectiles, or data-rich item stacks.
11. There is no generalized entity framework, navigation, spawning rules, combat AI, villager AI, bosses, or persistence.
12. There is no redstone graph/signal simulation.
13. There are no Nether/End dimensions, portals, structures, advancement progression, XP, enchantment, brewing, trading, or boss progression.
14. There is no multiplayer authority model.

**The correct strategy is architecture-first parity.** Do not add hundreds of blocks and mobs into the current flat model. First build the engine primitives that make those features data-driven and composable, then layer content on top.

---

# 2. Product Target and Parity Policy

## 2.1 Primary target

Target a browser-native, desktop-first, Java-like Minecraft experience with:

- Survival mode as the canonical ruleset.
- Creative mode as a first-class second mode.
- Java-style movement, inventory, combat cadence, redstone semantics, progression, and world behavior wherever practical.
- Browser-platform substitutions only where unavoidable.
- Original visual/audio assets.

## 2.2 Secondary targets

After the core Java-like experience is stable:

- Hardcore mode.
- Adventure mode.
- Spectator mode.
- LAN/internet multiplayer through a dedicated authoritative TypeScript server.
- Mobile/touch and gamepad support.
- Bedrock-inspired quality-of-life options where they do not compromise deterministic Java-like rules.

## 2.3 Parity categories

Every Minecraft feature should be tracked as one of:

- **Exact-behavior target** — core rules should intentionally match.
- **Equivalent-behavior target** — same gameplay role, implementation may differ.
- **Approximation** — browser/rendering constraint prevents exact behavior.
- **Deferred** — planned but intentionally not in the current milestone.
- **Out of scope** — proprietary/service-dependent features such as official Realms infrastructure.

Maintain a `PARITY_MATRIX.md` later with feature, reference behavior, local implementation, tests, known differences, and status.

---

# 3. Existing Systems to Preserve

The following current work is valuable and should be evolved rather than discarded:

- Deterministic seeded generation discipline.
- `WorldCoordinates` negative-coordinate correctness.
- Chunk streaming with bounded work budgets.
- DDA voxel ray traversal.
- AABB collision and collision sub-stepping.
- Resource disposal discipline.
- WebGL context-loss handling.
- Input focus/pointer-lock hardening.
- GPU quality tiers/headless E2E accommodations.
- Test-gated production builds.
- Strict TypeScript.
- OpenSpec change artifacts.
- Unit + Playwright verification.
- Procedural/original asset philosophy.
- Save validation/versioning philosophy.

These are good foundations.

---

# 4. Systems That Must Be Replaced or Generalized

## 4.1 Fixed 64-block world slab

Current:

- One vertical chunk layer.
- Y 0–63.
- Horizontal streaming only.

Target:

- Modern Overworld vertical range equivalent to Y -64 through 319.
- 16×16×16 **sections** grouped into columns.
- Dimension-specific minY/maxY.
- Section-level allocation only when non-empty.
- Vertical neighbor meshing and lighting.
- Heightmaps per chunk column.

Recommended structures:

```ts
interface DimensionType {
  id: ResourceId;
  minY: number;
  height: number;
  logicalHeight: number;
  ambientLight: number;
  hasSkylight: boolean;
  hasCeiling: boolean;
}

interface ChunkColumn {
  cx: number;
  cz: number;
  sections: Map<number, ChunkSection>;
  heightmaps: HeightmapSet;
  blockEntities: Map<number, BlockEntityData>;
  entities: Set<EntityId>;
  status: ChunkStatus;
}

interface ChunkSection {
  sy: number;
  blocks: PalettedContainer<BlockStateId>;
  skyLight?: NibbleArray;
  blockLight: NibbleArray;
  biomes: PalettedContainer<BiomeId>;
  dirty: SectionDirtyFlags;
}
```

## 4.2 Flat `BlockId` enum

Current registry mixes block IDs, tools, drops, and inventory items.

Target separate registries:

- Block types.
- Block states.
- Items.
- Entity types.
- Block entity types.
- Fluids.
- Biomes.
- Features.
- Structures.
- Recipes.
- Loot tables.
- Tags.
- Sounds.
- Particles.
- Status effects.
- Enchantments.
- Attributes.
- Damage types.
- Dimensions.

Use namespaced string IDs at data boundaries and compact runtime numeric IDs internally.

Example:

```ts
type ResourceId = `${string}:${string}`;

type BlockStateId = number;
type ItemTypeId = number;

type PropertyValue = string | number | boolean;

interface BlockTypeDefinition {
  id: ResourceId;
  properties: BlockPropertySchema;
  defaultState: Record<string, PropertyValue>;
  behavior: BlockBehaviorId;
  collisionShape: VoxelShapeId;
  occlusionShape: VoxelShapeId;
  renderModel: ModelId;
  hardness: number;
  blastResistance: number;
  luminance: number;
  friction: number;
  replaceable: boolean;
  randomTicks: boolean;
  tags: ResourceId[];
}
```

Do not hard-code future block logic into giant `switch` statements.

## 4.3 Save model

Current sparse localStorage save is good for the prototype but cannot support a real survival world.

Target:

- IndexedDB-backed worlds.
- Separate metadata, player, chunk-column, entity, map/stat/advancement stores.
- Versioned schemas and migrations.
- Dirty-section incremental saves.
- Bounded save queue.
- Periodic autosave.
- Save-on-pagehide where possible.
- Crash-safe transactional writes.
- Export/import world archive.
- Optional compression in workers.

Do not serialize the entire world on every save.

---

# 5. Target Technical Architecture

## 5.1 Keep the existing stack initially

Retain:

- TypeScript.
- Three.js.
- Vite.
- Vitest.
- Playwright.
- ESLint.

Add only where the architecture benefits materially:

- Web Workers for world generation, meshing, lighting, pathfinding, and compression.
- IndexedDB through a very thin typed repository layer.
- `ws` or equivalent for dedicated-server WebSocket transport when multiplayer begins.
- Property-based testing (`fast-check`) when generation/state-space complexity grows.

Avoid replacing Three.js just to chase parity. Rendering engine migration is not the primary constraint. The simulation/data architecture is.

## 5.2 Runtime layering

Target dependency direction:

```text
UI / Screens
    ↓
Client Application / Input / Camera
    ↓
Gameplay Commands
    ↓
Simulation Core
    ├── World
    ├── Block/Fluid simulation
    ├── Entities
    ├── Inventory/Items
    ├── Combat
    ├── Redstone
    ├── Progression
    └── Dimension rules
    ↓
Data Registries + Save State

Rendering observes simulation state; it does not own gameplay truth.
Networking serializes commands/snapshots; it does not define gameplay rules.
```

## 5.3 Fixed simulation tick

Minecraft-like simulation needs a deterministic fixed tick independent of render FPS.

Introduce:

- 20 TPS canonical simulation tick.
- Render interpolation.
- Maximum catch-up tick budget.
- Pause semantics for single-player.
- Server tick clock for multiplayer.
- Scheduled block ticks.
- Random block ticks.
- Entity AI tick tiers.
- Chunk ticket/ticking rules.

The current variable-delta frame update should become presentation/control plumbing, not the authority for world simulation.

---

# 6. Core Data Architecture

## 6.1 Item stacks

Replace `{ id, count, durability? }`-style assumptions with extensible stacks.

```ts
interface ItemStack {
  item: ItemTypeId;
  count: number;
  components: ItemComponentMap;
}
```

Components should support, at minimum:

- Damage/durability.
- Custom name.
- Lore.
- Enchantments.
- Repair cost.
- Food properties/effects.
- Attribute modifiers.
- Potion contents.
- Container contents.
- Map data reference.
- Written book data.
- Firework data.
- Trim/equipment metadata.
- Block entity data when relevant.

## 6.2 Tags

Tags are critical for scaling recipes and behavior.

Examples:

- `logs`
- `planks`
- `mineable/pickaxe`
- `needs_iron_tool`
- `wool`
- `ores`
- `replaceable`
- `fluid_flow_blocking`
- `climbable`
- `leaves`
- `valid_spawn`

Gameplay logic should ask tags, not enumerate every block manually.

## 6.3 Block states

Required examples:

- Facing.
- Axis.
- Waterlogged.
- Open.
- Powered.
- Lit.
- Age.
- Moisture.
- Layers.
- Half.
- Shape.
- Hinge.
- Occupied.
- Distance.
- Persistent.
- Signal strength.

Encode runtime states compactly with registry-generated IDs.

## 6.4 Voxel shapes

Full cubes are insufficient.

Implement composable voxel shapes used by:

- Collision.
- Selection.
- Raycast.
- Occlusion.
- Pathfinding.

Needed shapes include slabs, stairs, fences, walls, panes, doors, trapdoors, ladders, plants, torches, rails, beds, chests, anvils, cauldrons, pointed blocks, and partial decorative blocks.

---

# 7. World Storage and Streaming

## 7.1 Chunk-column lifecycle

Use chunk statuses such as:

1. Empty.
2. Biomes.
3. Noise/base terrain.
4. Surface.
5. Carvers/caves.
6. Features.
7. Structures.
8. Lighting.
9. Full/ticking.

A section may render before the entire far-away column is simulation-active.

## 7.2 Tickets

Introduce chunk tickets/reasons:

- Player render.
- Player simulation.
- Portal.
- Forced/spawn.
- Entity dependency.
- Structure generation dependency.
- Temporary operation.

Rendering distance and simulation distance should be distinct.

## 7.3 Worker pipeline

Move heavy work off the main thread:

- Terrain density generation.
- Feature placement.
- Structure assembly.
- Greedy meshing.
- Light propagation batches.
- Save compression.

Workers operate on immutable job snapshots and return versioned results. Main thread rejects stale results using generation/version IDs.

## 7.4 Persistence granularity

Persist:

- Generated section block states.
- Block entities.
- Scheduled ticks.
- Entities that require persistence.
- Heightmaps.
- Biomes.
- Structure references.
- Light arrays if beneficial, otherwise recalculate.
- Data version.

Never depend on regeneration alone after simulation begins because fluids, redstone, crops, explosions, mob griefing, fire, pistons, and structures mutate the base world.

---

# 8. Rendering Roadmap

## 8.1 Meshing

Upgrade from per-face culling to:

- Greedy meshing for compatible opaque cubes.
- Separate passes for opaque, cutout, translucent, animated, emissive.
- Geometry templates for non-full-cube block models.
- Per-vertex light.
- Ambient occlusion.
- Biome tint attributes.
- Animated texture metadata.

## 8.2 Texture/resource system

Keep all assets original.

Build a resource-pack-like internal format:

```text
assets/
  game/
    textures/
    models/
    blockstates/
    sounds/
    particles/
    lang/
```

Allow reloadable resource packs later.

## 8.3 Block model system

Support:

- Cube-all.
- Cube-column.
- Cross/plant.
- Slab.
- Stair.
- Fence/wall/pane connections.
- Door/trapdoor.
- Torch.
- Rail.
- Fluid surface.
- Custom JSON model composition.

## 8.4 Lighting

Scene directional light is not sufficient for parity.

Implement voxel lighting:

- Skylight 0–15.
- Block light 0–15.
- Emission per block state.
- Flood-fill/incremental propagation.
- Removal propagation.
- Cross-section propagation.
- Chunk-border pending light updates.
- Vertex sampling for faces.
- Day/night modifies sky contribution rather than replacing voxel lighting.

## 8.5 Weather and atmosphere

Add:

- Rain.
- Thunder.
- Snow precipitation by biome/temperature.
- Lightning.
- Fog differences by medium/biome/dimension.
- Underwater rendering.
- Lava overlay.
- Portal overlay.
- Particles.
- Clouds/weather blending.

---

# 9. World Generation Roadmap

The current four-biome height-noise model should become a composable pipeline.

## 9.1 Climate sampler

Build fields for:

- Temperature.
- Humidity.
- Continentalness.
- Erosion.
- Weirdness/peaks-valleys.
- Depth/cave parameters.

Map climate points to biome definitions.

## 9.2 Terrain density

Implement 3D density-based terrain capable of:

- Oceans.
- Plains.
- Hills.
- Mountain chains.
- Valleys.
- Plateaus.
- Overhangs.
- Large cave networks.
- Noise caves.
- Cheese/spaghetti-like cave classes.
- Ravines/carvers.
- Aquifers.

## 9.3 Surface rules

Data-driven material rules for:

- Grass/dirt.
- Sand/sandstone.
- Snow/ice.
- Stone variants.
- Badlands layers.
- Mud/clay/gravel.
- Nether materials.
- End materials.

## 9.4 Biomes

Build the registry and generation system first, then add content in families:

- Plains/forest/birch/dark forest/flower forest.
- Taiga/snowy taiga/old growth variants.
- Desert/savanna/badlands.
- Jungle/bamboo jungle.
- Swamp/mangrove.
- Mountains/meadow/grove/snowy slopes/peaks.
- Beaches/rivers/oceans and ocean temperature variants.
- Mushroom fields.
- Cherry grove.
- Pale garden-like specialized biome.
- Modern 2026 biome additions such as Dappled Forest only after the baseline pipeline is stable.

## 9.5 Ores

Replace threshold noise with configured ore features:

- Vein size/count.
- Y distribution.
- Air-exposure modifiers.
- Stone/deepslate targets.
- Coal, iron, copper, gold, redstone, lapis, diamond, emerald.
- Nether quartz/gold/ancient debris.

## 9.6 Features

Data-driven placed features:

- Trees by species.
- Flowers/grass/ferns.
- Mushrooms.
- Patches.
- Springs.
- Lakes.
- Ice spikes.
- Dripstone.
- Geodes.
- Sculk-like growth where later implemented.
- Fallen trees/camps/current-drop features.

## 9.7 Structures

Build a reusable jigsaw/template placement engine before breadth.

Then add progressively:

- Villages.
- Mineshafts.
- Dungeons.
- Strongholds.
- Desert pyramids.
- Jungle temples.
- Swamp huts.
- Ocean monuments.
- Shipwrecks.
- Ocean ruins.
- Pillager outposts.
- Ruined portals.
- Woodland mansions.
- Ancient cities.
- Trail ruins.
- Trial chambers.
- Nether fortresses.
- Bastions.
- End cities.
- 2026 structures such as abandoned camps after the generalized structure system is proven.

---

# 10. Block Simulation Engine

This is a foundational milestone, not polish.

## 10.1 Neighbor updates

Every block mutation should be able to trigger:

- Neighbor shape update.
- Neighbor signal update.
- Scheduled tick creation/removal.
- Block entity notification.
- Comparator-like output notification.
- Fluid update.
- Lighting update.
- Mesh invalidation.

Keep this bounded and queue-driven; never recurse indefinitely on the JavaScript call stack.

## 10.2 Scheduled ticks

Priority queue keyed by game tick for:

- Fluids.
- Redstone repeaters/comparators.
- Falling blocks.
- Fire.
- Delayed block transitions.
- Crop/environment behaviors where appropriate.

Persist scheduled ticks in saved chunks.

## 10.3 Random ticks

Dimension/chunk random ticking for:

- Crop growth.
- Grass/mycelium spread.
- Leaf decay.
- Sapling growth.
- Fire behavior.
- Snow/ice changes.
- Copper/weathering-like progression.
- Plant growth.

## 10.4 Block entities

Implement a lifecycle and serialization layer for:

- Chests/barrels.
- Furnaces/smokers/blast furnaces.
- Brewing stands.
- Hoppers.
- Dispensers/droppers.
- Signs.
- Beds where stateful behavior needs it.
- Spawners.
- Beacons.
- Enchanting tables.
- Lecterns.
- Jukeboxes.
- Shulker boxes.
- Decorated pots.
- Trial/spawner-like later systems.

---

# 11. Fluid Simulation

Replace static water/lava blocks with fluid states.

Required mechanics:

- Source blocks.
- Flow levels.
- Horizontal spread.
- Falling fluid.
- Water/lava different tick rates.
- Infinite water source rule.
- Waterlogging.
- Fluid displacement/breaking of replaceable blocks.
- Bucket pickup/place.
- Lava-water reactions.
- Entity buoyancy and flow forces.
- Bubble columns.
- Fluid rendering heights and corner interpolation.

Keep fluid simulation scheduled and local rather than scanning whole chunks.

---

# 12. Player Controller and Movement Parity

Extend the current controller to support:

- Walking.
- Sprinting.
- Sprint-jumping.
- Sneaking with ledge prevention.
- Crawling.
- Swimming posture.
- Diving.
- Climbing ladders/vines/scaffolding.
- Soul-sand/slowness surfaces.
- Ice sliding.
- Honey/slime interactions.
- Cobweb slowdown.
- Powder-snow behavior.
- Knockback.
- Status-effect movement modifiers.
- Riding entities.
- Boats/minecarts.
- Elytra-like gliding later.
- Spectator flight.
- Creative flight.

Movement constants should be represented as attributes/effects, not a growing pile of special cases in `PlayerController`.

---

# 13. Inventory, Containers, and Crafting

## 13.1 Inventory UI

Implement Minecraft-like slot interaction primitives:

- Left-click pickup/place/merge/swap.
- Right-click half/piece placement.
- Shift-click quick move.
- Number-key hotbar swap.
- Double-click collect.
- Drag distribution.
- Creative middle-click clone.
- Drop one/drop stack.

## 13.2 Crafting

Replace the nine-button recipe model with actual grids:

- 2×2 player crafting.
- 3×3 crafting table.
- Shaped recipes.
- Shapeless recipes.
- Tags in ingredients.
- Remaining items.
- Recipe unlock/book.
- Craft-all/shift output.

## 13.3 Processing

Add:

- Furnace.
- Smoker.
- Blast furnace.
- Campfire cooking.
- Stonecutting.
- Smithing.
- Brewing.
- Anvil repair/rename/enchant combination.
- Grindstone.
- Loom.
- Cartography table.

## 13.4 Containers

Add generic container protocol and UIs for:

- Single/double chest.
- Barrel.
- Hopper.
- Furnace families.
- Dispenser/dropper.
- Shulker box.
- Brewing stand.
- Villager trading.

---

# 14. Items, Tools, Equipment, and Durability

Implement data-driven tiers and behavior:

- Wood, stone, iron, gold, diamond, netherite tool tiers.
- Pickaxe, axe, shovel, hoe, sword.
- Correct mining tiers.
- Mining-speed multipliers.
- Tool durability and Unbreaking/Mending-like interactions.
- Armor slots.
- Armor toughness.
- Knockback resistance.
- Shields.
- Bows/crossbows.
- Tridents and later spear-like/current-drop weapons if parity target expands.
- Fishing rods.
- Flint and steel.
- Shears.
- Buckets.
- Leads.
- Compass/clock/maps.
- Totem-like death prevention.
- Elytra-like equipment.

Use item components and behavior modules rather than item-ID conditionals.

---

# 15. Combat, Damage, Status Effects, and XP

## 15.1 Damage system

Introduce typed damage context:

```ts
interface DamageSource {
  type: DamageTypeId;
  directEntity?: EntityId;
  causingEntity?: EntityId;
  position?: Vec3;
}
```

Support:

- Melee.
- Projectile.
- Fall.
- Fire/burning.
- Lava.
- Drowning.
- Suffocation.
- Explosion.
- Magic/effects.
- Void.
- Thorns/reflection-like sources.

## 15.2 Java-like combat

Add:

- Attack cooldown.
- Weapon attack speed/damage.
- Critical hits.
- Sprint knockback.
- Sweeping if intentionally targeted.
- Shields/blocking.
- Armor calculation.
- Invulnerability frames.
- Knockback resistance.
- Projectile collision.

## 15.3 Status effects

Registry-driven effects:

- Speed/slowness.
- Haste/mining fatigue.
- Strength/weakness.
- Regeneration/poison/wither.
- Resistance/fire resistance.
- Water breathing.
- Night vision/blindness/darkness-like effects.
- Hunger/saturation.
- Jump boost/slow falling.
- Invisibility/glowing.

## 15.4 XP and enchanting

Add:

- XP orbs.
- Levels.
- Enchanting table.
- Bookshelves/power.
- Enchantment costs.
- Anvil combination.
- Mending-like repair.
- Enchantment registry and compatibility rules.

---

# 16. Entity Framework

The current passive `WorldLife` ambience should be replaced by a real entity simulation layer while preserving its useful rendering ideas where applicable.

## 16.1 Entity core

Every entity needs:

- Stable UUID-like identity.
- Runtime numeric entity ID.
- Entity type registry.
- Transform.
- Velocity.
- Bounding box.
- Pose.
- Attributes.
- Status effects.
- Synced data fields.
- Save/load behavior.
- Tick behavior.
- Damage/death.
- Passenger/vehicle relation.

## 16.2 Components/capabilities

Use composition for:

- Living.
- Mob AI.
- Inventory.
- Tameable.
- Ageable.
- Breedable.
- Rideable.
- Projectile.
- Item entity.
- Experience orb.
- Explosive.
- Hanging/decorative.

Do not create a giant inheritance hierarchy with hundreds of fragile subclasses.

## 16.3 Navigation

Implement:

- Walk-node pathfinding.
- Swim navigation.
- Flying navigation later.
- Door/fence awareness.
- Hazard costs.
- Path recomputation throttling.
- Chunk-aware cancellation.

Run expensive pathfinding in workers if needed.

## 16.4 Spawning/despawning

Add category-based spawn manager:

- Monster.
- Creature.
- Ambient.
- Water creature.
- Water ambient.

Rules include:

- Biome spawn tables.
- Light level.
- Surface/block validity.
- Distance from player.
- Mob caps.
- Persistence flags.
- Despawn ranges.

---

# 17. Mob Roadmap

Do mobs in behavior families rather than arbitrary one-offs.

## 17.1 Passive starter family

- Pig.
- Cow.
- Sheep.
- Chicken.
- Rabbit.

Shared:

- Wander.
- Panic.
- Temptation.
- Breeding.
- Baby growth.
- Drops.
- Basic variants.

## 17.2 Hostile starter family

- Zombie.
- Skeleton.
- Creeper.
- Spider.

Shared:

- Target acquisition.
- Navigation.
- Daylight/environment rules.
- Melee/projectile/explosion behavior.
- Drops.

## 17.3 Expanded Overworld

- Enderman.
- Witch.
- Slime.
- Drowned.
- Husk.
- Stray.
- Phantom.
- Pillagers/illagers.
- Guardians.
- Warden-like specialized AI later.

## 17.4 Utility/tameable

- Wolf.
- Cat.
- Horse/donkey/mule.
- Llama.
- Parrot.
- Allay-like helper behavior later.

## 17.5 Villagers

Dedicated subsystem:

- Villages/points of interest.
- Professions.
- Workstations.
- Beds.
- Schedules.
- Gossip/reputation.
- Trading offers.
- Restocking.
- Breeding.
- Iron-golem spawning.
- Zombie-villager conversion/cure later.

## 17.6 Nether/End mobs

Add alongside those dimensions, not before:

- Piglin/hoglin-like systems.
- Ghast.
- Blaze.
- Magma cube.
- Wither skeleton.
- Endermen/endermites/shulkers.
- Bosses.

## 17.7 Current-drop mobs

2026-specific mobs/features such as sulfur-cube systems and later baby-mob refinements should be treated as content-pack work after the entity engine is mature.

---

# 18. Redstone and Automation

Redstone is one of the largest parity projects and needs explicit architecture.

## 18.1 Signal model

Implement block-side signal queries:

- Weak power.
- Strong power.
- Direct/indirect power.
- Signal strength 0–15.
- Directional connectivity.

## 18.2 Foundational components

Order:

1. Lever/button/pressure plate.
2. Redstone torch.
3. Redstone dust connectivity.
4. Repeater.
5. Comparator.
6. Target/input-like sources.
7. Observer.
8. Lamp/door/trapdoor/piston consumers.

## 18.3 Pistons

Need dedicated move planner:

- Push limit.
- Sticky behavior.
- Immovable/destroyed reactions.
- Slime/honey grouping.
- Block entity restrictions.
- Atomic multi-block state transitions.
- Entity movement/collision during extension.

## 18.4 Automation blocks

Then add:

- Hopper.
- Dispenser.
- Dropper.
- Crafter-like automation if current parity target includes it.
- Minecart hoppers/chests.
- Detector/activator/powered rails.

## 18.5 Correctness strategy

Redstone requires scenario regression fixtures, not only unit tests.

Create deterministic test worlds covering:

- Dust attenuation.
- Quasi/Java-specific edge behavior only if explicitly targeted.
- Repeater timing.
- Comparator containers.
- Observer pulses.
- Piston update ordering.
- Hopper transfer ordering.

Document intentional differences rather than silently diverging.

---

# 19. Dimensions and Progression

## 19.1 Overworld completion gate

Do not start dimensions until these are stable:

- Generalized sections.
- Lighting.
- Fluids.
- Block states.
- Entity framework.
- Inventories.
- Save engine.

## 19.2 Nether

Implement:

- Dimension type and sky/fog rules.
- Nether terrain density.
- Lava sea.
- Nether biomes.
- Nether ores.
- Fortresses.
- Bastions.
- Portals and coordinate scaling.
- Piglin/hoglin ecosystem.
- Blaze progression.

## 19.3 End

Implement:

- End dimension terrain.
- Obsidian platform.
- Central island.
- End crystals.
- Dragon fight.
- Exit portal.
- Outer islands.
- Gateways.
- End cities/ships.
- Shulkers.
- Elytra progression.

## 19.4 Wither-like secondary boss

After combat and summon-pattern/block-destruction systems are stable.

---

# 20. Game Modes

## Survival

Primary reference rules.

## Creative

- Infinite item palette.
- No survival damage.
- Flight.
- Instant block break.
- Pick block.
- Search tabs.

## Hardcore

- Survival rules.
- Locked hardest difficulty.
- Permanent death to spectator/terminal state according to chosen parity target.

## Adventure

- Restricted block interactions through item components/tags.

## Spectator

- No collision.
- Free flight.
- Entity spectating later.

---

# 21. Difficulty and Gamerules

Build a generic gamerule registry, then implement rules for:

- Daylight cycle.
- Weather cycle.
- Mob spawning.
- Mob griefing.
- Keep inventory.
- Fire tick.
- Random tick speed.
- Immediate respawn.
- Entity drops.
- Block drops.
- Natural regeneration.
- Drowning/fall/fire/freeze damage switches where desired.

Difficulty should affect:

- Hostile damage.
- Hunger behavior.
- Mob systems.
- Status durations.
- Spawn behavior where applicable.

---

# 22. UI/UX Parity

## 22.1 Screen framework

Create a modal/screen stack for:

- Title screen.
- World selection.
- Create world.
- Loading world.
- Pause.
- Options.
- Controls.
- Video.
- Audio.
- Language.
- Accessibility.
- Resource packs.
- Multiplayer browser later.
- Death screen.
- Advancements.
- Statistics.

## 22.2 HUD

Add:

- Hearts.
- Armor.
- Hunger.
- Air.
- XP bar/level.
- Mount health/jump.
- Boss bar.
- Status-effect icons.
- Item-name popups.
- Action bar.
- Chat.
- Subtitles.

## 22.3 Accessibility

Plan for:

- Rebindable controls.
- Toggle/hold sprint and sneak.
- UI scale.
- FOV.
- Sensitivity.
- Reduced motion options.
- High-contrast UI option.
- Subtitles.
- Color-safe indicators.
- Narration hooks where practical.

---

# 23. Audio and Particles

Replace simple procedural action sounds with an extensible sound-event engine while keeping assets original.

Support:

- Sound events and variants.
- Positional attenuation.
- Categories/volume sliders.
- Pitch variation.
- Ambient biome loops.
- Cave ambience.
- Weather.
- Entity sounds.
- Block break/place/step/hit groups.
- UI sounds.
- Music scheduler using original music only.

Particle engine:

- Block debris.
- Critical hits.
- Smoke/flame.
- Water/lava.
- Weather.
- Potion/effects.
- Explosion.
- Portal.
- Falling leaves/current-drop ambience.

Use object pools and hard caps.

---

# 24. Multiplayer Architecture

Multiplayer should not be bolted onto a client-authoritative single-player game.

## 24.1 Authority split

Refactor simulation core so it can execute headlessly.

Target:

```text
packages/core      deterministic gameplay/simulation
packages/client    Three.js rendering, UI, input
packages/server    authoritative simulation + networking
packages/protocol  packet schemas/versioning
packages/data      shared registries/content
```

This monorepo split can occur only when multiplayer work begins; do not prematurely restructure if earlier phases are still unstable.

## 24.2 Server authority

Server owns:

- World state.
- Entity state.
- Inventory.
- Damage.
- Block edits.
- Crafting.
- Redstone.
- Loot.
- Spawns.
- Save data.

Client sends intents/commands, not authoritative results.

## 24.3 Networking

Implement:

- Handshake/version.
- Login/profile.
- Keepalive.
- Chunk streaming.
- Entity spawn/despawn/movement.
- Player input.
- Block interaction.
- Inventory transactions.
- Chat.
- Time/weather.
- Sound/particle events.

Use binary packets eventually; JSON can be used only for the earliest protocol bring-up.

## 24.4 Client prediction

For good feel:

- Predict local movement.
- Server reconciliation.
- Interpolate remote entities.
- Never predict destructive inventory outcomes without transaction IDs.

---

# 25. Performance Targets

Do not wait until content is complete to optimize.

Track budgets for:

- Simulation tick time.
- Render frame time.
- Chunk generation latency.
- Meshing latency.
- Light propagation latency.
- Worker queue depth.
- Draw calls.
- Triangles.
- GPU memory estimate.
- JS heap.
- Loaded section count.
- Active entity count.
- Pathfinding work.
- Scheduled tick queue size.
- Save queue latency.

## Required optimization work

- Greedy meshing.
- Section-level rebuilds.
- Mesh pooling where helpful.
- Worker generation/meshing.
- Paletted block-state storage.
- Nibble lighting arrays.
- Heightmaps.
- Spatial entity index.
- Frustum culling.
- Distance/tick throttling for entities.
- Batched/instanced rendering for repeated entity/model parts where appropriate.
- Bounded particles.
- Avoid object allocation in voxel hot loops.

Performance should be tested on both hardware-accelerated desktop browsers and Playwright/headless software rendering with separate budgets.

---

# 26. Test Strategy

Every milestone must ship with tests.

## 26.1 Pure unit tests

For:

- Coordinates.
- Palettes.
- Block states.
- Registries.
- Recipes.
- Loot tables.
- Damage math.
- Enchantment rules.
- Tick scheduling.
- Redstone primitives.
- Fluid rules.
- Save migration.

## 26.2 Property-based tests

For:

- Coordinate round trips.
- Palette encoding/decoding.
- Save round trips.
- Deterministic generation.
- Inventory transaction conservation.
- Recipe matching invariants.
- Redstone boundedness.
- Fluid boundedness.

## 26.3 Golden deterministic world fixtures

For fixed seeds/coordinates, validate hashes of:

- Biomes.
- Heightmaps.
- Blocks.
- Structures.
- Ores.
- Features.

Intentional generation changes require fixture version updates and documented migration expectations.

## 26.4 Simulation scenarios

Headless scenario runner for:

- Crop growth.
- Leaf decay.
- Fluid spread.
- Lava/water interaction.
- Piston machines.
- Hopper chains.
- Mob combat.
- Villager jobs.
- Portal transfer.
- Boss phases.

## 26.5 Browser E2E

Playwright should verify real user journeys:

- Create world.
- Spawn safely.
- Gather wood.
- Craft table/tools.
- Mine ore.
- Smelt iron.
- Equip armor.
- Fight hostile mob.
- Build shelter.
- Sleep.
- Enter Nether.
- Return.
- Find stronghold/enter End in an accelerated fixture.
- Defeat boss in test-mode deterministic scenario.
- Save/reload world.

## 26.6 Visual regression

Add screenshot baselines for:

- Major block model classes.
- Biomes.
- Weather.
- Inventory/container screens.
- Lighting conditions.
- Fluids.
- Entities.

Keep visual tests tolerant to GPU raster differences where necessary.

---

# 27. Save Compatibility and Migrations

Never silently invalidate existing worlds.

Introduce:

```ts
interface WorldMeta {
  saveVersion: number;
  contentVersion: string;
  seed: number;
  createdAt: number;
  lastPlayedAt: number;
  gameMode: GameMode;
  difficulty: Difficulty;
}
```

Migration sequence from current saves:

1. Detect current localStorage snapshot.
2. Import block edits into sectioned chunk format.
3. Import player position/rotation/stats/inventory.
4. Map legacy numeric IDs to namespaced item/block states.
5. Mark migrated world with source version.
6. Keep original snapshot until migration succeeds.

Future migrations must be idempotent and tested.

---

# 28. OpenSpec and Repository Workflow

This repository is already spec-driven. Preserve that discipline.

Do **not** create one enormous implementation branch for the whole roadmap.

For each major capability, create a focused OpenSpec change with:

- `proposal.md`
- `design.md`
- `tasks.md`
- relevant capability specs
- `verification.md`

Recommended change sequence names:

1. `world-sections-and-persistence`
2. `data-driven-registries`
3. `fixed-tick-simulation`
4. `voxel-lighting`
5. `block-states-and-models`
6. `fluid-simulation`
7. `modern-world-generation`
8. `inventory-crafting-v2`
9. `entity-framework`
10. `combat-and-equipment`
11. `hostile-passive-mobs`
12. `redstone-foundation`
13. `containers-processing`
14. `villagers-and-structures`
15. `nether-dimension`
16. `end-and-boss-progression`
17. `creative-and-game-modes`
18. `multiplayer-core`
19. `current-drop-content`

Each change should be independently buildable, testable, reviewable, and resumable.

---

# 29. Phased Implementation Roadmap

## Phase 0 — Baseline freeze and parity tracking

Goal: make the current build a protected reference before invasive refactors.

Tasks:

- Capture current unit/E2E/build/lint results.
- Add representative gameplay screenshots.
- Add benchmark harness for chunk streaming/frame time.
- Document current save schema.
- Create `PARITY_MATRIX.md` with all existing systems.
- Add architectural decision records for tick rate, world height, registries, persistence, and asset policy.

Exit criteria:

- Current gameplay is reproducibly verified.
- No architecture refactor starts without regression coverage.

## Phase 1 — Data-driven registries

Goal: eliminate the 25-ID ceiling and separate block/item concerns.

Tasks:

- Resource IDs.
- Runtime registry IDs.
- Block type registry.
- Block-state registry.
- Item registry.
- Tags.
- Legacy ID migration.
- Registry validation.
- Replace direct `BlockId` gameplay assumptions incrementally.

Exit criteria:

- Existing game works using the new registry system.
- Legacy saves migrate.
- Adding a block/item requires data + behavior registration, not central enum surgery.

## Phase 2 — Vertical sections + IndexedDB world storage

Goal: support modern world height and durable simulation state.

Tasks:

- 16³ sections.
- Chunk columns.
- Dimension minY/maxY.
- Sparse section allocation.
- Paletted block storage.
- IndexedDB repositories.
- Dirty save queue.
- Autosave.
- Existing-save migration.

Exit criteria:

- World supports negative Y and modern vertical height.
- Exploration/edit persistence is not capped by localStorage design.

## Phase 3 — Fixed 20 TPS simulation core

Goal: decouple gameplay correctness from FPS.

Tasks:

- Fixed tick clock.
- Scheduled tick queue.
- Random tick engine.
- Neighbor update queue.
- Block event queue.
- Deterministic scenario runner.

Exit criteria:

- Block/fluid/entity simulation can be run headlessly for N ticks.

## Phase 4 — Block states, voxel shapes, and generalized models

Goal: make non-cube blocks possible.

Tasks:

- State properties.
- State ID packing.
- Collision/selection/occlusion shapes.
- JSON-like model descriptions.
- Slabs/stairs as proving features.
- Fences/walls/panes connection logic.
- Doors/trapdoors/ladders/torches.

Exit criteria:

- Full-cube assumptions are removed from collision, interaction, and rendering.

## Phase 5 — Greedy meshing + voxel lighting

Goal: unlock larger view distances and correct cave/interior lighting.

Tasks:

- Greedy mesher.
- Section rebuild jobs.
- Opaque/cutout/translucent/emissive passes.
- Sky light.
- Block light.
- Incremental propagation/removal.
- Per-vertex lighting/AO.

Exit criteria:

- Caves are dark without fake global lighting.
- Torches emit local light.
- Chunk-border lighting is stable.

## Phase 6 — Fluid engine

Goal: water/lava behave as systems, not static blocks.

Tasks:

- Fluid states.
- Scheduled flow.
- Buckets.
- Waterlogging.
- Lava/water reactions.
- Flow rendering.
- Entity flow/buoyancy.

Exit criteria:

- Local fluid edits settle deterministically and persist.

## Phase 7 — World generation V2

Goal: Minecraft-scale terrain diversity.

Tasks:

- Climate sampler.
- 3D terrain density.
- Cave families.
- Aquifers.
- Surface rules.
- Expanded biomes.
- Ore placements.
- Feature system.
- Structure template engine.

Exit criteria:

- Long-distance exploration produces varied mountains, valleys, cave systems, rivers/oceans, biome transitions, and structures without hard-coded per-biome generation functions.

## Phase 8 — Inventory/crafting/container V2

Goal: real slot semantics and processing progression.

Tasks:

- Item components.
- Slot interaction protocol.
- 2×2/3×3 crafting.
- Shaped/shapeless recipe registry.
- Chests.
- Furnace.
- Fuel registry.
- Smelting recipes.

Exit criteria:

- Early-game survival loop can follow wood → crafting table → furnace → iron equipment.

## Phase 9 — Equipment/combat/XP/effects

Goal: robust player progression and combat rules.

Tasks:

- Armor/equipment slots.
- Tool tiers.
- Attack cooldown.
- Damage types.
- Projectiles.
- Shields.
- XP.
- Status effects.
- Enchantments baseline.

Exit criteria:

- Player can progress through tool/armor tiers and fight entities with deterministic combat.

## Phase 10 — Entity framework + passive mobs

Goal: replace ambient critters with persistent simulation entities.

Tasks:

- Entity manager/spatial index.
- Living entity component.
- Attributes.
- AI goals.
- Navigation.
- Spawn manager.
- Cow/pig/sheep/chicken/rabbit.
- Breeding/ageing/drops.

Exit criteria:

- Passive animals spawn, persist as needed, navigate, breed, die, and drop loot.

## Phase 11 — Hostile mobs and survival night loop

Goal: make darkness/night materially dangerous.

Tasks:

- Zombie.
- Skeleton + arrows.
- Creeper + explosion.
- Spider.
- Hostile spawning rules.
- Light-level interaction.
- Mob loot tables.
- Difficulty hooks.

Exit criteria:

- A normal survival night has meaningful hostile gameplay.

## Phase 12 — Agriculture, ecology, and block simulation breadth

Goal: mature sandbox simulation.

Tasks:

- Crops.
- Farmland/moisture.
- Bone meal.
- Saplings/tree growth.
- Leaf decay.
- Grass spread.
- Fire.
- Ice/snow environmental rules.
- Bees or other ecology later.

Exit criteria:

- Farming and renewable-resource loops are viable.

## Phase 13 — Redstone foundation

Goal: support useful circuits.

Tasks:

- Signal API.
- Lever/button/plate.
- Torch.
- Dust.
- Repeater.
- Comparator.
- Observer.
- Lamps/doors.

Exit criteria:

- Canonical basic circuits have deterministic fixtures.

## Phase 14 — Pistons, hoppers, automation, rails

Goal: unlock machines and transport.

Tasks:

- Pistons/sticky pistons.
- Slime/honey move groups.
- Dispenser/dropper.
- Hopper transfer.
- Minecarts.
- Rails/powered rails/detector rails.
- TNT.

Exit criteria:

- Core farms/transport/contraptions are possible.

## Phase 15 — Villages, villagers, trading, raids

Goal: social/economic progression.

Tasks:

- Village structures.
- POI system.
- Villager professions/schedules.
- Trading.
- Reputation.
- Iron golems.
- Pillagers/outposts.
- Raid-like event system.

Exit criteria:

- Villages are living systems rather than static scenery.

## Phase 16 — Nether progression

Goal: second dimension and mid-game progression.

Tasks:

- Portal frames/activation.
- Dimension transfer.
- Nether generation/biomes.
- Fortresses/bastions.
- Nether mobs.
- Brewing ingredients/progression.

Exit criteria:

- Player can enter Nether, obtain progression items, and return safely.

## Phase 17 — Strongholds, End, dragon progression

Goal: complete the canonical survival arc.

Tasks:

- Eyes/stronghold locating equivalent.
- Stronghold generation.
- End portal.
- End terrain.
- Dragon fight.
- Exit/gateways.
- End cities.
- Shulkers.
- Elytra-like reward.

Exit criteria:

- A fresh survival world can be played from spawn through the final boss arc.

## Phase 18 — Creative, commands, gamerules, advanced UI

Goal: broaden sandbox control.

Tasks:

- Creative inventory/search.
- Flight.
- Instant break.
- Game mode switching.
- Command parser/framework.
- Gamerules.
- Difficulty selection.
- Spectator/adventure/hardcore.
- Advancements/statistics.

Exit criteria:

- Major non-survival play styles are usable.

## Phase 19 — Multiplayer extraction

Goal: dedicated-server authoritative multiplayer.

Tasks:

- Shared headless core package.
- Protocol package.
- Dedicated server.
- Chunk/entity replication.
- Inventory transaction authority.
- Movement prediction/reconciliation.
- Multiplayer UI.
- Permission/command model.

Exit criteria:

- Multiple players can join a persistent world and interact without desync/data duplication.

## Phase 20 — Current-version content parity

Goal: close content gaps against the then-current stable Minecraft release.

Tasks:

- Audit stable-release notes.
- Update parity matrix.
- Add missing blocks/items/mobs/biomes/structures.
- Add 2026 content such as Tiny Takeover/Chaos Cubed family features where applicable.
- Track 26.3+ content such as Dappled Forest/poplar/abandoned camps/cushions/straw-bed-like mechanics as separate deltas until those releases are stable.

Exit criteria:

- Remaining differences are documented, deliberate, and mostly content breadth rather than missing engine primitives.

---

# 30. Detailed Feature Checklist

The following is the long-term parity inventory. It is intentionally broad.

## World fundamentals

- [ ] Modern vertical world range.
- [ ] Dimension-specific world bounds.
- [ ] Chunk columns + 16³ sections.
- [ ] Paletted state storage.
- [ ] Heightmaps.
- [ ] Biome storage by section/cell.
- [ ] Chunk tickets.
- [ ] Simulation distance.
- [ ] Render distance.
- [ ] Spawn chunks/forced chunks equivalent if desired.
- [ ] Deterministic world seeds.
- [ ] World border.

## Terrain

- [ ] Climate fields.
- [ ] Mountain/valley terrain.
- [ ] Rivers.
- [ ] Oceans.
- [ ] 3D caves.
- [ ] Aquifers.
- [ ] Ravines.
- [ ] Surface rules.
- [ ] Ore features.
- [ ] Geodes.
- [ ] Springs/lakes.
- [ ] Trees/plants.
- [ ] Structures.

## Blocks

- [ ] Full cubes.
- [ ] Transparent cubes.
- [ ] Cutout plants.
- [ ] Slabs.
- [ ] Stairs.
- [ ] Fences.
- [ ] Walls.
- [ ] Panes.
- [ ] Doors.
- [ ] Trapdoors.
- [ ] Ladders/vines.
- [ ] Torches/lanterns.
- [ ] Beds.
- [ ] Chests/barrels.
- [ ] Furnaces.
- [ ] Crafting table.
- [ ] Enchanting table.
- [ ] Brewing stand.
- [ ] Smithing/anvil/grindstone.
- [ ] Signs.
- [ ] Rails.
- [ ] Redstone blocks/components.
- [ ] Pistons.
- [ ] Hoppers/dispensers/droppers.
- [ ] Portals.
- [ ] Decorative blocks.

## Simulation

- [ ] Neighbor updates.
- [ ] Scheduled ticks.
- [ ] Random ticks.
- [ ] Falling blocks.
- [ ] Fluids.
- [ ] Fire.
- [ ] Crop growth.
- [ ] Tree growth.
- [ ] Leaf decay.
- [ ] Grass spread.
- [ ] Snow/ice.
- [ ] Explosions.
- [ ] Redstone.

## Player

- [ ] Walk.
- [ ] Sprint.
- [ ] Sprint-jump.
- [ ] Sneak.
- [ ] Swim.
- [ ] Crawl.
- [ ] Climb.
- [ ] Creative flight.
- [ ] Spectator flight.
- [ ] Riding.
- [ ] Elytra-like glide.
- [ ] Hunger/saturation.
- [ ] Health/armor.
- [ ] Air.
- [ ] XP.
- [ ] Effects.
- [ ] Respawn points.

## Inventory/items

- [ ] Full slot semantics.
- [ ] Item components.
- [ ] Durability.
- [ ] Equipment.
- [ ] Tool tiers.
- [ ] Food.
- [ ] Potions.
- [ ] Enchantments.
- [ ] Buckets.
- [ ] Projectiles.
- [ ] Maps/books.
- [ ] Containers.

## Crafting/processing

- [ ] 2×2 crafting.
- [ ] 3×3 crafting.
- [ ] Shaped recipes.
- [ ] Shapeless recipes.
- [ ] Smelting.
- [ ] Smoking.
- [ ] Blasting.
- [ ] Stonecutting.
- [ ] Smithing.
- [ ] Brewing.
- [ ] Anvil.
- [ ] Grindstone.
- [ ] Loom/cartography.

## Entities

- [ ] Items.
- [ ] XP orbs.
- [ ] Projectiles.
- [ ] Falling blocks.
- [ ] TNT.
- [ ] Boats.
- [ ] Minecarts.
- [ ] Passive mobs.
- [ ] Hostile mobs.
- [ ] Tameable mobs.
- [ ] Villagers.
- [ ] Golems.
- [ ] Nether mobs.
- [ ] End mobs.
- [ ] Bosses.

## Progression

- [ ] Recipe unlocks.
- [ ] Advancements.
- [ ] Statistics.
- [ ] Villager trading.
- [ ] Enchanting.
- [ ] Brewing.
- [ ] Nether progression.
- [ ] Stronghold locating.
- [ ] End progression.
- [ ] Boss rewards.

## Environment

- [ ] Voxel sky light.
- [ ] Block light.
- [ ] Day/night.
- [ ] Moon phases if desired.
- [ ] Weather.
- [ ] Thunder/lightning.
- [ ] Biome fog/tint.
- [ ] Underwater effects.
- [ ] Particles.
- [ ] Positional sound.
- [ ] Ambient sound/music.

## UI

- [ ] Title/world screens.
- [ ] World creation.
- [ ] Pause/options.
- [ ] Rebindable controls.
- [ ] Inventory/crafting screens.
- [ ] Container screens.
- [ ] Death screen.
- [ ] Advancements/statistics.
- [ ] Chat.
- [ ] Subtitles.
- [ ] Accessibility.
- [ ] Creative inventory.
- [ ] Debug overlay.

## Multiplayer

- [ ] Dedicated server.
- [ ] Protocol versioning.
- [ ] Authentication/profile abstraction.
- [ ] Chunk replication.
- [ ] Entity replication.
- [ ] Inventory transactions.
- [ ] Prediction/reconciliation.
- [ ] Chat.
- [ ] Permissions.
- [ ] Server save lifecycle.

---

# 31. First Implementation Backlog

The next engineering work should be this order. Do not skip directly to mobs or redstone.

1. Create `PARITY_MATRIX.md`.
2. Add benchmark capture for current main.
3. Introduce `ResourceId`.
4. Add generic `Registry<T>`.
5. Separate `BlockType` and `ItemType`.
6. Add legacy numeric-ID mapping.
7. Add tag registry.
8. Introduce block-state property schemas.
9. Generate compact `BlockStateId` table.
10. Migrate existing blocks onto block states without changing visuals.
11. Migrate tools/items out of `BlockRegistry`.
12. Introduce `ChunkSection` 16³.
13. Introduce `ChunkColumn`.
14. Add dimension minY/height configuration.
15. Rewrite world block access across sections.
16. Extend mesher to vertical section neighbors.
17. Add section dirty flags.
18. Add IndexedDB save repository.
19. Migrate current localStorage saves.
20. Add fixed 20 TPS clock.
21. Add scheduled tick queue.
22. Add neighbor-update queue.
23. Add random-tick sampler.
24. Add voxel shape primitive.
25. Convert collision/raycast to voxel shapes.
26. Implement slab as first non-cube proof.
27. Implement stair as second proof.
28. Add greedy cube mesher.
29. Add section worker-meshing protocol.
30. Implement sky-light arrays.
31. Implement block-light arrays.
32. Add torch as first emitting block.
33. Implement fluid-state registry.
34. Implement scheduled water flow.
35. Implement lava flow and reactions.
36. Begin climate/world-generation V2.

At task 36 the architecture will finally be ready for broad Minecraft-content expansion without repeatedly rewriting the foundation.

---

# 32. Definition of “Close to Minecraft”

The project should not declare meaningful parity because it has many block textures. It should declare parity by systems and behavior.

## Core-parity milestone

Achieved when a fresh player can:

- Create a deterministic world.
- Explore varied modern terrain and caves.
- Gather wood.
- Craft tools.
- Mine ores.
- Smelt resources.
- Farm food.
- Survive a hostile night.
- Build with a broad set of shaped blocks.
- Use containers.
- Use water/lava meaningfully.
- Experience correct local lighting.
- Save/reload without losing world simulation.

## Advanced-parity milestone

Achieved when the player can also:

- Build redstone circuits and automation.
- Breed/tame/use mobs.
- Trade with villagers.
- Use enchantments and brewing.
- Explore major structures.
- Enter the Nether.
- Complete Nether progression.
- Locate and enter the End.
- Defeat the final boss progression.

## High-parity milestone

Achieved when:

- Most common blocks/items/entities have equivalents.
- Modern biome/structure breadth is substantial.
- Major redstone machines work.
- Game modes/settings are mature.
- Multiplayer is server-authoritative and persistent.
- Content differences versus the chosen Minecraft stable release are mostly documented edge cases or low-priority breadth gaps.

---

# 33. Explicit Non-Goals and Legal Guardrails

Do not:

- Copy Minecraft source code.
- Decompile and port proprietary implementation code.
- Commit Mojang/Microsoft textures, models, sounds, music, fonts, or other copyrighted assets.
- Use official Minecraft branding in a way that implies affiliation.
- Distribute proprietary game files.

Do:

- Reimplement mechanics independently.
- Use original/procedural textures and sounds.
- Use generic names internally where useful.
- Keep a documented reference-behavior matrix.
- Attribute third-party open-source dependencies according to their licenses.

---

# 34. Architectural Rules for Future Contributors/Agents

1. **No feature may bypass registries with ad-hoc hard-coded IDs.**
2. **Rendering is never authoritative gameplay state.**
3. **All world mutations go through the world simulation mutation API.**
4. **Block updates are queued and bounded; avoid recursive cascades.**
5. **Long-running generation/meshing/pathfinding cannot block the render thread.**
6. **All persistent data is versioned and validated.**
7. **Every new block behavior defines collision, selection, occlusion, drops, state, and update semantics explicitly.**
8. **Every new entity defines spawn, despawn, persistence, collision, drops, and tick policy.**
9. **Every new major mechanic ships with deterministic scenario tests.**
10. **Every invasive refactor must preserve or deliberately migrate existing worlds.**
11. **No new “god object” logic should be added to `Game.ts` or `World.ts`; extract subsystem interfaces.**
12. **No parity claim without a test or documented intentional difference.**
13. **Do not prioritize content count over engine correctness.**
14. **Avoid hidden frame-rate dependence; simulation runs on ticks.**
15. **Keep headless/browser CI viable throughout the roadmap.**

---

# 35. Recommended Module Layout at Mid-Roadmap

```text
src/
  app/
    GameClient.ts
    Session.ts
  engine/
    clock/
    input/
    resources/
    workers/
  registry/
    Registry.ts
    ResourceId.ts
    Tags.ts
  data/
    blocks/
    items/
    recipes/
    loot/
    biomes/
    entities/
  world/
    World.ts
    Dimension.ts
    ChunkColumn.ts
    ChunkSection.ts
    PalettedContainer.ts
    Heightmaps.ts
    ticks/
    lighting/
    fluids/
    generation/
    structures/
    blockentity/
  blocks/
    BlockState.ts
    BlockBehavior.ts
    VoxelShape.ts
    behaviors/
  items/
    ItemStack.ts
    ItemComponents.ts
    ItemBehavior.ts
  entity/
    Entity.ts
    EntityManager.ts
    SpatialIndex.ts
    components/
    ai/
    navigation/
    mobs/
  player/
    PlayerController.ts
    PlayerInventory.ts
    PlayerCombat.ts
    PlayerProgression.ts
  inventory/
    Container.ts
    Slot.ts
    Transaction.ts
    crafting/
    processing/
  redstone/
    Signal.ts
    UpdateGraph.ts
    PistonPlanner.ts
  rendering/
    WorldRenderer.ts
    SectionRenderer.ts
    BlockModelRenderer.ts
    EntityRenderer.ts
    Particles.ts
    Weather.ts
  persistence/
    WorldDatabase.ts
    migrations/
    repositories/
  ui/
    screens/
    hud/
  audio/
  protocol/
```

This is a target shape, not a requirement to perform a destructive folder rewrite immediately. Refactor incrementally as the corresponding capability lands.

---

# 36. Final Priority Order

When tradeoffs arise, prioritize in this order:

1. World correctness and save integrity.
2. Deterministic simulation architecture.
3. Data-driven extensibility.
4. Performance and streaming stability.
5. Core survival progression.
6. Lighting/fluids/block behavior.
7. Entity/combat systems.
8. Redstone/automation.
9. Dimensions/progression.
10. Content breadth.
11. Visual/audio polish.
12. Multiplayer.
13. Current-version content catch-up.

The project will become closer to Minecraft faster by implementing the **systems that generate many behaviors** than by hand-adding hundreds of isolated blocks.

---

# 37. Immediate Recommendation

The next implementation change should **not** be “add more Minecraft blocks.”

The next major change should be:

> **Data-driven registries + block states + vertically sectioned world storage + IndexedDB migration foundation.**

That change removes the four largest scaling constraints at once:

- the 25-ID registry ceiling,
- the block/item coupling,
- the 64-block world-height ceiling,
- and the sparse localStorage save ceiling.

Once those foundations are stable, the project can add Minecraft-like content at a much higher rate with far less rewiring.

This document is the master roadmap. Each phase should be decomposed into a separate OpenSpec change with its own proposal, design, task list, verification matrix, and implementation report.