# Spec: resource-id

## Contract

Provide a canonical namespaced identifier for future registries. This change covers parsing, validation, immutable identity, serialization, equality, ordering, and validation results only. Registry insertion and runtime numeric IDs belong to 003.

## Invariants

- Namespace and path MUST be non-empty.
- Namespace MUST use lowercase ASCII letters, digits, underscore, dot, or hyphen only.
- Path MUST use the namespace character set plus forward slash.
- Input MUST NOT be silently trimmed or case-normalized.
- Canonical output MUST always be `namespace:path`.
- Returned identity MUST not change after construction.

## Requirements

### Requirement: Qualified parsing

Valid qualified text SHALL produce exact namespace and path components.

#### Scenario: Qualified ID
- **GIVEN** `game:stone`
- **WHEN** parsed
- **THEN** namespace is `game`
- **AND** path is `stone`
- **AND** serialization returns `game:stone`.

### Requirement: Explicit default namespace

Path-only input SHALL be accepted only when a valid default namespace is explicitly supplied.

#### Scenario: Default supplied
- **GIVEN** path `stone` and default `game`
- **THEN** canonical identity is `game:stone`.

#### Scenario: Default absent
- **GIVEN** path-only input and no default
- **THEN** strict parsing MUST fail.

### Requirement: Namespace validation

Uppercase, whitespace, empty, unsupported punctuation, and non-ASCII namespace input MUST fail. Legal lowercase/digit/underscore/dot/hyphen input SHALL succeed.

### Requirement: Path validation

Uppercase, whitespace, empty, colon, backslash, unsupported punctuation, and non-ASCII path input MUST fail. Legal lowercase/digit/underscore/dot/hyphen/forward-slash input SHALL succeed.

### Requirement: Separator validation

Empty namespace, empty path, or more than one colon MUST fail. The parser MUST NOT silently repair malformed separators.

### Requirement: Shared validation

Direct namespace/path creation and string parsing SHALL enforce the same syntax rules.

#### Scenario: Same legal ID through two APIs
- **GIVEN** direct components `game` and `stone`
- **AND** parsed text `game:stone`
- **THEN** equality reports the same logical identity.

### Requirement: Immutable identity

Consumers MUST NOT be able to mutate a valid ID so that its namespace/path changes after construction.

### Requirement: Canonical round trip

For every valid ID, parsing its canonical serialized form MUST produce an equal logical ID.

### Requirement: Equality

Equality MUST compare namespace and path values and MUST NOT depend on object identity.

### Requirement: Deterministic ordering

If comparison is exposed, it SHALL compare namespace first, then path, without locale-sensitive ordering.

### Requirement: Structured failure

Strict parse/create SHALL expose a stable validation reason/category. Tests MUST be able to distinguish empty input, missing namespace/default namespace, invalid namespace, and invalid path without matching complete error prose.

### Requirement: Non-throwing try-parse

A try-parse API SHALL return an absent result for validation failures and a ResourceId for valid input. Validation failures MUST NOT escape as exceptions from the try-parse API.

## Failure behavior

Invalid input produces no partial valid ID and mutates no shared state. Invalid default namespaces are rejected. Backslash is never treated as a path separator.

## Performance

Validation MUST be linear in input length. No new external dependency is required. Existing gameplay hot loops MUST NOT be changed to repeatedly parse resource text in 002.

## Compatibility

002 is additive. Existing numeric block IDs, block keys, recipe IDs, save payloads, and gameplay behavior MUST remain unchanged.

## Verification mapping

Focused unit tests MUST cover valid characters, invalid characters, empty components, default namespaces, malformed separators, direct-create equivalence, immutability, round-trip serialization, equality, ordering, structured errors, and try-parse. Full repository regression commands prove additive compatibility.
