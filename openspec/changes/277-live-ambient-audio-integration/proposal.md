# Proposal: 277-live-ambient-audio-integration

Wire AmbientAudioFramework into live Game with an injectable audio backend (silent default for CI).

## Scope
- Game owns AmbientState; tickAmbient on fixed tick from environment/weather/day.
- Injectable AmbientSoundBackend (silent + optional oscillator).
- Ephemeral state (framework has no serialize) — documented.
- Unit + harness/E2E proving cues under controlled rng.
- Minimal mute flag.
- Original/procedural audio only; 258 BLOCKED.
