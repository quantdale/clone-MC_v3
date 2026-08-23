# Proposal — Exhaustive Repository Certification Campaign

## Why

The repository declares itself terminal: every numbered change 001–250 VERIFIED, the post-250
production-persistence hardening interlock VERIFIED, and release READY at remediation checkpoint
`aa92a5c`. Declaration is not proof. This campaign tries to disprove the READY verdict by
auditing the actual `origin/main` tree from first principles, with emphasis on the defect
classes that survive a 4,160-test unit suite and a 46-test browser suite:

- lifecycle and composition races in the concentrated `Game.ts` root;
- persistence paths whose failure modes only appear under fault injection;
- state that silently fails to survive reload (stateful blocks, item components);
- latent inventory destruction/duplication families behind data-driven seams;
- test-quality gaps where assertions cannot fail;
- governance/evidence machinery that can misdirect future agents.

## Goals

1. Produce an honest per-file audit manifest with a reviewed SHA; no file starts or stays
   `pending`, and no verdict is machine-assigned.
2. Verify or refute the campaign seed findings (GOV-STATE-ALIAS, GOV-VALIDATOR,
   AUDIT-EVIDENCE) and the observed documentation drift.
3. Fix every reproducible BLOCKER/HIGH finding and every contained MEDIUM finding that
   undermines certification, each with a regression oracle.
4. Leave the full gate green on the final candidate SHA and publish to `origin/main`.

## Non-goals

- No new gameplay features; no parity-scope expansion.
- No rewrite of historical evidence artifacts (annotated/superseded instead).
- No aesthetic refactors of `Game.ts` or other large files without a demonstrated defect.
- No history rewriting; normal forward-only pushes to `origin/main`.

## Success criteria

- `file-audit-manifest.json`: pending == 0, unclassified == 0, reviewed SHA == final SHA.
- All BLOCKER/HIGH findings resolved or proven impossible; MEDIUMs fixed or explicitly accepted
  in `risk-register.md` with rationale.
- Full gate (validate-state, typecheck, lint, unit, coverage, build, release-bundle check,
  both npm audits, e2e) PASS on the exact candidate SHA.
- Second adversarial pass over the diff recorded in `post-hardening-audit.md`.
