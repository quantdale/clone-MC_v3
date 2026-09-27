# OVERRIDE_DRAFT — Change 292

**Status:** Applied to live `CHANGE_SEQUENCE_OVERRIDES.md` at T2 activation in
this session (291 is already VERIFIED/published).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 292-player-status-effect-persistence — activated from published VERIFIED 291

The product/session instruction authorizes activating OpenSpec change
**292-player-status-effect-persistence** as the sole ACTIVE implementation
change while Change **258** remains **BLOCKED** and Changes **259–291** remain
**VERIFIED**.

- **Activation dependency (satisfied):** Change **291-pillager-patrol-bad-omen**
  is VERIFIED 11/11 and published; tip base `e024126` (origin/main).
- **Scope:** persist active status effects (type/amplifier/remaining duration,
  incl. Hero of the Village) and Bad Omen (level + new 6000 s remaining
  duration) in the existing player-state record via the 289 durable path;
  resume durations (no reset/farming); old saves load as no effects; restored
  omen inside a village starts a raid on the next tick (vanilla), raid start
  dismisses patrols (291) and durably consumes omen; unit + browser E2E;
  updated 285/290/291 reload assertions.
- **Out of scope:** new store/namespace/schema version; effect HUD; changes to
  HOTV grant/discount, 285 trigger rule, death semantics, patrol persistence;
  rendering; Change 258 headed FPS/GPU work or status change; Change 293.
- Change **258** stays **BLOCKED**; Changes **259–291** stay **VERIFIED** and
  are not reopened.

## Package path

`openspec/changes/292-player-status-effect-persistence/`
