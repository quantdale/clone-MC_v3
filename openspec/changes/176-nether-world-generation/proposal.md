# Proposal: 176-nether-world-generation

## Problem
175 defined the Nether's `DimensionType`, but nothing can *generate* its terrain: the only terrain
generator is 088's overworld column (surface landmass, water seas, bedrock floor). The Nether is the
first dimension-specific worldgen — lava instead of water, a bedrock roof as well as a floor,
cavernous netherrack instead of a solid landmass. Without it, 175's type has no terrain to describe
and 177-178's portals have no destination to open into.

## Goals
- `src/worldgen/NetherTerrain.ts` (NEW): `generateNetherColumn(seed, columnX, columnZ, config?,
  ids?)` — a pure, deterministic 16×16×height `TerrainColumn` (the exact 088 output shape) with
  Nether rules:
  - **Bedrock floor** at `minY` (0) and a full **bedrock roof** at `ceilingY` (127); cells above the
    roof are air (the open roof area);
  - **no water anywhere** — lava fills every cell below `lavaLevel` (31) that is not terrain;
  - a **spongy netherrack body**: 3D density centered on the lava level
    (`density = (lavaLevel − y) / 64 + noise`), so the terrain is mostly solid near the lava sea,
    oscillates into caverns above it, and peters out ~64 blocks above it — all below the roof;
  - block ids are caller-configurable (`NetherTerrainBlockIds`), with defaults
    `{ netherrack: 1, lava: 20, bedrock: 7 }` — netherrack defaults to a documented placeholder
    (179 registers the real block), lava/bedrock match `BlockId.Lava`/`BlockId.Bedrock`;
  - defaults match 175's `NETHER_DIMENSION_TYPE` bounds (0..255) and the config validates its
    ordering (`minY < lavaLevel < ceilingY < maxY`).

## Non-goals
- **No netherrack/basalt block registry entries** — that is 179's content baseline; the generator
  takes ids as parameters, matching 088's `TerrainBlockIds` pattern.
- **No biomes/features/structures in the Nether** (176 is density/surface baseline; biome and
  feature wiring arrive via later worldgen/content changes).
- **No portal generation or linking** (177-178), **no Nether mobs** (179), **no integration with
  `World`/`TerrainGenerator`** (a wiring concern).
- **No `Game`/`World` wiring.**

## Preconditions
- Change 175 (`nether-dimension-type`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/worldgen/OverworldTerrain.ts` (088, `TerrainColumn`), `src/worldgen/DensityNoise.ts` (087
  primitives), `src/data/DimensionTypes.ts` (175, `NETHER_DIMENSION_TYPE`).

## Proposed change
1. `src/worldgen/NetherTerrain.ts` (NEW): `NetherTerrainConfig`, `NetherTerrainBlockIds`,
   `DEFAULT_NETHER_TERRAIN_CONFIG`, `DEFAULT_NETHER_TERRAIN_BLOCK_IDS`, `generateNetherColumn`.

## Compatibility and migration
- One new worldgen file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Modeling the Nether as a solid mass** (a landmass like the overworld would leave no lava seas
  and no caverns — the easy mistake). Mitigation: the density is centered on the lava level with
  full-amplitude 3D noise, and tests pin lava existence, no-water, full bedrock floor/roof, and the
  spongy band (air pockets in 32..126).
- **`surfaceHeightAt` being misread as terrain height** (the roof bedrock is the topmost solid).
  Mitigation: the terrain-band test scans for the topmost netherrack *below* the roof explicitly.
- **Netherrack id placeholders reaching persistence**. Mitigation: documented as a 179 handoff; the
  generator never hardcodes registry lookups.

## Rollback strategy
One new worldgen file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- `generateNetherColumn` implemented with the rules above.
- Unit tests cover: defaults matching 175's Nether bounds; full bedrock floor/roof; no water
  anywhere; every cell below `lavaLevel` non-air with lava present; a netherrack band with a
  topmost solid below the roof; open roof area above `ceilingY`; per-(seed, columnX, columnZ)
  determinism; caller-supplied ids; config validation.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
