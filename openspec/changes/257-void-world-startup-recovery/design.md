# Design: 257-void-world-startup-recovery

## Context/current state

### Current startup flow

1. `src/main.ts` creates `GamePersistence` and awaits `open()`.
2. `GamePersistence.open()` loads world metadata, canonical columns, sparse edits, player state and other persisted records.
3. It classifies `generationBaseline` as `current | legacy-unknown | unsupported`.
4. `Game.applyInitialWorldData()` calls `World.setGenerationBaseline()`, imports canonical columns, then imports edits.
5. `Game.spawnPlayerSafely()` calls `World.getMotionBlockingHeight()`.
6. Persisted player state may then overwrite the spawn.
7. Streaming starts and `World.processGeneration()` handles missing columns.
8. `World.getReadyProgress()` controls when loading ends and fixed-tick simulation may begin.

### Confirmed contradiction

For `legacy-unknown` / `unsupported`:

- `World.processGeneration()` intentionally does not generate missing terrain. It ensures an empty canonical column, marks it Full, syncs air, applies sparse edits, and treats the chunk as generated.
- `World.getMotionBlockingHeight()`, however, uses `generator.getHeightAt()` whenever the canonical column is absent.
- `spawnPlayerSafely()` therefore may place the player above terrain that will never be generated.
- `getReadyProgress()` also picks a predicted surface slab with `generator.getHeightAt()`, which is not authoritative for an incompatible persisted baseline.
- `applyInitialPlayerState()` accepts a finite, in-bounds persisted position without checking that the underlying column is present/compatible or that a collision-support surface exists.

The old mitigation documented in `PROGRAM_STATE.md` is to clear IndexedDB/site data manually. That is operationally unacceptable for a shipped game.

### Certification/state drift

- `AGENTS.md` baseline final gate includes `npm run test:e2e`.
- Change 256 verification explicitly says full E2E was not rerun but still marks VERIFIED.
- Current GitHub `main` is ahead of the publication values recorded in `PROGRAM_STATE`.
- Historical risk register R-6 already identifies real IndexedDB corruption-at-boot as missing browser proof.

## Target state

The engine has one explicit, inspectable world-startup state machine:

```ts
type WorldStartupMode =
  | { kind: 'current'; baseline: 'current' }
  | {
      kind: 'preserved';
      baseline: 'legacy-unknown' | 'unsupported';
      spawn: VerifiedSpawnCoverage;
    }
  | {
      kind: 'recovery-required';
      baseline: 'legacy-unknown' | 'unsupported';
      reason: WorldRecoveryReason;
      diagnostics: WorldRecoveryDiagnostics;
    };
```

Exact symbol names may change to fit the existing architecture, but the contract MUST exist as one authoritative decision rather than ad-hoc checks scattered across UI, Game and World.

No fixed tick, movement physics, survival tick or interaction becomes active until startup mode is `current` or `preserved` with verified support.

## Invariants

1. A non-current generation baseline MUST NOT authorize generation through the current generator.
2. An absent canonical column in a non-current world MUST NOT be treated as if current-generator terrain exists for spawn/readiness.
3. A player MUST NOT enter active simulation unless its spawn/restored position has proven world support or the game has intentionally relocated it to a proven safe position.
4. Recovery MUST NOT silently delete or overwrite old world data.
5. Destructive reset MUST be world-scoped and user-confirmed.
6. Fresh/current worlds MUST preserve existing deterministic generation and startup behavior.
7. Recovery decisions MUST be deterministic for the same persisted records.
8. Storage errors MUST be visible and diagnosable; they MUST NOT silently convert an incompatible persisted world into a void.
9. Readiness MUST describe actual renderable/playable canonical data, not a hypothetical generator surface when that generator is forbidden.
10. Final verification truth MUST match commands actually run and the fetched GitHub head.

## API and data model

### Persistence startup assessment

Add a small typed result to the persistence/bootstrap boundary. Suggested intent:

```ts
interface WorldStartupAssessment {
  baseline: WorldGenerationBaseline;
  mode: 'current' | 'preserved' | 'recovery-required';
  reason:
    | 'NONE'
    | 'MISSING_SPAWN_COVERAGE'
    | 'UNSUPPORTED_GENERATOR'
    | 'LEGACY_BASELINE_WITHOUT_CANONICAL_TERRAIN'
    | 'CORRUPT_CANONICAL_DATA'
    | 'PLAYER_POSITION_UNSUPPORTED';
  persistedColumnCount: number;
  hasDurableEdits: boolean;
}
```

