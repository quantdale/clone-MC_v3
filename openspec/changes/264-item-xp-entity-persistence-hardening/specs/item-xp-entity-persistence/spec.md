# Spec: item-xp-entity-persistence

## Contract

This capability hardens the two world-scoped live-entity batch
deserializers (`ItemEntityManager.deserializeAll`, 111;
`XpOrbManager.deserializeAll`, 117) to fail closed on duplicate ids and
malformed payloads, and wires their snapshots through `GamePersistence` so
live drops/orbs survive page refresh. It closes the entity-manager half of
certification risk R-4 (the advancement half was closed by 263).

Omitted sections: none — every section below applies.

## Definitions

- **Batch**: the `unknown[]` argument to `deserializeAll`.
- **Fail-closed**: the call throws a deterministic `Error` and the manager's
  observable state (`size`, reads, insertion order, id-mint counter) is
  unchanged.
- **Quarantine**: at boot, a throwing hydrate is caught and replaced with
  empty managers plus a recorded error and the save-health banner.
- **World-scoped**: owned by `Game` for the whole session, never evicted by
  chunk streaming.

## Invariants

- I-1: `deserializeAll` is atomic — throw ⇒ manager unchanged.
- I-2: live ids are unique, non-negative; minting continues past every live
  id.
- I-3: `deserializeAll(serializeAll())` is field-for-field identity in order.
- I-4: no `World` streaming/unload path references either manager.

## Requirements

### Requirement: item batch rejects duplicate ids

`ItemEntityManager.deserializeAll` MUST throw
`ItemEntityManager: duplicate item-entity id <id> at index <i>` when two
records in one batch carry the same `data.id`, leaving the manager unchanged.

#### Scenario: duplicate pair rejected

- **GIVEN** a manager holding one entity (id 0)
- **WHEN** `deserializeAll` runs on two valid records both with `data.id = 4`
- **THEN** it throws naming id 4 and index 1
- **AND** the manager still holds exactly the original entity with `nextId`
  unchanged.

#### Scenario: triple with a late duplicate rejected

- **GIVEN** an empty manager
- **WHEN** `deserializeAll` runs on ids `[1, 2, 1]`
- **THEN** it throws naming id 1 and index 2
- **AND** the manager stays empty.

### Requirement: item batch rejects malformed records

`ItemEntityManager.deserializeAll` MUST throw a deterministic
`ItemEntityManager: ...` error, manager unchanged, for: non-object batch
elements (via 037), foreign `typeKey`, negative or non-integer `id`,
`item` unknown to the item registry, `count` outside `1..stackSize(item)`,
non-finite xyz/vxyz, or negative/non-integer `ageTicks`.

#### Scenario: unknown item id rejected

- **GIVEN** an empty manager with the default item registry
- **WHEN** `deserializeAll` runs on a record with `data.item = 999999`
- **THEN** it throws naming the unknown item id and the index
- **AND** the manager stays empty.

#### Scenario: oversize count rejected

- **GIVEN** an empty manager
- **WHEN** `deserializeAll` runs on `data = { id: 0, item: <planks>, count: 65, ... }`
  (stackSize 64)
- **THEN** it throws naming the count and the stackSize
- **AND** the manager stays empty.

#### Scenario: negative id rejected

- **GIVEN** an empty manager
- **WHEN** `deserializeAll` runs on a record with `data.id = -1`
- **THEN** it throws
- **AND** the manager stays empty.

### Requirement: orb batch rejects duplicate ids

`XpOrbManager.deserializeAll` MUST throw
`XpOrbManager: duplicate xp-orb id <id> at index <i>` when two records in one
batch carry the same `data.id`, leaving the manager unchanged.

#### Scenario: duplicate pair rejected

- **GIVEN** a manager holding one orb (id 0)
- **WHEN** `deserializeAll` runs on two valid records both with `data.id = 7`
- **THEN** it throws naming id 7 and index 1
- **AND** the manager still holds exactly the original orb.

### Requirement: orb batch stays fail-closed on malformed records

`XpOrbManager.deserializeAll` MUST keep throwing deterministically, manager
unchanged, for every previously-covered malformed class (non-object,
foreign `typeKey`, negative/non-integer id, non-positive value, non-finite
xyz/vxyz, negative ageTicks).

#### Scenario: malformed batch leaves the manager untouched

- **GIVEN** a manager holding orbs `[0, 1]`
- **WHEN** `deserializeAll` runs on `[valid(id 2), malformed(value 0, id 3)]`
- **THEN** it throws
- **AND** the manager still holds exactly orbs `[0, 1]` with `nextId`
  unchanged.

### Requirement: round-trip identity with mint continuity

Both managers MUST satisfy: fresh manager + `deserializeAll(serializeAll())`
reproduces every field in order, and the next minted id is `maxId + 1`
(empty batch ⇒ `nextId = 0`).

#### Scenario: item round-trip

- **GIVEN** a manager with entities spawned, ticked, and merged
- **WHEN** a fresh manager runs `deserializeAll(manager.serializeAll())`
- **THEN** every entity matches field-for-field in order
- **AND** the next spawn mints `maxId + 1`.

#### Scenario: orb round-trip

- **GIVEN** a manager with orbs spawned and ticked
- **WHEN** a fresh manager runs `deserializeAll(manager.serializeAll())`
- **THEN** every orb matches field-for-field in order
- **AND** the next spawn mints `maxId + 1`.

