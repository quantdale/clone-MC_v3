# OVERRIDE_DRAFT — Change 294

**Status:** Applied to live `CHANGE_SEQUENCE_OVERRIDES.md` at T2 activation in
this session (293 is already VERIFIED/published).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 294-bad-omen-raid-escalation-and-death-parity — activated from published VERIFIED 293

The product/session instruction authorizes activating OpenSpec change
**294-bad-omen-raid-escalation-and-death-parity** as the sole ACTIVE
implementation change while Change **258** remains **BLOCKED** and Changes
**259–293** remain **VERIFIED**.

- **Activation dependency (satisfied):** Change
  **293-raider-and-patrol-rendering** is VERIFIED 10/10 and published; tip
  base `6d9931e` (origin/main).
- **Scope:** Bad Omen triggering inside a village with an ACTIVE raid
  escalates that raid (omen level + player level, cap 5; wave total per the
  152 table, never reduced), dismisses patrols and consumes the omen with one
  durable save; death clears Bad Omen durably; legacy 285/290/291/292 tests,
  comments, design notes and C292 PARITY divergence notes updated; unit +
  browser E2E.
- **Out of scope:** concurrent raids, Raid Omen (1.20.5+), omen potions, wave
  table/timeout/schema changes, HOTV math, rendering/HUD redesign; Change 258
  headed FPS/GPU work or status change; Change 295.
- Change **258** stays **BLOCKED**; Changes **259–293** stay **VERIFIED**.
  Behaviour of 285 (replace-on-omen) and 285/292 (omen kept on death) is
  superseded by 294 without reopening those changes.

## Package path

`openspec/changes/294-bad-omen-raid-escalation-and-death-parity/`
