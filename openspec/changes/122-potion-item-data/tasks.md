# Tasks: 122-potion-item-data

Status: VERIFIED
Completion: 100%

## Audit reconciliation (2026-09-18)

The implementation, unit coverage, full gate, verification evidence, and publication history
already exist (`aa9ee09`, `db5b0e8`). The stale NOT STARTED/unchecked ledger is reconciled below;
this records existing evidence rather than new implementation work.

## Task 1 — Data model and component type

- [x] Define `PotionKind`, `PotionEffectData`, `PotionContents`,
      `PotionConsumePayload`, `PotionSplashPayload` in `src/data/PotionItemData.ts`.
- [x] Implement `potionContentsComponentType` with a strict `validate` function.
- [x] Register `potionContentsComponentType` in `createDefaultStackComponentRegistry`
      (`src/inventory/StackDataComponents.ts`).
- [x] Baseline evidence: existing component registry test still constructs cleanly.

## Task 2 — Strict factory

- [x] Implement `createPotionContents({ base?, kind, customEffects })` that validates
      and clamps, throwing `RegistryError` on violation.
- [x] Reject: missing/unknown kind; empty effects; bad typeId/duration/amplifier;
      duplicate typeId; non-string base.

## Task 3 — Payload primitives

- [x] Implement `getEffectiveEffects`, `buildConsumePayload`, `buildSplashPayload`
      (pure, deterministic; splash radius 4.0 for SPLASH/LINGERING, 0 for NORMAL).

## Task 4 — Unit tests

- [x] `tests/unit/PotionItemData.test.ts`: construction, clamping, uniqueness, invalid
      input, payload building per kind, `StackComponentMap` round-trip, and 119/121
      regression (registry + effect-manager contracts unchanged).

## Task 5 — Full regression gate

- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
      `npm run test:e2e` all green.
- [x] Update `verification.md` with real evidence; mark VERIFIED if 100%.

## Task 6 — Documentation / state

- [x] Update `openspec/PROGRAM_STATE.md` "What 122 implemented" + checkpoint.
- [x] Advance `openspec/PROGRAM_STATE.json` (currentChange 122 VERIFIED, next 123).
- [x] Commit impl + state; push to `origin/main`; verify remote == local.
