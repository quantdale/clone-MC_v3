# Design: 272-lighting-clock-dt-sync

## Context/current state

`Lighting.update(dt, focus?)` (`src/rendering/Lighting.ts:62-96`):

```ts
const effectiveDt = this.frozen ? 0 : Math.max(0, Math.min(dt, CONFIG.maxDeltaTime));
this.worldSeconds = (this.worldSeconds + effectiveDt) % CONFIG.dayNight.dayLength;
let directionChanged = false;
if (CONFIG.dayNight.enabled && !this.frozen) {
  const anglePerSecond = (Math.PI * 2) / CONFIG.dayNight.dayLength;
  this.sunDirection.applyAxisAngle(this.dayNightAxis, -anglePerSecond * dt); // BUG: raw dt
  directionChanged = true;
}
```

`CONFIG.maxDeltaTime = 0.1`, `CONFIG.dayNight.dayLength = 600`
(`src/config/index.ts:76,139`). `anglePerSecond = 2π/600`.

Consequences today:

- `dt <= 0.1` (normal pacing): clock and sun agree (clamp is identity).
- `dt > 0.1` (hitch, tab-switch catch-up, `update(CONFIG.dayNight.dayLength)`
  in tests): `worldSeconds` advances 0.1 s worth while the sun rotates the
  full raw dt — sun runs ahead of the clock by `(dt - 0.1) * anglePerSecond`.
- `dt < 0`: clock clamps to 0; sun rotates **backwards** (raw negative dt).
- frozen: clock frozen (effectiveDt 0) and sun frozen (guard) — consistent by
  accident of the guard, not of shared dt.

Callers pass real frame deltas (`Game` render loop), so hitches desync the
visible sun from `getTimeOfDayHours()` until the next full day wraps both
back into phase. Presentation-only (R-9 LOW); no simulation reads
`worldSeconds`.

## Target state

```ts
const effectiveDt = this.frozen ? 0 : Math.max(0, Math.min(dt, CONFIG.maxDeltaTime));
this.worldSeconds = (this.worldSeconds + effectiveDt) % CONFIG.dayNight.dayLength;
let directionChanged = false;
if (CONFIG.dayNight.enabled && !this.frozen) {
  const anglePerSecond = (Math.PI * 2) / CONFIG.dayNight.dayLength;
  this.sunDirection.applyAxisAngle(this.dayNightAxis, -anglePerSecond * effectiveDt);
  directionChanged = true;
}
```

The diff is one token: `dt` → `effectiveDt` in the `applyAxisAngle` call.
Everything else (guard, axis, sign, daylight-factor derivation, shadow-focus
logic, freeze hook) is untouched.

## Invariants

- I-1: After any `update(dt)` with `dayNight.enabled` and unfrozen, the sun
  rotation angle equals `-anglePerSecond * effectiveDt` where `effectiveDt`
  is exactly the increment applied to `worldSeconds` (modulo wrap).
- I-2: Frozen (`freezeDayNight` set): `worldSeconds`, `sunDirection`, and the
  derived daylight factor never advance for any dt (245 contract preserved).
- I-3: Negative dt advances neither clock nor sun (clock already clamped;
  sun now shares the clamp).
- I-4: Normal pacing (`0 <= dt <= maxDeltaTime`, unfrozen): behavior is
  bit-identical to pre-fix (clamp is identity, so `effectiveDt === dt`).

## API and data model

No API change. No data-model change. `update(dt, focus?)`, `freezeDayNight`,
`getTimeOfDayHours`, `getSunDirection`, `getDaylightFactor`, `dispose` keep
their signatures and contracts; only the hitch-dt sun advance changes (toward
consistency with the clock).

## Control/data flow

`update(dt)`:

1. `effectiveDt = frozen ? 0 : clamp(dt, 0, 0.1)` (unchanged).
2. `worldSeconds = (worldSeconds + effectiveDt) % 600` (unchanged).
3. If enabled and unfrozen: rotate sun by `-2π/600 * effectiveDt` (CHANGED:
   was raw `dt`).
