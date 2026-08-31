# Spec: void-world-startup-recovery

## Contract

The live game SHALL prevent persisted world incompatibility or partial/corrupt world data from presenting as a normal playable empty-air world. It SHALL preserve incompatible data from silent terrain replacement, SHALL gate simulation on proven playable terrain/support, and SHALL provide an in-product, world-scoped recovery path.

## Definitions

- **Current baseline**: persisted world metadata matches the executable world-generation contract.
- **Non-current baseline**: `legacy-unknown` or `unsupported`.
- **Canonical terrain**: persisted/generated `ChunkColumn`/`ChunkSection` data owned by the current canonical world storage.
- **Predicted terrain**: height/terrain derived from the executable current generator for a not-yet-generated current-baseline column.
- **Verified support**: a candidate player position has valid dimension bounds, non-colliding body volume, and a supporting collision surface/terrain cell below it within the documented epsilon.
- **Recovery-required**: startup cannot prove a safe playable world without risking silent generation-version conversion or data loss.
- **World-scoped reset**: deletion of records belonging only to the selected `worldId`, not generic browser/site storage clearing.

## Invariants

1. A non-current baseline MUST NOT invoke current generation to fill missing canonical terrain.
2. A current-generator prediction MUST NOT be used as authoritative spawn/readiness truth for an absent column in a non-current world.
3. Active simulation MUST NOT start until startup state is current-safe or preserved-safe.
4. Persisted player state MUST NOT force the player into unverified air.
5. Recovery MUST NOT silently destroy persisted world records.
6. Reset MUST be explicit, world-scoped and failure-visible.
7. Fresh/current baseline behavior MUST remain deterministic and regression-equivalent.
8. Verification evidence MUST correspond to commands actually executed on the final candidate.

## Requirements

### Requirement: Deterministic startup compatibility classification

`GamePersistence`/bootstrap SHALL produce an explicit startup classification using metadata, canonical-column availability, durable edit presence, player-state context, and read success/failure.

#### Scenario: Fresh current world
- **GIVEN** no prior world records exist
- **WHEN** persistence opens successfully
- **THEN** startup MUST classify the world as current
- **AND** current generation MAY populate missing columns.

#### Scenario: Unknown legacy data without canonical spawn coverage
- **GIVEN** persisted data exists with no compatible generation version
- **AND** required canonical spawn/player coverage cannot be proven
- **WHEN** startup is assessed
- **THEN** the world MUST be recovery-required
- **AND** it MUST NOT be silently classified current.

#### Scenario: Storage read uncertainty
- **GIVEN** metadata, column, or durable-edit enumeration fails
- **WHEN** startup is assessed
- **THEN** the implementation MUST choose a conservative degraded/recovery state
- **AND** MUST NOT treat an empty partial read as proof of a fresh current world.

### Requirement: Non-current worlds do not generate current terrain

#### Scenario: Missing column under unsupported baseline
- **GIVEN** baseline is unsupported
- **AND** canonical column (x,z) is absent
- **WHEN** streaming reaches that coordinate
- **THEN** current terrain generation MUST NOT run
- **AND** the game MUST NOT claim current-generator terrain exists there.

### Requirement: Baseline-aware spawn surface

#### Scenario: Current absent column
- **GIVEN** baseline is current
- **AND** the canonical column is absent
- **WHEN** startup needs a spawn surface
- **THEN** deterministic current-generator prediction MAY be used.

#### Scenario: Non-current absent column
- **GIVEN** baseline is legacy-unknown or unsupported
- **AND** the canonical column is absent
- **WHEN** startup needs a spawn surface
- **THEN** the result MUST be unknown/no-safe-surface
- **AND** MUST NOT call current-generator prediction as authoritative truth.

#### Scenario: Non-current persisted column
- **GIVEN** baseline is non-current
- **AND** a canonical column with a valid heightmap exists
- **WHEN** startup needs a spawn surface
- **THEN** it MUST use the canonical persisted height.

