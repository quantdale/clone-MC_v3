# Design: 020-resource-data-loader

## Context / current state

Game/registry data is read ad-hoc; there is no shared deterministic loader that decodes via the 019
codec, validates, collects errors, and produces a reproducible resource set. This change adds the
reusable loader primitive.

## Target state

`src/data/ResourceDataLoader.ts` provides:

- `ResourceDataLoader<T>` — constructed with a `VersionedCodec<T>`, a `reader` function
  `(name) => string | undefined`, and an ordered `files` list. `load()` reads each file in order,
  decodes via the codec, and collects values/errors/warnings deterministically.
- `LoadedResource<T>` — `{ values: T[]; errors: LoadFileError[]; warnings: string[]; ok: boolean }`.
- `loadIntoRegistry<T>(loader, keyOf)` — builds a 003 `Registry<T>` from successfully loaded values,
  keyed by a 002 `ResourceId` derived from each value; duplicate keys surface as warnings/errors.

## Invariants

- Files are processed strictly in the order supplied; output `values` preserve that order.
- A missing file (`reader` returns undefined) is a load error, not a crash; the batch continues.
- A decode failure is captured as a `LoadFileError` and excluded from `values`; the batch continues.
- `loadIntoRegistry` MUST only register successfully decoded values; duplicate keys are rejected by
  the 003 `Registry` (DUPLICATE_ID), surfaced as an error in the result.
- The loader is source-agnostic: the reader abstraction handles fs/fetch/in-memory. No `fs` import
  keeps the module browser-safe.

## API and data model

```ts
export type ResourceReader = (name: string) => string | undefined;

export interface LoadFileError {
  readonly file: string;
  readonly reason: 'MISSING' | 'DECODE';
  readonly detail: string;
}

export interface LoadedResource<T> {
  readonly values: T[];
  readonly errors: LoadFileError[];
  readonly warnings: string[];
  readonly ok: boolean;
}

export class ResourceDataLoader<T> {
  constructor(options: { codec: VersionedCodec<T>; reader: ResourceReader; files: readonly string[] });
  load(): LoadedResource<T>;
}

export function loadIntoRegistry<T>(
  loader: ResourceDataLoader<T>,
  keyOf: (value: T) => ResourceId,
): { registry: Registry<T>; errors: LoadFileError[] };
```

## Control / data flow

`load()` iterates `files` in order; for each, calls `reader(name)`. On `undefined` → push
`{ file, reason: 'MISSING' }`. Otherwise `codec.tryDecode(text)`; on `{ ok:false }` → push
`{ file, reason: 'DECODE', detail: error.reason }`; on success → push value. `ok` is true iff no
errors. `loadIntoRegistry` calls `load()`, then builds a `Registry` via `keyOf`. The 003 core throws
`DUPLICATE_ID` on collision, which is caught and appended to `errors`.

## Failure modes

- Missing file → MISSING error.
- Decode failure (any `CodecError`) → DECODE error with the codec reason.
- Duplicate registry key → DUPLICATE_ID surfaced as an error.

## Compatibility / migration

Purely additive infrastructure; no persisted or call-site changes.

## Performance / resource constraints

O(total bytes) read + decode; deterministic; no global state.

## Testing seams

`tests/unit/ResourceDataLoader.test.ts` uses an in-memory reader to test ordered load, missing-file
handling, decode-failure handling, mixed-batch resilience, and `loadIntoRegistry` keying/duplicate
rejection.

## Affected files / symbols

- `src/data/ResourceDataLoader.ts` (new)
- `tests/unit/ResourceDataLoader.test.ts` (new)

## Rejected alternatives

- Importing `fs` directly: would risk bundling issues in the browser build; the injected reader keeps
  the module source-agnostic and testable.
- Throwing on first failure: a batch loader should report all problems; errors are collected.

## Downstream dependencies

Future changes that persist/load registry data (saves, packets, asset catalogs) build on this loader
plus the 019 codec and 002/003 foundations.
