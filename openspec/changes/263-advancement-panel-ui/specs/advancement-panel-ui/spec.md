# Spec: advancement-panel-ui

## Contract

This capability ships the in-game advancements panel over the VERIFIED
headless `AdvancementFramework` (185) + `CoreProgressionAdvancements` (186):
an openable UI listing the 7 core advancements with title, description, and
progress/completion state; live trigger wiring into Game play with
toast-on-completion; world-scoped persistence with degrade-to-defaults; and a
catalog-aware hardened batch deserializer closing the R-4 advancement-half
under-validation debt. 185/186 sources and tests are untouched.

## Definitions

- **Catalog**: `coreProgressionAdvancements()` — the 7-def 186 chain in play
  order (`minecraft:stone_age` … `minecraft:free_the_end`).
- **Progress store**: `AdvancementProgress[]` parallel to catalog order.
- **Save envelope**: `{version: 1, advancements: SerializedAdvancementProgress[]}`.
- **Row view**: `{key, title, description, achieved, achievedTick,
  achievedCount, totalCount, remaining}` per catalog def.
- **Completion**: a def whose fan-out flips its last unachieved criterion;
  narrated once via toast.

## Invariants

- The store stays parallel to catalog order; only the fan-out mutates it.
- The panel lists all 7 defs in chain order and owns no progress state.
- A non-matching trigger — or any trigger against a completed def — is an
  identity no-op (185 rule, preserved end-to-end).
- Every completed def toasts exactly once, however many triggers follow.
- The batch deserializer accepts nothing partially: first malformed field
  throws before any value is returned.

## Requirements

### Requirement: the panel lists the core chain with title, description, and progress

`getAdvancementRows()` MUST return one row per catalog def in chain order,
each carrying the def `title`, a non-empty English `description` derived from
its criterion, `achievedCount`/`totalCount` progress, and the `achieved` flag.

#### Scenario: full chain rows

- **GIVEN** default (all-unachieved) progress
- **THEN** rows are the 7 keys in chain order; every `description` is
  non-empty; every row reads `0/1` unachieved

#### Scenario: criterion-derived descriptions

- **GIVEN** the four criterion types in the catalog
- **THEN** `obtain_item(wooden_pickaxe)` describes obtaining a Wooden Pickaxe,
  `dimension_enter(minecraft:the_nether)` describes entering the Nether,
  `dimension_enter(minecraft:the_end)` describes entering the End, and
  `boss_defeat(ender_dragon)` describes defeating the Ender Dragon

### Requirement: live triggers update progress and completion state

`fireAdvancementTrigger(trigger)` MUST fan out over the catalog at the
current tick, flip matching criteria, mark newly-completed defs with the tick,
persist when anything changed, and return the newly-completed keys.

#### Scenario: obtain completes through the seam

- **GIVEN** default progress and trigger
  `{type:'obtain_item', itemKey:'wooden_pickaxe'}` at tick 42
- **THEN** the return is `['minecraft:stone_age']`; the `stone_age` row reads
  `1/1` achieved with `achievedTick` 42; all other rows are unchanged

#### Scenario: non-matching trigger is a no-op

- **GIVEN** default progress and trigger
  `{type:'obtain_item', itemKey:'not_a_real_item'}` (or a wrong-dimension
  `dimension_enter(minecraft:the_end)` against `enter_the_nether`)
- **THEN** the return is `[]`; the store is identical; no persistence write
  fires

#### Scenario: double completion fires once

- **GIVEN** `stone_age` completed at tick 42, then the same trigger again
- **THEN** the second call returns `[]`; the store is identical;
  `achievedTick` stays 42; no second toast fires

### Requirement: real play fires obtain triggers

Item-entity pickup, crafting output (`onCrafted`), and recipe-book craft
success MUST map the numeric item id to its registry string key and fire the
`obtain_item` trigger through the same seam; unknown ids MUST be skipped
without throwing.

#### Scenario: craft completion through the player loop

- **GIVEN** a live game and 3 planks + 2 sticks granted to the inventory
- **WHEN** the player crafts `wooden_pickaxe` through the one-click crafting
  UI (or the recipe-book Craft action)
- **THEN** `minecraft:stone_age` completes with the current tick and the
  `Advancement made: Stone Age` toast shows

#### Scenario: unknown item id never breaks pickup

- **GIVEN** a pickup callback invocation with an unregistered numeric id
- **THEN** no trigger fires, no throw occurs, and the inventory add is
  unaffected

### Requirement: completions toast exactly once and the open panel goes live

Each newly-completed def MUST toast `Advancement made: <title>` exactly once;
while the panel is open, a trigger MUST re-render it so the row flips without
reopening.

#### Scenario: toast-on-completion

- **GIVEN** the panel open on default progress
- **WHEN** `fireAdvancementTrigger({type:'dimension_enter',
  dimensionKey:'minecraft:the_nether'})` fires
- **THEN** the toast reads `Advancement made: We Need to Go Deeper`, the
  `enter_the_nether` row flips to completed live, and a repeat trigger
  produces no second toast

