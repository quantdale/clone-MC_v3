# Architecture audit fragment

Auditor scope: REQ-A1..A4 of `specs/audit-architecture/spec.md` — headless-simulation
determinism boundary (222), layer/dependency discipline, state ownership
(AUDIT-027/028/029/030), dead/duplicate/legacy code and documentation drift (AUDIT-024),
plus a claim-map sweep of all legacy findings AUDIT-001..030.

## Coverage

**Scope examined.** Import graph of `src/` (300 `.ts` files per orphan probe): full-file grep
sweeps of `src/simulation/` (~104 files) for DOM/render/browser-I/O references; import-direction
sweeps of `src/data`, `src/math`, `src/worldgen`, `src/inventory`, `src/world`, `src/storage`,
`src/ui`, `src/player`, `src/rendering`; targeted reads of `SimulationPackageBoundary.ts`,
`engine/SimulationClock.ts`, `engine/Game.ts`, `world/World.ts`, `player/PlayerController.ts`,
`player/PlayerPhysics.ts`, `simulation/GameEventBus.ts`, `simulation/MovementAuthority.ts`,
`rendering/LightStorage.ts` / `BlockLightEngine.ts` / `LightUpdateEngine.ts`,
`rendering/Environment.ts`, `rendering/WorkerJobProtocol.ts`.

**Method.** Static review with real file:line citations; two read-only dynamic probes recorded
below; prior-change evidence cited where it covers the surface.

**Dynamic probes run (read-only):**

1. `node scripts/orphan-check.mjs` → `Source files: 300; Files with zero internal importers
   (potential entry/dormant): 1 — src/main.ts` (the expected entry point). No dead files at
   file level.
2. Grep sweeps (commands embedded in evidence lines below):
   - `grep -rn "from '.*(rendering|engine|ui)/|from 'three'|document\.|window\.|requestAnimationFrame|navigator\." src/simulation`
     → only false positives (`NetworkAdversarialGuard.ts:155-161` uses a local variable named
     `window`) plus the two `engine/SimulationClock` imports recorded as 249-ARCH-001.
   - `grep -rn "performance\.|Date\.now" src/simulation` → only measurement/logging helpers
     (`ReleasePerformanceGate.ts:714,744,756,785`, `ServerSaveLifecycle.ts:475`); no tick-path
     wall-clock reads found.

**priorEvidence cited.**

- 222 verification (`openspec/changes/222-shared-simulation-package-boundary/verification.md`,
  VERIFIED): boundary declaration + shareability rule + violation audit, 7 tests.
- 241 verification (`openspec/changes/241-deterministic-replay-suite/verification.md:55`):
  replay modules registered in the shared-simulation boundary, zero violations, deterministic
  replay green — dynamic evidence that registered simulation modules run headless.
- 223 (protocol codecs) and 247 (release performance gate) per
  `249/verification.md` evidence inventory.
- Baseline gate at entry commit `b56529e` (typecheck/lint/unit 3827/build/e2e 40 PASS) —
  supports "no import breaks compile" claims.

**minimumMet:** true for REQ-A1..A4. **Gaps:** none blocking. Two noted limitations:
(a) the shared-simulation boundary is author-declared (see 249-ARCH-002), so REQ-A1's
"no render/UI module mutates authoritative simulation state" was verified by grep sweep +
targeted reads rather than by an enforced static rule; (b) duplicate-code detection was
name/signature-based (chunkKey/mulberry32/key-helper greps), not AST-level — deeper semantic
duplication may exist unexamined.

## Findings

### 249-ARCH-001

