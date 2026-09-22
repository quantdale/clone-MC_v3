# Spec: live-raid-bar-parity

## Contract

This change defines HUD **raid bar** parity presentation over the verified
`RaidState` lifecycle: wave progress, optional village/settlement name, Bad
Omen level, and accessibility — as a system **distinct from** the wither boss
bar (`#wither-boss-bar`, `BossFramework`, `HudParity` boss bars). It does not
claim raider mobs, village detection, bad-omen acquisition, raid persistence,
or headed GPU/FPS certification.

## Definitions

- **Raid state:** a `RaidState` from `RaidStateMachine` (152), or `null`.
- **Raid bar:** the single live DOM node dedicated to raid presentation
  (working identity `#raid-bar` / `data-raid-bar`), including title, detail,
  village line, omen badge, fill, and accessible labels — never
  `#wither-boss-bar`.
- **Presentation context:** optional caller input supplying `villageName`
  only; it never mutates simulation state.
- **Village fallback:** the documented empty-or-generic label used when
  `villageName` is missing, non-string, or whitespace-only.
- **Clamped progress:** finite `waveIndex / totalWaves` mapped into `[0, 1]`;
  non-finite inputs yield `0`.

## Invariants

1. `RaidStateMachine` remains authoritative; the projection is pure and never
   mutates its inputs.
2. The projection is total for `null` and every valid `RaidState` and MUST
   NOT throw.
3. `progress` is always in `[0, 1]`; `badOmenLevel` presented as a
   non-negative integer (floor of finite values; non-finite → `0`).
4. There is exactly one raid bar node per Game instance; it is hidden for
   `null`/`INACTIVE` and after dispose.
5. Raid bar identity is disjoint from `#wither-boss-bar` and from
   `HudParity`/`BossFramework` types and selectors.
6. No village name is derived from coordinates or random sources; no raid
   data is persisted, archived, or resurrected by reload.
7. No Change 258 headed FPS/GPU work, no new persistence namespace, no raider
   entity registration.

## Requirements

### Requirement: Pure raid-bar projection MUST be total and bounded

`projectRaidBar` (or the approved equivalent symbol) MUST be total for `null`
and every valid `RaidState`, MUST NOT throw, MUST expose clamped `progress`
in `[0, 1]` and integer-clamped `badOmenLevel >= 0`, and MUST hide `null`
and `INACTIVE` inputs.

#### Scenario: Active raid shows wave progress and omen level

- **GIVEN** an active state at wave 2 of 3 with 4 remaining raiders and
  `badOmenLevel` 3
- **WHEN** the projection is computed with no village context
- **THEN** it is visible with status `ACTIVE`
- **AND** `wave` is 2, `totalWaves` is 3, `raidersRemaining` is 4
- **AND** `progress` is `2/3` clamped to `[0, 1]`
- **AND** `badOmenLevel` is 3
- **AND** `ariaLabel` is a non-empty string identifying an active raid

#### Scenario: Null and inactive hide safely

- **GIVEN** `null` or a state with status `INACTIVE`
- **WHEN** the projection is computed
- **THEN** it is hidden (`visible` false), `progress` is 0, `badOmenLevel` is 0
- **AND** no exception is thrown

#### Scenario: Non-finite counters never leave the domain

- **GIVEN** a crafted active state with non-finite `waveIndex`, `totalWaves`,
  `raidersRemaining`, or `badOmenLevel`
- **WHEN** the projection is computed
- **THEN** `progress` is in `[0, 1]`, counts are non-negative finite
  displays, `badOmenLevel` is a non-negative integer
- **AND** no exception is thrown

### Requirement: Village name MUST come only from context with a fixed fallback

The projection MUST accept an optional `villageName` string, MUST NOT derive
a name from world coordinates or RNG, and MUST apply the documented village
fallback when the value is absent, non-string, or whitespace-only.

#### Scenario: Explicit village name is presented

- **GIVEN** an active raid and context `{ villageName: "Plains Hold" }`
- **WHEN** the projection is computed
- **THEN** the view's `villageName` is exactly `Plains Hold`
- **AND** the accessible label includes that name

#### Scenario: Missing or blank village name uses fallback

- **GIVEN** an active raid with no context, `villageName: ""`, or
  `villageName: "   "`
- **WHEN** the projection is computed
- **THEN** `villageName` equals the documented fallback (empty string when
  omitted/blank is the contract: no invented settlement name)
- **AND** the view remains visible for the active raid
- **AND** no exception is thrown for non-string values (treated as omitted)

### Requirement: Terminal states MUST remain bounded and inspectable

`VICTORY` and `DEFEAT` MUST remain visible with terminal copy, clamped
progress (victory `1`, defeat reached/total), and the raid's `badOmenLevel`
until replaced or disposed.

#### Scenario: Victory is full progress

