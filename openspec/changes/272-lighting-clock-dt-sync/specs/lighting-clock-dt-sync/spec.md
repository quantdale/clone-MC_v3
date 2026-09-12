# Spec: lighting-clock-dt-sync

## Contract

`Lighting.update()` MUST advance the `worldSeconds` clock and the sun
rotation by the same effective dt (clamped to `[0, CONFIG.maxDeltaTime]`,
zero while frozen), so clock phase and sun angle can never desync after
frame hitches. Frozen behavior (245) and normal-pacing behavior MUST be
preserved exactly.

## Definitions

- `effectiveDt = frozen ? 0 : max(0, min(dt, CONFIG.maxDeltaTime))` with
  `CONFIG.maxDeltaTime = 0.1`.
- Clock phase: `worldSeconds` modulo `CONFIG.dayNight.dayLength = 600`,
  surfaced as `getTimeOfDayHours() = (12 + worldSeconds / 600 * 24) % 24`.
- Sun angle: cumulative rotation of `sunDirection` about `+Z` by
  `-anglePerSecond * <dt used>`, `anglePerSecond = 2π / 600`, surfaced via
  `getSunDirection()`.
- Hitch-sized dt: any `dt > CONFIG.maxDeltaTime` (e.g. 5 s after a hitch).

## Invariants

- The single computed `effectiveDt` is the sole advance quantity for both
  channels within one `update()` call.
- Frozen: no channel advances for any dt.
- Negative dt: no channel advances (never rewinds).
- Normal pacing (`0 <= dt <= 0.1`, unfrozen): behavior identical to pre-fix.

## Requirements

### Requirement: SYNC-1 — Sun rotation uses the effective dt

`Lighting.update()` MUST rotate the sun by
`-anglePerSecond * effectiveDt` (not raw `dt`) whenever it rotates the sun.

#### Scenario: SYNC-1.1 — Hitch advances sun by exactly the clamped dt

- **GIVEN** a fresh unfrozen `Lighting` with `dayNight.enabled`
- **WHEN** `update(5)` is called
- **THEN** `getTimeOfDayHours()` advances by exactly `0.1 / 600 * 24` hours
- **AND** the sun direction equals the direction after `update(0.1)` on a
  fresh instance (same effective dt, both channels).

#### Scenario: SYNC-1.2 — Hitch equals the equivalent clamped-step sequence

- **GIVEN** two fresh unfrozen `Lighting` instances
- **WHEN** instance A receives one `update(5)` and instance B receives fifty
  `update(0.1)` calls
- **THEN** both report equal `getTimeOfDayHours()` (within float tolerance)
- **AND** both report equal sun directions (within float tolerance).

#### Scenario: SYNC-1.3 — Repeated hitches never drift clock vs sun

- **GIVEN** a fresh unfrozen `Lighting`
- **WHEN** ten `update(600)` calls occur (each clamps to 0.1 s)
- **THEN** `getTimeOfDayHours()` advances by exactly `10 * 0.1 / 600 * 24`
  hours from noon
