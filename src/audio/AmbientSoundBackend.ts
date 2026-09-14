import type { AmbientCue } from '../simulation/AmbientAudioFramework';

/** Injectable ambient playback seam (277). Headless CI uses SilentAmbientBackend. */
export interface AmbientSoundBackend {
  playAmbientCue(cue: AmbientCue): void;
}

/** Records cues; never touches AudioContext. */
export class SilentAmbientBackend implements AmbientSoundBackend {
  readonly played: AmbientCue[] = [];
  playAmbientCue(cue: AmbientCue): void {
    this.played.push(cue);
  }
  clear(): void {
    this.played.length = 0;
  }
}

/**
 * Optional oscillator backend for browsers with AudioContext.
 * Failures are swallowed (presentation-only).
 */
export class OscillatorAmbientBackend implements AmbientSoundBackend {
  private context: AudioContext | null = null;

  playAmbientCue(cue: AmbientCue): void {
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return;
    try {
      if (!this.context) this.context = new window.AudioContext();
      const ctx = this.context;
      if (ctx.state === 'suspended') void ctx.resume();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const music = cue.kind === 'music';
      osc.type = music ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(music ? 220 : 110, now);
      osc.frequency.exponentialRampToValueAtTime(music ? 330 : 80, now + (music ? 0.4 : 0.2));
      const vol = Math.max(0.0001, Math.min(1, cue.volume) * (music ? 0.03 : 0.02));
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(vol, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (music ? 0.45 : 0.22));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + (music ? 0.5 : 0.25));
    } catch {
      // presentation-only
    }
  }

  dispose(): void {
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
  }
}
