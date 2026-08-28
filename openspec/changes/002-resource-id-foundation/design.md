# Design: 002-resource-id-foundation

## Context/current state

`src/world/BlockRegistry.ts` currently uses stable numeric `BlockId` values plus unconstrained `key: string` fields. `src/inventory/Crafting.ts` similarly uses plain recipe ID strings. This is adequate for 25 current IDs but not for hundreds of cross-referenced data resources.

The future runtime should use compact numeric IDs internally, while stable namespaced IDs remain the authoring, persistence, debugging, registry-registration, and data-boundary identity.

## Target state

Introduce one small namespaced identifier primitive with deterministic validation and serialization. No current registry is migrated in this change.

## Invariants

1. Every valid resource ID has exactly one non-empty namespace and one non-empty path.
2. Canonical text is exactly `<namespace>:<path>`.
3. Namespace characters are `[a-z0-9_.-]` only.
4. Path characters are `[a-z0-9/._-]` only.
5. Uppercase letters are invalid; no silent case normalization occurs.
6. Leading/trailing/internal whitespace is invalid.
7. `:` may separate namespace and path but may not appear inside either validated component.
8. Unqualified paths require an explicit valid default namespace.
9. Parsing and direct creation share the same validation logic.
10. Equal canonical text represents equal logical identity.
11. The primitive performs no registry lookup and allocates no runtime numeric ID.

## API and data model

Recommended representation:

```ts
export interface ResourceId {
  readonly namespace: string;
  readonly path: string;
}

export class ResourceIdError extends Error {
  readonly input: string;
  readonly reason: ResourceIdErrorReason;
}

export function createResourceId(namespace: string, path: string): ResourceId;
export function parseResourceId(input: string, defaultNamespace?: string): ResourceId;
export function tryParseResourceId(input: string, defaultNamespace?: string): ResourceId | null;
export function resourceIdToString(id: ResourceId): string;
export function compareResourceIds(a: ResourceId, b: ResourceId): number;
export function resourceIdEquals(a: ResourceId, b: ResourceId): boolean;
```

Exact naming may vary if the implementation finds a clearer API, but all normative behavior in the spec must remain satisfied.

Prefer a frozen plain object or similarly immutable value. Do not make later registries depend on object identity; canonical string or registry-assigned numeric ID is the stable key.

## Parsing algorithm

1. Reject non-string values at TypeScript-external boundaries if helper accepts `unknown`; otherwise compile-time string input is sufficient.
2. Reject empty input.
3. Locate first `:`.
4. If no colon:
   - require `defaultNamespace`;
   - validate default namespace;
   - treat entire input as path.
5. If colon exists:
   - namespace = prefix;
   - path = suffix;
   - any additional colon remains in path and therefore fails path validation.
6. Validate namespace/path independently.
7. Return immutable value.

No trimming or lowercase conversion is allowed.

## Error model

Errors should distinguish at least:

- empty input;
- missing namespace/default namespace;
- empty namespace;
- empty path;
- invalid namespace character;
- invalid path character.

A single structured `ResourceIdError` with a reason enum/union is preferable to relying on arbitrary error strings. Tests should assert reason/category, not fragile full prose.

`tryParseResourceId` returns `null` for validation failure and MUST NOT throw validation errors. Programming errors unrelated to validation need not be swallowed.

## Equality and ordering

- Equality compares namespace and path by exact code-unit equality after validation.
- Lexical comparison orders namespace first, then path using deterministic ordinal/string comparison suitable for stable test/serialization ordering.
- Locale-sensitive comparison MUST NOT be used.

## Serialization

`resourceIdToString` always emits qualified canonical form, including IDs originally parsed with a default namespace.

Round trip invariant:

```text
parse(toString(id)) == id
```

for every valid ID.

## Failure modes

- Invalid input throws structured error from strict parse/create.
- Invalid input returns null from try-parse.
- Failure returns no partially constructed value.
- No global cache/registry is mutated.

## Compatibility/migration

No existing key is converted yet. Tests may use examples such as `game:stone` or `minecraft_like:blocks/stone`, but production current block keys remain untouched until later migrations.

## Performance/resource constraints

- Validation is linear in identifier length.
- No regex backtracking with unbounded pathological behavior.
- No global interning table is required.
- Future hot loops should use registry runtime IDs, not repeatedly parse strings.
- A reasonable defensive maximum identifier length MAY be added only if explicitly specified/tested; otherwise no arbitrary short cap is introduced in this change.

## Testing seams

Create a focused unit test file, e.g. `tests/unit/ResourceId.test.ts`, covering:

- minimal valid qualified ID;
- all allowed namespace characters;
- all allowed path characters including nested `/`;
- default namespace path;
- canonical serialization;
- equality and ordering;
- empty input/namespace/path;
- multiple colons;
- uppercase in either component;
- spaces/tabs/newlines;
- Unicode/non-ASCII characters;
- invalid punctuation;
- invalid default namespace;
- try-parse non-throwing behavior;
- parse/stringify round trips over a table of valid IDs.

Property-based testing is not required yet, but table-driven coverage must be exhaustive over character classes.

## Observability/debugging

Error reasons and canonical serialization make invalid resource-data diagnostics actionable. No production logging is required.

## Affected files/symbols

Expected new files:

- `src/data/ResourceId.ts`
- `tests/unit/ResourceId.test.ts`

Possible minimal export barrel only if the repository already uses/needs one. Avoid unrelated refactors.

## Rejected alternatives

### Plain branded string only

A branded `string` is compact but makes namespace/path access and validation consistency easier to bypass. It can be reconsidered internally later; the public helpers must preserve this contract.

### URL or filesystem-path semantics

Rejected. Resource IDs are logical game identifiers, not URLs or OS paths.

### Automatic `minecraft` namespace

Rejected for this project. The clone should not make a proprietary namespace the implicit identity. Callers explicitly provide the project's default namespace where desired.

### Silent lowercase normalization

Rejected because it hides invalid authored data and can cause collisions.

## Downstream dependencies

003 generic registries directly depend on this primitive. Tags, block states, items, recipes, loot, entities, fluids, biomes, data loading, persistence codecs, and networking later depend transitively on it.
