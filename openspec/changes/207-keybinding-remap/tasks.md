# Tasks: 207-keybinding-remap

## Implementation
- [x] `src/simulation/KeybindingFramework.ts`: `KEYBINDING_ACTIONS` (23) + default-key table +
      `defaultKey` lookup.
- [x] `KeybindingState` / `createDefaultKeybindings` / `keyFor` / `actionForKey`.
- [x] `remapKey` (invalid key structured rejection; same-action identity; free-key rebind;
      cross-action swap with displaced reporting).
- [x] `resetKey` / `resetAll` (identity no-ops).
- [x] `serializeKeybindings` / `deserializeKeybindings` (version 1; unknown/invalid rejected;
      missing actions default; descriptive throws).

## Tests
- [x] `tests/unit/KeybindingFramework.test.ts`: table (23 entries, order, defaults) + default
      state.
- [x] Queries (keyFor; actionForKey incl. null).
- [x] Remap: invalid key; same-action identity; free key; swap with displaced; state unchanged
      after identity.
- [x] Resets: resetKey (changed/default identity); resetAll (default identity).
- [x] Persistence: round-trip; rejections (non-object, bad version, non-object bindings, unknown
      action, empty key, unknown key); missing-action defaults.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2717/2717 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      208-accessibility-options).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
