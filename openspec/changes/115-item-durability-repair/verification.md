# Verification: 115-item-durability-repair

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| remaining-durability computation | `getRemainingDurability(maxDurability, stack)` returns `max(0,min(max,max-damage))` for a tool, `0` for non-tool/empty/missing. `DurabilityRules.test.ts`: `returns full durability for a pristine tool` (59), `reflects accumulated damage` (49), `returns 0 for a non-tool`, `returns 0 for a missing or empty stack`. | PASS |
| durability damage rule | `applyDamage(maxDurability, stack, amount)` accumulates `max(1,trunc(amount))` into `DAMAGE_COMPONENT`; breaks at zero (count 0, components undefined, broke true); non-tools/empty returned unchanged. `DurabilityRules.test.ts`: `applies a point of wear`, `breaks the tool when remaining reaches zero`, `is a no-op for non-tools`, `coerces a negative amount to one wear`. `Inventory.test.ts` `tracks tool durability and breaks the selected tool at zero` stays green through the delegation. | PASS |
| break detection | `isBroken(maxDurability, stack)` true for depleted tool or `count<=0`, false otherwise. `DurabilityRules.test.ts`: `returns false for a full tool`, `returns true for a depleted tool`, `returns true for an empty stack`, `returns false for a non-tool`. | PASS |
| repair rule | `repair(maxDurability, stack, amount)` reduces damage by `max(1,trunc(amount))`, clamped at 0 (pristine), preserving count/identity; non-tool/empty/pristine returned unchanged. `DurabilityRules.test.ts`: `reduces accumulated damage` (10→6), `clamps at pristine (no damage component remains)`, `is a no-op for a pristine tool`, `is a no-op for a non-tool`. | PASS |
| inventory integration | `Inventory.damageSelectedItem` delegates to `applyDamage` (identical behavior, existing durability tests green); `Inventory.repairSelectedItem` delegates to `repair`, returning whether the selected tool changed. `Inventory.test.ts`: `repairs the selected tool and reports a change` (damage 10 → 6, returns true), `does not change a pristine selected tool on repair` (returns false). `PlayerInteraction.test.ts` break path still green (end-to-end). | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run` | PASS | 1374 passed (128 files); +18 new `DurabilityRules.test.ts` + 2 new `Inventory.test.ts` repair cases |
| `npm run build` | PASS | `tsc --noEmit && vite build` clean |
| `npm run test:e2e` | PASS | 21 passed (1.5m) |

## Edge/adversarial validation

- `applyDamage`/`repair` coerce any non-positive `amount` via `max(1, trunc(amount))` so a bad caller still applies at least 1 wear (matches the prior inline `Math.max(1, …)`), and never throw for integer inputs.
- A broken/empty stack passed to `applyDamage` is returned unchanged with `broke=false` (no double-break, no negative-count mutation) — short-circuits on `maxDurability<=0 || !stack || stack.count<=0`.
- Repair at pristine removes the `DAMAGE_COMPONENT` entirely (absent component == pristine, the same convention used by `Inventory.getSlotDurability`, `restore`, and `consumeSelected`), so a fully-repaired tool merges identically to a pristine one and does not leak a `damage:0` component.
- `Inventory.damageSelectedItem` keeps its signature `(amount, maxDurability)` and return contract; the delegation reproduces the prior inline break-zeroing exactly (`count=0, components=undefined`), so the pinned `Inventory.test.ts` durability cases (break-at-zero, 008 damage-component round-trip, component-aware merge, snapshot component hygiene) stay green.

## Migration/compatibility validation

- No persisted-data schema change. `DAMAGE_COMPONENT`, `maxDurability`, and the legacy `durability` snapshot field are unchanged; `damageSelectedItem`'s contract is preserved and `repairSelectedItem` is purely additive.
- `DurabilityRules` is a new pure module with no registry coupling (takes `maxDurability` explicitly); no existing public signature is removed.

## Performance/resource validation

- `applyDamage`/`repair` allocate at most one small `StackComponentMap` per call (per break/repair, not per frame). `getRemainingDurability`/`isBroken` are O(1) component reads. No per-frame allocation.

## Regressions

- Full unit suite 1374 (was 1354 at 114) — net +20 from 115, no regression.
- E2E drop/break tests target level-0 terrain and remain green. All 21 e2e green.
- `PlayerInteraction` break-damage hook (tool wear on block break) still exercised end-to-end by existing tests.

## Incomplete tasks

None. All 5 task groups complete and checkbox-credited.

## Advancement Exception

Not applicable — completion is 100% with all MUST/SHALL requirements implemented and verified; no exception required.

## Final decision

VERIFIED at 100%. Advance to change `116-armor-protection`.
