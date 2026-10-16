# Verification: 166-hopper-transfer

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 hopper block + item registered, 10 states | `tests/unit/HopperTransfer.test.ts` › `hopper registration` (3 cases: schema+default, item places block + `validateItemBlockCrossReferences` passes, enumerates exactly 10 states incl. default) | PASS |
| REQ-2 `transferOneItem` moves ≤1, merge-first then empty, no-op preserves source | `tests/unit/HopperTransfer.test.ts` › `transferOneItem` (5 cases: empty source no-op, full destination no-op/non-depleting, merge-preferred-over-empty, empty-slot-when-no-merge, source decrements by exactly 1) | PASS |
| REQ-3 `hopperShouldTransfer` is `!powered` | `tests/unit/HopperTransfer.test.ts` › `hopperShouldTransfer` (unpowered→true, powered→false) | PASS |
| REQ-4 intake always up, output follows facing | `tests/unit/HopperTransfer.test.ts` › `intake and output positions` (intake ≡ `offsetInDirection(...,'up')` for all five facings; output ≡ `offsetInDirection(...,facing)` for all five facings) | PASS |
| REQ-5 scheduling + deterministic ordering | `tests/unit/HopperTransfer.test.ts` › `hopper scheduling` (not due at `cooldown-1`, fires at `cooldown`, same-tick deterministic order, repeatable) | PASS |
| REQ-6 `hopperStateProperties` projects full state, legal for schema | `tests/unit/HopperTransfer.test.ts` › `hopperStateProperties` (keys exactly `facing`/`enabled`, each legal per `HOPPER_SCHEMA.legalValues`) | PASS |
| Characterization: new block/item counted | `tests/unit/BlockRegistry.test.ts` (`all()` 38→39), `tests/unit/BlockStateRegistry.test.ts` (total formula + explicit `hopper` 10-state branch), `tests/unit/BlockPropertySchema.test.ts` (`hopper` added to `STATEFUL_BLOCK_KEYS`) | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/HopperTransfer.test.ts` | PASS | 16 tests passed |
| `npm test` | PASS | **2265 passed (2265/2265)** — baseline 2249 + 16 new, no regression |
| `npm run build` | PASS | `tsc --noEmit && vite build` — 103 modules, dist emitted |
| `npm run test:e2e` | PASS | **22 passed (22/22)** headless Chromium — existing assertions unaffected |

## Edge/adversarial validation
- `transferOneItem` is total for well-formed `MenuSlot[]`: empty source → `moved:false`, both sides deep-copied unchanged; full destination → `moved:false` with the source count unchanged (no partial depletion). Covered by the two no-op cases above.
- `hopperShouldTransfer` is total (`!powered`), no branch beyond boolean inversion.
- Scheduling bridge reuses 047's de-duplicating/serializable queue; same-tick entries return in insertion order and the scenario is repeatable.

## Migration/compatibility validation
- One additive block id (`BlockId.Hopper = 50`) and one additive item id (`ItemId.Hopper = 50`); no id renumbering, no save-format/schema change. `Game.ts` is untouched; `validateItemBlockCrossReferences` passes with the new block+item.

## Performance/resource validation
- `transferOneItem` is O(`source.length + destination.length`); 10 new block states only (5 facings × 2 enabled). No hot-path or stored-data change beyond the additive block/item.

## Regressions
- Full unit suite 2265/2265 (was 2249/2249); full e2e 22/22. Three characterization tests were updated to account for the 39th block and its 10 states; no other test changed.

## Incomplete tasks
- None. All 33 task items complete.

## Advancement Exception
Not applicable — completion is 100%, mandatory requirements pass, and required tests pass.

## Final decision
VERIFIED. `npm run typecheck`, `npm run lint`, full `npm test` (2265/2265), `npm run build`, and `npm run test:e2e` (22/22) all pass. The change introduces the directional, timed, one-item `transferOneItem` core, the inverse-of-162 redstone lockout, intake/output position derivation, the 047 scheduling bridge, state projection, and the `hopper` block (10 states) with its placing item — exactly the narrow outcome in `CHANGE_SEQUENCE.md`. No `Game`/`World` wiring, no item-entity scooping, no container-transaction integration, per the proposal's non-goals.
