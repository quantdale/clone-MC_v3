# Verification: 286-live-raid-bar-parity

Status: NOT VERIFIED
Completion: 0%
Advancement allowed: false

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Pure total raid-bar projection (wave, omen, village) | Pending implementation (T6) | PENDING |
| Distinct from wither boss bar / HudParity | Pending isolation tests (T7) | PENDING |
| Accessible active/terminal presentation | Pending DOM + a11y tests (T8–T9) | PENDING |
| Invalid/duplicate/stale/reload/dispose rules | Pending edge tests (T10) | PENDING |
| No 258 GPU/FPS, no persistence, no unrelated systems | Package scope + future file-audit (T11/T14) | PENDING (scope declared) |
| Activation only after 282 VERIFIED | `OVERRIDE_DRAFT.md` + proposal Preconditions (T2/T4) | PENDING (gate) |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npx vitest run tests/unit/RaidBarParity.test.ts` (future name) | PENDING | Not implemented this draft session |
| `npx playwright test tests/e2e/raid-bar-parity.spec.ts` (future name) | PENDING | Not implemented this draft session |
| `npm run typecheck` | PENDING | Deferred to activation |
| `npm run lint` | PENDING | Deferred to activation |
| `npm test` | PENDING | Deferred to activation |
| `npm run build` | PENDING | Deferred to activation |
| `npm run test:e2e` | PENDING | Deferred to activation |
| file-audit | PENDING | Deferred to activation |
| `npm run validate-state` | PENDING | Must not claim PASS while PROGRAM_STATE is untouched |

## Edge/adversarial validation

Pending: null/`INACTIVE` projection, non-finite wave/omen counters,
empty/whitespace/non-string village name, duplicate sync idempotence, stale
post-dispose sync, reload hide, pause freeze, missing DOM, boss-bar isolation.

## Migration/compatibility validation

Pending. Intended contract adds no persistence namespace, archive field,
entity registration, or migration. Withers and 282 feedback remain the
regression boundary.

## Performance/resource validation

Pending. Intended hot path is one O(1) pure projection and bounded DOM writes
per active fixed tick; no render-worker, FPS, or GPU work.

## Regressions

Pending. Change 258 must remain BLOCKED; Changes 259–282 (and earlier
verified set) must remain VERIFIED; `boss-bar.spec.ts` and HUD visual matrix
must stay green at activation.

## Incomplete tasks

T4–T14 are pending (activation-gated). T1–T3 (package + override draft +
authoring gate) are complete for this draft session only.

## Advancement Exception

Not applicable; the target is 100%. Completion is 0% because production
implementation and all runtime gates are intentionally deferred until 282 is
VERIFIED and this change is activated on a compliant branch.

## Final decision

NOT VERIFIED — package authored and committed on `wt/286-live-raid-bar-parity`
only; activation and implementation blocked on 282 VERIFIED and subsequent
control-plane enablement.
