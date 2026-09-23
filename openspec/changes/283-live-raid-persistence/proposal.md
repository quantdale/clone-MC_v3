# Proposal: 283-live-raid-persistence

## Problem

Change 282 makes raid state visible through an ephemeral Game-owned feedback bar, but the
state still dies on page reload: there is no world-scoped persistence record, no archive
passthrough, and no reset hygiene for raids. A player (or a browser test) that reloads mid-raid
loses wave progress, remaining-raider counts, center, omen level, and elapsed ticks with no
recovery path. The repository already has a proven raw-metadata namespace pattern
(`__weather__`, `__trades__`, `__statistics__`, …) that 282 deliberately left unused.

## Goals

1. Persist the live `RaidState` across reload through a dedicated world-scoped
   `__raid__:<worldId>` namespace over the verified `RaidStateMachine` codec
   (`serializeRaid` / `deserializeRaid`), following the 265–278 raw-metadata precedent.
2. Fail closed on invalid, stale, or duplicate payloads: runtime boot degrades to `null`
   (no partial raid), and archive import rejects malformed `raidData` before the first write.
3. Wire hydration, save (autosave / dispose / pagehide), reset delete, and archive
   export/import passthrough through `GamePersistence` / `WorldArchive` / `WorldArchiver`.
4. Prove reload round-trips with unit and browser evidence: start → reload → same wave and
   counters; absent/corrupt → null; reset → record gone; export/import carries the record.
5. Keep Change 282's ephemeral feedback contract intact: the HUD bar and projection continue
   to derive from `getRaidState()`; persistence only extends the store behind that seam.

## Non-goals

- No pillager/vindicator/ravager/witch entity registration, raider spawning, settlement
  detection, or bad-omen acquisition (still out of scope after 282).
- No Change 258 headed FPS/GPU work, fake GPU evidence, or 258 status change (258 stays
  BLOCKED).
- No multiplayer/server-owned raid authority (222–237 boundary).
- No redesign of `RaidStateMachine` transitions, `RaidFeedbackView`, or the 282 HUD contract.
- Spec/implementation timing: the package was authored SPEC-FIRST before activation; after
  T1 activated the change on `origin/main` (282 VERIFIED), production edits are authorized
  only through tasks T3–T13.

## Preconditions

- Change 152 `RaidStateMachine` VERIFIED (immutable transitions + strict `schemaVersion: 1`
  codec; `deserializeRaid` already throws on malformed input).
- Change 282 `282-live-raid-feedback` VERIFIED on `origin/main` (Game owns one ephemeral
  `RaidState`, fixed-tick progression, `#raid-feedback` bar, `getRaidState()` seam). This
  change MUST NOT be activated while 282 is still ACTIVE. **Satisfied at T1 activation
  (sessionStartHead `a463e0fe8571576fc10a5bda49dead34b0eac61a`).**
- Changes 265–278 raw-metadata persistence pattern (put/get, degrade, reset snapshot/restore,
  optional archive field with pre-write validation) is the template.
- Change 258 remains BLOCKED; Changes 259–281 remain VERIFIED unless a later change reopens
  them for a proven regression.

## Dependencies

- `src/simulation/RaidStateMachine.ts` — `serializeRaid`, `deserializeRaid`,
  `RAID_RECORD_VERSION` (consumed, not modified).
- `src/engine/Game.ts` — existing raid field, `getRaidState()`, debug seams, autosave/
  dispose/pagehide save points (extended, not replaced).
- `src/storage/WorldMetadataRepository.ts`, `GamePersistence.ts`, `WorldArchive.ts`,
  `WorldArchiver.ts` — one additive namespace following `__weather__`/`__trades__`.
- Change 282 package (`openspec/changes/282-live-raid-feedback/`) — feedback lifecycle remains
  the presentation authority.

## Proposed change

1. **Namespace**: `WorldMetadataRepository.putRaidData` / `getRaidData` over
   `__raid__:<worldId>` (raw put/get, weather precedent).
2. **Codec seam**: a small pure module (e.g. `RaidPersistence`) that validates an untrusted
   payload via `deserializeRaid` and returns `RaidState | null`; runtime never throws for
   corrupt payloads (degrade to `null`); archive boundary re-validates and throws pre-write.
3. **GamePersistence**: `initialRaidValue` bulk-load on open (corrupt ⇒ `null`), `saveRaid`,
   reset snapshot/restore/delete for the `__raid__` key.
4. **Game wiring**: boot hydration into the existing `raidState` field; `saveRaid()` at
   autosave, dispose, and pagehide; reset deletes the record; dispose still hides the bar.
5. **Archive**: optional `raidData` field on `WorldArchive` + `WorldArchiver` export/import
   with `raidDataImported` report flag; absent ⇒ `null`; malformed ⇒ pre-write throw.
6. **Tests**: codec unit (round-trip, every rejection class, absent⇒null, stale version),
   Game composition unit (hydrate/save/reset/archive/guards), browser E2E
   (start → reload preserves wave → reset deletes → export/import round-trip).

## Compatibility and migration

- Additive only: new `__raid__` record and optional `raidData` archive field. Worlds without
  the record boot with `raidState === null` (pre-283 behavior preserved).
- Older builds ignore `__raid__` (unknown namespaced raw key, never parsed).
- Fail-closed migration: a present-but-malformed `raidData` in an archive MUST reject the
  import before any store write; a corrupt runtime payload MUST degrade to `null` without
  writing a partial state back.
- No registry ids, signatures, or chunk/entity schemas change.

## Risks

- Hydrating an `ACTIVE` raid with no raider entities could resurrect a misleading HUD bar on
  a world that had no visible combat: mitigate by restoring state exactly as persisted and
  keeping 282's projection contract; no entity claim is made.
- Double-save races at dispose + pagehide: both paths call the same idempotent `saveRaid`
  guard (no persistence ⇒ no-op, recovery-required ⇒ no-op), last write wins on one key.
- Archive field drift: `raidData` is optional and validated through `deserializeRaid` before
  write, matching the trading/weather fail-closed precedent.
- Scope creep into spawning: every task and non-goal explicitly forbids entity registration.

## Rollback strategy

Revert the 283 implementation commits together. The `__raid__` record is inert without this
code (unknown raw key); no data repair is required because no other store depends on it.

## Definition of Done

- The complete OpenSpec package (this proposal, design, tasks, verification, and
  `specs/live-raid-persistence/spec.md`) passes the SPEC_AUTHORING_PROTOCOL quality gate
  before any production edit.
- All MUST/SHALL requirements have at least one scenario covering invalid, duplicate, stale,
  reload, and failure behavior.
- Tasks cover implementation, unit tests, integration/browser tests, edge/failure cases,
  regression, documentation/state, and the final gate — sequenced but unchecked until
  implementation begins after 282 is VERIFIED.
- `OVERRIDE_DRAFT.md` holds the `CHANGE_SEQUENCE_OVERRIDES` ADDENDUM snippet without editing
  the live overrides file from this branch.
- Verification maps every requirement to a command/test and starts at NOT VERIFIED / 0%.

## Advancement gate

Advance only after 282 is VERIFIED, this package is activated on `origin/main`, all tasks
are checked with evidence, every MUST/SHALL requirement passes, and the baseline gates
(`typecheck`, `lint`, `test`, `build`, `test:e2e`, file-audit, `validate-state`) are green.
No advancement exception is planned; the target is 100%. Change 258 remains BLOCKED.
