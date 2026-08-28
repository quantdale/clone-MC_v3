# Verification: 167-dropper

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 dropper block + item registered, 10 states | `tests/unit/DropperEject.test.ts` › `dropper registration` (3 cases: schema+default, item places block + `validateItemBlockCrossReferences` passes, enumerates exactly 10 states incl. default) | PASS |
| REQ-2 container push (merge/empty/none, no spill) | `tests/unit/DropperEject.test.ts` › `ejectFromDropper` (empty→none; merge-first container; empty-slot container; full-container→none source untouched) | PASS |
| REQ-3 world drop when facing no container | `tests/unit/DropperEject.test.ts` › `ejectFromDropper` (null destination → `drop` with item/count/position, source decremented by 1) | PASS |
| REQ-4 `dropperShouldTransfer` is `!powered` | `tests/unit/DropperEject.test.ts` › `dropperShouldTransfer` (unpowered→true, powered→false) | PASS |
| REQ-5 output position follows facing | `tests/unit/DropperEject.test.ts` › `dropper output position` (all five facings ≡ `offsetInDirection`) | PASS |
| REQ-6 scheduling + deterministic ordering | `tests/unit/DropperEject.test.ts` › `dropper scheduling` (not due at `cooldown-1`, fires at `cooldown`, same-tick deterministic, repeatable) | PASS |
| REQ-7 `dropperStateProperties` projects full state | `tests/unit/DropperEject.test.ts` › `dropperStateProperties` (keys exactly `facing`/`enabled`, each legal per `DROPPER_SCHEMA.legalValues`) | PASS |
| Characterization: new block/item counted | `tests/unit/BlockRegistry.test.ts` (`all()` 39→40), `tests/unit/BlockStateRegistry.test.ts` (total formula + explicit `dropper` 10-state branch), `tests/unit/BlockPropertySchema.test.ts` (`dropper` added to `STATEFUL_BLOCK_KEYS`) | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/DropperEject.test.ts` | PASS | 15 tests passed |
| `npm test` | PASS | **2280 passed (2280/2280)** — baseline 2265 + 15 new, no regression |
| `npm run build` | PASS | `tsc --noEmit && vite build` — 103 modules, dist emitted |
| `npm run test:e2e` | PASS | **22 passed (22/22)** headless Chromium — existing assertions unaffected |

## Edge/adversarial validation
- `ejectFromDropper` is total for well-formed `MenuSlot[]`: empty source → `kind: 'none'`, source deep-copied unchanged; full container → `kind: 'none'` with source unchanged (**no world spill**); `null` destination → `kind: 'drop'` with `count: 1` and the source decremented exactly one. Covered by dedicated cases above.
- The container push reuses 166's `transferOneItem`, so a partial-depletion-on-failure is impossible by construction; the `none` (full container) case explicitly asserts it.
- `dropperShouldTransfer` is total (`!powered`).

## Migration/compatibility validation
- One additive block id (`BlockId.Dropper = 51`) and one additive item id ("dropper", `ItemId.Dropper = 51`); no id renumbering, no save-format/schema change. `Game.ts` untouched; `validateItemBlockCrossReferences` passes with the new block+item. `transferOneItem` is reused, not duplicated.

## Performance/resource validation
- `ejectFromDropper` is O(`source.length + destination.length`); 10 new block states only. No hot-path or stored-data change beyond the additive block/item.

## Regressions
- Full unit suite 2280/2280 (was 2265/2265); full e2e 22/22. Three characterization tests updated to account for the 40th block and its 10 states; no other test changed.

## Incomplete tasks
- None. All 33 task items complete.

## Advancement Exception
Not applicable — completion is 100%, mandatory requirements pass, and required tests pass.

## Final decision
VERIFIED. `npm run typecheck`, `npm run lint`, full `npm test` (2280/2280), `npm run build`, and
`npm run test:e2e` (22/22) all pass. The change adds the `dropper` block (10 states, same
`facing`/`enabled` shape as 166's hopper) and the `ejectFromDropper` core: it pushes one item into a
faced container by reusing 166's `transferOneItem`, and — unlike a hopper — drops one item into the
world (modeled as a `DroppedItem` descriptor) when facing no container, never spilling when facing a
full container. The same inverse-of-162 `!powered` lockout and 047 scheduling bridge as 166 are
reused. No `Game`/`World` wiring, no real item-entity spawn, no container-transaction integration,
per the proposal's non-goals.
