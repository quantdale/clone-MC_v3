# Tasks: 206-settings-persistence

## Implementation
- [x] `src/simulation/SettingsFramework.ts`: `SettingsKind` / `SettingsDefinition` /
      `SETTING_DEFINITIONS` (10 entries, 4 categories) + `settingDefinition` lookup.
- [x] `SettingsStore` / `createDefaultSettings` / `getSetting`.
- [x] `isValidSettingValue` (kind + inclusive range; unknown key / NaN false).
- [x] `setSetting` (new store on valid change; identity no-op otherwise).
- [x] `serializeSettings` / `deserializeSettings` (version 1; unknown/invalid rejected with
      descriptive throws; missing keys default).

## Tests
- [x] `tests/unit/SettingsFramework.test.ts`: table (10 entries, kinds/ranges/defaults) +
      lookup + default store.
- [x] Validation: boundaries (min/max inclusive), wrong kind, NaN, unknown key.
- [x] Set: change/new object; same-value and invalid identity no-ops.
- [x] Persistence: round-trip; rejections (non-object, bad version, non-object settings, unknown
      key, wrong kind, out of range); missing-key defaults.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2707/2707 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 207-keybinding-remap).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
