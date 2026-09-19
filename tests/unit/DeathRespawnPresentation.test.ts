import { describe, expect, it } from 'vitest';
import {
  createDeathPresentation,
  formatDeathCause,
  normalizeDeathCause,
} from '../../src/simulation/DeathRespawnPresentation';

describe('DeathRespawnPresentation (280)', () => {
  it('normalizes the supported causes and fails closed for unknown input', () => {
    expect(normalizeDeathCause(' FALL ')).toBe('fall');
    expect(normalizeDeathCause('drowning')).toBe('drowning');
    expect(normalizeDeathCause('lava')).toBe('lava');
    expect(normalizeDeathCause('starvation')).toBe('starvation');
    expect(normalizeDeathCause('wither')).toBe('wither');
    expect(normalizeDeathCause('debug')).toBe('debug');
    expect(normalizeDeathCause('damage')).toBe('damage');
    expect(normalizeDeathCause('raw attacker payload')).toBe('unknown');
    expect(normalizeDeathCause({ reason: 'lava' })).toBe('unknown');
    expect(formatDeathCause('unknown')).toBe('Unknown damage');
  });

  it('creates a normal-world respawn presentation with stable player text', () => {
    expect(createDeathPresentation('debug', false)).toEqual({
      cause: 'debug',
      causeText: 'Debug damage',
      outcome: 'respawned',
      outcomeText: 'Respawned safely',
      actionLabel: 'Continue',
    });
  });

  it('creates a hardcore spectator presentation without exposing raw reasons', () => {
    expect(createDeathPresentation('attacker: <script>', true)).toEqual({
      cause: 'unknown',
      causeText: 'Unknown damage',
      outcome: 'spectating',
      outcomeText: 'Hardcore death — now spectating',
      actionLabel: 'Continue spectating',
    });
  });
});
