# Verification: 006-block-property-schema

Status: **VERIFIED**

Advancement allowed: **true**

## Entry gate

- 005-tag-registry VERIFIED and pushed (HEAD `aa19866`).
- Task ledger (`tasks.md`) authored and passed spec-quality review before implementation.

## Implementation summary

- Added `src/world/BlockPropertySchema.ts`: typed `PropertyKind` union (`boolean` | `integer` | `named`), authored `PropertySpec` union, and an immutable ordered `BlockPropertySchema` class.
- Validation rejects invalid names, duplicate names, bad integer bounds (non-finite / non-integer / `min>max`), empty named sets, duplicate named values, and non-lowercase named values — each with a precise `RegistryError` reason (`INVALID_ID` / `DUPLICATE_ID` / `MISSING_ID`).
- `serialize`/`parse` are exact canonical only: boolean `true`/`false`, integer text in `[min,max]` (no sign/leading-zero coercion), named exact-match; no trimming, case-folding, or clamping. Unknown or out-of-domain input throws `INVALID_ID`.
- `legalValues` returns frozen arrays in deterministic order; `properties` is frozen; returned spec objects are frozen. `EMPTY_SCHEMA` shared singleton.
- Wired into `src/world/BlockRegistry.ts`: optional `propertySchema?` on `BlockTypeDefinition` and `getPropertySchema(id)` resolving to `EMPTY_SCHEMA` when absent. Additive — all 18 existing block defs unchanged, current gameplay/save behavior preserved.
- Added `tests/unit/BlockPropertySchema.test.ts` (23 tests) covering every 6.x requirement.

## Required evidence

| Requirement | Test |
|---|---|
| Property names valid/unique | invalid-name + duplicate-name tests throw |
| Boolean kind/order | `legalValues('lit') === ['false','true']`, serialize/parse round-trip |
| Integer range + bounds | legal `0..3`, out-of-range rejected, bad bounds rejected |
| Named uniqueness/order | ordered values, empty set + duplicate + non-lowercase rejected |
| Exact validation, no coercion | uppercase/trimmed/leading-zero/`+1`/non-canonical rejected |
| Canonical round trip | `serialize(parse(v)) === v` for every legal value across all kinds |
| Deterministic order | repeated construction yields identical property/value order |
| Schema immutability | `legalValues`/`properties`/spec objects frozen; mutation rejected |
| Empty-schema compatibility | `EMPTY_SCHEMA` empty; `createDefaultBlockRegistry()` blocks all resolve `EMPTY_SCHEMA`; gameplay lookups unchanged |

## Gate results

- typecheck: **PASS** (`tsc --noEmit`, no errors)
- lint: **PASS** (`eslint .`, no errors)
- unit: **PASS 200/200** (prior 177 + 23 new BlockPropertySchema tests)
- build: **PASS** (`tsc --noEmit && vite build`, `dist/` emitted)
- e2e: **PASS 19/19** (production build loads; break/place/pointer-lock/content all green)

## Advancement Exception

Not applicable. 100% task completion; no incomplete or non-blocking tasks.

## Final decision

**VERIFIED and eligible to advance to 007-block-state-runtime-registry.**
