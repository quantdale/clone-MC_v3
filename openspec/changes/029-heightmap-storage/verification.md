# Verification: 029-heightmap-storage

Status: **VERIFIED**

Advancement allowed: **true**

029 started only after 028 was VERIFIED.

## Requirement evidence

| Requirement | Result |
| --- | --- |
| Surface heightmap returns the topmost non-air block | PASS — empty column returns `minY - 1`; topmost non-air wins (10 then 20) |
| Motion-blocking heightmap returns the topmost solid block | PASS — stone sets `M`; water (non-solid) excluded when `blockRegistry` supplied |
| Fallback when no `blockRegistry` supplied | PASS — water counts as motion-blocking, `M` equals surface |
| Heightmaps update incrementally on write | PASS — placing above raises (`20 → 30`); placing below leaves top unchanged |
| Removing the top block rescans downward | PASS — removing top `20` rescans to `10`; removing last returns `minY - 1` |
| Column-independent and recomputable; deserialize recomputes | PASS — independent columns; `recomputeHeightmaps` reproduces; deserialized column recomputes on first read |
| typecheck | PASS |
| lint | PASS |
| full unit suite | PASS 449/449 (prior 437 + 12 new HeightmapStorage tests) |
| production build | PASS via Playwright production webServer |
| E2E | PASS 19/19 |

No advancement exception was needed. Expected completion is 100%; achieved 100%.

## Gate table

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npx vitest run tests/unit/HeightmapStorage.test.ts` | PASS 12/12 |
| `npm test` (full) | PASS 449/449 |
| `npm run build` | PASS |
| `npm run test:e2e` | PASS 19/19 |

## Edge / adversarial validation

- Empty column (no writes): both heightmaps return the sentinel `minY - 1` for every `(x,z)` — confirmed.
- Replacing the exact top block with air triggers a downward rescan to the next qualifying block, not a stale top.
- `deserialize` does not carry the runtime maps; the first read recomputes from restored blocks (no persisted map, no stale sentinel).
- `recomputeHeightmaps()` is the authoritative reset and reproduces both maps from current state.

## Migration / compatibility validation

Additive; `serialize`/`deserialize` byte layout unchanged; heightmaps are runtime-only. `ChunkColumnOptions.blockRegistry` is optional — existing constructors (including `VerticalWorldAccess`, which omits it) keep working.

## Performance / resource validation

O(1) read and single-write update; downward rescan only on top-block removal (bounded by column height <= 384); `recomputeHeightmaps` is O(256 * height), one-time, not on a hot path; two `Int16Array(256)` = 512 bytes per column.

## Regressions

None. Full unit suite 437 → 449 (+12); E2E 19/19 unchanged.

## Incomplete tasks

None.

## Advancement Exception

Not applicable (100% complete).

## Final decision

029 is VERIFIED at 100%. 030 (`030-chunk-status-model`) is unblocked and may now be activated.
