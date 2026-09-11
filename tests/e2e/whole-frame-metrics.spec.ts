import { test, expect, type Page } from '@playwright/test';

/**
 * Whole-frame telemetry live proof (258 tasks 16–17).
 *
 * Boots the real game, verifies the rAF-to-rAF authority accumulates samples
 * without phase timing, then enables the coarse phase timers and verifies
 * attributed phases (worldUpdate/renderSubmit) are recorded. Headless
 * SwiftShader values are non-canonical support evidence only: the test
 * asserts mechanism (samples exist, attribution flows), never thresholds.
 */

async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60_000 });
  await page.waitForFunction(() => (window as unknown as { __voxelGame?: unknown }).__voxelGame != null, {
    timeout: 30_000,
  });
}

test.describe('whole-frame metrics (258)', () => {
  test('rAF authority accumulates samples and phase timing attributes work', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await waitForGame(page);

    // Interval-only authority: samples accumulate with zeroed phases by default.
    await page.waitForFunction(
      () => {
        const game = (window as unknown as { __voxelGame?: { getWholeFrameStats(): { samples: number } } }).__voxelGame;
        return (game?.getWholeFrameStats().samples ?? 0) >= 5;
      },
      { timeout: 60_000 },
    );
    const before = await page.evaluate(() => {
      const game = (window as unknown as { __voxelGame?: { getWholeFrameStats(): unknown } }).__voxelGame;
      return game?.getWholeFrameStats();
    });
    expect(before).toMatchObject({ samples: expect.any(Number) });

    // Enable coarse phase timing: attributed samples must show real work in
    // worldUpdate/renderSubmit while the game keeps running error-free.
    await page.evaluate(() => {
      (window as unknown as { __voxelGame?: { setWholeFramePhaseTimingEnabled(e: boolean): void } }).__voxelGame?.setWholeFramePhaseTimingEnabled(true);
    });
    await page.waitForTimeout(5000);
    const phases = await page.evaluate(() => {
      const game = (window as unknown as {
        __voxelGame?: {
          getWholeFramePhaseStats(): Record<string, { totalMs: number }>;
          getWholeFrameStats(): { samples: number };
        };
      }).__voxelGame;
      return { stats: game?.getWholeFrameStats(), phases: game?.getWholeFramePhaseStats() };
    });
    expect(phases.stats?.samples).toBeGreaterThan(0);
    // Real frames do real world-update and render-submit work.
    expect(phases.phases?.worldUpdate?.totalMs).toBeGreaterThan(0);
    expect(phases.phases?.renderSubmit?.totalMs).toBeGreaterThan(0);

    // Disabling returns to interval-only sampling without errors.
    await page.evaluate(() => {
      (window as unknown as { __voxelGame?: { setWholeFramePhaseTimingEnabled(e: boolean): void } }).__voxelGame?.setWholeFramePhaseTimingEnabled(false);
    });
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
});