Do not encode UI strings into storage-layer types.

### World query split

Separate "actual canonical surface" from "predict current generation" so callers cannot accidentally conflate them.

Suggested intent:

```ts
getCanonicalMotionBlockingHeight(x: number, z: number): number | null;
predictGeneratedMotionBlockingHeight(x: number, z: number): number;
getSpawnSurfaceHeight(x: number, z: number): number | null;
```

For current worlds, `getSpawnSurfaceHeight` may use the deterministic generator when a column has not yet been allocated. For non-current worlds, it MUST return `null` for an absent/unproven canonical column.

### Player support validation

Add a bounded check around a candidate player position:

- column exists or current baseline permits generation;
- feet/head are within dimension bounds;
- one or more collision shapes provide support below the feet within the documented epsilon;
- target body volume is not inside a solid collision shape;
- startup safety check has a bounded local search for a nearby safe cell before declaring recovery-required.

### Recovery controller

Implement one UI-facing recovery controller/action with explicit phases:

`idle -> preparing-backup -> confirmation -> resetting -> reloading | failed`.

Use existing world archive/export primitives if they can create a reliable backup. If archive support cannot safely export the specific legacy shape, preserve original records until the user confirms reset and clearly report that only world-scoped reset will proceed.

## Control/data flow

### Normal current world

`main.ts -> persistence.open -> assessment(current) -> Game imports state -> safe spawn/current generator -> preload -> actual ready -> simulation`.

### Preserved legacy/unsupported world with sufficient canonical coverage

`persistence.open -> assessment(preserved) -> import persisted columns -> baseline-aware canonical spawn/readiness -> restore player only if supported -> preload existing terrain only -> simulation`.

Missing columns remain unavailable/air outside preserved coverage; the game MUST not claim they are generated current terrain.

### Recovery-required legacy/unsupported/partial world

`persistence.open -> assessment(recovery-required) -> Game constructs in paused recovery state -> no movement physics/fixed ticks -> recovery overlay visible -> user can export/backup/reset -> reset succeeds -> page reload/current world -> normal current path`.

No frame may activate simulation between assessment and recovery completion.

## Detailed behavior

### Classification

Use metadata + canonical column inventory + durable edits + player state to determine whether the world can prove a playable spawn. Classification must not rely only on the presence/absence of `generationVersion`.

At minimum, a preserved non-current world must prove canonical data for a bounded spawn/readiness neighborhood or a safe persisted player neighborhood. If not, it is recovery-required.

### Baseline-aware surface

- Current baseline + absent column: current generator prediction is allowed.
- Non-current baseline + present canonical column: use canonical heightmap.
- Non-current baseline + absent column: return unknown/no-safe-surface. Do not call current generator for startup truth.

### Readiness

Readiness for current worlds retains the existing generated/mesh criteria.

Readiness for preserved non-current worlds must derive the relevant surface section from canonical height data. A missing required column/section is not ready and should normally have been classified recovery-required before streaming.

### Restored player state

After loading state:

1. validate seed/number/dimension as today;
2. validate support/coverage;
3. if supported, restore;
4. if unsupported, search a bounded nearby canonical safe spawn;
5. if none exists, stay in recovery-required state; do not drop into void.

### Recovery/reset

The reset operation must delete only records for the current `worldId` from every world-owned repository/store. It must not call a generic clear-site-data API.

Prefer an existing repository-level delete method; add explicit world-scoped delete APIs only where missing.

Reset must be failure-atomic from the user's perspective: if any mandatory pre-reset backup/validation step fails, leave original data intact and show an actionable error. If deletion partially fails, remain in recovery UI, record which stores failed, and never claim reset success.

### Diagnostics

Expose enough test/debug information to identify:

- baseline;
- startup mode/reason;
- persisted column count;
- chosen spawn source (generated prediction vs canonical vs relocated);
- readiness source;
- reset/backup phase.

Do not expose private user data.

## Failure modes

- IndexedDB unavailable/private mode: existing degraded-memory behavior may continue for a truly fresh world, but if incompatible persisted state is detected or storage reads are incomplete, do not infer a current baseline.
- Metadata read succeeds but columns read fails: recovery-required/degraded; do not generate over uncertainty.
- Player state valid structurally but unsupported spatially: relocate only to proven canonical/current-safe spawn.
- Backup/export fails: block destructive reset until user explicitly chooses a documented no-backup path, if product policy allows it; otherwise remain recoverable without mutation.
- One store fails during reset: visible failure; do not claim fresh-world success.
- Visual mesh construction fails: loading/recovery stays non-playable; no physics.
- WebGL loss during recovery: existing context-loss path must not accidentally dismiss recovery state.

