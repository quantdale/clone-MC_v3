# Verification: 099-structure-template-format

Status: VERIFIED
Completion: 100%
Advancement allowed: true

099 started only after 098 was VERIFIED (22add190 / 4019ea3).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Template validation | `StructureTemplate.test.ts`: valid template and empty-collection template accepted; empty key, zero/negative/fractional/oversize extents, out-of-bounds block/entity/connector coordinates, duplicate block positions, duplicate connector keys, negative blockId, empty entityKey, and unknown facing all rejected with field-naming errors | PASS |
| Transforms | exact vectors for 90 (footprint (3,1,2), blocks (1,0,0)->(2,0,1) and (0,0,2)->(0,0,0), door facing north->east, side east->south), 180 (footprint unchanged, facings -> south/west), 270 (footprint (3,1,2), facings -> west/north); x-mirror (east<->west) and z-mirror (north<->south) with exact coordinates; composition mirror-then-rotation (mirror x + 90 -> (2,0,0) facing east); identity; determinism | PASS |
| Transform validation | every rotation x mirror combination accepted; 45 and mirror 'y' rejected | PASS |
| Registry | register/get/has/size/clear round-trip; duplicate key and invalid template rejected atomically (size unchanged, absent key stays absent) | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/StructureTemplate.test.ts` | PASS | 13/13 |
| `npm test` | PASS | 112 files, 1108/1108 (1095 baseline + 13 new); run twice, stable |
| `npm run build` | PASS | `dist/` built (3.97s) |
| `npm run test:e2e` | PASS | 19/19 (1.6m) |

## Edge / adversarial validation

- Validation covers bad keys, zero/negative/fractional and oversize (65) extents, every
  out-of-bounds axis, duplicate block positions, duplicate connector keys, negative block ids,
  empty entity keys, and unknown facings.
- Transform vectors pin every rotation and mirror exactly, including transposed footprints,
  facing rotation (north->east->south->west) and mirror swaps, composition order, and
  determinism.
- Registry atomicity verified for both duplicate and invalid registrations.

## Migration / compatibility validation

Additive: new `src/worldgen/StructureTemplate.ts` + test file. No existing modules touched.

## Performance / resource validation

Validation and transforms O(blocks + entities + connectors); registry O(1) lookups; extents
capped at 64. Unit suite duration unchanged (~10s, 112 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 1108/1108 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 099 structure template blocks/entities/connectors with transforms are in place.
Advance to 100-structure-placement-core.
