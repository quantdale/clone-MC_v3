# Verification: 257-void-world-startup-recovery

Status: REOPENED / NOT VERIFIED
Completion: 53/80 (66.25%)
Advancement allowed: false

## Why the prior VERIFIED decision was revoked

Independent review of published `main` found multiple direct contradictions between the Change-257
verification claims and the implementation/evidence. The original void/free-fall architecture repair
is materially present and remains the foundation, but the change cannot remain VERIFIED while the
following blockers exist.

| ID | Requirement / claim | Current evidence | Status |
|---|---|---|---|
| F257-10 | Recovery backup is complete and safe before destructive reset | `exportWorldBackup()` delegates to the five-store `WorldArchiver`; current persistence/reset also owns `chunk-edits` and raw Wither metadata, which are not exported | FAIL — HIGH data-loss risk |
| F257-11 | Reset failure preserves the saved world | `resetCurrentWorld()` deletes sequentially; a later store failure can occur after earlier stores were already deleted, while UI says "Your saved world was kept." | FAIL — HIGH integrity/UX |
| F257-12 | Recovery-required pauses world mutation | `Game.update()` still calls `world.update()`; `World.update()` executes generation/meshing/falling-block/light/unload work | FAIL — HIGH |
| F257-13 | Fresh/recovery/post-reset screenshots were captured in the 257 E2E | `tests/e2e/void-world-recovery.spec.ts` has no `page.screenshot` call; Playwright is configured `screenshot: only-on-failure` | FAIL — evidence claim invalid |
| F257-14 | Accepted risk register was updated and R-6 subset closed | Risk register still states real IndexedDB corruption/player durability browser proof is open debt | FAIL |
| F257-15 | File audit is fully certified | recorded command is `validate-file-audit.mjs --pending`; validator source explicitly skips reviewed-manifest completeness checks in pending mode | FAIL |
| F257-16 | Git/OpenSpec publication state and CI are final | state fields point at older SHAs; CI for release commit `324a039` was cancelled and later `main` CI was pending at review time | FAIL |

## Preserved historical evidence

The earlier baseline-aware spawn/readiness tests, startup compatibility assessment, player support
validation, six real-IndexedDB startup scenarios and recovery UI remain useful, but are insufficient
for final verification. All mandatory commands MUST be rerun after the repairs.

## Commands required on the final repair candidate

| Command / evidence | Current decision |
|---|---|
| `npm run typecheck` | MUST RERUN |
| `npm run lint` | MUST RERUN |
| `npm test` | MUST RERUN |
| `npm run build` | MUST RERUN |
| focused Change-257 browser suite including atomic reset failure/corrupt-IDB cases | MUST RERUN |
| complete `npm run test:e2e` | MUST RERUN |
| explicit screenshot capture + visual inspection | MUST RUN |
| `node scripts/validate-state.mjs` | MUST RERUN |
| canonical reviewed file-audit validation | MUST RUN |
| orphan/file inventory/release checks required by policy | MUST RERUN |
| GitHub Actions CI on exact final `origin/main` SHA | MUST COMPLETE SUCCESSFULLY |

## Data-integrity acceptance

A backup is successful only if every world-owned record that reset can delete is represented in the
archive and round-trips. A failed reset MUST be atomic: no world-owned record may be observably
missing or changed after an injected abort. UI copy MUST match that truth.

## Recovery-mode acceptance

A recovery-required world may render already-loaded immutable scene data, but MUST NOT advance world
generation, meshing state, lighting mutation, falling blocks, unload state, simulation ticks,
interactions, survival state, or persistence rewrites.

## Visual acceptance

The final suite MUST explicitly capture and retain fresh terrain, recovery overlay, injected reset
failure, and successful post-reset terrain screenshots.

## Advancement Exception

Not applicable. Completion is below 90% and unresolved HIGH integrity/evidence defects exist.

## Final decision

NOT VERIFIED. Continue the invalidated requirements and tasks 68-80. Change 258 may be fully
specified in advance but MUST NOT enter implementation until Change 257 is recertified.