- **AND** the sun's total rotation equals `-anglePerSecond * 1.0`
  (derivable from the direction's angle about +Z).

### Requirement: SYNC-2 — Frozen clock stays frozen (245 preserved)

When frozen via `freezeDayNight()`, neither `worldSeconds` nor the sun
direction advances for any dt, including hitch-sized dt.

#### Scenario: SYNC-2.1 — Frozen hitch advances nothing

- **GIVEN** a `Lighting` frozen with `freezeDayNight(1)`
- **WHEN** `update(1000)` is called
- **THEN** `getSunDirection()` is unchanged
- **AND** the daylight factor recomputes to 1 from the pinned direction
- **AND** a further `update(1000)` leaves the direction still unchanged.

#### Scenario: SYNC-2.2 — Existing 245 freeze tests stay green unchanged

- **GIVEN** the pre-272 `tests/unit/Lighting.test.ts` freeze cases
- **WHEN** the 272 fix lands
- **THEN** all freeze assertions pass without modification.

### Requirement: SYNC-3 — Negative dt rewinds nothing

`update()` with negative dt MUST advance neither the clock nor the sun.

#### Scenario: SYNC-3.1 — Negative hitch is a full no-op

- **GIVEN** a fresh unfrozen `Lighting` (noon, initial sun direction)
- **WHEN** `update(-50)` is called
- **THEN** `getTimeOfDayHours()` is still ~12
- **AND** `getSunDirection()` still equals the initial direction.

### Requirement: SYNC-4 — Normal pacing is behaviorally invisible

For `0 <= dt <= CONFIG.maxDeltaTime` (unfrozen), post-fix behavior MUST be
identical to pre-fix on both channels.

#### Scenario: SYNC-4.1 — Normal step rotates exactly as before

- **GIVEN** a fresh unfrozen `Lighting`
- **WHEN** `update(0.016)` is called
- **THEN** the clock advances `0.016 / 600 * 24` hours
- **AND** the sun rotates `-anglePerSecond * 0.016` (clamp is identity, so
  old and new code agree bit-for-bit).

#### Scenario: SYNC-4.2 — No visual-golden churn

- **GIVEN** the 245 visual-regression matrix (60 cells)
- **WHEN** the full matrix re-runs post-fix
- **THEN** zero cells change vs the pinned goldens (or any shift is
  recorded per-cell with justification and re-pinned).

### Requirement: SYNC-5 — No gameplay/systems retune

The fix MUST NOT change any simulation, tick, physics, persistence, or
lighting-model behavior beyond the sun-rotation dt source. The production
diff MUST be confined to `src/rendering/Lighting.ts` (`update`) plus tests,
risk-register closure, matrix row, and OpenSpec/state bookkeeping.

#### Scenario: SYNC-5.1 — Diff allowlist

- **GIVEN** the 272 commit range
- **WHEN** `git diff --stat` is inspected
- **THEN** production-code changes appear only in
  `src/rendering/Lighting.ts`
- **AND** no gameplay/simulation/persistence file is modified.

## Error and failure behavior

- No new throws, rejections, or failure modes. The sun input domain narrows
  to `[0, 0.1]` (a strict subset of previously handled inputs).
- `dt = 0` remains a (near) no-op: clock unchanged; sun `applyAxisAngle(0)`
  is identity with `directionChanged = true` (unchanged semantics).
- No invalid-input contract change: negative dt clamps (SYNC-3); NaN dt
  behavior is pre-existing and out of scope.

## Performance and resource bounds

- Hot path: identical shape (one `applyAxisAngle`, reused axis, no new
  allocation). No budget impact; build time must match baseline (~±0.5 s).

## Compatibility and migration

- No stored data, no serialized format, no API signature change. No
  migration. Old saves, goldens, and the 245 freeze contract are unaffected
  by construction (I-4 identity at normal pacing; freeze path untouched).

## Security and integrity

Not applicable: presentation-clock scalar change; no I/O, parsing, auth, or
trust boundary crossed.

## Observability

Consistency is directly observable in tests: sun elevation
(`direction.y`) satisfies `daylightFactor = clamp((y + 0.18) / 1.05)` and
matches the clock-implied phase within float tolerance after clamped steps.

## Verification mapping

- SYNC-1 → `tests/unit/Lighting.test.ts` new hitch tests (1.1/1.2/1.3) +
  focused `vitest run tests/unit/Lighting.test.ts`.
- SYNC-2 → existing freeze tests unchanged-green + new frozen-hitch pin.
- SYNC-3 → new negative-dt sun-direction pin.
- SYNC-4 → normal-step math pin + full `tests/e2e/visual-regression.spec.ts`
  (or full `npm run test:e2e`) zero-churn proof.
- SYNC-5 → `git diff --stat` allowlist inspection + full unit/e2e regression
  green.
