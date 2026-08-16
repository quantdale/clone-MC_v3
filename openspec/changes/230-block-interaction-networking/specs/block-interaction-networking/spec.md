# Spec: block-interaction-networking

## Contract

Pure headless block interaction networking framework validating client block break, place, and use requests against server reach distance, break progress, and placement rules, providing structured confirmation, corrections, and client rollback reconciliation.

## Definitions

- **Reach Distance**: 3D Euclidean distance from player position to block center `(x + 0.5, y + 0.5, z + 0.5)`.
- **Break Action**: Stages of block breaking (`start`, `cancel`, `finish`, `instant`).
- **Interaction Result**: Server response indicating `accepted: true` or `accepted: false` with correction state ID and reason code.
- **Client Reconciler**: Client-side tracker that manages pending predicted block changes and resolves them upon server confirmation or rollback.

## Invariants

- **Reach Invariant**: Any interaction where distance from player position to target block center exceeds `maxReachDistance` MUST be rejected with reason `'out_of_reach'`.
- **Break Sequence Invariant**: A non-instant `finish` break action MUST have a matching preceding `start` break action for the same block coordinate and player.
- **Air On Break Invariant**: A successfully accepted block break MUST result in block state 0 (Air).
- **Rollback Invariant**: When a client prediction is rejected, the client reconciler MUST provide the exact authoritative block state ID to roll back to.

## Requirements

### Requirement: REQ-1 Reach Distance Enforcement

The `BlockInteractionValidator` SHALL enforce that all break, place, and use requests originate from within `maxReachDistance` of the target block center.

#### Scenario: Block interaction within reach is evaluated
- **GIVEN** a player at `(0, 0, 0)` and a target block at `(2, 0, 2)`.
- **WHEN** a break or place request is validated with `maxReachDistance = 6.0`.
- **THEN** it MUST NOT be rejected for reach.

#### Scenario: Block interaction beyond reach is rejected
- **GIVEN** a player at `(0, 0, 0)` and a target block at `(10, 0, 10)`.
- **WHEN** a break or place request is validated with `maxReachDistance = 6.0`.
- **THEN** the result MUST be `{ accepted: false, reason: 'out_of_reach' }` with the current block state ID.

---

### Requirement: REQ-2 Block Break Validation and Sequencing

The `BlockInteractionValidator` SHALL track active break progress per player and validate `start`, `cancel`, `finish`, and `instant` actions.

#### Scenario: Valid start and finish break sequence
- **GIVEN** a block at `(1, 0, 1)` with state ID 1 (stone).
- **WHEN** player 1 sends `start` at tick 10, then `finish` at tick 30 (with `minBreakTicks <= 20`).
- **THEN** the `finish` request MUST be accepted with block state ID 0 (Air) and `broadcast: true`.

#### Scenario: Finish without start is rejected
- **GIVEN** no active break in progress for player 1.
- **WHEN** player 1 sends `finish` for a block.
- **THEN** the request MUST be rejected with reason `'no_active_break'`.

#### Scenario: Instant break succeeds without prior start
- **GIVEN** a creative or instant-break block.
- **WHEN** player 1 sends `instant` break within reach.
- **THEN** the request MUST be accepted with block state ID 0 (Air).

---

### Requirement: REQ-3 Block Placement Validation

The `BlockInteractionValidator` SHALL validate block placement requests against reach distance, surface target, and placement predicates.

#### Scenario: Valid placement adjacent to clicked face
- **GIVEN** player at `(0, 0, 0)`, placing against `(1, 0, 0)` on face `'up'`.
- **WHEN** target placement position `(1, 1, 0)` is air and canPlace returns true.
- **THEN** the placement MUST be accepted with the requested `blockStateId` and placement position `(1, 1, 0)`.

#### Scenario: Placement rejected by predicate
- **GIVEN** `canPlace` predicate returns false (e.g. entity collision or invalid support).
- **WHEN** place request is validated.
- **THEN** the result MUST be `{ accepted: false, reason: 'cannot_place' }`.

---

### Requirement: REQ-4 Block Use Validation

The `BlockInteractionValidator` SHALL validate block use / interaction requests within reach.

#### Scenario: Use block within reach
- **GIVEN** target block exists at `(1, 0, 1)` within reach.
- **WHEN** use request is validated.
- **THEN** the result MUST be accepted with `broadcast: true`.

---

### Requirement: REQ-5 Client Block Reconciler Prediction and Rollback

The `ClientBlockReconciler` SHALL record optimistic local block changes and apply server confirmations or rollback corrections.

#### Scenario: Rollback on server rejection
- **GIVEN** a client predicted block placement at `(2, 0, 2)`.
- **WHEN** server returns rejection with `authoritativeStateId: 0` (air).
- **THEN** `reconciler.reconcile(result)` MUST return a rollback directive with position `(2, 0, 2)` and state ID 0.

#### Scenario: Confirmation on server acceptance
- **GIVEN** a client predicted block break at `(2, 0, 2)`.
- **WHEN** server returns accepted result.
- **THEN** `reconciler.reconcile(result)` MUST confirm the change without rollback.

---

### Requirement: REQ-6 Input Validation and Error Handling

The validator and reconciler MUST strictly validate all inputs (coordinates, ticks, player positions, direction faces), throwing descriptive `BlockInteraction: <detail>` errors on invalid input without corrupting state.

#### Scenario: Non-integer coordinates throw
- **GIVEN** a request with `x = 1.5`.
- **WHEN** validation is attempted.
- **THEN** it MUST throw an error matching `BlockInteraction: coordinates must be integers`.

---

## Error and failure behavior

- Throws on non-integer block coords or non-finite player positions.
- Throws on invalid options (negative reach distance, negative minBreakTicks).

## Performance and resource bounds

- O(1) time complexity per interaction request.
- Active breaking map bounded by active players.

## Compatibility and migration

- Pure additive module in `src/simulation/BlockInteractionNetworking.ts`.

## Security and integrity

- All reach distance and timing calculations are strictly server-side authoritative.

## Observability

- `activeBreakingCount`, `getBreakProgress(playerId)` accessors.

## Verification mapping

- Tests in `tests/unit/BlockInteractionNetworking.test.ts` verify all scenarios and requirements.
