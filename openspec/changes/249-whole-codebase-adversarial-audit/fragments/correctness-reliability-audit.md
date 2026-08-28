# Correctness + Reliability audit fragment

Auditor scope: `specs/audit-correctness/spec.md` (REQ-C1..C4) and
`specs/audit-reliability/spec.md` (REQ-R1..R4). Read-only audit; this file is the
only artifact created.

## Coverage

### Scope examined

Correctness surfaces:
- `src/simulation/ScheduledTickQueue.ts` (full read) — deterministic ordering,
  de-duplication, versioned serialize/deserialize with validate-before-mutate.
- `src/simulation/ReplayVerifier.ts`, `ReplayRecording` (via verifier usage),
  `StateHasher.ts`, `SeedRng.ts`, `InputCoordinator.ts` (full reads) — replay
  pipeline, canonical hashing, named RNG streams, pure input merge.
- `src/math/PRNG.ts`, `src/math/SectionCoordinate.ts` (full reads) — hash
  functions, negative-coordinate floor division, local index packing.
- `src/worldgen/GoldenSeed.ts`, `StructurePlacement.ts` (full reads) — golden
  fixtures incl. negative coords; region placement config validation.
- `src/world/TerrainGenerator.ts` / `src/worldgen/*` — sampled via grep of PRNG
  consumption sites (`TerrainGenerator.ts:289` seeds per-column from
  `hash2(ax, az, seed)`; deterministic) and via 244 worldgen-regression evidence.
- `src/world/World.ts` — `getBlock`/`setBlock`/`setBlockState` boundary guards,
  edit-overlay/state-overlay bounds, falling-block enqueue.
- `src/simulation/WorldBlockAccess.ts` (full read) — thin adapter over World.
- Codec round-trip: cited from 240 recorded probes rather than re-derived.

Reliability surfaces:
- `src/engine/Renderer.ts` (full read) — WebGL creation try/catch,
  `webglcontextlost`/`webglcontextrestored` handlers, dispose.
- `src/engine/InputManager.ts` (full read) — `pointerlockerror` handler,
  promise-form `requestPointerLock` rejection guard, focus-loss reset, dispose.
- `src/engine/Game.ts` (full read, 1673 lines) — error/recovery paths
  (`showError`, `onContextLost`/`onContextRestored`, `showInputError`,
  `applyFocusLoss`, loop error callback), dispose idempotence, save fallbacks.
- `src/engine/ResourceManager.ts` (full read) — dispose error isolation,
  double-dispose safety.
- Workers: `src/rendering/WorkerJobProtocol.ts` (full read),
  `WorkerMeshing.ts`/`WorkerWorldgen.ts` (client seams), plus a repo-wide sweep
  for `new Worker(`/`onerror`/`terminate(` wiring.
- Bounded growth: `World.editOverlay` LRU cap, `stateOverlay`, queue caps via
  238/239 recorded evidence and `MemoryResourceBudget` derivation.

### Method

Static review of the files above with real line citations; targeted read-only
probes run fresh during this audit:

| Probe | Result |
|---|---|
| `npx vitest run tests/unit/ReplayVerifier.test.ts tests/unit/StateHasher.test.ts` | PASS — 22/22 (replay reproduction, cross-run stability, divergence diagnosis still green on current tree) |
| `npx vitest run tests/unit/GoldenSeed.test.ts tests/unit/ScheduledTickQueue.test.ts` | PASS — 17/17 (golden fixtures incl. negative coords; tick-queue ordering/persistence) |
| `grep -rl "ChunkManager" tests/unit` | no direct ChunkManager test file (see 249-COR-005 / legacy AUDIT-013) |
| `grep -rn "new Worker\(" src` | no production worker instantiation (only protocol/harness modules) |

### Prior evidence cited

- **241** (`241-deterministic-replay-suite/verification.md`): REC-1..REC-5,
  HASH-1..HASH-6, VER-1..VER-5 all PASS; full gate green (3613 unit tests).
  Covers REQ-C1 replay-hash-stable scenario.
- **238** (`238-worker-and-main-thread-stress/verification.md`): worker-job
  saturation exactly-once + stale rejection VERIFIED; save-queue bounded pending
  VERIFIED; pathfinding cancellation/stale detection VERIFIED. Covers REQ-R2
  stale-result scenario and part of REQ-R4.