- **id:** 249-ARCH-001
- **category:** architecture
- **classification:** non-blocking
- **severity:** low
- **confidence:** confirmed
- **evidenceTier:** static
- **status:** open
- **title:** Simulation modules import from `src/engine`, inverting the intended dependency direction
- **affected:** `src/simulation/WorldTickProcess.ts`, `src/simulation/MultiClientLoadHarness.ts`, `src/engine/SimulationClock.ts`
- **description:** Two simulation modules import `SimulationClock` from the engine layer
  (`import { SimulationClock } from '../engine/SimulationClock'`). The spec's layer model has
  simulation underpinning higher layers; engine is a higher-layer module group. The inversion is
  harmless in practice because `SimulationClock` is pure and timestamp-fed ("The clock is pure:
  all state is a function of the supplied timestamps", `src/engine/SimulationClock.ts:2-8`; its
  `update(nowMs)` takes time as a parameter, so headless determinism is preserved), but the
  direction contradicts REQ-A2's layer discipline and would mask a real violation if
  `SimulationClock` ever gained DOM coupling.
- **trigger:** Static import inspection of `src/simulation`.
- **impact:** No runtime impact today; architectural-drift risk only.
- **evidence:**
  - `src/simulation/WorldTickProcess.ts:1` — `import { SimulationClock } from '../engine/SimulationClock';`
  - `src/simulation/MultiClientLoadHarness.ts:26` — same import.
  - `src/engine/SimulationClock.ts:2-8` — purity contract; timestamp-fed accumulator.
- **recommendation:** Move `SimulationClock` into `src/math` or `src/simulation` (or a shared
  kernel) in a later change; no action required for 249.

### 249-ARCH-002

- **id:** 249-ARCH-002
- **category:** architecture
- **classification:** non-blocking
- **severity:** medium
- **confidence:** confirmed
- **evidenceTier:** mixed
- **status:** open
- **title:** Shared-simulation boundary is author-declared and covers only 4 registered modules; no static import enforcement exists
- **affected:** `src/simulation/SimulationPackageBoundary.ts`, all ~104 files in `src/simulation/`
- **description:** Change 222's "package boundary" is a data declaration, not a physical package
  or an enforced rule. `SimulationPackageBoundary.ts:4-5` states "no import analysis (authors
  declare deps)", and `boundaryViolations()` (:118-138) only checks the declared string deps of
  modules present in the boundary array. The only registered module set is
  `SHARED_SIMULATION_REPLAY_MODULES` (:160-165) — the four 241 replay modules. The other ~100
  simulation files are undeclared, so nothing mechanically verifies they are DOM-free or
  deterministic; compliance rests on convention plus the headless unit suite. This is why
  REQ-A1 had to be verified by manual sweep in this audit (it passed — see Coverage).
- **trigger:** Reading the boundary implementation and comparing declared vs actual module count.
- **impact:** A future simulation file could silently import DOM/render code without any test or
  lint failing; the determinism guarantee is procedural, not structural.
- **evidence:**
  - `src/simulation/SimulationPackageBoundary.ts:4-5` — "authors declare deps … no import analysis".
  - `src/simulation/SimulationPackageBoundary.ts:118-138` — violations computed from declared flags only.
  - `src/simulation/SimulationPackageBoundary.ts:160-165` — only four modules registered.
  - Dynamic: `tests/unit/SimulationPackageBoundary.test.ts` validates declaration mechanics only
    (round-trip/rejection/sharability of supplied arrays), not the real import graph.
  - Dynamic: baseline unit suite (3827 passed at `b56529e`) runs simulation modules headless,
    which is the current de-facto enforcement.
- **recommendation:** Later change: add an ESLint `no-restricted-imports` rule banning
  `three`/DOM globals in `src/simulation/**`, and/or register all simulation modules in the
  boundary with CI-checked declarations.

### 249-ARCH-003

- **id:** 249-ARCH-003
- **category:** architecture
- **classification:** non-blocking
- **severity:** low
- **confidence:** confirmed
- **evidenceTier:** static
- **status:** open
- **title:** `data/` → `inventory/` type import creates a layering cycle with inventory's data imports
- **affected:** `src/data/PotionItemData.ts`, `src/inventory/StackDataComponents.ts`
- **description:** `data/PotionItemData.ts:16` imports `type StackComponentType` from
  `../inventory/StackDataComponents`, while ≥10 inventory files import from `../data/*`
  (e.g. `inventory/ItemRegistry.ts:12-14`, `inventory/Crafting.ts:1`). Data is supposed to
  underpin higher layers; here the foundation layer reaches up. The import is type-only, so
  there is no runtime cycle and no build impact, but the conceptual direction is inverted.
