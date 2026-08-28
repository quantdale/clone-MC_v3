# Verification: 109-furnace-block-entity

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| `createFurnaceState` builds three empty slots and zero timers; `furnaceIsLit` is `burnTime > 0` | construction test (empty state, lit false) | PASS |
| `validateFurnaceState` rejects malformed shapes, slots, and times; enforces time invariants | validation matrix (non-object, bad slot, negative/fractional times, burnTime > burnTimeTotal, total 0 with non-zero time, smeltTime > smeltTimeTotal) | PASS |
| `tickFurnace` deterministic tick engine | tick vectors: burn start + fuel consumption, no fuel no progress, non-fuel never consumed, blocked-output pause (state unchanged), input-removal reset (lit continues), cook completion with result merge, full fuel run (8 smelts/1600 ticks), multi-tick == repeated single ticks, invalid tick counts throw | PASS |
| Immutability | inputs verified unchanged after tick (source fuel, burnTime, input assertions) | PASS |
| Serialization lossless round-trip; malformed payloads throw | empty + burning round-trips; rejects (null, {}, burnTime 5 with total 0, negative total) | PASS |
| `createFurnaceMenu` 39 slots `playerSlotStart` 3 (input 0, fuel 1, output 2, player 3-38) with validation | construction + validation rejects (bad player slot, 35 player slots, invalid cursor, foreign-menu extraction) | PASS |
| Menu transactions across the furnace/player boundary follow 106 semantics | pickup, quick-move into first-empty furnace slot, placeOne, source unchanged | PASS |
| `withFurnaceSlots` preserves timers | timer preservation vector | PASS |
| `furnaceTickProgress`/`furnaceBurnFraction` in [0,1] | 0.5/0.5 vectors, zero totals -> 0, full progress -> 1 | PASS |
| 052 entity lifecycle: `createFurnaceBlockEntity` (typeKey `furnace`, tickable), `readFurnaceState`, `updateFurnaceState` immutable; wrong type key and malformed payload throw | lifecycle tests | PASS |
| 052 manager chunk round-trip | serialize/deserialize restores the exact burning state | PASS |
| Furnace block (20) and item (26) registered with valid cross-references | block solid/breakable/hardness 3.5/self-drop; item places block; `validateItemBlockCrossReferences` passes | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | no errors |
| `npm run lint` | PASS | no warnings/errors |
| `npx vitest run tests/unit/FurnaceBlockEntity.test.ts` | PASS | 24/24 tests |
| `npm test` (run 1) | PASS | 1253/1253 tests (122 files) |
| `npm test` (run 2) | PASS | 1253/1253 tests (stable) |
| `npm run build` | PASS | production build ok (dist) |
| `npm run test:e2e` | PASS | 19/19 tests |

## Edge / adversarial validation
- Time invariants enforced on both validation paths (state + envelope); totals-0-implies-time-0
  checked before the <= bound for the specific message.
- Fuel rules: no fuel -> no progress; non-fuel (burnTicks 0) never consumed; fuel consumed
  only while smelting can progress.
- Blocked output pauses ALL state (slots and timers) — asserted by deep equality.
- Cook completion merges into a near-full output (63 + 1 = 64) and into a fresh output;
  burning continues after a cook.
- Full fuel run: one coal (1600 ticks) smelts 8 iron ore with exact end state
  (input empty, output 8, burnTime 0).
- Entity payload rejects foreign type keys and malformed slot shapes.

## Migration / compatibility validation
Additive: new registry ids (block 20, item 26) and atlas tile 28 were unused; registry
enumeration and separation tests updated in lockstep. Existing saves unaffected.

## Performance / resource validation
`tickFurnace` O(ticks), O(1) per tick, no allocations beyond result objects.

## Regressions
Full unit suite 1253/1253 twice, E2E 19/19, build clean. Two BlockItemSeparation tests
updated for the new block at id 20 (numeric-space sharing); no other changes.

## Incomplete tasks
None. All 5 tasks complete.

## Advancement Exception
Not applicable (100%).

## Final decision
VERIFIED. Advancement to 110-furnace-recipes-and-fuels per `CHANGE_SEQUENCE.md` (verified:
next entry after 109 is 110-furnace-recipes-and-fuels "Smelting recipes, fuel values, XP
output, transactional behavior"). All MUST/SHALL requirements of the spec are implemented and
evidenced.
