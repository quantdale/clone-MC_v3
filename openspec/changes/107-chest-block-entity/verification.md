# Verification: 107-chest-block-entity

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| `createChestInventory` builds 27 empty slots (maxStack 64) | `tests/unit/ChestBlockEntity.test.ts` (construction test) | PASS |
| `validateChestInventory` rejects malformed shapes and slots | validation matrix (wrong lengths 26/28, non-arrays, null item with count>0, count>maxStack, maxStack 0/65, negative/fractional counts, empty item strings) | PASS |
| Serialization round-trips exactly; deserialization rejects malformed payloads | round-trip tests (empty + filled incl. maxStack-1 slot); rejects (null, non-objects, missing/wrong-length slot arrays, invalid slots) | PASS |
| `createChestMenu` builds 63 slots with `playerSlotStart` 27; validates player slots and cursor | menu construction test (63 slots, cursor empty, extract regions equal inputs; bad player slot / wrong count / bad cursor throw) | PASS |
| `applyChestMenuTransaction` follows 106 semantics across the chest/player boundary, immutably | vectors: leftClick pickup/merge/swap, rightClick split-half, placeOne, quickMove both directions with first-fit and remainder; source menu unchanged after apply | PASS |
| Out-of-bounds transaction indices throw | indices -1 and 63 throw | PASS |
| `createChestBlockEntity`/`readChestEntity`/`updateChestEntityInventory` lifecycle | entity tests: typeKey `chest`, tickable false, payload round-trip; update returns new instance, old unchanged | PASS |
| Wrong type keys and malformed payloads throw on read | foreign typeKey and `{ slots: 'garbage' }` payload both throw | PASS |
| `chestEntityContents` lists non-empty stacks in slot order | mixed-inventory vector + empty inventory; `chestInstanceContents` helper | PASS |
| 052 manager chunk round-trip | serialize/deserialize chunk with a chest entity restores the exact inventory; out-of-chunk restore rejects | PASS |
| Chest block (19) and item (25) registered with valid cross-references | registry test: block solid/breakable/hardness 2.5/axe/lootTable, self-drop; item places chest; `validateItemBlockCrossReferences` passes | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | no errors |
| `npm run lint` | PASS | no warnings/errors |
| `npx vitest run tests/unit/ChestBlockEntity.test.ts` | PASS | 24/24 tests |
| `npm test` (run 1) | PASS | 1216/1216 tests (120 files) |
| `npm test` (run 2) | PASS | 1216/1216 tests (stable) |
| `npm run build` | PASS | production build ok (dist) |
| `npm run test:e2e` | PASS | 19/19 tests |

## Edge / adversarial validation
- Slot bounds: maxStack [1,64], count [1,maxStack], item key non-empty string or null iff count 0;
  fractional, negative, and oversized values all rejected.
- Menu region indices pinned (chest 0-26, player 27-62) with 36 player slots; extraction
  rejects foreign menus.
- Payloads: non-object, non-array, wrong length, and invalid slots rejected; round-trips exact
  including a maxStack-1 slot.
- Transactions verified against the 106 engine: merge limits, split-half rounding, first-fit
  quick-move with remainder, and immutability of the source menu.

## Migration / compatibility validation
Additive: new registry ids (block 19, item 25) and atlas tile 27 were unused; `BlockId`/`ItemId`
enums and the legacy-id separation table updated in lockstep. Existing saves unaffected.

## Performance / resource validation
Pure O(menu slots) operations; no allocations beyond result objects. No hot-path impact.

## Regressions
Full unit suite 1216/1216 twice, E2E 19/19, build clean. Two registry enumeration tests
(BlockRegistry, BlockItemSeparation) updated for the new block; no other changes.

## Incomplete tasks
None. All 5 tasks complete.

## Advancement Exception
Not applicable (100%).

## Final decision
VERIFIED. Advancement to 108-double-chest-composition per `CHANGE_SEQUENCE.md` (verified: next
entry after 107 is 108-double-chest-composition "Deterministic adjacent chest pairing/
unpairing"). All MUST/SHALL requirements of the spec are implemented and evidenced.