- **trigger:** Import-direction sweep of `src/data`.
- **impact:** Refactoring hazard; no runtime defect evidenced.
- **evidence:**
  - `src/data/PotionItemData.ts:16` — `import { type StackComponentType } from '../inventory/StackDataComponents';`
  - `src/inventory/ItemRegistry.ts:12-14`, `src/inventory/Crafting.ts:1` — reverse direction.
- **recommendation:** Move the shared stack-component type into `src/data` (or a types module)
  in a later change.

### 249-ARCH-004

- **id:** 249-ARCH-004
- **category:** architecture
- **classification:** non-blocking
- **severity:** low
- **confidence:** confirmed
- **evidenceTier:** static
- **status:** open
- **title:** `worldgen/WorkerWorldgen` imports a protocol module that lives under `rendering/`
- **affected:** `src/worldgen/WorkerWorldgen.ts`, `src/rendering/WorkerJobProtocol.ts`
- **description:** `worldgen/WorkerWorldgen.ts:9` imports
  `WORKER_PROTOCOL_VERSION, WorkerJobClient, ResolvedOutcome` from
  `../rendering/WorkerJobProtocol`. Worldgen importing rendering is a direction inversion;
  mitigating fact: `WorkerJobProtocol.ts` contains zero imports (verified by grep — no `from '`
  matches), i.e. it is a pure protocol/constants module that merely resides in the rendering
  directory. No DOM coupling is introduced.
- **trigger:** Import-direction sweep of `src/worldgen`.
- **impact:** Cosmetic/misplacement; risk that WorkerJobProtocol accquires rendering deps later.
- **evidence:**
  - `src/worldgen/WorkerWorldgen.ts:9`.
  - Probe: `grep -n "from '" src/rendering/WorkerJobProtocol.ts` → no matches (module is dependency-free).
- **recommendation:** Relocate `WorkerJobProtocol.ts` to a protocol/shared location in a later change.

### 249-ARCH-005

- **id:** 249-ARCH-005
- **category:** architecture
- **classification:** non-blocking
- **severity:** info
- **confidence:** confirmed
- **evidenceTier:** static
- **status:** open
- **title:** Legacy AUDIT-028 persists: `world/World.ts` still mixes world data/logic with three.js scene ownership
- **affected:** `src/world/World.ts`
- **description:** `World.ts` imports three.js directly (`import * as THREE from 'three'`,
  line 1), stores a `THREE.Scene` and Lambert materials (:55-61), keeps a `meshGroups` map
  (:118), and builds/attaches `THREE.Mesh` objects in `attach()` (:795-815). The class remains
  simultaneously chunk-state authority, streaming scheduler, and render-object owner — exactly
  the legacy concern. It does not corrupt state (mesh attachment is downstream of meshing
  results), so it stays INFO/non-blocking per the spec's classification rule.
- **trigger:** Inspection of `world/World.ts` against legacy AUDIT-028.
- **impact:** Maintainability/testability cost; the file cannot be exercised fully headless
  without a three.js import (which itself is DOM-free, so unit tests still run).
- **evidence:**
  - `src/world/World.ts:1`, `:55-61`, `:118`, `:795-815`.
- **recommendation:** Extract a `WorldRenderer`/mesh-attachment seam in a later refactor change.

### 249-ARCH-006

- **id:** 249-ARCH-006
- **category:** architecture
- **classification:** non-blocking
- **severity:** info
- **confidence:** confirmed
- **evidenceTier:** static
- **status:** open
- **title:** Legacy AUDIT-027 persists: `Game` remains a God-object composition root (1673 lines)
- **affected:** `src/engine/Game.ts`
- **description:** `Game` (class declared `src/engine/Game.ts:137`) directly constructs and holds
  registries, world, player stack, mob systems, audio, renderer, input, HUD/UI panels, and
  enchanting/loot subsystems (~50 `private readonly` fields at :138-207). Only `src/main.ts:2`
  imports `Game` (verified by repo-wide grep), so the composition root is at least confined to
  one consumer. Per spec REQ-A3 this is classified non-blocking INFO unless it causes a concrete
  defect; none was evidenced on this audit's surfaces.