- **239** (`239-long-session-memory-stress/verification.md`): long exploration /
  churn / idle / teleport / reload sessions PASS; GPU-context restore scenario
  PASS (geometry ±4, textures ±1, programs ±1, no fatal console error);
  failure-behavior scenario PASS; `maxEditOverlayChunks = EDIT_OVERLAY_MAX_CHUNKS
  (10_000)` budget derivation PASS. Covers REQ-R3 and REQ-R4.
- **240** (`240-save-recovery-stress/verification.md`): invalid payloads
  rejected atomically, corrupt records rejected on read, unsupported archive
  versions refused, import round-trip stable, malformed archives rejected with
  all stores empty. Covers REQ-C4.
- **244** (worldgen regression matrix) and **243** (redstone automation e2e):
  cover REQ-C2 worldgen determinism and REQ-C3 transition sampling at the e2e
  level (cited, not re-run).

### minimumMet

- correctness: **true** (all four REQs evidenced; gaps noted below are depth
  limitations, not missing requirements).
- reliability: **true** (all four REQs evidenced).

Gaps (honesty record):
- REQ-C3 transition sampling relied on prior 242/243 e2e evidence plus code
  reading; no new headless redstone/fluid transition probe was authored.
- REQ-R2 worker-crash isolation could not be exercised dynamically because no
  production code instantiates a Worker (see 249-REL-003); the claim about
  missing crash handling is static-only.
- Full worldgen matrix (244) and visual/input matrices were cited, not re-run,
  per the design's no-duplication rule.

## Findings

### 249-COR-001 — Deterministic replay invariant holds; no determinism violation found
- category: correctness
- classification: non-blocking
- severity: info
- confidence: confirmed
- evidenceTier: mixed
- status: not-an-issue
- title: Replay determinism (REQ-C1) verified — same seed/input schedule reproduces identical hashes
- affected: `src/simulation/ReplayVerifier.ts`, `src/simulation/StateHasher.ts`, `src/simulation/SeedRng.ts`
- description: The 241 replay suite remains green on the current tree. The
  verifier rejects malformed recordings pre-run, converts mid-tick system throws
  into structured `system_failure` divergences, detects seed-stream breaks
  (`seed_mismatch`), and refuses cross-version comparisons
  (`ReplayVerifier.ts:99-179`, `210-252`). Canonicalization rejects
  non-deterministic values (NaN, cycles, Map/Set, class instances) instead of
  encoding them ambiguously (`StateHasher.ts:53-112`).
- trigger: n/a (positive verification)
- impact: No blocking determinism violation exists on the audited surfaces.
- evidence:
  - `openspec/changes/241-deterministic-replay-suite/verification.md:11-26` (REC/HASH/VER rows PASS)
  - Fresh probe: `npx vitest run tests/unit/ReplayVerifier.test.ts tests/unit/StateHasher.test.ts` → 22 passed
- recommendation: None. Keep REPLAY_HASH_VERSION pinning discipline.

### 249-COR-002 — `World.getBlock` silently returns Air for non-integer coordinates and unloaded chunks (AUDIT-010 residual)
- category: correctness
- classification: non-blocking
- severity: low
- confidence: confirmed
- evidenceTier: static
- status: open
- title: Silent Air return persists on the block-read path
- affected: `src/world/World.ts:160-171` (`getBlock`), consumed by `src/simulation/WorldBlockAccess.ts:14-16`
- description: `getBlock` returns `BlockId.Air` both for non-integer inputs and
  for any chunk that is absent/unloaded. Callers cannot distinguish "air" from
  "not known". `setBlock` is properly guarded (integer check, y-bounds
  `y < 0 || y >= CHUNK_DIMENSIONS.height`, registry membership —
  `World.ts:178-186`) and records edits for not-yet-loaded chunks rather than
  dropping them (`World.ts:210-221`), so the write path does not corrupt.
- trigger: Any behavior/physics query against an unloaded or out-of-window
  chunk, or a non-integer coordinate reaching the API.
- impact: A behavior reading a neighbor in an unloaded chunk sees Air and may
  make a wrong local decision (e.g. fluid/fire spreading logic sampling an
  unloaded border). The player-fall-through case is mitigated by the streaming
  safety ring (`Game.ts:597-602` holds the player until the local ring is
  ready). Not classified blocking: no storage corruption or wrong-location
  write was identified — writes to unloaded chunks are journaled in the edit
  overlay and applied on generation.
- evidence:
  - `src/world/World.ts:160-171` (Air returns)
  - `src/world/World.ts:173-221` (guarded, journaled write path)
  - Legacy: `FULL_AUDIT_REPORT.md` AUDIT-010
