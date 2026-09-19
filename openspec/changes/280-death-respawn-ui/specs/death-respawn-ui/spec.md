# Spec: death-respawn-ui

## Contract

This capability adds transient, player-visible death cause/outcome feedback to
the existing synchronous death and respawn path. It does not change gameplay
state transitions or persistence.

## Definitions

- **Known cause**: one of `fall`, `drowning`, `lava`, `starvation`, `wither`,
  `debug`, or `damage`.
- **Unknown cause**: any non-string, empty, or unmapped reason.
- **Normal outcome**: the existing survival-mode respawn path, including a
  valid sleep-bed spawn when present.
- **Hardcore outcome**: the existing permanent-death routing into spectator.
- **Open card**: the transient `#death-screen` presentation state; it is not a
  pause or a second simulation state.

## Invariants

- The implementation MUST retain `SurvivalSystem` as the only health/death
  authority and MUST invoke the existing respawn path at most once per death.
- The reason mapper MUST be closed and MUST map malformed/unknown input to
  `Unknown damage`; arbitrary reason text MUST NOT reach the DOM.
- Existing normal, sleep-bed, and hardcore spectator outcomes MUST remain
  unchanged.
- The card MUST be transient, hidden on boot/reload, and absent from all save,
  archive, and player-state records.
- Dismiss MUST be idempotent and MUST not mutate player health, mode, position,
  inventory, or persistence.
- Change 258 MUST remain BLOCKED and no headed/GPU evidence may be claimed.

## Requirements

### Requirement: Death reasons MUST produce safe readable causes

#### Scenario: Known and unknown reasons

- **GIVEN** a death event with `fall`, `wither`, `debug`, or another known
  reason
- **WHEN** the presentation adapter normalizes it
- **THEN** it MUST return the corresponding stable label (`Fall`, `Wither`,
  `Debug damage`, or the defined mapped label)
- **AND WHEN** the reason is empty, non-string, or unknown
- **THEN** it MUST return `Unknown damage` without throwing.

### Requirement: Normal death MUST show its respawn outcome

#### Scenario: Normal death card

- **GIVEN** hardcore is disabled and the existing death callback fires
- **WHEN** Game completes its current safe respawn/bed-spawn transition
- **THEN** `#death-screen` MUST become visible with `You Died`, a cause label,
  `Respawned safely`, and `Continue`
- **AND** health/mode/position MUST match the pre-280 synchronous respawn rules.

### Requirement: Hardcore death MUST report spectator outcome

#### Scenario: Hardcore death card

- **GIVEN** hardcore is enabled and the existing death callback fires
- **WHEN** Game completes its current permanent-death mode routing
- **THEN** the card MUST show the cause and `Hardcore death — now spectating`
- **AND** its action label MUST be `Continue spectating`
- **AND** the live mode MUST remain spectator after dismissal.

### Requirement: The card lifecycle MUST be safe

#### Scenario: Dismiss and container/input lifecycle

- **GIVEN** an open death card
- **WHEN** the user clicks its action more than once
- **THEN** the first click hides it and later clicks are no-ops
- **AND WHEN** pointer lock or another container opens
- **THEN** the card MUST be dismissed before gameplay/container input proceeds
- **AND** the card MUST be hidden after a reload.

### Requirement: Death presentation MUST not create persistence or hot-path work

#### Scenario: Existing saves remain unchanged

- **GIVEN** any valid or corrupt existing world/player snapshot
- **WHEN** the game boots, dies, dismisses, and saves/reloads
- **THEN** the existing snapshot/archive namespaces and validation outcomes
  MUST be unchanged
- **AND** fixed ticks with no death MUST not rewrite the card DOM.

## Error and failure behavior

Missing panel DOM is a null-safe presentation degradation; existing toast,
health, mode, and respawn behavior continues. Malformed reasons never throw or
inject text. Dismissal is a false no-op when already hidden.

## Compatibility and migration

The `SurvivalEvent` reason is optional and the version-1 survival snapshot is
unchanged. No migration, new record, archive field, or namespace is allowed.

## Security and integrity

Only normalized labels from the pure mapper may be rendered. The browser test
seam can trigger a deterministic death but cannot forge the card's outcome;
Game derives it from the live hardcore state and existing transition.

## Observability

`getDeathPresentationState()` exposes normalized read-only state for E2E and
diagnostics. The card uses stable IDs `#death-screen`, `#death-cause`,
`#death-outcome`, and `#death-continue`.

## Verification mapping

| Requirement | Unit evidence | Browser evidence |
|---|---|---|
| Safe cause mapping | `DeathRespawnPresentation.test.ts` | normal/debug death card |
| Normal outcome | `DeathRespawnPresentation.test.ts`, `SurvivalSystem.test.ts` | `death-respawn.spec.ts` normal death + dismiss |
| Hardcore outcome | `DeathRespawnPresentation.test.ts` | `death-respawn.spec.ts` hardcore death + spectator |
| Lifecycle/idempotence | `DeathRespawnPanel.test.ts` | real action button, reload, existing panel regression |
| No persistence/hot-path churn | `DeathRespawnPanel.test.ts` | existing 259–279 E2E regression |