- **trigger:** Inspection of composition root size and fan-in/fan-out.
- **impact:** Change-amplification and test-harness weight; no runtime defect evidenced.
- **evidence:**
  - `src/engine/Game.ts:137` (class), `:138-207` (field fan-out); `wc -l` = 1673.
  - Repo-wide grep `engine/Game` across `src/` → single importer `src/main.ts:2`.
- **recommendation:** Incremental extraction behind system interfaces in later refactors; not a
  249 action.

### 249-ARCH-007

- **id:** 249-ARCH-007
- **category:** architecture
- **classification:** non-blocking
- **severity:** low
- **confidence:** confirmed
- **evidenceTier:** static
- **status:** open
- **title:** Legacy AUDIT-029 partially resolved: player velocity still written by both Controller and Physics, but writers are confined to `player/` and networked authority is single-owner
- **affected:** `src/player/PlayerController.ts`, `src/player/PlayerPhysics.ts`, `src/simulation/MovementAuthority.ts`
- **description:** Authoritative local player velocity/position is mutated by two systems:
  `PlayerController.ts:86-93,101,124` writes `velocity.x/z/y` from input intent, and
  `PlayerPhysics.ts:56-58` applies gravity/terminal velocity to `velocity.y`. This is the legacy
  multi-writer shape, but it is now (a) confined to the `player/` package with a defined
  controller→physics ordering inside the tick, and (b) complemented since 227/228 by a
  single-owner server authority: `MovementAuthority` is documented as "Server-authoritative
  movement authority (227): the server's trusted view" with strict tick-ordering and stale-tick
  rejection (`src/simulation/MovementAuthority.ts:2-6,56-57`), and a repo-wide grep found no
  writer of `player.position/velocity` outside `player/`. Residual risk is ordering-dependent
  but bounded and covered by 228 reconciliation tests; not a corruption blocker.
- **trigger:** REQ-A3 player-state-owner scenario inspection.
- **impact:** Low; deterministic given fixed update order; server path has a single owner.
- **evidence:**
  - `src/player/PlayerController.ts:86-93,101,124`; `src/player/PlayerPhysics.ts:56-58`.
  - `src/simulation/MovementAuthority.ts:2-6` (authority + tick-ordering contract), `:56-57`.
  - Grep `player\.position\s*=|player\.velocity\s*=|\.player\.position\.[xyz]\s*=` over `src/`
    (excluding tests) → no matches outside `player/`.
  - Prior evidence: 227/228 VERIFIED (server player movement; client prediction/reconciliation)
    per `openspec/PROGRAM_STATE.md:12`.
- **recommendation:** Document the controller→physics write order as a normative invariant when
  the player package is next touched.

### 249-ARCH-008

- **id:** 249-ARCH-008
- **category:** architecture
- **classification:** non-blocking
- **severity:** info
- **confidence:** confirmed
- **evidenceTier:** static
- **status:** open
- **title:** Legacy AUDIT-030 partially resolved: a typed event bus exists but has a single gameplay consumer
- **affected:** `src/simulation/GameEventBus.ts`, `src/simulation/BossFramework.ts`
- **description:** A generic synchronous typed event bus now exists (`GameEventBus.ts:1-6`:
  producers/consumers decoupled, wildcard subscription, listener isolation, queued re-entrant
  delivery), addressing the "no event system" legacy finding structurally. However, a repo-wide
  grep shows the only production consumer is `BossFramework.ts` — the rest of the codebase still
  uses direct calls. The finding is therefore "partially resolved": infrastructure exists,
  adoption is narrow.
- **trigger:** REQ-A3 event-system inspection.
- **impact:** None runtime; architectural-consistency note.
- **evidence:**
  - `src/simulation/GameEventBus.ts:1-25` (API contract).
  - Grep `GameEventBus` over `src/` → matches only `src/simulation/BossFramework.ts` and the bus file itself.
