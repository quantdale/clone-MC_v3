# Spec: mob-spawn-cycle

## Contract
This capability adds per-category live counting, deterministic in-chunk candidate selection, and a
bounded per-chunk spawn cycle that composes 137's `canSpawn` with 129's `EntityManager`. No per-biome
spawn tables, no `Game`/tick-loop wiring, and no despawning — see the proposal's Non-goals.

## Definitions
- **Spawn category config**: `{ category, typeId, cap, attemptsPerChunk, height? }` — one entity
  type and one attempt budget per 017 `EntityCategory`.
- **Live count**: the number of `ACTIVE` (129) entities whose registered type's `category` matches.
- **Candidate**: a deterministic in-chunk `(x, z)` column produced by `selectSpawnCandidate`.
- **Spawn cycle**: one `runSpawnCycleForChunk` call, processing every supplied config against one
  chunk.

## Invariants
- `countLiveByCategory` never counts a `REMOVED` entity.
- `selectSpawnCandidate` is pure: identical `(seed, cx, cz, categoryIndex, attempt)` always yields an
  identical `(x, z)`, and `x`/`z` always fall within chunk `(cx, cz)`'s 16-wide footprint
  (`cx*16 <= x < cx*16+16`, likewise for `z`).
- `runSpawnCycleForChunk` never leaves a category's live count above its configured `cap` as a direct
  result of this call.
- A category at or above its `cap` when the cycle starts receives zero attempts.
- Every entity `runSpawnCycleForChunk` spawns passed `canSpawn` for its exact position first.

## Requirements

### Requirement: countLiveByCategory counts only active entities of the matching category
`countLiveByCategory(manager, registry, category)` MUST return the number of `ACTIVE` entities whose
`registry.get(typeId).category` equals `category`, excluding `REMOVED` entities and entities of any
other category.

#### Scenario: mixed-category and removed entities are counted correctly
- **GIVEN** an `EntityManager` with two `ACTIVE` `MONSTER`-category entities, one `ACTIVE`
  `CREATURE`-category entity, and one `REMOVED` `MONSTER`-category entity
- **WHEN** `countLiveByCategory(manager, registry, 'MONSTER')` is called
- **THEN** it returns `2`

### Requirement: selectSpawnCandidate is deterministic and stays within the chunk's footprint
`selectSpawnCandidate(seed, cx, cz, categoryIndex, attempt)` MUST return the same `{x, z}` for
identical inputs, and MUST always satisfy `cx*16 <= x < cx*16+16` and `cz*16 <= z < cz*16+16`.

#### Scenario: repeated calls with identical inputs produce identical output
- **GIVEN** fixed `(seed, cx, cz, categoryIndex, attempt)`
- **WHEN** `selectSpawnCandidate` is called twice with the same inputs
- **THEN** both calls return the same `{x, z}`

#### Scenario: the candidate always falls within the requested chunk
- **GIVEN** several different `(seed, cx, cz, categoryIndex, attempt)` combinations, including
  negative `cx`/`cz`
- **WHEN** `selectSpawnCandidate` is called on each
- **THEN** every result's `x`/`z` falls within that chunk's 16-wide footprint

### Requirement: a category already at cap makes zero attempts
`runSpawnCycleForChunk` MUST NOT call `canSpawn` or `EntityManager.spawn` for any config whose
category's live count is already `>= cap` when the cycle starts.

#### Scenario: a full category is skipped entirely
- **GIVEN** a config whose category already has `live === cap` entities before the cycle, with a
  `surfaceHeightAt`/`nearestPlayerDistance` that would otherwise make every candidate eligible
- **WHEN** `runSpawnCycleForChunk` is called
- **THEN** no new entity of that category is spawned and the returned total contribution from that
  config is `0`

### Requirement: attempts stop as soon as the cap is reached mid-cycle
`runSpawnCycleForChunk` MUST stop attempting further candidates for a config as soon as a successful
spawn brings that category's live count to its `cap`, even if `attemptsPerChunk` has not been
exhausted.

#### Scenario: reaching cap mid-cycle halts further spawns for that category
- **GIVEN** a config with `cap = 1`, `attemptsPerChunk = 5`, starting from `0` live entities, and a
  world where every candidate is eligible
- **WHEN** `runSpawnCycleForChunk` is called
- **THEN** exactly one entity of that category is spawned, not more

### Requirement: a successful spawn appears in the EntityManager at the expected position
When a candidate passes `canSpawn`, `runSpawnCycleForChunk` MUST call `EntityManager.spawn` with the
config's `typeId` and `dimension`, placing the entity at that candidate's block center
(`x + 0.5`, `surfaceHeightAt(x, z)`, `z + 0.5`).

#### Scenario: a spawned entity is queryable afterward at the expected position
- **GIVEN** a config guaranteed to succeed on its first attempt
- **WHEN** `runSpawnCycleForChunk` is called and the resulting entity is looked up via
  `manager.getAll()`
- **THEN** its `transform` matches the candidate's block-center position and its `typeId` matches
  the config's `typeId`

### Requirement: no eligible candidate spawns nothing without error
When every attempted candidate for a config fails `canSpawn`, `runSpawnCycleForChunk` MUST NOT throw
and MUST NOT spawn any entity for that config.

#### Scenario: an entirely ineligible world spawns nothing
- **GIVEN** a config whose category can never pass `canSpawn` in this world (e.g. no valid ground
  anywhere in the chunk)
- **WHEN** `runSpawnCycleForChunk` is called
- **THEN** it does not throw, and the returned total contribution from that config is `0`

## Error and failure behavior
- `runSpawnCycleForChunk` does not catch or suppress an error from `EntityManager.spawn` (e.g. an
  unregistered `typeId` in a config); such a configuration bug propagates unmodified.
- Every other documented case (cap-skipped, exhausted attempts, ineligible candidates) is a silent,
  non-throwing no-op for that config.

## Performance and resource bounds
- `countLiveByCategory` is O(n) over `ACTIVE` entities per call.
- `runSpawnCycleForChunk` performs at most `configs.length × attemptsPerChunk` `canSpawn` evaluations
  (each itself bounded per 137's cost model), plus one `countLiveByCategory` call per config (and one
  more per successful spawn within that config, bounded by `attemptsPerChunk`).

## Compatibility and migration
- One new, additive file (`src/simulation/MobSpawnCycle.ts`); no edits to `EntityManager`,
  `EntityType`, `MobSpawnRules`, or `RandomTickSelector`. No schema/save-format change; no migration.

## Security and integrity
- Every spawn is gated by `canSpawn` first, so `runSpawnCycleForChunk` can never place an entity at a
  position 137's own rules would reject.

## Observability
- The returned total spawned count, combined with `countLiveByCategory` callable before/after,
  fully explains a cycle's outcome without additional instrumentation.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 countLiveByCategory counts correctly | `tests/unit/MobSpawnCycle.test.ts` countLiveByCategory cases |
| REQ-2 selectSpawnCandidate determinism + bounds | `tests/unit/MobSpawnCycle.test.ts` selectSpawnCandidate cases |
| REQ-3 a full category makes zero attempts | `tests/unit/MobSpawnCycle.test.ts` cap-already-reached case |
| REQ-4 attempts stop once cap reached mid-cycle | `tests/unit/MobSpawnCycle.test.ts` mid-cycle cap case |
| REQ-5 a successful spawn appears at the expected position | `tests/unit/MobSpawnCycle.test.ts` successful-spawn case |
| REQ-6 no eligible candidate spawns nothing without error | `tests/unit/MobSpawnCycle.test.ts` no-eligible-candidate case |
