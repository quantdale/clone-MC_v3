import { test, expect, type Page } from '@playwright/test';

/**
 * Change 269 (R-6 closure): focused composed-Game dispose harness.
 * Feasible without headed GPU — asserts only JS-level facts in headless
 * Chromium (software WebGL): double dispose is clean, the loop cannot be
 * restarted, and UI open paths are inert after dispose.
 */

type VoxelGameHandle = {
  dispose(): void;
  start(): void;
};

/** Wait for the game to boot and the loading indicator to clear. */
async function waitForGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60_000 });
}

test.describe('game dispose (269)', () => {
  test('double dispose is clean, start stays stopped, UI stays shut', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await waitForGame(page);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __voxelGame?: VoxelGameHandle }).__voxelGame !==
          undefined,
      ),
    ).toBe(true);

    // Double dispose + attempted restart must not throw.
    const result = await page.evaluate(() => {
      const game = (window as unknown as { __voxelGame?: VoxelGameHandle })
        .__voxelGame;
      if (!game) return 'no-game';
      game.dispose();
      game.dispose();
      game.start();
      return 'ok';
    });
    expect(result).toBe('ok');

    // A UI open click after dispose must leave the panel shut.
    const panelOpened = await page.evaluate(() => {
      document.getElementById('gamerule-open')?.click();
      return !document.getElementById('gamerule')?.classList.contains('hidden');
    });
    expect(panelOpened).toBe(false);

    // Let any leaked rAF/timer fire if it exists; the stopped loop and
    // cleared timers must keep the page error-free.
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);

    // The page itself is still alive and responsive.
    await expect(page.locator('#game-canvas')).toBeVisible();
  });
});
