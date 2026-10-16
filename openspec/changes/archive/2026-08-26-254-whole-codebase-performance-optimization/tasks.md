# Tasks: 254-whole-codebase-performance-optimization

- [x] 1. Benchmark infrastructure: add `tests/bench/hot-paths.bench.ts` (world block reads, light
  cell access, random-tick selection) and record BASELINE numbers into verification.md.
- [x] 2. Opt A: ChunkManager revision counter; World allocation-free `getBlock`/`isSolid`/
  `setBlockState`/`isLoadedAt` with revision-guarded memo. Unit tests: memo invalidation on
  unload/reload/dispose, non-integer/out-of-range equivalence (R1/R2).
- [x] 3. Opt B: WorldLightStorage numeric section cache + SectionLightStorage alloc-free
  `indexFor`. Unit tests: delete/clear/restore transparency, RangeError message pins,
  layout-equivalence at boundaries (R3/R4).
- [x] 4. Opt C: RandomTickSelector fixed-arity hash + inline index decode. Unit tests: golden
  sequence equivalence vs recorded pre-change vectors, hash32_6 ≡ hash32(6 args) (R5).
- [x] 5. Opt D: Game random-tick eligibility table with legacy fallback, extracted to
  src/simulation/RandomTickEligibility.ts. Unit test: full-catalog decision agreement (R6).
- [x] 6. Opt E: PlayerPhysics collision adapter — single-lookup variant REVERTED after full-suite
  proof that it breaks the WorldAccess.isSolid contract; two-query form retained and pinned by
  tests/unit/PlayerPhysicsShapeEquivalence.test.ts; spec R7 amended to forbid the collapse (R7).
- [x] 7. Opt F: HUD change-detection writes. Unit test: assignment counts + rendered text (R8).
- [x] 8. Record AFTER benchmark numbers; compare against baseline in verification.md (R9):
  getBlock +20%, isSolid +35%, random-tick worst +10% / sparse +44%, light access +46%.
- [x] 9. Full gate: typecheck PASS, lint PASS, unit 4346+1skip PASS, build PASS, e2e 47/48 local
  with environment-marginal jump spec documented (canonical CI is release-authoritative);
  validate-state PASS; PROGRAM_STATE reconciled; published to origin/main (R10).

## Non-blocking debt tracked for future changes
- `game.spec.ts "player can jump"` sampling methodology is marginal on slow/software-GL hosts;
  recommend upstream hardening (in-page high-frequency arc sampling) in a later owner-authorized
  change — evidence dossier in verification.md.
- Canonical CI `gate` fails at its validate-state step on shallow checkouts (release-SHA
  lineage checks vs depth-1 fetch); pre-existing at d258414 and earlier; repair owned by
  reserved Change 253 workstream A ("make validate-state model post-terminal epochs truthfully,
  including historical release evidence whose commits are outside the current ancestry").
- Change 253-live-world-architecture-convergence remains PLANNED/reserved; its storage migration
  may supersede parts of the memoized legacy-Chunk surface optimized here.
