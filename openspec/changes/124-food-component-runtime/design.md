# Design: 124-food-component-runtime

## Context / current state
- `SurvivalSystem.eat({ hunger, saturation })` is the primitive that adds hunger/saturation
  with clamp-to-20 and returns `false` when `hunger >= 20` (already full). It owns no
  status effects.
- `Game.ts` (line ~412) eats only when `getItemCount(ItemId.Apple) > 0` and passes the
  literals `{ hunger: 4, saturation: 2 }`. The selected item is otherwise ignored.
- `StatusEffectManager` (121) exists but is not wired to the player. `add(typeId,
  duration?, amplifier?)` throws for an unregistered `typeId` (resolves strictly through
  `StatusEffectTypeRegistry.get`).
- `ItemTypeDefinition` has `isFood`, `foodHunger`, `foodSaturation` but no effect field.

## Target state
- An item definition MAY declare `foodEffects` (a list of `{ typeId, duration, amplifier }`,
  the same shape as a potion effect row).
- A pure runtime module resolves a food's nutrition + effects and applies effects to a
  `StatusEffectManager`.
- `Game` holds a `StatusEffectManager` for the player, ticks it each frame, and the eat
  path resolves nutrition from the selected food, consumes one selected item on success,
  and applies `foodEffects`.

## Invariants
- `resolveFoodConsume(def)` returns `null` when `!def.isFood`; otherwise non-null.
- Resolved hunger/saturation are clamped to `>= 0`; missing values default to `0`.
- `applyConsumeEffects` never throws: an unparseable or unregistered `typeId` is skipped.
- A successful eat (hunger < 20) is the only state in which an item is consumed and
  effects are applied; a full bar yields no consume and no effects.

## API and data model
```ts
// src/player/FoodComponentRuntime.ts
export interface ConsumeEffects {
  readonly hunger: number;
  readonly saturation: number;
  readonly effects: readonly PotionEffectData[];
}
export function resolveFoodConsume(def: ItemTypeDefinition): ConsumeEffects | null;
export function applyConsumeEffects(
  manager: StatusEffectManager,
  effects: readonly PotionEffectData[],
): void;
```
- `ItemTypeDefinition.foodEffects?: readonly FoodEffectData[]` where `FoodEffectData`
  (in `ItemRegistry.ts`) is `{ typeId: string; duration: number; amplifier: number }`
  — structurally identical to `PotionEffectData`, so it is passed through unchanged.

## Control / data flow
1. Each frame, `Game.update` calls `survival.update(...)` then `playerEffects.tick(dt)`.
2. On a non-blocking eat input, `Game` reads `inventory.getSelectedStack()`; if its
   definition `isFood`, `resolveFoodConsume(def)` produces `{ hunger, saturation, effects }`.
3. `survival.eat({ hunger, saturation })` is attempted. On `false` (full), the path stops.
4. On `true`, `inventory.consumeSelected()` removes one, audio + toast fire, and
   `applyConsumeEffects(playerEffects, effects)` adds any food effects.

## Detailed behavior
- `resolveFoodConsume` filters `foodEffects` to keep only structurally valid rows
  (`typeId` non-empty string, `duration >= 0`, `amplifier >= 0`); malformed rows are
  dropped (defensive, mirrors 122's component validation).
- `applyConsumeEffects` parses each `typeId` with `tryParseResourceId`; on a valid
  `ResourceId` it calls `manager.add(typeId, duration, amplifier)` inside a try/catch so
  an unregistered type is skipped rather than aborting the consume.

## Failure modes
- Non-food selected: no eat, no consume, no effects.
- Full hunger bar: `eat` returns `false`, no consume/effects.
- Unregistered/ malformed `typeId`: skipped, no throw.
- `StatusEffectManager.add` clamps `duration`/`amplifier` (> 0); negative inputs are
  normalized by the manager.

## Compatibility / migration
- Optional field; no snapshot change. Survival hunger/saturation still persist.

## Performance / resource constraints
- Per-frame cost is one `tick(dt)` over the active-effect map (empty in the common case);
  eat resolution is O(1) over a small effect list. No allocation in the hot path beyond
  the per-effect list returned by `resolveFoodConsume` (small, only on eat).

## Testing seams
- `FoodComponentRuntime` is pure and unit-testable without a DOM: `resolveFoodConsume`
  over a synthetic `ItemTypeDefinition`; `applyConsumeEffects` against a `StatusEffectManager`
  built from `createDefaultStatusEffectRegistry`/`createDefaultAttributeRegistry`.
- `Game` eat path is covered indirectly via existing e2e + a focused unit test on the
  runtime; no new DOM harness required.

## Observability / debugging
- Eat still emits `audio.play('eat')` and a toast; effects are observable through
  `StatusEffectManager.getAll()`.

## Affected files / symbols
- `src/inventory/ItemRegistry.ts` — add `FoodEffectData`, `foodEffects` field.
- `src/player/FoodComponentRuntime.ts` (NEW).
- `src/engine/Game.ts` — add `playerEffects`, tick, rewrite eat branch.

## Rejected alternatives
- **Put `StatusEffectManager` inside `SurvivalSystem`:** changes its constructor/snapshot
  contract and regresses existing `SurvivalSystem` tests; a separate per-player manager in
  `Game` is lower-risk.
- **Persist active effects now:** needs a survival-snapshot version bump + migration; out
  of scope and not required by the narrow outcome.

## Downstream dependencies
- A later potion-drinking change reuses `applyConsumeEffects` with `buildConsumePayload`
  effects. A later change may persist `StatusEffectManager.serialize()` into the survival
  snapshot.