### Requirement: live snapshots persist across refresh

`GamePersistence` MUST durably store `itemEntities.serializeAll()` under
`__itementities__:<worldId>` and `xpOrbs.serializeAll()` under
`__xporbs__:<worldId>`, and `open()` MUST bulk-load them (absent ⇒ null;
non-array or envelope-invalid ⇒ null with a recorded error) so a reopened
world restores the same drops/orbs.

#### Scenario: save → reopen restores

- **GIVEN** an opened facade with a manager-serialized drop + orb saved and
  flushed
- **WHEN** a second facade opens over the same factory
- **THEN** `initialItemEntities` / `initialXpOrbs` equal the saved arrays
  field-for-field.

#### Scenario: corrupt payload degrades with a recorded error

- **GIVEN** a stored `__itementities__` record holding a non-array (or an
  envelope-invalid entry)
- **WHEN** the facade opens
- **THEN** the getter is null and the error log names the load fault
- **AND** boot continues (no throw out of `open()`).

### Requirement: boot hydrates through the hardened reader with quarantine

`Game` MUST hydrate both managers with `deserializeAll` at boot (injected
persistence immediately; self-composed when open settles); a throwing batch
MUST quarantine to empty managers with the save-health banner (never a boot
crash); `saveItemAndXpEntities()` MUST persist both snapshots on the autosave
cadence, dispose, and pagehide (no-op when persistence is absent or the world
is recovery-required).

#### Scenario: drop + orb survive reload

- **GIVEN** a live game with one drop and one orb saved
- **WHEN** the page reloads and boots
- **THEN** the same drop (item/count/position) and orb (value/position) are
  live with the same ids.

#### Scenario: collected drop stays gone

- **GIVEN** a saved drop that is collected before the next save
- **WHEN** the page reloads
- **THEN** that drop is absent and all other drops are intact.

#### Scenario: duplicate payload quarantines

- **GIVEN** a stored `__itementities__` record with duplicate ids (passes the
  envelope check, fails the hardened reader)
- **WHEN** the game boots
- **THEN** item managers boot empty with the save-health banner set
- **AND** the orb managers still hydrate normally (independent quarantine).

### Requirement: chunk unload/reload cannot evict drops/orbs

No `World` streaming or eviction path may reference either manager; an
unload/reload cycle (serialize → clear → deserialize) MUST restore the full
set.

#### Scenario: manager-level unload/reload cycle

- **GIVEN** live drops + orbs
- **WHEN** each manager runs clear-then-`deserializeAll` of its own
  `serializeAll()` snapshot (the unload/reload analogue)
- **THEN** both sets restore field-for-field.

### Requirement: reset and archive carry the new records

World-scoped reset MUST delete both raw keys (with snapshot/restore
coverage); `WorldArchive` MUST accept optional `itemEntityData` / `xpOrbData`
(array-or-null; missing ⇒ null) and `WorldArchiver` MUST export/import them.

#### Scenario: reset deletes

- **GIVEN** saved drop + orb records
- **WHEN** `resetCurrentWorld()` succeeds
- **THEN** both keys are absent on reopen (managers boot empty).

#### Scenario: archive round-trip

- **GIVEN** an archive without the new fields (v1)
- **WHEN** validated + imported
- **THEN** both import as null; an export after saving carries both arrays.

## Error and failure behavior

- Manager layer: deterministic `Error` throws listed above; never partial
  acceptance, never silent dedupe.
- Facade layer: `load itementities: ...` / `load xporbs: ...` recorded
  errors; getters null; `open()` never throws for these records.
- Game layer: hydrate throw ⇒ empty managers + `bootSaveDegraded` banner.
- Storage write failure ⇒ recorded `save itementities/xporbs` error via the
  existing SAVE-FAIL machinery; live state untouched.

## Performance and resource bounds

- `deserializeAll` remains O(n) over the batch (one `Set` for duplicates).
- Saves ride the existing 5s cadence; payload O(live drops + orbs); no
  per-tick persistence work.

## Compatibility and migration

- Zero new stores, zero version bumps, zero migrations. Absent keys ⇒ empty
  (correct for pre-264 worlds). Archives v1/v2 without the optional fields
  validate and import as null. Payloads written by this change always
  re-validate under the hardened reader.

## Security and integrity

- Persisted payloads are never trusted: envelope validation at facade open,
  full semantic validation (uniqueness + registry + bounds) at hydrate.
- A hostile or bit-rotted record can at worst empty the two managers with a
  visible banner — never execute, never corrupt other stores, never block
  boot.

## Observability

- Manager errors name manager + fault + batch index. Facade errors are
  bounded-logged. Quarantine is banner-visible. E2E observes counts/fields
  through the read accessors.

## Verification mapping

- Dup/malformed/atomicity/round-trip → `tests/unit/ItemEntityManager.test.ts`,
  `tests/unit/XpOrbManager.test.ts` (extended).
- Facade save/load/corrupt/reset/archive → `tests/unit/ItemXpPersistence.test.ts`.
- Live wiring + reload/removal/empty → `tests/e2e/item-xp-persistence.spec.ts`.
- Gates → `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e`, `scripts/validate-file-audit.mjs`,
  `node scripts/validate-state.mjs`.
