# Proposal: 099-structure-template-format

## Problem

No structure representation exists. 100 placement-core and 101 the first end-to-end generated
structure need a validated, transformable structure template format.

## Goals

- `StructureTemplate` data model: key, size, sparse blocks, entities, connectors (attachment
  points with facing), with strict validation.
- Deterministic transforms: Y-axis rotation (0/90/180/270) and x/z mirroring, composed in a
  documented order (mirror first, then rotation), with connector facings rotated accordingly.
- `StructureTemplateRegistry` (003 pattern): atomic duplicate/invalid rejection,
  register/get/has/size/clear.

## Non-goals

- Placing structures in the world (100-structure-placement-core).
- Any generated default structure (101-small-structure-baseline).
- Entity behavior or rendering (entities are validated data references here).

## Preconditions

- Change 098 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 098 baseline (1095 unit / 19 e2e).

## Dependencies

- 003 registry patterns, 059-style validation conventions.

## Proposed change

- `src/worldgen/StructureTemplate.ts` (NEW): `Direction`, `StructureSize`, `StructureBlock`,
  `StructureEntity`, `StructureConnector`, `StructureTemplate`, `validateStructureTemplate`,
  `StructureTransform`, `validateStructureTransform`, `applyStructureTransform`,
  `TransformedStructure`, `StructureTemplateRegistry`.
- `tests/unit/StructureTemplate.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Transform math (rotation/mirror composition, transposed sizes, facing rotation) must be
  pinned and documented; exact test vectors cover every rotation and mirror.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Validation accepts exactly the documented template shape and rejects malformed ones with
  descriptive errors (bounds, duplicates, unknown facings, oversize).
- Transforms are deterministic and match the documented math for every rotation/mirror and
  their composition; connector facings rotate correctly.
- The registry rejects duplicates and invalid templates atomically.
- Full gate green; 099 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 099 suite; E2E stays 19/19.
