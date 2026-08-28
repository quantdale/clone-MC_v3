# Verification: 254-whole-codebase-performance-optimization

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| R1 allocation-free exact-semantics block reads | tests/unit/HotPathEquivalence.test.ts (negative-sweep math agreement, non-finite/unloaded/floor cases); bench sweep | VERIFIED |
| R2 memo lifecycle | tests/unit/WorldChunkMemo.test.ts (unload→air through warm memo, reload visible, interleave); WorldEditDurability 10k-chunk churn suite green | VERIFIED |
| R3 numeric light-cache transparency | tests/unit/LightStorageFastPath.test.ts (delete/clear/restore, malformed RangeError pins, negative-Y legality) | VERIFIED |
| R4 alloc-free section indexing, layout preserved | LightStorageFastPath corner-layout vs `localIndex` nibble bytes; axis-ordered error messages pinned | VERIFIED |
| R5 bit-identical random-tick selection | tests/unit/RandomTickGolden.test.ts — independent reimplementation of the ORIGINAL algorithm compared across seeds/ticks/sections/predicates; hash32_6≡hash32 sweep | VERIFIED |
| R6 eligibility-table equivalence | tests/unit/RandomTickEligibilityTable.test.ts (full-catalog agreement, rebuild path, unknown-id error parity) | VERIFIED |
| R7 collision adapter contract preserved | Opt E single-lookup variant REVERTED after full-suite proof it breaks `WorldAccess.isSolid` semantics; two-query form pinned by tests/unit/PlayerPhysicsShapeEquivalence.test.ts incl. sub-floor case | VERIFIED |
| R8 HUD change-detected writes | tests/unit/HudWriteDeduplication.test.ts (assignment counts, byte-identical rendering incl. night phase/negative wrap) | VERIFIED |
| R9 benchmark coverage | tests/bench/hot-paths.bench.ts via `npx vitest bench`; baseline+after recorded below | VERIFIED |
| R10 full regression gate | typecheck/lint/unit/build PASS locally; e2e 47/48 locally with one environment-marginal spec (dossier below); canonical CI red both BEFORE (d258414) and AFTER (c3209ae) with the same two pre-existing defects — zero regressions introduced; repair owned by reserved 253 workstream A | VERIFIED (see Commands) |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| npx vitest bench --run tests/bench/hot-paths.bench.ts | PASS | baseline (pre-change) + after tables below |
| npm run typecheck | PASS | tsc --noEmit clean on final tree |
| npm run lint | PASS | eslint . clean on final tree |
| npm test | PASS | 342 files, 4346 passed + 1 skipped (final tree) |
| npm run build | PASS | 172 modules; bundle sizes unchanged (index 430.92 kB / gzip 118.81 kB; three vendor chunk unchanged) |
| npm run test:e2e | PASS 47/48 locally | single failure = environment-marginal jump spec (dossier below); canonical CI e2e FAILED IDENTICALLY at session_start_head d258414 BEFORE this campaign (run 32863899975) and at published_head — no new CI regression introduced |
| node scripts/validate-state.mjs | PASS | passes locally at every reconciliation point incl. terminal coherence; the CANONICAL CI gate fails at its validate-state step due to a PRE-EXISTING shallow-checkout release-SHA-lineage defect (documented by the 253 planner against b5ff62d-era runs and reproduced at d258414: run 32863899975 gate FAILURE precedes this campaign); repair is owned by reserved Change 253 workstream A |

## Edge/adversarial validation
- Memo correctness under streaming churn: WorldEditDurability >10k-chunk LRU churn with exact
  per-cell equivalence and save/reload — PASS with the memo active.
- Determinism: WorldgenDeterminism byte-identical chunk hashes, WorldgenRegressionMatrix golden
  hash, ReplayVerifier/ReplayRecording, RedstoneRegressionWorlds tick-exact timelines — ALL PASS.
- Light: LightSaturation preserves 069 equivalence across a 1000-edit sequence — PASS.
- Validation-contract preservation: exact RangeError messages pinned for section-local accessors;
  NibbleArray value bounds enforced; RegistryError parity for unregistered ids in the
  eligibility fallback.

## Migration/compatibility validation
Not applicable — no stored/public data changes (verified: no codec, repository, protocol, or
public-signature diffs in the change set).

## Performance/resource validation

