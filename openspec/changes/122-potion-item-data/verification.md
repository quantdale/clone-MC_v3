# Verification: 122-potion-item-data

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Potion contents component registered + validated by StackComponentMap | `tests/unit/PotionItemData.test.ts` "is registered", "round-trips", "StackComponentMap rejects a malformed potion value" | PASS |
| `createPotionContents` validates + clamps amplifier | "floors a fractional amplifier", "floors a non-integer amplifier" | PASS |
| At least one effect required (no empty potion) | "rejects an empty effects list" | PASS |
| Unique typeId per PotionContents | "rejects a duplicate effect typeId" | PASS |
| Invalid input (bad kind/duration/amplifier/duplicate) rejected | "rejects an unknown kind", "rejects a negative duration", "rejects a non-string base" | PASS |
| `getEffectiveEffects` returns customEffects | "getEffectiveEffects returns the custom effects in order" | PASS |
| `buildConsumePayload` returns effects | "buildConsumePayload carries the effects" | PASS |
| `buildSplashPayload` radius 4.0 for SPLASH/LINGERING, 0 for NORMAL | "uses the splash radius for SPLASH", "yields radius 0 for NORMAL", "yields the splash radius for LINGERING too" | PASS |
| Payload primitives pure/deterministic | no randomness/registry IO in `PotionItemData.ts`; tests assert fixed outputs | PASS |
| 119/121 contracts unchanged (regression) | "the component registry still contains exactly the base types plus potion", full suite green | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1545/1545 (prior 1522 + 23 new: `PotionItemData.test.ts`) |
| `npm run build` | PASS | `tsc --noEmit && vite build` (68 modules) |
| `npm run test:e2e` | PASS | 21/21 e2e green |

## Edge / adversarial validation

- `createPotionContents` with empty `customEffects` throws.
- Negative `duration` (`-5`) and non-string `base` throw.
- Duplicate `typeId` throws.
- Fractional `amplifier` (`1.5`, `2.9`) is floored, not rejected.
- `StackComponentMap.with(POTION_CONTENTS_COMPONENT, malformed)` is rejected by
  validate, leaving the prior map intact.
- `buildSplashPayload` on `NORMAL` yields radius `0`.

## Migration / compatibility validation

- `createDefaultStackComponentRegistry` gains one additive type (now 3). No existing
  component, item, or persisted-schema field modified; 119 and 121 suites stay green.

## Performance / resource validation

- `createPotionContents`/payload builders are O(effects); no registry/IO; no randomness.

## Regressions

- `StackDataComponents.test.ts` and `StatusEffectManager.test.ts` remain green.

## Incomplete tasks

- None. 6/6 task groups complete; 5/5 baseline gates green.

## Advancement Exception

Not applicable — 100% completion, all gates green, no MUST/SHALL unmet.

## Final decision

VERIFIED. 122-potion-item-data is production-ready and may advance to 123-brewing-stand.
