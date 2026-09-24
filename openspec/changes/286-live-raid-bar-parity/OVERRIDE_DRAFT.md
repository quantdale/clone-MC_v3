# OVERRIDE_DRAFT — Change 286 (do not apply to live file yet)

**Status:** APPLIED at T1 activation (2026-09-24). Live addendum is in
`openspec/CHANGE_SEQUENCE_OVERRIDES.md` under
`## 286-live-raid-bar-parity — activated from published VERIFIED 285`.
Historical draft text retained below for audit; activation dependency on 282
was satisfied (282–285 all VERIFIED/published before this activation).

## ADDENDUM (paste target: `openspec/CHANGE_SEQUENCE_OVERRIDES.md`)

### 286-live-raid-bar-parity — prepared ahead of activation (draft)

The product/session instruction authorizes **spec-first preparation** of
OpenSpec change **286-live-raid-bar-parity** on worktree branch
`wt/286-live-raid-bar-parity` (base tip `722f007`) **without** editing
`origin/main`, without mutating `PROGRAM_STATE` on this branch beyond drafting
the package, and without implementing production `src/` code in the draft
session.

- **Activation dependency (satisfied):** Change **286** activated only after
  Changes **282–285** were VERIFIED and published; 285 tip `291e94a` /
  synced `1136184`. One-active-change ordering preserved.
- **Scope when activated:** HUD raid bar parity distinct from the wither
  boss bar — wave progress, optional village/settlement name presentation
  with a fixed fallback (no settlement detection), Bad Omen level
  presentation from `RaidState.badOmenLevel`, accessibility observables, and
  isolation from `#wither-boss-bar` / `HudParity` / `BossFramework`.
- **Out of scope:** Change **258** headed FPS/GPU work or status change; raider
  spawning; village detection; bad-omen acquisition; raid persistence
  namespace; combat retune; implementing production code during the draft
  session.
- **Change 258** stays **BLOCKED**; Changes **259–285** stay **VERIFIED** and
  are not reopened by activating 286.
- The live `CHANGE_SEQUENCE.md` row for 286 (if/when added at activation) MUST
  match the package name `286-live-raid-bar-parity` and the narrow outcome in
  this package's proposal.

## Package path

`openspec/changes/286-live-raid-bar-parity/`
