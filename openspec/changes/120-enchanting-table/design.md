# Design: 120-enchanting-table

## Context/current state
- 118 gives `EnchantmentRegistry` (11 enchants, applicability, conflict, validation)
  and `createDefaultEnchantmentRegistry()`.
- 119 gives `setStackEnchantments(stack, instances, registry)` (validates + writes
  `ENCHANTMENTS_COMPONENT`, new stack, never mutates) and `getStackEnchantments`.
- 117 gives `ExperienceSystem` with `addXp` only — **no way to spend**.
- `ItemRegistry`/`BlockRegistry` have **no** enchanting items/blocks and no
  `enchantability` field.
- Interaction is break/place only; there is **no `use`/interact action** and no
  block→menu dispatch. `CraftingPanel` is the only wired DOM panel and is opened
  by the E-key, not by clicking a block.

## Target state
1. Data: `lapis_lazuli`, `book`, `bookshelf` items; `enchanting_table`, `bookshelf`
   blocks; `ItemTypeDefinition.enchantability?`.
2. `ExperienceSystem.spendLevels(n)`.
3. `src/inventory/EnchantingTable.ts` — deterministic core + `EnchantingTableSession`.
4. Logic-level `use` hook in `PlayerInteraction`/`Game` opening a session for the
   targeted `enchanting_table`.

## Invariants
- `bookShelves` is clamped to `[0, 15]` (Minecraft caps at 15 effective shelves).
- `slotCost` returns an integer in `[1, 255]`.
- `generateEnchantments` returns `EnchantmentInstance[]` where every instance:
  - is applicable to the item (`registry.appliesTo`),
  - has `level >= 1` and `level <= definition.maxLevel`,
  - is mutually non-conflicting (no pair in `areIncompatible`),
  - uses a resource id present in the registry.
- `enchantCosts(level)` returns `{ xpLevels, lapis }` with
  `xpLevels == lapis == clamp(level, 1, 30)` (player-level capped at 30).
- `apply` is atomic: it spends XP + lapis **only if both are available**; on
  success it returns the enchanted stack and the spent amounts; on failure it
  returns `{ ok:false }` and changes nothing.
- All randomness flows from a single `SeedRng` seeded by the world seed + a fixed
  stream name (`'enchanting_table'`) + the item/level/bookshelf inputs, so a given
  (world, item, bookshelf-count, player-level) always yields identical offers.

## API and data model
```ts
// src/inventory/ItemRegistry.ts (additive)
enchantability?: number; // higher => stronger offers; undefined => 0 (not enchantable)

// src/player/ExperienceSystem.ts (additive)
spendLevels(n: number): void; // removes n levels if available; no-op on bad/insufficient input

// src/inventory/EnchantingTable.ts (NEW)
export interface EnchantOffer {
  level: number;                 // displayed enchant level == cost
  xpLevels: number;              // == level, capped 30
  lapis: number;                 // == level, capped 30
  enchantments: EnchantmentInstance[];
}
export interface EnchantingTableSession {
  item: ItemStack;
  bookShelves: number;
  playerLevel: number;
  offers: EnchantOffer[];        // length 3
  apply(offerIndex: number, ctx: EnchantApplyContext): EnchantApplyResult;
}
export interface EnchantApplyContext {
  experience: ExperienceSystem;
  lapisAvailable: number;        // count of lapis in player inventory/table
  registry: EnchantmentRegistry;
}
export interface EnchantApplyResult {
  ok: boolean;
  stack?: ItemStack;
  xpSpent?: number;
  lapisSpent?: number;
  reason?: 'ok' | 'bad_offer' | 'insufficient_xp' | 'insufficient_lapis' | 'incompatible' | 'empty';
}

slotCost(slot: number, enchantability: number, playerLevel: number, rng: SeedRng): number;
generateEnchantments(itemDef: ItemTypeDefinition, power: number, rng: SeedRng, registry: EnchantmentRegistry): EnchantmentInstance[];
enchantCosts(level: number): { xpLevels: number; lapis: number };
createSession(params: {
  stack: ItemStack; itemDef: ItemTypeDefinition; bookShelves: number;
  playerLevel: number; seed: number; registry: EnchantmentRegistry;
}): EnchantingTableSession;
```

## Control/data flow
- **Bootstrap (Game):** when a `use` interaction targets an `enchanting_table`,
  `Game` computes `bookShelves = countBookshelves(world, pos)` (clamped 0..15),
  reads the held `ItemStack` + its `ItemTypeDefinition` + `player.level`, and calls
  `createSession({ stack, itemDef, bookShelves, playerLevel, seed: worldSeed, registry })`.
- **Offers:** `createSession` builds a `SeedRng` from `seed` + inputs, then for
  each slot `s in {0,1,2}` computes `power = slotCost(s, enchantability, playerLevel, rng)`,
  `enchantments = generateEnchantments(itemDef, power, rng, registry)`, and
  `costs = enchantCosts(power)` (displayed level == `power` clamped). The three
  offers are cached on the session.
