# Proposal: Pre-241 Repository Hardening

## Problem

The repository has reached a point where continuing feature/parity work would compound uncertainty rather than reduce it. The current control plane says Change 240 is complete and Change 241 has not yet been activated, yet the observed `main` head includes partial Change 241 production/test code, 241's task ledger remains at 0%, and its verification file remains NOT VERIFIED. The same observed `main` head fails canonical GitHub Actions typecheck. The immediately preceding canonical run passed typecheck/unit/lint but failed multiple E2E scenarios, including the long-exploration resource budget.

The repository also contains contradictory or stale evidence: `PROGRAM_STATE.json` and `PROGRAM_STATE.md` do not express the same completed/current state; local-style verification claims for Change 240 conflict with canonical GitHub Actions; review/publish instructions are not fully consistent; and a newly authored Change 241 requirement requires one tick-seed entry per tick while one of its own valid examples omits all tick seeds.

The right response is not to continue 241. It is to establish a hardening interlock that restores a truthful green baseline, reconciles governance and evidence, repairs future specs before they become executable, and audits every tracked file so autonomous development can resume from a known-good substrate.

## Goals

1. Restore a **green canonical pre-241 baseline** without discarding authored future specification packages.
2. Remove premature Change 241 production/test implementation until 241 is legitimately activated.
3. Reproduce and remediate the canonical Change 240 E2E failures rather than accepting local-only green evidence.
4. Make program state, sequence controls, publication rules, task ledgers, and CI evidence mutually consistent and machine-checkable where practical.
5. Audit all authored 241-250 spec packages for contradictions, false evidence claims, missing failure semantics, ambiguous ownership, and unverifiable requirements before any affected change becomes ACTIVE.
6. Perform a 100%-accounted tracked-file audit and identify dead/dormant/unintegrated modules, unsafe boundaries, stale generated artifacts, untested critical paths, and configuration drift.
7. Harden CI/test evidence: first-attempt correctness, flake detection, coverage no-regression gates, durable diagnostics, and exact-SHA provenance.
8. Triage dependency/toolchain security and compatibility warnings without blind forced upgrades.
9. Leave the repository in a state where a fresh autonomous session can recover truth from Git alone.

## Non-goals

- Implementing Change 241 gameplay/replay functionality or any Change 242-250 feature.
- Renumbering Changes 241-250.
- Replacing Change 249's later whole-codebase adversarial audit or Change 250's final program verification.
- Weakening E2E assertions, resource ceilings, strict TypeScript checks, or coverage simply to turn CI green.
- Large aesthetic refactors unrelated to a documented hardening finding.
- Claiming release readiness for an unfinished Minecraft-parity program.

## Initial observed baseline

The audit that authored this package observed:

- `main`: `6b69831503a2cdb5a749c2bba791e2d1632acaca`.
- That SHA's GitHub Actions run failed during `npm run typecheck` with errors in `StateHasher.ts`, `ReplayRecording.test.ts`, and `replayScenario.ts`.
- Its parent `6f9b670a0b461bf3311098e46e7c819bafc18fd3` passed typecheck/lint/unit but its canonical E2E job failed six scenarios after retries.
- The 241 commit adds future specs 241-250 **and** premature 241 implementation/test files.
- `PROGRAM_STATE.md` describes 240 as completed while `PROGRAM_STATE.json` still reports a stale 239/240 transition.
- Change 241's tasks and verification remain 0% / NOT VERIFIED despite production/test code being present.

These are **observations, not completion evidence**. The executor MUST re-fetch current `origin/main` and current Actions state before acting.

## Remediation principles

- **Truth before progress:** canonical published evidence outranks stale narrative claims.
- **Smallest safe rollback:** preserve valid future specs; remove only code that violates the preactivation boundary.
- **Root cause over masking:** no timeout inflation, retry inflation, skipped tests, loosened budgets, `any`, `@ts-ignore`, or disabled lint/type rules as a hardening shortcut.
- **Exact provenance:** every green claim records command, result, exact commit SHA, environment, and where applicable canonical Actions run/job IDs.
- **No silent gaps:** an unreviewed file, unverified requirement, unexplained skip, or inaccessible control is a recorded gap, not a pass.

## Risks

- Premature 241 code may have become entangled with later commits by execution time. Mitigation: rebaseline current head, isolate changes by provenance and behavior, and use targeted restoration rather than a destructive hard reset.
- Existing E2E failures may expose genuine gameplay regressions rather than test flakes. Mitigation: characterize deterministically and fix production behavior unless the test is demonstrably wrong.
- A full file audit can become checkbox theater. Mitigation: require category, integration status, review method, findings, evidence, and explicit reviewer disposition per tracked path.
- Dependency upgrades may cause unrelated churn. Mitigation: prefer supported minimal upgrades and document transitive paths; do not use `npm audit fix --force` without an explicit compatibility review.

## Definition of Done

This hardening interlock is complete only when:

- premature 241 implementation is absent while 241 is inactive;
- the pre-241 application passes typecheck, lint, build, unit, coverage gates, dependency gates, and the full E2E suite without relying on retries;
- known 240 canonical E2E failures are reproduced/dispositioned and closed;
- 241-250 specs pass the spec-integrity audit, with 241 replay contradictions and ownership semantics repaired before activation;
- every tracked file is accounted for by the file-audit manifest;
- all blocking/high hardening findings are fixed or, only where genuinely external, explicitly BLOCKED with evidence and no advancement;
- program-state/governance artifacts agree and point to the exact published truth;
- the hardening SHA is pushed to `origin/main`, refetched, and its canonical GitHub Actions run is green;
- `verification.md` is 100% evidenced and marks the interlock VERIFIED.
