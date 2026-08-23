# Tasks — Exhaustive Repository Certification Campaign

Status legend: `[x]` complete with evidence · `[ ]` open.

## 1. Baseline
- [x] Synchronize `origin/main`; record START_SHA `5e032877a6d2bad7ccd2af201d9dd77fe6ddc20d`; clean tree
- [x] Read governance set (AGENTS, AUTONOMOUS_GOAL, PROGRAM_STATE.*, CHANGE_SEQUENCE*, REVIEW_HANDOFF, hardening packages)
- [x] Baseline gates on unmodified tree: validate-state PASS; typecheck PASS; lint PASS; unit 4160 passed+1 skipped; coverage report generated; build PASS; release-bundle check PASS (4 assets, no hook); npm audit prod/full = 0 vulnerabilities
- [x] Baseline e2e: 43/46 pass; 3 cold-start flakes in game.spec.ts reproduced intermittently, then full-file 30/30 pass — recorded as environment flakiness (software-GL first-boot window), not a product defect

## 2. Audit passes
- [x] Composition/lifecycle deep read: main.ts, Game.ts (all 1925 lines), Renderer, GameLoop, FixedTickDriver, SimulationClock-adjacent, InputManager, ResourceManager, WorkerPool, RenderInterpolator
- [x] Persistence stack deep read: GamePersistence, AutosaveCoordinator, DirtySaveQueue, RepositorySaveSink, ChunkEditRecord/Repository (+ ProductionComposition test review)
- [x] stateOverlay domain resolved (bounded + documented; Change-125 scope verified as intentional-but-undocumented)
- [x] Determinism sweep (Math.random/Date.now/performance.now/setTimeout classified per site)
- [x] Security sweep across src/tests/scripts/workflows (eval/DOM-injection/network/storage/secrets/test hooks)
- [x] Inventory + data registry adversarial sub-audit (23 inventory files + targeted data files)
- [x] Test-quality matrix over all four e2e specs + playwright config + bundle checker
- [x] Simulation/worldgen semantic pass (138 files) via agent auditor
- [x] Rendering/player/ui/math/engine-leftovers/world remainder semantic pass (~75 files) via agent auditor

## 3. Remediation
- [x] F-INV-1 tool stacking destruction → stackSize 1 + invariant + oracles
- [x] F-INV-2 component-preserving persistence (+ phantom-damage restore fix) + oracles
- [x] F-MINE-1 duration-owned break completion + strengthened unit/e2e mining tests
- [x] F-W-1 stateOverlay LRU cap + README limitation + oracle
- [x] F-PERS-6 commit-key reporting + pendingEdits release + oracles
- [x] F-INV-3 enchanting session identity guard + oracles
- [x] F-INV-7 hotbar icon/title refresh + render-after-restore + oracles
- [x] F-RND-3 teleport blend latch + oracles
- [x] F-SIM-1 wildcard once unsubscribe + oracle
- [x] F-SIM-2 seq-0 epoch acceptance + oracle
- [x] F-SIM-3 deterministic save restore order
- [x] F-RND-9 translucent geometry aliasing
- [x] GOV-STATE-ALIAS redirect-only alias
- [x] GOV-VALIDATOR terminal coherence + alias checks + --root harness + invalid-state regression suite
- [x] AUDIT-EVIDENCE pending-only generator + validate-file-audit.mjs + reviewed manifest (2452 rows / 0 pending / 0 unclassified)
- [x] DOC drift: README corrected (Node20, IndexedDB authority, mobs/touch/gamepad, meshing wording, sneak/sprint keys, architecture tree, limitations incl. session-only block state and live RNG note)
- [x] TST-1 chunk-streaming e2e made falsifiable (generation observed + drained)

## 4. Verification
- [x] Full clean gate at candidate SHA: validate-state/typecheck/lint/unit(4201+1)/coverage(functions 95.03)/build/bundle-check/audits×2 PASS; e2e interrupted by operator before completion — recorded honestly in verification.md
- [x] Independent second pass over the campaign diff (post-hardening-audit.md): no blocking issue found
- [x] PROGRAM_STATE checkpoint updated (json + md)
- [ ] Publish to origin/main; verify HEAD == origin/main; record published_head (in progress at operator direction)

## 5. Sign-off
- [x] Release verdict recorded in verification.md: READY WITH EXPLICIT NON-BLOCKING DEBT, conditional on canonical exact-SHA CI
