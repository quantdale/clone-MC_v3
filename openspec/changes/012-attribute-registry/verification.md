# Verification: 012-attribute-registry

Status: **VERIFIED**

Advancement allowed: **true**

012 is a gameplay-free data model. It defines a deterministic attribute/modifier
model and registry only; no player, entity, equipment, or effect consumer is
migrated to it. Current gameplay constants and behavior are unchanged.

## Requirement evidence

| Requirement | Evidence |
|---|---|
| Registered attribute type (ResourceId, key, name, min/default/max) | `AttributeDefinition` interface; `AttributeRegistry` extends 003 `Registry<AttributeDefinition>` (`src/data/AttributeRegistry.ts:22-33`, `:86`) |
| Finite ordered ranges and defaults validated | `AttributeRegistry.validate` rejects non-finite or `min > default > max` bounds with `INVALID_RANGE` (`src/data/AttributeRegistry.ts:131-142`) |
| Instance base value (unclamped) | `AttributeInstance.base` retained as set; only effective value is clamped; `setBase` rejects non-finite (`src/data/AttributeRegistry.ts:194-201`) |
| Unique ResourceId modifier identity | modifiers keyed by `resourceIdToString(id)` in a `Map`; duplicate id throws `DUPLICATE_MODIFIER` atomically (`src/data/AttributeRegistry.ts:207-220`) |
| ADD_VALUE, ADD_BASE_FRACTION, MULTIPLY_TOTAL | three explicit operations; summed ADD_VALUE and ADD_BASE_FRACTION applied to original base; MULTIPLY_TOTAL applied per modifier (`src/data/AttributeRegistry.ts:251-275`) |
| Deterministic evaluation order | MULTIPLY_TOTAL sorted by `resourceIdToString(id)`; commutative stages order-independent (`src/data/AttributeRegistry.ts:270`) |
| Final range clamping | effective value clamped to `[min,max]` (`src/data/AttributeRegistry.ts:73-77`, `:274`) |
| Atomic rejection of invalid inputs | non-finite base/amount -> `INVALID_VALUE`; unknown operation -> `INVALID_OPERATION`; failed add preserves prior state (`src/data/AttributeRegistry.ts:194-220`) |
| Modifier removal/clear deterministic | `removeModifier` returns false when absent; `clearModifiers` no-ops when empty (`src/data/AttributeRegistry.ts:222-236`) |
| Optional cache invalidation | dirty-flag caching with invalidation on base/modifier change, verified by test (`src/data/AttributeRegistry.ts:156`, `:242-248`, `:110-116`) |
| Default generic attribute domains | `createDefaultAttributeRegistry` provides 6 attributes (max_health, movement_speed, attack_damage, armor, luck, attack_speed) (`src/data/AttributeRegistry.ts:285-294`) |
| Current gameplay unchanged in 012 | No edits to `Player`, `Entity`, `Game`, survival, or combat code; `src/data/AttributeRegistry.ts` is additive only |

## Tests

`tests/unit/AttributeRegistry.test.ts` — 17 unit tests, all passing:
- registry validation (ordered ranges, bad ranges, duplicate id)
- instance effective value (no modifiers, clamped base, ADD_VALUE, ADD_BASE_FRACTION, MULTIPLY_TOTAL, combined formula + insertion-order independence, deterministic multiply order, final clamp, cache recompute)
- mutation/error handling (duplicate modifier, non-finite base, non-finite amount, unknown operation, removal/clear, atomicity of failed add)
- default registry domains

## Gate results

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 287/287 (17 new from 012)
- build: PASS (`tsc --noEmit && vite build`)
- e2e: PASS 19/19

No advancement exception used. Completion: 100%.

**013 is authorized to begin only now that 012 is VERIFIED.**
