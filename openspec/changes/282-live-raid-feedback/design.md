# Design: 282-live-raid-feedback

## Context/current state

`RaidStateMachine` is a pure immutable state machine. `startRaid` returns an
active state with no spawned wave, `tickRaid` advances one fixed tick and
spawns the next deterministic roster when the current count is zero, and
`recordRaiderDeath` floors the count. It intentionally has no Game, entity, or
HUD consumer. The live Game already has a fixed simulation boundary and an
additive hidden DOM bar pattern for the wither.

## Target state

`Game` owns `raidState: RaidState | null` as transient state. Starting through
the test/debug seam calls `startRaid` at the player's finite position and one
`tickRaid` so the first wave is represented immediately. Every unpaused fixed
simulation tick applies exactly one `tickRaid` to an active state. The UI is a
single `#raid-feedback` element with a title, detail, and clamped fill. Null or
`INACTIVE` hides it; active and terminal states remain inspectable until a new
raid or dispose replaces them.

## Invariants

- The state machine remains the only authority for status, wave index, total
  waves, remaining raiders, and timeout.
- Game never mutates a `RaidState`; every transition replaces the reference.
- At most one raid state and one feedback bar exist per Game instance.
- `waveIndex` is displayed in `[1,totalWaves]` for an active started raid and
  never makes the fill progress leave `[0,1]`.
- Debug clear is bounded by the current non-negative remaining count. Calling
  it without a raid is an identity no-op; starting again replaces any prior
  active or terminal state.
- No raid state is saved, hydrated, archived, or resurrected by reload.

## API and data model

Pure view:

```ts
export interface RaidFeedbackView {
  readonly visible: boolean;
  readonly status: RaidStatus | 'NONE';
  readonly title: string;
  readonly detail: string;
  readonly progress: number;
  readonly ariaLabel: string;
}

export function projectRaidFeedback(state: RaidState | null): RaidFeedbackView;
```

Game test/debug seams:

```ts
debugStartRaid(badOmenLevel?: number): RaidState;
debugTickRaid(): RaidState | null;
debugClearRaidWave(): RaidState | null;
getRaidState(): RaidState | null;
```

`debugStartRaid` clamps invalid omen input through the existing state-machine
contract and immediately creates the first wave. `debugClearRaidWave` removes
exactly the current count, then applies one state-machine tick; it never loops
until victory and therefore remains bounded by one wave.

## Control/data flow

1. `debugStartRaid` reads the player position, calls `startRaid`, calls
   `tickRaid`, stores the returned state, and synchronizes the DOM projection.
2. The fixed-tick Game path calls `tickRaidFeedback` after other fixed world
   systems. A paused/loading/disposed path never enters it.
3. `syncRaidFeedbackHud` calls `projectRaidFeedback`, toggles `hidden`/`visible`,
   writes text/ARIA, and sets the fill width from the clamped projection.
4. `debugClearRaidWave` and `debugTickRaid` replace state and call the same
   sync path. A new start replaces terminal text and progress in one operation.
5. `dispose` hides the element and clears the transient reference; no save call
   or pagehide path sees raid data.

## Detailed behavior

- Active title is `Raid`; detail is `Wave <wave>/<total> · <remaining> raiders
  remaining`; progress is `waveIndex / totalWaves` clamped to `[0,1]`.
- Victory title is `Raid victory`; detail states that all waves were cleared;
  progress is `1`.
- Defeat title is `Raid defeated`; detail reports the reached wave count;
  progress is the clamped reached-wave fraction.
- Null and `INACTIVE` return `visible: false`, empty detail, and `progress: 0`.
- The element uses a live status label but does not create a toast, modal, or
  second input container.

## Failure modes

- Non-finite/negative omen input is handled by `startRaid`'s existing clamp;
  no exception or partial state is exposed.
- A missing DOM element makes sync return without throwing; simulation state is
  still authoritative for headless tests.
- `debugTickRaid`/`debugClearRaidWave` with null state returns null and leaves
  the hidden bar unchanged.
- Repeated terminal ticks return the exact terminal state from the state-machine
  contract and do not rewrite gameplay data beyond harmless presentation sync.

## Compatibility/migration

There is no persistence key or codec change. Existing `GamePersistence`,
`WorldArchiver`, pause, reload, and reset behavior must not mention raid state.
The new DOM is hidden at boot, so existing screenshot baselines are unchanged.

## Performance/resource constraints

One O(1) immutable transition and one small DOM projection occur per fixed tick
only while a raid is active. There is no entity scan, unbounded wave loop, new
timer, worker, texture, or GPU path.

## Testing seams

- Unit: projection boundaries and labels; Game integration with a fake/minimal
  DOM or existing Game seam for start, clear, terminal, null, and paused ticks.
- Browser: real `__voxelGame` start → visible feedback → clear all waves →
  victory → replay; a second test covers null/refusal/reload hide behavior.

## Observability/debugging

`getRaidState()` is read-only by contract for E2E assertions. The DOM exposes
`aria-live="polite"`, `aria-label`, `data-status`, and a numeric fill width;
these are the only presentation observables added.

## Affected files/symbols

- `src/ui/RaidFeedbackView.ts` (new pure projection).
- `src/engine/Game.ts` (raid state, fixed tick, DOM sync, debug seams).
- `index.html`, `src/styles.css` (hidden-by-default feedback bar).
- `tests/unit/RaidFeedbackView.test.ts`, `tests/unit/LiveRaidFeedback.test.ts`,
  `tests/e2e/raid-feedback.spec.ts`.
- `openspec/CHANGE_SEQUENCE.md`, `PARITY_MATRIX.md`, program state, audit
  manifest, and this package.

## Rejected alternatives

- Registering fake raider entities was rejected because 152 explicitly leaves
  that capability for a separate change and no compatible mob contract exists.
- Persisting `__raid__` was rejected because this change is feedback only and
  an active raid with no entity population would resurrect misleading state.
- Reusing the wither boss bar was rejected because raid progress and wither
  health have different semantics and one must not hide the other.

## Downstream dependencies

Future live raider/entity work may consume `getRaidState` or replace the debug
start seam with a real trigger, but must preserve the projection contract and
explicitly own spawning/settlement/persistence scope in a later change.
