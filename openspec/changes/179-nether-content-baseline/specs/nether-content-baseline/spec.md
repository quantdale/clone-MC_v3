# Spec: nether-content-baseline

## Contract
This capability registers the core Nether blocks and items: `netherrack`, `obsidian`, `soul_sand`
(stateless) and `nether_wart` (4-state crop), with matching placing items and cross-reference
validity, and hands the real netherrack id back to 176's terrain generator (fulfilling its
documented placeholder). The narrow outcome's "mobs" element is a documented deferral to 218 (the
existing `HostileMobSystem` is zombie-hard-wired; a blaze needs new ranged behavior) — the
End-progression changes model eyes-of-ender as item requirements.

## Definitions
- **Stateless**: no blockstate properties (1 state).
- **Nether wart**: `age` 0..3 (4 states, default 0).

## Invariants
- Block ids 56..59 and matching item ids; each item's `placeBlock` resolves to its block.
- `nether_wart` is the only multi-state block of the four (4 states).
- Obsidian: hardness 50, miningLevel 3.
- `DEFAULT_NETHER_TERRAIN_BLOCK_IDS.netherrack === BlockId.Netherrack` (56).

## Requirements

### Requirement: the four blocks and items are registered
`BlockRegistry` MUST register `netherrack` (56), `obsidian` (57), `soul_sand` (58), and
`nether_wart` (59) with those keys; `ItemTypeRegistry` MUST register placing items for each;
`validateItemBlockCrossReferences` MUST pass.

#### Scenario: keys, ids, and placement
- **GIVEN** the default registries
- **THEN** each block id resolves to its key, each item id resolves to the same key, and each item's
  `placeBlock` is `minecraft:<key>`

### Requirement: obsidian is a hard pickaxe-only block
`obsidian` MUST have hardness 50 and miningLevel 3.

#### Scenario: mining requirements
- **GIVEN** the default block registry
- **THEN** `hardness` is 50 and `miningLevel` is 3

### Requirement: the solid blocks are stateless; nether wart has 4 states
`netherrack`, `obsidian`, and `soul_sand` MUST carry empty schemas (1 state each); `nether_wart`
MUST carry `NETHER_WART_SCHEMA` with exactly 4 states (`age` 0..3) and default `{ age: 0 }`.

#### Scenario: state counts
- **GIVEN** a `BlockStateRegistry` over the default registry
- **THEN** the three solid blocks have 1 state each and nether_wart has exactly 4, with ages
  `['0', '1', '2', '3']` and default `0`

### Requirement: the terrain handoff is complete
`DEFAULT_NETHER_TERRAIN_BLOCK_IDS.netherrack` MUST equal `BlockId.Netherrack` (56), and a default
`generateNetherColumn` MUST write that id in its terrain band.

#### Scenario: generated columns carry real netherrack
- **GIVEN** `generateNetherColumn(42, 0, 0)` with default ids
- **THEN** at least one cell in y 32..126 equals `BlockId.Netherrack`

## Error and failure behavior
- Registration is validated by the registries themselves (007/duplicate/cross-reference rules).

## Performance and resource bounds
- Registration-time constants; 7 new block states total (3 single + 4 wart).

## Compatibility and migration
- Four additive block ids + four additive item ids; three characterization updates; no `Game.ts`
  edit; no schema/save-format change.

## Security and integrity
- No new untrusted-input surface.

## Observability
- Registry lookups by key/id.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 registration | `tests/unit/NetherContent.test.ts` › registration |
| REQ-2 obsidian mining | › obsidian case |
| REQ-3 state counts | › stateless + wart enumeration |
| REQ-4 terrain handoff | › nether terrain handoff |
