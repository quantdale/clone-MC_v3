# Tasks: 122-potion-item-data

Status: NOT STARTED
Completion: 0%

## Task 1 — Data model and component type

- [ ] Define `PotionKind`, `PotionEffectData`, `PotionContents`,
      `PotionConsumePayload`, `PotionSplashPayload` in `src/data/PotionItemData.ts`.
- [ ] Implement `potionContentsComponentType` with a strict `validate` function.
- [ ] Register `potionContentsComponentType` in `createDefaultStackComponentRegistry`
      (`src/inventory/StackDataComponents.ts`).
- [ ] Baseline evidence: existing component registry test still constructs cleanly.

## Task 2 — Strict factory

- [ ] Implement `createPotionContents({ base?, kind, customEffects })` that validates
      and clamps, throwing `RegistryError` on violation.
- [ ] Reject: missing/unknown kind; empty effects; bad typeId/duration/amplifier;
      duplicate typeId; non-string base.

## Task 3 — Payload primitives

- [ ] Implement `getEffectiveEffects`, `buildConsumePayload`, `buildSplashPayload`
      (pure, deterministic; splash radius 4.0 for SPLASH/LINGERING, 0 for NORMAL).

## Task 4 — Unit tests

- [ ] `tests/unit/PotionItemData.test.ts`: construction, clamping, uniqueness, invalid
      input, payload building per kind, `StackComponentMap` round-trip, and 119/121
      regression (registry + effect-manager contracts unchanged).

## Task 5 — Full regression gate

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
      `npm run test:e2e` all green.
- [ ] Update `verification.md` with real evidence; mark VERIFIED if 100%.

## Task 6 — Documentation / state

- [ ] Update `openspec/PROGRAM_STATE.md` "What 122 implemented" + checkpoint.
- [ ] Advance `openspec/PROGRAM_STATE.json` (currentChange 122 VERIFIED, next 123).
- [ ] Commit impl + state; push to `origin/main`; verify remote == local.