### Requirement: Safe player restore

#### Scenario: Supported saved player
- **GIVEN** saved player coordinates are valid
- **AND** the loaded world proves support and non-collision
- **WHEN** player state is restored
- **THEN** the saved position MAY be accepted.

#### Scenario: Saved player over absent terrain
- **GIVEN** saved player coordinates are structurally valid
- **BUT** supporting canonical terrain cannot be proven
- **WHEN** player state is restored
- **THEN** the saved position MUST NOT become the active simulation position
- **AND** the game SHALL relocate to a bounded proven safe location or remain recovery-required.

### Requirement: Readiness represents actual playable terrain

#### Scenario: Current world
- **GIVEN** current baseline
- **WHEN** readiness is computed
- **THEN** existing generated/meshed readiness semantics SHALL be preserved.

#### Scenario: Preserved non-current world
- **GIVEN** non-current baseline accepted as preserved-safe
- **WHEN** readiness is computed
- **THEN** the relevant surface section MUST come from canonical persisted terrain
- **AND** a hypothetical current-generator surface MUST NOT determine readiness.

#### Scenario: Missing required persisted coverage
- **GIVEN** non-current baseline
- **AND** required canonical coverage is missing
- **WHEN** startup evaluates playability
- **THEN** startup MUST become recovery-required rather than waiting indefinitely or entering a void.

### Requirement: Recovery state blocks gameplay simulation

#### Scenario: Recovery-required startup
- **GIVEN** startup classification is recovery-required
- **WHEN** the render loop runs
- **THEN** fixed simulation ticks, movement physics, survival damage, block interactions and gameplay mutation MUST remain inactive
- **AND** a recovery UI MUST remain visible.

### Requirement: In-product recovery

#### Scenario: User sees incompatible world
- **GIVEN** recovery-required startup
- **WHEN** the recovery UI is shown
- **THEN** it MUST explain that old/partial world data is being protected
- **AND** MUST provide an actionable recovery path without DevTools.

#### Scenario: User starts fresh world
- **GIVEN** recovery-required startup
- **AND** the user explicitly confirms reset
- **WHEN** reset executes successfully
- **THEN** only the selected world's records SHALL be removed/reset
- **AND** the application SHALL restart/reload into a current generated world
- **AND** terrain SHALL be visibly present at spawn.

#### Scenario: Reset failure
- **GIVEN** one or more store mutations fail
- **WHEN** reset runs
- **THEN** the UI MUST report failure
- **AND** MUST NOT claim a fresh-world success
- **AND** MUST preserve/recover as much original data as the repository transaction model permits.

### Requirement: No generic site-data deletion

#### Scenario: Recovery implementation review
- **GIVEN** the recovery code path
- **WHEN** it clears persisted data
- **THEN** it MUST target the current `worldId` across known world stores
- **AND** MUST NOT invoke a blanket clear-site-data/origin-storage operation as the normal fix.

### Requirement: Browser-level real IndexedDB proof

#### Scenario: Legacy partial world fixture
- **GIVEN** Playwright seeds real IndexedDB before app scripts with a legacy/partial world
- **WHEN** the game boots
- **THEN** recovery UI MUST appear
- **AND** active simulation/free-fall MUST NOT occur.

#### Scenario: Recovery end-to-end
- **GIVEN** the same fixture
- **WHEN** the user activates the supported reset flow
- **THEN** reload MUST produce a current-baseline world
- **AND** visible terrain and a supported player MUST be verified.

#### Scenario: Unsupported future baseline
- **GIVEN** real IndexedDB metadata names a future/unsupported generation version
- **WHEN** the game boots
- **THEN** the original records MUST remain unmodified unless the user explicitly resets
- **AND** the game MUST not silently generate current terrain into that world.

### Requirement: Fresh-world regression protection

