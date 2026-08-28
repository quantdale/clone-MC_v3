# Verification: 111-item-entity-drops

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| unique id minting | ItemEntityManager.test.ts (id minting + deserialize continuation to maxId+1) | PASS |
| spawn validation | ItemEntityManager.test.ts (unknown item / oversize / non-positive / non-integer count / NaN coord / NaN vel) | PASS |
| stack splitting | ItemEntityManager.test.ts (200→64/64/64/8, multi-stack) | PASS |
| block-break spawns world item entities | PlayerInteraction.test.ts + e2e `breaking a block spawns a world item entity` | PASS |
| deterministic spawn jitter | ItemEntityManager.test.ts (no-rng exact positions; fixed-rng determinism) | PASS |
| age ticking | ItemEntityManager.test.ts (1s→20, 0.5s→+10, dt<=0 no-op) | PASS |
| query and removal | ItemEntityManager.test.ts (removal + insertion order + chunk grouping) | PASS |
| 037 envelope serialization | ItemEntityManager.test.ts (round-trip fractional pos/vel; foreign typeKey + malformed data reject atomically) | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npm test` | PASS | 1290 passed (124 files); new `ItemEntityManager.test.ts` (23) + `PlayerInteraction.test.ts` rewrite (5) |
| `npm run build` | PASS | `tsc --noEmit && vite build` → dist assets |
| `npm run test:e2e` | PASS | 20 passed (1.7m); new `breaking a block spawns a world item entity` (test 18) |

## Edge / adversarial validation

- Unknown item id rejected; manager unchanged.
- Oversize count rejected by `spawnItemEntity`; `spawnLootStacks` splits instead.
- Non-finite coordinate/velocity rejected.
- `deserializeAll` rejects foreign `typeKey` and malformed `data` atomically.
- `tickItemEntities(dt<=0)` is a no-op.
- `spawnLootStacks([])` is a no-op returning `[]`.

## Migration / compatibility validation

- Serialized entities use the 037 `SerializedEntity` envelope; `serializeAll` →
  `deserializeAll` is the identity. No registry/codec changes.

## Performance / resource validation

- O(live entities) per tick, no per-entity allocation.
- Splitting bounded by `ceil(count/stackSize)`.

## Regressions

- Block-break e2e still asserts the block becomes air (unchanged).
- No other `selector.addItem` calls removed (place-failure re-add intact).
- Unit + e2e baselines remain green.

## Incomplete tasks

- None.

## Advancement Exception

Not applicable — completion is 100% with all MUST/SHALL requirements verified.

## Final decision

VERIFIED — full gate green, spec and implementation reconciled. Advance to
112-item-pickup-and-despawn.
