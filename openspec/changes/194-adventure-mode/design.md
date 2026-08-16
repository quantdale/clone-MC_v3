# Design: 194-adventure-mode

## Context/current state
- 192/193 established modes and hardcore but no interaction restrictions: any mode may break/place
  any block. Vanilla adventure restricts breaking to the held item's `CanDestroy` set and placing
  to its `CanPlaceOn` set (item components or tags). The tag/component building blocks exist
  (005 `TagRegistry`, 008 `StackComponentRegistry`) but 194 stays registry-free by injecting the
  tag lookup and receiving declared ids as plain strings.

## Target state
- `src/simulation/AdventureModeRules.ts` holding the pure break/place permission rules and the
  set-resolution helper.

## Invariants
- Pure and headless-safe: no world access, no mutation, no registry coupling.
- Mode semantics (vanilla): survival/creative unrestricted; spectator never interacts; adventure
  restricted to the declared set — an empty set grants NOTHING.
- Block ids are canonical strings (`minecraft:stone` form); tag lookups return `ReadonlySet<string>`
  of resolved members; unknown/missing tags contribute no members.
- Resolution deduplicates and never throws.

## API and data model
```ts
// src/simulation/AdventureModeRules.ts (new)
export function canBreakBlock(mode: GameMode, blockId: string, allowed: ReadonlySet<string>): boolean;
export function canPlaceBlock(mode: GameMode, blockId: string, allowed: ReadonlySet<string>): boolean;
export function resolveBlockPermissionSet(
  directIds: readonly string[],
  tagIds: readonly string[],
  lookupTag: (tagId: string) => ReadonlySet<string> | undefined,
): ReadonlySet<string>;
```

## Control/data flow
1. A break/place attempt supplies the current mode, the target block id, and the held item's
   allowed set (the caller resolves components like `CanDestroy`/`CanPlaceOn` directly and tags via
   `resolveBlockPermissionSet`).
2. `canBreakBlock`/`canPlaceBlock` decide; a future wiring cancels the action when they return
   false.

## Detailed behavior
- `canBreakBlock` / `canPlaceBlock`:
  `survival` -> true; `creative` -> true; `spectator` -> false; `adventure` -> `allowed.has(blockId)`.
- `resolveBlockPermissionSet(directIds, tagIds, lookupTag)`:
  returns the union of `directIds` and, for each tag id, the members of `lookupTag(tagId)` when
  that returns a set; `undefined` results are skipped. Empty inputs -> the empty set. Duplicates
  collapse.

## Failure modes
- No throws anywhere; unknown tags and malformed lookups (undefined) degrade to empty membership.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- Decisions are O(1) set lookups; resolution is O(total declared + tag members).

## Testing seams
- Tests use a fake tag lookup map of canonical ids; the composed flow resolves tags then feeds
  `canBreakBlock`/`canPlaceBlock` for an adventure player.

## Observability/debugging
- Both rules are total functions of their inputs; a false result is the only signal a wiring
  needs to block an action.

## Affected files/symbols
- `src/simulation/AdventureModeRules.ts` (new).
- Tests: `tests/unit/AdventureModeRules.test.ts` (new). No other files.

## Rejected alternatives
- **Adding `CanDestroy`/`CanPlaceOn` components to 008's registry**: rejected — violates the
  zero-registry-change discipline; the wiring can read whatever components exist and pass declared
  ids in.
- **Importing `TagRegistry` directly**: rejected — an injected `(tagId) => set | undefined`
  lookup keeps the module pure and trivially testable while supporting any tag source.

## Downstream dependencies
- 195 (`spectator-mode`) consumes the spectator never-interact half of the rules; the game-modes
  wiring applies both rules in the break/place flows; 242's e2e drives adventure-mode restrictions.
