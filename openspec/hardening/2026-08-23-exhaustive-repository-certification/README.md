# Exhaustive Repository Certification Campaign (2026-08-23)

Out-of-band adversarial hardening campaign against `origin/main` at
`START_SHA = 5e032877a6d2bad7ccd2af201d9dd77fe6ddc20d` (post-250 interlock VERIFIED tree,
release READY at `aa92a5c`). This package does not create Change 251 and does not renumber or
rewrite any 001–250 artifact. It audits the published READY state from first principles and
remediates what it can disprove.

## Scope

- Every tracked file inventoried (`git ls-files`, 2452 files at start) with an honest,
  non-auto-green audit manifest (`file-audit-manifest.json`).
- Deep semantic review of the shipped runtime path: composition/lifecycle, persistence,
  stateful block state, world/chunk pipeline, worker infrastructure, determinism surfaces,
  physics/interaction, rendering/GPU lifecycle, inventory/crafting, security/release boundary.
- Governance hardening: state-file alias contradiction, validator coverage, evidence-generator
  semantics.
- Documentation reconciliation against current code.

## Methodology

1. Baseline gates recorded on the unmodified tree (see verification.md).
2. Independent adversarial passes over the live composition root (`Game.ts`), storage stack,
   and world pipeline, plus parallel sub-audits of inventory and test quality.
3. Every candidate finding verified end-to-end against source before acceptance; seed findings
   from the campaign brief treated as leads, not truth.
4. Fixes at root cause with the smallest strong regression oracle per finding.
5. Full gate re-run on the final candidate SHA; second adversarial pass over the campaign diff.

## Files

| File | Purpose |
|---|---|
| `proposal.md` | Goals, non-goals, success criteria |
| `design.md` | Fix designs and disposition rationale |
| `tasks.md` | Task checklist with completion evidence |
| `findings.md` | Numbered findings with severity/confidence/disposition |
| `verification.md` | Baseline + final gate evidence |
| `file-audit-manifest.json` | Reviewed file inventory (reviewed SHA, one row per tracked file) |
| `integration-map.md` | Runtime reachability of the audited subsystems |
| `risk-register.md` | Accepted risks with rationale |
| `post-hardening-audit.md` | Second-pass findings over the campaign delta |

## Status

See `verification.md` for the authoritative gate record and final verdict.
