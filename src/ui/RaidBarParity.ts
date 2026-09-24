/**
 * Change 286: pure bounded raid-bar parity projection over RaidState.
 * Distinct from wither boss-bar / HudParity / BossFramework. Does not mutate
 * inputs; total for null and every valid RaidState; never throws.
 * 282's projectRaidFeedback remains the minimal wave/remaining view — this
 * module is the richer parity view (village fallback + Bad Omen level).
 */
import type { RaidState, RaidStatus } from '../simulation/RaidStateMachine';

/** Displayed status vocabulary: the machine status plus an explicit `NONE`. */
export type RaidBarStatus = RaidStatus | 'NONE';

/** Optional presentation-only context; never mutates simulation state. */
export interface RaidBarContext {
  readonly villageName?: string;
}

/**
 * Documented village fallback when context is missing, non-string, or
 * whitespace-only: empty string (no invented settlement name).
 */
export const RAID_BAR_VILLAGE_FALLBACK = '';

/** One projected, presentation-ready view of the raid bar. */
export interface RaidBarView {
  readonly visible: boolean;
  readonly status: RaidBarStatus;
  readonly title: string;
  readonly detail: string;
  readonly villageName: string;
  readonly badOmenLevel: number;
  readonly wave: number;
  readonly totalWaves: number;
  readonly raidersRemaining: number;
  readonly progress: number;
  readonly ariaLabel: string;
}

const HIDDEN: RaidBarView = Object.freeze({
  visible: false,
  status: 'NONE',
  title: '',
  detail: '',
  villageName: RAID_BAR_VILLAGE_FALLBACK,
  badOmenLevel: 0,
  wave: 0,
  totalWaves: 0,
  raidersRemaining: 0,
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

/** Non-negative integer floor; non-finite → 0. */
export function clampOmenLevel(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * Resolve villageName from optional context. Absent / non-string / whitespace
 * → documented fallback (empty string). Never invents a name from coordinates.
 */
export function resolveVillageName(context?: RaidBarContext | null): string {
  if (context == null) return RAID_BAR_VILLAGE_FALLBACK;
  const raw = (context as { villageName?: unknown }).villageName;
  if (typeof raw !== 'string') return RAID_BAR_VILLAGE_FALLBACK;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return RAID_BAR_VILLAGE_FALLBACK;
  return trimmed;
}

function buildAriaLabel(
  status: RaidBarStatus,
  detail: string,
  villageName: string,
  omen: number,
): string {
  const parts: string[] = [];
  if (status === 'ACTIVE') parts.push(`Raid active. ${detail}.`);
  else if (status === 'VICTORY') parts.push('Raid victory. All waves cleared.');
  else if (status === 'DEFEAT') parts.push(`Raid defeated. ${detail}`);
  else return '';
  if (villageName) parts.push(`Settlement ${villageName}.`);
  if (omen >= 1) parts.push(`Bad Omen level ${omen}.`);
  return parts.join(' ');
}

/**
 * Project `state` (+ optional village context) into a bounded raid-bar view.
 *
 * - `null` / `INACTIVE` → hidden (`visible: false`, progress 0, omen 0).
 * - `ACTIVE` → visible with wave/remaining, clamped progress, omen, village.
 * - `VICTORY` → visible, progress 1.
 * - `DEFEAT` → visible, progress reached/total.
 */
export function projectRaidBar(
  state: RaidState | null,
  context?: RaidBarContext | null,
): RaidBarView {
  const villageName = resolveVillageName(context);

  if (state === null) return HIDDEN;
  if (state.status === 'INACTIVE') return HIDDEN;

  const omen = clampOmenLevel(state.badOmenLevel);

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
      villageName,
      badOmenLevel: omen,
      wave,
      totalWaves: total,
      raidersRemaining: remaining,
      progress,
      ariaLabel: buildAriaLabel('ACTIVE', detail, villageName, omen),
    };
  }

  if (state.status === 'VICTORY') {
    const detail = 'All waves cleared.';
    return {
      visible: true,
      status: 'VICTORY',
      title: 'Raid victory',
      detail,
      villageName,
      badOmenLevel: omen,
      wave: safeCount(state.waveIndex),
      totalWaves: safeCount(state.totalWaves),
      raidersRemaining: safeCount(state.raidersRemaining),
      progress: 1,
      ariaLabel: buildAriaLabel('VICTORY', detail, villageName, omen),
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
    villageName,
    badOmenLevel: omen,
    wave,
    totalWaves: total,
    raidersRemaining: safeCount(state.raidersRemaining),
    progress,
    ariaLabel: buildAriaLabel('DEFEAT', detail, villageName, omen),
  };
}
