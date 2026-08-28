# Tasks: 124-food-component-runtime

- [ ] **1.1** Add `FoodEffectData` interface (`{ typeId; duration; amplifier }`) and
      `foodEffects?: readonly FoodEffectData[]` to `ItemTypeDefinition` in
      `src/inventory/ItemRegistry.ts`. No behavior change yet.

- [ ] **1.2** Create `src/player/FoodComponentRuntime.ts` with `resolveFoodConsume(def)`
      (returns `null` for non-food; reads `foodHunger`/`foodSaturation`/`foodEffects`,
      clamps to `>= 0`, defaults missing to `0`, filters malformed effect rows) and
      `applyConsumeEffects(manager, effects)` (parses `typeId` via `tryParseResourceId`,
      calls `manager.add`, skips unregistered/malformed without throwing).

- [ ] **2.1** Write characterization tests for `resolveFoodConsume`: non-food returns
      `null`; food with no `foodHunger`/`foodSaturation` yields `0/0` and empty effects;
      explicit values are returned; malformed `foodEffects` rows (bad `typeId`, negative
      values) are dropped.

- [ ] **2.2** Write tests for `applyConsumeEffects`: a registered `minecraft:effect/speed`
      is added to the manager with the given duration/amplifier; an unregistered `typeId`
      is skipped and the registered ones still apply; a non-parseable `typeId` is skipped;
      empty list is a no-op.

- [ ] **3.1** Wire `Game`: add `playerEffects = new StatusEffectManager(
      createDefaultStatusEffectRegistry(), createDefaultAttributeRegistry())`; import the
      runtime helpers; tick `playerEffects.tick(dt)` in the survival update block.

- [ ] **3.2** Replace the hard-coded apple eat branch with a `tryEatSelected()` that reads
      the selected stack's `ItemTypeDefinition`, resolves nutrition from the definition,
      calls `survival.eat`, and on success `consumeSelected()` + `applyConsumeEffects`.
      When hunger is full (`eat` returns `false`), no item is consumed and no effects apply.

- [ ] **3.3** On `respawnPlayer()` clear `playerEffects` so effects do not survive death.

- [ ] **4.1** Run the full regression gate: `npm run typecheck`, `npm run lint`,
      `npm test`, `npm run build`, `npm run test:e2e`. Fix any failure.

- [ ] **5.1** Update `verification.md` with real evidence; reconcile every artifact against
      the final implementation; mark `VERIFIED` only when 100% of tasks pass.
