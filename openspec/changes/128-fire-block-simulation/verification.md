# Verification: 128-fire-block-simulation

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 fire block id 36, non-solid, 16-age-state | `tests/unit/FireBehavior.test.ts` ("fire block definition" describe block); `tests/unit/BlockStateRegistry.test.ts` ("... fire enumerates 16 (125/126/128)") | PASS |
| REQ-2 isFlammable = {Wood, Leaves, Planks} only | `tests/unit/FireBehavior.test.ts` ("isFlammable" over the full default catalog) | PASS |
| REQ-3 ignite places fire only on ignitable cells | `tests/unit/FireBehavior.test.ts` ("canIgnite / ignite": valid / non-air / unsupported) | PASS |
| REQ-4 age sequence + burn support at end of life | `tests/unit/FireBehavior.test.ts` ("ages a fresh fire..." / "never lets age exceed MAX_FIRE_AGE") | PASS |
| REQ-5 extinguish when unsupported or water-adjacent | `tests/unit/FireBehavior.test.ts` ("extinguishes an unsupported fire..." / "extinguishes a water-adjacent fire...") | PASS |
| REQ-6 bounded spread, ignitable-only, roll-controlled | `tests/unit/FireBehavior.test.ts` ("spreadFire" describe: bounded + roll-controlled; "onRandomTick" spread/no-spread-on-death cases) | PASS |
| REQ-7 deterministic + safe on non-fire/state-less/throwing | `tests/unit/FireBehavior.test.ts` ("is safe on a non-fire cell" / "is safe when the state read throws" / "is safe on a minimal state-less access"); `spreadRoll` purity test | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1674/1674 (prior 1654 + 20 new `FireBehavior.test.ts`) |
| `npm run build` | PASS | `tsc --noEmit && vite build`, 83 modules |
| `npm run test:e2e` | PASS | 21/21 Playwright, headless Chromium |

## Edge/adversarial validation
- Ignite on a non-air cell and on air-over-non-flammable-support both return `false` and write
  nothing (`tests/unit/FireBehavior.test.ts` "canIgnite / ignite").
- `onRandomTick` on a non-fire cell (Stone) is a no-op with zero writes.
- `onRandomTick` with a `getBlockState` that throws is caught and skipped (no write, no throw).
- `onRandomTick` on a minimal `BlockWorldAccess` implementing only `getBlockId`/`setBlockId`
  (state-less) neither throws nor performs any state write; extinguish path (`setBlockId`) still
  functions because it doesn't require state capability.
- A fire that dies this tick (`age = MAX_FIRE_AGE` going in) does not spread — verified directly.
- `spreadFire` bounded at `MAX_SPREAD_PER_TICK = 2` even with a roll that would ignite every
  candidate (`() => 0`); the non-ignitable (Stone-supported) neighbor is never ignited regardless of
  roll.
- `spreadRoll` is a pure function of its inputs (same inputs → same output; different `index` →
  different output in the tested case) and stays in `[0, 1)`.

## Migration/compatibility validation
- Additive only: `BlockId.Fire = 36` does not renumber any existing id. `BlockStateRegistry.test.ts`,
  `BlockItemSeparation.test.ts`, `BlockRegistry.test.ts`, and `BlockPropertySchema.test.ts` all
  updated and green — no other consumer of `blockRegistry.all()` length or the legacy-id table broke.
- No `WorldEditSnapshot` / save-schema field added; fire state lives only in the existing in-memory
  block-state overlay (125/126 pattern), consistent with the proposal's non-goal.
- `BlockBehaviorContext.seed?` is additive/optional; no existing call site (crop/farmland tests,
  `BlockBehavior.test.ts`) required a change and none broke.

## Performance/resource validation
- `onRandomTick` bounds confirmed by test: ≤ 6 water-adjacency reads, ≤ 6 spread-candidate reads
  (`orthogonalNeighbors`), one state read, one optional state write, ≤ 6 `hash32` rolls via
  `spreadRoll`; spread never exceeds `MAX_SPREAD_PER_TICK = 2` ignitions per tick regardless of roll
  or candidate count (tested with all-igniting rolls).
- Fire's 16 states are well under `MAX_STATES_PER_BLOCK`; total registry size (25 blocks) confirmed
  via `BlockRegistry.test.ts` and `BlockStateRegistry.test.ts`.

## Regressions
- Full unit suite green (1674/1674, no prior test weakened — `BlockRegistry`/`BlockPropertySchema`/
  `BlockItemSeparation`/`BlockStateRegistry` updated to reflect the additive block, not loosened).
- Full e2e suite green (21/21) — fire's random-tick registration does not affect any existing
  interaction/movement/rendering flow since fire never spawns in current terrain/worldgen or crafting
  paths.

## Incomplete tasks
None. All 8 tasks (1.1-8.1) complete with evidence.

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. All MUST/SHALL requirements have passing scenario evidence; the full baseline gate
(typecheck, lint, unit, build, e2e) is green; no regression, migration, or determinism risk is open.
Advance to 129.
