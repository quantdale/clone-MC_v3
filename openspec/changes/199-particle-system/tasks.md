# Tasks: 199-particle-system

## Implementation
- [x] `src/simulation/ParticleSystem.ts`: `ParticleKindId` / `ParticleKind` / `Particle` /
      `ParticlePool` / `Vec3` types.
- [x] `PARTICLE_KINDS` fixed table (block_debris/explosion/rain_splash) + `particleKind` lookup.
- [x] `createParticlePool` (positive-integer capacity; descriptive throws).
- [x] `spawnParticle` (append; full pool identity no-op).
- [x] `stepParticles` (drag, gravity, integration, life -1, removal; empty identity no-op).
- [x] `spawnBurst` (rng-driven velocity/life; partial spawn near full; invalid count no-op).
- [x] `emitParticleEvent` (block_break 8 debris, explosion 24, rain 1; unknown identity no-op).

## Tests
- [x] `tests/unit/ParticleSystem.test.ts`: kind table (3 kinds, order, constraint validity);
      lookup (known/unknown).
- [x] Pool creation (valid capacities; 0/negative/non-integer/NaN throws).
- [x] Spawn (fields incl. life/maxLife; full pool identity).
- [x] Step (exact physics on a known particle; removal; empty identity).
- [x] Burst (fixed rng `() => 0.5` math; partial spawn at 1 free slot; invalid counts).
- [x] Event hooks (counts/kinds per event; unknown event identity).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2614/2614 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 200-sound-event-system).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
