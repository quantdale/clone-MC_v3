# Initial Hardening Audit Findings

These findings were derived from the repository and canonical GitHub evidence observed while authoring this interlock. They are a starting register, not a substitute for the executor's exhaustive audit. Revalidate every finding against current `origin/main`.

Severity: CRITICAL / HIGH / MEDIUM / LOW.  
Blocking: YES means numbered advancement cannot resume while OPEN.

| ID | Severity | Blocking | Finding | Initial evidence / risk | Required disposition |
|---|---|---:|---|---|---|
| HARD-001 | CRITICAL | YES | Canonical `main` is red | Observed head `6b698315...` fails TypeScript compile in replay-related files/tests | Restore legal baseline and obtain exact-SHA canonical green |
| HARD-002 | CRITICAL | YES | Inactive Change 241 has production/test implementation | Replay source/tests were added while state says 241 not ACTIVE and ledger is 0% | Remove premature implementation; keep specs |
| HARD-003 | HIGH | YES | Program-state artifacts disagree | Markdown reports 240 completed; JSON expresses stale 239/240 transition | Reconcile and automate integrity checks |
| HARD-004 | HIGH | YES | Change 240 verification claim conflicts with canonical E2E | Parent canonical run failed multiple E2E cases despite state narrative claiming full gate green | Reproduce, fix, and bind state to canonical evidence |
| HARD-005 | HIGH | YES | 241 tick-seed contract is self-contradictory | Invariant requires one seed entry per tick; purported valid example has none for `maxTick=3` | Repair normative contract and scenarios before activation |
| HARD-006 | HIGH | YES | 241 RNG stream ownership is underspecified/incompatible with observed verifier shape | Verifier-owned map is not naturally exposed to systems; test closure can mask integration gap | Redesign spec ownership/injection semantics before implementation |
| HARD-007 | HIGH | YES | 241 seed timing semantics are ambiguous | Initial stream creation vs per-tick expected state/reseed behavior is not one explicit model | Specify single deterministic model and mismatch rules |
| HARD-008 | HIGH | YES | Replay fixture provenance is false/stale | Fixture comments claim verified implementation while 241 verification is NOT VERIFIED | Remove false claim; regenerate only after legitimate implementation |
| HARD-009 | HIGH | YES | Previously canonical E2E suite fails gameplay/resource behaviors | Pig spawn, block interactions/drop/placement, and long exploration budget failed after retries | Root-cause and close; no retry/timeout masking |
| HARD-010 | MEDIUM | YES | No enforced coverage thresholds in current Vitest config/CI | Coverage exists as a script but no hard minimum/no-regression gate was observed | Measure baseline and enforce justified thresholds |
| HARD-011 | MEDIUM | YES | CI retries can hide nondeterminism | Playwright CI retries are enabled; hardening needs first-attempt proof | Add no-retry acceptance/repeatability evidence |
| HARD-012 | MEDIUM | CONDITIONAL | Full dependency audit reports a high-severity signal while production audit had been clean | Likely dev-chain risk; exact advisory/path must be re-fetched | Trace, upgrade if possible, document only permitted dev-only exception |
| HARD-013 | MEDIUM | CONDITIONAL | Toolchain policy is broad/stale | `engines.node >=18`; CI uses a fixed Node 20 line; Actions emitted runtime/deprecation warnings | Select supported Node policy and align package/CI/docs |
| HARD-014 | MEDIUM | YES | Publication instructions are contradictory | State text can say “do not push” while handoff requires direct push to `origin/main` | Establish one precedence/publish rule |
| HARD-015 | MEDIUM | YES | Replay capture/canonicalization semantics permit determinism ambiguity | Payload deep immutability, `undefined`, property order, `-0`, symbols and unsupported values are not fully nailed down | Repair 241 spec before activation |
| HARD-016 | MEDIUM | YES | Replay comparison failure semantics can under-specify expected-vs-actual failure | Expected failure traces need explicit comparison with successful completion and mismatch taxonomy | Repair 241 spec before activation |
| HARD-017 | UNKNOWN | CONDITIONAL | Branch protection/ruleset status could not be inspected through connector permissions | GitHub API returned 403 to the integration | Verify with authorized local/API tooling or record as unresolved governance visibility gap |
| HARD-018 | HIGH | YES | Repository scale now exceeds stale audit coverage | Legacy audit predates much of current source/test/spec surface | Complete exact-SHA 100% tracked-file audit in this interlock |

## Finding lifecycle

Each finding MUST end in one of:

- `CLOSED-FIXED` — root cause fixed and verified;
- `CLOSED-NOT-AN-ISSUE` — disproved with concrete evidence;
- `BLOCKED-EXTERNAL` — cannot be resolved with available authority/environment; remains advancement-blocking if its requirement is mandatory;
- `DEFERRED-NONBLOCKING` — only if the governing spec explicitly permits deferral and the finding is not blocker/high or safety/correctness critical.

Do not use `accepted`, `won't fix`, or severity downgrades as a substitute for evidence.
