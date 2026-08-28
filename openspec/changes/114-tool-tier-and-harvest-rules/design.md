# Design: 114-tool-tier-and-harvest-rules

## Context / current state

Today a block's harvest behavior is decided by a single enum field
`BlockTypeDefinition.preferredTool?: ToolKind` and resolved only inside
`PlayerInteraction.getBreakDuration`:

```ts
const duration = def.hardness;
if (def.preferredTool !== undefined &&
    tool?.toolKind === def.preferredTool &&
    tool?.toolPower !== undefined &&
    (this.selector.getSlotCount?.() ?? 1) > 0) {
  duration /= tool.toolPower;
}
```

Drops are produced unconditionally by `finishBreak` through the loot table
(`def.lootTable`) or the legacy `dropItem` fallback; there is **no tier gate**
and **no tag system** for mineability. Tools carry `toolKind` and `toolPower`
(`ItemRegistry`) but no tier.

The tag model from change 005 (`TagRegistry`) exists but is not yet wired into
gameplay; it is only exercised by tests and by `OreFeature`'s private tag
registry.

## Target state

A `HarvestRules` service is the single authority for three questions, all driven
by data (tags + numeric tiers):

1. **Is this tool effective against this block?** → controls break speed.
2. **Does breaking this block with this tool yield a drop?** → controls loot.
3. **How long does this block take to break with this tool?** → speed math.

Mineability is expressed through block tags `minecraft:mineable/<kind>`; a tool's
kind is expressed through item tags `minecraft:tools/<kind>` (with `toolKind`
retained as a fallback). Mining level (`BlockTypeDefinition.miningLevel`) and
tool tier (`ItemTypeDefinition.toolTier`) govern the tier gate.

## Invariants

- `miningLevel` defaults to `0`; `toolTier` defaults to `0`. A `0`-level block
  is always harvestable (drops with hand).
- A tool is effective **iff** its kind equals the block's required kind (by tag
  membership) AND (`miningLevel === 0` OR `toolTier >= miningLevel`).
- A block yields a drop **iff** `canHarvest` is true. Breaking (removing the
  block from the world) always happens regardless of harvestability.
- Break duration is `max(0.08, hardness / multiplier)` where `multiplier =
  tool.toolPower` when effective, else `1`.
- Tag members are derived from the already-validated registries, so finalization
  cannot reference a missing resource.

## API and data model

```ts
// BlockRegistry.ts
export interface BlockTypeDefinition {
  // ...existing fields...
  /** Minimum tool tier required to harvest (drop). 0 = harvestable by hand. */
  miningLevel?: number;
}

// ItemRegistry.ts
export interface ItemTypeDefinition {
  // ...existing fields...
  /** Tier of a tool item; higher tiers satisfy higher mining levels. 0 = non-tool. */
  toolTier?: number;
}

// new: src/world/HarvestRules.ts
export class HarvestRules {
  constructor(blockTags: TagRegistry, itemTags: TagRegistry);
  /** Required tool kind for the block, from the mineable tag it belongs to. */
  blockToolKind(def: BlockTypeDefinition): ToolKind | undefined;
  /** Tool kind for an item, from its tools/<kind> tag (falls back to toolKind). */
  toolKind(item: ItemTypeDefinition): ToolKind | undefined;
  /** Effective = right kind AND (level 0 OR tier sufficient). */
  isEffectiveTool(def: BlockTypeDefinition, tool: ItemTypeDefinition | undefined): boolean;
  /** Drops iff level 0, or right kind with sufficient tier. */
  canHarvest(def: BlockTypeDefinition, tool: ItemTypeDefinition | undefined): boolean;
  /** hardness / toolPower when effective, else hardness; floor 0.08s. */
  getBreakDuration(def: BlockTypeDefinition, tool: ItemTypeDefinition | undefined): number;
}

// BlockRegistry.ts
export function createDefaultBlockTags(blockRegistry: BlockTypeRegistry): TagRegistry;
// ItemRegistry.ts
export function createDefaultItemTags(itemRegistry: ItemTypeRegistry): TagRegistry;
```

Tag ids: `minecraft:mineable/pickaxe|axe|shovel` (block domain) and
`minecraft:tools/pickaxe|axe|shovel` (item domain). The kind→tag mapping is a
fixed constant in `HarvestRules`.

## Control / data flow

- Bootstrap (`Game.ts`): build `blockRegistry`, `itemRegistry`; validate
  cross-references; build `blockTags = createDefaultBlockTags(blockRegistry)` and
  `itemTags = createDefaultItemTags(itemRegistry)`; build `harvestRules =
  new HarvestRules(blockTags, itemTags)`; inject into `PlayerInteraction`.
