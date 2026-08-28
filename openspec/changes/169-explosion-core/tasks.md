# Tasks: 169-explosion-core

## Implementation
- [x] `src/simulation/ExplosionCore.ts`: `EXPLOSION_RAY_SAMPLES/STEP/DECAY/COUNT` constants.
- [x] `ExplosionWorld<S>` seam (getBlockState/isAir/isDestroyable/blastResistance/dropFor).
- [x] `ExplosionInput` / `ExplosionResult` / `EntityDamage` types.
- [x] `explosionRays()` (1352 deterministic unit rays; module-level cache).
- [x] `computeExplosion()` (ray march, marked-set dedup, destroyable filter, sorted destroyed,
      drop resolution; non-finite inputs -> empty).
- [x] `explosionEntityDamage()` (exposure=1 vanilla formula, input order, d<=1 filter).

## Tests
- [x] `tests/unit/ExplosionCore.test.ts`: rays are exactly 1352, unit length, deterministic.
- [x] All-air world destroys nothing.
- [x] Non-finite strength/center yields an empty result.
- [x] A reached low-resistance block is destroyed and its drop resolved.
- [x] A second stone layer behind the first is NOT destroyed (power dies).
- [x] Water absorbs rays, is never destroyed, and shields what is behind it.
- [x] Obsidian (resistance 1200) is not destroyed and blocks everything behind it.
- [x] Drops follow the sorted destroyed order; no-drop blocks contribute no entry.
- [x] Cross-call determinism (identical results).
- [x] Entity damage at d=0 (57), d=0.5 (22), d=1 (1); beyond-blast omitted.
- [x] Entity damage preserves input order and is deterministic.
- [x] Non-finite entity inputs return an empty list.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2298/2298 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 170-tnt-block-entity).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
