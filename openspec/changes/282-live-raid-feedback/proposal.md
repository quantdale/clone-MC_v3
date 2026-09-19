# Proposal: 282-live-raid-feedback

## Problem

The verified `RaidStateMachine` (152) can start, advance, and resolve a bounded
raid, but its state is still invisible to the live Game. Players and browser
tests have no trustworthy indication of the current wave, remaining raiders,
or terminal outcome. The repository has no registered raider entities or
settlement detector, so the next useful seam is feedback over the existing
deterministic state machine rather than an invented mob system.

## Goals

- Give the live `Game` one ephemeral `RaidState` owner and fixed-tick it only
  while the simulation is running.
- Project active, victory, and defeat states into one accessible raid feedback
  bar showing wave progress and remaining-raider information.
- Provide deterministic browser/unit seams to start, tick, clear, inspect, and
  replay a raid without depending on random mob AI or headed rendering.
- Preserve pause, dispose, and existing HUD/container lifecycle behavior.

## Non-goals

- No pillager/vindicator/ravager/witch entity registration or mob spawning.
- No village boundary/settlement detection, bad-omen acquisition, combat, or
  raid sound/particle system.
- No IndexedDB namespace, archive format, or persistence migration for this
  ephemeral feedback state.
- No boss-bar replacement, HUD golden re-pin, render-worker work, headed FPS or
  GPU evidence, or Change 258 status change.

## Preconditions

- Change 152's `RaidStateMachine` and codec are VERIFIED and remain the sole
  lifecycle authority.
- Change 276's existing HUD boss-bar pattern is available as a DOM/lifecycle
  precedent, but the raid bar is a separate element.
- Change 281 is VERIFIED and published; Change 258 remains BLOCKED.

## Dependencies

- `src/simulation/RaidStateMachine.ts` for immutable transitions and bounded
  wave counts.
- Existing `Game` fixed-tick boundary, HUD root, toast-free DOM presentation,
  and test-only `__voxelGame` seam.

## Proposed change

1. Add `src/ui/RaidFeedbackView.ts`, a pure total projection from
   `RaidState | null` to clamped visibility, status, label, detail, and bar
   progress.
2. Add `#raid-feedback` with title/detail/fill descendants and hidden-by-default
   CSS; `Game` owns and updates it through one sync method.
3. Add Game-owned ephemeral raid methods: start at the player position,
   fixed-tick, clear the current wave, inspect the immutable state, and replay.
   These methods are deterministic test/debug seams; they do not spawn entities.
4. Add focused unit and browser coverage for projection, state transitions,
   terminal outcomes, pause/no-state behavior, accessibility, and replay.

## Compatibility and migration

No stored data, public save envelope, registry id, or archive schema changes.
Existing HUD elements and wither boss-bar behavior remain byte-for-byte
independent. A missing/removed raid element makes the presentation a safe
no-op; a null or terminal-free state hides the bar without mutating gameplay.

## Risks

- A new visible HUD node could alter visual captures if accidentally visible
  at boot; it is hidden by default and has no active-state fixture in the
  existing visual matrix.
- A live tick could drift while paused if wired outside the fixed-tick boundary;
  the focused integration test pins the state before and during pause.
- Repeated start/clear calls could leave stale DOM text; every state replacement
  must run the same projection sync and terminal replay must replace the prior
  state atomically.

## Rollback strategy

The change is additive. Revert the 282 implementation/docs commits together;
no migration or data repair is required because raid state is not persisted.

## Definition of Done

- The complete OpenSpec package passes the authoring gate before production edits.
- All MUST/SHALL requirements have unit or browser scenarios, including
  invalid/duplicate/replay/pause/dispose behavior.
- Focused tests, typecheck, lint, full unit, build, exact browser regression,
  file-audit, and state validation are recorded truthfully.
- C282 is exact and VERIFIED at 100%; 258 remains BLOCKED; the next sequential
  slot is checkpointed without implementing it.

## Advancement gate

Advance only at 10/10 tasks, all mandatory requirements passing, and the normal
publication handoff verified on `origin/main`. No advancement exception is
planned.
