# Design: 221-current-release-delta

## Context/current state
- 215-220 expanded content as data; current-release behavior must be isolatable. 221 adds the
  pure release-delta overlay declaration; the runtime overlays it without touching the baseline
  architecture. 222's package boundary follows.

## Target state
- `src/data/ReleaseDelta.ts` holding the delta model, validation, and the overlay queries.

## Invariants
- Pure and headless-safe: no baseline access, no mutation of inputs.
- `release` is a non-empty string; `content` maps the ten documented kinds to non-empty string
  lists (absent kinds read as empty); `behavior` is a list of overrides with non-empty
  target/field and boolean/finite-number/string values.
- Unknown kinds throw; the whole payload validates before anything is accepted.
- Queries are total and registration-ordered.

## API and data model
```ts
// src/data/ReleaseDelta.ts (new)
export const RELEASE_CONTENT_KINDS = [
  'blocks', 'items', 'biomes', 'mobs', 'structures',
  'enchantments', 'effects', 'potions', 'recipes', 'loot',
] as const;
export type ReleaseContentKind = (typeof RELEASE_CONTENT_KINDS)[number];

export interface BehaviorOverride {
  target: string;   // content id
  field: string;    // behavior field
  value: boolean | number | string;
}
export interface ReleaseDelta {
  release: string;
  content: Readonly<Record<ReleaseContentKind, readonly string[]>>;
  behavior: readonly BehaviorOverride[];
}
export function createReleaseDelta(input: {
  release: string;
  content?: Partial<Record<ReleaseContentKind, readonly string[]>>;
  behavior?: readonly BehaviorOverride[];
}): ReleaseDelta;
export function contentForKind(delta: ReleaseDelta, kind: ReleaseContentKind): readonly string[];
export function isEnabled(delta: ReleaseDelta, kind: ReleaseContentKind, id: string): boolean;
export function overridesFor(delta: ReleaseDelta, target: string): readonly BehaviorOverride[];
```

## Control/data flow
1. Content authors declare the current-release delta (enabled content + behavior overrides).
2. The runtime consults `isEnabled`/`overridesFor` when loading content — the baseline stays
   untouched.

## Detailed behavior
- `createReleaseDelta` rejections (each `ReleaseDelta: <detail>`): empty release ->
  `release must be a non-empty string`; unknown content kind -> `unknown content kind <k>`; a
  non-string/empty content id -> `<kind> must be non-empty strings`; override target/field empty
  -> `behavior <i>.target must be a non-empty string` / `behavior <i>.field must be a non-empty
  string`; value not boolean/finite number/string -> `behavior <i>.value must be a boolean,
  finite number, or string`.
- Defaults: every content kind empty; behavior [].
- Queries: `contentForKind` returns the stored list (never undefined); `isEnabled` membership;
  `overridesFor` filters by target in registration order.

## Failure modes
- Construction throws descriptively; nothing partially accepted. Queries are total.

## Compatibility/migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- Queries O(content/behavior).

## Testing seams
- Tests drive the constructor with exact payloads and pin every rejection.

## Observability/debugging
- The delta is a plain immutable object; queries expose the overlay surface.

## Affected files/symbols
- `src/data/ReleaseDelta.ts` (new).
- Tests: `tests/unit/ReleaseDelta.test.ts` (new). No other files.

## Rejected alternatives
- **Merging the delta into 215-220**: rejected — the delta must stay isolated (the sequence's
  explicit constraint); the overlay is applied at runtime, never authored into the baseline.

## Downstream dependencies
- 222 (`shared-simulation-package-boundary`) packages the simulation for sharing; 242's e2e
  applies a release delta.
