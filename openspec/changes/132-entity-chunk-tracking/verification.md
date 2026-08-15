# Verification: 132-entity-chunk-tracking

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 forgetChunk evicts regardless of lifecycle, frees ids | `tests/unit/EntityManager.test.ts` ("EntityManager.forgetChunk") | PASS |
| REQ-2 selectTickingEntities filters by predicate | `tests/unit/EntityChunkTracking.test.ts` ("selectTickingEntities") | PASS |
| REQ-3 deactivateChunk persists then forgets | `tests/unit/EntityChunkTracking.test.ts` ("deactivateChunk") | PASS |
| REQ-4 activateChunk matches deserializeChunk's contract | `tests/unit/EntityChunkTracking.test.ts` ("activateChunk") | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1724/1724 (prior 1713 + 3 `forgetChunk` + 8 `EntityChunkTracking.test.ts`) |
| `npm run build` | PASS | `tsc --noEmit && vite build`, 83 modules (unchanged — no consumer yet) |
| `npm run test:e2e` | PASS | 21/21 Playwright, headless Chromium |

## Edge/adversarial validation
- `forgetChunk` verified to evict both an `ACTIVE` and a retained `REMOVED` entity in the target
  chunk while leaving an entity in a different chunk fully intact (`get`/`getAll` both confirm).
- `forgetChunk` on an empty chunk verified to return `0` without side effects.
- The id-reuse contract verified directly: a `spawn` with the same explicit id that a `remove()`d
  entity would have rejected (per 129) succeeds after `forgetChunk` evicts it.
- `selectTickingEntities`'s purity (no mutation) and predicate-propagation (a throwing predicate is
  not swallowed) both verified directly.
- `deactivateChunk` verified to capture exactly the persistent entity's record (not the
  non-persistent one) while forgetting both, and to leave a different chunk's entity untouched.
- `activateChunk` verified to both succeed on a valid batch and to atomically reject (target manager
  stays at `size === 0`) an invalid batch, matching `deserializeChunk`'s own tested contract (131).
- A full `deactivateChunk` → `activateChunk` round trip on the *same* manager (not just a fresh one)
  verified exact `typeId`/`dimension`/`transform`/`velocity` preservation, confirming the two
  primitives compose correctly end-to-end.

## Migration/compatibility validation
- One additive `EntityManager` method (`forgetChunk`) plus one new file
  (`src/simulation/EntityChunkTracking.ts`); `git diff` confirms no edits to `ChunkTicketManager`,
  `RenderSimulationDistance`, `EntityRepository`, `DirtySaveQueue`, `RepositorySaveSink`, or `Game`.
  No schema/save-format change; no migration.

## Performance/resource validation
- `forgetChunk` is a single O(n) pass over the manager's stored entities (active + removed), matching
  the existing cost model of `getAll()`/`serializeChunk`. `selectTickingEntities` is O(n) over
  `ACTIVE` entities plus one predicate call each. `deactivateChunk` composes two existing O(n) passes.

## Regressions
- Full unit suite green (1724/1724); every pre-existing `EntityManager.test.ts` case (129/130/131)
  still passes unchanged alongside the new cases.
- Full e2e suite green (21/21) — nothing in `Game`/rendering/interaction consumes the new methods.

## Incomplete tasks
None. All 7 tasks (1.1-7.1) complete with evidence.

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. All MUST/SHALL requirements have passing scenario evidence; the full baseline gate
(typecheck, lint, unit, build, e2e) is green; no regression, migration, or determinism risk is open.
Advance to 133.
