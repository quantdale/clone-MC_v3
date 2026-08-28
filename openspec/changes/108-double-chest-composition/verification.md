# Verification: 108-double-chest-composition

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| `isHorizontalAdjacent` accepts exactly the four cardinal neighbours and rejects diagonal/vertical/same/distant | adjacency matrix tests (4 accepted, 4 rejected, symmetric) | PASS |
| `chestPairKey` is canonical and argument-order independent | swapped-argument equality tests; pinned key strings | PASS |
| `doubleChestOrder` returns `[primary, secondary]` with the lexicographically smaller (x, then z) position primary | x-differs and z-differs vectors, both argument orders | PASS |
| Pair operations throw for non-adjacent pairs | non-adjacent throw tests | PASS |
| `createDoubleChestMenu` builds 90 slots with `playerSlotStart` 54, primary 0-26, secondary 27-53, player 54-89, empty cursor; validates inputs | construction test + validation rejects (bad half inventory, 35 player slots, non-array player slots, invalid cursor) | PASS |
| Transactions across primary/secondary/player regions follow 106 semantics, immutably | full cross-region vector: pickup from primary, merge into player, quick-move secondary->player, placeOne into secondary, quick-move player->chest first-fit with remainder; source menu unchanged | PASS |
| Out-of-bounds transaction indices throw | indices -1 and 90 throw | PASS |
| `extractDoubleChestHalves`/`extractDoubleChestPlayerSlots` return exact regions; foreign menus throw | round-trip test + foreign-menu rejects | PASS |
| `unpairDoubleChest` returns the surviving half for both argument orders/assignments; unknown removed positions and non-adjacent pairs throw | unpairing vectors | PASS |
| Determinism and immutability | repeated identical calls produce equal results, input JSON unchanged | PASS |
| 052 manager round-trip of two adjacent chest entities | serialize/deserialize restores both exact inventories; adjacency + pair key asserted | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | no errors |
| `npm run lint` | PASS | no warnings/errors |
| `npx vitest run tests/unit/DoubleChest.test.ts` | PASS | 13/13 tests |
| `npm test` (run 1) | PASS | 1229/1229 tests (121 files) |
| `npm test` (runs 2-6) | PASS | 1229/1229 in 5 consecutive runs; one transient non-108 failure occurred in a single early run and never reproduced |
| `npm run build` | PASS | production build ok (dist) |
| `npm run test:e2e` | PASS | 19/19 tests |

## Edge / adversarial validation
- Adjacency: four cardinal neighbours accepted; diagonal, vertical, identical, and distant
  positions rejected.
- Ordering: x-first then z; both argument orders return the same key and order.
- Menu: exact 90-slot shape enforced; half inventories, player slot count, and cursor bounds
  validated; extraction rejects foreign menus.
- Transactions: cross-region vector covers pickup, merge-limit, quick-move first-fit with
  remainder, and placeOne; source menu immutable.
- Unpairing: all four assignment/order combinations return the correct surviving half.

## Migration / compatibility validation
Additive; halves persist with the 107 envelope unchanged, so existing single-chest saves are
unaffected. No existing module behavior changes.

## Performance / resource validation
Pure O(menu slots) operations; no allocations beyond result objects. No hot-path impact.

## Regressions
Full unit suite 1229/1229 stable across consecutive runs, E2E 19/19, build clean. No existing
tests modified.

## Incomplete tasks
None. All 4 tasks complete.

## Advancement Exception
Not applicable (100%).

## Final decision
VERIFIED. Advancement to 109-furnace-block-entity per `CHANGE_SEQUENCE.md` (verified: next
entry after 108 is 109-furnace-block-entity "Furnace inventory, timers, lit state,
persistence"). All MUST/SHALL requirements of the spec are implemented and evidenced.
