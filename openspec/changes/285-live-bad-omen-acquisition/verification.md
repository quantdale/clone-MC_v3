# Verification: 285-live-bad-omen-acquisition

Status: ACTIVE (authoring only; implementation not started)
Progress: 2/10 (20%)
Advancement allowed: false

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Total clamp/grant/clear | Pending `tests/unit/BadOmenRules.test.ts` | PENDING |
| Village trigger fail-closed reasons | Pending `tests/unit/BadOmenRules.test.ts` | PENDING |
| Game ephemeral seams | Pending `tests/unit/LiveBadOmen.test.ts` | PENDING |
| Fixed-tick start-once/consume-once | Pending `tests/unit/LiveBadOmen.test.ts` | PENDING |
| Pause/dispose/replace/reload | Pending unit + browser | PENDING |
| No persistence/registry/HUD/GPU | Pending file-audit | PENDING |

## Focused evidence

| Command | Result | Evidence/notes |
|---|---|---|
| `npx vitest run tests/unit/BadOmenRules.test.ts tests/unit/LiveBadOmen.test.ts` | PENDING | Implementation not started |
| `npx playwright test tests/e2e/bad-omen-acquisition.spec.ts` | PENDING | Implementation not started |

## Required gates

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PENDING | — |
| `npm run lint` | PENDING | — |
| `npm test` | PENDING | — |
| `npm run build` | PENDING | — |
| `npm run test:e2e` | PENDING | — |
| file-audit | PENDING | — |
| `npm run validate-state` | PENDING | — |

## Edge/adversarial validation

Pending: NaN/Infinity/negative/fractional omen, cap stacking, duplicate clear,
null village, `containsPlayer: false`, non-finite center, reason precedence,
duplicate trigger after consume, pause freeze, dispose, active-raid
replacement, reload level 0, and missing raid seam retains omen.

## Migration/compatibility validation

Pending. The intended contract adds no persistence namespace, archive field,
entity registration, status-effect registry edit, or migration.

## Performance/resource validation

Pending. The intended hot path is one O(1) pure decision per unpaused fixed
tick with at most one raid start + one clear, and no render-worker or GPU work.

## Regressions

Pending. Change 258 must remain BLOCKED; Changes 001–281 must remain VERIFIED;
Change 282 must remain the sole prior raid feedback authority and stay green.

## Incomplete tasks

T3–T10 are pending. Package authoring (T1–T2) is complete on this branch; live
`CHANGE_SEQUENCE_OVERRIDES.md` and `PROGRAM_STATE*` were intentionally not
edited (draft addendum lives in `OVERRIDE_DRAFT.md`).

## Advancement Exception

Not applicable; the target is 100%.

## Final decision

NOT VERIFIED — T1–T2 complete (package authored and quality-gated);
T3–T10 pending implementation. Activation of production work requires Change
282 VERIFIED and sequential ordering (283, 284) per `CHANGE_SEQUENCE.md`.
