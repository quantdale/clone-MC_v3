# Verification: Pre-241 Repository Hardening

Overall status: **NOT VERIFIED**  
Task completion: **0% at authoring**

This file distinguishes **authoring-time observations** from **executor completion evidence**. An old run, local run on another SHA, narrative claim, or copied test count is never sufficient to verify a current requirement.

## Authoring-time observations (not completion evidence)

| Observation | Authored evidence | Disposition required |
|---|---|---|
| Observed `main` head | `6b69831503a2cdb5a749c2bba791e2d1632acaca` | Re-fetch at execution start |
| Observed parent boundary | `6f9b670a0b461bf3311098e46e7c819bafc18fd3` | Validate provenance; do not blindly reset |
| Latest observed canonical CI | failed in typecheck | Restore preactivation boundary / fix hardening issues |
| Parent canonical CI | typecheck/lint/unit green, E2E red | Reproduce and close E2E failures |
| 241 ledger | tasks 0%, verification NOT VERIFIED | Remove premature implementation; repair specs |
| State artifacts | JSON/Markdown disagree | Reconcile and validate |
| Full dependency install | one high-severity audit signal observed | Trace full advisory path |
| Branch protection | connector access returned 403 | Verify locally/API if authorized or record gap |

## Evidence rules

Every final evidence row MUST contain:

- exact command/check;
- exact git SHA tested;
- result and relevant count/metric;
- environment when behavior is environment-sensitive;
- artifact/log path or canonical Actions run/job identifier when applicable;
- no unexplained skips/retries.

If a check cannot run, status is `BLOCKED`, not PASS.

## Gate A — Preactivation boundary

Status: **NOT RUN**

- [ ] No inactive Change 241+ production/test implementation remains.
- [ ] Changes 241-250 specification packages remain present.
- [ ] `npm run typecheck` PASS on restored pre-241 implementation baseline.
- [ ] `npm run lint` PASS.
- [ ] `npm run build` PASS.
- [ ] `npm test` PASS with counts recorded.

Evidence:

| Check | SHA | Result | Evidence |
|---|---|---|---|
| pending | pending | NOT RUN | pending |

## Gate B — Known canonical E2E failures

Status: **NOT RUN**

For pig spawn, block target/break, item spawn/drop, block placement, and long-exploration resource usage:

- [ ] root cause classified;
- [ ] fix or valid test correction evidenced;
- [ ] isolated scenario >=3 consecutive no-retry passes;
- [ ] full suite first-attempt/no-retry pass;
- [ ] no relaxed timeout/resource budget used as an unexplained escape hatch.

## Gate C — Control-plane integrity

Status: **NOT RUN**

- [ ] Program state JSON/Markdown agree.
- [ ] Publication instructions are unambiguous.
- [ ] Task/verification ledgers match implementation reality.
- [ ] State validator catches representative invalid states.
- [ ] No VERIFIED claim points at a red canonical SHA.

## Gate D — Spec integrity 241-250

Status: **NOT RUN**

- [ ] Every required artifact present.
- [ ] Every MUST/SHALL maps to scenarios/tasks/verification.
- [ ] Contradictions resolved.
- [ ] 241 tick-seed contract repaired.
- [ ] 241 RNG stream ownership/timing repaired.
- [ ] 241 canonicalization/immutability/failure semantics repaired.
- [ ] No false verification/provenance claims remain.
- [ ] 242-250 audited to the same standard.

## Gate E — Every-file audit

Status: **NOT RUN**

- [ ] Inventory generated from exact-SHA `git ls-files`.
- [ ] Manifest row count equals tracked-path count.
- [ ] Zero rows remain `unreviewed`.
- [ ] Every source module has an integration status.
- [ ] Every finding is linked and dispositioned.
- [ ] Blocking findings = 0 open.

Record totals at completion:

| Metric | Value |
|---|---:|
| tracked paths | pending |
| audited paths | 0 |
| production source paths | pending |
| integrated | pending |
| intentional dormant | pending |
| dead/unreachable | pending |
| open blocker/high findings | pending |

## Gate F — Test/coverage/dependency/toolchain

Status: **NOT RUN**

- [ ] Coverage measured and thresholds enforced without regression gaming.
- [ ] Full unit suite passes; counts/skips recorded.
- [ ] Full E2E passes first-attempt with retries disabled.
- [ ] Critical E2E repeatability gate passes.
- [ ] Long-session/resource repeatability gate passes.
- [ ] Production audit has zero high/critical advisories.
- [ ] Full audit high/critical dev findings are eliminated or explicitly justified as permitted by spec.
- [ ] Supported Node policy is aligned across package/CI/docs.

## Gate G — Published canonical proof

Status: **NOT RUN**

- [ ] Final local gate passed on the exact intended commit/tree.
- [ ] Intended commit pushed to `origin/main`.
- [ ] Refetch proves `origin/main` at exact intended SHA.
- [ ] Canonical GitHub Actions run for that exact SHA completed SUCCESS.
- [ ] Run ID/job IDs recorded here.
- [ ] Final state/handoff references exact published SHA and truthful status.

## Final verdict

**NOT VERIFIED. Numbered advancement to Change 241 remains blocked.**

The final verifier may replace this verdict with VERIFIED only after Gates A-G all pass and every task is checked with exact-SHA evidence.