#### Scenario: Clean browser profile
- **GIVEN** no persisted world
- **WHEN** the game boots
- **THEN** loading SHALL reach ready
- **AND** terrain SHALL be visibly rendered
- **AND** the player SHALL have verified ground support
- **AND** existing movement/interactions SHALL remain functional.

### Requirement: Visual verification

#### Scenario: Fresh spawn screenshot
- **GIVEN** worldReady in a deterministic E2E profile
- **WHEN** a screenshot is captured
- **THEN** terrain/blocks MUST be visible around/below spawn.

#### Scenario: Recovery screenshot
- **GIVEN** recovery-required state
- **WHEN** a screenshot is captured
- **THEN** recovery message/actions MUST be visible and usable
- **AND** no normal-play state may falsely indicate the world is ready.

### Requirement: Certification integrity

#### Scenario: Final Change 257 verification
- **GIVEN** implementation is complete
- **WHEN** Change 257 is proposed as VERIFIED
- **THEN** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and the complete `npm run test:e2e` MUST have actually run on the final candidate
- **AND** required visual/state/file-audit gates MUST have actually run
- **AND** verification.md MUST record their real outcomes.

### Requirement: Git/OpenSpec state truth

#### Scenario: Publication
- **GIVEN** final commits are published
- **WHEN** program state is checkpointed
- **THEN** `published_head`/remote-head statements MUST match a refetched GitHub `main`
- **AND** stale "publication blocked" text MUST be removed if publication succeeded.

### Requirement: Adjacent high-severity audit

#### Scenario: Current accepted debt
- **GIVEN** R-1..R-9 and current code/tests
- **WHEN** Change 257 runs its adjacent issue audit
- **THEN** every entry MUST be revalidated for current reachability/severity
- **AND** any Critical/High user-visible startup/rendering/collision/persistence/streaming defect MUST be fixed or explicitly block verification.

## Error and failure behavior

- Read failures classify conservatively and remain visible.
- Recovery UI remains interactive after recoverable backup/reset errors.
- No thrown storage error may drop the engine into normal play over uncertain world state.
- User data must not be erased merely because migration is unsupported.
- If no safe spawn exists, recovery-required is the correct state.

## Performance and resource bounds

- Startup assessment MUST be bounded to metadata, repository summaries/column headers and a bounded spawn neighborhood; it MUST NOT scan every block in a large world.
- Safe-spawn search MUST have a deterministic finite radius/attempt limit.
- Normal current-world frame/tick hot paths MUST NOT gain unbounded work.
- Successful recovery/reload MUST release prior timers/listeners/workers/GPU resources.

## Compatibility and migration

- Current world metadata/terrain remains compatible.
- Legacy/unsupported metadata is preserved unless explicit recovery mutation occurs.
- No old generation header may be rewritten to current merely to suppress recovery.
- Existing legacy localStorage import remains read-old/write-new and non-destructive.

## Security and integrity

- Recovery actions MUST be explicit and scoped.
- Browser test/debug hooks remain DEV/VITE_E2E only.
- No private persisted contents are rendered in recovery messages.
- Backup/export and reset errors must not leak raw stack traces to end users.

## Observability

Dev/E2E diagnostics SHALL expose startup mode/reason, baseline, spawn-resolution source and readiness source sufficiently for deterministic assertions.

## Verification mapping

| Requirement group | Primary evidence |
|---|---|
| Classification | GamePersistence unit/integration matrix |
| Baseline-aware surface/readiness | World unit tests |
| Player restore safety | Game/Player integration + browser case |
| Recovery UX/reset | Playwright real IndexedDB E2E |
| Data preservation/failure atomicity | repository unit tests + E2E fault injection |
| Fresh regression | game.spec + visual screenshot |
| Certification integrity | final command table in verification.md |
| State truth | validate-state + refetched GitHub main |
| Adjacent audit | updated risk register + verification findings |
