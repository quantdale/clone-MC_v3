# Verification: 292-player-status-effect-persistence

Status: VERIFIED
Completion: 100% (11/11)
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Payload serialization | `PlayerEffectsPersistence.test.ts` exact HOTV+omen payload, empty payload, omission of expired/NaN/negative entries, 64-entry write cap, JSON-safe; Game source guard: `buildPlayerSnapshot` writes `effects: serializePlayerEffects(playerEffects.serialize(), {level, badOmenRemainingSeconds})`; `GamePersistence.test.ts` IndexedDB round trip returns the identical payload | PASS |
| Resume on restore | unit: live manager round trip exact (2299.75 s, amp 1), 1234.25 s resumes (not 2400) and ticks to 1200, 10 save/load cycles never lengthen (500→430 / 300→230); Live oracle: 100 s aged HOTV/omen restore exactly, hydrated VICTORY never re-grants; e2e `status-effect-persistence` test 1: HOTV III (amp 2) + omen 2 aged 100 s via `debugTickStatusEffects` survive pagehide+reload with duration ≤ pre-reload and within 120 s, heroCount 1, raid VICTORY; `hero-of-the-village` reload: amp 1 preserved, duration ≤ before (no double grant/refresh) | PASS |
| Caps and clamps | unit: HOTV 999999/amp 9 → 96000/4; omen 9/999999 → 5/6000; floors fractional amplifier/level; six level-0/remaining-0/NaN/∞ omen cases → {0,0}; 80-type synthetic registry → 64 kept, 16 dropped | PASS |
| Backward compatibility and fail-closed parsing | unit: undefined/null → `absent`; 8 malformed/wrong-version inputs → `invalid`, nothing restored, no throw; mixed entries keep HOTV+speed, dropped 7 (unknown id, NaN, 0 duration, null, string, bad id, duplicate); malformed badOmen keeps effects; parsed output always deserializes; `PlayerStateRecord.test.ts` passthrough + pre-292 record `toStrictEqual` without `effects` key + opaque payload not validated; `GamePersistence.test.ts` pre-292 snapshot reloads with no `effects` key; e2e fresh world: no effects, omen 0 | PASS |
| Bad Omen duration | unit: 6000 s constant, refresh on grant (also level 5), tick/expiry, non-finite dt no-op, 120000 ± 1 ticks at 1/20 s expire; Live oracle: expiry is durable (reload after expiry → 0), valid grants refresh, invalid amounts (0, −1, 0.5, NaN) no-op with no save; Game guard: fixed tick runs `tickBadOmenDuration(dt)` beside `playerEffects.tick(dt)` | PASS |
| Durable save points | Game source guards: pagehide `savePlayerStateDurable`; dispose resets omen only after the final durable save; trigger order startRaidAt → clear → saveRaid → savePlayerStateDurable; HOTV grant → saveRaid + savePlayerStateDurable; grant/clear/expiry/respawn/HOTV debug clear save durably; e2e pagehide (no dispose) + flush + reload restores both; `pillager-patrol` reload keeps captain omen 1 | PASS |
| Restored omen triggers raids like live omen | Live oracle: restored omen + village → one fixed tick → ACTIVE raid omen 1, patrol dismissed, omen 0; crash reload → omen 0 + ACTIVE raid, NO_OMEN; outside/not-inside village retains omen over 100 ticks; e2e test 2: restored omen 1 (0 < remaining ≤ 6000, raid null), forced live patrol, fixture village; paused session keeps omen 1 for 1 s; trigger step → START_RAID level 1, omen 0, remaining 0, raid ACTIVE, patrol empty/captain null; another pagehide+reload → omen 0, raid ACTIVE level 1 | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| npx vitest run tests/unit/PlayerEffectsPersistence.test.ts tests/unit/LiveStatusEffectPersistence.test.ts tests/unit/PlayerStateRecord.test.ts tests/unit/GamePersistence.test.ts | PASS | 23 + 14 + 30 (record + facade incl. 5 new) |
| npx playwright test tests/e2e/status-effect-persistence.spec.ts --repeat-each 3 | PASS | 6/6 |
| npx playwright test (status-effect, hero-of-the-village, pillager-patrol, bad-omen-acquisition) | PASS | 8/8 after the paused-session fix to the restored-omen test |
| npm run typecheck | PASS | clean |
| npm run lint | PASS | 0 errors / 85 warnings (pre-existing count, unchanged) |
| npm test | PASS | 465 files, 5546 passed + 1 skipped (+42 vs 291's 5504) |
| npm run build | PASS | 260 modules |
| npm run test:e2e | PASS* | 126 passed / 1 failed (visual:176 only) of 127; status-effect-persistence 2/2; hero-of-the-village 2/2; pillager-patrol 2/2; bad-omen-acquisition 2/2; enchanting:227 green |
| node scripts/validate-file-audit.mjs …/file-audit-manifest.json | PASS | 2979 rows (+10) |
| npm run validate-state | PASS | |

\* Visual matrix Linux SwiftShader drift: **30 fail / 30 pass**, fail band
**0.022–0.062** (max pass 0.0187) — the same class as 291 (30/30, 0.022–0.062)
and the owner-noted band (~28–32 of 60 in 0.02–0.062). 292 changes no
rendering; capture worlds are fresh (no stored effects). Non-blocking; goldens
untouched; no 258 headed work. An earlier full run (09:10 PT) was lost to a box
tool outage at 112/127 with no failures; the counted run is the 10:44 PT rerun.

## Edge/adversarial validation

Corrupt/foreign/wrong-version payloads, unregistered ids, duplicates, NaN/∞,
negative values, over-cap values, >64 entries, level/remaining mismatch,
expiry at the boundary, invalid grant amounts, paused session, crash-without-
pagehide after raid start — covered by unit and/or e2e.

## Migration/compatibility validation

Optional record field; no schema/namespace change; pre-292 records validate
unchanged (strict equality) and restore as no effects; old code ignores the
field; world archive and codecs pass it through `validatePlayerStateRecord`.

## Performance/resource validation

≤ 64 small entries per record; O(1) omen tick; durable saves only on rare
events (grant/consume/expiry/respawn/HOTV); autosave cadence unchanged.
