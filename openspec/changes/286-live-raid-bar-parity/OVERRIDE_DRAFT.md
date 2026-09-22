# OVERRIDE_DRAFT — Change 286 (do not apply to live file yet)

**Status:** DRAFT ONLY. This file is intentionally stored inside the change
package so it does **not** fight `openspec/CHANGE_SEQUENCE_OVERRIDES.md` on
`origin/main` while Change 282 is still finishing. When 282 is VERIFIED and a
later session is authorized to activate 286, copy the ADDENDUM below into the
live overrides file as part of that activation's control-plane task (T4).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 286-live-raid-bar-parity — prepared ahead of activation (draft)

The product/session instruction authorizes **spec-first preparation** of
OpenSpec change **286-live-raid-bar-parity** on worktree branch
`wt/286-live-raid-bar-parity` (base tip `722f007`) **without** editing
`origin/main`, without mutating `PROGRAM_STATE` on this branch beyond drafting
the package, and without implementing production `src/` code in the draft
session.

- **Activation dependency:** Change **286 MUST NOT become ACTIVE** until
  Change **282-live-raid-feedback is VERIFIED** (and advancement gates allow
  the next sequential non-GPU change). Until then 286 remains a PLANNED
  package only.
- **Scope when activated:** HUD raid bar parity distinct from the wither
  boss bar — wave progress, optional village/settlement name presentation
  with a fixed fallback (no settlement detection), Bad Omen level
  presentation from `RaidState.badOmenLevel`, accessibility observables, and
  isolation from `#wither-boss-bar` / `HudParity` / `BossFramework`.
- **Out of scope:** Change **258** headed FPS/GPU work or status change; raider
  spawning; village detection; bad-omen acquisition; raid persistence
  namespace; combat retune; implementing production code during the draft
  session.
- **Change 258** stays **BLOCKED**; Changes **259–282** (and earlier verified
  set) stay **VERIFIED** and are not reopened by preparing 286.
- The live `CHANGE_SEQUENCE.md` row for 286 (if/when added at activation) MUST
  match the package name `286-live-raid-bar-parity` and the narrow outcome in
  this package's proposal.

## Package path

`openspec/changes/286-live-raid-bar-parity/`
