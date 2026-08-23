# Post-Hardening Audit (Second Adversarial Pass)

Second pass over the campaign diff (`5e032877..candidate`), performed immediately before
publication with fresh eyes on the riskiest hunks.

## Diff scope reviewed
- 21 modified src files, 9 modified test/e2e files, 12 new files (10 package docs,
  validate-file-audit.mjs, 9 new unit-test suites), README + PROGRAM_STATE updates.

## Checks and outcomes

1. **Weakened assertions?** None. Every modified test was strengthened: PlayerInteraction
   click-break tests now hold-mine to completion (previously passed only via the defect);
   chunk-streaming e2e replaced `>=` with generation-observed + drained proof; ItemRegistry
   gained an authoring-invariant rejection case driving the new guard directly.
2. **Forgotten catch paths / swallowed errors?** Reviewed all new try/catch sites
   (AutosaveCoordinator hook isolation, GamePersistence dispose paths, MonitoredSaveSink).
   Hook callbacks are deliberately fail-isolated and documented as such.
3. **Retries that reorder writes?** DirtySaveQueue.drainReport preserves the existing
   remove-before-write, re-queue-on-failure, newest-wins semantics; committedKeys only lists
   sink-accepted keys; the facade releases a pending copy only when its key is absent from the
   queue (re-marked newer snapshots retained). Verified against the existing 038 suite.
4. **New unbounded structures?** stateOverlayWriteOrder is bounded in lockstep with the capped
   stateOverlay (entries removed on eviction/empty-layer/dispose); no other growth introduced.
5. **New lifecycle races?** Hotbar render-after-restore guarded by fullyConstructed so the
   constructor-time restore path (injected persistence) cannot touch an unassigned field;
   enchanting session voiding covers selection-change and identity divergence; teleport latch
   consumed exactly once at the next setState.
6. **Test-only leakage into production?** No new globals, env flags, or DOM seams. The E2E
   hook gating is unchanged; release-bundle check still passes on the clean build.
7. **Production behavior accidentally changed beyond findings?** The three intentional behavior
   changes are F-MINE-1 (clicks no longer insta-break — the fix), F-INV-1 (durable items no
   longer merge), and pristine-tool restore no longer fabricating `{damage:0}` (a restore
   fidelity bug). ChunkMesher translucent aliasing changes no render output (same geometry
   object attached once); verified by mesher suite and visual-relevant attach path review.
8. **Documentation claiming more than proven?** verification.md records the interrupted local
   e2e explicitly instead of claiming a green browser run; the verdict is conditional on the
   canonical exact-SHA CI run.

## Residual observations (registered, not actioned)
- R-items R-1..R-9 in risk-register.md stand after re-review.
- The e2e hold-mine conversions should be confirmed by the CI browser job on the published SHA.

## Second-pass verdict
No blocking issue found in the campaign delta itself. Publication condition: canonical CI
green on the exact published SHA.
