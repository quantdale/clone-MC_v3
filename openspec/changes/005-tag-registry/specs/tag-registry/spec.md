# Spec: tag-registry

## Contract

Tags provide resolved groups over one typed registry. A tag uses a ResourceId and may reference direct resources or other tags from the same domain.

## Requirements

### Requirement: Direct members
Registered direct members SHALL resolve into the tag.

### Requirement: Nested tags
Nested same-domain tag references SHALL contribute transitive members.

### Requirement: Deduplication
A resource reached through multiple paths MUST appear once in resolved membership.

### Requirement: Reference validation
Missing direct resources or missing nested tags MUST make finalization fail.

### Requirement: Cycle validation
Self-cycles and multi-tag cycles MUST make finalization fail rather than recurse indefinitely.

### Requirement: Atomic finalization
A failed finalization MUST NOT expose a partly resolved tag graph.

### Requirement: Determinism
The same registry and definitions MUST produce the same resolved membership and inspection order across runs.

### Requirement: Efficient query
After successful finalization, membership queries MUST use resolved data and MUST NOT recursively traverse tag definitions.

### Requirement: Immutability
Finalized tag definitions and resolved membership MUST reject ordinary mutation.

### Requirement: Domain separation
A tag associated with one registry domain MUST NOT be accepted as a tag for another domain.

## Scenarios

- T contains direct A: after finalization T contains A.
- T2 references T1 and T1 contains A: T2 contains A.
- A is both direct and inherited: resolved membership contains A once.
- A referenced resource is absent: finalization fails.
- T references itself: finalization fails.
- T1 references T2 and T2 references T1: finalization fails.
- Finalization fails after some definitions were visited: no partial resolved state is published.
- Repeated construction with identical inputs yields identical resolved order.

## Performance

Resolution is a finalization-time graph operation. Normal membership SHOULD be constant-time average or better.

## Compatibility

005 is additive. It MUST NOT change current gameplay or save behavior.

## Verification

Focused unit tests cover every requirement and scenario. Typecheck, lint, full unit tests, build, and E2E remain mandatory final gates.
