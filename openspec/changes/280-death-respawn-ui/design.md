# Design: 280-death-respawn-ui

## Context/current state

`SurvivalSystem.damage(amount, reason)` already has the exact reason at the
death edge, but its callback currently exposes only `(event, amount)`. `Game`
handles the callback by recording statistics, routing hardcore mode, invoking
the existing safe respawn/bed target, resetting vitals, and showing a toast.
All of that is correct and must remain the authority. Existing panels close in
`respawnPlayer`; HUD chips are DOM-backed and hidden with the shared class.

## Target state

The death callback optionally supplies its reason. A pure presentation adapter
maps it to a stable player-facing label. `Game` owns transient
`DeathPresentationState` and a `DeathRespawnPanel`; after the current death
transition completes it renders a card with:

- `You Died` title;
- `Cause: <label>`;
- `Respawned safely` for normal worlds;
- `Hardcore death — now spectating` for hardcore worlds; and
- an idempotent dismiss button (`Continue` or `Continue spectating`).

The card does not pause or undo the already-completed state transition. Its
background is pointer-passive so existing canvas/HUD controls remain reachable;
the button is the only interactive element. Pointer lock and opening another
container dismiss the card before that interaction becomes authoritative.

## Invariants

- `SurvivalSystem` remains the only health/death authority; no second death
  state or duplicate respawn call is introduced.
- Reason normalization is closed and fail-safe; arbitrary text is never placed
  into the DOM as a cause.
- Normal death still returns to the existing survival mode and safe spawn/bed
  position; hardcore death still routes to spectator and never returns to
  survival through this UI.
- The card is transient, absent from snapshots/archives, and hidden on boot.
- Dismiss is identity-safe: repeated clicks and dismiss calls do not mutate
  player state, mode, health, inventory, or persistence.

## API and data model

New pure module:

```ts
type DeathCause = 'fall' | 'drowning' | 'lava' | 'starvation' |
  'wither' | 'debug' | 'damage' | 'unknown';
type DeathOutcome = 'respawned' | 'spectating';

normalizeDeathCause(reason: unknown): DeathCause;
formatDeathCause(cause: DeathCause): string;
createDeathPresentation(reason: unknown, hardcore: boolean): DeathPresentation;
```

`DeathPresentation` contains only normalized cause, visible title/detail,
outcome, and button label. The Game read seam is:

```ts
getDeathPresentationState(): {
  open: boolean;
  cause: string;
  outcome: 'respawned' | 'spectating' | null;
  actionLabel: string;
};
dismissDeathScreen(): boolean;
```

The existing `SurvivalEvent` callback gains `reason?: string`; the existing
event name/amount and `SurvivalSnapshot` remain unchanged.

## Control/data flow

1. `SurvivalSystem.damage` emits `death` with its existing reason.
2. `Game.onSurvivalEvent` records statistics and routes hardcore exactly as
   today, then calls the existing `respawnPlayer` once.
3. Game creates normalized presentation data and the panel renders it.
4. A real DOM button calls `dismissDeathScreen`; pointer lock/container-open
   lifecycle paths also dismiss it before accepting gameplay interaction.
5. Reload constructs a new hidden panel; no persistence read/write occurs.

## Failure modes

Malformed/non-string/unknown reasons become `Unknown damage`; they cannot
throw or inject arbitrary DOM text. If the panel element is absent, the
composition remains null-safe and the existing toast/respawn path continues.
Repeated death callbacks after `SurvivalSystem` has marked itself dead remain
ignored by that existing system; repeated dismiss is a false no-op.

## Performance/resource constraints

Cause mapping and rendering happen only on death/dismiss/lifecycle events.
Fixed ticks do not allocate or rewrite the card. No render, worldgen, worker,
or storage path changes.

## Testing seams

Unit tests cover the reason map, unknown fallback, normal/hardcore outcome,
panel render/dismiss idempotence, and optional event compatibility. Browser
E2E uses `debugKillPlayer` only to make a deterministic death, observes the
real DOM card, dismisses it through the real button, and verifies normal and
hardcore outcomes while the existing hardcore/bed tests remain green.

## Affected files/symbols

- `src/player/SurvivalSystem.ts` — optional death reason callback argument.
- `src/simulation/DeathRespawnPresentation.ts` — pure cause/outcome mapping.
- `src/ui/DeathRespawnPanel.ts` — DOM panel renderer and action.
- `src/engine/Game.ts` — transient store, event wiring, lifecycle seam.
- `index.html`, `src/styles.css` — hidden card shell and original CSS.
- `tests/unit/*Death*`, `tests/unit/SurvivalSystem.test.ts`,
  `tests/e2e/death-respawn.spec.ts`, and state/matrix artifacts.

## Rejected alternatives

- Deferring normal respawn until a button click was rejected because 267/274
  already certify synchronous respawn and changing it would broaden scope.
- Persisting the last death was rejected because it is session presentation,
  not world/player state.
- Injecting raw reason strings into the DOM was rejected for integrity and
  localization-safe determinism.

## Downstream dependencies

281 may add a workstation panel but must keep the death card under the existing
one-container rule. Later combat changes may supply new reasons; unknown values
will remain safe until explicitly mapped.
