# Tasks: 208-accessibility-options

## Implementation
- [x] `src/simulation/AccessibilityFramework.ts`: `AccessibilityKind` (boolean/float/choice) /
      `AccessibilityOption` / `ACCESSIBILITY_OPTIONS` (7 entries) + `accessibilityOption` lookup.
- [x] `AccessibilityStore` / `createDefaultAccessibility` / `getOption`.
- [x] `isValidAccessibilityValue` (kind + inclusive range + choice list; unknown key/choice and
      NaN false).
- [x] `setOption` (new store on valid change; identity no-op otherwise).
- [x] `serializeAccessibility` / `deserializeAccessibility` (version 1; unknown/invalid rejected
      with descriptive throws; missing options default).

## Tests
- [x] `tests/unit/AccessibilityFramework.test.ts`: table (7 entries, kinds/choices/defaults) +
      lookup + default store.
- [x] Validation: boundaries, unknown choices, wrong kinds, NaN, unknown key.
- [x] Set: change/new object; same-value and invalid identity no-ops.
- [x] Persistence: round-trip; rejections (non-object, bad version, non-object options, unknown
      option, invalid choice, out of range); missing-option defaults.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2733/2733 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 209-gamepad-controls).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
