import { describe, it, expect } from 'vitest';
import {
  projectRaidBar,
  resolveVillageName,
  clampOmenLevel,
  RAID_BAR_VILLAGE_FALLBACK,
} from '../../src/ui/RaidBarParity';
import { projectRaidFeedback } from '../../src/ui/RaidFeedbackView';
import {
  startRaid,
  tickRaid,
  RAID_BASE_WAVES,
  type RaidState,
} from '../../src/simulation/RaidStateMachine';

function active(overrides: Partial<RaidState> = {}): RaidState {
  return {
    ...startRaid(0, 64, 0, 3),
    status: 'ACTIVE',
    waveIndex: 2,
    totalWaves: 3,
    raidersRemaining: 4,
    badOmenLevel: 3,
    ...overrides,
  };
}

describe('projectRaidBar (286)', () => {
  it('is total for null: hidden, progress 0, omen 0, fallback village', () => {
    const view = projectRaidBar(null);
    expect(view.visible).toBe(false);
    expect(view.status).toBe('NONE');
    expect(view.progress).toBe(0);
    expect(view.badOmenLevel).toBe(0);
    expect(view.villageName).toBe(RAID_BAR_VILLAGE_FALLBACK);
    expect(view.ariaLabel).toBe('');
  });

  it('hides INACTIVE safely', () => {
    const view = projectRaidBar({ ...startRaid(0, 64, 0, 1), status: 'INACTIVE' });
    expect(view.visible).toBe(false);
    expect(view.progress).toBe(0);
    expect(view.badOmenLevel).toBe(0);
  });

  it('shows active wave progress and omen level', () => {
    const view = projectRaidBar(active());
    expect(view.visible).toBe(true);
    expect(view.status).toBe('ACTIVE');
    expect(view.wave).toBe(2);
    expect(view.totalWaves).toBe(3);
    expect(view.raidersRemaining).toBe(4);
    expect(view.progress).toBeCloseTo(2 / 3, 10);
    expect(view.badOmenLevel).toBe(3);
    expect(view.ariaLabel).toContain('Raid active');
    expect(view.ariaLabel).toContain('Bad Omen level 3');
  });

  it('presents an explicit village name in the view and aria label', () => {
    const view = projectRaidBar(active(), { villageName: 'Plains Hold' });
    expect(view.villageName).toBe('Plains Hold');
    expect(view.ariaLabel).toContain('Plains Hold');
  });

  it('uses empty fallback for missing/blank/non-string village names', () => {
    expect(projectRaidBar(active()).villageName).toBe('');
    expect(projectRaidBar(active(), { villageName: '' }).villageName).toBe('');
    expect(projectRaidBar(active(), { villageName: '   ' }).villageName).toBe('');
    expect(
      projectRaidBar(active(), { villageName: 12 as unknown as string }).villageName,
    ).toBe('');
    expect(resolveVillageName(null)).toBe(RAID_BAR_VILLAGE_FALLBACK);
    expect(resolveVillageName(undefined)).toBe(RAID_BAR_VILLAGE_FALLBACK);
  });

  it('clamps non-finite counters and omen into the domain', () => {
    const view = projectRaidBar(
      active({
        waveIndex: Number.NaN,
        totalWaves: Number.POSITIVE_INFINITY,
        raidersRemaining: Number.NEGATIVE_INFINITY,
        badOmenLevel: Number.NaN,
      }),
    );
    expect(view.progress).toBeGreaterThanOrEqual(0);
    expect(view.progress).toBeLessThanOrEqual(1);
    expect(Number.isFinite(view.progress)).toBe(true);
    expect(view.badOmenLevel).toBe(0);
    expect(Number.isInteger(view.badOmenLevel)).toBe(true);
    expect(clampOmenLevel(-1.5)).toBe(0);
    expect(clampOmenLevel(2.9)).toBe(2);
  });

  it('renders VICTORY with full progress and omen', () => {
    const view = projectRaidBar({ ...active(), status: 'VICTORY' });
    expect(view.visible).toBe(true);
    expect(view.status).toBe('VICTORY');
    expect(view.progress).toBe(1);
    expect(view.badOmenLevel).toBe(3);
  });

  it('renders DEFEAT with reached-wave progress', () => {
    const view = projectRaidBar({
      ...active({ waveIndex: 2, totalWaves: 3 }),
      status: 'DEFEAT',
    });
    expect(view.visible).toBe(true);
    expect(view.status).toBe('DEFEAT');
    expect(view.progress).toBeCloseTo(2 / 3, 10);
    expect(view.detail).toContain('wave 2');
  });

  it('matches 282 wave/detail for a real started raid (isolation of core fields)', () => {
    const { state } = tickRaid(startRaid(1, 64, -1, 1));
    const bar = projectRaidBar(state);
    const feedback = projectRaidFeedback(state);
    expect(bar.visible).toBe(feedback.visible);
    expect(bar.detail).toBe(feedback.detail);
    expect(bar.progress).toBe(feedback.progress);
    expect(bar.wave).toBe(1);
    expect(bar.totalWaves).toBe(RAID_BASE_WAVES);
    expect(bar.badOmenLevel).toBe(1);
  });

  it('does not import wither/HudParity boss-bar modules', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../src/ui/RaidBarParity.ts', import.meta.url), 'utf8'),
    );
    expect(src).not.toMatch(
      /from ['"].*(BossFramework|HudBossBar|WitherBossBar|HudParity|WitherBossBarParity)/,
    );
    expect(src).not.toMatch(/getElementById\(['"]wither-boss-bar['"]\)/);
  });
});
