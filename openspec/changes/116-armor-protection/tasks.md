# Tasks: 116-armor-protection

Status: VERIFIED
Completion: 100%

## 1. Data model — armor fields

- [x] **1.1** Add `defensePoints?: number` and `toughness?: number` to
      `ItemTypeDefinition` in `src/inventory/ItemRegistry.ts` (default `0` by
      absence). No registry/constructor change needed.
- [x] **1.2** Typecheck-only: confirm `ItemTypeRegistry` and `createDefaultItemRegistry()`
      still compile with the new optional fields.

## 2. ArmorProtection module

- [x] **2.1** Create `src/player/ArmorProtection.ts` with `computeArmorStats`,
      `reduceDamage`, `applyArmorWear` (pure) and the `ArmorProtection` class
      (`getStats`, `reduce`, `applyWear`) per `design.md` API + formula.
- [x] **2.2** Pure-function unit tests in `tests/unit/ArmorProtection.test.ts`:
      stats sum/cap, missing-def, full formula (tiny / high-zero-toughness /
      high-full-toughness), passthrough (`raw=0`, `bypass`), and wear (equal wear,
      break→null, skip non-durable, no-absorb). Use synthetic `ItemStack`s + a
      small `ItemTypeRegistry`.
- [x] **2.3** `ArmorProtection` class tests: `getStats()` against `PlayerEquipment`,
      `applyWear` mutates slots and clears a broken piece.

## 3. SurvivalSystem wiring + DamageType flags

- [x] **3.1** In `src/player/SurvivalSystem.ts`, store the `DamageTypeRegistry`
      reference; add optional `armor?: ArmorProtection`; add `isBypass(reason)`
      (unrecognized reason ⇒ non-bypass). Consult `armor` in `damage()` for
      non-bypass reasons, apply `ceil(reduced)` health loss, and call
      `armor.applyWear(absorbed)` when `absorbed > 0`.
- [x] **3.2** Add `BYPASS_ARMOR` to the `fall`, `drowning`, `lava`, `starvation`
      default definitions in `src/data/DamageType.ts`.
- [x] **3.3** Integration test in `tests/unit/SurvivalSystem.test.ts`: construct
      `SurvivalSystem` with a custom registry (default 4 env types + a synthetic
      non-bypass `combat` type) and an `ArmorProtection`; assert non-bypass
      reduces health and wears armor, bypass is untouched, and unrecognized reason
      still applies armor. Existing 6 cases stay green; `DamageType.test.ts`
      flag assertions updated.

## 4. Full regression gate

- [x] **4.1** `npm run typecheck` — PASS.
- [x] **4.2** `npm run lint` — PASS.
- [x] **4.3** `npm test` — PASS (1391 unit, +17 vs 1374).
- [x] **4.4** `npm run build` — PASS.
- [x] **4.5** `npm run test:e2e` — PASS (21 cases).

## 5. Documentation / state

- [x] **5.1** Update `openspec/changes/116-armor-protection/verification.md` with
      real command output and per-requirement evidence.
- [x] **5.2** Advance `PROGRAM_STATE.json`/`.md`: currentChange = `116-armor-protection`
      VERIFIED, nextChange = `117-player-experience`; record completion %, validations,
      Git HEAD.

## 6. Commit + publish

- [x] **6.1** Commit implementation (impl) and update state (state-bump) as two
      commits; `git push origin HEAD:main`; confirm remote `main` == local HEAD.
