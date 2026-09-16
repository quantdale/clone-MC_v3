import { describe, it, expect } from 'vitest';
import { tickAmbient, type AmbientState } from '../../src/simulation/AmbientAudioFramework';
import { SilentAmbientBackend } from '../../src/audio/AmbientSoundBackend';

/** Harness mirroring Game.tickAmbientAudio mute/play policy (277). */
function tickWithPolicy(
  state: AmbientState,
  backend: SilentAmbientBackend,
  muted: boolean,
  opts: { environment: 'plains'; weather: 'clear' | 'rain'; isDay: boolean; rng: () => number },
): AmbientState {
  const { state: next, cue } = tickAmbient(state, opts);
  if (cue && !muted) backend.playAmbientCue(cue);
  return next;
}

describe('AmbientAudioIntegration mute policy (277)', () => {
  it('muted ticks still advance but do not play', () => {
    const backend = new SilentAmbientBackend();
    const rng = () => 0;
    let state: AmbientState = { environment: 'plains', musicDelay: 1, cueDelay: 99 };
    state = tickWithPolicy(state, backend, true, {
      environment: 'plains',
      weather: 'clear',
      isDay: true,
      rng,
    });
    expect(backend.played).toHaveLength(0);
    expect(state.musicDelay).not.toBe(1);
  });

  it('unmuted ticks deliver the cue', () => {
    const backend = new SilentAmbientBackend();
    const rng = () => 0;
    tickWithPolicy({ environment: 'plains', musicDelay: 1, cueDelay: 99 }, backend, false, {
      environment: 'plains',
      weather: 'clear',
      isDay: false,
      rng,
    });
    expect(backend.played).toHaveLength(1);
    expect(backend.played[0]!.soundEvent).toBe('music_night');
  });
});
