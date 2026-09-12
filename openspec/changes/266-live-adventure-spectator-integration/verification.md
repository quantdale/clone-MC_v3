# Verification: 266-live-adventure-spectator-integration

Status: VERIFIED
Completion: 100% (13/13)
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Adventure break permission (live) | `AdventurePermissions.test.ts` 14/14 (composition matrix incl. direct/tag/unknown-tag/empty/cross-kind) + `AdventureSpectatorGates.test.ts` deny/allow (interaction) + E2E adventure arc (blocked 4s-hold unchanged → direct-declared break completes → tag-declared break completes) | VERIFIED |
| Adventure place permission (live) | Unit (no-consume-on-deny; survival contrast) + E2E (denied place: cell air + count 9; declared place consumes exactly 1; tag-declared place works; survival contrast 6) | VERIFIED |
| Permission declaration components | `can_destroy`/`can_place_on` validation matrix (both types) + `splitPermissionKeys` + `getHeldPermissionSet` union/dedupe/unknown-skip/throwing-lookup; registry 3→5 pinned | VERIFIED |
| Spectator movement (live) | `AdventureSpectatorGates.test.ts` noclip wall pass-through (position advances, velocity kept, support air, fallDistance 0) + legacy wall-block default + E2E hover (±0.75) + sneak-descend phases below groundY−2 | VERIFIED |
| Spectator non-interaction (live) | Unit silent-drain (no actions, inputs consumed, outline hidden, no consume) + mid-mine silent reset + E2E (break/place refused, KeyE/KeyC panels closed, drops uncollected, KeyR eat refused with hunger pinned at 10) | VERIFIED |
| Spectator untargetability (live) | Game wiring (`getPlayerTarget` null gate, wither `playerAlive &&= isAttackable`); direct damage already refused via 265 `hurtPlayer`/survival-tick gates (unchanged, unit + E2E covered by 265 contrast). No new hostile behavior in non-spectator modes (all hostile/wither E2E green) | VERIFIED |
| Mode switching + persistence (shared) | Text seam (all four modes, invalid no-op) + HUD `#gamemode-select` (real-DOM selectOption in E2E) + chip toggle unchanged (265 E2E unmodified, green) + `GameModePersistence` 17/17 (all-four-mode round-trip) + E2E reload persists adventure AND spectator (chip + select + hover-liveness) | VERIFIED |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npx tsc --noEmit` | PASS | 0 errors (3 E2E strict-null errors fixed with `!`, creative-spec style) |
| `npm run lint` | PASS | 0 errors, 85 warnings (pre-existing level; no new warnings from 266 files) |
| `npm test` | PASS | 417 files, 4989 passed + 1 skipped (new: AdventurePermissions 14, AdventureSpectatorGates 7, GameModePersistence +1 four-mode) |
| `npm run build` | PASS | 2.27s |
| `npm run test:e2e` | PASS | 80/80 (77 prior + 3 new), run as halves A (48) + B (31) + visual-verify (1) under the 30m shell cap |
| `npm run validate-state` | PASS | — |
| `node scripts/validate-file-audit.mjs` | PASS | 2747 rows (9 new 266 rows, `total` bumped) |

## Edge/adversarial validation

- Unknown numeric block ids in Game closures ⇒ deny (fail closed, unit-pinned via `getByLegacyId` miss path).
- Unknown `placeBlock` resource ids ⇒ `blocked` before consume (new fail-closed refusal; legacy paths always resolve).
- Unknown tags / bad tag parse / throwing lookup ⇒ skipped/empty, never throws (unit-pinned).
- Malformed component values ⇒ registry validator rejects at `.with()`; `splitPermissionKeys` skips non-`true` values defensively.
- Empty hand (null stack) in adventure ⇒ deny break/place (unit + E2E `attached=false` path implicit; E2E covers declaration-free denial).
- Mid-mine revocation ⇒ silent progress reset (unit-pinned).
- Spectator input-hold ⇒ single silent drain per update, zero toasts (unit asserts `seen` empty over 10 updates).
- Invalid mode text (`godmode`) ⇒ false no-op (265 E2E still green); select offers only the four modes.
- `setHeldAdventurePermissions` with empty selection ⇒ false, inventory untouched.

## Migration/compatibility validation

- No store/schema change: `__gamemode__` v1 round-trips all four modes (new 4-mode unit test + E2E reload for adventure/spectator).
- Pre-266 saves (no declaration components) ⇒ adventure deny-by-default (specified).
- Reset/archive passthrough unchanged (265 paths untouched).
- Rollback: 266 records inert without this code (proposal note stands).

## Performance/resource validation

- Permission resolution is edge-triggered (per break/place attempt only).
- Per-tick additions: 1 `noclip()` + 1 `canInteract()` closure + 1 `isAttackable()` predicate; no new per-frame allocations. Full unit 29.7s / build 2.27s unchanged in character.

## Regressions

- 265 E2E (`creative-mode.spec.ts`) unmodified, 2/2 green in-suite (chip-flip contract holds).
- 259–264 sources untouched; only mechanical test change is the 008 registry-size pin (3→5) plus additive persistence test.
- 258 NOT marked VERIFIED; no headed FPS work; no GPU evidence touched.
- Visual goldens: intentional HUD change (`#gamemode-select` chip) pushed `hud/high/1920x1080` (0.0237) and `render-world/high/1920x1080` (0.0201) over the 0.02 threshold. Diff-confirmed (golden vs actual pixel-identical except the new chip; terrain blob = settle noise), then re-baselined `hud/*` + `render-world/*` (12 PNGs) via `UPDATE_SNAPSHOTS=1 SCREEN_FILTER=hud,render-world`; full 60-cell matrix re-verified green.
- One transient: `brewing journey (260)` failed once mid full-suite (`hostHasBrewing false` at break-cleanup, 40.5s) then passed in isolation (2/2), in file-prefix (7/7), and in half A (48/48). No 266 code path implicates it (survival-mode closures are identity-neutral); recorded as environment-marginal, not a regression.

## Incomplete tasks

None (13/13).

## Advancement Exception

Not applicable (100%).

## Final decision

VERIFIED — all MUST/SHALL requirements evidenced, all gates green, advancement allowed. 258 stays BLOCKED; 259–265 stay VERIFIED.
