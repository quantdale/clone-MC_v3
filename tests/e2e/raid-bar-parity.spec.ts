import { test, expect, type Page } from '@playwright/test';

/**
 * Live raid bar parity (286) over 282 #raid-feedback + RaidStateMachine.
 * Proves village fallback, Bad Omen badge, data-raid-bar isolation from
 * #wither-boss-bar, a11y observables, dispose/reload hide.
 */

type RaidStateView = {
  status: string;
  waveIndex: number;
  totalWaves: number;
  raidersRemaining: number;
  ticks: number;
  badOmenLevel: number;
};

type GameHandle = {
  getRaidState(): RaidStateView | null;
  debugStartRaid(badOmenLevel?: number): RaidStateView;
  debugTickRaid(): RaidStateView | null;
  debugClearRaidWave(): RaidStateView | null;
  setRaidBarVillageName?(name: string | null | undefined): void;
  dispose(): void;
};

type BarSnapshot = {
  present: boolean;
  hidden: boolean;
  status: string | null;
  dataRaidBar: string | null;
  ariaLabel: string;
  title: string;
  detail: string;
  village: string;
  omenHidden: boolean;
  omenText: string;
  fillWidth: string;
  fillValueNow: string | null;
  witherVisible: boolean;
};

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 120_000 });
  await page.waitForFunction(
    () => (window as unknown as { __voxelGame?: GameHandle }).__voxelGame != null,
    null,
    { timeout: 120_000 },
  );
}

async function bar(page: Page): Promise<BarSnapshot> {
  return page.evaluate(() => {
    const el = document.getElementById('raid-feedback');
    const wither = document.getElementById('wither-boss-bar');
    if (!el) {
      return {
        present: false,
        hidden: true,
        status: null,
        dataRaidBar: null,
        ariaLabel: '',
        title: '',
        detail: '',
        village: '',
        omenHidden: true,
        omenText: '',
        fillWidth: '',
        fillValueNow: null,
        witherVisible: !!wither && wither.classList.contains('visible'),
      };
    }
    const fill = document.getElementById('raid-feedback-fill') as HTMLElement | null;
    const omen = document.getElementById('raid-bar-omen') as HTMLElement | null;
    return {
      present: true,
      hidden: el.classList.contains('hidden'),
      status: el.getAttribute('data-status'),
      dataRaidBar: el.getAttribute('data-raid-bar'),
      ariaLabel: el.getAttribute('aria-label') ?? '',
      title: document.getElementById('raid-feedback-title')?.textContent ?? '',
      detail: document.getElementById('raid-feedback-detail')?.textContent ?? '',
      village: document.getElementById('raid-bar-village')?.textContent ?? '',
      omenHidden: !omen || omen.hidden,
      omenText: omen?.textContent ?? '',
      fillWidth: fill?.style.width ?? '',
      fillValueNow: fill?.getAttribute('aria-valuenow') ?? null,
      witherVisible: !!wither && wither.classList.contains('visible'),
    };
  });
}

test.describe('raid bar parity (286)', () => {
  test('active raid shows wave, omen badge, village fallback; wither untouched', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    const boot = await bar(page);
    expect(boot.present).toBe(true);
    expect(boot.hidden).toBe(true);
    expect(boot.dataRaidBar).toBe('true');
    expect(boot.witherVisible).toBe(false);

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.debugStartRaid(3);
    });

    const active = await bar(page);
    expect(active.hidden).toBe(false);
    expect(active.status).toBe('ACTIVE');
    expect(active.dataRaidBar).toBe('true');
    expect(active.title).toBe('Raid');
    expect(active.detail).toMatch(/Wave \d+\/\d+/);
    expect(active.village).toBe('');
    expect(active.omenHidden).toBe(false);
    expect(active.omenText).toContain('Bad Omen 3');
    expect(active.ariaLabel).toContain('Raid active');
    expect(active.ariaLabel).toContain('Bad Omen level 3');
    expect(active.witherVisible).toBe(false);
    expect(Number(active.fillValueNow)).toBeGreaterThan(0);

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setRaidBarVillageName?.('Plains Hold');
    });
    const named = await bar(page);
    expect(named.village).toBe('Plains Hold');
    expect(named.ariaLabel).toContain('Plains Hold');

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.setRaidBarVillageName?.('   ');
    });
    const blank = await bar(page);
    expect(blank.village).toBe('');
  });

  test('victory/defeat terminal copy stays inspectable; dispose hides', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.debugStartRaid(1);
      // Clear remaining raiders until victory (bounded loop).
      for (let i = 0; i < 64; i++) {
        const s = g.getRaidState();
        if (!s || s.status === 'VICTORY' || s.status === 'DEFEAT') break;
        g.debugClearRaidWave();
      }
    });

    const terminal = await bar(page);
    expect(terminal.hidden).toBe(false);
    expect(['VICTORY', 'DEFEAT']).toContain(terminal.status);
    expect(terminal.dataRaidBar).toBe('true');
    if (terminal.status === 'VICTORY') {
      expect(terminal.fillWidth).toBe('100%');
    }

    const disposed = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.dispose();
      const el = document.getElementById('raid-feedback');
      const wither = document.getElementById('wither-boss-bar');
      return {
        raid: g.getRaidState(),
        hidden: !!el && el.classList.contains('hidden'),
        status: el?.getAttribute('data-status') ?? null,
        witherHasVisible: !!wither && wither.classList.contains('visible'),
      };
    });
    expect(disposed.raid).toBeNull();
    expect(disposed.hidden).toBe(true);
    expect(disposed.status).toBe('NONE');
    expect(disposed.witherHasVisible).toBe(false);
  });

  test('reload does not resurrect village/omen presentation from storage', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    // Boot without starting a raid: bar stays hidden (no resurrection of presentation fields).
    const boot = await bar(page);
    expect(boot.hidden).toBe(true);
    expect(boot.village).toBe('');
    expect(boot.omenHidden).toBe(true);
    expect(boot.omenText).toBe('');

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(1500);
    await waitForGame(page);

    const after = await bar(page);
    expect(after.hidden).toBe(true);
    expect(after.village).toBe('');
    expect(after.omenHidden).toBe(true);
  });
});
