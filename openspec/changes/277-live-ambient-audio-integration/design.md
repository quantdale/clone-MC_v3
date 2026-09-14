# Design: 277-live-ambient-audio-integration

- Scheduler remains pure (`tickAmbient`); Game supplies environment/weather/isDay/rng.
- Backend interface `playAmbientCue(cue)`; SilentAmbientBackend records cues for tests; default in production may be silent or oscillator when AudioContext exists.
- No persistence: AmbientAudioFramework has no serialize pair; state re-rolls on boot (ephemeral).
- Mute: `ambientMuted` Game flag skips backend play.
