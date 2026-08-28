# Spec: tool-tier-and-harvest-rules

## Contract

This capability defines the data model and rules that decide (a) how fast a
block breaks with a given tool and (b) whether breaking a block yields a drop.
It is data-driven through tags (`minecraft:mineable/<kind>`,
`minecraft:tools/<kind>`), a per-block `miningLevel`, and a per-tool `toolTier`.
Harvest decisions are centralized in `HarvestRules`; `PlayerInteraction` consumes
it. Omitted sections are inapplicable and stated as such.

## Definitions

- **Tool kind**: one of `Pickaxe`, `Axe`, `Shovel` (`ToolKind`).
- **Mining level** (`miningLevel`): the minimum `toolTier` required for a block
  to drop. `0` means harvestable by hand.
- **Tool tier** (`toolTier`): the strength of a tool item; `0` means not a tool.
- **Effective tool**: a tool whose kind matches the block's required kind and
  whose tier satisfies the block's `miningLevel`.
- **Harvestable**: a block whose breaking yields a drop.

## Invariants

- `miningLevel` and `toolTier` default to `0` when absent.
- Breaking (removing the block from the world) always occurs; only the drop is
  gated.
- Block removal never depends on the held tool.

## Requirements

### Requirement: mining-level data model

`BlockTypeDefinition` SHALL declare an optional numeric `miningLevel` that
defaults to `0`. Blocks that require a tool to drop SHALL declare `miningLevel >= 1`.

#### Scenario: default level is harvestable by hand

- **GIVEN** a block definition with no `miningLevel` set
- **WHEN** its `miningLevel` is read through `HarvestRules`
- **THEN** it resolves to `0`

#### Scenario: stone-family blocks require a tool

- **GIVEN** the default block registry
- **WHEN** `stone`, `coal_ore`, `iron_ore`, `cobblestone`, `bricks`, `furnace`
  definitions are inspected
- **THEN** each declares `miningLevel === 1`

### Requirement: tool-tier data model

`ItemTypeDefinition` SHALL declare an optional numeric `toolTier` that defaults
to `0`. Each tool item SHALL declare a `toolTier` consistent with its strength
(wooden = `1`, stone = `2`).

#### Scenario: wooden tools are tier 1

- **GIVEN** the default item registry
- **WHEN** the `wooden_pickaxe` and `wooden_axe` definitions are inspected
- **THEN** each declares `toolTier === 1`

#### Scenario: stone pickaxe is tier 2

- **GIVEN** the default item registry
- **WHEN** the `stone_pickaxe` definition is inspected
- **THEN** it declares `toolTier === 2`

### Requirement: tag-based mineability

The harvest system SHALL determine a block's required tool kind from its
membership in a block tag `minecraft:mineable/<kind>`, and a tool's kind from its
membership in an item tag `minecraft:tools/<kind>`, falling back to the
`preferredTool` / `toolKind` fields. `createDefaultBlockTags` and
`createDefaultItemTags` SHALL build and finalize these registries from the
block/item registries.

#### Scenario: stone belongs to mineable/pickaxe

- **GIVEN** the default block tags built from the default block registry
- **WHEN** `HarvestRules.blockToolKind(stone)` is evaluated
- **THEN** it returns `Pickaxe`

#### Scenario: wooden pickaxe belongs to tools/pickaxe

- **GIVEN** the default item tags built from the default item registry
- **WHEN** `HarvestRules.toolKind(wooden_pickaxe)` is evaluated
- **THEN** it returns `Pickaxe`

#### Scenario: tags are finalized without missing references

- **GIVEN** the default block and item registries
- **WHEN** `createDefaultBlockTags` and `createDefaultItemTags` are finalized
- **THEN** both registries report `isFinalized === true` and contain the three
  mineable tags and three tools tags respectively

### Requirement: correct break speed

`getBreakDuration(def, tool)` SHALL return `max(0.08, hardness / toolPower)` when
the tool is effective, otherwise `max(0.08, hardness)` (base speed). A tool is
effective only when its kind matches the block's required kind AND
(`miningLevel === 0` OR `toolTier >= miningLevel`).

#### Scenario: effective pickaxe speeds up stone

- **GIVEN** `stone` (`hardness 1.5`, `miningLevel 1`) and `wooden_pickaxe`
  (`toolKind Pickaxe`, `toolTier 1`, `toolPower 2.2`)
