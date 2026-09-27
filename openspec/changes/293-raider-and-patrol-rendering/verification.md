# Verification: 293-raider-and-patrol-rendering

Status: VERIFIED
Completion: 100% (10/10)
Advancement allowed: true

Base: `origin/main` `cef8f32` (292 VERIFIED). Worktree
`/workspace/mc-worktrees/293`, branch `wt/293-raider-and-patrol-rendering`.
Package commit `9620fb1` precedes all implementation.

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| Projection | `tests/unit/RaiderRenderer.test.ts` › raider projection: kind mapping (zombie/pig → null), `raid:`/`patrol:` namespacing with colliding ids, spec scenario raid:1 vindicator + patrol:1 captain, zombie ⇒ skipped 1, REMOVED/NaN/∞ skipped (4). E2E `raider-rendering.spec.ts`: projected `expected` keys = `raid:<getRaidWaveEntityIds>` ∪ `patrol:<memberIds>`, exactly one captain = `patrol:<captainId>`. | PASS |
| Sync add/update/remove | Unit: add 4 kinds; same-object update (position/rotation), rebuild on kind/captain change (old group detached), removal of absent keys, empty ⇒ 0; duplicate key first-wins. E2E: meshes = expected after add, kill, raid replacement and each wave clear. | PASS |
| Distinct silhouettes and captain marker | Unit: part counts pillager 6 / vindicator 6 / witch 7 / ravager 8; 4 distinct colour sets; ravager bbox width > 1 and wider/deeper/larger volume than every illager; captain = pillager + 2 with banner `0xefefef` child at z < 0 (back), plain pillager has none. E2E: childCount = parts (+2 captain) per kind; one captain. | PASS |
| Facing | Unit: stored yaw 1.25 rad ⇒ 1.25; velocity (1,0,0) ⇒ π/2; (0,−2) ⇒ π; below 0.01 ⇒ stored yaw; NaN ⇒ 0; group `rotation.y` equals projected facing. E2E: every mesh `rotationY` ≈ projected facing (radian spawn yaw toward raid center / patrol random yaw). | PASS |
| Removal and disposal without leaks | Unit: 200 syncs over 0–30 entities of all kinds keep `resourceCounts()` = {14 geometries, 12 materials}; dispose empties the scene and fires `dispose` exactly once on all 26 shared resources; double dispose and sync-after-dispose are no-ops. E2E: killed raider removed; `debugStartRaid` dismisses the patrol ⇒ patrol groups gone; clear to VICTORY ⇒ 0 groups; `dispose()` with a live patrol ⇒ 0 meshes/0 scene groups. Game source guard: renderer constructed + `resources.track`ed. | PASS |
| Scene isolation | Unit source guard: module has no Light/Fog/background/atlas/camera/Texture references; `sync` body never allocates geometry/material; Game syncs once per frame in `render()` before `renderer.render()` from both managers (overworld) + captain id. E2E fresh world ⇒ 0 raider groups. Visual matrix (no raiders) keeps the same 30 fail / 30 pass cell split as 292 (no status change in any cell). | PASS |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| npm run typecheck | PASS | `tsc --noEmit` exit 0 |
| npm run lint | PASS | 0 errors / 85 warnings (unchanged baseline) |
| npm test | PASS | 466 files, 5565 passed + 1 skipped (292: 465 / 5546+1; +19 RaiderRenderer tests) |
| npm run build | PASS | 261 modules transformed |
| npx playwright test tests/e2e/raider-rendering.spec.ts | PASS ×3 isolated (≈19 s each) | screenshot sanity visible-vs-hidden 0.0211 vs hidden-vs-hidden 0.0000 every run (non-golden) |
| npm run test:e2e | 127 passed / 1 failed (128) in 32.4 min | only failure visual:176 (below); raider-rendering 7.6 s; enchanting:227 and :337 green |
| file-audit | PASS | 2988 rows (+9) |
| npm run validate-state | PASS | |

## visual:176 SwiftShader drift (documented, not hidden)
`tests/e2e/visual-regression.spec.ts:176` fails on Linux headless SwiftShader
with the same class as 291/292: 30 fail / 30 pass of 60 cells, fail band
0.0203–0.0619 changed fraction, max pass 0.0187. Cell-by-cell comparison with
the 292 run: **0 status changes** (identical failing set); max per-cell
fraction delta 0.0138 (run-to-run variance). The matrix renders fresh seed-1337
worlds without raids/patrols, so the renderer adds no scene children there.
Goldens untouched. Change 258 (headed GPU evidence) stays BLOCKED.

## Divergences (documented)
- No walk/attack animation, textures or skins; static box silhouettes.
- Facing is derived from velocity or spawn yaw; simulation still never
  rewrites raider yaw (unchanged by design).
- Captain marker is a banner-coloured panel on the back, not a patterned
  ominous banner texture.
