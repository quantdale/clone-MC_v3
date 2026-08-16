# Tasks: 229-entity-replication

## 1. Implementation

- [x] 1.1 Define `EntityReplication` types, descriptors, batch interfaces, options, and validation helpers in `src/simulation/EntityReplication.ts`.
- [x] 1.2 Implement `EntityReplicationManager` observer center tracking, entity registration, removal, and interest calculation.
- [x] 1.3 Implement `EntityReplicationManager` transform and tracked-data update recording and dirty tracking.
- [x] 1.4 Implement `EntityReplicationManager.collectUpdates(tick)` batch generation and state clearing.
- [x] 1.5 Implement `ClientEntityStore` replica storage, queries, and batch application (`applyBatch`).

## 2. Validation & Unit Tests

- [x] 2.1 Unit tests for `EntityReplicationManager` observer center setting, range calculations, spawn and despawn transitions.
- [x] 2.2 Unit tests for transform deltas (position, yaw, pitch, velocity) and tracked data replication.
- [x] 2.3 Unit tests for `ClientEntityStore` batch application, state queries, and replica lifecycle.
- [x] 2.4 Unit tests for invalid inputs, throws, boundary cases, capacity limits, and deterministic schedules.

## 3. Integration & Verification

- [x] 3.1 Run baseline verification gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`).
- [x] 3.2 Update `verification.md`, `PROGRAM_STATE.json`, and `PROGRAM_STATE.md` with complete evidence and advance change to VERIFIED.
