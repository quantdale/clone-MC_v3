# Verification: 168-dispenser

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| REQ-1 dispenser block + item registered, 10 states | `tests/unit/DispenserBehavior.test.ts` › `dispenser registration` (3 cases: schema+default, item places block + `validateItemBlockCrossReferences` passes, enumerates exactly 10 states incl. default) | PASS |
| REQ-2 behavior table maps special→action, plain→null | `tests/unit/DispenserBehavior.test.ts` › `dispenser behavior table` (known special item resolves; plain item → null; initial set present) | PASS |
| REQ-3 dispense dispatch (behavior/container/drop/none) | `tests/unit/DispenserBehavior.test.ts` › `dispenseFromDispenser` (special→behavior consuming one; empty→none; plain→container merge; plain→drop; full container→none no spill) | PASS |
| REQ-4 `dispenserShouldTransfer` is `!powered` | `tests/unit/DispenserBehavior.test.ts` › `dispenserShouldTransfer` (unpowered→true, powered→false) | PASS |
| REQ-5 output position follows facing | `tests/unit/DispenserBehavior.test.ts` › `dispenser output position` (all five facings ≡ `offsetInDirection`) | PASS |
| REQ-6 scheduling + deterministic ordering | `tests/unit/DispenserBehavior.test.ts` › `dispenser scheduling` (not due at `cooldown-1`, fires at `cooldown`, same-tick deterministic, repeatable) | PASS |
| REQ-7 `dispenserStateProperties` projects full state | `tests/unit/DispenserBehavior.test.ts` › `dispenserStateProperties` (keys exactly `facing`/`enabled`, each legal per `DISPENSER_SCHEMA.legalValues`) | PASS |
| Characterization: new block/item counted | `tests/unit/BlockRegistry.test.ts` (`all()` 40→41), `tests/unit/BlockStateRegistry.test.ts` (total formula + explicit `dispenser` 10-state branch), `tests/unit/BlockPropertySchema.test.ts` (`dispenser` added to `STATEFUL_BLOCK_KEYS`) | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/DispenserBehavior.test.ts` | PASS | 18 tests passed |
| `npm test` | PASS | **2298 passed (2298/2298)** — baseline 2280 + 18 new, no regression |
| `npm run build` | PASS | `tsc --noEmit && vite build` — 103 modules, dist emitted |
| `npm run test:e2e` | PASS | **22 passed (22/22)** headless Chromium — existing assertions unaffected |

## Edge/adversarial validation
- `dispenseFromDispenser` is total for well-formed `MenuSlot[]`: empty source → `kind: 'none'`,
  source deep-copied unchanged; special item → `kind: 'behavior'`, source decremented exactly one;
  plain item delegates to 167's `ejectFromDropper` (full container → `none`, **no spill**; null
  destination → `drop`). Covered by dedicated cases above.
- The plain-vs-special split is exercised in both directions (arrow → behavior; stone →
  container/drop/none), and `dispenseFromDispenser` contains no item-name branches — it only calls
  `getDispenserBehavior`, so the table is the single source of truth (asserted present).
- `dispenserShouldTransfer` is total (`!powered`).

## Migration/compatibility validation
- One additive block id (`BlockId.Dispenser = 52`) and one additive item id (`ItemId.Dispenser = 52`);
  no id renumbering, no save-format/schema change. `Game.ts` untouched; `validateItemBlockCrossReferences`
  passes with the new block+item. The plain-item path reuses 167's `ejectFromDropper`/`transferOneItem`.

## Performance/resource validation
- `dispenseFromDispenser` is O(`source.length + destination.length`) plus a small fixed table scan;
  10 new block states only. No hot-path or stored-data change beyond the additive block/item.

## Regressions
- Full unit suite 2298/2298 (was 2280/2280); full e2e 22/22. Three characterization tests updated to
  account for the 41st block and its 10 states; no other test changed.

## Incomplete tasks
- None. All 33 task items complete.

## Advancement Exception
Not applicable — completion is 100%, mandatory requirements pass, and required tests pass.

## Final decision
VERIFIED. `npm run typecheck`, `npm run lint`, full `npm test` (2298/2298), `npm run build`, and
`npm run test:e2e` (22/22) all pass. The change adds the `dispenser` block (10 states, same
`facing`/`enabled` shape as 166/167) and the `dispenseFromDispenser` core with a **data-driven**
`DISPENSER_ITEM_BEHAVIORS` table: a special item yields `kind: 'behavior'` (consume one, carry the
action descriptor) while a plain item delegates to 167's `ejectFromDropper` (container push /
world drop / no-spill none). The same inverse-of-162 `!powered` lockout, 154 `offsetInDirection`
output, and 047 scheduling bridge as 166/167 are reused. No `Game`/`World` wiring, no real
projectile/entity/block spawn, no container-transaction integration, per the proposal's non-goals.
This closes the redstone/automation "item-moving consumer" family (166 hopper, 167 dropper, 168
dispenser).
