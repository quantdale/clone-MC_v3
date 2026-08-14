# Verification: 015-fluid-registry

Status: **VERIFIED**

Advancement allowed: **true**

Completion: **100%** (11/11 tasks complete).

## Definition of Done check

- [x] `FluidCategory` (`WATER`/`LAVA`) and `FluidFlag` (`WATER`/`LAVA`/`SOURCE`/`FLOWING`/`LIGHT_EMITTING`/`DENSER`) defined.
- [x] `FluidTypeDefinition` with `id`, `key`, `name`, `category`, `flags`, `lightLevel`, `density`, `isSource`.
- [x] `FluidRegistry` built on the 003 generic `Registry` with validation + finalize.
- [x] Validation: bounded finite `lightLevel` (0..15) and positive `density`, known flags only, category/flag consistency (`WATER` requires `WATER` flag, `LAVA` requires `LAVA` flag), unique ids.
- [x] `createDefaultFluidRegistry()` yields four types: `water`, `water_source`, `lava`, `lava_source`.
- [x] Lava source emits light level 15 (`LIGHT_EMITTING`); lava is `DENSER`; water variants are `FLOWING`.
- [x] No existing `water`/`lava` *blocks* migrated (additive, gameplay-free, consistent with 012/014).

## Evidence

| Requirement | Evidence |
| --- | --- |
| Registry validates range/flags/consistency | 7 `Fluid.test.ts` tests: default size 4 + finalize, out-of-range `lightLevel`, non-positive `density`, unknown flag, water-without-WATER-flag, duplicate id |
| Default data correctness | `default fluid data` test: water `FLOWING`, water_source `isSource`, lava `DENSER`/light 0, lava_source `LIGHT_EMITTING`/light 15 |
| Acceptance scenarios | `specs/fluids/spec.md` GIVEN/WHEN/THEN scenarios covered by the tests above |

## Gate results

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 318/318 (was 311; +7 Fluid) |
| `npm run build` | PASS — `tsc --noEmit && vite build` clean |
| `npm run test:e2e` | PASS — 19/19 |

No advancement exception used. All mandatory requirements and required tests pass.

**016-biome-registry is authorized to begin.**
