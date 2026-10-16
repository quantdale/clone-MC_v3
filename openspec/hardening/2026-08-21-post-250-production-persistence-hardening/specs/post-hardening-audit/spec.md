# Spec: Post-Hardening Audit and Release Revalidation

## Requirements

### REAUDIT-1 — current-tree evidence
After remediation, re-audit Change 249's persistence-related findings using current source citations and dynamic tests against the actual shipped persistence composition.

### REAUDIT-2 — mandatory closure
`249-DL-001`, `249-DL-002`, and `249-DL-005` MUST be `resolved`. `accepted`, `deferred`, `waived`, rarity-based, or documentation-only dispositions are invalid for this campaign.

### REAUDIT-3 — related findings
Re-evaluate at minimum DL-003, DL-004, SEC-001, and any reliability/architecture findings whose evidence changes because persistence is now live. Any newly discovered data-loss/corruption/security/regression blocker MUST be fixed before release readiness.

### REAUDIT-4 — full gate
The exact intended tree MUST pass repository state validation, typecheck, lint, full unit tests, coverage thresholds, build, both dependency audits, E2E, and the release-performance gate.

### REAUDIT-5 — canonical proof
The remediation commit MUST be published to `origin/main`, refetched, and matched to a canonical GitHub Actions SUCCESS run for the exact SHA. Record run/job identifiers.

### REAUDIT-6 — superseding decision
Create a post-hardening release-readiness artifact that explicitly supersedes the historical Change 250 READY decision and names the exact published remediation SHA. READY is permitted only if all mandatory findings are resolved and no blocking finding remains.
