/**
 * Change 282: pure bounded projection from an ephemeral {@link RaidState} into
 * the single accessible raid feedback bar. Total for `null` and every valid
 * state; never throws; never mutates its input. `RaidStateMachine` remains the
 * sole lifecycle authority — this module only formats presentation values and
 * clamps progress into `[0, 1]`.
 */
import type { RaidState, RaidStatus } from '../simulation/RaidStateMachine';

/** Displayed status vocabulary: the machine status plus an explicit `NONE`. */
export type RaidFeedbackStatus = RaidStatus | 'NONE';

/** One projected, presentation-ready view of the raid feedback bar. */
export interface RaidFeedbackView {
  readonly visible: boolean;
  readonly status: RaidFeedbackStatus;
  readonly title: string;
  readonly detail: string;
  readonly progress: number;
  readonly ariaLabel: string;
}

const HIDDEN: RaidFeedbackView = Object.freeze({
  visible: false,
  status: 'NONE',
  title: '',
  detail: '',
  progress: 0,
  ariaLabel: '',
});

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Project `state` into a bounded feedback view.
 *
 * - `null` / `INACTIVE` → hidden (`visible: false`, empty detail, `progress: 0`).
 * - `ACTIVE` → visible with `Wave <wave>/<total> · <remaining> raiders remaining`
 *   and progress `waveIndex / totalWaves` clamped to `[0,1]`.
 * - `VICTORY` → visible, progress `1`, detail states all waves cleared.
 * - `DEFEAT` → visible, detail reports the reached wave, progress is the
 *   clamped reached-wave fraction.
 */
export function projectRaidFeedback(state: RaidState | null): RaidFeedbackView {
  if (state === null) return HIDDEN;
  if (state.status === 'INACTIVE') return HIDDEN;

  if (state.status === 'ACTIVE') {
    const wave = safeCount(state.waveIndex);
    const total = safeCount(state.totalWaves);
    const remaining = safeCount(state.raidersRemaining);
    const progress = total > 0 ? clamp01(wave / total) : 0;
    const detail = `Wave ${wave}/${total} · ${remaining} raiders remaining`;
    return {
      visible: true,
      status: 'ACTIVE',
      title: 'Raid',
      detail,
      progress,
      ariaLabel: `Raid active. ${detail}.`,
    };
  }

  if (state.status === 'VICTORY') {
    return {
      visible: true,
      status: 'VICTORY',
      title: 'Raid victory',
      detail: 'All waves cleared.',
      progress: 1,
      ariaLabel: 'Raid victory. All waves cleared.',
    };
  }

  // DEFEAT
  const wave = safeCount(state.waveIndex);
  const total = safeCount(state.totalWaves);
  const progress = total > 0 ? clamp01(wave / total) : 0;
  const detail = `Defeated at wave ${wave}.`;
  return {
    visible: true,
    status: 'DEFEAT',
    title: 'Raid defeated',
    detail,
    progress,
    ariaLabel: `Raid defeated. ${detail}`,
  };
}
