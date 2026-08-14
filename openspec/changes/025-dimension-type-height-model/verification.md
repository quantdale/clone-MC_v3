# Verification: 025-dimension-type-height-model

Status: **PLANNED / NOT VERIFIED**

Advancement allowed: **false**

025 starts only after 024 is VERIFIED.

Required evidence: `DimensionType` derives `minSectionY`/`sectionCount`/`maxSectionY`/`maxY` correctly for
overworld/nether/end, rejects malformed extents, and `containsY`/`sectionIndexForY` respect the range;
the default registry registers three dimensions and rejects unknown/duplicate ids; plus passing typecheck,
lint, full unit suite, build, and E2E.

No advancement exception is planned. Expected completion is 100%.

**026 remains blocked until 025 is VERIFIED.**
