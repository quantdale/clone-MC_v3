# Verification: 234-server-world-persistence

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence

All evidence: `tests/unit/PersistentWorldCodecs.test.ts` (35 tests) + `tests/unit/ServerSaveLifecycle.test.ts` (39 tests incl. 2 integration), all passing in the final gate run.

| Requirement | Evidence | Status |
|---|---|---|
| PWC-REQ-1 Encode produces validator-passing shared payloads | PWC REQ-1 block (lines 155-237, 9 tests): encode output passes the shared validator for chunk-sections/entities/block-entities/metadata/player-state; value without `serialize()`/`serializeChunk()` rejected; column coords vs unit coords disagreement rejected; group-serializer validator failures wrapped with `PersistentWorldCodecs:` prefix | PASS |
| PWC-REQ-2 Decode migrates then validates | PWC REQ-2 block (lines 239-311, 6 tests): current-version decode unchanged, injected migration applied before validation for both `chunk-sections` (minSectionY mutation) and `world-metadata`, `DOWNGRADE`/`UNKNOWN_VERSION` rejected with the codec prefix, throwing migration rejected with no unit | PASS |
| PWC-REQ-3 Round-trip fidelity | PWC REQ-3 block (lines 313-365, 5 tests): `decode(encode(unit))` reproduces kind/worldId/coords and an equivalent value for all five kinds (block-entities/entities arrays, metadata/player-state records, chunk-sections via `serialize()` deep-equality) | PASS |
| PWC-REQ-4 Foreign and ambiguous data rejected | PWC REQ-4 block (lines 367-420, 5 tests): worldId mismatch for world-metadata/player-state/block-entities, coordinate mismatch for entities/chunk-sections — all throw `PersistentWorldCodecs: ... does not match requested ...` | PASS |
| PWC-REQ-5 Codec determinism | PWC REQ-5 block (lines 422-444, 2 tests): repeated encodes deep-equal; no timestamps/randomness in payloads | PASS |
| PWC-REQ-6 Invalid input and unknown kind rejected | PWC REQ-6 block (lines 446-520, 8 tests): unknown kind on encode/decode meta, malformed chunk-sections/entities/player-state payloads, `validatePersistentUnit` (missing value, empty worldId, non-integer coords), non-zero singleton coords, `unitKey` matches the 038 keying convention | PASS |
| SSL-REQ-1 Lifecycle state machine and load | SSL REQ-1 block (lines 201-298, 7 tests): loaded/created outcomes, deterministic restore order (metadata, player-state, columns, block entities, entities sorted by key), rollback to `unloaded` on decode failure or readWorld throw, load-while-not-unloaded rejection, empty worldId / non-function restore rejection | PASS |
| SSL-REQ-2 Dirty-unit marking and de-duplication | SSL REQ-2 block (lines 304-377, 5 tests): mark→drain exactly once, re-mark keeps FIFO position and drains the newest value first (amended scenario, see design.md reconciliation), markDirty-after-close and while-flushing throw `ServerSaveLifecycle: <detail>`, invalid units rejected without touching the pending set | PASS |
| SSL-REQ-3 Bounded drain with retry and no-loss | SSL REQ-3 block (lines 385-461, 4 tests): `limitPerDrain` bound, failed write re-queued at the end and retried on the next drain with classified failure recorded, failed encode kept pending with `encode` failure, combined gate-down/encode/write failure never throws | PASS |
| SSL-REQ-4 Tick-driven autosave cadence | SSL REQ-4 block (lines 463-535, 6 tests): drain exactly on `tick % autosaveEveryTicks === 0`, nothing off-cadence, empty queue drains zero without touching the boundary, invalid tick numbers rejected, drains serialized in FIFO order across cadence ticks, no-op off state running | PASS |
| SSL-REQ-5 Graceful flush and save-and-close | SSL REQ-5 block (lines 543-633, 7 tests): saveAndClose drains to empty (player-state via `writePlayerState`, four queue kinds via `write`) and closes, flush leaves state `flushing`, zero-progress guard stops at the limit with `saveAndClose` throwing while `flushing`, recovery after storage failure, flush-while-unloaded rejection, `reset` restores a usable lifecycle | PASS |
| SSL-REQ-6 Storage-health gating | SSL REQ-6 block (lines 635-671, 2 tests): gate down fences all writes with units pending and records a `storage` failure; drain resumes after the gate recovers | PASS |
| SSL-REQ-7 Load data integrity and atomicity | SSL REQ-7 block (lines 673-751, 5 tests): one invalid record fails the whole load with nothing restored, duplicate column/block-entity keys reject, non-array snapshot lists reject, foreign-world metadata rejected through the real production codec adapter | PASS |
| Integration (4.5) | SSL integration block (lines 760-961, 2 tests): `WorldTickProcess`-hosted lifecycle round-trips a small world — load creates, mark all five units, cadence drain at tick 100 persists 4 queue kinds + 1 player-state, mutate + re-mark drains newest state only, `saveAndClose`, reload through a fresh lifecycle restores the mutated world (block states, metadata, player state, 1 block entity, 1 entity id 0); deterministic runs produce deep-equal write payloads | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| npm run typecheck | PASS | `tsc --noEmit`, exit 0 (whole repo) |
| npm run lint | PASS | `eslint .`, exit 0 (whole repo) |
| npm test | PASS | 258 files, 3265/3265 tests (3191 baseline + 35 PersistentWorldCodecs + 39 ServerSaveLifecycle) |
| npm run build | PASS | vite production build, 105 modules, exit 0 |
| npm run test:e2e | PASS | 22/22 Playwright tests |

