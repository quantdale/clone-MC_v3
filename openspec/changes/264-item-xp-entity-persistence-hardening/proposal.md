# Proposal: 264-item-xp-entity-persistence-hardening

## Problem

Certification risk R-4 (risk register 2026-08-23) names two under-validated
batch deserializers: `ItemEntityManager.deserializeAll` and
`XpOrbManager.deserializeAll` silently accept duplicate ids (the second record
overwrites the first in the id map while the order list keeps both, so one
entity reads back twice), and the item path additionally accepts negative ids,
unknown registry item ids, and counts above the item's `stackSize` — states no
live writer can ever produce. The advancement half of R-4 was closed by Change
263 (catalog-aware `deserializeAdvancementSave`); the entity-manager half
remains open.

Separately, the live `Game` owns an `ItemEntityManager` and an `XpOrbManager`
that exist only in memory: drops and XP orbs never reach any durable store, so
a page refresh loses every uncollected drop and orb. The 037 `entities` store
and the 131 `EntityManager` chunk bridge do not cover these two managers
(world-scoped `serializeAll`/`deserializeAll`, not chunk-grouped).

## Goals

- Harden both `deserializeAll` paths to fail closed: duplicate ids, negative
  ids, unknown item ids, out-of-range counts/values, non-finite coordinates,
  and foreign `typeKey`s throw a deterministic `Error` with the manager
  unchanged (atomic, 111/117 convention).
- Persist live item entities + XP orbs world-scoped through `GamePersistence`
  (`__itementities__` / `__xporbs__` raw metadata records, 261–263 precedent)
  so drops/orbs survive chunk unload/reload (by construction: world-scoped
  managers no unload path evicts) and page refresh (durable records).
- Boot/hydrate through the hardened deserializer with degrade-to-empty
  quarantine (recorded error + save-health banner, never a boot crash).
- Prove with unit tests (duplicates, malformed classes, atomicity,
  round-trip, facade save→reopen, corrupt quarantine) plus browser E2E
  (drop + orb persist across reload; removal persists).
- Close R-4 fully when both halves are done.

## Non-goals

- Migrating any entity type onto a new ECS or onto the per-chunk 037
  `entities` store (explicit 129/131 non-goal direction; these managers stay
  world-scoped).
- Multiplayer replication of drops/orbs.
- Item/XP physics, pickup tuning, or despawn tuning (112/117 behavior
  unchanged).
- Headed FPS work (258 stays BLOCKED; no GPU evidence touched).

## Preconditions

- 263 VERIFIED (15/15); 259/260/261/262 VERIFIED; 258 BLOCKED 40/100.
- `ItemEntityManager` (111), `XpOrbManager` (117), 037 envelope
  (`validateSerializedEntity`), `GamePersistence` raw-record precedent
  (261–263), `WorldArchive` optional-field precedent (261–263).

## Dependencies

- `src/inventory/ItemRegistry.ts` (`has`/`get` for unknown-item and
  stackSize checks at hydrate).
- `src/storage/EntityRecord.ts` (envelope validation at facade open).
- `src/storage/WorldMetadataRepository.ts`, `GamePersistence.ts`,
  `WorldArchive.ts`, `WorldArchiver.ts` (new raw namespaces + passthrough).
- `src/engine/Game.ts` (hydrate + periodic/dispose/pagehide saves).

## Proposed change

1. `ItemEntityManager.deserializeAll`: reject duplicate ids within the batch,
   negative ids, unknown item ids, and counts outside `1..stackSize(item)`;
   deterministic `Error`, manager unchanged.
2. `XpOrbManager.deserializeAll`: reject duplicate ids within the batch;
   deterministic `Error`, manager unchanged (all other malformed classes
   already throw).
3. `WorldMetadataRepository`: `putItemEntityData` / `getItemEntityData`
   (`__itementities__:<worldId>`) and `putXpOrbData` / `getXpOrbData`
   (`__xporbs__:<worldId>`); `deleteRaw` covers reset (existing).
4. `GamePersistence`: `open()` bulk-loads both records (absent → null;
   non-array or envelope-malformed → null + recorded error);
   `initialItemEntities` / `initialXpOrbs` getters; `saveItemEntities` /
   `saveXpOrbs` fire-and-forget with recorded errors; 257 reset deletes both
   keys (+ snapshot/restore coverage); `WorldArchive` optional
   `itemEntityData` / `xpOrbData` (array-or-null) with `WorldArchiver`
   export/import passthrough.
5. `Game`: hydrate both managers after construction (injected path) and when
   the self-open promise settles, inside try/catch that quarantines to empty
   with the save-health banner; save both on the 5s autosave cadence,
   `dispose()`, and pagehide; public `saveItemAndXpEntities()` (also the
   deterministic E2E save seam) plus read accessors for entity/orb counts.

## Compatibility and migration

- Zero store/version changes, zero migrations. New raw keys are absent on old
  worlds → null → boot empty (correct: old sessions never persisted drops).
- `serializeAll` output shape is unchanged, so payloads written by this change
  re-validate under the hardened reader (live counts always satisfy
  `1..stackSize`; ids always non-negative unique).
- Archive v1/v2 without the new optional fields validate and import as null
  (261–263 precedent).

## Risks

- Over-strict hydrate (e.g. count > stackSize) could quarantine a save no
  live writer produced — accepted: fail-closed is the R-4 mandate, and no
  live path produces such payloads (spawn/merge enforce the bounds).
- Autosave write amplification (drops change every tick via age): mitigated
  by the existing 5s cadence + full-snapshot dedup semantics of the raw put
  (last write wins; no queue growth).

## Rollback strategy

Revert the Game save/hydrate call sites (managers return to memory-only);
leave the hardened validators (strictly safer than before). No stored-data
rollback needed (new keys are additive and ignored by older code).

## Definition of Done

- Both `deserializeAll` paths reject every malformed class in the spec with
  deterministic errors and atomicity; unit proof.
- Facade save→flush→reopen round-trips manager-serialized payloads;
  absent → null; corrupt → null + recorded error; reset deletes; archive
  carries.
- E2E: a real drop and a real orb persist across reload field-for-field; a
  collected drop stays gone after reload; empty world reloads empty.
- R-4 row reads CLOSED; gates green; 264 VERIFIED.

## Advancement gate

100% of 13 tasks, all MUST/SHALL verified, `npm run typecheck`, `npm run
lint`, `npm test`, `npm run build`, `npm run test:e2e` green, file-audit and
`validate-state` PASS. No 90%-exception planned.
