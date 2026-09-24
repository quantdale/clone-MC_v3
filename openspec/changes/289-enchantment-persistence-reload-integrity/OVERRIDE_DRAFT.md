# OVERRIDE_DRAFT — Change 289

**Status:** To be applied to live `CHANGE_SEQUENCE_OVERRIDES.md` at T1
activation in this session (288 is already VERIFIED/published).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 289-enchantment-persistence-reload-integrity — activated from published VERIFIED 288

The product/session instruction authorizes activating OpenSpec change
**289-enchantment-persistence-reload-integrity** as the sole ACTIVE
implementation change while Change **258** remains **BLOCKED** and Changes
**259–288** remain **VERIFIED**.

- **Activation dependency (satisfied):** Change **288-raider-combat-behavior**
  is VERIFIED 11/11 and published; tip base `e1ecc81` (origin/main).
- **Scope:** find and fix the true root cause of enchantments reading null
  after pagehide+reload; inventory component codec integrity; pagehide /
  concurrent-flush durability; apply-time player-state save; unit + browser
  e2e with before/after repeat rates.
- **Out of scope:** storage-layer redesign; new persistence namespace (unless
  proven missing); enchanting UI changes; GPU/FPS / Change 258 status change;
  Change 290 implementation.
- Change **258** stays **BLOCKED**; Changes **259–288** stay **VERIFIED** and
  are not reopened.

## Package path

`openspec/changes/289-enchantment-persistence-reload-integrity/`