- recommendation: Consider a tri-state read (`getLoadedBlock`) for simulation
  consumers that must distinguish unloaded from air; keep the Air default for
  rendering/meshing borders.

### 249-COR-003 — `PRNG.nextInt` accepts `max <= 0` silently (API asymmetry with `SeedRng.nextInt`)
- category: correctness
- classification: non-blocking
- severity: low
- confidence: confirmed
- evidenceTier: static
- status: open
- title: Unguarded `PRNG.nextInt(max)` returns 0 for max <= 0
- affected: `src/math/PRNG.ts:24-26`; contrast `src/simulation/SeedRng.ts:41-46`
- description: `Math.floor(this.next() * max)` yields `0` for `max = 0` and `0`
  or negative results for negative `max` without throwing. `SeedRng.nextInt`
  validates `maxExclusive` as a positive integer and throws `RangeError`. All
  current `PRNG.nextInt` call sites pass positive literal constants
  (`TextureAtlas.ts:124-549`, `Environment.ts` via `new PRNG`), and structure
  placement uses `SeedRng` with `offsetSpan = spacing - separation` proven ≥ 1
  by config validation (`StructurePlacement.ts:66-68,109-111`), so no live bug.
- trigger: A future caller passing a computed span that can be ≤ 0.
- impact: Latent silent-wrong-result hazard only; deterministic output, no
  corruption.
- evidence:
  - `src/math/PRNG.ts:24-26`
  - `src/simulation/SeedRng.ts:41-46`
  - `src/worldgen/StructurePlacement.ts:63-68` (span ≥ 1 enforced where it matters)
- recommendation: Add the same RangeError guard to `PRNG.nextInt` for parity.

### 249-COR-004 — Live-game cosmetic systems consume `Math.random`, outside the governed stream scheme
- category: correctness
- classification: non-blocking
- severity: info
- confidence: confirmed
- evidenceTier: static
- status: open
- title: Item-entity/xp-orb/interaction RNG is not seed-governed in the live Game
- affected: `src/engine/Game.ts:411` (`ItemEntityManager … rng: Math.random`),
  `Game.ts:413` (`XpOrbManager … rng: Math.random`), `Game.ts:431`
  (`PlayerInteraction … rng: Math.random`)
- description: The authoritative replay pipeline governs named `SeedRng`
  streams (241), but the single-player live Game injects `Math.random` into
  item-entity, xp-orb, and interaction randomness. This is not a replay
  determinism violation (recordings capture harness streams, and these systems
  are presentation/economy flavor in the single-player client), but it means
  live drop rolls are not reproducible from the world seed.
- trigger: Any mined-block drop roll or orb merge in a live session.
- impact: Cosmetic irreproducibility; no state corruption, no replay break.
- evidence:
  - `src/engine/Game.ts:411,413,431`
  - Contrast: `src/simulation/SeedRng.ts:77-80` (`createNamedRng` contract)
- recommendation: If server-authoritative parity later requires reproducible
  drops, route these through named streams.

### 249-COR-005 — ChunkManager has no dedicated unit test file (AUDIT-013 residual)
- category: correctness
- classification: non-blocking
- severity: low
- confidence: confirmed
- evidenceTier: mixed
- status: open
- title: ChunkManager covered only indirectly through World-level tests
- affected: `src/world/ChunkManager.ts`; `tests/unit/`
- description: `grep -rl "ChunkManager" tests/unit` returns no file; sibling
  modules have direct tests (`ChunkColumn.test.ts`, `ChunkSection.test.ts`,
  `ChunkStatus.test.ts`, `ChunkTicket.test.ts`), and `World.test.ts` exercises
  the manager indirectly. AUDIT-012/014/015 are resolved
  (`PlayerPhysics.test.ts`, `World.test.ts`, `PlayerInteraction.test.ts`
  exist); AUDIT-013 is only partially resolved.
- trigger: Refactoring ChunkManager in isolation.
- impact: Regression risk localized to one module; no current defect claimed.
- evidence:
  - Probe: `grep -rl "ChunkManager" tests/unit` → empty
  - `tests/unit/World.test.ts` (indirect coverage)
- recommendation: Add a focused ChunkManager unit spec in a future hardening change.

