# Design: 179-nether-content-baseline

## Context/current state
- 176's `generateNetherColumn` writes netherrack via `DEFAULT_NETHER_TERRAIN_BLOCK_IDS.netherrack`,
  documented as a placeholder (1) until the real block exists. 177's portal frame validation and
  178's linking identify obsidian through caller-supplied seams. 123's brewing system exists and
  consumes item data.
- 179 registers the content those systems reference, and hands the real netherrack id back to 176.

## Target state
- `netherrack`, `obsidian`, `soul_sand` (stateless blocks + placing items) and `nether_wart`
  (4-state crop block + placing item) registered; `NETHER_WART_SCHEMA` (`age` 0..3);
  `DEFAULT_NETHER_TERRAIN_BLOCK_IDS.netherrack = BlockId.Netherrack (56)`.

## Invariants
- Block ids 56..59 (`Netherrack`, `Obsidian`, `SoulSand`, `NetherWart`) and matching item ids; each
  item's `placeBlock` resolves to its block; `validateItemBlockCrossReferences` passes.
- `netherrack`/`obsidian`/`soul_sand` carry empty schemas (1 state each); `nether_wart` carries
  `NETHER_WART_SCHEMA` (4 states, default `{ age: 0 }`).
- Obsidian: hardness 50, miningLevel 3 (diamond pickaxe).
- `generateNetherColumn` with default ids writes `BlockId.Netherrack` in the terrain band.

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const NETHER_WART_SCHEMA = new BlockPropertySchema([
  { kind: 'integer', name: 'age', min: 0, max: 3 },
]);
// BlockId.Netherrack = 56, Obsidian = 57, SoulSand = 58, NetherWart = 59 (stateless except wart)
// ItemId.* matches; each item places its block

// src/worldgen/NetherTerrain.ts (edit)
export const DEFAULT_NETHER_TERRAIN_BLOCK_IDS: NetherTerrainBlockIds = {
  netherrack: 56, // BlockId.Netherrack (179 handoff; was the documented placeholder 1)
  lava: 20,
  bedrock: 7,
};
```

## Control/data flow
1. World generation (176) now writes real netherrack; mining it drops the netherrack item (114's
   harvest rules consume the registry).
2. The player mines obsidian (diamond pickaxe) to build portal frames; 177/178's seams accept it.
3. Nether wart seeds are planted on soul sand and, once grown (a later change wires 125/126's crop
   machinery), feed 123's brewing.

## Detailed behavior
- All four blocks mirror existing stateless defs (stone/glass patterns); nether_wart mirrors 125's
  wheat shape (age property) but with vanilla's 0..3 range.
- No behavior modules are attached — this change is registration + the 176 handoff; growth,
  harvesting, and brewing integration are later content changes (explicitly out of scope).

## Failure modes
- No new failure paths: registration either passes 007/registry validation or throws at
  construction; the cross-reference validator runs in tests.

## Compatibility/migration
- Four additive block ids + four additive item ids; `nether_wart` is the 22nd multi-state block
  (4 states); three characterization updates. No `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- Registration-time constants only; 4 new block states (3 single + 4 wart = 7 total).

## Testing seams
- Tests use the real registries and `generateNetherColumn` (the 176 handoff).

## Observability/debugging
- Registry lookups by key/id are the observation surface.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts`, `src/worldgen/NetherTerrain.ts`
  (edits).
- Tests: `tests/unit/NetherContent.test.ts` (new) + three characterization updates.

## Rejected alternatives
- **Implementing the blaze now**: rejected — `HostileMobSystem` is zombie-hard-wired and a blaze
  needs new ranged behavior; documented deferral to 218, with 180-184 modeling eyes-of-ender as
  items.
- **Wiring nether_wart growth/brewing now**: rejected — behavior integration is a later content
  change; registration is the baseline.
- **Leaving the 176 placeholder**: rejected — the handoff is the whole point of "content baseline".

## Downstream dependencies
- 180-184 (End progression) consume obsidian/eyes-of-ender as items; 218 adds the blaze; 219/220
  fill recipes/loot for the new blocks/items; 242's survival e2e mines netherrack and builds obsidian
  frames.