- **WHEN** `getBreakDuration(stone, wooden_pickaxe)` is computed
- **THEN** it equals `max(0.08, 1.5 / 2.2)` ≈ `0.6818`

#### Scenario: wrong-kind tool does not speed up

- **GIVEN** `stone` and `wooden_axe` (`toolKind Axe`)
- **WHEN** `getBreakDuration(stone, wooden_axe)` is computed
- **THEN** it equals `1.5` (base speed)

#### Scenario: hand breaks at base speed

- **GIVEN** `stone` and no tool
- **WHEN** `getBreakDuration(stone, undefined)` is computed
- **THEN** it equals `1.5`

#### Scenario: duration floor is 0.08s

- **GIVEN** any block and an extremely fast effective tool
- **WHEN** the computed duration would be below `0.08`
- **THEN** the result is clamped to `0.08`

### Requirement: correct drop rule

A block SHALL yield a drop (loot table or legacy `dropItem`) only when
`canHarvest(def, tool)` is true. `canHarvest` SHALL be true when `miningLevel ===
0`, or when the held tool's kind matches the block's required kind AND
`toolTier >= miningLevel`. When not harvestable, the block is removed but no drop
is produced.

#### Scenario: dirt drops by hand

- **GIVEN** `dirt` (`miningLevel 0`) and no tool
- **WHEN** `canHarvest(dirt, undefined)` is evaluated
- **THEN** it is `true`

#### Scenario: stone does not drop by hand

- **GIVEN** `stone` (`miningLevel 1`) and no tool
- **WHEN** `canHarvest(stone, undefined)` is evaluated
- **THEN** it is `false`

#### Scenario: wrong-kind tool yields no drop

- **GIVEN** `stone` (`miningLevel 1`, required kind Pickaxe) and `wooden_axe`
  (`toolKind Axe`, `toolTier 1`)
- **WHEN** `canHarvest(stone, wooden_axe)` is evaluated
- **THEN** it is `false`

#### Scenario: sufficient-tier correct tool drops

- **GIVEN** `stone` (`miningLevel 1`) and `wooden_pickaxe` (`toolKind Pickaxe`,
  `toolTier 1`)
- **WHEN** `canHarvest(stone, wooden_pickaxe)` is evaluated
- **THEN** it is `true`

#### Scenario: interaction spawns no entity when not harvestable

- **GIVEN** a `PlayerInteraction` configured with `harvestRules`, targeting
  `stone`, holding no tool
- **WHEN** the block is broken
- **THEN** the block becomes air and `itemEntities.spawnLootStacks` is never
  called

## Error and failure behavior

- Tag finalization MUST reject missing resource references by throwing a
  `RegistryError`; bootstrap MUST NOT proceed with a partially resolved
  membership.
- When `PlayerInteraction` is constructed without `harvestRules`, it MUST retain
  the pre-114 behavior (legacy speed bonus via `preferredTool`/`toolPower`, and
  always drop) so existing callers are unaffected.

## Performance and resource bounds

- `HarvestRules` queries are O(1) set/map lookups with no allocation in the
  per-frame break loop.
- Tag registries are built once at bootstrap and frozen (per `TagRegistry`
  finalization).

## Compatibility and migration

- `miningLevel` and `toolTier` are new optional fields defaulting to `0`; no
  persisted data changes.
- `preferredTool` / `toolKind` are retained and remain the bootstrap source for
  the mineable/tool tags.
- `PlayerInteraction`'s `harvestRules` field is optional; absent callers keep
  prior behavior.

## Security and integrity

- No external or untrusted input flows into harvest decisions; tag registries
  are validated at bootstrap.
- Drop gating cannot be bypassed by malformed items because `toolKind`/
  `toolTier` are read from the validated item registry, not from the stack.

## Observability

- All harvest decisions are centralized in `HarvestRules`, enabling targeted
  unit tests and trivial logging of `blockToolKind`/`toolKind`.

## Verification mapping

| Requirement | Test |
|---|---|
| mining-level data model | `HarvestRules.test.ts` (default + stone-family) |
| tool-tier data model | `HarvestRules.test.ts` (wooden/stone tiers) |
| tag-based mineability | `HarvestRules.test.ts` (blockToolKind/toolKind, finalized tags) |
| correct break speed | `HarvestRules.test.ts` (effective/wrong-kind/hand/floor) |
| correct drop rule | `HarvestRules.test.ts` + `PlayerInteraction.test.ts` (no-drop integration) |