- `PlayerInteraction.advanceBreak` calls `getBreakDuration(def)` which delegates
  to `harvestRules.getBreakDuration(def, tool)` when rules are present.
- `PlayerInteraction.finishBreak` computes `canHarvest`; it evaluates the loot
  table / legacy drop only when `canHarvest` is true, otherwise removes the block
  with no drop. Tool durability damage proceeds as before.

## Detailed behavior

| Block | miningLevel | required kind | effective tool | drops with hand? | drops w/ wrong kind? | drops w/ right-kind insufficient tier? |
|---|---|---|---|---|---|---|
| grass/dirt/sand/gravel/snow/wood/leaves/planks/glass/chest | 0 | (its kind) | tool of that kind | yes | yes (slow) | n/a (level 0) |
| stone/coal_ore/iron_ore/cobblestone/bricks/furnace | 1 | pickaxe | pickaxe tier≥1 | no | no | no |

Speed: stone (hardness 1.5) with wooden pickaxe (power 2.2, tier 1) → 1.5/2.2 ≈
0.68s. Stone with hand → 1.5s. Stone with axe (wrong kind) → 1.5s, no drop.

## Failure modes

- **Tag finalize fails** (missing resource): bootstrap throws before the game
  starts; caught by the normal registry-error path. Members are derived from the
  same registry, so this should never fire for the default catalog.
- **Block has no `preferredTool` and no mineable tag**: `blockToolKind` returns
  `undefined`; such a block is never effectively tool-mined (base speed) but
  still harvestable if `miningLevel === 0`.
- **No `harvestRules` injected** (tests / legacy paths): `PlayerInteraction`
  falls back to the pre-114 def-field logic (always drops, legacy bonus),
  preserving existing behavior exactly.

## Compatibility / migration

Purely additive. Optional constructor field; new optional registry fields with
safe defaults. No persisted data touched.

## Performance / resource constraints

`HarvestRules` queries are O(1) `TagRegistry.contains`/map lookups; no
allocation in the hot path. Tag registries are built once at bootstrap and
frozen. No change to frame/tick budgets.

## Testing seams

`HarvestRules` is a pure, dependency-light class — fully unit-testable without
`THREE` or `PlayerInteraction`. `PlayerInteraction` accepts `harvestRules` so an
integration test can assert no-drop behavior with a real `ItemEntityManager`.

## Observability / debugging

Incorrect harvest behavior is localized to `HarvestRules`; a unit test per
scenario makes regressions obvious. `blockToolKind`/`toolKind` are trivial to log.

## Affected files / symbols

- `src/world/BlockRegistry.ts`: `BlockTypeDefinition.miningLevel`,
  `miningLevel` literals on stone/ores/cobblestone/bricks/furnace,
  `createDefaultBlockTags`.
- `src/inventory/ItemRegistry.ts`: `ItemTypeDefinition.toolTier`, `toolTier`
  literals on wooden/stone tools, `createDefaultItemTags`.
- `src/world/HarvestRules.ts`: new module.
- `src/player/PlayerInteraction.ts`: optional `harvestRules`, drop gate,
  duration delegation.
- `src/engine/Game.ts`: build + inject tag registries and `HarvestRules`.
- `tests/unit/HarvestRules.test.ts`: new.
- `tests/unit/PlayerInteraction.test.ts`: new integration assertions.

## Rejected alternatives

- **Keep `preferredTool` as the sole mechanism, add only `miningLevel`.** This
  skips the "through tags" mandate and blocks the data-pack-driven expansion in
  212. Tags are cheap given change 005 and make mineability declarative.
- **Gate drops inside the loot table via a condition.** Loot-table conditions
  are pure predicates over `LootContext`, but the no-drop decision is a harvest
  concern orthogonal to loot content; resolving it at the interaction layer keeps
  loot tables content-focused and avoids encoding tool tiers in every table.
- **Per-block required-tier enum instead of numeric `miningLevel`.** Numeric
  tiers compose with future tool tiers (iron/diamond) without new enums.

## Downstream dependencies

- Change 115 (durability) and 116 (armor) are unaffected; they read `toolKind`/
  `maxDurability` as today.
- Change 119 (enchantments) can later extend `getBreakDuration` with an
  enchantment multiplier without altering the tier gate.
- Change 212 (data packs) can append to the mineable/tool tags instead of editing
  `preferredTool`.
