import { describe, it, expect } from 'vitest';
import {
  createDefaultAmbientState,
  tickAmbient,
  type AmbientState,
} from '../../src/simulation/AmbientAudioFramework';
import { SilentAmbientBackend } from '../../src/audio/AmbientSoundBackend';

describe('AmbientSoundBackend + scheduler wiring (277)', () => {
  it('delivers forced cues to the silent backend', () => {
    const backend = new SilentAmbientBackend();
    let rngCalls = 0;
    const rng = () => {
      rngCalls += 1;
      return 0; // roll minima
    };
    const state: AmbientState = {
      environment: 'plains',
      musicDelay: 1,
      cueDelay: 50,
    };
    const { state: next, cue } = tickAmbient(state, {
      environment: 'plains',
      weather: 'clear',
      isDay: true,
      rng,
    });
    expect(cue).not.toBeNull();
    expect(cue!.kind).toBe('music');
    if (cue) backend.playAmbientCue(cue);
    expect(backend.played).toHaveLength(1);
    expect(backend.played[0]!.soundEvent).toBe('music_day');
    expect(next.musicDelay).toBeGreaterThan(0);
    expect(rngCalls).toBeGreaterThan(0);
  });

  it('createDefaultAmbientState is deterministic for a fixed rng sequence', () => {
    const seq = [0.1, 0.2, 0.3, 0.4];
    let i = 0;
    const rng = () => seq[i++ % seq.length]!;
    const a = createDefaultAmbientState(rng);
    i = 0;
    const b = createDefaultAmbientState(rng);
    expect(a).toEqual(b);
  });
});
