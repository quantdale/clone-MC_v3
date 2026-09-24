# Proposal: 289-enchantment-persistence-reload-integrity

## Problem

Changes 283–288 intermittently fail `tests/e2e/enchanting.spec.ts:227` after
`pagehide` + reload: `enchantView()` reads `null` for the pickaxe
`enchantments` component even though the apply path set them and pre-reload
assertions passed. Investigation of 288 suspects a persist/hydrate race
(~300 ms wait before reload). If inventory item components are not durably
committed before unload, this is a real player-facing **data-loss** bug
(enchantments vanish after closing the tab) rather than a flaky test.

## Goals

- Deterministically reproduce the post-reload `enchantments === null` failure
  (unit codec round-trip + repeated e2e) and identify the true root cause.
- Fix the root cause in product code with the narrowest change (not by
  lengthening arbitrary sleeps).
- Ensure every registered stack data component that the inventory snapshot
  carries (`enchantments`, `damage`, `potion_contents`, `can_destroy`,
  `can_place_on`) survives the save codec round trip and the live
  pagehide→reload path.
- Make the pagehide / concurrent-flush path safe so a stale in-flight
  player-state write cannot clobber a newer snapshot.
- Persist promptly after a successful enchant apply (same class of urgency as
  death→statistics).
- Harden the enchanting e2e to await a real persisted signal (flush /
  pendingCount), not a bare sleep.
- Record before/after failure rates from repeated e2e runs (e.g. 20 repeats).

## Non-goals

- No redesign of the storage layer or DirtySaveQueue architecture beyond the
  narrow concurrency/integrity fix.
- No new persistence / archive namespace unless investigation proves one is
  missing (not expected).
- No enchanting UI redesign; no offer/XP/lapis rule changes.
- No GPU/FPS work; Change 258 stays BLOCKED; no fake evidence.
- Do not start Change 290 implementation in this session.
- Visual-regression SwiftShader golden drift stays out of scope (document
  honestly only).

## Preconditions

- Change **288-raider-combat-behavior** is VERIFIED 11/11 and published;
  `origin/main` tip `e1ecc81` (session start).
- Inventory `snapshot`/`restore` already serializes `slotComponents` (F-INV-2
  hardening); unit round-trip for enchantments+damage exists.
- `Game.onPageHide` and `AutosaveCoordinator` both listen for `pagehide` and
  fire-and-forget `flush()`.
- Change 258 remains BLOCKED; Changes 259–288 remain VERIFIED.

## Dependencies

- `src/storage/DirtySaveQueue.ts`, `AutosaveCoordinator.ts`, `GamePersistence.ts`
- `src/inventory/Inventory.ts`, `StackDataComponents.ts`, `EnchantmentApplication.ts`
- `src/engine/Game.ts` (`applyEnchantingOffer`, `onPageHide`, `savePlayerStateDurable`)
- `tests/e2e/enchanting.spec.ts`, `tests/unit/InventoryComponentPersistence.test.ts`,
  `tests/unit/DirtySaveQueue.test.ts`

## Proposed change

1. Author this complete OpenSpec package under
   `openspec/changes/289-enchantment-persistence-reload-integrity/`.
2. Add CHANGE_SEQUENCE row + override; make 289 the sole ACTIVE change.
3. Reproduce (unit + `--repeat-each` e2e), fix root cause, add regression
   coverage, verify before/after rates, full gates, VERIFIED 100%, publish.

## Compatibility and migration

No stored schema version bump expected. Snapshots already carry
`slotComponents`; the fix preserves that shape. Existing saves remain valid.
Behavioral change: concurrent drains cannot leave a stale player-state as the
last durable write; successful enchant apply enqueues+flushes player state.

## Risks

- Over-serializing drains → slight pagehide latency (bounded by existing
  FLUSH_MAX_ROUNDS / zero-progress guard).
- Mistakenly treating a pure test-harness flake as product without evidence →
  require before/after rates and a failing unit that names the race.
- Broadening into storage redesign → rejected; keep mutex/epoch narrow.

## Rollback strategy

Revert the 289 commits together. Prior intermittent enchanting flake returns;
no migration repair.

## Definition of Done

- Package passes SPEC_AUTHORING_PROTOCOL quality gate.
- Root cause documented in plain words; real-player impact stated.
- Implementation + unit + e2e green; enchanting:227 green under repeat-each;
  baseline gates green (document SwiftShader visual drift honestly).
- C289 exact; VERIFIED 100%; published to `origin/main`; 258 still BLOCKED.
- `nextExactAction` points at authoring a spec-first package for 290 (not
  started) with 3–5 candidate topics listed.

## Advancement gate

Target 100% task completion with all mandatory requirements and tests passing.
Absolute floor 90% only via explicit Advancement Exception (not planned).
