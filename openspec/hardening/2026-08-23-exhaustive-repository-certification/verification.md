# Verification — Exhaustive Repository Certification Campaign

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
