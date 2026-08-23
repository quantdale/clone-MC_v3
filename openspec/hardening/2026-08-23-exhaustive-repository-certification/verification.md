# Verification — Exhaustive Repository Certification Campaign

> **Overall status: **VERIFIED** (2026-08-23)** — canonical exact-SHA CI run 32620103123 on
> candidate `e56b83a35e5034b5c73745c9a76130a9ac58d273` returned gate job 97148797875 SUCCESS
> and e2e job 97148797928 SUCCESS; recorded in `PROGRAM_STATE.json` `releaseAuthority.canonicalCi`.

## Baseline (START_SHA `5e032877a6d2bad7ccd2af201d9dd77fe6ddc20d`, clean tree)

| Gate | Result |
|---|---|
| `npm run validate-state` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 317 files / 4160 passed + 1 skipped |
| `npm run test:coverage` | PASS (report generated; thresholds enforced by config) |
| `npm run build` | PASS (tsc --noEmit && vite build) |
| `node scripts/check-release-bundle.mjs` | PASS — 4 assets checked; no E2E hook |
| `npm audit --omit=dev` / `npm audit` | 0 vulnerabilities / 0 vulnerabilities |
| `npm run test:e2e` | 43/46 PASS; 3 intermittent cold-start failures in game.spec.ts (software-GL first-boot window); full game.spec.ts re-run passed 30/30 — environment flakiness, CI masks via retries=2 |

## Final gate (campaign tree; operator-directed publication before local e2e completion)

| Gate | Result |
|---|---|
| validate-state | PASS (strengthened validator incl. terminal coherence + alias conformance) |
| typecheck (`tsc --noEmit`) | PASS |
| lint (`eslint .`) | PASS |
| unit (`vitest run`) | PASS — 325 files / **4201 passed + 1 skipped** (+40 oracles vs baseline) |
| coverage thresholds | PASS — statements 87.06 / branches 91.37 / **functions 95.03** / lines 87.06 (floors 85/91/95/85) |
| build (`tsc --noEmit && vite build`) | PASS |
| `node scripts/check-release-bundle.mjs` | PASS — 4 assets checked; no E2E hook |
| `npm audit --omit=dev` / `npm audit` | 0 vulnerabilities / 0 vulnerabilities |
| `npm run test:e2e` | **NOT COMPLETED on the final tree** — the full-suite run was interrupted by operator instruction to publish. Evidence in lieu: baseline full suite ran 43/46 with 3 cold-start flakes that re-ran green; game.spec.ts full-file passed 30/30 post-baseline; the campaign's modified e2e tests (3 hold-mine conversions + falsifiable streaming assertion) are covered by the strengthened unit mining oracle but have not had a completed browser run locally. Canonical proof falls to the exact-SHA CI gate/e2e run on the published head per REVIEW_HANDOFF. |

## Manifest completeness

- `file-audit-manifest.json`: 2470+ rows (start-tree 2452 + campaign artifacts), pending = 0,
  unclassified = 0, every production row semantic-reviewed with a citing note.
- `node scripts/validate-file-audit.mjs <manifest>`: PASSED against the candidate tree
  (bijection with `git ls-files` + intended campaign artifacts).

## Finding closure summary

BLOCKER: none found. HIGH: 3 found → 3 resolved with oracles (F-INV-1, F-INV-2, F-MINE-1).
MEDIUM: 8 found → resolved/dispositioned (F-W-1 bound+documented; F-PERS-6, F-INV-3, F-INV-7,
GOV×3, AUDIT-EVIDENCE) + RND-5 accepted as product-balance risk (R-2). LOW/INFO: resolved or
registered in risk-register.md.

## Release verdict

**READY WITH EXPLICIT NON-BLOCKING DEBT** — conditioned on the canonical exact-SHA CI run
(gate + e2e jobs) succeeding on the published head; accepted debt enumerated in
`risk-register.md` R-1..R-9.

## Canonical exact-SHA CI follow-up (2026-08-23)

The campaign was published as `c58f972ca62401a29ccf56fdce0716f7aeb38880` (remote HEAD verified).
CI run 32618476207 for that SHA returned **gate FAILURE at the Lint step**:

- `scripts/validate-file-audit.mjs` — `'path' is defined but never used` (unused `node:path` import);
- `scripts/gen-file-audit.mjs` — `'process' is not defined` (`process.argv` used without a globals comment).

Both are evidence-script hygiene defects only (no runtime/test behavior touched); Build,
Unit, Coverage, and audits were skipped downstream of Lint and did not themselves fail.
The prior local "lint PASS" claim predates the final edits of these two scripts and did not
re-run afterward — recorded here as an honest process defect of the interrupted session.

Remediation (this session): removed the unused import; declared `process` via the existing
`/* global */` comment. Full local re-gate on the fixed tree: validate-state PASS,
typecheck PASS, lint PASS, unit **326 files / 4206 passed + 1 skipped** PASS, build PASS
(tsc --noEmit && vite build), release-bundle check PASS (4 assets, no E2E hook).
The canonical READY condition therefore attaches to this follow-up commit's exact-SHA CI run
(gate + e2e), which supersedes the RED run on c58f972.
