# Verification: 172-minecart-physics

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 minecartOnRails | `tests/unit/MinecartPhysics.test.ts` › `minecartOnRails` (on rail true, off false) | PASS |
| REQ-2 straights | › `straight rails` (north_south z-slide, east_west x-slide, rail height) | PASS |
| REQ-3 ascents | › `ascending rails` (8 table cases: up/down × 4 directions) | PASS |
| REQ-4 corners | › `corner rails` (8 turn cases + diagonal-arrival stop) | PASS |
| REQ-5 speed clamp | › `speed clamping` (2 → 0.4, cross axis zeroed) | PASS |
| REQ-6 off-rail physics | › `off-rail physics` (gravity −0.04, decay ×0.98) | PASS |
| REQ-7 collisions | › `collisions` (wall stop at pre-wall position; landing stop) | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/MinecartPhysics.test.ts` | PASS | 24 tests passed |
| `npm test` | PASS | **2360 passed (2360/2360)** — prior 2336 + 24 new, zero registry changes |
| `npm run build` | PASS | `tsc --noEmit && vite build` — 103 modules |
| `npm run test:e2e` | PASS | **22 passed (22/22)** headless Chromium |

## Edge/adversarial validation
- All eight ascent cases (rising and falling) and all eight corner turns are pinned by table-driven
  tests with hand-computed expected velocities.
- The diagonal-arrival corner stop and the exact-zero pure-axis requirement are pinned by a
  dedicated test.
- Collision semantics are pinned by tests positioned one tick from the blocking cell (wall stop) and
  one cell above solid ground (landing).

## Migration/compatibility validation
- Zero registry changes (pure core, like 169); no `Game.ts` edit; no schema/save-format change.

## Performance/resource validation
- `tickMinecart` is O(1); no hot-path or stored-data change.

## Regressions
- Full unit suite 2336/2336; full e2e 22/22. No characterization tests changed.

## Incomplete tasks
- None. All 24 task items complete.

## Advancement Exception
Not applicable — completion is 100%, mandatory requirements pass, and required tests pass.

## Final decision
VERIFIED.
