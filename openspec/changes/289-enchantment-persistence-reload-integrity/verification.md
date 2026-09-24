# Verification: 289-enchantment-persistence-reload-integrity

Status: VERIFIED
Completion: 100% (12/12)
Advancement allowed: true

## Root cause (plain words)

`DirtySaveQueue.drainReport` removed a unit from `pending` before
`await sink.write`. On `pagehide`, **two** listeners start flush
(Game `savePlayerStateDurable` and AutosaveCoordinator). Concurrent drains
could write a newer player-state snapshot first; the slower stale write then
**clobbered** IndexedDB. Enchant apply also left inventory components only in
memory until the next autosave/pagehide. **Real players were affected**:
closing a tab soon after enchanting could lose enchantments (XP/lapis already
spent in a later or partial write race). Codec round-trip itself was already
correct.

**Affected components (same player-state path):** `enchantments`, `damage`,
`potion_contents`, `can_destroy`, `can_place_on`.

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Concurrent drains cannot clobber newer player-state | `DirtySaveQueue` mutex+epoch; unit concurrent latest-wins | PASS |
| Stack components survive snapshot/restore | `InventoryComponentPersistence` all default types | PASS |
| Enchant apply enqueues durable player state | `Game.applyEnchantingOffer` → `savePlayerStateDurable` | PASS |
| E2E reload integrity with real flush signal | `enchanting.spec.ts` awaits `persistence.flush` + pendingCount 0 | PASS |
| Before/after failure rates recorded | before **3/20 fail**; after **0/20 fail** | PASS |
| No 258 GPU/FPS; no storage redesign | scope + gates | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| Pre-fix concurrent drain unit | FAIL expected | last durable was stale `v1` |
| `npx vitest run tests/unit/DirtySaveQueue.test.ts` | PASS 11/11 | concurrent latest-wins |
| `npx vitest run tests/unit/InventoryComponentPersistence.test.ts` | PASS | all default components |
| Enchanting `--repeat-each=20` on unfixed `e1ecc81` | **3 failed / 17 passed** | before 15% |
| Enchanting `--repeat-each=20` post-fix | **20 passed / 0 failed** | after 0% |
| `npm run typecheck` | PASS | |
| `npm run lint` | PASS | 0 errors / 85 warnings |
| `npm test` | PASS | 459 files, 5446 passed + 1 skipped |
| `npm run build` | PASS | 257 modules |
| `npm run test:e2e` | PASS with documented variance | 121 scheduled; **120 passed**; 1 known non-blocking visual |
| file-audit | PASS | 2949 rows |
| `npm run validate-state` | PASS | |

## Edge/adversarial validation

Concurrent drains; superseded epoch skip; failed write preserves newer mark;
malformed component reject unchanged; apply with null persistence no-op.

## Migration/compatibility validation

No schema bump. Legacy snapshots without `slotComponents` unchanged.

## Performance/resource validation

Drain mutex only; bounded by existing FLUSH_MAX_ROUNDS.

## Regressions

Change 258 remains BLOCKED. Changes 259–288 remain VERIFIED. Enchanting:227
green in full suite and 20/20 repeats.

## E2E variance (non-blocking)

- `visual-regression.spec.ts:176` — Linux SwiftShader golden drift **31 fail / 29 pass** (band **0.020–0.062**). Baseline-equivalent class vs 288 (**28/32**, band 0.022–0.062). Not a persistence HUD regression.

## Incomplete tasks

None — T1–T12 complete.

## Advancement Exception

Not used. Target 100% achieved.

## Final decision

**VERIFIED 12/12 (100%)** — C289 exact; 258 BLOCKED; publish to origin/main authorized.
