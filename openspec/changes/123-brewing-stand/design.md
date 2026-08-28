# Design: 123-brewing-stand

## Context / current state

- Change 122 (`PotionItemData`) defines `PotionContents` and the `potion_contents`
  component. A potion bottle is an item stack whose `components` map carries that
  component; `createPotionContents` builds validated instances.
- Change 109 (`FurnaceBlockEntity`) establishes the block-entity tick-engine pattern:
  an immutable `State` + `tickState(state, ctx, ticks)` pure function, a `validateState`
  strict parser, `serialize/deserialize` envelopes, `MenuSlot`-based slots, and
  `BlockEntityInstance` factory/read/update helpers. The brewing stand reuses this shape.
- `MenuSlot` (109 `MenuTransaction`) is `{ item: string | null; count: number;
  maxStack: number }`. It has no per-slot `components` field yet.

## Target state

A `BrewingStand` core that, given a `BrewingState` and a `BrewingContext`, deterministically
brews one bottle from an ingredient using blaze-powder fuel, persists progress, and
integrates with `BlockEntityInstance`. The bottle's potion contents are read from / written
to the `potion_contents` component of the `bottle` slot's `components`.

## Invariants

- `BrewingState` is immutable to the caller: `tickBrewing` returns a NEW state and never
  mutates its argument.
- A brew only proceeds when: the `bottle` slot holds a potion with a valid
  `potion_contents` component; an `ingredient` item is present; `BrewingContext.match`
  returns a non-null output for `(bottle.base, ingredient)`; and the resulting potion can be
  re-serialized (validated by `createPotionContents`).
- Fuel (blaze powder) is consumed only when a brew is actually progressing (mirrors furnace:
  light only when `canBrew`). Burning decrements each tick; when it reaches 0 the stand goes
  dark until more fuel is added.
- `brewTime` never exceeds `brewTimeTotal`; `fuelBurnTime` never exceeds
  `fuelBurnTimeTotal` (validated).
- All randomness is absent; identical inputs yield identical outputs.

## API and data model

```ts
// BrewingRecipes.ts
export interface PotionEffectData { typeId: string; duration: number; amplifier: number; }
export interface BrewingRecipeOutput {
  readonly base?: string;          // new base name (replaces bottle.base on apply)
  readonly customEffects?: readonly PotionEffectData[]; // new effects (replaces on apply)
}
export interface BrewingContext {
  match(base: string | undefined, ingredient: string): BrewingRecipeOutput | null;
  fuelBurnTicks(item: string): number;   // 0 = not fuel
  brewTicks(): number;                   // ticks per brew cycle
}

// BrewingStandBlockEntity.ts
export interface BrewingState {
  bottle: MenuSlot;        // carries components[POTION_CONTENTS] when it holds a potion
  fuel: MenuSlot;          // blaze powder
  ingredient: MenuSlot;    // the active reagent
  brewTime: number;
  brewTimeTotal: number;
  fuelBurnTime: number;
  fuelBurnTimeTotal: number;
}
```

`MenuSlot` gains an optional `components?: Readonly<Record<string, unknown>>` (additive).

## Control / data flow

- `tickBrewing(state, ctx, ticks=1)` loops `ticks` times over `tickOnce`:
  1. Read `bottle` potion via `readBottleContents(bottle)` → `{ base, contents } | null`
     (null when no valid `potion_contents`).
  2. Compute `match = bottle ? ctx.match(base, ingredient.item ?? '') : null`
     and `canBrew = bottle !== null && ingredient.item !== null && match !== null`.
  3. If `!canBrew`: hold `brewTime=0`, `brewTimeTotal=0`, but still decrement any active
     `fuelBurnTime` (fuel burns down even while paused, mirroring furnace burn behavior).
  4. If `fuelBurnTime === 0` and `fuel.item` is a fuel (`ctx.fuelBurnTicks > 0`) and
     `canBrew`: consume one fuel, set `fuelBurnTimeTotal = fuelBurnTicks`, `fuelBurnTime =
     fuelBurnTimeTotal`.
  5. If `fuelBurnTime > 0` and `canBrew`: decrement `fuelBurnTime`; advance `brewTime =
     min(brewTimeTotal, brewTime+1)`. `brewTimeTotal` is set lazily to `ctx.brewTicks()`
     when a brew starts.
  6. On `brewTime >= brewTimeTotal`: apply `match` to build a new `PotionContents` via
     `createPotionContents({ base: match.base ?? base, customEffects: match.customEffects ??
     contents.customEffects })`, write it into `bottle.components[POTION_CONTENTS_COMPONENT]`,
     consume one `ingredient`, reset `brewTime`/`brewTimeTotal` to 0. (Ingredient consumed
     once; the same bottle may continue brewing only after a new ingredient is supplied.)
