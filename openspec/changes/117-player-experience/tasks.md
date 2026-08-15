# Tasks: 117-player-experience

Status: VERIFIED
Completion: 100%

## 1. Data model — experience system

- [x] **1.1** Create `src/player/ExperienceSystem.ts` with `ExperienceSnapshot`
      (`{ version: 1, level, xp }`), `computeXpToNext(level)`, `ExperienceSystem`
      (`addXp`, `snapshot`, `restore`, plus a derived `progress`), per `design.md`.
- [x] **1.2** Typecheck-only: confirm `ExperienceSystem` and `computeXpToNext`
      compile and the curve boundaries match `spec.md` (`7/9/37`, `42/47`, `112/121`).

## 2. XP orb entity + manager

- [x] **2.1** Create `src/world/XpOrb.ts` with `XP_ORB_TYPE_KEY = 'minecraft:xp_orb'`,
      the `XpOrb` interface, and a strict `createXpOrb` constructor (positive-integer
      `value`, non-negative `id`, finite coords/velocity, non-negative `ageTicks`).
- [x] **2.2** Create `src/simulation/XpOrbManager.ts` mirroring `ItemEntityManager`:
      deterministic id minting, `spawnXpOrb`, `tickItemEntities(dt, px, py, pz,
      experience)` (age, attraction-with-cap, collect, despawn), `getXpOrbs`,
      `clear`, and 037 `serializeAll`/`deserializeAll` with `minecraft:xp_orb`.
- [x] **2.3** Unit tests in `tests/unit/ExperienceSystem.test.ts`: `computeXpToNext`
      boundaries; `addXp` single/multi-level + bad-input no-op; `snapshot` round-trip;
      `restore` rejects wrong version / negative xp / non-integer level.
- [x] **2.4** Unit tests in `tests/unit/XpOrbManager.test.ts`: spawn/minting +
      non-positive value rejected; `tickItemEntities` collects-close / ignores-distant
      / attracts-mid (capped, no overshoot) / despawns-expired; `serializeAll`/
      `deserializeAll` round-trip exactly and reject one bad record atomically.

## 3. Game wiring + persistence

- [x] **3.1** In `src/engine/Game.ts`: construct `this.experience = new
      ExperienceSystem()` and `this.xpOrbs = new XpOrbManager()`; tick orbs in the
      simulation block (after `itemEntities` collect); add `experience` to
      `GameSaveSnapshot`; write it in `savePlayerState`; `restore` it in
      `loadPlayerState`; require it in `isGameSaveSnapshot`.
- [x] **3.2** In `src/storage/PlayerStateRecord.ts`: add `experience: unknown`;
      require it (non-`undefined`) in `validatePlayerStateRecord`.
- [x] **3.3** In `src/player/PlayerInteraction.ts`: accept optional `xpOrbs?` and
      `xpOrbValue?`; on a productive break, spawn one orb of `xpOrbValue` at the
      block-center spawn; `Game` passes its manager + `CONFIG.xp.orbValue`.
- [x] **3.4** In `src/config/index.ts`: add a frozen `xp` block
      (`orbAttractionRadius`, `orbCollectRadius`, `orbAttractionSpeed`,
      `orbDespawnTicks`, `orbValue`, `orbSpawnUpVelocity`).
- [x] **3.5** Extend `tests/unit/PlayerStateRecord.test.ts` (experience field
      required) and the `Game` persistence test (experience round-trip; missing
      `experience` rejected by `isGameSaveSnapshot`); extend
      `tests/unit/PlayerInteraction.test.ts` (productive break spawns one orb; none
      supplied spawns nothing). Existing tests stay green.

## 4. Full regression gate

- [x] **4.1** `npm run typecheck` — PASS.
- [x] **4.2** `npm run lint` — PASS.
- [x] **4.3** `npm test` — PASS (new ExperienceSystem + XpOrbManager + extended
      persistence/interaction suites).
- [x] **4.4** `npm run build` — PASS.
- [x] **4.5** `npm run test:e2e` — PASS.

## 5. Documentation / state

- [x] **5.1** Update `openspec/changes/117-player-experience/verification.md` with
      real command output and per-requirement evidence.
- [x] **5.2** Advance `PROGRAM_STATE.json`/`.md`: currentChange = `117-player-experience`
      VERIFIED, nextChange = `118-enchantment-registry` (or the next sequence entry);
      record completion %, validations, Git HEAD.

## 6. Commit + publish

- [x] **6.1** Commit implementation (impl) and update state (state-bump) as two
      commits; `git push origin HEAD:main`; confirm remote `main` == local HEAD.
