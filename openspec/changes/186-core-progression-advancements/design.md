# Design: 186-core-progression-advancements

## Context/current state
- 185's `AdvancementFramework` provides definitions/progress/triggers but no catalog. 186 is the
  first data catalog: the survival→Nether→End chain, vanilla-inspired keys and criteria.

## Target state
- `src/simulation/CoreProgressionAdvancements.ts` holding the ordered 7-advancement chain and the
  four accessors.

## Invariants
- The chain order is exactly: stone_age, acquire_hardware, iron_tools, diamonds, enter_the_nether,
  enter_the_end, free_the_end.
- Every criterion is one of 185's typed union with a non-empty payload key.
- `free_the_end` carries the vanilla `{ kind: 'experience', amount: 500 }` reward; all others
  `{ kind: 'none' }`.
- `getCoreProgressionAdvancement` returns `undefined` for unknown keys.

## API and data model
```ts
// src/simulation/CoreProgressionAdvancements.ts (new)
export function coreProgressionAdvancements(): readonly AdvancementDefinition[];  // play order
export function getCoreProgressionAdvancement(key: string): AdvancementDefinition | undefined;
export function firstCoreProgressionAdvancement(): AdvancementDefinition;
export function finalCoreProgressionAdvancement(): AdvancementDefinition;
```

## Control/data flow
- 187/202+ (statistics/UI) iterate the chain via `coreProgressionAdvancements`; the wiring fires
  gameplay triggers; 185's `applyAdvancementTrigger` completes each definition.

## Detailed behavior
- The catalog is module-level immutable data; accessors return the array/definitions directly.

## Failure modes
- No throwing paths; unknown-key lookups are `undefined`.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- Module-load constants; lookups O(n) with n = 7.

## Testing seams
- Tests drive the real 185 framework (create/apply/completion) against catalog definitions.

## Observability/debugging
- The catalog is enumerable data; keys are self-describing.

## Affected files/symbols
- `src/simulation/CoreProgressionAdvancements.ts` (new).
- Tests: `tests/unit/CoreProgressionAdvancements.test.ts` (new). No other files.

## Rejected alternatives
- **A registry (duplicate-rejecting)**: rejected — the chain is fixed data with no dynamic
  registration; a plain ordered array + lookup is simpler and sufficient.
- **Parent/child advancement links**: rejected — 185 has no parent concept; the ordered chain IS
  the progression structure.

## Downstream dependencies
- 187 (statistics) and 204 (recipe book) consume the catalog; 202+ (UI) renders it; 242's e2e
  asserts chain completions along the survival path.