- Application failure (should not happen for the default table, but defensive): if
  `createPotionContents` throws, the tick treats the brew as paused (no consumption, no
  write) and leaves timers; this keeps `tickBrewing` non-throwing for valid inputs.

## Detailed behavior

- `createDefaultBrewingContext()` builds a deterministic recipe table:

  | bottle.base            | ingredient                    | output |
  |------------------------|-------------------------------|--------|
  | `minecraft:potion/water` | `minecraft:item/nether_wart` | base `minecraft:potion/awkward`, effects `[]` |
  | `minecraft:potion/awkward` | `minecraft:item/redstone`  | effects `[speed 1 x 480]` (extended) |
  | `minecraft:potion/awkward` | `minecraft:item/glowstone` | effects `[speed 1 x 120, amplifier 2]` (strong) |
  | `minecraft:potion/awkward` | `minecraft:item/fermented_spider_eye` | base `minecraft:potion/mundane`, effects `[]` |
  | `minecraft:potion/awkward` | `minecraft:item/speed_reagent` | effects `[speed 1 x 180]` |
  | `minecraft:potion/awkward` | `minecraft:item/strength_reagent` | effects `[strength 1 x 180]` |
  | `minecraft:potion/awkward` | `minecraft:item/healing_reagent` | effects `[healing 0 x 1]` (instant) |

  `fuelBurnTicks('minecraft:item/blaze_powder') = 1200`; `brewTicks() = 400`. Unknown
  pairs return null. The table is seed-independent and fully enumerable.

- `readBottleContents(slot)`: if `slot.item === null` or `slot.components` lacks a valid
  `potion_contents` (per `potionContentsComponentType.validate`), return null.

## Failure modes

- Missing/invalid bottle potion → `canBrew` false → paused; fuel still burns down.
- Missing ingredient or no matching recipe → paused.
- Corrupt `bottle.components.potion_contents` → treated as no valid potion (safe pause),
  never throws mid-tick.
- `validateBrewingState` rejects malformed slots/timers on deserialize.

## Compatibility / migration

- `MenuSlot.components` optional; no existing call site changes. Furnace/chest code
  unaffected. 122/109 contracts unchanged.

## Performance / resource constraints

- `tickBrewing` is O(ticks); each `tickOnce` is O(1) with no allocation beyond the new
  state object. No IO/registry mutation.

## Testing seams

- `BrewingRecipes` (match table, fuel, brewTicks) and `tickBrewing` are pure and
  trivially unit-testable with a hand-built `BrewingContext`.
- Serialization round-trip via `serializeBrewingState` / `deserializeBrewingState`.

## Observability / debugging

- `brewingIsLit(state)`, `brewingBrewProgress(state)`, `brewingFuelFraction(state)`
  expose progress for any future UI; they validate then compute a fraction.

## Affected files / symbols

- NEW `src/inventory/BrewingRecipes.ts`: `BrewingContext`, `BrewingRecipeOutput`,
  `createDefaultBrewingContext`, starter table, `BREWING_STAND_TYPE_KEY`/`BREWING_SLOT_*`
  constants.
- NEW `src/world/BrewingStandBlockEntity.ts`: `BrewingState`, `validateBrewingState`,
  `createBrewingState`, `tickBrewing`, `serialize/deserialize`, block-entity helpers,
  progress helpers.
- EDIT `src/inventory/MenuTransaction.ts`: `MenuSlot` gains optional `components?`.

## Rejected alternatives

- Three-bottle array slot (vanilla): more faithful but larger surface; this change scopes
  to a single bottle slot to keep the engine minimal and verifiable. The slot model is
  additive later.
- Storing `PotionContents` as a flat BrewingState field instead of via the 122 component:
  would duplicate the 122 contract and break the "bottle is an item stack" model. Reusing
  the component keeps one source of truth.

## Downstream dependencies

- Block placement + `Game` tick wiring (places the stand, calls `tickBrewing` each tick).
- Menu UI for the stand (three slots + progress).
- A broader recipe catalog (additive data in `createDefaultBrewingContext`).
