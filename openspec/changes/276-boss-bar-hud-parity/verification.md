# Verification: 276-boss-bar-hud-parity

Status: VERIFIED
Progress: 6/6 (100%)

## Gates
- typecheck: PASS
- lint: 0 errors
- unit: WitherBossBarParity 3/3 + full suite green after file-audit rows (432 files)
- build: PASS (~2.36s)
- e2e split: `tests/e2e/boss-bar.spec.ts` 1/1 (spawn visible → damage shrinks → defeat hides)
- validate-state: PASS
- file-audit: PASS (2821 rows)

## Evidence
- `src/ui/WitherBossBarParity.ts` — BossFramework `bossBarSnapshot` + HudParity `projectHud` for wither bars; SPAWNING uses charge-aware `bossBarProgress`.
- `src/engine/Game.ts` — `#wither-boss-bar` updated via `syncWitherBossBarHud` / `projectWitherBossBars`; debug spawn/activate seams for E2E.
- Unit + E2E as above.
- 258 stays BLOCKED; 259–275 untouched.

VERIFIED.
