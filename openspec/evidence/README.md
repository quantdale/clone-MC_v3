# Evidence Archive — Minecraft-Parity Program (Changes 001–250)

Change: 250-final-program-verification · Assembled: 2026-08-21 · Entry head: `502d0215f88f31868f6bc7067efe4326d2f7fb26`

## Purpose

This directory is the single, consolidated, provenance-backed evidence archive for the completed
minecraft-parity program. It stabilizes the heterogeneous per-change verification history
(`openspec/PROGRAM_STATE.json` `validationResults` evolved across two schema generations) into
one reviewable catalog, and hosts the four program-terminal artifacts: the final verification
checklist, the final parity audit, the final regression/performance suite record, and the
release-readiness decision.

## Catalog

Every planned numbered change **001–250** from `openspec/CHANGE_SEQUENCE.md` has exactly one
consolidated record at `changes/<NNN>.md` — 250 records, no gaps, no duplicates, no unnumbered
files.

## Provenance rule

Every recorded value in this archive is traceable to an existing, locatable source record; the
archive contains no invented or re-run result:

- **Head / gate results / unit+e2e counts** — copied verbatim from the change's entry in
  `openspec/PROGRAM_STATE.json` `validationResults` where an entry exists (244 of 250 changes).
  Later-schema entries identify by validated Git `head`; four head-only entries whose commit
  subjects do not name a change (`88b18803…`, `aa198665…`, `74f311c`, `d41ef1d9…`) are attributed
  by content-and-order provenance checked against the owning change's `verification.md`
  (003: "154/154"; 005: "177/177 incl. 12 tag-registry tests"; 115: "1374, was 1354 at 114";
  234: "3265 = 3191 + 74").
- **Where no `validationResults` entry exists** (001, 025, 110, 118, 231) the record says so and
  cites only the originating `openspec/changes/<dir>/verification.md`, which exists for every
  change 001–249 and records each as VERIFIED.
- **Source line** — every record cites its originating `verification.md` path. No record reports
  a result that no run or source record produced.

## Completeness statement

**Complete.** All 250 planned changes have exactly one evidence record under `changes/`; the set
of changes recorded VERIFIED in `checklist/final-verification-checklist.md` (250: changes
001–249 verified before this change, plus 250 closing VERIFIED with this documentation-only
change) matches the VERIFIED set in `openspec/PROGRAM_STATE.json` (`validationResults[].status`,
including the 250 entry appended at completion). No change is DEFERRED; none is UNCLASSIFIED.

## Directory index

| Path | Contents |
|---|---|
| `README.md` | This manifest: purpose, catalog, provenance rule, completeness statement. |
| `checklist/final-verification-checklist.md` | One classified row per change 001–250 + summary counts. |
| `changes/<NNN>.md` ×250 | Consolidated per-change evidence records (status, outcome, head, gate, counts, source). |
| `parity/final-parity-audit.md` | Final parity-matrix accuracy re-check + change-249 audit-finding dispositions. |
| `suites/final-regression-suite.md` | Final baseline gate + release performance gate results. |
| `release-readiness.md` | Terminal READY/NOT READY decision over criteria RC-1..RC-9. |

Consumed read-only: `openspec/CHANGE_SEQUENCE.md`, `openspec/PROGRAM_STATE.json`, every change's
`verification.md`, `PARITY_MATRIX.md`, `openspec/changes/249-whole-codebase-adversarial-audit/report.md`,
and the change-247 performance-gate evidence. This archive modifies none of them.
