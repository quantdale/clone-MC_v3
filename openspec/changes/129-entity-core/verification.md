# Verification: 129-entity-core

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 spawn creates a valid active entity | `tests/unit/EntityManager.test.ts` ("EntityManager.spawn" describe block) | PASS |
| REQ-2 explicit id collision rejected | `tests/unit/EntityManager.test.ts` ("rejects a colliding explicit id against an active/removed entity") | PASS |
| REQ-3 query surfaces reflect only active entities | `tests/unit/EntityManager.test.ts` ("EntityManager query surfaces") | PASS |
| REQ-4 mutators safe no-ops / reject invalid data | `tests/unit/EntityManager.test.ts` ("EntityManager mutators") | PASS |
| REQ-5 remove is idempotent | `tests/unit/EntityManager.test.ts` ("EntityManager.remove") | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1694/1694 (prior 1674 + 20 new `EntityManager.test.ts`) |
| `npm run build` | PASS | `tsc --noEmit && vite build`, 83 modules (unchanged — new modules have no consumer yet, so they are not bundled, as expected for an additive/unconsumed core) |
| `npm run test:e2e` | PASS | 21/21 Playwright, headless Chromium |

## Edge/adversarial validation
- Spawn atomically rejects: unregistered type, non-finite transform field, non-finite velocity
  field, and a colliding explicit id against both an `ACTIVE` and a retained `REMOVED` record — each
  verified to leave `size`/`getAll()`/the original record untouched.
- `get`/`setTransform`/`setVelocity`/`changeDimension`/`remove` never throw; each verified to return
  `undefined`/`false` for an unknown id, a removed id, and (for the two setters) a non-finite field
  on an otherwise-valid active id, with no partial write in any case.
- Defensive copying verified directly: mutating the caller's transform/velocity object after `spawn`
  does not affect the stored instance.
- `getInDimension` verified to compare by resource-id string value, not object reference (two
  distinct `ResourceId` instances that stringify identically are treated as the same dimension).
- `remove` idempotency verified: a second call on the same id returns `false` and `state` stays
  `'REMOVED'` (never toggles back to `'ACTIVE'`).

## Migration/compatibility validation
- Purely additive: `src/world/Entity.ts` and `src/simulation/EntityManager.ts` are new files with no
  edits to any existing module. `Game.ts`, `ItemEntityManager`, `XpOrbManager`, the 017
  `EntityRegistry`, and the 037 `SerializedEntity` envelope are unmodified — confirmed by `git diff`
  touching only the two new source files, the new test file, and the OpenSpec change directory.
- No schema/save-format change; no migration needed.

## Performance/resource validation
- `spawn`/`get`/`setTransform`/`setVelocity`/`changeDimension` are O(1) `Map` operations (plus an
  array push on spawn); `getAll`/`getInDimension` are O(n) over ever-spawned entities; `remove` is
  O(n) for its `indexOf`/`splice` — all matching the existing `ItemEntityManager` cost model, with no
  per-tick cost since 129 adds no tick/update loop.
- `clear()` verified to reset the id map, insertion-order list, and id counter (a subsequent spawn
  mints id `0` again).

## Regressions
- Full unit suite green (1694/1694); no existing test file was touched, so no prior behavior could
  regress.
- Full e2e suite green (21/21) — nothing in `Game`/rendering/interaction consumes the new modules.

## Incomplete tasks
None. All 6 tasks (1.1-6.1) complete with evidence.

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. All MUST/SHALL requirements have passing scenario evidence; the full baseline gate
(typecheck, lint, unit, build, e2e) is green; no regression, migration, or determinism risk is open.
Advance to 130.
