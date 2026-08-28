# Design: 046-singleplayer-pause-semantics

## Context / current state

044 emits fixed simulation ticks when the render loop feeds it timestamps; 045 interpolates renders
between ticks. Nothing gates the clock while a menu is open or pointer lock is lost.

## Target state

A `PauseManager` holds a set of active pause reasons. `isPaused` is true while the set is non-empty.
The game loop (future wiring) stops feeding the 044 clock while `isPaused` — the simulation freezes;
UI, rendering, and non-sim timers continue by construction. A named vocabulary documents the known
pause sources.

## Invariants

- `pause(reason)` adds the reason (idempotent); `resume(reason)` removes it (idempotent).
- `isPaused === activeReasons.size > 0`.
- Listeners fire only when `isPaused` actually changes; `onChange` returns an unsubscribe.
- `resumeAll()` empties the set.
- `reasons` lists the active reasons in insertion order.

## API and data model

```ts
// src/engine/PauseManager.ts
export const PAUSE_REASONS = {
  menuOpen: 'menu-open',
  pointerLockLost: 'pointer-lock-lost',
  windowBlur: 'window-blur',
  autoPause: 'auto-pause',
} as const;
export type PauseReason = string;
export class PauseManager {
  pause(reason: PauseReason): void;
  resume(reason: PauseReason): void;
  get isPaused(): boolean;
  get reasons(): string[];
  onChange(listener: (paused: boolean) => void): () => void;
  resumeAll(): void;
}
```

## Control / data flow

1. A pause source (menu, pointer-lock loss, blur, auto-pause) calls `pause(reason)`.
2. The game loop checks `pauseManager.isPaused`; while true it does not call
   `simulationClock.update(...)`, so no fixed ticks are emitted (simulation freezes exactly).
3. When the source clears, it calls `resume(reason)`; when the last reason clears, the loop resumes
   feeding the clock (the clock's anchor/accumulator semantics make the resumed time step safe).
4. `onChange` listeners (e.g. HUD overlay toggling) are notified only on real transitions.

## Detailed behavior

- `pause`/`resume` are idempotent (Set semantics).
- A `resume` for an unknown reason is a no-op.
- `resumeAll()` clears all reasons and notifies if paused state changed.

## Failure modes

- Orphaned reasons: mitigated by the explicit vocabulary and `resumeAll()`.
- Listener throwing during notification: listeners are invoked defensively (each in its own try/catch
  so one failure cannot break the rest).

## Compatibility / migration

Additive; no existing behavior changes; no consumers yet.

## Performance / resource constraints

O(1) pause/resume; listener fan-out is O(listeners).

## Testing seams

- `tests/unit/PauseManager.test.ts`:
  - single reason: pause → paused, resume → unpaused;
  - multi-reason: paused until the last reason is released;
  - idempotency: double pause / double resume;
  - unknown-reason resume is a no-op;
  - listeners fire only on transitions; unsubscribe works;
  - `resumeAll`; `reasons` order.

## Observability / debugging

`reasons` and `isPaused` give an exact picture of why the simulation is frozen.

## Affected files / symbols

- `src/engine/PauseManager.ts` — NEW.
- `tests/unit/PauseManager.test.ts` — NEW.

## Rejected alternatives

- *A single boolean pause flag*: cannot represent overlapping pause sources; a reason set is the
  minimal correct model.
- *Ref-counted pauses*: double-release bugs; a Set is idempotent and simpler.

## Downstream dependencies

046's manager gates 044 clock feeding in the game wiring (later change); 198 (sleep) and menu systems
(202+) add their own reasons to the vocabulary.
