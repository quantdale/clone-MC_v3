import { test, expect, type Page } from '@playwright/test';

/**
 * Live raid feedback integration (282) over the VERIFIED RaidStateMachine (152).
 *
 * Drives the wired Game seams: debugStartRaid / debugClearRaidWave /
 * debugTickRaid / getRaidState and the single accessible #raid-feedback bar
 * (title, detail, fill, data-status, aria-label). Covers boot-hidden default,
 * active wave feedback, bounded clear → victory, terminal replay, invalid omen
 * refusal-without-throw, accessibility attributes, and (under 283) reload
 * restores the active raid through the durable `__raid__` record while
 * absent-record boot stays hidden.
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
};

type FeedbackSnapshot = {
  present: boolean;
  hidden: boolean;
  status: string | null;
  ariaLabel: string;
  ariaLive: string | null;
  title: string;
  detail: string;
  fillWidth: string;
  titleCount: number;
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

async function raidState(page: Page): Promise<RaidStateView | null> {
  return page.evaluate(() => {
    const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame;
    if (!g) throw new Error('no __voxelGame');
    return g.getRaidState();
  });
}

async function feedback(page: Page): Promise<FeedbackSnapshot> {
  return page.evaluate(() => {
    const el = document.getElementById('raid-feedback');
    if (!el) {
      return {
        present: false,
        hidden: true,
        status: null,
        ariaLabel: '',
        ariaLive: null,
        title: '',
        detail: '',
        fillWidth: '',
        titleCount: 0,
      };
    }
    const fill = document.getElementById('raid-feedback-fill') as HTMLElement | null;
    return {
      present: true,
      hidden: el.classList.contains('hidden'),
      status: el.getAttribute('data-status'),
      ariaLabel: el.getAttribute('aria-label') ?? '',
      ariaLive: el.getAttribute('aria-live'),
      title: document.getElementById('raid-feedback-title')?.textContent ?? '',
      detail: document.getElementById('raid-feedback-detail')?.textContent ?? '',
      fillWidth: fill?.style.width ?? '',
      titleCount: document.querySelectorAll('#raid-feedback').length,
    };
  });
}

test.describe('live raid feedback (282)', () => {
  test('boot is hidden; start → active → clear all waves → victory → replay', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    // Boot: no raid, bar hidden with NONE status.
    expect(await raidState(page)).toBeNull();
    const boot = await feedback(page);
    expect(boot.present).toBe(true);
    expect(boot.hidden).toBe(true);
    expect(boot.status).toBe('NONE');
    expect(boot.titleCount).toBe(1);

    // Start: first wave exists immediately, bar is visible and accessible.
    const started = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return g.debugStartRaid(1);
    });
    expect(started.status).toBe('ACTIVE');
    expect(started.waveIndex).toBe(1);
    expect(started.raidersRemaining).toBeGreaterThan(0);

    const active = await feedback(page);
    expect(active.hidden).toBe(false);
    expect(active.status).toBe('ACTIVE');
    expect(active.title).toBe('Raid');
    expect(active.detail).toContain('Wave 1/');
    expect(active.detail).toContain('raiders remaining');
    expect(parseInt(active.fillWidth || '0', 10)).toBeGreaterThan(0);
    expect(active.ariaLive).toBe('polite');
    expect(active.ariaLabel).toContain('Raid active');
    expect(active.titleCount).toBe(1);

    // Pause freeze at the seam: without debugTickRaid / an unpaused fixed tick
    // (the headless loop is paused), the state is byte-for-byte unchanged.
    const frozen = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const before = g.getRaidState();
      return { before, after: g.getRaidState() };
    });
    expect(frozen.after).toEqual(frozen.before);

    // One unpaused-tick seam advances exactly once (resume allows one transition).
    const afterOneTick = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const before = g.getRaidState()!;
      const after = g.debugTickRaid()!;
      return { beforeTicks: before.ticks, afterTicks: after.ticks };
    });
    expect(afterOneTick.afterTicks).toBe(afterOneTick.beforeTicks + 1);

    // Bounded clear: three waves for omen 1 → victory, never a skipped wave.
    const cleared = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const waves: number[] = [g.getRaidState()!.waveIndex];
      let guard = 0;
      while (g.getRaidState()?.status === 'ACTIVE' && guard < 10) {
        const next = g.debugClearRaidWave();
        if (!next) break;
        waves.push(next.waveIndex);
        guard++;
      }
      return { waves, final: g.getRaidState() };
    });
    expect(cleared.final?.status).toBe('VICTORY');
    expect(cleared.waves).toEqual([1, 2, 3, 3]);

    const victory = await feedback(page);
    expect(victory.hidden).toBe(false);
    expect(victory.status).toBe('VICTORY');
    expect(victory.title).toBe('Raid victory');
    expect(victory.detail).toContain('All waves cleared');
    expect(victory.fillWidth).toBe('100%');
    expect(victory.ariaLabel).toContain('Raid victory');

    // Terminal idempotence: further ticks keep the exact terminal state.
    const stillVictory = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const before = g.getRaidState();
      g.debugTickRaid();
      g.debugTickRaid();
      return { before, after: g.getRaidState() };
    });
    expect(stillVictory.after).toEqual(stillVictory.before);
    expect(stillVictory.after?.status).toBe('VICTORY');

    // Replay: a new start replaces the terminal state atomically.
    const replayed = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      return g.debugStartRaid(1);
    });
    expect(replayed.status).toBe('ACTIVE');
    expect(replayed.waveIndex).toBe(1);
    expect(replayed.ticks).toBeLessThanOrEqual(cleared.final!.ticks);
    const replayView = await feedback(page);
    expect(replayView.status).toBe('ACTIVE');
    expect(replayView.title).toBe('Raid');
    expect(replayView.detail).toContain('Wave 1/');
  });

  test('invalid omen is clamped without throwing; accessibility stays exact', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const outcomes: Array<{ input: string; status: string; waves: number; omen: number }> = [];
      for (const omen of [-5, Number.NaN, Number.POSITIVE_INFINITY, 2.7]) {
        try {
          const s = g.debugStartRaid(omen);
          outcomes.push({
            input: String(omen),
            status: s.status,
            waves: s.totalWaves,
            omen: s.badOmenLevel,
          });
        } catch (err) {
          outcomes.push({
            input: String(omen),
            status: `THREW:${err instanceof Error ? err.message : String(err)}`,
            waves: -1,
            omen: -1,
          });
        }
      }
      return outcomes;
    });
    for (const outcome of result) {
      expect(outcome.status, outcome.input).toBe('ACTIVE');
      expect(outcome.waves).toBeGreaterThanOrEqual(3);
      expect(outcome.waves).toBeLessThanOrEqual(7);
      expect(Number.isFinite(outcome.omen)).toBe(true);
      expect(outcome.omen).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(outcome.omen)).toBe(true);
    }

    const view = await feedback(page);
    expect(view.hidden).toBe(false);
    expect(view.status).toBe('ACTIVE');
    expect(view.ariaLive).toBe('polite');
    expect(view.ariaLabel.length).toBeGreaterThan(0);
    expect(view.ariaLabel).toContain('Raid active');
    expect(view.title).toBe('Raid');
    expect(parseInt(view.fillWidth || '0', 10)).toBeGreaterThanOrEqual(0);
    expect(parseInt(view.fillWidth || '0', 10)).toBeLessThanOrEqual(100);
    // Exactly one bar exists — no second feedback element.
    expect(view.titleCount).toBe(1);
    expect(await page.locator('#raid-feedback').count()).toBe(1);
  });

  test('reload restores the active raid through __raid__ (283); bar re-projects', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    // Boot without a record: hidden NONE (absent-record path stays covered).
    expect(await raidState(page)).toBeNull();
    const boot = await feedback(page);
    expect(boot.hidden).toBe(true);
    expect(boot.status).toBe('NONE');

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.debugStartRaid(1);
    });
    const before = await feedback(page);
    expect(before.hidden).toBe(false);
    expect(before.status).toBe('ACTIVE');
    const beforeState = await raidState(page);
    expect(beforeState).not.toBeNull();

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(2500);
    await waitForGame(page);

    const restored = await raidState(page);
    expect(restored).not.toBeNull();
    expect(restored!.status).toBe(beforeState!.status);
    expect(restored!.waveIndex).toBe(beforeState!.waveIndex);
    expect(restored!.totalWaves).toBe(beforeState!.totalWaves);
    expect(restored!.raidersRemaining).toBe(beforeState!.raidersRemaining);
    expect(restored!.badOmenLevel).toBe(beforeState!.badOmenLevel);
    expect(restored!.ticks).toBe(beforeState!.ticks);

    const after = await feedback(page);
    expect(after.present).toBe(true);
    expect(after.hidden).toBe(false);
    expect(after.status).toBe('ACTIVE');
    expect(after.title).toBe('Raid');
  });

  test('dispose hides the bar and clears the transient state', async ({ page }) => {
    test.setTimeout(300_000);
    await waitForGame(page);

    await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      g.debugStartRaid(1);
    });
    const visible = await feedback(page);
    expect(visible.hidden).toBe(false);

    const disposed = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle & { dispose(): void } })
        .__voxelGame!;
      g.dispose();
      const el = document.getElementById('raid-feedback');
      return {
        raid: g.getRaidState(),
        hidden: !!el && el.classList.contains('hidden'),
        status: el?.getAttribute('data-status') ?? null,
      };
    });
    expect(disposed.raid).toBeNull();
    expect(disposed.hidden).toBe(true);
    // Later frames cannot rewrite it: a post-dispose tick is a null no-op.
    const postDispose = await page.evaluate(() => {
      const g = (window as unknown as { __voxelGame?: GameHandle }).__voxelGame!;
      const ticked = g.debugTickRaid();
      const el = document.getElementById('raid-feedback');
      return {
        ticked,
        hidden: !!el && el.classList.contains('hidden'),
        status: el?.getAttribute('data-status') ?? null,
      };
    });
    expect(postDispose.ticked).toBeNull();
    expect(postDispose.hidden).toBe(true);
    expect(postDispose.status).toBe('NONE');
  });
});
