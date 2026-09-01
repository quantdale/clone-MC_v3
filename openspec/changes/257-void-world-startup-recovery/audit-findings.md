# Audit Findings: 257-void-world-startup-recovery

Plan-authoring snapshot: GitHub `main` = `507ce669c2912aee59b2ae231d765b25fac8a0ac`.

## Blocking / high findings confirmed from current source and repository evidence

| ID | Severity | Finding | Evidence / consequence | Required disposition |
|---|---|---|---|---|
| F257-01 | BLOCKER | Non-current persisted worlds can materialize missing columns as canonical air while current generation is forbidden. | `World.processGeneration()` intentionally takes the non-current branch and does not generate terrain. This protects old saves but can create a void for missing coverage. | Keep no-silent-regeneration invariant; add recovery-required classification for unsafe coverage. |
| F257-02 | BLOCKER | Spawn surface prediction ignores the non-current baseline. | `World.getMotionBlockingHeight()` uses `generator.getHeightAt()` whenever a column is absent; `Game.spawnPlayerSafely()` trusts it. | Split canonical vs predicted surface; forbid prediction as truth for non-current absent columns. |
| F257-03 | HIGH | Persisted player state can overwrite safe spawn without support validation. | `applyInitialPlayerState()` checks seed, finite coordinates and dimension Y, but not canonical column/support/collision. | Validate support; relocate or recover instead of activating void position. |
| F257-04 | HIGH | Loading readiness is generator-predicted for incompatible worlds. | `getReadyProgress()` chooses surface slab from `generator.getHeightAt()`, not persisted canonical height. | Baseline-aware readiness using canonical surface for preserved non-current worlds. |
| F257-05 | HIGH | No in-product incompatibility recovery. | Historical state explicitly instructs DevTools -> delete IndexedDB / clear site data. | Recovery overlay + world-scoped user-confirmed reset/backup path. |
| F257-06 | HIGH test gap | Browser E2E does not cover booting a real IndexedDB legacy/unsupported partial world. | Persistence E2E covers save/reload, faults, legacy localStorage migration, but not the exact generation-baseline + partial canonical coverage startup failure. | Add real-IDB preseed fixtures and recovery assertions. |
| F257-07 | HIGH process integrity | Change 256 is VERIFIED without a final full E2E rerun. | Change 256 verification says full E2E was not re-run; `AGENTS.md` baseline final gate includes `npm run test:e2e`. | Change 257 final gate must rerun full E2E and truthfully record result. |
| F257-08 | MEDIUM/HIGH governance | Program publication state is stale versus GitHub. | Program state says remote `54d4ea0`/publication blocked; GitHub `main` is `507ce669c2912aee59b2ae231d765b25fac8a0ac`. | Reconcile state at activation and final publication. |
| F257-09 | MEDIUM test debt | Existing risk R-6 names real IndexedDB corruption-at-boot/browser proof gaps. | Accepted on Aug 23, now directly implicated by a real user report. | Close the boot/corruption/player-state subset in Change 257. |

## Existing accepted debt to revalidate

These are not automatically Change-257 implementation scope, but their historical acceptance may be stale after later architecture changes.

- R-1: sneak edge-clamp phantom support near a wall.
- R-2: leaves always drop an apple.
- R-3: enchanting session browser proof gap.
- R-4: duplicate entity/XP identifiers accepted in deserialization paths.
- R-5: GitHub Actions tags not immutable SHAs.
- R-6: browser proof gaps including real IndexedDB corruption at boot and player-state durability.
- R-7: ChunkPipeline dropped queued jobs rely on World rescan recovery.
- R-8: brewing pause divergence + latent `ChunkSection.isEmpty` assumption.
- R-9: lighting clock cosmetic desync after hitches.

The implementation campaign MUST re-check reachability against current source. Any Critical/High user-visible defect found in startup, world streaming, collision, rendering, persistence or input blocks Change 257 verification.

## Why thousands of passing tests did not protect this path

The existing suites strongly cover fresh generation, deterministic worldgen, persistence components and many E2E interactions, but the exact composition of:

`real old IndexedDB metadata -> non-current generationBaseline -> missing canonical spawn coverage -> current-generator spawn/readiness prediction -> persisted player restore -> live simulation`

was not asserted end-to-end. Unit tests even explicitly preserve unsupported metadata/columns, which validates data protection but not playability safety.

Change 257 therefore treats composed browser startup state as a first-class contract rather than inferring safety from subsystem tests.


## Post-verification independent review findings (2026-08-31)

These findings supersede the published 67/67 VERIFIED decision and reopen Change 257.

| ID | Severity | Finding | Evidence / consequence | Required disposition |
|---|---|---|---|---|
| F257-10 | HIGH data-loss | Recovery backup omits live persisted state that reset deletes. | `WorldArchiver` exports five repositories and omits `chunk-edits`; it also omits raw Wither metadata, while `resetCurrentWorld()` deletes those world-owned records. "Save Backup" followed by reset can lose data not present in the backup. | Expand/version the archive to complete current persistence ownership and prove round-trip. |
| F257-11 | HIGH integrity | Reset is sequential, not atomic, and failure copy can be false. | Metadata/columns/edits can be deleted before a later store delete fails. The method returns failure but UI says "Your saved world was kept." Existing fault test checks only the return value. | Single transaction or rollback-safe equivalent; record-equivalence failure tests; truthful UX. |
| F257-12 | HIGH correctness | Recovery mode does not freeze all world mutation. | `Game.update()` calls `world.update()` even while recovery-required; that path processes generation, meshing, falling blocks, lighting and unload work. | Gate/make read-only the world-update path while recovery-required and test no mutation. |
| F257-13 | HIGH process integrity | Claimed visual evidence does not exist in the 257 E2E source. | No `page.screenshot` call exists in `void-world-recovery.spec.ts`; global screenshot policy is failure-only. | Explicit captures + inspection + retained artifacts. |
| F257-14 | MEDIUM/HIGH governance | Risk-register task was checked without updating the register. | R-6 still describes the exact corruption-at-boot/player durability browser gaps as accepted debt. | Run/close the implicated subset and update the register. |
| F257-15 | MEDIUM/HIGH certification | Pending file inventory was reported as final audit proof. | `validate-file-audit.mjs --pending` intentionally skips reviewed-manifest completeness requirements. | Run canonical reviewed audit or amend policy truthfully. |
| F257-16 | HIGH certification | Published state and CI do not support final VERIFIED posture. | State SHAs drift from current `main`; Change-257 release CI was cancelled and subsequent-head CI was not yet successful at review. | Reconcile state after repair and require successful CI on exact final SHA. |
| F257-17 | HIGH user-visible performance | Owner reports severe low FPS in normal gameplay despite prior performance certification. | Desktop path uses render/simulation distance 6, DPR up to 2, shadows/AA; Game does not opt into available worker meshing; configured background budgets can exceed a 60-FPS frame before render; headless settings are much cheaper. | Track as Change 258 after 257 integrity repair. Earlier synthetic/headless evidence is not proof of user-visible FPS. |