- **recommendation:** Adopt the bus for cross-system notifications opportunistically in later changes.

### 249-ARCH-009

- **id:** 249-ARCH-009
- **category:** architecture
- **classification:** non-blocking
- **severity:** low
- **confidence:** confirmed
- **evidenceTier:** static
- **status:** open
- **title:** Duplicate coordinate-key helpers and a second mulberry32 implementation outside `math/PRNG`
- **affected:** `src/simulation/BlockEntityManager.ts`, `src/world/WorldCoordinates.ts`, `src/simulation/ChunkStreaming.ts`, `src/simulation/SeedRng.ts`, `src/math/PRNG.ts`
- **description:** Key-formatting logic is duplicated with divergent signatures:
  `world/WorldCoordinates.ts:41` `chunkKey(cx,cy,cz)` vs `simulation/BlockEntityManager.ts:70`
  private `chunkKey(cx,cz)` vs `simulation/ChunkStreaming.ts:13` `columnKey(x,z)`. Similarly,
  mulberry32 appears in `math/PRNG.ts` and again as a pinned copy in
  `simulation/SeedRng.ts:19` ("pinned mulberry32 PRNG") and referenced in
  `simulation/ReplayFixtures.ts:37`. The SeedRng duplication is deliberate pinning for
  determinism (its header says so), which downgrades this to a documentation-of-intent issue
  rather than drift.
- **trigger:** Name-based duplicate sweep.
- **impact:** Divergent key formats are a latent interop hazard if keys are ever compared across
  modules; currently each helper serves its own namespace.
- **evidence:**
  - `src/world/WorldCoordinates.ts:41`; `src/simulation/BlockEntityManager.ts:70`;
    `src/simulation/ChunkStreaming.ts:13`.
  - `src/simulation/SeedRng.ts:2,19`; `src/simulation/ReplayFixtures.ts:37`; `src/math/PRNG.ts`.
- **recommendation:** Cross-reference the key-format variants in one comment/const block; keep
  SeedRng pinned but cite `math/PRNG` provenance.

### 249-ARCH-010

- **id:** 249-ARCH-010
- **category:** architecture
- **classification:** non-blocking
- **severity:** low
- **confidence:** confirmed
- **evidenceTier:** static
- **status:** open
- **title:** Dead code persists: `void this.registry;` unused-dependency placeholder in PlayerPhysics
- **affected:** `src/player/PlayerPhysics.ts`
- **description:** The legacy dead-code item (`void this.registry;` kept for interface symmetry)
  is still present. File-level orphan check found no dead files (only `main.ts` as entry), so
  this is the residual dead statement.
- **trigger:** Re-check of FULL_AUDIT_REPORT §11 dead-code list.
- **impact:** Cosmetic.
- **evidence:**
  - `src/player/PlayerPhysics.ts:31` — `void this.registry;`.
  - Dynamic: `node scripts/orphan-check.mjs` → 300 files, zero dormant besides `src/main.ts`.
- **recommendation:** Remove parameter or wire it in a later cleanup change; removal out of scope for 249.

### 249-ARCH-011

- **id:** 249-ARCH-011
- **category:** architecture
- **classification:** non-blocking
- **severity:** medium
- **confidence:** confirmed
- **evidenceTier:** static
- **status:** open
- **title:** Documentation drift persists (legacy AUDIT-024): FULL_AUDIT_REPORT.md materially contradicts the current tree
- **affected:** `FULL_AUDIT_REPORT.md`, `README.md`
- **description:** The legacy narrative audit now misdescribes the codebase in load-bearing ways:
  it claims "No database or IndexedDB — localStorage is intentionally sufficient"
  (§2 Storage Model) while `src/storage/` contains a full IndexedDB persistence layer
  (`ChunkSectionRepository.ts`, `EntityRepository.ts`, `DataMigration.ts`,
  `LegacyLocalStorageMigrator.ts`, etc.); it claims "76/76" unit tests while the baseline suite
  is 292 files / 3827 tests; it claims no WebGL context-loss handling and a `?e2e` URL backdoor,
  both superseded (`src/engine/Renderer.ts:63` context-lost handler; `src/main.ts:31,60`
  build-time `VITE_E2E` gate replacing the URL parameter). README.md itself is current (no stale
  counts; documents the VITE_E2E gating at `README.md:62`). The drift is exactly what change
  249's report supersedes; classified non-blocking because the corrections live in audited
  artifacts, though until 249 publishes, FULL_AUDIT_REPORT.md is actively misleading.
