# Tasks: 284-live-raid-wave-spawning

Sequenced so control-plane/spec lands before any production edit, pure core
before Game wiring, failure edges before full gates. Do not start T3+ until
this package passes the authoring gate **and** live activation rules allow
implementation (282 VERIFIED; ordering constraints in `OVERRIDE_DRAFT.md`).

## A. Control plane and specification

- [x] T1. Author the complete 284 package (`proposal.md`, `design.md`,
  `tasks.md`, `verification.md`, `specs/live-raid-wave-spawning/spec.md`,
  `OVERRIDE_DRAFT.md`) without editing `src/`, main-landing tests, live
  `PROGRAM_STATE*`, live `CHANGE_SEQUENCE*.md`, or `origin/main`.
- [x] T2. Pass the SPEC_AUTHORING_PROTOCOL quality gate: change id matches
  the intended sequence name `284-live-raid-wave-spawning` (not yet a live
  `CHANGE_SEQUENCE.md` row; sequence gap documented in `OVERRIDE_DRAFT.md`
  and `verification.md`); every MUST/SHALL has scenarios;
  invalid/duplicate/stale/reload/failure/pause rules are explicit; scope
  excludes bad omen, settlement detection, 258 GPU work, and implementing
  production code in this authoring session; tasks cover implementation,
  unit, integration, edge, regression, docs/state, and final gate.

## B. Pure plan and registry (no Game yet)

- [ ] T3. Append `pillager`/`vindicator`/`ravager`/`witch` to
  `createDefaultEntityRegistry` (MONSTER, finite health/attack, summonable,
  non-persistent) and add tests that all roster keys resolve and prior keys
  and runtime ids remain stable by append-only order.
- [ ] T4. Implement pure `planRaidWaveSpawn` with deterministic flattened
  ring placement, zero-count omission, and fail-closed non-finite center /
  unknown type / invalid count; add unit tests for determinism, boundaries,
  skips, and no-throw failure paths.

## C. Injectable backend

- [ ] T5. Define `RaidEntityBackend` + handle/request types; implement
  `createRecordingRaidBackend` (logs, optional `failSpawnAfter`, idempotent
  despawn) and the production registry/`EntityManager` adapter; unit-test
  logging, idempotent despawn, unknown-key refusal, and adapter spawn/remove
  against a real `EntityManager` (headless).

## D. Game wave lifecycle (depends on 282 seams)

- [ ] T6. Wire wave apply after 282's raid tick: all-or-nothing plan→spawn,
  per-`(generation, waveIndex)` duplicate guard, prior-wave leftover clear,
  structured `RaidWaveApplyResult` with rollback on backend throw and no
  throw across the tick boundary.
- [ ] T7. Wire terminal/clear/replace/dispose despawn + generation bump so
  tracking clears idempotently and stale callbacks cannot decrement a new
  raid; expose read-only wave entity id + last apply-result seams for tests.

## E. Death alignment and lifecycle edges

- [ ] T8. Route tracked entity removal through exactly-once
  `recordRaiderDeath` with consumed-id set; cover double death, unknown id,
  stale generation, non-active raid no-op, and alignment when remaining hits
  zero (subsequent `tickRaid` may spawn the next roster).
- [ ] T9. Prove pause freezes spawn/despawn (no raid tick work) and reload
  performs no raid-entity persistence or resurrection; confirm dispose leaves
  no tracked ids and no post-dispose mutations.

## F. Verification and release

- [ ] T10. Run focused unit suites for plan/backend/Game controller, then the
  required baseline gates (`npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `npm run test:e2e`); record exact outputs and any
  non-blocking environmental variance in `verification.md`.
- [ ] T11. Confirm scope: no bad-omen acquisition, no settlement detector, no
  new persistence namespace/archive field, no 282 HUD contract break, no 258
  headed/GPU edits; update reviewed file-audit rows for any new/changed
  files when the change is implemented on main.
- [ ] T12. Reconcile artifacts to implementation; mark C284 exact and 284
  VERIFIED only at 100% with all MUST/SHALL evidence green; commit on the
  authorized branch/publish path per live `REVIEW_HANDOFF` rules; leave 258
  BLOCKED and do not implement 283 or later from this package.