### Requirement: progress persists across save/reload

The store MUST serialize to the versioned batch envelope under
`__advancements__:<worldId>` on every change; reload MUST restore it
field-for-field; absent records MUST boot defaults; corrupt records MUST
degrade to defaults with a recorded error (boot never throws); the 257 reset
path MUST delete the record; export/import MUST carry it (optional field,
missing → null).

#### Scenario: round-trip and degrade

- **GIVEN** `stone_age` + `enter_the_nether` completed, then a pagehide +
  reload
- **THEN** both rows restore achieved with their ticks; a hand-corrupted
  record instead boots all-unachieved with a recorded persistence error

### Requirement: batch deserialization fails closed (R-4 advancement half)

`deserializeAdvancementSave(input, catalog)` MUST throw descriptively and
accept nothing for: non-object input; wrong/missing version; non-array
`advancements`; duplicate `advancementKey`; unknown key (not in catalog);
`criteriaAchieved` length ≠ def criteria length; `achieved` true without all
criteria true (or false with all true); `achievedTick` null/non-null mismatch
with `achieved`. A valid envelope MUST round-trip exactly.

#### Scenario: malformed classes rejected

- **GIVEN** one payload per malformed class above (≥10 classes, incl. two
  same-key records and a key outside the catalog)
- **THEN** every payload throws naming the fault; the valid envelope
  round-trips field-for-field

### Requirement: panel lifecycle matches the container precedent

Opening advancements MUST close crafting/furnace/brewing/enchanting/gamerule/
recipebook first (one container at a time); C-toggle, pointer relock, blur
(keep, unstacked), player death, and dispose MUST settle the panel exactly
like the 259–262 panels; upkeep MUST re-render while open.

#### Scenario: lifecycle

- **GIVEN** the panel open
- **WHEN** the close button / C key / blur / death / dispose fires
- **THEN** the panel hides exactly once with the overlay returned (blur keeps
  it open unstacked, per precedent); crafting opened afterwards never stacks
  over it

### Requirement: original assets only

All panel visuals MUST be original DOM/CSS (no copied proprietary text,
textures, or sounds); advancement titles reuse the 186 catalog strings;
descriptions are original criterion-derived English.

#### Scenario: asset audit

- **GIVEN** the finished change
- **THEN** `git status` shows additions in `.html`/`.css`/`.ts` only (no
  binaries), and no 185/186 file is modified

## Error and failure behavior

- `deserializeAdvancementSave` throws on any malformed field (fail-closed);
  every other new function is total (`fireAdvancementTrigger` with a
  non-matching/malformed trigger returns `[]`; unknown numeric ids skip).
- Panel construction throws `Advancement element missing: #id` for absent
  required elements (fail-fast, 259–262 precedent).
- Corrupt persisted payloads degrade to defaults with a recorded
  `GamePersistence` error; IndexedDB write failures record and keep the
  in-memory store (session continues; reload falls back to the last good
  write).

## Performance and resource bounds

- Trigger fan-out O(catalog × criteria) = O(7 × 1) per pickup/craft event;
  one fan-out per collected stack, post-completion invocations identity no-ops.
- One extra metadata read at boot; one write per changed trigger; no per-tick
  work; panel render signature-gated.

## Compatibility and migration

- New raw record only; old saves boot defaults. `WorldArchive.advancementData`
  OPTIONAL (v1/v2 without it import as null). No store/version bumps, no
  185/186/network/registry format changes. Envelope version 1 with
  wrong-version rejection.

## Security and integrity

- The batch deserializer is the only untrusted-input surface (IndexedDB +
  archive import); it validates the whole payload before returning anything
  (no partial acceptance). No new network, DOM-injection, or eval surface:
  panel text is assigned via `textContent`.

## Observability

- Toast per new completion; panel status line (`aria-live=polite`) narrates
  open state and totals; `getAdvancementRows()` /
  `fireAdvancementTrigger()` return / `isAdvancementOpen()` are the
  E2E-observable surface.

## Verification mapping

| Requirement | Test / command |
|---|---|
| REQ-1 rows + descriptions | `tests/unit/AdvancementView.test.ts` › rows/descriptions |
| REQ-2 fan-out + no-op + double-fire | `tests/unit/AdvancementWiring.test.ts` + `AdvancementSave.test.ts` › fan-out |
| REQ-3 real-play obtain chokes | `tests/unit/AdvancementWiring.test.ts` › chokes + `tests/e2e/advancements.spec.ts` › journey (real craft click) |
| REQ-4 toast-once + live panel | `tests/unit/AdvancementWiring.test.ts` › exactly-once + E2E journey (toast + live row flip) |
| REQ-5 persistence round-trip/degrade | `tests/unit/AdvancementPersistence.test.ts` + E2E journey (reload preserves) |
| REQ-6 batch fail-closed (R-4) | `tests/unit/AdvancementSave.test.ts` › malformed classes |
| REQ-7 lifecycle | `tests/e2e/advancements.spec.ts` › lifecycle |
| REQ-8 original assets | `git status` audit in verification.md |