### 249-REL-001 — WebGL context loss handled end-to-end (AUDIT-001 resolved)
- category: reliability
- classification: non-blocking
- severity: info
- confidence: confirmed
- evidenceTier: dynamic
- status: resolved
- title: Context loss produces a defined user-visible state; restore rebuilds the renderer
- affected: `src/engine/Renderer.ts:120-148` (handlers), `src/engine/Game.ts:954-982` (recovery paths)
- description: `webglcontextlost` calls `preventDefault()`, clears
  `rendererCreated`, and Game stops the loop, releases pointer lock, and shows
  the explicit "graphics context was lost" error state
  (`Renderer.ts:120-124`, `Game.ts:955-963`). On restore the old renderer is
  disposed, a new one is constructed inside try/catch, configuration is
  re-applied, and the game returns to the pause overlay with the loop resumed;
  failed restoration shows a distinct error (`Renderer.ts:126-148`,
  `Game.ts:966-982`). No silent freeze path exists.
- trigger: Browser WebGL context loss/restoration.
- impact: None outstanding; recovery or explicit error state in every branch.
- evidence:
  - `src/engine/Renderer.ts:120-148`
  - `src/engine/Game.ts:955-982`
  - 239 verification: GPU-context restore scenario PASS (geometry ±4, textures
    ±1, programs ±1, no fatal console error) —
    `239-long-session-memory-stress/verification.md:23`
- recommendation: None.

### 249-REL-002 — Pointer-lock refusal surfaced with recoverable feedback (AUDIT-003 resolved)
- category: reliability
- classification: non-blocking
- severity: info
- confidence: confirmed
- evidenceTier: static
- status: resolved
- title: `pointerlockerror` clears device state and shows a recoverable overlay message
- affected: `src/engine/InputManager.ts:104-116,291-301`; `src/engine/Game.ts:395-404,1024-1032`
- description: Both the event path (`pointerlockerror` listener) and the
  promise-rejection path (Chromium's promise-returning `requestPointerLock`,
  wrapped via `Promise.resolve(...).catch(...)` to avoid unhandled rejections)
  funnel into one handler that resets `locked`, clears stale movement/held
  input, and invokes the Game callback showing "Pointer lock failed. Click the
  canvas to try again." The game stays consistent and re-interactable.
- trigger: Pointer-lock request refused/failing.
- impact: None outstanding.
- evidence:
  - `src/engine/InputManager.ts:104-116` (promise guard), `291-301` (handler)
  - `src/engine/Game.ts:398-404` (applyFocusLoss + showInputError)
- recommendation: None.

### 249-REL-003 — Worker job client has no timeout or worker-crash recovery; unreachable in production today
- category: reliability
- classification: non-blocking
- severity: medium
- confidence: high
- evidenceTier: static
- status: open
- title: Pending worker jobs would hang forever if a worker crashed; no production worker is instantiated
- affected: `src/rendering/WorkerJobProtocol.ts:92-141` (`WorkerJobClient`);
  `src/rendering/WorkerMeshing.ts:114`; `src/worldgen/WorkerWorldgen.ts:95`
- description: `WorkerJobClient.resolveResult` correctly rejects stale,
  duplicate, unknown, and invalid results exactly once
  (`WorkerJobProtocol.ts:117-131`; 238 saturation evidence VERIFIED), satisfying
  the stale-result half of REQ-R2. However there is no timeout, no retry, and
  no `worker.onerror`/`messageerror` wiring anywhere in `src/`: a worker that
  throws uncaught or is terminated leaves its jobs in `pending` permanently —
  the "silent hang" shape the spec calls blocking. It is classified
  **non-blocking** solely because the production runtime never constructs a
  Worker (`grep -rn "new Worker\(" src` matches nothing; meshing/worldgen run
  synchronously on the main thread in the shipped game — e.g. `World.ts:590`
  calls `this.mesher.mesh(...)` directly). The hazard activates the moment a
  real worker host is wired in without adding crash handling.
- trigger: Wiring a `WorkerJobClient` to a real Worker that then throws or is
  terminated with jobs pending.
- impact: Latent unrecoverable hang in any future worker-backed path.
- evidence:
  - `src/rendering/WorkerJobProtocol.ts:117-136` (stale rejection present; no expiry)
  - Probe: `grep -rn "new Worker\(" src` → no production instantiation
  - 238 verification: stale-rejection under saturation VERIFIED (crash path not exercised)
- recommendation: Before any production worker adoption, add job timeouts +
  `onerror` → cancel/retry so pending jobs cannot leak.

