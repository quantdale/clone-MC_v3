# Spec: villager-professions

## Contract
This capability adds a `villager` entity type, a `VillagerProfession` data model/registry, and a
`VillagerProfessionSystem` that assigns a villager to the nearest available profession's
workstation POI (149) in priority order, plus a pure hour-of-day schedule-phase function. No
trading, gossip, restocking, iron-golem spawning, bed-claiming, goal-selector wiring, or real
`Game` consumer — see the proposal's Non-goals.

## Definitions
- **Profession**: a `VillagerProfession` — an id, a key, and a `workstationType` (a 149 POI type).
- **Assigned**: a villager entity id has a tracked `VillagerAssignment` in the owning
  `VillagerProfessionSystem`.
- **Schedule phase**: one of `'WORK'`, `'REST'`, `'MEANDER'`, derived from an hour-of-day via
  `scheduleForHour`.

## Invariants
- The profession registry never contains an "unemployed" entry; unemployment is `null`.
- `assignProfession` never returns a profession id without having claimed exactly the one POI
  backing it, and never claims more than one POI per call.
- Professions are tried in the caller-supplied list order; the first with an available workstation
  within `maxDistance` wins.
- `unassign` always clears the tracked assignment (if any) and releases its claimed POI; it is a
  safe no-op (returns `false`) when the villager has no tracked assignment.
- `scheduleForHour` totally covers `[0, 24)` with no gap or overlap across its three phases.

## Requirements

### Requirement: villager is a registered CREATURE entity type
017's `createDefaultEntityRegistry()` MUST include a `villager` definition with category
`CREATURE` and a positive `health`.

#### Scenario: villager is present and correctly categorized
- **GIVEN** `createDefaultEntityRegistry()`
- **WHEN** `getByKey('villager')` is called
- **THEN** it returns a definition with `category: 'CREATURE'` and `health > 0`

### Requirement: assignProfession claims the nearest available workstation in priority order
`VillagerProfessionSystem.assignProfession` MUST assign the first profession (in the supplied
list's order) that has an unclaimed, in-range workstation POI, claim that POI, and return the
profession's id; it MUST return `null` and claim nothing when no profession qualifies.

#### Scenario: a villager is assigned to the only available profession
- **GIVEN** one unclaimed `farmer`-type POI within `maxDistance` and no other POIs
- **WHEN** `assignProfession` is called with the default profession list
- **THEN** it returns the `farmer` profession id, and the POI is now claimed in `poiManager`

#### Scenario: an earlier-priority profession wins even if its workstation is farther
- **GIVEN** an unclaimed `farmer` POI farther away and an unclaimed `librarian` POI nearer, with
  `farmer` listed before `librarian` in the supplied profession list
- **WHEN** `assignProfession` is called
- **THEN** it returns the `farmer` profession id, and the `farmer` POI (not the `librarian` POI) is
  claimed

#### Scenario: no available workstation yields no assignment
- **GIVEN** no unclaimed POI of any profession's workstation type within `maxDistance`
- **WHEN** `assignProfession` is called
- **THEN** it returns `null`, and no POI in `poiManager` is claimed

#### Scenario: an already-assigned villager is not reassigned
- **GIVEN** a villager already assigned to a profession
- **WHEN** `assignProfession` is called again for the same entity id
- **THEN** it returns the same profession id without claiming any additional POI

### Requirement: unassign releases the claimed POI and clears the tracked assignment
`unassign` MUST release the villager's claimed POI (if any) in `poiManager` and clear its tracked
assignment, returning `true`; it MUST return `false` and change nothing for a villager with no
tracked assignment.

#### Scenario: unassigning an employed villager releases its POI
- **GIVEN** a villager assigned to a profession (its workstation POI is claimed)
- **WHEN** `unassign` is called
- **THEN** it returns `true`, the POI is no longer claimed in `poiManager`, and `getAssignment`
  for that entity id is now `undefined`

#### Scenario: unassigning an unemployed villager is a no-op
- **GIVEN** a villager with no tracked assignment
- **WHEN** `unassign` is called
- **THEN** it returns `false`

### Requirement: scheduleForHour totally covers the day with three phases
`scheduleForHour(hour)` MUST return `'WORK'` for `hour` in `[6, 18)`, `'MEANDER'` for `[18, 22)`,
and `'REST'` for `[22, 24)` or `[0, 6)`.

#### Scenario: boundary hours resolve to the correct phase
- **GIVEN** hours `0`, `5.999`, `6`, `17.999`, `18`, `21.999`, `22`, `23.999`
- **WHEN** `scheduleForHour` is called for each
- **THEN** they resolve to `REST, REST, WORK, WORK, MEANDER, MEANDER, REST, REST` respectively

## Error and failure behavior
- No function/method in this module throws for well-formed inputs.

## Performance and resource bounds
- `assignProfession` is O(professions × 149's `findNearestUnclaimed` cost).

## Compatibility and migration
- One `EntityType.ts` edit (additive) and one new, additive simulation file. No `Game.ts` edit; no
  schema/save-format change. Requires updating `EntityType.test.ts`'s hardcoded default-registry
  assertions (non-regression test maintenance).

## Security and integrity
- All inputs are caller-supplied numeric ids/positions and already-validated registry data; no new
  untrusted input surface.

## Observability
- `getAssignment(entityId)` exposes the current profession/POI binding for future debugging/HUD
  use.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 villager registered as CREATURE | `tests/unit/EntityType.test.ts` villager case |
| REQ-2 assignProfession priority-ordered claim | `tests/unit/VillagerProfession.test.ts` assignProfession cases |
| REQ-3 unassign releases + clears | `tests/unit/VillagerProfession.test.ts` unassign cases |
| REQ-4 scheduleForHour boundary coverage | `tests/unit/VillagerProfession.test.ts` scheduleForHour cases |
