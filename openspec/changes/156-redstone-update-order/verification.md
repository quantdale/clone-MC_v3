# Verification: 156-redstone-update-order

## Status
VERIFIED — 100%

## Task completion
5 / 5 implementation tasks, 12 / 12 test tasks, 6 / 6 verification tasks complete (23/23, 100%).

## Gate evidence
- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`, full project)
- unit (isolated): PASS 12/12 (`tests/unit/RedstonePropagation.test.ts`)
- unit (full suite): PASS 179 files / 2099 tests (`npx vitest run --testTimeout=30000`; prior 2087 +
  12 new)
- build: PASS (`tsc --noEmit && vite build`, 103 modules — additive/unconsumed, no `Game.ts`
  consumer)
- e2e: PASS 22/22 (`npm run test:e2e`, Playwright; all pre-existing assertions unaffected)

## Requirement coverage
| Requirement | Test | Result |
|---|---|---|
| REQ-1 run attenuation | straight-run 15→11 / stops-at-zero-beyond-15 cases | PASS |
| REQ-2 drain on source removal | drain-to-zero case | PASS |
| REQ-3 ring termination | 4×4 closed-ring case (`hitLimit` false, backlog empty) | PASS |
| REQ-4 determinism | two-independent-runs case (power maps + counts equal) | PASS |
| REQ-5 settled idempotence | re-settle case (`changed: 0`, write counter unchanged) | PASS |
| REQ-6 hitLimit reporting | tight-`maxUpdates` case (`hitLimit` true, backlog preserved) | PASS |
| REQ-7 settle converges across rounds | multi-round convergence case | PASS |
| REQ-8 non-wire positions | non-wire visited-but-not-written case | PASS |
| REQ-9 markNeighborsDirty | six-neighbours case | PASS |

## Edge/adversarial validation
- **A real bug was found and fixed during implementation.** The first `propagate` draft gave 049's
  queue a multi-position `maxPerDrain` and guarded the per-position budget *inside* the handler —
  but 049 dequeues a position *before* invoking the handler, so a bound trip would have silently
  **dropped queued work**, violating the spec's "remainder stays queued" guarantee. Fixed by
  constructing the internal queue with `maxPerDrain: 1` so this class's own loop owns the bound
  exactly. A dedicated regression test (`never dequeues a position it does not handle`) asserts
  `before - pendingCount === result.visited`, pinning the invariant so the mistake cannot recur.
- **A contract flaw was found and corrected.** `settle().hitLimit` initially accumulated *any*
  round's bound trip, which made it useless as a "did it converge?" signal — the only question a
  caller of `settle` actually has. Re-specified (design.md, spec.md Definitions, and a new
  requirement) so `settle`'s `hitLimit` means precisely "did not converge"; intermediate chunking is
  an implementation detail. The multi-round convergence test now proves a propagator with
  `maxUpdates: 8` still fully settles a 20-wire run.
- **Ring termination is asserted positively**, not merely as "does not throw": the 4×4 closed ring
  settles with `hitLimit` false and an empty backlog, demonstrating the fixed point rather than
  termination-by-exhaustion.
- **Vertical propagation is covered**: a signal climbs a two-step staircase (15 → 14 → 13),
  exercising the `y ± 1` enqueue that design.md flags as the classic "signal won't climb a
  staircase" bug.
- Determinism is asserted across two independently-constructed propagators, so a future reordering
  of 049's FIFO or 155's direction order fails immediately.

## Migration/compatibility validation
- One new, additive file. 049's `NeighborUpdateQueue` is **composed, not modified**; no existing
  module edited (confirmed via the diff); no `Game.ts` edit; no schema/save-format change; no
  migration.

## Performance/resource validation
- Bounded by construction: at most `maxUpdates` recomputations per `propagate`, each doing 155's
  constant-cost local rule. No recursion — the drain loop is iterative, so deep cascades cannot
  overflow the stack.

## Regressions
None. Full 2099-test unit suite green (no prior test modified or broken); all 22 pre-existing e2e
assertions pass unchanged.

## Incomplete tasks
None — 23/23 (100%).

## Advancement Exception
Not applicable — completion is 100%.

## Final decision
VERIFIED. Advance. 100% task completion, full gate green (typecheck, lint, 2099-unit suite,
production build, 22/22 e2e), no MUST/SHALL requirement unmet, no regression. This is the algorithm
that makes a redstone signal travel; it is deliberately **not** wired into `Game`/`World` — doing so
needs a `WirePowerStore` backed by 125's block-state overlay plus a `BlockBehavior` reacting to
block edits, a materially larger integration surface, deferred exactly as 145 deferred wiring up
129-139. 047's `ScheduledTickQueue` was considered and correctly not used: it models *delayed*
ticks, which become relevant at 159 (repeater delay), whereas wire propagation is immediate within
a tick. Next change: 157-redstone-input-components.
