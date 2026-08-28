# Verification: 130-entity-collision-and-physics

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 free-fall gravity + terminal-velocity clamp | `tests/unit/EntityPhysics.test.ts` ("computeEntityPhysicsStep — free fall") | PASS |
| REQ-2 landing grounds and zeroes vy | `tests/unit/EntityPhysics.test.ts` ("computeEntityPhysicsStep — floor landing") | PASS |
| REQ-3 horizontal collision zeroes only that axis | `tests/unit/EntityPhysics.test.ts` ("computeEntityPhysicsStep — horizontal collision") | PASS |
| REQ-4 ceiling collision zeroes vy without grounding | `tests/unit/EntityPhysics.test.ts` ("computeEntityPhysicsStep — ceiling collision") | PASS |
| REQ-5 tickEntityPhysics no-ops / persists via manager | `tests/unit/EntityPhysics.test.ts` ("tickEntityPhysics") | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1702/1702 (prior 1694 + 8 new `EntityPhysics.test.ts`) |
| `npm run build` | PASS | `tsc --noEmit && vite build`, 83 modules (unchanged — no consumer yet) |
| `npm run test:e2e` | PASS | 21/21 Playwright, headless Chromium |

## Edge/adversarial validation
- Purity verified directly: `computeEntityPhysicsStep`'s `transform`/`velocity`/`box` arguments are
  unchanged after the call (deep-equal to their pre-call snapshots).
- Terminal-velocity clamp verified from a `vy` already far beyond the limit: the result is exactly
  `-DEFAULT_TERMINAL_VELOCITY`, not a more negative value.
- Floor-landing test uses a `dt`/velocity combination whose unobstructed displacement would cross
  many blocks past the floor, confirming the swept-path clamp (not a lucky single-cell check) lands
  the box exactly on the top face.
- Horizontal-collision test confirms `vz` is untouched (still exactly its pre-collision value) while
  `vx` is zeroed and `onGround` stays `false`.
- Ceiling-collision test confirms an upward (`vy > 0`) collision zeroes `vy` without setting
  `onGround` (only a downward collision grounds).
- `tickEntityPhysics` verified to no-op (no manager mutation) for: an unknown id, a `REMOVED` id,
  `dt = 0`, and `dt = -1` — all four in one test, with a final assertion that the untouched active
  entity's transform/velocity are still the pre-call defaults.

## Migration/compatibility validation
- Purely additive: `src/simulation/EntityPhysics.ts` is a new file; `git diff` confirms zero edits to
  any existing module (`CollisionResolver`, `VoxelShape`, `EntityManager`, `Entity`, `PlayerPhysics`,
  `Game` all untouched). No schema/save-format change; no migration.

## Performance/resource validation
- Each `computeEntityPhysicsStep` call performs exactly one `CollisionResolver.move` call — no
  sub-stepping loop — confirmed by inspection of the implementation (no loop around the resolver
  call) and by the floor-landing test succeeding in a single call despite a large raw displacement
  (the resolver's own swept-path scan handles the distance, not repeated stepping here).

## Regressions
- Full unit suite green (1702/1702); no existing test file was touched, so no prior behavior could
  regress.
- Full e2e suite green (21/21) — nothing in `Game`/rendering/interaction consumes the new module.

## Incomplete tasks
None. All 5 tasks (1.1-5.1) complete with evidence.

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. All MUST/SHALL requirements have passing scenario evidence; the full baseline gate
(typecheck, lint, unit, build, e2e) is green; no regression, migration, or determinism risk is open.
Advance to 131.
