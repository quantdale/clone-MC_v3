# Verification: 024-chunk-column-storage

Status: **PLANNED / NOT VERIFIED**

Advancement allowed: **false**

024 starts only after 023 is VERIFIED.

Required evidence: a `ChunkColumn` defaults to air and is not dirty, routes get/set across vertical
sections via 021 coordinate math, throws `RangeError` for out-of-range world Y, tracks dirty sections,
and serializes/deserializes deterministically (leaving untouched sections air), plus passing typecheck,
lint, full unit suite, build, and E2E.

No advancement exception is planned. Expected completion is 100%.

**025 remains blocked until 024 is VERIFIED.**
