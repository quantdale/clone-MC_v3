# Specification: Dependency and Toolchain Hygiene

## Requirement DTH-1 — Dual dependency audit

Hardening MUST run both full `npm audit` and `npm audit --omit=dev`, recording advisory identifiers, severity, dependency path, fix availability, and runtime reachability for every high/critical result.

### Scenario: Production high/critical advisory
- THEN hardening remains blocked until it is removed or the dependency is eliminated; production high/critical waivers are not accepted by this interlock.

## Requirement DTH-2 — Dev-only advisory disposition

A dev-only high/critical advisory SHOULD be removed through a compatible supported upgrade. If no compatible fix exists and the package has no production runtime path, a documented exception MAY be recorded only with dependency-path evidence, impact explanation, and a concrete future recheck trigger.

## Requirement DTH-3 — No forced upgrade shortcut

The executor MUST NOT run or accept `npm audit fix --force` blindly. Major/transitive upgrades require build/test/E2E compatibility verification.

## Requirement DTH-4 — Supported Node policy

The repository MUST select a currently supported Node line for development/CI and align `package.json` engines, CI setup, lockfile/install expectations, and documented setup.

### Scenario: GitHub Actions internal runtime warning
- THEN the executor distinguishes the action's JavaScript runtime from the Node version used to build/test the application and updates each for its own support policy.

## Requirement DTH-5 — Deprecated transitive package trace

Observed deprecation/security warnings (including the authored `glob@10.5.0` warning) MUST be traced to their owning dependency chain and remediated through supported top-level upgrades when feasible.

## Requirement DTH-6 — Reproducible install

`npm ci` from the committed lockfile MUST succeed on the selected supported Node environment without modifying the lockfile.

## Requirement DTH-7 — CI action hygiene

GitHub Actions SHALL be reviewed for supported action versions, least-required permissions, bounded runtime, cancellation/concurrency behavior, and immutable pinning where practical under repository policy.

## Requirement DTH-8 — Repository controls evidence

Branch protection/ruleset and required-check configuration SHOULD be verified with authorized tooling. If permissions prevent inspection, the executor MUST record the control as unknown/unverified rather than infer protection is absent or present.