## Edge/adversarial validation

- Load with a single corrupt/mis-versioned record fails the whole world and rolls back to `unloaded` (no partial server world); duplicate keys within one kind reject before any restore; non-array snapshot lists reject.
- Re-marking a dirty key before drain writes the newest state while preserving FIFO position (the pre-authored spec scenario was amended to match the FIFO invariant — recorded in design.md reconciliation notes).
- Write failure and encode failure re-queue the unit at the end (no silent loss) and record a classified `SaveFailure`; a drain never throws, even with gate down + encode failure + write failure combined.
- Storage gate down fences writes with units staying pending; drain resumes after recovery.
- `markDirty`/`load` after `closed`/while not `unloaded` throw `ServerSaveLifecycle: <detail>` without mutating state; invalid units are rejected before touching the pending set.
- Decode rejects foreign (`worldId` mismatch) and mis-versioned (`DOWNGRADE`/`UNKNOWN_VERSION`) records; singleton kinds require `chunkX = chunkZ = 0`.
- Autosave fires only on `tick % autosaveEveryTicks === 0`; empty queue drains zero without calling the boundary; `tick` rejects non-safe-integer/negative values.
- A unit re-marked while its write is in flight stays pending with the newer value (identity-checked removal — no stale write, no drop).

## Migration/compatibility validation

- No record shape, `WORLD_DB_VERSION`, or migration-chain change; only the existing 041 chains (`migrateChunkColumn`/`migrateWorldMetadata`, currently identity) are applied on decode, with injectable seams for tests.
- A world written through the lifecycle's production codec adapter loads back through a fresh lifecycle and restores the identical in-memory world (integration round-trip 4.5); the codec speaks the exact shared payload shapes (034-040) the client path already writes.
- Full regression gate (existing 3191 unit + 22 e2e) stays green with the two new modules; build stays at 105 modules (no new production imports of browser APIs; both modules are pure and headless).

## Performance/resource validation

- Drain bounded by `limitPerDrain` (default 64) per cadence tick; autosave bounded by `autosaveEveryTicks` (default 100 = 5s at 20 TPS); empty queues cost a size check only and never touch the boundary.
- Pending map bounded by distinct dirty keys; failure log bounded at 32 entries (oldest dropped); drains serialized on one promise chain so cadence cannot interleave writes.
- The new modules use no browser APIs (no IndexedDB, no DOM) — persistence primitives are consumed through the injected `SaveLoadBoundary` seam.

## Regressions

None. Full suite green in the final gate run: typecheck PASS, lint PASS, unit 3265/3265, build PASS, e2e 22/22.

## Incomplete tasks

None. All 15 tasks complete (`tasks.md` all `[x]`).

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. Change 234-server-world-persistence is complete and may advance. Next change: 235-reconnect-state-recovery.