### 249-REL-004 — Block-state overlay grows without a cap while the edit overlay is LRU-capped
- category: reliability
- classification: non-blocking
- severity: low
- confidence: confirmed
- evidenceTier: static
- status: open
- title: `stateOverlay` has no size bound or eviction
- affected: `src/world/World.ts:89` (`stateOverlay` map), `World.ts:277-290`
  (insertion), `World.ts:784-790` (edit-overlay LRU cap that does not cover it)
- description: The edit overlay is capped at `EDIT_OVERLAY_MAX_CHUNKS = 10_000`
  with LRU eviction (`World.ts:80,777-790`), resolving AUDIT-005's FIFO issue.
  The parallel `stateOverlay` (block-state overrides for stateful blocks) has
  no cap and no eviction: entries are removed only when the cell's plain block
  id is overwritten (`World.ts:195-201`) or on full dispose
  (`World.ts:994`). Evicting an edit-overlay key does not evict the matching
  state-overlay key, so an arbitrarily long session touching stateful blocks
  across many distinct chunks accumulates state-overlay entries without bound.
- trigger: Very long session writing block states (crops, farmland, fire) in
  more than 10k distinct chunks.
- impact: Slow unbounded memory growth; each entry is small (string key + small
  map), so this is a gradual leak, not a near-term crash — hence non-blocking
  under the taxonomy (no realistic hang/crash within normal lifecycles, and
  239's sustained-load scenarios stayed within budget).
- evidence:
  - `src/world/World.ts:80,89,195-201,277-290,784-790,994`
  - 239 verification: budget derivation pins `maxEditOverlayChunks = 10_000`
    but defines no state-overlay dimension (`239-...verification.md:14`)
- recommendation: Cap/evict `stateOverlay` alongside the edit overlay (same
  LRU order), or add it as a `MemoryResourceBudget` dimension.

### 249-REL-005 — Disposal is error-isolated and double-dispose safe (AUDIT-011 resolved)
- category: reliability
- classification: non-blocking
- severity: info
- confidence: confirmed
- evidenceTier: static
- status: resolved
- title: ResourceManager isolates throwing disposers; repeated teardown is safe
- affected: `src/engine/ResourceManager.ts:13-29`; `src/engine/Game.ts:509-540`;
  `src/engine/InputManager.ts:255-273`; `src/engine/Renderer.ts:111-118`
- description: `ResourceManager.dispose` snapshots-and-clears the registry
  before iterating and wraps each `dispose()` in try/catch, so a throwing
  disposer neither leaks the rest nor allows double-dispose on a second call
  (`ResourceManager.ts:19-28`). `Game.dispose` is guarded by a `disposed` flag
  (`Game.ts:509-513`); `Renderer.dispose` removes its canvas listeners and
  nulls the renderer; `InputManager.dispose` removes all listeners and exits
  pointer lock. 239's world-reload cycling scenario passed with bounded heap.
- trigger: Teardown running twice or a resource whose dispose throws.
- impact: None outstanding.
- evidence:
  - `src/engine/ResourceManager.ts:13-29`
  - `src/engine/Game.ts:509-540`
  - 239 verification: world-reload cycling PASS (`239-...verification.md:21`)
- recommendation: None.

### 249-REL-006 — Queues and overlays bounded under sustained load (AUDIT-005 resolved; REQ-R4 met)
- category: reliability
- classification: non-blocking
- severity: info
- confidence: confirmed
- evidenceTier: mixed
- status: resolved
- title: Edit overlay LRU-capped; queues stay within configured caps
- affected: `src/world/World.ts:74-80,777-790`; `MemoryResourceBudget` ceilings
- description: The edit overlay uses least-recently-used eviction (access-order
  array with touch-on-write and touch-on-read at `World.ts:216,383,767`,
  eviction loop at `784-790`), superseding the FIFO strategy AUDIT-005
  criticized. 238 verified save-queue pending stays under cap with over-cap
  drops drained later; 239 verified `pendingJobs ≤ maxPendingJobs`, geometry
  bounded, teleport loadedChunks settling (`31,29,25,25,25,25`), and idle
  entity/item counts within budget. The one residual unbounded structure is
  tracked separately as 249-REL-004.
- trigger: Sustained chunk/mesh/save churn.
- impact: None outstanding on the audited structures.
- evidence:
  - `src/world/World.ts:74-80,777-790`
  - 238 verification lines 14-30 (saturation rows VERIFIED)
  - 239 verification lines 14-21 (budget derivation + five sustained-load scenarios PASS)
- recommendation: None beyond 249-REL-004.

### 249-REL-007 — Fatal-error state offers no in-page retry (AUDIT-025 persists)
- category: reliability
- classification: non-blocking
- severity: low
- confidence: confirmed
- evidenceTier: static
- status: open
- title: Error state requires a manual page reload; no retry mechanism
- affected: `src/engine/Game.ts:569-581` (`showError`)
- description: `showError` stops the loop, releases lock, hides UI, and shows
  the message; recovery from context loss is automatic only when restoration
  succeeds — otherwise (and after any loop exception, `Game.ts:473-479`) the
  only path is a manual reload, which the messages do instruct. Edits are
  persisted on `pagehide` (`Game.ts:1484-1486`), so the reload does not lose
  world edits; hence non-blocking.
- trigger: Unrecoverable init/loop/context failure.
- impact: UX friction only; no data loss (localStorage save on hide/dispose).
- evidence:
  - `src/engine/Game.ts:569-581,473-479,1484-1486`
  - Legacy: `FULL_AUDIT_REPORT.md` AUDIT-025
- recommendation: Add a reload button to the error panel in a UX change.

## Legacy reconciliation

| Legacy ID | Category (legacy) | In-scope here | Status | Current-tree evidence |
|---|---|---|---|---|
| AUDIT-001 | Reliability (WebGL context loss) | yes | **resolved** | Handlers + recovery/error states: `Renderer.ts:120-148`, `Game.ts:955-982`; dynamic proof in 239 GPU-context-restore scenario PASS. See 249-REL-001. |
| AUDIT-002 | Performance (sync preload) | perf — not judged here | resolved elsewhere | Preload is frame-budgeted/streamed (`Game.ts:382-393` comment + `world.update` gating); performance category to confirm. |
| AUDIT-003 | UX (pointer-lock error) | yes | **resolved** | `InputManager.ts:104-116,291-301` + `Game.ts:398-404`. See 249-REL-002. |
| AUDIT-005 | Reliability (FIFO overlay eviction) | yes | **resolved** | LRU access-order + 10k cap: `World.ts:74-80,777-790`. See 249-REL-006. Residual adjacent gap: 249-REL-004 (stateOverlay uncapped). |
| AUDIT-010 | Reliability (silent Air return) | yes | **persists (downgraded)** | Still present `World.ts:160-171`; write path now guarded/journaled (`World.ts:173-221`). Tracked as non-blocking 249-COR-002. |
| AUDIT-011 | Reliability (dispose isolation) | yes | **resolved** | Snapshot-clear + per-item try/catch: `ResourceManager.ts:19-28`. See 249-REL-005. |
| AUDIT-012 | Testing (PlayerPhysics untested) | correctness-adjacent | **resolved** | `tests/unit/PlayerPhysics.test.ts` exists. |
| AUDIT-013 | Testing (ChunkManager untested) | correctness-adjacent | **persists (partial)** | No direct test file (`grep -rl ChunkManager tests/unit` empty); indirect via `World.test.ts`. Tracked as 249-COR-005. |
| AUDIT-014 | Testing (World pipelines untested) | correctness-adjacent | **resolved** | `tests/unit/World.test.ts` exists. |
| AUDIT-015 | Testing (PlayerInteraction untested) | correctness-adjacent | **resolved** | `tests/unit/PlayerInteraction.test.ts` exists. |
| AUDIT-018 | Performance (`isSolid` double lookup) | perf — not correctness | not judged here | `World.ts:323` still routes through `getBlock` + registry; performance category owns it. |
| AUDIT-019/020/021 | Perf/build | not correctness-related | not judged here | Owned by performance/architecture categories. |
| AUDIT-025 | UX (no retry in error state) | yes | **persists** | `Game.ts:569-581`; tracked as non-blocking 249-REL-007. |

## Summary counts

- Findings: 12 total — 0 blocking, 12 non-blocking.
  - correctness: COR-001 (info/not-an-issue), COR-002 (low/open), COR-003
    (low/open), COR-004 (info/open), COR-005 (low/open)
  - reliability: REL-001 (info/resolved), REL-002 (info/resolved), REL-003
    (medium/open), REL-004 (low/open), REL-005 (info/resolved), REL-006
    (info/resolved), REL-007 (low/open)
- Blocking justifications: none required — no determinism violation, storage
  corruption, security exploit, unrecoverable race, or crash-scale unbounded
  growth was evidenced. The closest candidate (249-REL-003 worker-hang shape)
  is unreachable in the production runtime because no Worker is instantiated.
- Coverage minimumMet: correctness true, reliability true.