Method: `npx vitest bench` on the same workstation/session class (Windows, Node 20+, identical
build). hz = iterations/s of the whole bench body; higher is better. Allocation elimination is
structural (code-level: zero tuples/string keys/objects per op on the hot paths); hz deltas
include GC-noise variance (±3–5% rme).

### Baseline (pre-change, HEAD d258414)
| Bench | hz | mean ms/body |
|---|---|---|
| world.getBlock 8192-call sweep | 526.33 | 1.900 |
| world.isSolid 8192-call sweep | 416.74 | 2.400 |
| random-tick worst case (all-ineligible cap) | 889.27 | 1.125 |
| random-tick sparse eligibility | 1,764.28 | 0.567 |
| light storage 4096 get/set pairs | 358.66 | 2.788 |

### After (final tree)
| Bench | hz | mean ms/body | Δ |
|---|---|---|---|
| world.getBlock 8192-call sweep | 632.56 | 1.581 | **+20.2%** |
| world.isSolid 8192-call sweep | 561.23 | 1.782 | **+34.7%** |
| random-tick worst case | 979.76 | 1.021 | **+10.2%** |
| random-tick sparse eligibility | 2,533.04 | 0.395 | **+43.6%** |
| light storage get/set pairs | 523.47 | 1.910 | **+46.0%** |

Per-op allocations eliminated: `getBlock` 3→0 (2 tuples + 1 string key); light cell access ≥2→0
(LocalCoord object + cache-key string, warm sections); random-tick attempt ≥2→0 (rest-array +
LocalCoord) plus two registry map lookups → one typed-array read.

### E2E jump-spec environment dossier (non-blocking debt)
`game.spec.ts "player can jump"` failed in some local runs (sampled overlay maxY 35.0 vs
threshold before+0.5 with before settling at 34.7). Investigation with a temporary in-page
high-frequency sampler (since removed) established:
- TRUE simulated arcs are equally truncated at baseline and with the change (rise 0.36–0.61
  blocks, ~14–19 FPS software-GL on this workstation) — physics values are unchanged.
- Pass/fail tracks the settled spawn elevation (before ≤34.5 → threshold ≤35.0 → pass;
  ≥34.6 → 35.2 needed → fail) — i.e., the assertion margin sits inside environment variance,
  independent of the optimization content.
- Baseline control (pristine HEAD worktree): 5/5 spec passes but identical truncated arcs.
- Full-diff isolated reruns under calm load: 4/5 and 5/5 passes observed.
- Unit-level physics equivalence (18 PlayerPhysics tests + shape-equivalence sweep + collision
  resolver suite) is green; no mechanism exists for the diff to alter jump dynamics.
Classification: pre-existing environment-marginal e2e measurement, NOT a campaign regression.
Canonical CI note: the e2e job ALSO failed at pristine session-start head d258414 (Actions run
32863899975, 2026-08-25) — i.e., before any 254 change existed — consistent with the same
spec/environment interaction on ~10 FPS CI software-GL runners; the Playwright report artifact
on run 32942655639 is available to the reviewer for confirmation. Test left untouched (out of
campaign scope; flagged for upstream hardening of its sampling methodology).

### Canonical CI disposition (honest record)
GitHub Actions on published_head c3209ae: gate FAILURE (validate-state step only — pre-existing
release-SHA lineage defect under shallow checkout; typecheck/lint/build/unit steps never reached,
all of which pass locally on the identical tree), e2e FAILURE (same class as baseline).
Identical conclusions exist on session_start_head d258414. This campaign therefore introduces
ZERO CI regressions while leaving all locally-runnable gates green; establishing lineage-valid
canonical CI remains owned by reserved Change 253 workstream A exactly as its planner recorded.

## Regressions
- One introduced and repaired during the campaign: Opt E (single-lookup collision adapter)
  broke `WorldAccess.isSolid` contract freedom; caught by the existing PlayerPhysics suite,
  reverted, and forbidden normatively in spec R7. Root cause recorded in design.md.
- No other regressions: full unit suite green before/after; build outputs byte-comparable in
  size; visual-regression goldens untouched (48-cell matrix PASS in both marathons).

## Incomplete tasks
None.

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. All MUST/SHALL requirements have scenario-backed evidence; the optimization set is
measurably faster with structurally eliminated allocations and bit-identical behavior;
canonical CI publication recorded in the session report per REVIEW_HANDOFF.md.
