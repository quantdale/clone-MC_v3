# Verification: 283-live-raid-persistence

Status: NOT VERIFIED
Completion: 0%
Advancement allowed: false

This package is SPEC-FIRST authoring only on branch `wt/283-live-raid-persistence`. No
production code, no tests that land on `main`, and no `PROGRAM_STATE` changes exist yet.
Implementation begins only after Change 282 is VERIFIED on `origin/main` and this package is
activated. Evidence rows below are the planned mapping; commands are not run in this
session.

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| R-1 World-scoped `__raid__` hydrate/save via `serializeRaid`/`deserializeRaid` | Planned: `tests/unit/RaidPersistence.test.ts`, `tests/unit/LiveRaidPersistence.test.ts` | PENDING |
| R-2 Fail-closed runtime validation (invalid/stale ⇒ null, no partial state) | Planned: RaidPersistence unit rejection classes + corrupt-boot E2E leg | PENDING |
| R-3 Fail-closed archive migration (malformed `raidData` ⇒ pre-write throw) | Planned: WorldArchiver/RaidPersistence unit + archive refuse-import E2E leg | PENDING |
| R-4 Reload restores current raid; absent/corrupt ⇒ null | Planned: `tests/e2e/raid-persistence.spec.ts` reload + reset legs | PENDING |
| R-5 Single-record duplicate/stale rules (one key, schemaVersion 1 only) | Planned: namespace overwrite unit + stale-version unit | PENDING |
| R-6 Reset delete + archive export/import passthrough | Planned: GamePersistence reset unit + archive round-trip unit/E2E | PENDING |
| R-7 Lifecycle save points (autosave/dispose/pagehide) with guards | Planned: LiveRaidPersistence composition unit | PENDING |
| R-8 No raider spawning / 282 feedback contract preserved / 258 BLOCKED | Planned: audit + existing raid-feedback E2E regression | PENDING |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PENDING | Not run in authoring session |
| `npm run lint` | PENDING | Not run in authoring session |
| `npm test` | PENDING | Not run in authoring session |
| `npm run build` | PENDING | Not run in authoring session |
| `npm run test:e2e` | PENDING | Not run in authoring session |
| file-audit | PENDING | Not run in authoring session |
| `npm run validate-state` | PENDING | Not run in authoring session |

## Edge/adversarial validation

Planned: null/non-object payload; wrong `schemaVersion` (stale); unknown status; non-finite
center; negative/fractional counters; `waveIndex > totalWaves`; duplicate `putRaidData`
overwrite; corrupt boot ⇒ null without throw; malformed archive `raidData` ⇒ import aborts
with zero writes; quota/recovery-required save guard; double dispose/pagehide idempotence;
reload of terminal `VICTORY`/`DEFEAT` restores terminal (not cleared).

## Migration/compatibility validation

Planned: world without `__raid__` boots `raidState === null` (pre-283 behavior); archive
without `raidData` imports as null; older builds ignore `__raid__`; fail-closed import never
persists garbage; reset deletes the record and reload stays null.

## Performance/resource validation

Planned: one serialize+put per save point, one get+deserialize at boot, no per-tick I/O, no
entity/GPU work. Assert no new timers/workers in the diff.

## Regressions

Planned: full unit suite green; 282 raid-feedback journeys unchanged; 259–282 not reopened
without cause; Change 258 remains BLOCKED (no headed FPS evidence claimed); Changes
259–282 remain VERIFIED.

## Incomplete tasks

T1–T13 are pending implementation. This authoring session drafts T1's package artifacts and
`OVERRIDE_DRAFT.md` only; the checkbox stays unchecked until activation applies the live
control-plane files on `origin/main`.

## Advancement Exception

Not applicable; the target is 100%.

## Final decision

NOT VERIFIED — package authored (0% tasks); activation deferred until Change 282 is VERIFIED
on `origin/main`.
