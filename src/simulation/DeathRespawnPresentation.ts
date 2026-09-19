/**
 * Transient death/respawn presentation (280). This module deliberately owns
 * no health, mode, position, or persistence state; it only normalizes the
 * existing SurvivalSystem reason into a safe player-facing view.
 */

export type DeathCause =
  | 'fall'
  | 'drowning'
  | 'lava'
  | 'starvation'
  | 'wither'
  | 'debug'
  | 'damage'
  | 'unknown';

export type DeathOutcome = 'respawned' | 'spectating';

export interface DeathPresentation {
  readonly cause: DeathCause;
  readonly causeText: string;
  readonly outcome: DeathOutcome;
  readonly outcomeText: string;
  readonly actionLabel: string;
}

const CAUSE_TEXT: Readonly<Record<DeathCause, string>> = {
  fall: 'Fall',
  drowning: 'Drowning',
  lava: 'Lava',
  starvation: 'Starvation',
  wither: 'Wither',
  debug: 'Debug damage',
  damage: 'Damage',
  unknown: 'Unknown damage',
};

/** Normalize a possibly malformed damage reason without exposing raw input. */
export function normalizeDeathCause(reason: unknown): DeathCause {
  if (typeof reason !== 'string') return 'unknown';
  const normalized = reason.trim().toLowerCase();
  if (normalized === 'fall') return 'fall';
  if (normalized === 'drowning') return 'drowning';
  if (normalized === 'lava') return 'lava';
  if (normalized === 'starvation') return 'starvation';
  if (normalized === 'wither') return 'wither';
  if (normalized === 'debug') return 'debug';
  if (normalized === 'damage') return 'damage';
  return 'unknown';
}

export function formatDeathCause(cause: DeathCause): string {
  return CAUSE_TEXT[cause] ?? CAUSE_TEXT.unknown;
}

export function createDeathPresentation(reason: unknown, hardcore: boolean): DeathPresentation {
  const cause = normalizeDeathCause(reason);
  const outcome: DeathOutcome = hardcore ? 'spectating' : 'respawned';
  return {
    cause,
    causeText: formatDeathCause(cause),
    outcome,
    outcomeText: hardcore ? 'Hardcore death — now spectating' : 'Respawned safely',
    actionLabel: hardcore ? 'Continue spectating' : 'Continue',
  };
}