## Compatibility/migration

No generation-version bump is required solely for this change.

Do not rewrite `generationVersion` on old metadata.

Current-baseline saves are a regression-protected fast path.

Legacy localStorage migration remains non-destructive and must feed the same startup assessment after migration.

## Performance/resource constraints

- Startup assessment is bounded by already-loaded metadata/column summaries whenever possible.
- Do not scan every block in a large world to prove spawn safety.
- Safe-spawn search must have a documented radius/attempt cap.
- No new per-frame allocations in normal current-world readiness beyond existing behavior.
- Recovery UI does not keep duplicate world/GPU resources alive after reset/reload.
- Browser tests must include resource/dispose checks where the recovery path reconstructs or tears down Game state.

## Testing seams

### Unit

- baseline-aware height query matrix;
- safe-player-position validator;
- startup classification matrix;
- world-scoped reset store coverage;
- reset partial-failure behavior;
- readiness using canonical height vs generator prediction;
- current-world behavior equivalence.

### Integration

Construct `GamePersistence` over the in-memory IndexedDB mock with:
- fresh current world;
- metadata only / no columns;
- missing `generationVersion`;
- future `generationVersion`;
- partial canonical columns;
- sparse edits only;
- valid canonical spawn ring;
- corrupt metadata/column read.

### Browser / real IndexedDB

Seed real IndexedDB before app scripts and prove:
- current world boots with visible terrain;
- legacy-unknown partial world shows recovery UI and never simulates/falls;
- unsupported future-version world shows recovery UI and preserves records;
- safe preserved world loads from canonical terrain;
- reset-current-world recovers to generated terrain;
- reload remains healthy;
- storage/reset failure does not erase original data;
- persisted player over missing terrain is rejected/relocated.

### Visual

Capture deterministic screenshots for:
- fresh current spawn after worldReady;
- recovery-required overlay;
- post-reset fresh terrain.

Use image assertions/screenshot review to ensure the fix is visible, not merely log-correct.

## Observability/debugging

Add a compact startup diagnostic object or debug overlay fields gated to dev/E2E:
- `worldStartupMode`
- `worldStartupReason`
- `generationBaseline`
- `spawnResolution`
- `readyProgress`
- reset/backup status.

Production users should see concise recovery copy, not internal enum names.

## Affected files/symbols

Expected, subject to source-trace confirmation before edits:

- `src/storage/GamePersistence.ts` — startup assessment and world-scoped reset orchestration or repository access.
- `src/storage/WorldMetadataRepository.ts`, `ChunkSectionRepository.ts`, `ChunkEditRepository.ts`, `PlayerStateRepository.ts`, `BlockEntityRepository.ts`, `EntityRepository.ts` — targeted world delete helpers if missing.
- `src/storage/WorldArchiver.ts` / `WorldArchive.ts` — backup/export reuse if safe.
- `src/world/World.ts` — baseline-aware height/readiness semantics.
- `src/engine/Game.ts` — startup state machine, safe player restore, recovery UI/action, simulation gate.
- `src/main.ts` — only if bootstrap ownership needs to pass the startup result explicitly.
- `index.html` / `src/styles.css` — recovery overlay controls/presentation if existing error UI is insufficient.
- `tests/unit/*Persistence*.test.ts`, `World*.test.ts`, `Player*.test.ts`.
- `tests/e2e/persistence.spec.ts`, `tests/e2e/game.spec.ts`, visual tests/goldens only if intentionally changed.
- OpenSpec state/evidence/risk-register files.

## Rejected alternatives

### "Just clear IndexedDB/site data"

Rejected. It requires developer tooling, deletes unrelated origin data, and hides a product bug.

### Automatically generate current terrain into an incompatible world

Rejected. It silently changes saved-world semantics and can overwrite the user's historical terrain baseline.

### Always ignore persisted player state

Rejected. It breaks valid saves and is unnecessary when support can be proven.

### Disable persistence entirely when baseline is old

Rejected. It discards a recoverable preserved-world path and can lose user progress.

### Treat a loading timeout as recovery

Rejected. Timeout is a symptom, not a compatibility decision, and does not prove data safety.

## Downstream dependencies

Any future save-schema migration, worldgen-version compatibility layer, or multi-world selector should consume this startup-compatibility state rather than reintroducing ad-hoc baseline checks.
