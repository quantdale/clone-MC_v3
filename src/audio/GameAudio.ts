/**
 * Tiny procedural sound layer. It avoids external assets while still giving
 * the main actions a bit of tactile feedback. Browsers may keep AudioContext
 * suspended until the first user gesture; calls are safe before that gesture.
 */
export class GameAudio {
  private context: AudioContext | null = null;

  play(action: 'break' | 'place' | 'craft' | 'eat' | 'damage'): void {
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
      return;
    }
    try {
      const context = this.getContext();
      if (context.state === 'suspended') {
        void context.resume();
      }
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const settings = this.settings(action);
      oscillator.type = settings.type;
      oscillator.frequency.setValueAtTime(settings.start, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, settings.end), now + settings.duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(settings.volume, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + settings.duration + 0.02);
    } catch {
      // Audio is presentation-only; a blocked or unavailable context must not
      // affect gameplay or trigger the fatal error UI.
    }
  }

  dispose(): void {
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
  }

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new window.AudioContext();
    }
    return this.context;
  }

  private settings(action: 'break' | 'place' | 'craft' | 'eat' | 'damage'): {
    type: OscillatorType;
    start: number;
    end: number;
    duration: number;
    volume: number;
  } {
    switch (action) {
      case 'break':
        return { type: 'square', start: 170, end: 70, duration: 0.09, volume: 0.035 };
      case 'place':
        return { type: 'triangle', start: 220, end: 420, duration: 0.12, volume: 0.04 };
      case 'craft':
        return { type: 'sine', start: 300, end: 720, duration: 0.22, volume: 0.045 };
      case 'eat':
        return { type: 'sine', start: 180, end: 280, duration: 0.16, volume: 0.04 };
      case 'damage':
        return { type: 'sawtooth', start: 120, end: 55, duration: 0.18, volume: 0.05 };
    }
  }
}
