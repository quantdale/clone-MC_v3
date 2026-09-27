# Proposal: 292-player-status-effect-persistence

## Problem

The raid loop (282–291) now has an organic entry (patrol captain → Bad Omen,
291) and a reward (VICTORY → Hero of the Village, 290), but neither survives a
reload. `Game.playerEffects` (StatusEffectManager) is never written to the
player-state record, and `Game.badOmen` is a level-only, never-expiring,
Game-owned value that is explicitly ephemeral (285). Closing the tab, a
pagehide, or a reload silently wipes Hero of the Village (and its trading
discount) and any captain-granted Bad Omen. The 290/291 reload E2E tests
currently *assert* that reset.

## Goals

- Persist the player's active status effects — every registered effect,
  including **Hero of the Village with its amplifier and remaining duration** —
  and **Bad Omen level + remaining duration** inside the existing per-world
  player-state record.
- Give Bad Omen a vanilla-like finite duration (**6000 s = 100 min**, i.e.
  120000 ticks at 20 TPS); grant/stack refreshes it; expiry clears the level.
- Save through the 289 durable path (`savePlayerStateDurable()` →
  DirtySaveQueue + `flush`) on pagehide/dispose and on the gameplay events that
  change effects or omen (HOTV grant, omen grant/clear, omen consumption at raid
  start, respawn), plus the existing 5 s periodic autosave.
- **Resume, never reset:** restore the stored remaining duration exactly
  (clamped to registry bounds); a reload can never refresh an effect to full or
  re-grant HOTV (no farming).
- **Backward compatibility:** player-state records without the field (all
  pre-292 saves) load as no effects and omen 0; malformed payloads fail closed
  to the same result without breaking boot.
- Spec and prove the interplay with the 285 omen-in-village trigger and the 291
  raid-start patrol removal when omen is restored after reload (vanilla: a
  restored omen inside a village starts a raid on the next tick).
- Unit tests (codec round trip, resume, cap/clamp, backward compat, malformed
  input, omen duration, record passthrough); update the 285/290/291 reload E2E
  assertions; new E2E proving HOTV and Bad Omen survive reload.

## Non-goals

- No new IndexedDB object store, namespace, schema version or migration; the
  field rides inside the existing `player-state` record.
- No status-effect HUD/icons, no potion/beacon mechanics, no change to effect
  stacking rules or registry values other than using them as clamps.
- No change to the 290 HOTV grant predicate, discount math or duration table.
- No change to the 285 trigger rule itself (it still replaces a prior raid, as
  in 285); no raid-level escalation from omen during an ACTIVE raid.
- No change to death semantics: respawn still clears `playerEffects` and still
  keeps Bad Omen (pre-existing 285 behavior; documented divergence).
- No patrol persistence (patrols stay transient per 291); no rendering.
- No GPU/FPS work; Change 258 stays BLOCKED; no fake evidence; no goldens.

## Preconditions

- Changes 282–291 VERIFIED and published; `origin/main` = `e024126`.
- 289 durable path: `Game.savePlayerStateDurable()`, `GamePersistence
  .savePlayerState` (dedup key `player-state|<worldId>`), `flush()`.
- `StatusEffectManager.serialize/add/tick/clear` and the default registry
  (HOTV max duration 96000 s, max amplifier 4).
- `BadOmenRules` (285, cap 5), `resolveVillageRaidTrigger`,
  `Game.evaluateBadOmenVillageTrigger`, `startRaidAt` (291 patrol clear),
  raid persistence `saveRaid()` (283).

## Dependencies

- `src/storage/PlayerStateRecord.ts`, `src/storage/GamePersistence.ts`
- `src/data/StatusEffect.ts`, `src/data/StatusEffectManager.ts`
- `src/simulation/BadOmenRules.ts`
- `src/engine/Game.ts`

## Proposed change

1. Author this package; CHANGE_SEQUENCE row + overrides addendum; 292 sole
   ACTIVE.
2. New pure codec `src/simulation/PlayerEffectsPersistence.ts`
   (`serializePlayerEffects`, `parsePlayerEffects`, Bad Omen duration helpers).
3. Optional `effects` field on `PlayerStateRecord` / `GamePlayerSnapshot`,
   passed through validation and record↔snapshot conversion.
4. Game: include the payload in `buildPlayerSnapshot`, restore it in
   `applyInitialPlayerState`, tick omen duration in the fixed tick, durable
   saves on effect/omen events, dispose ordering fix so the final save carries
   the live omen, debug seams.
5. Unit + browser E2E (new spec + updated 285/290/291 reload assertions); full
   gates; VERIFIED 100%; publish.

## Compatibility and migration

Additive optional field. Old records → no effects/omen 0. Old code reading a
new record ignores the unknown field (the validator rebuilds known fields).
World backup export/import carries the field through the same validator.
Behavior changes: HOTV and Bad Omen now survive reload; Bad Omen now expires
after 6000 s of unpaused play.

## Risks

- Reload farming (refresh to full / re-grant) → exact remaining duration is
  stored; HOTV predicate unchanged (hydrate is not a VICTORY transition);
  omen consumption and raid start are saved in the same durable flush.
- Crash without pagehide → at most one autosave interval (5 s) of duration is
  replayed; event saves bound the discrete cases.
- Corrupt payload blocking boot → tolerant parser never throws.
- Dispose writes omen 0 → reset moved after the final durable save.
- Restored omen replacing a restored ACTIVE raid → identical to live 285
  behavior (documented); raid start clears patrols without granting omen.

## Rollback strategy

Revert the 292 commits. Records written by 292 keep an `effects` field that
the pre-292 validator ignores, so rollback needs no data repair.

## Definition of Done

- Package passes the SPEC_AUTHORING_PROTOCOL quality gate.
- Implementation + unit + E2E green; full baseline gates green (visual:176
  SwiftShader drift documented, goldens untouched; enchanting:227 green).
- C292 exact; VERIFIED 100%; published to `origin/main` by fast-forward;
  258 still BLOCKED.

## Advancement gate

Target 100% task completion with all mandatory requirements and tests passing.
Absolute floor 90% only via explicit Advancement Exception (not planned).
