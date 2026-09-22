# Proposal: 286-live-raid-bar-parity

## Problem

Change 282 introduces a bounded ephemeral `#raid-feedback` bar over the verified
`RaidStateMachine`, but its presentation contract stops at wave/remaining text and
a clamped fill. Vanilla-like raid HUD parity also surfaces settlement/village
identity and Bad Omen level, and the bar must remain an independent raid
presentation — not a reuse of the wither `#wither-boss-bar` / `HudBossBar`
path. Without a separate normative package, those presentation rules would be
smuggled into 282 or conflated with Change 276 boss-bar parity.

## Goals

- Define one pure, total raid-bar projection that exposes wave progress, an
  optional village/settlement name, and the clamped Bad Omen level together.
- Keep the raid bar a distinct DOM/identity from `#wither-boss-bar` and
  `BossFramework`/`HudBossBar` snapshots.
- Require accessible labels, `data-*` observables, and reduced-motion-safe
  presentation for active and terminal raid states.
- Pin invalid, duplicate, stale, reload, dispose, and missing-DOM behavior as
  MUST/SHALL scenarios.
- Sequence implementation tasks so 286 activates only after 282 is VERIFIED.

## Non-goals

- No Change 258 headed FPS/GPU work, fake GPU evidence, or 258 status change.
- No raider entity spawning, village/settlement detection, bad-omen acquisition,
  raid persistence/archive namespace, or combat retune.
- No wither boss-bar redesign, `BossFramework` change, or HudParity boss-bar
  contract change.
- No production `src/` or main-landing test implementation in this draft
  session; only the OpenSpec package and `OVERRIDE_DRAFT.md`.

## Preconditions

- Change 152's `RaidStateMachine` remains the sole raid lifecycle authority.
- Change 282 (`282-live-raid-feedback`) is VERIFIED with Game-owned ephemeral
  raid state and a single `#raid-feedback` lifecycle (or is at least complete
  enough that 286's projection can sit on top without re-specifying 282).
- Change 276's wither boss-bar path remains the independent regression boundary.
- Change 258 remains BLOCKED; Changes 259–282 (and any earlier verified
  changes) remain VERIFIED.

## Dependencies

- `src/simulation/RaidStateMachine.ts` for status, wave index, total waves,
  remaining raiders, and `badOmenLevel`.
- Change 282's `RaidFeedbackView` / `#raid-feedback` as the base presentation
  seam (286 extends the projection contract; it does not replace the state
  machine).
- Existing HUD a11y patterns (`aria-label`, `aria-live`, `data-status`) from
  282 and sibling UI panels.

## Proposed change

1. Author this complete OpenSpec package under
   `openspec/changes/286-live-raid-bar-parity/` (proposal, design, tasks,
   verification, normative capability spec).
2. Draft (do not apply) a short `CHANGE_SEQUENCE_OVERRIDES.md` ADDENDUM in
   `OVERRIDE_DRAFT.md` recording that 286 is prepared ahead of activation and
   may activate only after 282 is VERIFIED.
3. On future activation (after 282 VERIFIED), implement a pure
   `projectRaidBar` (name TBD in design) that is total for `null` and every
   valid `RaidState`, exposing wave progress, optional village name, and
   omen level with clamped numeric fields.
4. Wire the distinct raid bar element (separate from `#wither-boss-bar`) to
   that projection, with accessible labels and `data-*` observables.
5. Add focused unit and browser coverage for projection boundaries, a11y,
   invalid/duplicate/stale/reload/failure rules, and boss-bar isolation.

## Compatibility and migration

No stored data, registry id, archive schema, or persistence namespace changes.
The raid bar remains ephemeral. Existing wither boss-bar, 282 feedback
contract (as verified), and HUD goldens stay independent; the new presentation
fields are additive to the pure view only. Missing DOM is a presentation
no-op.

## Risks

- Overlapping labels with the wither bar could confuse a11y or E2E selectors;
  the design forbids shared ids/classes and requires distinct `data-*` hooks.
- Presenting a village name without settlement detection could invent data;
  the spec requires an explicit optional input with a documented fallback and
  forbids synthesizing names from coordinates.
- Premature activation before 282 is VERIFIED would break ordering; the
  OVERRIDE_DRAFT and proposal Preconditions make 282-VERIFIED a hard gate.

## Rollback strategy

Additive package only in this session. Revert the future implementation/docs
commits together; no migration or data repair because nothing is persisted.

## Definition of Done

- The complete package passes the SPEC_AUTHORING_PROTOCOL quality gate
  (every MUST/SHALL has scenarios; invalid/duplicate/stale/reload/failure
  covered; tasks cover implementation through final gate).
- `OVERRIDE_DRAFT.md` is present in the package and does not edit the live
  overrides file.
- Implementation is deferred: no `src/` production edits, no main-landing
  tests, no PROGRAM_STATE mutation on this branch.
- When later activated: C286 is exact and VERIFIED at 100%; 258 remains
  BLOCKED; no GPU/FPS evidence claimed.

## Advancement gate

Advance only after activation on a branch where 282 is VERIFIED, at 100% task
completion, all mandatory MUST/SHALL requirements passing, required gates
green, and no unresolved a11y/isolation/regression blocker. No advancement
exception is planned.
