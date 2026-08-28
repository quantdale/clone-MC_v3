# Tasks: 200-sound-event-system

## Implementation
- [x] `src/simulation/SoundEventFramework.ts`: `SoundCategory` + `SOUND_CATEGORIES` (8).
- [x] `SoundEventDef` / `SOUND_EVENTS` (18 original entries) + `soundEvent` lookup.
- [x] `emitSound` (defaults, option volume/pitch, pitch clamp, unknown -> null).
- [x] `audibleVolume` (distance attenuation).
- [x] `SoundMixState` / `createDefaultSoundMix` / `setCategoryVolume` (identity no-ops) /
      `categoryVolume` / `effectiveVolume`.
- [x] `serializeSoundMix` / `deserializeSoundMix` (version 1, validate-before-accept, descriptive
      throws).

## Tests
- [x] `tests/unit/SoundEventFramework.test.ts`: categories exact list; table (18 entries, field
      validity, known/unknown lookup).
- [x] Emission (defaults; overrides; pitch clamp; unknown -> null).
- [x] Attenuation (at listener, mid-range, at/over range).
- [x] Mix (defaults; set + validation; identity no-ops; effective volume scaling).
- [x] Persistence: round-trip; rejections (non-object, bad version, unknown category, volume out
      of range, unknown key) each named.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2627/2627 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 201-ambient-audio).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
