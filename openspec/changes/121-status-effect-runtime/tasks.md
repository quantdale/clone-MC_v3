# Tasks: 121-status-effect-runtime

Status: PLANNED
Completion: 0%

## 1. Manager core + serialization

- [ ] **1.1** Create `src/data/StatusEffectManager.ts` exporting `EffectAttributeHook`
      and `StatusEffectManager`. The constructor takes an `StatusEffectTypeRegistry`
      and an `AttributeRegistry` (both already finalized), builds a per-entity
      `Map<ResourceId, AttributeInstance>` from the attribute registry, and stores a
      hook table (default `EFFECT_ATTRIBUTE_HOOKS` merged with optional caller
      overrides).
- [ ] **1.2** Implement `get(typeId)`, `getAll()` (deterministic order), `clear()`,
      `getAttribute(id)`, and `attributes()`.
- [ ] **1.3** Implement `serialize()` (map active instances through
      `instance.serialize()`) and `deserialize(data)` that validates every entry against
      the registry into a temporary list and only then clears and re-adds (atomic; a
      malformed entry throws before mutation). Unit test round-trip + atomic failure.

## 2. Add + duration/amplifier stacking

- [ ] **2.1** Implement `add(typeId, duration?, amplifier?)`: resolve the type (strict;
      unknown id throws), compute clamped incoming duration (to `maxDuration`) and
      amplifier (to `maxAmplifier`), and on re-application merge per the stacking rule
      (`amplifier = max`; if incoming amplifier is greater, refresh duration to incoming,
      else `duration = max(current, incoming)`), then clamp to `maxDuration`.
- [ ] **2.2** Unit test stacking: equal amplifier refreshes to the longer duration and
      keeps amplifier; stronger amplifier raises amplifier and refreshes duration;
      weaker amplifier leaves duration unchanged; amplifier clamped to `maxAmplifier`;
      duration clamped to `maxDuration`.

## 3. Attribute hooks

- [ ] **3.1** Implement hook apply/remove: on `add`, after storing, add a `Modifier`
      (`id = effectType.id`, `operation`, `amount = hook.amount(amplifier)`) to the
      target attribute instance; on `remove`/expiry, `removeModifier(effectType.id)`.
      On amplifier change, re-apply the hook so the attribute value reflects the new
      amplifier.
- [ ] **3.2** Unit test: adding `speed` raises `movement_speed.value` by the multiplier;
      `strength` raises `attack_damage` by the additive amount; `health_boost` raises
      `max_health`; removing the effect restores the base; re-applying with a higher
      amplifier updates the value; effects without a hook row leave attributes unchanged.

## 4. Ticking + INSTANT handling

- [ ] **4.1** Implement `tick(dt)`: ignore non-finite/negative `dt`; decrement every
      active instance; collect and remove (`remove`, which also removes the hook) every
      instance whose `expired` is now true; return the expired instances.
- [ ] **4.2** Unit test: a DURATION_BASED effect ticks to expiry and is removed + unhooked;
      `INSTANT` effects (duration 0) expire on the first `tick` and are returned in the
      expired list; bad `dt` is a no-op.

## 5. Unit tests (impl, edge, failure, regression)

- [ ] **5.1** Cover all requirement scenarios in `spec.md`: add/get/remove/clear,
      stacking, attribute hooks, ticking, INSTANT surfacing, serialize/deserialize
      round-trip + atomic failure, determinism, and regression against the existing
      012/014 registries (no behavior change there).

## 6. Full gate + verification + state advance

- [ ] **6.1** Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
      `npm run test:e2e`; all green.
- [ ] **6.2** Fill `verification.md` with real evidence; mark every task group done.
- [ ] **6.3** Advance `openspec/PROGRAM_STATE.json` / `.md` to 121 VERIFIED; set
      `nextChange` to `122` (per `CHANGE_SEQUENCE.md`).
- [ ] **6.4** Commit (impl + state bump) and push to `origin/main`; verify remote == local.