- **trigger:** REQ-A4 documentation-drift scenario.
- **impact:** A reader trusting FULL_AUDIT_REPORT.md would wrongly conclude there is no IndexedDB
  persistence surface (a security/data-loss review blind spot) and wrong test baselines.
- **evidence:**
  - `FULL_AUDIT_REPORT.md` §2 Storage Model ("No database or IndexedDB") and §1 table ("76/76").
  - `src/storage/` listing (IndexedDB repositories/migrations present).
  - `src/engine/Renderer.ts:63`; `src/main.ts:31,60`; `README.md:62`.
  - 249 baseline: 292 unit files / 3827 passed at commit `b56529e` (`249/verification.md:10-11`).
- **recommendation:** When 249's report.md lands, add a banner/header to FULL_AUDIT_REPORT.md
  marking it superseded (doc-only follow-up).

### 249-ARCH-012

- **id:** 249-ARCH-012
- **category:** architecture
- **classification:** non-blocking
- **severity:** info
- **confidence:** confirmed
- **evidenceTier:** static
- **status:** not-an-issue
- **title:** REQ-A1 positive result: no DOM/render/browser-I/O imports or tick-path wall-clock reads found in `src/simulation/`; render modules do not mutate authoritative block state
- **affected:** `src/simulation/` (all), `src/rendering/WeatherPresentation.ts`, `src/rendering/LightStorage.ts`
- **description:** Recorded as the explicit no-violation confirmation REQ-A2/A1 ask for. Sweeps
  found: no `three`/rendering/ui imports in simulation except the pure-clock inversion of
  249-ARCH-001; no `window.`/`document.`/`navigator.`/`requestAnimationFrame` references (only a
  local variable named `window` in `NetworkAdversarialGuard.ts:155-161`); `Date.now()` uses are
  confined to measurement/log helpers (`ReleasePerformanceGate.ts:714+`,
  `ServerSaveLifecycle.ts:475`), not tick computation. On the render side,
  `WeatherPresentation.ts:15` consumes simulation state type-only (`import type { WeatherState }`),
  and the light engines' `setBlockLight` calls mutate light nibble storage (presentation-adjacent),
  not authoritative block IDs. Headless execution of the simulation suite is corroborated by the
  baseline unit run (3827 passed, node environment) and 241's deterministic replay.
- **trigger:** REQ-A1 boundary inspection.
- **impact:** None — this is the confirmation record.
- **evidence:**
  - Grep sweeps listed in Coverage (commands and results quoted there).
  - `src/simulation/NetworkAdversarialGuard.ts:155-161` (false-positive `window` local).
  - `src/simulation/ReleasePerformanceGate.ts:714-788`; `src/simulation/ServerSaveLifecycle.ts:475`.
  - `src/rendering/WeatherPresentation.ts:15`; `src/rendering/BlockLightEngine.ts:44,65`.
  - Prior evidence: 241 replay verification (`241/verification.md:55`); baseline gate at `b56529e`.
- **recommendation:** Keep the ESLint boundary rule from 249-ARCH-002 as the durable guard.

## Legacy reconciliation

Status values: resolved / persists / partially-resolved / not-an-issue / duplicate, each with a
current-tree citation. Findings owned by other category fragments are marked **claimed-elsewhere**
with the owning surface per `249/verification.md` coverage map; I verified their headline citations
but did not deep-audit them.

