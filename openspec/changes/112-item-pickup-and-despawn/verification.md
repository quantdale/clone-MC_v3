# Verification: 112-item-pickup-and-despawn

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| pickup delay | `tests/unit/ItemPickup.test.ts` (young drop not collected; boundary tick) | PASS |
| merge policy | `tests/unit/ItemPickup.test.ts` (overlap merge; distance; cap; different items; idempotent) | PASS |
| inventory insertion | `tests/unit/ItemPickup.test.ts` (full; partial; radius skip; full inventory; summed) | PASS |
| despawn timer | `tests/unit/ItemPickup.test.ts` (boundary despawn; young survives; no-op; aged-only) | PASS |
| simulation wiring | `tests/e2e/game.spec.ts` (break→collect; break→entity spawn regression) | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run` | PASS | 1306 passed (125 files); new `ItemPickup.test.ts` (16) |
| `npm run build` | PASS | `tsc --noEmit && vite build` → dist assets |
| `npm run test:e2e` | PASS | 21 passed (1.5m); new `breaking a block drops an item the player collects` (test 19) |

## Edge / adversarial validation

- Inventory full (`insert` returns full count): entity `count` unchanged, no item lost.
- Partial inventory: entity left with correct leftover `count`.
- `mergeEntities`/`despawnExpired`/`collectPlayerDrops` with no eligible entities: no-op returning 0.
- Distance and age checks inclusive (`>=`) at the boundary tick.
- Snapshot iteration keeps removal/reduction safe mid-loop.
- `count` mutability does not break `deserializeAll` (still constructs via `createItemEntity`).
- Idempotent merge verified with three overlapping same-item drops folding into one.

## Migration / compatibility validation

- `ItemEntity.count` mutable but value domain unchanged (`1..stackSize`).
- 037 envelope and `serializeAll`/`deserializeAll` untouched; `ageTicks`/`count` round-trip.
- No registry/codec changes; 131 can persist post-112 state without migration.

## Performance / resource validation

- Merge O(n²) over live drops; n bounded (tens).
- Despawn/pickup O(n), no allocation beyond per-call snapshot.
- All three run once per simulation tick.

## Regressions

- 111 "breaking a block spawns a world item entity" e2e stays green (asserts `size > 0`
  immediately after break, before pickup delay elapses) — test 18.
- 111 split/merge unit tests untouched (never call `mergeEntities`).
- Baseline unit (1290→1306) and e2e (20→21) remain green.

## Incomplete tasks

- None.

## Advancement Exception

Not applicable — completion is 100% with all MUST/SHALL requirements verified.

## Final decision

VERIFIED — full gate green, spec and implementation reconciled. Advance to
113 (next item/entity change per CHANGE_SEQUENCE.md).
