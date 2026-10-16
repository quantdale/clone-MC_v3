# Verification: 106-container-menu-transaction-core

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| Define `MenuSlot {item, count, maxStack}` with maxStack in [1,64]; construction rejects out-of-range maxStack and count | `tests/unit/MenuTransaction.test.ts` (construction matrix; reject maxStack 0/65/negative, count <1, count > maxStack) | PASS |
| Define `MenuCursor {item, count}` with count in [0,64]; cursor may be empty | construction tests (empty cursor, count 64 accepted, count 65/negative rejected) | PASS |
| `ContainerMenu` has 1+ slots, `playerSlotStart` in (0, len), optional cursor | construction matrix (`playerSlotStart` 0/len/negative/out-of-range rejected; 1-slot menu accepted) | PASS |
| leftClick: pick-up from empty cursor; merge same-item stack (respects maxStack); swap when item differs or stack full | leftClick test vectors | PASS |
| rightClick: same-item split-half pick-up (ceil(count/2) into cursor); otherwise place-one onto empty or mergeable non-full slot | rightClick test vectors (including full same-item slot -> split, mismatched full slot -> no-op) | PASS |
| placeOne: place exactly 1 from cursor onto empty or mergeable non-full slot | placeOne test vectors | PASS |
| quickMove: move whole stack to other region, first-fit merge then first empty slot, remainder stays in source | quickMove test vectors (player->container and container->player) | PASS |
| Out-of-bounds indices throw | `applyMenuTransaction` with invalid slot indices throws | PASS |
| Immutability: applying a transaction never mutates input slots/cursor | post-transaction inputs unchanged assertions | PASS |
| Determinism: same state + same transaction -> identical result | repeated-application determinism test | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | no errors |
| `npm run lint` | PASS | no warnings/errors |
| `npx vitest run tests/unit/MenuTransaction.test.ts` | PASS | 20/20 tests |
| `npm test` (run 1) | PASS | 1192/1192 tests (119 files) |
| `npm test` (run 2) | PASS | 1192/1192 tests (stable) |
| `npm run build` | PASS | production build ok (dist) |
| `npm run test:e2e` | PASS | 19/19 tests |

## Edge / adversarial validation
- maxStack bound [1,64] enforced at slot construction; count bound [1,maxStack] for slots and [0,64] for cursor.
- Empty-cursor pick-up, full-stack merge overflow, split-half rounding (odd counts -> ceil), quickMove partial fill with remainder, single-slot menu, no-op mismatched-slot rightClick.
- All transaction variants covered with explicit expected-result vectors; inputs verified unchanged after apply (immutability).

## Migration / compatibility validation
No migration impact: new standalone module `src/inventory/MenuTransaction.ts`, no changes to existing systems.

## Performance / resource validation
Pure functions, O(1)/O(slots) operations, no allocations beyond result objects. No hot-path impact.

## Regressions
Full unit suite 1192/1192 twice, E2E 19/19, build clean. No regressions.

## Incomplete tasks
None. All 4 tasks complete.

## Advancement Exception
Not applicable (100%).

## Final decision
VERIFIED. Advancement to 107-chest-block-entity per `CHANGE_SEQUENCE.md` (verified: next entry after 106 is 107-chest-block-entity "Single chest block entity with one inventory of 27 slots"). All MUST/SHALL requirements of the spec are implemented and evidenced.
