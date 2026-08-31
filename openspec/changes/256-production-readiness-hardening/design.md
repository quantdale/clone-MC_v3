# Design: 256-production-readiness-hardening

## Context/current state

Program COMPLETE through 255. `src/` contains 334 TypeScript files (~77k LOC), 377 unit test files (4559+1 tests), build produces 195 modules. Gates are green at `4c7d2a4` (6 ahead of `origin/main` `54d4ea0`). Publication to `origin/main` is BLOCKED on missing `GITHUB_TOKEN`/`gh auth` — not a code defect.

`src/engine/Game.ts` (2622 LOC) owns `World`, `Player`, `PlayerController`, `PlayerPhysics`, `PlayerInteraction`, `LiveBlockEntityHost`, wither boss state, `FurnacePanel`, input wiring, and fixed-tick `runFixedTick` pipeline. Current hardening debt (non-blocking):

- Inline CSS string for `#wither-boss-bar` (lines ~597-601) — should live in `src/styles.css`.
- `void message;` noise in `onQuarantined` (line ~570).
- `void this.selfOpenPromise.then(...)` floating promises without `.catch`.
- Duplicated headless check `navigator.webdriver` in `runtimeRenderDistance()` and `runtimeSimulationDistance()`.
- Magic literals: `9999` (player entity id), `50` (wither XP), `40` (wither periodic damage), `12` (skull cap), `10` (melee cooldown), `1500` (toast), `0.5` (FPS interval).
- Double cast `(this.persistenceImpl as unknown as { initialWithers: unknown[] })`.
- `as unknown as import('../world/CollisionResolver').ShapeWorld` (type mismatch — should be `getCollisionShape`).

## Target state

- Cleanup: orphan-check 0 real orphans; file-audit 0 unclassified; greps for `TODO`, `as any`, `@ts-ignore` clean.
- Refactoring: `isHeadlessSession()` helper; wither constants extracted; boss-bar construction uses CSS classes; double casts replaced.
- Hardening: every floating `Promise` has `.catch`; every `getElementById` via `requireElement`; `ShapeWorld` adapter correctly implements `getCollisionShape`.
- Production ready: gates PASS, file-audit PASS, validate-state PASS.

## Invariants

- Deterministic `runFixedTick` order preserved.
- Generation seed/version and save-record shape unchanged.
- No `src/` edit without a task checkbox.

## API and data model

No public API added. Internal hardenings:

```ts
const WITHER_XP_REWARD = 50;
const WITHER_SKULL_CAP = 12;
const WITHER_MELEE_COOLDOWN_TICKS = 10;
const WITHER_EFFECT_PERIOD_TICKS = 40;
const TOAST_DURATION_MS = 1500;
const FPS_SAMPLE_INTERVAL_S = 0.5;
const WITHER_TARGET_PLAYER_ID = 9999;
function isHeadlessSession(): boolean { return typeof navigator !== 'undefined' && (navigator as { webdriver?: boolean }).webdriver === true; }
```

Boss-bar CSS in `src/styles.css`:

```css
#wither-boss-bar { position:absolute; top:40px; left:50%; transform:translateX(-50%); width:300px; height:14px; background:#222; border:1px solid #555; display:none; z-index:5; }
#wither-boss-bar.visible { display:block; }
#wither-boss-bar-fill { height:100%; width:50%; background:#555; }
```

## Control/data flow

- `Game` construction: typed `initialWithers` read via `GamePersistence` accessor with `?? []` fallback.
- `Game.update()` → `tickDriver.advance()` → `runFixedTick()` unchanged.
- `tickWithers` skull stepping uses correct `ShapeWorld` adapter.

## Detailed behavior

Audit step runs `validate-state`, `orphan-check`, file-audit, and greps to produce triaged list. Each hardening slice is applied as separate edit with `npm run typecheck` after it.

## Failure modes

Construction failure still shows `showFatalError` or degraded banner. Worker loss still falls back to sync. Storage quota still `degraded`/`failed` banner.

## Compatibility/migration

No migration. Existing saves load identically.

## Performance/resource constraints

Hot path `runFixedTick` must not add per-tick allocations; constants are module-level. Bundle stays at 195 modules.

## Testing seams

Existing seams reused. No new harness needed.

## Affected files/symbols

- `src/engine/Game.ts` — constants, `isHeadlessSession`, boss-bar, `void` cleanup, `hydrateWithers`, `tickWithers`, `syncWitherPresentation`.
- `src/styles.css` — `#wither-boss-bar`, `#wither-boss-bar-fill`.
- `src/main.ts` — bootstrap catch comment.
- `src/storage/GamePersistence.ts` — JSDoc (no storage change).
- `openspec/changes/256-production-readiness-hardening/*`, `openspec/CHANGE_SEQUENCE.md`, `openspec/PROGRAM_STATE.json`, `openspec/PROGRAM_STATE.md`.

## Rejected alternatives

- Global sweep without active change — rejected: violates Scope Discipline.
- New feature under 256 — rejected: non-goal.
- Save-format bump — rejected: already versioned.

## Downstream dependencies

Future changes inherit cleaner surface. No downstream change blocked by 256.
