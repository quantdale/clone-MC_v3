# Proposal: 124-food-component-runtime

## Problem
Eating is hard-coded in `src/engine/Game.ts` to a single apple with fixed nutrition
(`this.survival.eat({ hunger: 4, saturation: 2 })`). Food hunger/saturation and any
status effects a food grants are not read from item data, so every new food or
effect-bearing food (e.g. golden apple) would require editing engine code.

## Goals
- Resolve food hunger/saturation/effects from the item registry definition.
- Apply food-borne status effects through the change-121 `StatusEffectManager`.
- Remove the hard-coded apple/nutrition path in the engine.

## Non-goals
- **Potion drinking UI / consume flow.** No potion item type exists yet; the
  `potion_contents` payload primitives from change 122 (`buildConsumePayload`) remain
  available and the new `applyConsumeEffects` helper is reusable by that later path.
- **Persisting active status effects across save/reload.** Status effects are transient
  per session in this change; survival hunger/saturation already persist via the
  survival snapshot. Effect persistence is a later, separate change.
- **New food item types or atlas art.** Only the data capability (effects on food) is added.

## Preconditions
- Change 121 (`status-effect-runtime`) VERIFIED + published: `StatusEffectManager`,
  `createDefaultStatusEffectRegistry`, `createDefaultAttributeRegistry` exist.
- Change 122 (`potion-item-data`) VERIFIED + published: `PotionEffectData` /
  `PotionContents` shape and `minecraft:effect/<key>` typeId convention.
- `ItemTypeDefinition` already carries `isFood`, `foodHunger`, `foodSaturation`.

## Proposed change
- Add `foodEffects?: readonly FoodEffectData[]` to `ItemTypeDefinition`
  (`src/inventory/ItemRegistry.ts`).
- New module `src/player/FoodComponentRuntime.ts` exporting `resolveFoodConsume(def)`
  and `applyConsumeEffects(manager, effects)`.
- `Game` owns a per-player `StatusEffectManager`, ticks it each frame, and the eat path
  reads nutrition from the selected food's definition, consumes one selected item on a
  successful eat, and applies the item's `foodEffects`.

## Compatibility and migration
- `foodEffects` is optional; existing registry definitions and saves are unaffected.
- No snapshot/serialization format changes (survival snapshot already covers
  hunger/saturation).

## Risks
- Eating a food whose `typeId` is unregistered or malformed must not abort the consume
  or throw out of the frame loop.

## Rollback strategy
- Single implementation commit; revert removes the field, the module, and the Game wiring.

## Definition of Done
- Hunger/saturation are read from item data; effect-bearing foods apply effects via
  `StatusEffectManager`; the full gate (typecheck/lint/test/build/e2e) is green; unit
  tests cover resolve (food/non-food/defaults), apply (registered + defensive skip),
  and the engine eat path.

## Advancement gate
- 100% task completion; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e` all green; no failed MUST/SHALL requirement.
