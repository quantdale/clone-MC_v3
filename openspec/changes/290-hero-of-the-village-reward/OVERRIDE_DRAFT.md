# OVERRIDE_DRAFT — Change 290

**Status:** To be applied to live `CHANGE_SEQUENCE_OVERRIDES.md` at T1
activation in this session (289 is already VERIFIED/published).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 290-hero-of-the-village-reward — activated from published VERIFIED 289

The product/session instruction authorizes activating OpenSpec change
**290-hero-of-the-village-reward** as the sole ACTIVE implementation change while
Change **258** remains **BLOCKED** and Changes **259–289** remain **VERIFIED**.

- **Activation dependency (satisfied):** Change **289-enchantment-persistence-reload-integrity** is
  VERIFIED 12/12 and published; tip base `0fb15f6` (origin/main).
- **Scope:** reward raid VICTORY with Hero of the Village via existing status-effect
  runtime; vanilla-like level/duration from Bad Omen; emerald trading discount
  (floor 1) shown in trading UI; exactly-once grant; DEFEAT grants nothing;
  pause/dispose/reload safety; unit + browser E2E.
- **Out of scope:** villager entities; gift-throwing; patrols/outposts; new raid
  mechanics; HUD redesign; new persistence namespace (effects remain ephemeral —
  documented); Change 258 headed FPS/GPU work or status change; Change 291
  implementation.
- Change **258** stays **BLOCKED**; Changes **259–289** stay **VERIFIED** and
  are not reopened.

## Package path

`openspec/changes/290-hero-of-the-village-reward/`
