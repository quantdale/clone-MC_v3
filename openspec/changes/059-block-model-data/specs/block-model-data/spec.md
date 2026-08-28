# Spec: block-model-data

## Contract

Block render models MUST be expressible as validated data: a `BlockModel` with an optional parent
reference, a texture map, and box elements carrying per-face `{ texture, uv?, cullface? }` data, with
`from`/`to` coordinates in model units `[0, 16]`. `validateBlockModel` MUST reject malformed models,
and a `BlockModelRegistry` MUST store validated models per ResourceId with duplicate rejection.

## Definitions

- **ModelFace**: `up | down | north | south | east | west`.
- **Model units**: coordinates in `[0, 16]` mapping to the block's unit cube.

## Invariants

- `from`/`to` are 3 finite numbers each in `[0, 16]` with `from < to` per axis.
- `faces` keys are valid faces; every face has a non-empty `texture`; `uv` (when present) has exactly
  4 finite numbers; `cullface` (when present) is a valid face or `null`.
- `textures` values are non-empty strings; `parent` (when present) is a non-empty string.
- The registry rejects duplicate keys and invalid models.

## Requirements

### Requirement: minimal model accepted
`validateBlockModel` MUST accept a model with a texture map, one element, and valid faces.

#### Scenario: valid slab-like model
- **GIVEN** textures `{ all: 'block/slab' }`, one element `[0,0,0]..[16,8,16]` with `up`/`down` faces
  (each with `texture: 'all'`)
- **WHEN** `validateBlockModel` runs
- **THEN** it returns the model (no throw).

### Requirement: invalid elements rejected
`validateBlockModel` MUST reject non-finite or out-of-range coordinates and `from >= to`.

#### Scenario: bad element
- **GIVEN** `from: [0, 0, 0]`, `to: [16, 8, 16]` with `from.x >= to.x` (or `from: [-1, 0, 0]`)
- **WHEN** `validateBlockModel` runs
- **THEN** it throws a descriptive `Error`.

### Requirement: invalid faces rejected
`validateBlockModel` MUST reject invalid face keys, `uv` arrays of length ≠ 4, and missing or empty
`texture`.

#### Scenario: bad face data
- **GIVEN** a model with face key `'diagonal'`, a face with `uv: [0, 0, 16]`, and a face with
  `texture: ''`
- **WHEN** `validateBlockModel` runs on each
- **THEN** each throws.

### Requirement: optional fields
`cullface: null`, a valid `cullface`, and a `parent` reference MUST be accepted.

#### Scenario: optional data
- **GIVEN** a model with `parent: 'minecraft:block/cube'`, a face with `cullface: null`, and one with
  `cullface: 'up'`
- **WHEN** `validateBlockModel` runs
- **THEN** it returns the model (no throw).

### Requirement: registry behavior
`BlockModelRegistry` MUST store validated models per key, reject duplicates, and support
`get`/`has`/`size`/`clear`.

#### Scenario: registry round-trip
- **GIVEN** a valid model
- **WHEN** `register('minecraft:slab', model)` runs, then a duplicate `register` and `get`/`has`/
  `size`/`clear`
- **THEN** the first register succeeds, the duplicate throws, `get` returns the model, `has` is true,
  `size` is 1, and after `clear` `size` is 0.

## Error and failure behavior

- Invalid models throw descriptive `Error`s; nothing is registered.

## Performance and resource bounds

Validation is one-time per model; registry lookups are O(1).

## Compatibility and migration

Additive; no consumers yet.

## Security and integrity

Strict validation prevents malformed models from entering the render pipeline.

## Observability

`size`/`has` expose registry state.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Minimal model accepted | valid slab-like model |
| Invalid elements rejected | from>=to / out-of-range / non-finite |
| Invalid faces rejected | bad key / uv length / empty texture |
| Optional fields | cullface null/valid, parent |
| Registry behavior | register/get/has/size/clear/duplicate |