| ID | Title | Status | Current-tree evidence |
|---|---|---|---|
| AUDIT-001 | WebGL context loss not handled | resolved (claimed-elsewhere: reliability) | `src/engine/Renderer.ts:63` `webglcontextlost` handler (+ remove at :113) |
| AUDIT-002 | Synchronous 49-chunk preload | claimed-elsewhere: performance | workers/budgeted streaming now exist (`src/worldgen/WorkerWorldgen.ts`, `src/simulation/ChunkStreaming.ts`); perf fragment to confirm |
| AUDIT-003 | Pointer lock error feedback missing | resolved (claimed-elsewhere: reliability) | `src/engine/InputManager.ts:92` listens `pointerlockerror`; user-facing handling noted `src/engine/Game.ts:399` |
| AUDIT-004 | `?e2e` URL param exposes game control | resolved (claimed-elsewhere: security) | `src/main.ts:31,60` — build-time `VITE_E2E === 'true'` gate; no URL param |
| AUDIT-005 | Edit overlay FIFO eviction loses edits | claimed-elsewhere: data-loss | persistence moved to IndexedDB repositories (`src/storage/`); DL fragment owns |
| AUDIT-006..009 | Hot-path perf (queue sort, filter allocs, registry.get throw, UV alloc) | claimed-elsewhere: performance | perf surfaces per coverage map (075/247 budgets) |
| AUDIT-010 | getBlock returns Air for unloaded chunks | claimed-elsewhere: correctness | correctness fragment owns world-access semantics |
| AUDIT-011 | ResourceManager dispose not error-isolated | claimed-elsewhere: reliability | reliability fragment owns disposal paths |
| AUDIT-012..015 | Missing unit tests (physics/chunk mgr/world/interaction) | resolved (claimed-elsewhere: correctness/coverage) | baseline suite 292 files / 3827 tests at `b56529e`; dedicated suites exist for these areas |
| AUDIT-016..020 | Perf allocations/culling/draw calls | claimed-elsewhere: performance | perf fragment owns |
| AUDIT-021 | No code splitting for Three.js | **unclaimed — flagged for assembler** (build/packaging; architecture-adjacent) | `vite.config.ts` unchanged on this audit's pass; not verified in depth here |
| AUDIT-022 | CI lacks Playwright browser caching | **unclaimed — flagged for assembler** | `.github/workflows` not in any fragment's coverage map |
| AUDIT-023 | CI lacks build artifact upload | **unclaimed — flagged for assembler** | same as AUDIT-022 |
| AUDIT-024 | Implementation details missing from specs / doc drift | persists → see 249-ARCH-011 | `FULL_AUDIT_REPORT.md` contradictions cited there; README current |
| AUDIT-025 | No retry mechanism in error state | claimed-elsewhere: reliability | UX/reliability fragment owns |
| AUDIT-026 | Resize events not debounced | claimed-elsewhere: reliability/performance | renderer input surfaces |
| AUDIT-027 | Game God object | persists (non-blocking INFO) → 249-ARCH-006 | `src/engine/Game.ts:137`, 1673 lines, single importer `main.ts:2` |
| AUDIT-028 | World mixes data/logic/rendering | persists (non-blocking INFO) → 249-ARCH-005 | `src/world/World.ts:1,55-61,795-815` |
| AUDIT-029 | Player state modified by multiple systems | partially-resolved → 249-ARCH-007 | writers confined to `player/`; server authority single-owner `MovementAuthority.ts` |
| AUDIT-030 | No event system | partially-resolved → 249-ARCH-008 | `GameEventBus.ts` exists; sole consumer `BossFramework.ts` |

## Summary for assembler

- Findings: 12 total — 0 blocking, 12 non-blocking (1 medium ×2 [ARCH-002, ARCH-011], low ×5,
  info ×3 incl. one not-an-issue confirmation record; exact severities in bodies).
- Blocking count: 0. REQ-A1 boundary holds on current tree.
- Legacy rows reconciled: AUDIT-001..030 all mapped; 3 items (AUDIT-021/022/023 — vite code
  splitting, CI Playwright caching, CI artifact upload) appear unclaimed by any fragment's
  coverage map and are flagged for the assembler to assign or record as accepted gaps.
- Coverage minimumMet: true (all of REQ-A1..A4), with the two methodological limitations noted
  under Coverage.
