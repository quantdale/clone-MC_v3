# Design: 228-client-prediction-reconciliation

## Context/current state

- 227 `MovementAuthority` (NEW) — the server's authoritative validator; returns
  `{ accepted: true; position }` or `{ accepted: false; correction; reason }`. The client
  reconciles against these results.
- Client side: `src/player/Player.ts` holds a `position`; this change does NOT touch it —
  the reconciler is the headless model the future client input pipeline will use.

## Target state

A pure headless client-side movement reconciler: a predicted position, a confirmed tick,
and a bounded buffer of pending intents. `predict` advances the predicted position locally
and buffers the intent; `reconcile` snaps to the server's authoritative position for a tick
and replays buffered intents newer than that tick, so the client stays consistent with the
server whether or not its prediction was correct.

## Invariants

- The predicted position is always finite.
- `predict(position, tick)` requires `tick > confirmedTick` (the client only predicts at a
  tick newer than the last confirmed one) and finite coordinates.
- `reconcile` applies only when `authoritativeTick > confirmedTick`; equal/older corrections
  are ignored (no-op).
- On a newer correction: `predicted` snaps to `authoritativePosition`, then each buffered
  intent with `tick > authoritativeTick` is re-applied (in tick order), and buffer entries
  `<= authoritativeTick` are dropped.
- Malformed inputs (non-finite coords, non-integer/negative ticks) throw and change nothing.
- `reset()` restores the pristine pre-prediction state.

## API and data model

```ts
// src/simulation/MovementReconciler.ts
export interface Position {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PendingIntent {
  readonly tick: number;
  readonly position: Position;
}

export interface MovementReconcilerOptions {
  /** Bounded pending-intent buffer size; positive integer (default 1024). */
  readonly maxPending?: number;
}

export class MovementReconciler {
  constructor(options?: MovementReconcilerOptions); // throws on invalid maxPending

  predict(position: Position, tick: number): void;
  reconcile(authoritativePosition: Position, authoritativeTick: number): void;

  get predicted(): Position;       // copy
  get confirmedTick(): number;
  get pendingCount(): number;      // buffer size
  get pending(): readonly PendingIntent[]; // snapshot, oldest-first
  reset(): void;
}
```

Internal state: `{ predicted: Position, confirmedTick: number, pending: PendingIntent[] }`.

## Control/data flow

```
predict(p, t)    validate finite p, non-negative safe-int t, t > confirmedTick
                 → predicted = p; pending.push({ tick: t, position: p })

reconcile(ap, at) validate finite ap, non-negative safe-int at
                 if at <= confirmedTick → no-op (stale)
                 else: predicted = ap; confirmedTick = at
                       for p in pending if p.tick > at: predicted = p.position
                       pending = pending.filter(p => p.tick > at)

reset()         predicted = {0,0,0}; confirmedTick = 0; pending = []
```

## Detailed behavior

- **Construction**: `maxPending` must be a positive integer (default 1024); rejections throw
  `MovementReconciler: <detail>`. Pristine: predicted `{0,0,0}`, confirmedTick 0, empty
  pending.
- **`predict`**: validates finite coordinates and a non-negative safe-integer `tick`; the
  tick MUST be strictly greater than `confirmedTick` (else throw
  `MovementReconciler: predict tick must be greater than confirmed tick`). On success it
  advances the predicted position and appends the intent to the buffer. If the buffer would
  exceed `maxPending` after the push, throw `MovementReconciler: pending buffer full`
  (documented bounded-resource guard) BEFORE mutating.
- **`reconcile`**: validates finite coordinates and a non-negative safe-integer tick;
  malformed input throws without state change. If `authoritativeTick <= confirmedTick` the
  correction is stale and ignored (no-op). Otherwise it snaps `predicted` to
  `authoritativePosition`, sets `confirmedTick = authoritativeTick`, re-applies every buffered
  intent with `tick > authoritativeTick` (in buffer order — the latest surviving intent wins),
  and drops buffer entries `<= authoritativeTick`.
- **Determinism**: identical predict/reconcile sequences on identical reconcilers yield
  identical `predicted`, `confirmedTick`, `pendingCount`, and `pending` snapshot at every step.

## Failure modes

- Malformed input (non-finite coords, non-integer/negative tick) → descriptive throw, no
  state change.
- `predict` at a tick not newer than confirmed → descriptive throw, no state change.
- `reconcile` with a stale tick → silent no-op (server corrections can arrive out of order).

## Compatibility/migration

Additive: new exported names only. No registry, save format, or existing public API
changes. `confirmedTick` starts at 0 so the first correction and the first predict are
deterministic.

## Performance/resource constraints

- `predict` O(1) (append); `reconcile` O(pending) replay; bounded buffer O(maxPending).
- Memory: O(maxPending) intents. No timers, IO, DOM, or network.

## Testing seams

- Scripted `predict`/`reconcile` sequences — no fakes, no timers.
- Small `maxPending` (e.g. 3) to pin the buffer-full guard.

## Observability/debugging

- `predicted`, `confirmedTick`, `pendingCount`, `pending` snapshot — passive state; exact
  `MovementReconciler: <detail>` error strings.

## Affected files/symbols

- NEW `src/simulation/MovementReconciler.ts` — `Position`, `PendingIntent`,
  `MovementReconcilerOptions`, `MovementReconciler`.
- NEW `tests/unit/MovementReconciler.test.ts`.
- Docs/state: `openspec/PROGRAM_STATE.json`, `openspec/PROGRAM_STATE.md`.

## Rejected alternatives

- **Replay as deltas instead of absolute positions**: rejected — buffering absolute predicted
  positions is simpler, deterministic, and matches how a client stores its predicted state.
- **Apply stale corrections**: rejected — only strictly-newer corrections are valid; older
  ones are superseded.
- **Drop newest on buffer-full**: rejected — the newest intents are the client's current
  intent; the guard throws instead so the caller must advance confirmation.
- **Include render interpolation**: rejected — out of the narrow outcome scope; render-side
  interpolation is a later concern.

## Downstream dependencies

- 229 `entity-replication` and 230 `block-interaction-networking` will feed predicted intents
  to `predict` and server corrections to `reconcile` over 223's codecs, using 224 tick
  numbers. The future client input pipeline owns the actual integration.
