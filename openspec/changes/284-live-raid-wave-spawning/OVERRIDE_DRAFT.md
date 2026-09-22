# OVERRIDE_DRAFT — CHANGE_SEQUENCE_OVERRIDES.md ADDENDUM (draft only)

> **DRAFT ONLY.** Do not paste into the live `openspec/CHANGE_SEQUENCE_OVERRIDES.md`
> from this worktree while Change 282 is still finishing on `main` if that edit
> would fight `origin/main`. Apply this addendum on `main` only when the owner
> or the activating session intentionally records 284's control-plane row and
> activation. This file lives inside the 284 package so the authoring session
> never mutates live overrides/PROGRAM_STATE on the documentation branch.

---

## 284-live-raid-wave-spawning — package prepared in advance (draft)

Change **284-live-raid-wave-spawning** has a complete OpenSpec package at
`openspec/changes/284-live-raid-wave-spawning/` authored on branch
`wt/284-live-raid-wave-spawning` (base tip `722f007`) while Change
**282-live-raid-feedback** is still the active implementation change on
`main` and Change **258** remains **BLOCKED**.

### Dependency and activation

- **Activates only after Change 282 is VERIFIED.** 284 consumes 282's
  Game-owned ephemeral raid state, fixed-tick `tickRaid` (including spawn
  rosters), debug start/clear/replay, and inspect seams.
- Under the unchanged one-active-change ordering contract, no
  higher-numbered change may be implemented while a lower-numbered change is
  incomplete: **283-live-raid-persistence remains the reserved next
  sequential slot after 282.** Implementation of 284 therefore also requires
  that 283 be VERIFIED, intentionally deferred/superseded by an explicit
  owner decision, or renumbered by a separate override — 284 MUST NOT be
  activated as sole ACTIVE while 283 is merely PLANNED and in the way.
- Authoring this package does **not** activate 284, does **not** change
  `PROGRAM_STATE`, and does **not** authorize production edits.

### Scope limits when 284 is eventually activated

- 284 MUST remain limited to: raider type registration (append-only),
  pure wave spawn planning, injectable entity backend (headless fake +
  production adapter), Game wave spawn/despawn lifecycle over 152
  transitions + 282 seams, exactly-once `recordRaiderDeath` alignment, tests,
  and exact state/parity evidence.
- 284 MUST NOT implement bad-omen acquisition, settlement/village detection,
  a new persistence/archive namespace (that is 283's lane), HUD redesign,
  raider combat/AI redesign, Change 258 headed FPS/GPU work, or any fake GPU
  evidence. Change 258 MUST NOT be marked VERIFIED by the 284 track.
- Existing 282 feedback projection, wither boss bar, smoker/furnace/brewing/
  shield/trading/death/respawn behavior remain the regression boundary.

### Sequence row (to add to `CHANGE_SEQUENCE.md` only on activation)

| # | Change | Narrow outcome |
|---|---|---|
| 284 | `284-live-raid-wave-spawning` | Spawn/despawn live raid wave entities from `RaidStateMachine` wave transitions through an injectable entity backend (headless CI fake + production adapter), append-only raider registry keys, all-or-nothing per-wave apply with rollback, exactly-once death→`recordRaiderDeath`, terminal/clear/dispose despawn, reload non-resurrection; no bad omen, no settlement detection, no new persistence namespace, no 258 headed work. |

### Reservation note

The slot after 284 is intentionally unspecified here; the next change after
284 (if any) requires its own spec-first package and owner/sequence decision.