- **GIVEN** a state with status `VICTORY`
- **WHEN** the projection is computed
- **THEN** it is visible, `progress` is 1, and `status` is `VICTORY`

#### Scenario: Defeat reports the reached wave

- **GIVEN** a state with status `DEFEAT`, `waveIndex` 2, `totalWaves` 3
- **WHEN** the projection is computed
- **THEN** it is visible with `progress` `2/3` and detail indicating defeat
  at wave 2

### Requirement: Raid bar MUST be isolated from the wither boss bar

The raid bar MUST NOT reuse `#wither-boss-bar`, `WITHER_*` fill ids,
`projectWitherBossBars`, `HudBossBar`, or `bossBarSnapshot` for its data or
selectors. Boss-bar visibility and raid-bar visibility MUST be independently
observable.

#### Scenario: Raid active while no wither exists

- **GIVEN** an active raid and no live wither
- **WHEN** the browser Game syncs presentation
- **THEN** the raid bar is visible with `data-raid-bar` set
- **AND** `#wither-boss-bar` remains hidden or otherwise unchanged

#### Scenario: Wither active while no raid exists

- **GIVEN** a live wither and `null` raid state
- **WHEN** the browser Game syncs presentation
- **THEN** the raid bar is hidden
- **AND** the wither boss bar follows Change 276/282 rules untouched

### Requirement: Presentation MUST be accessible for active and terminal states

The live raid bar MUST expose `aria-label` (or equivalent) derived from the
projection, MUST use status observables (`data-status`) for tests, MUST NOT
require animation for correct state (reduced-motion safe), and MUST be hidden
for `null`/`INACTIVE` and after dispose.

#### Scenario: Active and terminal labels are exposed

- **GIVEN** the Game starts a raid, then reaches victory
- **WHEN** presentation sync runs
- **THEN** `aria-label` and `data-status` update to match the projection
- **AND** only one raid bar node exists

#### Scenario: Dispose leaves no stale visible bar

- **GIVEN** a visible active or terminal raid bar
- **WHEN** Game disposal occurs
- **THEN** the element is hidden and later frames cannot rewrite it

### Requirement: Reload MUST NOT resurrect raid presentation

After pagehide/reload, no raid bar content, village name, or omen badge may
reappear from storage, and no raid record may be written.

#### Scenario: Reload hides the bar

- **GIVEN** an active raid bar is visible
- **WHEN** pagehide and reload complete
- **THEN** the raid bar is hidden
- **AND** no raid persistence key is read or written

### Requirement: Scope MUST exclude Change 258 and unrelated systems

Implementation of this change MUST NOT modify headed FPS/GPU certification
work, Change 258 status, combat balance, raider spawning, settlement
detection, bad-omen acquisition, or wither boss-bar semantics beyond leaving
them as regression boundaries.

#### Scenario: 258 remains blocked and boss-bar suite stays green

- **GIVEN** Change 286 is implemented on an activation branch
- **WHEN** the baseline gates run
- **THEN** Change 258 is still recorded BLOCKED
- **AND** existing boss-bar and 282 feedback tests pass
- **AND** no new GPU/FPS evidence is claimed

## Error and failure behavior

Invalid omen/count inputs are delegated to existing clamp helpers. Missing or
malformed village context degrades to the village fallback. Missing raid-bar
DOM is a presentation no-op. Stale sync after dispose is a no-op. Terminal
projections are idempotent. The projection MUST NOT throw on any input
covered above.

## Performance and resource bounds

One O(1) pure projection and bounded text/attribute writes per active fixed
tick. No entity iteration, unbounded loop, new timer, worker, texture, or
GPU/FPS measurement path.

## Compatibility and migration

No stored data or migration. Existing saves, reset, archive, visual goldens
(for boot-hidden bars), and wither/HUD/container flows remain compatible.

## Security and integrity

DOM receives generated text via `textContent`/attributes only (no HTML
interpolation of village names). Debug seams stay on the existing
development/E2E `__voxelGame` handle.

## Observability

`data-status`, `data-raid-bar`, `aria-label`, fill width, and
`getRaidState()` are deterministic test observables. A11y uses polite live
updates consistent with 282.

## Verification mapping

| Requirement | Evidence |
|---|---|
| Total bounded projection | Future `tests/unit/RaidBarParity.test.ts` (T6) |
| Village fallback rules | Same unit suite (T6) |
| Terminal progress | Same unit suite (T6) |
| Boss-bar isolation | Unit type/selector assertions + `tests/e2e/boss-bar.spec.ts` regression + raid-bar E2E (T7–T8) |
| Accessibility / dispose | Raid-bar browser E2E (T8–T10) |
| Reload no-resurrection | Reload leg of raid-bar E2E (T10) |
| 258 / unrelated scope | `verification.md` gates + file-audit (T11–T14) |