4. Recompute daylight factor from sun y, lerp colors/intensities (unchanged).
5. Shadow-focus repositioning on move-or-rotation (unchanged; `directionChanged`
   still true whenever enabled+unfrozen, even for dt = 0 — same as today).

## Detailed behavior

- Hitch (`dt = 5`, unfrozen, enabled): clock advances 0.1 s; sun rotates
  `-2π/600 * 0.1`. Equivalent to 1 clamped step. Test pins
  `update(5)` ≡ `update(0.1)` on both clock hours and sun direction.
- Repeated hitches accumulate identically to the equivalent clamped-step
  sequence (no drift between the two channels by construction — single dt
  source).
- Frozen + hitch (`freezeDayNight(1)` then `update(1000)`): nothing advances
  (effectiveDt 0 through both paths; existing 245 test already pins this and
  stays green unchanged).
- Negative dt (`update(-50)`): nothing advances on either channel (previously
  the sun rotated backwards; now both clamp to 0).
- Disabled (`dayNight.enabled = false`): clock still advances (unchanged —
  out of scope), sun untouched (unchanged).

## Failure modes

- No new failure modes: the change narrows the sun's input domain to
  `[0, 0.1]` (a subset of what `applyAxisAngle` already handled). No throws,
  no NaN (clamp maps negatives to 0; `applyAxisAngle` with 0 is identity).
- `NaN` dt: `Math.min(NaN, 0.1)` is NaN → pre-existing behavior for the clock
  path is unchanged by this fix (out of scope; no caller passes NaN).

## Compatibility/migration

No stored data, no serialized format, no public API change. Visual goldens:
the 245 matrix freezes daylight analytically before capture, so the freeze
path (untouched) dominates; unfrozen screens capture after settle delays at
normal pacing where I-4 guarantees identity. If any cell shifts anyway, the
shift is recorded per-cell with justification and re-pinned (expected: none).

## Performance/resource constraints

Hot path unchanged in shape: one `applyAxisAngle` with a different scalar.
No allocation change (`dayNightAxis` still reused). No budget impact.

## Testing seams

Headless-constructible (`new Lighting(new THREE.Scene())`, no WebGL —
existing `tests/unit/Lighting.test.ts` pattern). Sun angle observable via
`getSunDirection`; clock observable via `getTimeOfDayHours`. Deterministic:
no RNG, no time source — dt is injected.

## Observability/debugging

No new logging. Consistency is directly observable: sun elevation
(`direction.y`) must satisfy `daylightFactor = clamp((y + 0.18) / 1.05)`
matching the clock-implied phase within float tolerance after clamped steps.

## Affected files/symbols

- `src/rendering/Lighting.ts` — `Lighting.update` (1 token).
- `tests/unit/Lighting.test.ts` — new hitch/frozen/negative consistency
  tests (existing tests unchanged).
- `openspec/hardening/2026-08-23-exhaustive-repository-certification/risk-register.md`
  — R-9 CLOSED row.
- `PARITY_MATRIX.md` — C272 exact row + count reconciliation.
- `openspec/changes/272-lighting-clock-dt-sync/` — this package.
- `openspec/PROGRAM_STATE.json` / `.md` — activation → VERIFIED checkpoint.

## Rejected alternatives

- Clamping dt at the caller (`Game` loop): wrong layer — the desync is a
  `Lighting` internal inconsistency (two dt sources for two channels of one
  clock); callers legitimately pass large dt after hitches.
- Advancing the clock with raw dt instead: would couple world time to hitch
  spikes (physics-explosion class bug `maxDeltaTime` exists to prevent);
  rejected — the clamp is the correct semantics, the sun must follow it.
- Time-sliced catch-up (multiple sub-steps per hitch): unnecessary churn for
  a presentation clock; single clamped step preserves continuity with no
  oscillation risk.

## Downstream dependencies

- 245 visual matrix: expected no golden change (freeze-dominated captures +
  I-4 identity at normal pacing); full visual cell re-run is the proof.
- `Game` render loop: passes dt through unchanged; benefits automatically.
- No simulation consumer reads `worldSeconds` (presentation clock only).
