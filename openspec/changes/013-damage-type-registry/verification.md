# Verification: 013-damage-type-registry

Status: **VERIFIED**

Advancement allowed: **true**

013 makes environmental damage data-driven via a `DamageTypeRegistry` while
reproducing the current fall/drown/lava/starvation semantics exactly. `SurvivalSystem`
now accepts an optional registry and routes through it; the default reproduces prior
literals, so all existing call sites and observable behavior are unchanged.

## Requirement evidence

| Requirement | Evidence |
|---|---|
| Damage-type definition model (ResourceId id, key, name, flags, kind, params) | `DamageTypeDefinition` interface (`src/data/DamageType.ts:39-54`) |
| `DamageTypeFlag` set + `DamageTypeKind` | `'BYPASS_ARMOR'\|'FIRE'\|'DROWNING'\|'FALL'\|'STARVATION'\|'ENVIRONMENTAL'`, `'fall'\|'periodic'\|'starvation'` (`src/data/DamageType.ts:18-30`) |
| Registry on 003 generic `Registry` with validation + finalize | `DamageTypeRegistry` (`src/data/DamageType.ts:163-225`) validates every definition and finalizes |
| Finite non-negative params, kind-required fields, known flags, unique ids validated | `validate()` rejects non-finite/negative amount, non-positive interval, unknown flag, fall missing scaling, duplicate id (`src/data/DamageType.ts:108-145`) |
| Default registry with fall/drowning/lava/starvation | `createDefaultDamageTypeRegistry()` — fall(3/1.5), drowning(2/1.5s), lava(4/0.7s), starvation(1) (`src/data/DamageType.ts:251-294`) |
| `SurvivalSystem` accepts optional registry, resolves four default types | constructor takes `registry = createDefaultDamageTypeRegistry()` and resolves via `requireDamageType` (fail-fast) (`src/player/SurvivalSystem.ts`) |
| Fall routed through fall type (threshold/scaling) | `update()` uses `fallType.fallThreshold!`/`fallScaling!` (`src/player/SurvivalSystem.ts`) |
| Drowning/lava routed through periodic types (interval/amount) | `update()` uses `drowningType.interval!`/`amount` and `lavaType.interval!`/`amount` |
| Starvation routed through starvation type amount | `update()` uses `starvationType.amount` |
| Fail-fast on missing required default key | `requireDamageType` throws `INVALID_DEFINITION` when key absent (`src/data/DamageType.ts:298-305`) |
| Current fall/drown/lava/starvation semantics preserved | existing `SurvivalSystem.test.ts` (6 tests) + new routing tests all pass with identical numbers |

## Tests

- `tests/unit/DamageType.test.ts` — 11 tests: default registry (size 4, finalize, keys), non-finite amount rejection, unknown flag rejection, fall-missing-scaling rejection, non-positive interval rejection, duplicate id rejection, default type data/flags, fail-fast on missing key, exact fall formula via registry (dist 6 -> 15), custom scaling via injected registry (dist 6 -> 12), preserved drowning/lava amounts (18/16).
- `tests/unit/SurvivalSystem.test.ts` — 6 existing tests still pin exact drow/lava/fall numbers (18/16/<20) and hunger/starvation behavior.

## Gate results

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 298/298 (11 new from 013)
- build: PASS (`tsc --noEmit && vite build`)
- e2e: PASS 19/19

No advancement exception used. Completion: 100%.

**014 is authorized to begin only now that 013 is VERIFIED.**
