# Design: 059-block-model-data

## Context / current state

Blocks render via hard-coded cube geometry. Models need a validated data schema.

## Target state

A `BlockModel` schema (parent reference, texture map, box elements with per-face data) validated by
`validateBlockModel`, registered per ResourceId in a `BlockModelRegistry`.

## Invariants

- `from`/`to` are 3-element arrays of finite numbers in `[0, 16]` with `from < to` per axis.
- `faces` keys are valid `ModelFace` values; each face has a non-empty `texture`; optional `uv` is a
  4-element array of finite numbers; optional `cullface` is a valid face or `null`.
- `textures` values are non-empty strings; `parent` is optional and, when present, a non-empty string.
- `elements` is an array (may be empty); unknown extra fields are ignored (forward compatible).
- The registry accepts valid models per ResourceId and rejects duplicates.

## API and data model

```ts
// src/data/BlockModel.ts
export type ModelFace = 'up' | 'down' | 'north' | 'south' | 'east' | 'west';
export interface BlockModelFace {
  texture: string;            // texture key or '#'-prefixed parent reference
  uv?: [number, number, number, number];
  cullface?: ModelFace | null;
}
export interface BlockModelElement {
  from: [number, number, number];
  to: [number, number, number];
  faces: Partial<Record<ModelFace, BlockModelFace>>;
}
export interface BlockModel {
  parent?: string;
  textures: Record<string, string>;
  elements: BlockModelElement[];
}
export function validateBlockModel(input: unknown): BlockModel;
export class BlockModelRegistry {
  register(key: string, model: BlockModel): void;
  get(key: string): BlockModel | null;
  has(key: string): boolean;
  get size(): number;
  clear(): void;
}
```

## Control / data flow

1. Content defines models (in code today; data files later via 020 loaders).
2. `BlockModelRegistry.register('minecraft:slab', model)` validates first.
3. 060 (blockstate model resolution) looks up models per block state; 063 meshes their elements.

## Detailed behavior

- `validateBlockModel` copies nothing (returns the narrowed input); element/face data is validated
  recursively.
- `cullface: null` is explicitly allowed (never cull); absent `cullface` means "cull when the
  neighbor is opaque" (resolution is 060's concern).
- `texture` may start with `#` (parent reference) — validated as non-empty only.

## Failure modes

- Any invalid field throws a descriptive `Error`; nothing is registered.

## Compatibility / migration

Additive; no consumers yet.

## Performance / resource constraints

Validation is one-time per model; lookups are O(1).

## Testing seams

- `tests/unit/BlockModel.test.ts`:
  - accepts a minimal valid model (one element, two faces);
  - rejects: bad face keys, `from >= to`, out-of-range coordinates, non-finite values, `uv` length ≠
    4, missing/empty `texture`, non-array `elements`, non-object input;
  - `cullface: null` and `parent` accepted;
  - registry: register/get/has/size/clear, duplicate rejection, invalid model rejection.

## Observability / debugging

`size`/`has` expose registry state.

## Affected files / symbols

- `src/data/BlockModel.ts` — NEW.
- `tests/unit/BlockModel.test.ts` — NEW.

## Rejected alternatives

- *Full Minecraft JSON model format*: too large for one change; the minimal box/face schema is the
  narrow, testable core — rotations/variants/multipart come later.

## Downstream dependencies

060 (blockstate → model resolution) consumes the registry; 063 meshes elements; 211 (internal
resource pack) serializes models into this schema.