- **Apply:** `session.apply(i, ctx)` reads `offers[i]`, checks
  `ctx.experience.level >= offer.xpLevels` and `ctx.lapisAvailable >= offer.lapis`;
  if both hold, calls `ctx.experience.spendLevels(offer.xpLevels)`, then returns
  `{ ok:true, stack: setStackEnchantments(stack, offer.enchantments, registry), xpSpent, lapisSpent }`.
  Otherwise `{ ok:false, reason }`.

## Detailed behavior
### slotCost
```
base = (slot + 1) + enchantability + clamp(playerLevel, 1, 50)
f = (rng.nextFloat() + rng.nextFloat() - 1) * 0.15     // [-0.15, +0.15)
raw = (base + 1) * f + base
return clamp(floor(raw), 1, 255)
```
Mirrors the canonical "two-randoms-minus-one times 0.15 jitter, clamp 1..255"
shape, using independent constants.

### generateEnchantments
```
power = clamp(power, 1, 255)
out: EnchantmentInstance[] = []
remaining = power
loop:
  pool = registry.all().filter(e =>
    registry.appliesTo(e, itemDef) &&
    out.every(chosen => !registry.areIncompatible(e, chosen)) &&
    e.maxLevel >= 1)
  if pool empty: break
  pick = weightedRandom(pool, e => e.maxLevel + 1, rng)   // stronger enchants slightly likelier
  bumped = remaining + floor(rng.nextFloat() * (remaining / 4 + 1))
  lvl = clamp(floor(bumped / 16) + 1, 1, pick.maxLevel)
  if lvl < 1: break
  out.push({ id: pick.resourceId, level: lvl })
  remaining = floor(remaining / 2)
  if remaining < 1: break
  if rng.nextFloat() < 0.5: break    // independent termination
return out
```
### enchantCosts
```
level = clamp(level, 1, 30)
return { xpLevels: level, lapis: level }
```
### countBookshelves (caller helper)
The interaction layer passes a clamped `bookShelves` count. A `countBookshelves`
world-scan helper may be added later; 120 consumes the count directly to stay
deterministic and avoid world-geometry coupling in the pure core.

## Failure modes
- Non-enchantable item (`enchantability` undefined/0) → `generateEnchantments`
  returns `[]`; offers still render with `enchantments: []` (selecting them is a
  no-op apply that still consumes nothing — guarded by `ok` only when non-empty).
- `apply` with `offerIndex` out of range → `{ ok:false, reason:'bad_offer' }`.
- Insufficient XP or lapis → `{ ok:false, ... }`, nothing spent.
- `setStackEnchantments` rejects an invalid list before writing (119 guarantee).

## Compatibility/migration
- `enchantability?` optional; existing items unaffected.
- New item/block ids are dense additions; registry `finalize` cross-checks pass.
- `ExperienceSystem.snapshot` stays `{version:1, level, xp}`; `spendLevels`
  preserves invariants (level never negative; `xp` re-derived via `computeXpToNext`).
- `InventorySnapshot.version` stays `1`.

## Performance/resource constraints
- `createSession` is O(3 × enchantments) — trivial.
- `generateEnchantments` loops at most ~`power`/2 halvings (bounded).
- No allocations beyond the small offer array per session.

## Testing seams
- `tests/unit/EnchantingTable.test.ts` — determinism (same seed/inputs ⇒ same
  offers), `slotCost` bounds, `generateEnchantments` invariants (applicable,
  level∈[1,max], no conflicts), `enchantCosts` caps, `apply` spends xp+lapis and
  enchants, `apply` fails on insufficient xp/lapis/bad index, non-enchantable ⇒ `[]`.
- `tests/unit/ExperienceSystem.test.ts` — `spendLevels` removes levels, no-op on
  bad/insufficient, invariants preserved; `snapshot`/`restore` round-trip.
- `tests/unit/ItemRegistry.test.ts` / `BlockRegistry.test.ts` — new ids + `finalize`.

## Observability/debugging
- `createSession` is pure and printable; a debug overlay could list offers.
- Validation errors carry `RegistryError` codes from `setStackEnchantments`.

## Affected files/symbols
- `src/inventory/ItemRegistry.ts` — new item ids, `enchantability?`, seeds.
- `src/world/BlockRegistry.ts` — new block ids + definitions.
- `src/player/ExperienceSystem.ts` — `spendLevels`.
- `src/inventory/EnchantingTable.ts` — **new** module.
- `src/player/PlayerInteraction.ts` — `use`/interact branch.
- `src/engine/Game.ts` — `use` dispatch → `createSession` + `apply`.
- `tests/unit/EnchantingTable.test.ts` (NEW) + extensions above.

## Rejected alternatives
- *Reproduce exact Java enchanting math*: rejected — exact coefficients are not
  verifiable here and the repo uses independent/procedural code. The contract is
  deterministic and bounded instead.
- *Full DOM EnchantingPanel in 120*: rejected — keeps 120 narrow/testable; the
  panel is a presentation follow-up that consumes `EnchantingTableSession`.
- *World bookshelf occlusion scan in core*: rejected — pure core consumes a count;
  geometry stays in the interaction layer.

## Downstream dependencies
- The deferred DOM panel (presentation change) consumes `EnchantingTableSession`.
- Anvil/grindstone/mending (948/949/2202/2203) reuse `setStackEnchantments`.
