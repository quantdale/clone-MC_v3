# Spec: nether-progression

## Contract

Verifies progression stage 4 (Nether) through the headless `ProgressionHarness`
(spec: progression-harness): building and lighting an obsidian portal frame,
entering the Nether through it, achieving `enter_the_nether`, and returning via
the linking machinery with the 300-tick teleport cooldown. It composes the real
`NetherPortal` (177), `NetherPortalLinking` (178), `DimensionManager` (174), and
`CoreProgressionAdvancements` (186) modules.

## Definitions

- **Valid portal frame**: an obsidian rectangle (1 block thick, corners
  required) with interior width 2..21 and height 3..21, per
  `NetherPortal.validatePortalFrame`.
- **Lit portal**: a valid frame whose interior cells are filled with
  `nether_portal` blocks.
- **Overworld→Nether teleport**: destination = `scalePortalPosition(x, z,
  'overworld-to-nether')` = `[floor(x/8), floor(z/8)]`.
- **Nether→Overworld teleport**: destination = `scalePortalPosition(x, z,
  'nether-to-overworld')` = `[x*8, z*8]`.
- **Portal cooldown**: `PORTAL_TELEPORT_COOLDOWN_TICKS` (300) applied after a
  teleport; re-entry is blocked until `portalCooldownRemaining == 0`.

## Invariants

- The portal must be validated and teleports computed by the real
  `NetherPortal` / `NetherPortalLinking` functions, never a fixture.
- Entering the Nether sets the player dimension to `minecraft:the_nether`.
- `enter_the_nether` is achieved exactly when the player's dimension becomes
  `minecraft:the_nether`.
- A stage completes only when its assertion holds; no partial credit.

## Requirements

### Requirement: build and light a valid portal frame
The player MUST be able to build an obsidian frame that `validatePortalFrame`
accepts and light it so its interior becomes `nether_portal` blocks.

#### Scenario: valid frame is lit
- **GIVEN** a player with enough obsidian and a clear build site at the spawn
- **WHEN** the script places an obsidian frame with interior width 2 and height 3
  (or any valid 2..21 × 3..21 rectangle) and lights it
- **THEN** `validatePortalFrame` returns a non-null `PortalShape`
- **AND** every interior cell reported by `portalBlockPositions` is a
  `nether_portal` block
- **AND** `isStageComplete('nether')` is `false` until the player actually enters

#### Scenario: invalid frame is not accepted
- **GIVEN** an attempted frame that is missing a corner, has a non-obsidian bar,
  or has interior width 1
- **WHEN** `validatePortalFrame` is called on its interior cell
- **THEN** it returns `null`
- **AND** no interior cell becomes a `nether_portal` block
- **AND** the harness aborts atomically with `invalid_portal_frame` if the script
  tries to light it as if valid

### Requirement: enter the Nether
Stepping into a lit portal MUST teleport the player to the Nether with the 1:8
coordinate scale, set the dimension to `minecraft:the_nether`, and achieve
`enter_the_nether`.

#### Scenario: entering the Nether applies scale and dimension
- **GIVEN** a lit portal in the overworld at overworld position `(x, y, z)`
- **WHEN** the player steps into the portal and the teleport fires
- **THEN** the player dimension is `minecraft:the_nether`
- **AND** the player's horizontal position is `[floor(x/8), floor(z/8)]`
- **AND** the advancement `enter_the_nether` is achieved
- **AND** `isStageComplete('nether')` is `true`

### Requirement: return linking and cooldown
The player MUST be able to return from the Nether to the overworld (destination
scaled ×8), subject to the 300-tick teleport cooldown.

#### Scenario: return teleport scales back to overworld
- **GIVEN** a player in the Nether whose nether position is `(nx, nz)`
- **WHEN** the player steps into a Nether portal and the return teleport fires
  after the cooldown has elapsed
- **THEN** the player dimension is `minecraft:overworld`
- **AND** the player's horizontal position is `[nx*8, nz*8]` (or the search
  finds/creates a portal within the overworld search radius)

#### Scenario: re-entry is blocked during cooldown
- **GIVEN** a player who just teleported (cooldown active, `remaining > 0`)
- **WHEN** the player attempts to teleport again immediately
- **THEN** `portalCooldownRemaining(lastTeleportTick, nowTick) > 0`
- **AND** the harness aborts atomically with `portal_teleport_on_cooldown`
- **AND** the player's dimension and position are unchanged

### Requirement: Nether state survives reload
The Nether entry must be reproducible after a mid-progression save/reload.

#### Scenario: reload in the Nether resumes identically
- **GIVEN** a player who has entered the Nether (stage 4 complete)
- **WHEN** `snapshot()` is taken, the harness is `reset()` and `restore()`d
- **THEN** the player dimension is still `minecraft:the_nether`
- **AND** the player position matches the snapshot
- **AND** `isStageComplete('nether')` is `true`
- **AND** the return teleport from the restored state matches a fresh run from
  the same point

## Error and failure behavior

- Invalid frame → `invalid_portal_frame` (atomic abort when the script tries to
  light it).
- Teleport under cooldown → `portal_teleport_on_cooldown` (atomic abort).
- `stepUntil('nether', maxSteps)` before the player enters returns `false` and
  the stage is not reported complete.

## Performance and resource bounds

- Portal creation-site and destination search use the modules' bounded search
  radii (`PORTAL_SEARCH_RADIUS_NETHER` = 16, `PORTAL_SEARCH_RADIUS_OVERWORLD` =
  128); the harness runs within the bounded `maxSteps` budget.

## Compatibility and migration

Composes `NetherPortal`/`NetherPortalLinking` public constants and functions; no
new data format or migration. Nether world generation is out of scope (owned by
change 176); the harness drives the portal/linking and dimension-state seam over
the in-memory fixture.

## Security and integrity

No external input surface. `restore` payloads are validated atomically per the
harness contract.

## Observability

- Player dimension + scaled position and `enter_the_nether` `achievedTick` are
  the observable completion signals.
- Cooldown remaining and portal search/creation results are available for
  debugging a failed return.

## Verification mapping

- `tests/unit/ProgressionHarness.nether.test.ts` (or a dedicated file): build +
  light, invalid-frame failure, entry scale/dimension/advancement, return ×8,
  cooldown abort, reload-in-nether.
