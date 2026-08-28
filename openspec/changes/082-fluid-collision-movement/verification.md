# Verification: 082-fluid-collision-movement

Status: VERIFIED
Completion: 100%
Advancement allowed: true

082 started only after 081 was VERIFIED (dc97885 / 024c6a8).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Drag factor | density 1 → 0.8, density 2 → 0.5; clamps (5 → 0, 0.2 → 1); 0/-1/NaN/Infinity rejected with `/density/i` | PASS |
| Drag application | (1,1,1) @ water, 1 tick → (0.8, 0.8, 0.8); compounding: (1,0,0) @ 2 ticks → 0.64; tickDelta 0 identity with input untouched; negative/NaN tickDelta rejected | PASS |
| Buoyancy | equal densities → 0 (neutral); lava (2) vs entity 1 with g=32 → 16 (upward); entity denser → 0 | PASS |
| Eye fluid | point inside water → water id; point in air → null | PASS |
| Fluid height | stacked water at y=4,5 → top 6; empty column → minY; falling water at y=3 → top 4 | PASS |
| Submersion | AABB [2,6) with water top 4 → 0.5 (immersion report `{fluidTop: 4, submergedFraction: 0.5, fullySubmerged: false}`); above fluid → 0; water top 6 → 1 + fully submerged; oversubmersion clamps to 1 | PASS |
| Determinism | repeated calls return equal results | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/FluidMovement.test.ts` | PASS | 19/19 |
| `npm test` | PASS | 94 files, 935/935 (916 baseline + 19 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.25s |
| `npm run test:e2e` | PASS | 19/19 (1.5m) |

## Edge / adversarial validation

- Drag factor validated at both clamp boundaries and with invalid densities.
- Drag compounding uses fractional-capable `factor ^ tickDelta`; identity case asserts input immutability.
- Buoyancy covers neutral, upward (denser fluid), and none (denser entity).
- Height scan covers stacked, empty, and falling-water columns.
- Submersion covers none/partial/full plus oversubmersion clamping, with the full `immersion` report asserted.

## Migration / compatibility validation

Additive: new `src/simulation/FluidMovement.ts` + test file. 056 `Aabb` and 076 `FluidState` reused unchanged; no existing modules touched.

## Performance / resource validation

Height scan O(window height); all other helpers O(1). Unit suite duration unchanged (~7.2s, 94 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 935/935 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 082 fluid immersion, movement drag, buoyancy, and eye-fluid state derived from fluid data are in place. Advance to 083-fluid-surface-meshing.
