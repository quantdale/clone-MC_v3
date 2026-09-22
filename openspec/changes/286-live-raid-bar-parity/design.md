# Design: 286-live-raid-bar-parity

## Context/current state

`RaidStateMachine` (152) is pure and immutable: status, center, wave index,
total waves, raiders remaining, `badOmenLevel`, ticks. Change 282 adds a pure
`projectRaidFeedback` and a single Game-owned `#raid-feedback` bar with
wave/remaining detail, clamped fill, `aria-live`, and dispose hide. Change 276
owns the independent wither path (`#wither-boss-bar` via
`WitherBossBarParity`/`HudParity`). No village/settlement detector exists;
`badOmenLevel` is already on `RaidState` but is not presented.

## Target state

One additional pure projection (working name `projectRaidBar`) maps
`RaidState | null` plus an optional presentation context into a total
`RaidBarView` with:

- visibility and status (same vocabulary as 282);
- wave/total and remaining (re-derived, not trusted from DOM);
- clamped `progress` in `[0,1]`;
- clamped `badOmenLevel` as a non-negative integer;
- optional `villageName` (caller-supplied or omitted → documented fallback);
- structured `ariaLabel` and `dataStatus` observables.

The live raid bar remains a DOM node distinct from `#wither-boss-bar`
(separate id, classes, and `data-raid-bar` hook). It MUST NOT read
`BossFramework`, `HudBossBar`, or `WitherBossBarParity`. Game continues to own
one ephemeral raid state; 286 only deepens presentation.

## Invariants

1. `RaidStateMachine` remains the only lifecycle authority; the projection
   never mutates input.
2. Projection is total for `null` and every valid `RaidState`; never throws.
3. Wave progress, omen level, and fill are finite and clamped
   (`progress ∈ [0,1]`, `badOmenLevel ∈ [0, …]` integer floor).
4. At most one raid bar node exists per Game instance; it is hidden for
   null/`INACTIVE` and after dispose.
5. Village name is never invented from coordinates; absent/empty/whitespace
   input yields the documented fallback (empty string or generic "Settlement"
   label — exact fallback pinned in the spec).
6. Raid bar and wither boss bar never share an id, `data-*` status token used
   for selection, or projection function.
7. No persistence, archive row, entity registration, or GPU/FPS path.

## API and data model

```ts
export interface RaidBarContext {
  readonly villageName?: string;
}

export interface RaidBarView {
  readonly visible: boolean;
  readonly status: 'NONE' | 'INACTIVE' | 'ACTIVE' | 'VICTORY' | 'DEFEAT';
  readonly title: string;
  readonly detail: string;
  readonly villageName: string;
  readonly badOmenLevel: number;
  readonly wave: number;
  readonly totalWaves: number;
  readonly raidersRemaining: number;
  readonly progress: number;
  readonly ariaLabel: string;
}

export function projectRaidBar(
  state: RaidState | null,
  context?: RaidBarContext,
): RaidBarView;
```

282's `projectRaidFeedback` remains the minimal wave/remaining view; 286 MAY
either extend it additively or introduce `projectRaidBar` as the richer
parity view. The chosen approach is fixed in the implementation task (prefer a
new pure module so 282's contract stays byte-stable).

## Control/data flow

1. Game fixed-tick / state replacement still produces `RaidState | null`.
2. Presentation sync calls `projectRaidBar(state, { villageName })`.
3. DOM update writes title/detail/village/omen/fill, toggles
   `hidden`/`visible`, sets `data-status`, `aria-label`, and optional
   `aria-valuenow` on the fill.
4. Dispose hides the node and clears transient references; reload never
   resurrects raid or village strings from storage (there is none).

## Detailed behavior

- `null` / `INACTIVE` → hidden, empty strings, `progress: 0`,
  `badOmenLevel: 0`, `status: 'NONE'` or `'INACTIVE'` as pinned.
- `ACTIVE` → visible; detail includes `Wave <w>/<t>` and remaining;
  `progress = clamp(wave/total)`; omen shown when `badOmenLevel >= 1`
  (or always — pin in spec); village name from context or fallback.
- `VICTORY` / `DEFEAT` → visible terminal copy with last wave and omen;
  progress per 282 rules (victory 1, defeat reached/total).
- Missing DOM → presentation no-op; simulation state remains authoritative.
- Reduced motion: CSS must not require animation for state changes; optional
  `prefers-reduced-motion` guards only.

## Failure modes

- Non-finite state counters → clamped like 282 (`safeCount` / `clamp01`).
- Non-string / empty village name → fallback; never throws.
- Duplicate `projectRaidBar` calls with identical inputs → idempotent DOM
  writes (same attributes).
- Stale sync after dispose → no-op (element ref null).
- Reload → no raid, no village name, no omen badge.

## Compatibility/migration

No persistence key, codec, or registry change. `#wither-boss-bar` and 282's
feedback tests remain green. Visual goldens: bar hidden at boot so existing
60-cell matrix unchanged unless an active-raid fixture is deliberately added
later (out of scope for the draft).

## Performance/resource constraints

One O(1) pure projection and bounded DOM attribute/text writes per active
fixed tick. No entity scan, unbounded loop, worker, texture, or GPU path.

## Testing seams

- Unit: projection totality, clamps, village fallback, omen display rules,
  terminal states, isolation from boss-bar types.
- Browser: start raid → bar shows wave + omen + village fallback → clear →
  victory → dispose/reload hide; assert `#wither-boss-bar` untouched.

## Observability/debugging

`data-status`, `data-raid-bar`, `aria-label`, and numeric fill width are the
deterministic test observables. `getRaidState()` remains read-only.

## Affected files/symbols

- New: `src/ui/RaidBarParity.ts` (or equivalent pure module).
- Later activation: Game sync path, `index.html`/`src/styles.css` raid-bar
  styles (additive), unit + e2e tests.
- Not touched in draft: `PROGRAM_STATE*`, `CHANGE_SEQUENCE*`,
  `PARITY_MATRIX.md`, `src/`, main-landing tests.

## Rejected alternatives

- Folding omen/village into `HudParity` boss bars — rejected: raid is not a
  boss health bar and would couple unrelated systems.
- Deriving village name from `(centerX, centerZ)` — rejected: no settlement
  detector; inventing names is non-deterministic fiction.
- Persisting village/omen presentation — rejected: 282 state is ephemeral;
  reload must hide.

## Downstream dependencies

283+ raid persistence or wave-spawning changes MAY supply a real village name
into `RaidBarContext` without changing the projection contract. 286 does not
implement those changes.
